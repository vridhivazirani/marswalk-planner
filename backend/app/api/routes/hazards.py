"""FastAPI router for Hazard Intelligence layers, hard constraints, and location explanation."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.geospatial.crs import MarsCoordinateSystem
from app.hazards.config import HazardProfile
from app.hazards.evaluator import compute_hazard_bundle

router = APIRouter(prefix="/hazards", tags=["hazard-intelligence"])

PROCESSED_DIR = Path(__file__).resolve().parents[4] / "data" / "processed"


class HazardProfileDTO(BaseModel):
    max_slope_deg: float = 25.0
    max_tri_m: float = 8.0
    forbid_unknown: bool = True
    slope_safe_deg: float = 8.0
    slope_critical_deg: float = 25.0
    tri_safe_m: float = 0.5
    tri_critical_m: float = 6.0
    w_slope: float = 0.35
    w_roughness: float = 0.20
    w_boulder: float = 0.15
    w_sand: float = 0.15
    w_crater: float = 0.10
    w_uncertainty: float = 0.05


@router.get("/profile", summary="Get default prototype hazard configuration")
def get_hazard_profile() -> dict[str, Any]:
    """Return default hazard weights and hard constraint thresholds."""
    return HazardProfile().to_dict()


CACHE_HEADERS = {"Cache-Control": "public, max-age=86400, stale-while-revalidate=3600"}


@router.get("/raster/overall.png", summary="Serve overall hazard heatmap PNG")
def get_overall_hazard_png() -> FileResponse:
    target = PROCESSED_DIR / "jezero_western_delta_20m_qc_overall_hazard.png"
    if not target.exists():
        raise HTTPException(status_code=404, detail="Hazard heatmap not generated")
    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)


@router.get("/inspect", summary="Explain hazard score and constraints for a coordinate")
def inspect_location_hazard(
    lat: float = Query(..., description="Planetocentric latitude in degrees"),
    lon: float = Query(..., description="East-positive longitude in degrees"),
) -> dict[str, Any]:
    """Query and explain why a location received its hazard score and passability status."""
    elev_path = PROCESSED_DIR / "jezero_western_delta_20m_elevation.tif"
    slope_path = PROCESSED_DIR / "jezero_western_delta_20m_slope_deg.tif"
    tri_path = PROCESSED_DIR / "jezero_western_delta_20m_tri_roughness_m.tif"
    boulder_path = PROCESSED_DIR / "jezero_western_delta_20m_boulder_hazard_score.tif"
    sand_path = PROCESSED_DIR / "jezero_western_delta_20m_sand_hazard_score.tif"
    crater_path = PROCESSED_DIR / "jezero_western_delta_20m_crater_hazard_score.tif"
    src_path = PROCESSED_DIR / "jezero_western_delta_20m_source_id.tif"

    if not elev_path.exists():
        raise HTTPException(status_code=404, detail="Processed rasters not found")

    mars_sys = MarsCoordinateSystem()
    x, y = mars_sys.to_projected(lon, lat)

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
                "explanation": "Location is outside the Jezero Western Delta study footprint.",
            }

        py_row, px_col = e_src.index(x, y)
        elev_val = float(e_src.read(1)[py_row, px_col])

    with rasterio.open(slope_path) as s_src:
        slope_val = float(s_src.read(1)[py_row, px_col])
    with rasterio.open(tri_path) as t_src:
        tri_val = float(t_src.read(1)[py_row, px_col])
    with rasterio.open(boulder_path) as b_src:
        boulder_val = float(b_src.read(1)[py_row, px_col])
    with rasterio.open(sand_path) as sa_src:
        sand_val = float(sa_src.read(1)[py_row, px_col])
    with rasterio.open(crater_path) as c_src:
        crater_val = float(c_src.read(1)[py_row, px_col])
    with rasterio.open(src_path) as sid_src:
        source_id = int(sid_src.read(1)[py_row, px_col])

    # Run single-cell evaluation
    bundle = compute_hazard_bundle(
        slope=np.array([[slope_val]]),
        tri=np.array([[tri_val]]),
        boulder_score=np.array([[boulder_val]]),
        sand_score=np.array([[sand_val]]),
        crater_score=np.array([[crater_val]]),
        valid_mask=np.array([[elev_val != -9999.0]]),
        source_id=np.array([[source_id]]),
    )

    impassable = bool(bundle.hard_impassable_mask[0, 0])
    code = str(bundle.restriction_codes[0, 0])
    overall = float(bundle.overall_hazard[0, 0])

    reasons: list[str] = []
    if impassable:
        if "SLOPE_GT_MAX" in code:
            reasons.append(
                f"Slope {slope_val:.1f}° exceeds maximum threshold 25.0° (Hard restriction)."
            )
        if "TRI_GT_MAX" in code:
            reasons.append(f"Roughness TRI {tri_val:.2f}m exceeds maximum threshold 8.0m.")
        if "NO_DATA_UNKNOWN" in code:
            reasons.append("Elevation data is unmapped/missing (Unknown is never safe by default).")
    else:
        reasons.append(
            f"Passable terrain. Primary risk factors: slope ({slope_val:.1f}°), "
            f"boulder density ({boulder_val:.2f}), sand hazard ({sand_val:.2f})."
        )

    epistemic_src = (
        "HiRISE (1m)" if source_id == 2 else ("CTX (20m)" if source_id == 1 else "Unknown")
    )

    return {
        "coordinate": {"lat": lat, "lon": lon},
        "elevation_m": elev_val if elev_val != -9999.0 else None,
        "is_passable": not impassable,
        "hard_restriction_code": code if code else None,
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
        "confidence": float(bundle.confidence[0, 0]),
        "explanation": " ".join(reasons),
    }
