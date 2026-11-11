"""FastAPI routes for the Marswalk Scientific Opportunity Engine.

Serves candidate targets, composite opportunity raster heatmaps, configurable profiles,
and coordinate inspection endpoints with full epistemic provenance.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import rasterio
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.geospatial.crs import MarsCoordinateSystem
from app.science.config import ScienceProfile
from app.science.objectives import get_all_objectives, get_objective_by_id

router = APIRouter(prefix="/science", tags=["scientific-opportunity"])

PROCESSED_DIR = Path(__file__).resolve().parents[4] / "data" / "processed"
CATALOG_DIR = Path(__file__).resolve().parents[4] / "data" / "catalog"


@router.get("/profile", summary="Get current scientific opportunity configuration profile")
def get_science_profile() -> dict[str, Any]:
    """Return default opportunity weights, thresholds, and epistemic notice texts."""
    return ScienceProfile().to_dict()


CACHE_HEADERS = {"Cache-Control": "public, max-age=86400, stale-while-revalidate=3600"}


@router.get("/raster/opportunity.png", summary="Serve composite science opportunity heatmap PNG")
def get_opportunity_raster_png() -> FileResponse:
    """Serve visual RGBA heatmap of multi-criteria scientific opportunity."""
    target = PROCESSED_DIR / "jezero_western_delta_20m_qc_science_opportunity.png"
    if not target.exists():
        raise HTTPException(status_code=404, detail="Science opportunity heatmap not found")
    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)


@router.get("/objectives", summary="Get 7 structured scientific exploration objectives")
def list_scientific_objectives() -> dict[str, Any]:
    """Return the 7 core Mars surface exploration scientific research objectives."""
    objs = get_all_objectives()
    return {
        "count": len(objs),
        "objectives": [o.model_dump() for o in objs],
    }


@router.get("/objectives/{objective_id}", summary="Get specific scientific objective by ID")
def get_scientific_objective(objective_id: str) -> dict[str, Any]:
    """Return dossier for a single scientific exploration objective."""
    obj = get_objective_by_id(objective_id)
    if not obj:
        raise HTTPException(status_code=404, detail=f"Objective '{objective_id}' not found")
    return obj.model_dump()


@router.get("/targets", summary="Get ranked candidate scientific targets in Jezero Crater")
def get_science_targets() -> dict[str, Any]:
    """Return ranked scientific targets as a GeoJSON FeatureCollection."""
    targets_path = CATALOG_DIR / "jezero_western_delta_20m_science_targets.json"
    if not targets_path.exists():
        raise HTTPException(status_code=404, detail="Science targets catalog not found")
    return json.loads(targets_path.read_text(encoding="utf-8"))


@router.get("/inspect", summary="Explain scientific opportunity score for a coordinate")
def inspect_location_science(
    lat: float = Query(..., description="Planetocentric latitude in degrees"),
    lon: float = Query(..., description="East-positive longitude in degrees"),
) -> dict[str, Any]:
    """Query and explain multi-criteria scientific opportunity at any Mars coordinate."""
    opp_path = PROCESSED_DIR / "jezero_western_delta_20m_science_opportunity.tif"
    elev_path = PROCESSED_DIR / "jezero_western_delta_20m_elevation.tif"

    if not opp_path.exists() or not elev_path.exists():
        raise HTTPException(status_code=404, detail="Science rasters not found")

    mars_sys = MarsCoordinateSystem()
    x, y = mars_sys.to_projected(lon, lat)

    with rasterio.open(opp_path) as src:
        in_bounds = (
            src.bounds.left <= x <= src.bounds.right and src.bounds.bottom <= y <= src.bounds.top
        )
        if not in_bounds:
            return {
                "coordinate": {"lat": lat, "lon": lon},
                "status": "OUT_OF_BOUNDS",
                "composite_opportunity_score": 0.0,
                "explanation": "Location is outside the Jezero Western Delta study area.",
            }

        py_row, px_col = src.index(x, y)
        opp_score = float(src.read(1)[py_row, px_col])

    with rasterio.open(elev_path) as e_src:
        elev_val = float(e_src.read(1)[py_row, px_col])

    profile = ScienceProfile()

    # Determine dominant scientific interest
    reasons: list[str] = []
    if opp_score >= 0.45:
        reasons.append(
            "High scientific opportunity: intersects prominent sedimentary delta stratigraphy, "
            "clays, or contact zones."
        )
    elif opp_score >= 0.25:
        reasons.append(
            "Moderate scientific interest: regional sedimentary delta context or igneous basement."
        )
    else:
        reasons.append(
            "Baseline scientific interest: uniform regolith cover with limited outcrop exposure."
        )

    return {
        "coordinate": {"lat": lat, "lon": lon},
        "elevation_m": elev_val if elev_val != -9999.0 else None,
        "composite_opportunity_score": opp_score,
        "epistemic_class": "INTERPRETED",
        "explanation": " ".join(reasons),
        "disclaimers": {
            "life_inference": profile.disclaimer_life_inference,
            "rover_safety": profile.disclaimer_rover_safety,
        },
    }
