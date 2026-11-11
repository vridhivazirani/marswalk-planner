"""FastAPI router for Advanced Terrain Intelligence, multi-resolution analysis,
and classification.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.terrain.classifier import TERRAIN_CLASS_DETAILS, TERRAIN_CLASS_NAMES
from app.terrain.multi_resolution import MultiResolutionTerrainInspector

router = APIRouter(prefix="/terrain", tags=["terrain-intelligence"])

PROCESSED_DIR = Path(__file__).resolve().parents[4] / "data" / "processed"
CATALOG_DIR = Path(__file__).resolve().parents[4] / "data" / "catalog"

_inspector = MultiResolutionTerrainInspector()


class TerrainInspectQueryDTO(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0, description="Planetocentric latitude in degrees")
    lon: float = Field(..., ge=-180.0, le=180.0, description="East-positive longitude in degrees")
    include_local_1m: bool = Field(
        True, description="Whether to include windowed 1m HiRISE micro-analysis"
    )
    window_radius_m: float = Field(
        50.0, ge=10.0, le=200.0, description="Local inspection window radius in metres"
    )


class TerrainTransectRequestDTO(BaseModel):
    start_lat: float = Field(..., ge=-90.0, le=90.0, description="Start planetocentric latitude")
    start_lon: float = Field(..., ge=-180.0, le=180.0, description="Start east-positive longitude")
    dest_lat: float = Field(..., ge=-90.0, le=90.0, description="End planetocentric latitude")
    dest_lon: float = Field(..., ge=-180.0, le=180.0, description="End east-positive longitude")
    num_samples: int = Field(100, ge=10, le=500, description="Number of interpolation samples")


@router.get("/classes", summary="Get 7-class terrain classification legend and properties")
def get_terrain_classes() -> dict[str, Any]:
    """Return all 7 terrain classes with descriptions, speed factors, and color palette."""
    return {
        "classes": list(TERRAIN_CLASS_DETAILS.values()),
        "class_names": TERRAIN_CLASS_NAMES,
        "count": len(TERRAIN_CLASS_DETAILS),
        "epistemic_class": "HEURISTIC",
    }


@router.get("/layers", summary="Get catalog of advanced terrain intelligence layers")
def get_terrain_layers() -> dict[str, Any]:
    """Return metadata for all derived terrain layers (slope, TRI, relief, roughness, VRM, etc.)."""
    catalog_path = CATALOG_DIR / "jezero_western_delta_20m_terrain_intelligence.json"
    if not catalog_path.exists():
        raise HTTPException(status_code=404, detail="Terrain intelligence catalog not generated")

    catalog_data = json.loads(catalog_path.read_text())
    return {
        "layers": catalog_data.get("layers", []),
        "class_distribution": catalog_data.get("class_distribution", {}),
        "boulder_candidate_stats": catalog_data.get("boulder_candidate_stats", {}),
        "processed_utc": catalog_data.get("processed_utc"),
    }


@router.get("/statistics", summary="Get summary statistics for all terrain metrics")
def get_terrain_statistics() -> dict[str, Any]:
    """Return aggregate statistics across the Jezero study footprint."""
    catalog_path = CATALOG_DIR / "jezero_western_delta_20m_terrain_intelligence.json"
    if not catalog_path.exists():
        raise HTTPException(status_code=404, detail="Terrain intelligence catalog not generated")

    data = json.loads(catalog_path.read_text())
    layers_dict = {lyr["layer_id"]: lyr for lyr in data.get("layers", [])}

    return {
        "grid_name": data.get("grid_name", "jezero_western_delta_20m"),
        "total_analyzed_cells": sum(data.get("class_distribution", {}).values()),
        "layers": layers_dict,
        "class_distribution": data.get("class_distribution", {}),
        "boulder_candidate_summary": data.get("boulder_candidate_stats", {}),
    }


@router.get("/inspect", summary="Multi-resolution coordinate terrain inspection")
def inspect_terrain_point(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Planetocentric latitude in degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="East-positive longitude in degrees"),
    include_local_1m: bool = Query(
        True, description="Include windowed 1m HiRISE micro-analysis if available"
    ),
    window_radius_m: float = Query(
        50.0, ge=10.0, le=200.0, description="Radius in metres for 1m micro-window"
    ),
) -> dict[str, Any]:
    """Inspect terrain at regional 20m and native 1.0m HiRISE micro-resolution."""
    result = _inspector.inspect_point(
        lat=lat,
        lon=lon,
        include_local_1m=include_local_1m,
        local_window_m=window_radius_m,
    )
    return result


@router.post("/transect", summary="Compute continuous elevation transect profile")
def extract_transect_profile_endpoint(req: TerrainTransectRequestDTO) -> dict[str, Any]:
    """Compute continuous cross-section profile with elevation, slope, and terrain units."""
    return _inspector.extract_transect_profile(
        start_lat=req.start_lat,
        start_lon=req.start_lon,
        dest_lat=req.dest_lat,
        dest_lon=req.dest_lon,
        num_samples=req.num_samples,
    )


@router.get("/raster/{layer_id}.png", summary="Serve terrain intelligence QC visualization PNG")
def get_terrain_raster_png(layer_id: str) -> FileResponse:
    """Serve visualization PNG overlay for a specified terrain layer."""
    file_map = {
        "classes": PROCESSED_DIR / "jezero_western_delta_20m_qc_classes.png",
        "slope": PROCESSED_DIR / "jezero_western_delta_20m_qc_slope.png",
        "elevation": PROCESSED_DIR / "jezero_western_delta_20m_qc_elevation.png",
        "ortho": PROCESSED_DIR / "jezero_western_delta_20m_ortho_imagery.png",
    }

    target = file_map.get(layer_id)
    if target is None or not target.exists():
        avail = list(file_map.keys())
        raise HTTPException(
            status_code=404,
            detail=f"Terrain visualization overlay not found for '{layer_id}'. Available: {avail}",
        )

    return FileResponse(target, media_type="image/png")
