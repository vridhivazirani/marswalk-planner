"""Authoritative coordinate-level Hazard Inspection service.

Routes point hazard queries through the exact same fusion rules, native-1 m HiRISE
obstacle mask, uncertainty model, and fail-closed NoData semantics used to generate
`hazard_hard_impassable.tif`, keeping the FastAPI router thin per AGENTS.md §4.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np

try:
    import rasterio
    from rasterio.windows import Window
except (ImportError, Exception):
    rasterio = None  # type: ignore[assignment]
    Window = None  # type: ignore[assignment]

from app.core.data_paths import PROCESSED_DIR
from app.geospatial.crs import MarsCoordinateSystem
from app.hazards.config import HazardProfile
from app.hazards.evaluator import compute_hazard_bundle
from app.hazards.uncertainty import STANDARD_NODATA_FLOAT, build_cell_uncertainty_profile

DEFAULT_PROCESSED_DIR = PROCESSED_DIR


class HazardRastersNotFoundError(FileNotFoundError):
    """Raised when base processed rasters have not been generated."""


class AuthoritativeHazardInputMissingError(FileNotFoundError):
    """Raised when required authoritative hazard layers (e.g., HiRISE 1 m mask) are missing."""


def _read_pixel(path: Path, row: int, col: int) -> float:
    """Read a single pixel using a 1x1 GeoTIFF window."""
    with rasterio.open(path) as src:
        return float(src.read(1, window=Window(col, row, 1, 1))[0, 0])


def _format_reasons(
    impassable: bool,
    codes: list[str],
    slope_val: float,
    tri_val: float,
    boulder_val: float,
    sand_val: float,
    profile: HazardProfile,
) -> list[str]:
    """Generate human-readable restriction or traversability explanations."""
    if not impassable:
        s_str = f"{slope_val:.1f}°" if math.isfinite(slope_val) and slope_val > -9000.0 else "N/A"
        b_str = f"{boulder_val:.2f}" if math.isfinite(boulder_val) and boulder_val >= 0.0 else "N/A"
        sa_str = f"{sand_val:.2f}" if math.isfinite(sand_val) and sand_val >= 0.0 else "N/A"
        return [
            f"Passable terrain. Primary risk factors: slope ({s_str}), "
            f"boulder density ({b_str}), sand hazard ({sa_str})."
        ]

    reasons: list[str] = []
    for item in codes:
        if item == "NO_DATA_UNKNOWN":
            reasons.append(
                "Terrain or elevation data is unmapped/missing "
                "(Unknown terrain is never safe by default)."
            )
        elif item == "CTX_SLOPE_GT_MAX":
            reasons.append(
                f"Regional 20 m CTX slope {slope_val:.1f}° exceeds configured threshold "
                f"{profile.max_slope_deg:.1f}° (Hard restriction)."
            )
        elif item == "SLOPE_GT_MAX":
            reasons.append(
                f"Slope {slope_val:.1f}° exceeds maximum threshold "
                f"{profile.max_slope_deg:.1f}° (Hard restriction)."
            )
        elif item == "CTX_TRI_GT_MAX":
            reasons.append(
                f"Regional 20 m CTX roughness TRI {tri_val:.2f}m exceeds configured threshold "
                f"{profile.max_tri_m:.1f}m."
            )
        elif item == "TRI_GT_MAX":
            reasons.append(
                f"Roughness TRI {tri_val:.2f}m exceeds maximum threshold {profile.max_tri_m:.1f}m."
            )
        elif item == "NATIVE_HIRISE_OBSTACLE":
            reasons.append(
                "Native 1.0 m HiRISE DTM analysis detected a sub-20 m steep scarp, boulder "
                "pinnacle (>= 0.50), slope >= 25.0°, or local HiRISE NoData pixel inside this cell "
                "(Hard restriction)."
            )
        elif item == "UNRESOLVED_RESOLUTION_HAZARD":
            reasons.append(
                "Regional 20 m CTX coverage only; metre-scale obstacles remain unresolved under "
                "the default conservative safety policy (Hard restriction)."
            )
        elif item == "AUTHORITATIVE_MASK_RESTRICTION":
            reasons.append(
                "Restricted by authoritative hard-impassable hazard raster."
            )

    if not reasons:
        reasons.append(
            "Cell is restricted by authoritative hard constraint "
            f"({'+'.join(codes) or 'RESTRICTED'})."
        )
    return reasons


class HazardInspectionService:
    """Service that explains point-level hazard scores using authoritative rasters & fusion."""

    def __init__(
        self,
        processed_dir: Path | None = None,
        grid_name: str = "jezero_western_delta_20m",
        profile: HazardProfile | None = None,
    ) -> None:
        self.processed_dir = processed_dir or DEFAULT_PROCESSED_DIR
        self.grid_name = grid_name
        self.profile = profile or HazardProfile()
        self.mars_sys = MarsCoordinateSystem()

    def inspect_coordinate(self, lat: float, lon: float) -> dict[str, Any]:
        """Inspect and explain hazard score, reliability, and hard constraints at (lat, lon)."""
        from app.terrain.provider import TerrainDataProvider

        elev_path = self.processed_dir / f"{self.grid_name}_elevation.tif"
        required_inputs = {
            "slope": self.processed_dir / f"{self.grid_name}_slope_deg.tif",
            "tri": self.processed_dir / f"{self.grid_name}_tri_roughness_m.tif",
            "boulder": self.processed_dir / f"{self.grid_name}_boulder_hazard_score.tif",
            "sand": self.processed_dir / f"{self.grid_name}_sand_hazard_score.tif",
            "crater": self.processed_dir / f"{self.grid_name}_crater_hazard_score.tif",
            "source_id": self.processed_dir / f"{self.grid_name}_source_id.tif",
            "hirise_obstacles": (
                self.processed_dir / f"{self.grid_name}_hirise_hazard_obstacles.tif"
            ),
            "hard_impassable": (
                self.processed_dir / f"{self.grid_name}_hazard_hard_impassable.tif"
            ),
        }

        if elev_path.exists():
            for name, path in required_inputs.items():
                if not path.exists():
                    raise AuthoritativeHazardInputMissingError(
                        f"Required authoritative hazard input '{name}' is missing: {path.name}"
                    )

        x, y = self.mars_sys.to_projected(lon, lat)
        provider = TerrainDataProvider.get_instance(processed_dir=self.processed_dir)

        use_provider = (
            not elev_path.exists()
            and self.grid_name == "jezero_western_delta_20m"
            and provider.is_available
        )
        if use_provider:
            in_bounds = (
                provider.bounds.left <= x <= provider.bounds.right
                and provider.bounds.bottom <= y <= provider.bounds.top
            )
            if not in_bounds:
                return {
                    "coordinate": {"lat": lat, "lon": lon},
                    "status": "OUT_OF_BOUNDS",
                    "is_passable": False,
                    "reason_code": "OUT_OF_STUDY_AREA",
                    "explanation": "Location is outside the Jezero Western Delta study footprint.",
                    "epistemic_class": "UNKNOWN",
                }

            col_f = (x - provider.transform.c) / provider.transform.a
            row_f = (y - provider.transform.f) / provider.transform.e
            py_row, px_col = int(row_f), int(col_f)
            if not (0 <= py_row < provider.height and 0 <= px_col < provider.width):
                return {
                    "coordinate": {"lat": lat, "lon": lon},
                    "status": "OUT_OF_BOUNDS",
                    "is_passable": False,
                    "reason_code": "OUT_OF_STUDY_AREA",
                    "explanation": "Location is outside the Jezero Western Delta study footprint.",
                    "epistemic_class": "UNKNOWN",
                }

            assert provider._elevation is not None
            assert provider._slope is not None
            assert provider._tri is not None
            assert provider._boulder is not None
            assert provider._sand is not None
            assert provider._crater is not None
            assert provider._source_id is not None
            assert provider._hirise_obs is not None
            assert provider._hard_imp is not None
            assert provider._sigma_z is not None

            elev_val = float(provider._elevation[py_row, px_col])
            slope_val = float(provider._slope[py_row, px_col])
            tri_val = float(provider._tri[py_row, px_col])
            boulder_val = float(provider._boulder[py_row, px_col])
            sand_val = float(provider._sand[py_row, px_col])
            crater_val = float(provider._crater[py_row, px_col])
            source_id = int(provider._source_id[py_row, px_col])
            hirise_obs_val = int(provider._hirise_obs[py_row, px_col])
            auth_imp_raw = int(provider._hard_imp[py_row, px_col])
            sigma_val = float(provider._sigma_z[py_row, px_col])
        else:
            if not elev_path.exists():
                raise HazardRastersNotFoundError("Processed rasters not found")

            with rasterio.open(elev_path) as e_src:
                in_bounds = (
                    e_src.bounds.left <= x <= e_src.bounds.right
                    and e_src.bounds.bottom <= y <= e_src.bounds.top
                )
                if not in_bounds:
                    return {
                        "coordinate": {"lat": lat, "lon": lon},
                        "status": "OUT_OF_BOUNDS",
                        "is_passable": False,
                        "reason_code": "OUT_OF_STUDY_AREA",
                        "explanation": (
                            "Location is outside the Jezero Western Delta study footprint."
                        ),
                    }

                py_row, px_col = e_src.index(x, y)
                if py_row < 0 or py_row >= e_src.height or px_col < 0 or px_col >= e_src.width:
                    return {
                        "coordinate": {"lat": lat, "lon": lon},
                        "status": "OUT_OF_BOUNDS",
                        "is_passable": False,
                        "reason_code": "OUT_OF_STUDY_AREA",
                        "explanation": (
                            "Location is outside the Jezero Western Delta study footprint."
                        ),
                    }
                elev_val = float(e_src.read(1, window=Window(px_col, py_row, 1, 1))[0, 0])

            slope_val = _read_pixel(required_inputs["slope"], py_row, px_col)
            tri_val = _read_pixel(required_inputs["tri"], py_row, px_col)
            boulder_val = _read_pixel(required_inputs["boulder"], py_row, px_col)
            sand_val = _read_pixel(required_inputs["sand"], py_row, px_col)
            crater_val = _read_pixel(required_inputs["crater"], py_row, px_col)
            source_id = int(_read_pixel(required_inputs["source_id"], py_row, px_col))
            hirise_obs_val = int(_read_pixel(required_inputs["hirise_obstacles"], py_row, px_col))
            auth_imp_raw = int(_read_pixel(required_inputs["hard_impassable"], py_row, px_col))

            sigma_path = self.processed_dir / f"{self.grid_name}_uncertainty_sigma_z.tif"
            sigma_val = (
                0.2
                if source_id == 2
                else (2.0 if source_id == 1 else STANDARD_NODATA_FLOAT)
            )
            if sigma_path.exists():
                raw_sig = _read_pixel(sigma_path, py_row, px_col)
                sigma_val = (
                    raw_sig
                    if (
                        math.isfinite(raw_sig)
                        and raw_sig > -9000.0
                        and abs(raw_sig - 999.0) > 1e-3
                    )
                    else STANDARD_NODATA_FLOAT
                )

        is_valid = (
            math.isfinite(elev_val)
            and elev_val > -9000.0
            and math.isfinite(slope_val)
            and slope_val > -9000.0
            and math.isfinite(tri_val)
            and tri_val > -9000.0
            and source_id in (1, 2)
        )

        bundle = compute_hazard_bundle(
            slope=np.array([[slope_val]], dtype=np.float32),
            tri=np.array([[tri_val]], dtype=np.float32),
            boulder_score=np.array([[boulder_val]], dtype=np.float32),
            sand_score=np.array([[sand_val]], dtype=np.float32),
            crater_score=np.array([[crater_val]], dtype=np.float32),
            valid_mask=np.array([[is_valid]], dtype=bool),
            source_id=np.array([[source_id]], dtype=np.uint8),
            profile=self.profile,
            hirise_obstacle_mask=np.array([[hirise_obs_val]], dtype=np.uint8),
            sigma_z=np.array([[sigma_val]], dtype=np.float32),
        )

        fused_impassable = bool(bundle.hard_impassable_mask[0, 0])
        auth_impassable = auth_imp_raw != 0
        impassable = fused_impassable or auth_impassable
        code = str(bundle.restriction_codes[0, 0])
        if auth_impassable and not fused_impassable:
            fallback = (
                "NO_DATA_UNKNOWN" if auth_imp_raw == 255 else "AUTHORITATIVE_MASK_RESTRICTION"
            )
            code = f"{code}+{fallback}" if code else fallback

        overall = 1.0 if impassable and not fused_impassable else float(bundle.overall_hazard[0, 0])
        codes = [c for c in code.split("+") if c] if code else []

        reasons = _format_reasons(
            impassable=impassable,
            codes=codes,
            slope_val=slope_val,
            tri_val=tri_val,
            boulder_val=boulder_val,
            sand_val=sand_val,
            profile=self.profile,
        )

        epistemic_src = (
            "HiRISE (1m)" if source_id == 2 else ("CTX (20m)" if source_id == 1 else "Unknown")
        )

        unc_profile = build_cell_uncertainty_profile(
            lat=lat,
            lon=lon,
            source_id=source_id,
            is_valid=is_valid,
            slope_deg=slope_val,
            tri_m=tri_val,
            boulder_score=boulder_val,
            sand_score=sand_val,
            crater_score=crater_val,
            sigma_z_m=sigma_val,
            is_impassable=impassable,
            restriction_code=code,
        )

        return {
            "coordinate": {"lat": lat, "lon": lon},
            "elevation_m": elev_val if is_valid else None,
            "is_passable": not impassable,
            "hard_restriction_code": code if code else None,
            "hard_restriction_codes": codes,
            "hazard_classification": unc_profile.hazard_classification,
            "overall_hazard_score": overall,
            "individual_hazards": {
                "slope_hazard": float(bundle.h_slope[0, 0]),
                "roughness_hazard": float(bundle.h_roughness[0, 0]),
                "boulder_hazard": float(bundle.h_boulder[0, 0]),
                "sand_hazard": float(bundle.h_sand[0, 0]),
                "crater_hazard": float(bundle.h_crater[0, 0]),
                "unknown_hazard": float(bundle.h_unknown[0, 0]),
            },
            "epistemic_source": epistemic_src,
            "confidence": unc_profile.data_reliability_index,
            "legacy_confidence_deprecated": True,
            "data_reliability_index": unc_profile.data_reliability_index,
            "data_reliability_level": unc_profile.data_reliability_level,
            "detection_reliability_index": unc_profile.detection_reliability_index,
            "detection_reliability_level": unc_profile.detection_reliability_level,
            "nominal_vertical_precision_m": unc_profile.nominal_vertical_precision_m,
            "uncertainty_precision_status": unc_profile.uncertainty_precision_status,
            "evidence_dimensions": unc_profile.evidence_dimensions,
            "property_epistemic_classes": unc_profile.property_epistemic_classes,
            "data_confidence": unc_profile.data_reliability_index,
            "data_confidence_level": unc_profile.data_reliability_level,
            "detection_confidence": unc_profile.detection_reliability_index,
            "detection_confidence_level": unc_profile.detection_reliability_level,
            "spatial_uncertainty_m": unc_profile.nominal_vertical_precision_m,
            "resolution_class": unc_profile.resolution_class,
            "epistemic_class": unc_profile.epistemic_class,
            "uncertainty_profile": unc_profile.to_dict(),
            "explanation": " ".join(reasons),
        }
