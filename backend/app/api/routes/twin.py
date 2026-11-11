"""FastAPI routers for Marswalk Digital Twin data products (layers, elevation, rover paths)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/twin", tags=["digital-twin"])

PROCESSED_DIR = Path(__file__).resolve().parents[4] / "data" / "processed"
RAW_DIR = Path(__file__).resolve().parents[4] / "data" / "raw"
CATALOG_DIR = Path(__file__).resolve().parents[4] / "data" / "catalog"


@router.get("/layers", summary="Get metadata for all available Digital Twin layers")
def get_layers() -> dict[str, Any]:
    """Return available 2D and 3D layers, bounding extents, and Mars coordinates."""
    elev_tif = PROCESSED_DIR / "jezero_western_delta_20m_elevation.tif"
    if not elev_tif.exists():
        raise HTTPException(status_code=404, detail="Processed elevation layer not found")

    with rasterio.open(elev_tif) as src:
        width = src.width
        height = src.height

    # Study area boundaries in planetocentric east-positive lat/lon:
    lat_min, lat_max = 18.39180, 18.58953
    lon_min, lon_max = 77.34370, 77.46584

    return {
        "study_area": {
            "name": "Jezero Western Fan & Delta Margin",
            "crs_geographic": "IAU_2015:49900",
            "crs_projected": "ESRI:103885",
            "center": [(lat_min + lat_max) / 2.0, (lon_min + lon_max) / 2.0],
            "bounds": [
                [lat_min, lon_min],  # Southwest [lat, lon]
                [lat_max, lon_max],  # Northeast [lat, lon]
            ],
            "grid_dimensions": {"width": width, "height": height},
            "resolution_m": 20.0,
            "elevation_range_m": {"min": -2598.94, "max": -2240.47},
        },
        "layers": [
            {
                "id": "ortho_imagery",
                "name": "CTX Orthorectified Surface Reflectance (6m aligned to 20m)",
                "type": "raster",
                "epistemic_class": "OBSERVED",
                "url": "/api/v1/twin/raster/ortho.png",
                "description": (
                    "USGS TRN CTX controlled visible surface mosaic "
                    "(6m native, resampled to 20m grid)."
                ),
            },
            {
                "id": "elevation_colormap",
                "name": "Topographic Elevation Overlay (20m DTM)",
                "type": "raster",
                "epistemic_class": "DERIVED",
                "url": "/api/v1/twin/raster/elevation.png",
                "description": "Elevation: Blue (-2600m floor) to Yellow/Red (-2240m delta scarp).",
            },
            {
                "id": "hillshade",
                "name": "Analytical Topographic Hillshade (NW 315° / 45°)",
                "type": "raster",
                "epistemic_class": "DERIVED",
                "url": "/api/v1/twin/raster/hillshade.png",
                "description": (
                    "Single-azimuth Lambertian illumination (NW 315°, altitude 45°) highlighting "
                    "delta scarp cliffs, impact craters, and bedrock fractures."
                ),
            },
            {
                "id": "multidirectional_hillshade",
                "name": "Multi-Directional Relief Shading (Unbiased 4-Angle Blend)",
                "type": "raster",
                "epistemic_class": "DERIVED",
                "url": "/api/v1/twin/raster/multidirectional_hillshade.png",
                "description": (
                    "Aspect-unbiased composite hillshade blending 4 oblique lighting directions "
                    "(225°, 270°, 315°, 360°) to reveal terrain morphology in all orientations."
                ),
            },
            {
                "id": "elevation_contours",
                "name": "Topographic Elevation Contours (50m MOLA Intervals)",
                "type": "vector",
                "epistemic_class": "DERIVED",
                "url": "/api/v1/twin/vector/contours?interval=50",
                "description": (
                    "Authentic vector elevation contour lines derived from 20m DTM. "
                    "Heights relative to Mars areoid."
                ),
            },
            {
                "id": "slope_overlay",
                "name": "Horn's Slope & Steep Hazard Mask (deg)",
                "type": "raster",
                "epistemic_class": "DERIVED",
                "url": "/api/v1/twin/raster/slope.png",
                "description": "Slope: Green (<10°) to Orange and Purple (>25° impassable cliff).",
            },
            {
                "id": "terrain_classes",
                "name": "Terrain Geomorphic Units (Heuristic Rule-Based)",
                "type": "raster",
                "epistemic_class": "HEURISTIC",
                "url": "/api/v1/twin/raster/classes.png",
                "description": "Units: Regolith, Dunes (Gold), Rocks (Crimson), Cliffs (Pink).",
            },
            {
                "id": "source_coverage",
                "name": "Data Source & Coverage Mask",
                "type": "raster",
                "epistemic_class": "DERIVED",
                "url": "/api/v1/twin/raster/coverage.png",
                "description": "Data provenance: Cyan = HiRISE 1m DTM, Amber = CTX 20m DTM.",
            },
            {
                "id": "overall_hazard",
                "name": "Overall Hazard Heatmap (Risk Engine)",
                "type": "raster",
                "epistemic_class": "HEURISTIC",
                "url": "/api/v1/hazards/raster/overall.png",
                "description": "Multi-criteria risk score: Green (flat) to Red/Magenta (steep).",
            },
            {
                "id": "science_opportunity",
                "name": "Scientific Opportunity Heatmap (Science Engine)",
                "type": "raster",
                "epistemic_class": "INTERPRETED",
                "url": "/api/v1/science/raster/opportunity.png",
                "description": "Multi-criteria science value: Indigo (low) to Bright Gold (high).",
            },
            {
                "id": "unified_costmap",
                "name": "Unified Cost Map (Routing Multiplier)",
                "type": "raster",
                "epistemic_class": "HEURISTIC",
                "url": "/api/v1/costmap/raster/balanced.png",
                "description": "Multi-criteria traversal cost: Green (low) to Red (high/blocked).",
            },
            {
                "id": "perseverance_traverse",
                "name": "Perseverance Rover Historical Traverse (Observed)",
                "type": "vector",
                "epistemic_class": "OBSERVED",
                "url": "/api/v1/twin/vector/perseverance",
                "description": (
                    "Authentic historical rover telemetry (Sols 0–1000+). Extends west "
                    "beyond the 20m delta DTM study footprint into regional Jezero crater floor."
                ),
            },
        ],
    }


@router.get("/raster/{layer_name}.png", summary="Serve processed layer PNG overlays")
def get_raster_layer(layer_name: str) -> FileResponse:
    """Stream optimized PNG image for 2D map overlay and 3D terrain texture draping."""
    file_map = {
        "ortho": PROCESSED_DIR / "jezero_western_delta_20m_ortho_imagery.png",
        "elevation": PROCESSED_DIR / "jezero_western_delta_20m_elev_colormap.png",
        "hillshade": PROCESSED_DIR / "jezero_western_delta_20m_hillshade.png",
        "multidirectional_hillshade": (
            PROCESSED_DIR / "jezero_western_delta_20m_multidirectional_hillshade.png"
        ),
        "coverage": PROCESSED_DIR / "jezero_western_delta_20m_qc_source_coverage.png",
        "slope": PROCESSED_DIR / "jezero_western_delta_20m_qc_slope.png",
        "classes": PROCESSED_DIR / "jezero_western_delta_20m_qc_classes.png",
    }
    target = file_map.get(layer_name)
    if not target or not target.exists():
        raise HTTPException(status_code=404, detail=f"Layer {layer_name} not available")
    return FileResponse(target, media_type="image/png")


@router.get("/vector/perseverance", summary="Get authentic Perseverance rover traverse")
def get_perseverance_vector() -> dict[str, Any]:
    """Return combined GeoJSON containing rover waypoints and path."""
    wp_path = RAW_DIR / "perseverance" / "M20_waypoints.json"
    tr_path = RAW_DIR / "perseverance" / "M20_traverse.json"

    if not wp_path.exists() or not tr_path.exists():
        msg = "Perseverance telemetry files not found in raw data"
        raise HTTPException(status_code=404, detail=msg)

    with open(wp_path, encoding="utf-8") as f:
        wp_data = json.load(f)
    with open(tr_path, encoding="utf-8") as f:
        tr_data = json.load(f)

    return {
        "type": "FeatureCollection",
        "features": wp_data.get("features", []) + tr_data.get("features", []),
    }


@router.get("/vector/contours", summary="Get topographic elevation contour GeoJSON")
def get_elevation_contours(interval: int = 50) -> dict[str, Any]:
    """Return authentic GeoJSON contour lines for the Jezero study area (10m or 50m intervals)."""
    if interval not in (10, 50):
        interval = 50
    contour_file = PROCESSED_DIR / f"jezero_western_delta_contours_{interval}m.geojson"
    if not contour_file.exists():
        raise HTTPException(status_code=404, detail=f"{interval}m contour data not found")
    with open(contour_file, encoding="utf-8") as f:
        return json.load(f)


@router.get("/elevation/grid", summary="Get 3D elevation matrix for terrain mesh")
def get_elevation_grid(step: int = 4) -> dict[str, Any]:
    """Return 2D elevation float array downsampled by `step` for 3D mesh creation."""
    elev_tif = PROCESSED_DIR / "jezero_western_delta_20m_elevation.tif"
    if not elev_tif.exists():
        raise HTTPException(status_code=404, detail="Elevation raster not found")

    with rasterio.open(elev_tif) as src:
        data = src.read(1)[::step, ::step]
        nodata = float(src.nodata) if src.nodata is not None else -9999.0

    valid = data[data != nodata]
    fill_min = float(valid.min()) if valid.size > 0 else -2600.0
    clean_data = np.where((data == nodata) | np.isnan(data), fill_min, data)

    return {
        "rows": clean_data.shape[0],
        "cols": clean_data.shape[1],
        "step": step,
        "grid_resolution_m": 20.0 * step,
        "elev_min_m": float(valid.min()) if valid.size > 0 else fill_min,
        "elev_max_m": float(valid.max()) if valid.size > 0 else fill_min,
        "elev_mean_m": float(valid.mean()) if valid.size > 0 else fill_min,
        "elevations": clean_data.tolist(),
    }
