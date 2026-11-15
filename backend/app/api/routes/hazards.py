"""FastAPI router for Hazard Intelligence layers, hard constraints, and location explanation."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.data_paths import PROCESSED_DIR
from app.hazards.config import HazardProfile
from app.services.hazard_inspection import (
    AuthoritativeHazardInputMissingError,
    HazardInspectionService,
    HazardRastersNotFoundError,
)

router = APIRouter(prefix="/hazards", tags=["hazard-intelligence"])


class HazardProfileDTO(BaseModel):
    max_slope_deg: float = 25.0
    max_tri_m: float = 8.0
    forbid_unknown: bool = True
    forbid_resolution_uncertainty: bool = True
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


@router.get("/raster/data-confidence.png", summary="Serve data confidence heatmap PNG")
def get_data_confidence_png() -> FileResponse:
    target = PROCESSED_DIR / "jezero_western_delta_20m_qc_data_confidence.png"
    if not target.exists():
        raise HTTPException(status_code=404, detail="Data confidence overlay not generated")
    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)


@router.get("/raster/detection-confidence.png", summary="Serve detection confidence heatmap PNG")
def get_detection_confidence_png() -> FileResponse:
    target = PROCESSED_DIR / "jezero_western_delta_20m_qc_detection_confidence.png"
    if not target.exists():
        raise HTTPException(status_code=404, detail="Detection confidence overlay not generated")
    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)


@router.get("/raster/spatial-uncertainty.png", summary="Serve spatial uncertainty heatmap PNG")
def get_spatial_uncertainty_png() -> FileResponse:
    target = PROCESSED_DIR / "jezero_western_delta_20m_qc_spatial_uncertainty.png"
    if not target.exists():
        raise HTTPException(status_code=404, detail="Spatial uncertainty overlay not generated")
    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)


@router.get("/raster/resolution-uncertainty.png", summary="Serve resolution uncertainty mask PNG")
def get_resolution_uncertainty_png() -> FileResponse:
    target = PROCESSED_DIR / "jezero_western_delta_20m_qc_resolution_uncertainty.png"
    if not target.exists():
        raise HTTPException(status_code=404, detail="Resolution uncertainty overlay not generated")
    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)


@router.get("/inspect", summary="Explain hazard score and constraints for a coordinate")
def inspect_location_hazard(
    lat: float = Query(..., description="Planetocentric latitude in degrees"),
    lon: float = Query(..., description="East-positive longitude in degrees"),
) -> dict[str, Any]:
    """Query and explain why a location received its hazard score and passability status."""
    service = HazardInspectionService(processed_dir=PROCESSED_DIR)
    try:
        return service.inspect_coordinate(lat=lat, lon=lon)
    except HazardRastersNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AuthoritativeHazardInputMissingError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
