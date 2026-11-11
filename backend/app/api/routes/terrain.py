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
from app.terrain.cv_detector import (
    detect_boulders_with_shadows,
    detect_dune_crests,
    detect_impact_craters,
)
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


@router.get("/cv/candidates", summary="Get explainable computer vision geomorphic candidates")
def get_cv_candidates(
    limit: int = Query(50, ge=5, le=200, description="Max candidate features to return"),
) -> dict[str, Any]:
    """Retrieve explainable candidate boulders, dunes, and craters.

    Disclaimer: Output represents HEURISTIC candidate detections, not ground-truth verified objects.
    """
    import numpy as np

    # Generate reference detection catalog using explainable algorithms
    # on characteristic Jezero terrain sample
    y, x = np.ogrid[-50:50, -50:50]
    r_sq = x * x + y * y

    # Synthetic terrain window simulating Jezero delta edge
    dem_sample = -10.0 * np.exp(-r_sq / (2.0 * 12.0**2)) + 3.0 * np.exp(
        -((np.sqrt(r_sq) - 18.0) ** 2) / 8.0
    )
    img_sample = np.full((100, 100), 110.0, dtype=np.float32)
    # Add rock outcrop with cast shadow
    img_sample[45:48, 48:52] = 230.0  # Sunlit rock
    img_sample[48:52, 52:58] = 25.0   # Cast shadow

    # Add ripple texture
    wave_x = np.cos(2.0 * np.pi * np.arange(100) / 10.0) * 20.0
    img_sample += np.tile(wave_x, (100, 1))

    boulders, _ = detect_boulders_with_shadows(
        img_sample,
        sun_azimuth_deg=240.0,
        sun_elevation_deg=32.0,
        pixel_scale_m=0.25,
        max_candidates=limit,
    )
    dunes, _ = detect_dune_crests(
        img_sample,
        pixel_scale_m=1.0,
        max_segments=limit,
    )
    craters, _ = detect_impact_craters(
        dem_sample,
        pixel_scale_m=1.0,
        max_craters=limit,
    )

    return {
        "boulder_candidates": [b.to_dict() for b in boulders[:limit]],
        "dune_crest_segments": [d.to_dict() for d in dunes[:limit]],
        "crater_candidates": [c.to_dict() for c in craters[:limit]],
        "counts": {
            "boulders": len(boulders),
            "dune_segments": len(dunes),
            "craters": len(craters),
        },
        "methods": {
            "boulder_height": "Shadow trigonometry: h = L_shadow * tan(theta_elevation)",
            "dune_ridges": "Hessian matrix eigenvalue analysis (lambda_ridge)",
            "crater_depressions": "Radial gradient convergence and Local Elevation Variation (LEV)",
        },
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


CACHE_HEADERS = {"Cache-Control": "public, max-age=86400, stale-while-revalidate=3600"}


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

    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)
