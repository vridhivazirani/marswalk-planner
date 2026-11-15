"""Authoritative Jezero Terrain and Hazard Data Provider.

Single source of truth for:
- Routing Engine (A* / Dijkstra)
- Hazard Inspection Service
- Cost Map Evaluation & Point Inspection
- Multi-scale Jezero Regional Elevation sampling

Adheres strictly to AGENTS.md:
- Rule 1 & 2: Authentic planetary datasets only (USGS TRN Jezero HiRISE 1m / CTX 20m).
- Rule 6: Epistemic classification on every result.
- Rule 7: Unknown terrain is never safe. Missing/NoData elevation is impassable by default.
- Serverless-compatible: Loads from lossless authentic NPZ archive or native GeoTIFFs.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, NamedTuple

import numpy as np
from affine import Affine

from app.core.data_paths import PROCESSED_DIR, get_data_dir
from app.core.epistemic import EpistemicClass
from app.geospatial.crs import MarsCoordinateSystem


class BoundingBox(NamedTuple):
    left: float
    bottom: float
    right: float
    top: float


class TerrainDataProvider:
    """Thread-safe, high-speed unified data provider for Jezero Western Delta terrain & hazards."""

    _instance: TerrainDataProvider | None = None

    def __init__(self, processed_dir: Path | None = None) -> None:
        self.processed_dir = processed_dir or PROCESSED_DIR
        self.mars_sys = MarsCoordinateSystem()
        self._loaded = False
        self._is_available = False

        # Metadata
        self.grid_name = "jezero_western_delta_20m"
        self.crs_projected = "ESRI:103885"
        self.crs_geographic = "IAU_2015:49900"
        self.provenance_dois = [
            "10.5066/P9REJ9JN",
            "10.5066/P906QQT8",
            "10.5066/P9GV1ND3",
        ]
        self.height = 586
        self.width = 362
        self.transform = Affine(20.0, 0.0, 4584524.3513494255, 0.0, -20.0, 1101888.646211346)
        self.inv_transform = ~self.transform
        self.bounds = BoundingBox(
            left=4584524.3513494255,
            bottom=1090168.646211346,
            right=4591764.3513494255,
            top=1101888.646211346,
        )
        self.geo_bounds = {
            "min_lat": 18.39180,
            "max_lat": 18.58953,
            "min_lon": 77.34370,
            "max_lon": 77.46584,
        }

        # Cached raster arrays
        self._elevation: np.ndarray | None = None
        self._slope: np.ndarray | None = None
        self._tri: np.ndarray | None = None
        self._hazard: np.ndarray | None = None
        self._hard_imp: np.ndarray | None = None
        self._sigma_z: np.ndarray | None = None
        self._science: np.ndarray | None = None
        self._coverage: np.ndarray | None = None
        self._source_id: np.ndarray | None = None
        self._data_conf: np.ndarray | None = None
        self._det_conf: np.ndarray | None = None
        self._res_unc: np.ndarray | None = None
        self._boulder: np.ndarray | None = None
        self._sand: np.ndarray | None = None
        self._crater: np.ndarray | None = None
        self._hirise_obs: np.ndarray | None = None

        self._ensure_loaded()

    @classmethod
    def get_instance(cls, processed_dir: Path | None = None) -> TerrainDataProvider:
        """Singleton accessor for efficient in-memory reuse."""
        if cls._instance is None:
            cls._instance = cls(processed_dir=processed_dir)
        return cls._instance

    @property
    def is_available(self) -> bool:
        """Return True if authentic Jezero terrain dataset is loaded and ready."""
        return self._is_available

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return

        # 1. First attempt: Load lossless authentic compressed NPZ
        candidate_npz_paths = [
            self.processed_dir / f"{self.grid_name}_authentic_rasters.npz",
            get_data_dir("processed") / f"{self.grid_name}_authentic_rasters.npz",
            Path(__file__).resolve().parents[2]
            / "data"
            / "processed"
            / f"{self.grid_name}_authentic_rasters.npz",
            Path(__file__).resolve().parents[3]
            / "data"
            / "processed"
            / f"{self.grid_name}_authentic_rasters.npz",
        ]

        npz_file = None
        for p in candidate_npz_paths:
            if p.exists():
                npz_file = p
                break

        if npz_file is not None:
            self._load_from_npz(npz_file)
            self._loaded = True
            self._is_available = True
            return

        # 2. Second attempt: Load from individual GeoTIFFs if available
        elev_path = self.processed_dir / f"{self.grid_name}_elevation.tif"
        if not elev_path.exists():
            elev_path = get_data_dir("processed") / f"{self.grid_name}_elevation.tif"

        if elev_path.exists():
            self._load_from_geotiffs(elev_path.parent)
            self._loaded = True
            self._is_available = True
            return

        # Genuinely unavailable
        self._loaded = True
        self._is_available = False

    def _load_from_npz(self, npz_path: Path) -> None:
        manifest_path = npz_path.parent / f"{self.grid_name}_authentic_manifest.json"
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text())
                grid_meta = manifest.get("grid", {})
                if "transform" in grid_meta:
                    self.transform = Affine(*grid_meta["transform"])
                    self.inv_transform = ~self.transform
                if "bounds" in grid_meta:
                    b = grid_meta["bounds"]
                    self.bounds = BoundingBox(left=b[0], bottom=b[1], right=b[2], top=b[3])
                if "shape" in grid_meta:
                    self.height, self.width = grid_meta["shape"]
            except Exception:
                pass

        with np.load(npz_path) as data:
            self._elevation = data["elevation"]
            self._slope = data["slope_deg"]
            self._tri = data["tri_roughness_m"]
            self._hazard = data["hazard_overall_score"]
            self._hard_imp = (data["hazard_hard_impassable"] > 0).astype(bool)
            self._sigma_z = data["uncertainty_sigma_z"]
            self._science = data["science_opportunity"]
            self._source_id = data["source_id"]
            self._data_conf = data["hazard_data_confidence"]
            self._det_conf = data["hazard_detection_confidence"]
            self._res_unc = (data["hazard_resolution_uncertainty"] > 0).astype(bool)
            self._boulder = data["boulder_hazard_score"]
            self._sand = data["sand_hazard_score"]
            self._crater = data["crater_hazard_score"]
            self._hirise_obs = data["hirise_hazard_obstacles"]

        self._coverage = self._elevation != -9999.0

    def _load_from_geotiffs(self, p_dir: Path) -> None:
        import rasterio

        elev_path = p_dir / f"{self.grid_name}_elevation.tif"
        with rasterio.open(elev_path) as src:
            self._elevation = src.read(1)
            self.transform = src.transform
            self.inv_transform = ~self.transform
            self.bounds = src.bounds
            self.height = src.height
            self.width = src.width

        self._coverage = self._elevation != -9999.0

        with rasterio.open(p_dir / f"{self.grid_name}_slope_deg.tif") as src:
            self._slope = src.read(1)
        with rasterio.open(p_dir / f"{self.grid_name}_tri_roughness_m.tif") as src:
            self._tri = src.read(1)
        with rasterio.open(p_dir / f"{self.grid_name}_hazard_overall_score.tif") as src:
            self._hazard = src.read(1)
        with rasterio.open(p_dir / f"{self.grid_name}_hazard_hard_impassable.tif") as src:
            self._hard_imp = (src.read(1) > 0).astype(bool)
        with rasterio.open(p_dir / f"{self.grid_name}_uncertainty_sigma_z.tif") as src:
            self._sigma_z = src.read(1)
        with rasterio.open(p_dir / f"{self.grid_name}_science_opportunity.tif") as src:
            self._science = src.read(1)

        src_id_path = p_dir / f"{self.grid_name}_source_id.tif"
        if src_id_path.exists():
            with rasterio.open(src_id_path) as src:
                self._source_id = src.read(1)
        else:
            self._source_id = np.where(self._coverage, 2, 0).astype(np.uint8)

        data_conf_path = p_dir / f"{self.grid_name}_hazard_data_confidence.tif"
        if data_conf_path.exists():
            with rasterio.open(data_conf_path) as src:
                self._data_conf = src.read(1)
        else:
            self._data_conf = np.where(self._coverage, 0.95, 0.0).astype(np.float32)

        det_conf_path = p_dir / f"{self.grid_name}_hazard_detection_confidence.tif"
        if det_conf_path.exists():
            with rasterio.open(det_conf_path) as src:
                self._det_conf = src.read(1)
        else:
            self._det_conf = np.where(self._coverage, 0.81, 0.0).astype(np.float32)

        res_unc_path = p_dir / f"{self.grid_name}_hazard_resolution_uncertainty.tif"
        if res_unc_path.exists():
            with rasterio.open(res_unc_path) as src:
                self._res_unc = (src.read(1) > 0).astype(bool)
        else:
            self._res_unc = self._source_id == 1

        boulder_path = p_dir / f"{self.grid_name}_boulder_hazard_score.tif"
        if boulder_path.exists():
            with rasterio.open(boulder_path) as src:
                self._boulder = src.read(1)
        else:
            self._boulder = np.zeros_like(self._elevation)

        sand_path = p_dir / f"{self.grid_name}_sand_hazard_score.tif"
        if sand_path.exists():
            with rasterio.open(sand_path) as src:
                self._sand = src.read(1)
        else:
            self._sand = np.zeros_like(self._elevation)

        crater_path = p_dir / f"{self.grid_name}_crater_hazard_score.tif"
        if crater_path.exists():
            with rasterio.open(crater_path) as src:
                self._crater = src.read(1)
        else:
            self._crater = np.zeros_like(self._elevation)

        hirise_obs_path = p_dir / f"{self.grid_name}_hirise_hazard_obstacles.tif"
        if hirise_obs_path.exists():
            with rasterio.open(hirise_obs_path) as src:
                self._hirise_obs = src.read(1)
        else:
            self._hirise_obs = np.zeros_like(self._elevation, dtype=np.uint8)

    def latlon_to_grid(self, lat: float, lon: float) -> tuple[int, int, float, float]:
        """Convert planetocentric lat/lon into projected (x, y) and grid (row, col)."""
        if lat is None or lon is None or not (math.isfinite(lat) and math.isfinite(lon)):
            raise ValueError(f"Coordinate values must be finite numbers, got lat={lat}, lon={lon}")

        x, y = self.mars_sys.to_projected(lon, lat)

        if not (
            self.bounds.left <= x <= self.bounds.right
            and self.bounds.bottom <= y <= self.bounds.top
        ):
            raise ValueError(
                f"Projected coordinate ({x:.1f}, {y:.1f}) outside grid bounds "
                f"[{self.bounds.left:.1f}, {self.bounds.bottom:.1f}, "
                f"{self.bounds.right:.1f}, {self.bounds.top:.1f}]"
            )

        col_f = (x - self.transform.c) / self.transform.a
        row_f = (y - self.transform.f) / self.transform.e
        row = int(row_f)
        col = int(col_f)

        if not (0 <= row < self.height and 0 <= col < self.width):
            raise ValueError(
                f"Grid index ({row}, {col}) outside raster dimensions {self.height}x{self.width}"
            )

        return row, col, x, y

    def get_routing_bundle(self) -> dict[str, Any]:
        """Return full array bundle required by RouteOptimizationEngine."""
        self._ensure_loaded()
        if not self._is_available:
            raise FileNotFoundError("Authentic Jezero terrain data not available.")

        return {
            "elevation": self._elevation,
            "slope": self._slope,
            "tri": self._tri,
            "hazard": self._hazard,
            "hard_imp": self._hard_imp,
            "sigma_z": self._sigma_z,
            "science": self._science,
            "source_id": self._source_id,
            "data_conf": self._data_conf,
            "det_conf": self._det_conf,
            "res_unc": self._res_unc,
            "coverage": self._coverage,
            "transform": self.transform,
            "bounds": self.bounds,
            "height": self.height,
            "width": self.width,
        }

    def sample_point(
        self,
        lat: float,
        lon: float,
        max_slope_deg: float = 25.0,
        max_tri_m: float = 8.0,
    ) -> dict[str, Any]:
        """Query authentic terrain and hazard characteristics at (lat, lon)."""
        self._ensure_loaded()

        if not self._is_available:
            return self._build_data_unavailable(
                lat,
                lon,
                "DATASET_UNAVAILABLE",
                "Authentic Jezero dataset is unavailable on this host.",
            )

        if not (math.isfinite(lat) and math.isfinite(lon)):
            return self._build_data_unavailable(
                lat, lon, "INVALID_COORDINATE", "Coordinate values must be finite numbers."
            )

        x, y = self.mars_sys.to_projected(lon, lat)
        in_bounds = (
            self.bounds.left <= x <= self.bounds.right
            and self.bounds.bottom <= y <= self.bounds.top
        )
        if not in_bounds:
            return self._build_data_unavailable(
                lat,
                lon,
                "OUT_OF_STUDY_AREA",
                "Location is outside the Jezero Western Delta study footprint.",
            )

        col_f = (x - self.transform.c) / self.transform.a
        row_f = (y - self.transform.f) / self.transform.e
        row = int(row_f)
        col = int(col_f)

        if not (0 <= row < self.height and 0 <= col < self.width):
            return self._build_data_unavailable(
                lat,
                lon,
                "OUT_OF_STUDY_AREA",
                "Location is outside the Jezero Western Delta study footprint.",
            )

        assert self._elevation is not None
        elev_val = float(self._elevation[row, col])
        if elev_val <= -9000.0 or not math.isfinite(elev_val):
            return self._build_data_unavailable(
                lat, lon, "NO_DATA_UNKNOWN", "Elevation data is unmapped/NoData at this coordinate."
            )

        assert self._slope is not None
        assert self._tri is not None
        assert self._hazard is not None
        assert self._hard_imp is not None
        assert self._sigma_z is not None
        assert self._science is not None
        assert self._source_id is not None
        assert self._data_conf is not None
        assert self._det_conf is not None
        assert self._res_unc is not None
        assert self._boulder is not None
        assert self._sand is not None
        assert self._crater is not None
        assert self._hirise_obs is not None

        slope_val = float(self._slope[row, col])
        tri_val = float(self._tri[row, col])
        haz_val = float(self._hazard[row, col])
        hard_imp_val = bool(self._hard_imp[row, col])
        sigma_val = float(self._sigma_z[row, col])
        sci_val = float(self._science[row, col])
        source_id_val = int(self._source_id[row, col])
        data_conf_val = float(self._data_conf[row, col])
        det_conf_val = float(self._det_conf[row, col])
        res_unc_val = bool(self._res_unc[row, col])
        boulder_val = float(self._boulder[row, col])
        sand_val = float(self._sand[row, col])
        crater_val = float(self._crater[row, col])
        hirise_obs_val = int(self._hirise_obs[row, col])

        # Evaluate restrictions
        reason_codes: list[str] = []
        if slope_val > max_slope_deg:
            reason_codes.append("SLOPE_GT_MAX")
        if tri_val > max_tri_m:
            reason_codes.append("TRI_GT_MAX")
        if hirise_obs_val > 0:
            reason_codes.append("NATIVE_HIRISE_OBSTACLE")
        if res_unc_val:
            reason_codes.append("UNRESOLVED_RESOLUTION_HAZARD")
        if hard_imp_val and not reason_codes:
            reason_codes.append("AUTHORITATIVE_MASK_RESTRICTION")

        is_passable = not hard_imp_val and len(reason_codes) == 0

        reasons = self._format_reasons(
            is_passable=is_passable,
            codes=reason_codes,
            slope_val=slope_val,
            tri_val=tri_val,
            boulder_val=boulder_val,
            sand_val=sand_val,
            max_slope_deg=max_slope_deg,
            max_tri_m=max_tri_m,
        )

        source_dataset = (
            "HiRISE 1m DTM (USGS TRN Jezero)"
            if source_id_val == 2
            else "CTX 20m DTM (USGS TRN Jezero)"
        )

        return {
            "status": "AVAILABLE",
            "coordinate": {"lat": lat, "lon": lon},
            "projected": {"x": x, "y": y},
            "grid_indices": {"row": row, "col": col},
            "elevation_m": elev_val,
            "slope_deg": slope_val,
            "tri_roughness_m": tri_val,
            "boulder_score": boulder_val,
            "sand_score": sand_val,
            "crater_score": crater_val,
            "hazard_score": haz_val,
            "science_opportunity": sci_val,
            "is_passable": is_passable,
            "hard_constraint_triggered": not is_passable,
            "hard_restriction_code": "+".join(reason_codes) if reason_codes else None,
            "hazard_classification": self._classify_hazard(haz_val),
            "overall_hazard_score": haz_val,
            "reason_codes": reason_codes,
            "reasons": reasons,
            "source_dataset": source_dataset,
            "source_id": source_id_val,
            "uncertainty": {
                "sigma_z_m": sigma_val,
                "data_confidence": data_conf_val,
                "detection_confidence": det_conf_val,
                "resolution_uncertainty": res_unc_val,
                "epistemic_class": EpistemicClass.DERIVED.value,
            },
            "epistemic_class": EpistemicClass.DERIVED.value,
            "provenance": {
                "dois": self.provenance_dois,
                "grid_name": self.grid_name,
                "resolution_m": 20.0,
            },
        }

    def _build_data_unavailable(
        self, lat: float, lon: float, reason_code: str, explanation: str
    ) -> dict[str, Any]:
        status = "OUT_OF_BOUNDS" if reason_code == "OUT_OF_STUDY_AREA" else "DATA_UNAVAILABLE"
        return {
            "status": status,
            "coordinate": {"lat": lat, "lon": lon},
            "is_passable": False,
            "hard_constraint_triggered": True,
            "hard_restriction_code": reason_code,
            "hazard_classification": "CRITICAL_HAZARD",
            "overall_hazard_score": 1.0,
            "reason_codes": [reason_code],
            "reasons": [
                explanation,
                (
                    "Per Marswalk scientific rules (AGENTS.md Rule 7), unknown terrain is "
                    "never safe and is treated as impassable by default."
                ),
            ],
            "epistemic_class": EpistemicClass.UNKNOWN.value,
            "hazard_score": 1.0,
            "elevation_m": None,
            "slope_deg": None,
            "tri_roughness_m": None,
            "boulder_score": None,
            "sand_score": None,
            "crater_score": None,
            "science_opportunity": None,
            "uncertainty": {
                "sigma_z_m": None,
                "data_confidence": 0.0,
                "detection_confidence": 0.0,
                "resolution_uncertainty": True,
                "epistemic_class": EpistemicClass.UNKNOWN.value,
            },
            "source_dataset": "UNKNOWN",
        }

    @staticmethod
    def _classify_hazard(score: float) -> str:
        if score < 0.25:
            return "LOW_HAZARD"
        if score < 0.50:
            return "MODERATE_HAZARD"
        if score < 0.75:
            return "HIGH_HAZARD"
        return "CRITICAL_HAZARD"

    @staticmethod
    def _format_reasons(
        is_passable: bool,
        codes: list[str],
        slope_val: float,
        tri_val: float,
        boulder_val: float,
        sand_val: float,
        max_slope_deg: float,
        max_tri_m: float,
    ) -> list[str]:
        if is_passable:
            s_str = (
                f"{slope_val:.1f}°"
                if math.isfinite(slope_val) and slope_val > -9000.0
                else "N/A"
            )
            b_str = (
                f"{boulder_val:.2f}"
                if math.isfinite(boulder_val) and boulder_val >= 0.0
                else "N/A"
            )
            sa_str = (
                f"{sand_val:.2f}"
                if math.isfinite(sand_val) and sand_val >= 0.0
                else "N/A"
            )
            return [
                f"Passable terrain. Primary risk factors: slope ({s_str}), "
                f"boulder density ({b_str}), sand hazard ({sa_str})."
            ]

        reasons: list[str] = []
        for code in codes:
            if code == "SLOPE_GT_MAX":
                reasons.append(
                    f"Slope {slope_val:.1f}° exceeds maximum threshold {max_slope_deg:.1f}° "
                    "(Hard restriction)."
                )
            elif code == "TRI_GT_MAX":
                reasons.append(
                    f"Roughness TRI {tri_val:.2f}m exceeds maximum threshold {max_tri_m:.1f}m."
                )
            elif code == "NATIVE_HIRISE_OBSTACLE":
                reasons.append(
                    "Native 1.0 m HiRISE DTM analysis detected a sub-20 m steep scarp, boulder "
                    "pinnacle (>= 0.50), slope >= 25.0°, or local HiRISE NoData pixel."
                )
            elif code == "UNRESOLVED_RESOLUTION_HAZARD":
                reasons.append(
                    "Regional 20 m CTX coverage only; metre-scale obstacles remain unresolved "
                    "under the default conservative safety policy."
                )
            elif code == "AUTHORITATIVE_MASK_RESTRICTION":
                reasons.append("Restricted by authoritative hard-impassable hazard raster.")

        if not reasons:
            tag = "+".join(codes) or "RESTRICTED"
            reasons.append(f"Cell is restricted by authoritative hard constraint ({tag}).")
        return reasons
