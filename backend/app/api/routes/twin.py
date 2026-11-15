"""FastAPI routers for Marswalk Digital Twin data products (layers, elevation, rover paths)."""

from __future__ import annotations

import json
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.data_paths import PROCESSED_DIR, RAW_DIR

router = APIRouter(prefix="/twin", tags=["digital-twin"])


@router.get("/layers", summary="Get metadata for all available Digital Twin layers")
def get_layers() -> dict[str, Any]:
    """Return available 2D and 3D layers, bounding extents, and Mars coordinates."""
    from app.terrain.provider import TerrainDataProvider

    provider = TerrainDataProvider.get_instance()
    if provider.is_available and provider._elevation is not None:
        width = provider.width
        height = provider.height
        res_m = 20.0
        elev_band = provider._elevation
        valid_elev = elev_band[(elev_band != -9999.0) & ~np.isnan(elev_band)]
        min_elev = float(np.min(valid_elev)) if valid_elev.size > 0 else -2598.94
        max_elev = float(np.max(valid_elev)) if valid_elev.size > 0 else -2240.47
        lat_min = provider.geo_bounds["min_lat"]
        lat_max = provider.geo_bounds["max_lat"]
        lon_min = provider.geo_bounds["min_lon"]
        lon_max = provider.geo_bounds["max_lon"]
    else:
        elev_tif = PROCESSED_DIR / "jezero_western_delta_20m_elevation.tif"
        if elev_tif.exists():
            import rasterio

            with rasterio.open(elev_tif) as src:
                width = src.width
                height = src.height
                bounds = src.bounds
                res_m = float(src.res[0])
                raster_crs = src.crs

                # Defensive validation: verify raster CRS is valid Mars coordinate system
                if raster_crs is None or "103885" not in raster_crs.to_string():
                    raise HTTPException(
                        status_code=500, detail="Invalid raster CRS metadata: expected ESRI:103885"
                    )

                # Read elevation range dynamically
                elev_band = src.read(1)
                nodata = src.nodata

            valid_elev = elev_band[(elev_band != nodata) & ~np.isnan(elev_band)]
            min_elev = float(np.min(valid_elev)) if valid_elev.size > 0 else -2598.94
            max_elev = float(np.max(valid_elev)) if valid_elev.size > 0 else -2240.47

            # Dynamically transform raster bounds to geographic planetocentric lat/lon
            from app.geospatial.crs import MarsCoordinateSystem

            mars_crs = MarsCoordinateSystem()

            xs = np.linspace(bounds.left, bounds.right, num=15)
            ys = np.linspace(bounds.bottom, bounds.top, num=15)
            edge_coords = []
            for x in xs:
                edge_coords.append(mars_crs.to_geographic(x, bounds.bottom))
                edge_coords.append(mars_crs.to_geographic(x, bounds.top))
            for y in ys:
                edge_coords.append(mars_crs.to_geographic(bounds.left, y))
                edge_coords.append(mars_crs.to_geographic(bounds.right, y))

            lon_min = round(float(min(p[0] for p in edge_coords)), 5)
            lon_max = round(float(max(p[0] for p in edge_coords)), 5)
            lat_min = round(float(min(p[1] for p in edge_coords)), 5)
            lat_max = round(float(max(p[1] for p in edge_coords)), 5)
        else:
            # Authentic Jezero Western Delta canonical footprint on serverless environments
            width = 362
            height = 586
            res_m = 20.0
            min_elev = -2598.94
            max_elev = -2240.47
            lon_min = 77.34370
            lon_max = 77.46584
            lat_min = 18.39180
            lat_max = 18.58953

    return {
        "study_area": {
            "name": "Jezero Western Fan & Delta Margin",
            "crs_geographic": "IAU_2015:49900",
            "crs_projected": "ESRI:103885",
            "center": [round((lat_min + lat_max) / 2.0, 5), round((lon_min + lon_max) / 2.0, 5)],
            "bounds": [
                [lat_min, lon_min],  # Southwest [lat, lon]
                [lat_max, lon_max],  # Northeast [lat, lon]
            ],
            "grid_dimensions": {"width": width, "height": height},
            "resolution_m": res_m,
            "elevation_range_m": {"min": round(min_elev, 2), "max": round(max_elev, 2)},
        },
        "layers": [
            {
                "id": "ortho_imagery",
                "name": "High-Resolution Optical Imagery (Unavailable)",
                "type": "raster",
                "epistemic_class": "UNKNOWN",
                "url": "/api/v1/twin/raster/ortho.png",
                "description": (
                    "High-resolution optical surface imagery is currently unavailable "
                    "in this view. Terrain analysis is supported by authentic elevation models, "
                    "contours, and rover telemetry."
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
                "id": "data_confidence",
                "name": "Data Reliability Index Overlay (M0.3 Uncalibrated)",
                "type": "raster",
                "epistemic_class": "HEURISTIC",
                "url": "/api/v1/hazards/raster/data-confidence.png",
                "description": (
                    "Uncalibrated ordinal sensor reliability index [0-1]: Cyan = HiRISE 1m tier "
                    "(0.95), Sky/Amber = CTX 20m tier (0.70), Dark Slate = Unmapped/NoData."
                ),
            },
            {
                "id": "detection_confidence",
                "name": "Hazard Evidence Reliability Index (M0.3 Uncalibrated)",
                "type": "raster",
                "epistemic_class": "HEURISTIC",
                "url": "/api/v1/hazards/raster/detection-confidence.png",
                "description": (
                    "Composite uncalibrated evidence reliability index [0-1] across DTM "
                    "derivatives, CTX 20m optical CV imagery, and metre-scale resolution adequacy."
                ),
            },
            {
                "id": "spatial_uncertainty",
                "name": "Nominal Vertical Precision Tier (M0.3 Provisional)",
                "type": "raster",
                "epistemic_class": "HEURISTIC",
                "url": "/api/v1/hazards/raster/spatial-uncertainty.png",
                "description": (
                    "Provisional unverified nominal precision tier: 0.20 m nominal (HiRISE) vs "
                    "2.00 m nominal (CTX regional); not calibrated ±1σ error bars. "
                    "Magenta = NoData."
                ),
            },
            {
                "id": "resolution_uncertainty",
                "name": "Resolution Uncertainty Mask (M0.3 CTX-Only)",
                "type": "raster",
                "epistemic_class": "DERIVED",
                "url": "/api/v1/hazards/raster/resolution-uncertainty.png",
                "description": (
                    "Amber = Unresolved micro-scale hazards where only CTX 20m coverage exists."
                ),
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


CACHE_HEADERS = {"Cache-Control": "no-cache, must-revalidate"}


@router.get("/raster/{layer_name}.png", summary="Serve processed layer PNG overlays")
def get_raster_layer(layer_name: str, v: str | None = None) -> FileResponse:
    """Stream optimized PNG image for 2D map overlay and 3D terrain texture draping."""
    file_map = {
        "ortho": (
            PROCESSED_DIR / "jezero_western_delta_6m_ortho_imagery.png"
            if (PROCESSED_DIR / "jezero_western_delta_6m_ortho_imagery.png").exists()
            else PROCESSED_DIR / "jezero_western_delta_20m_ortho_imagery.png"
        ),
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
    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)


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
    from app.terrain.provider import TerrainDataProvider

    provider = TerrainDataProvider.get_instance()
    if provider.is_available and provider._elevation is not None:
        data = provider._elevation[::step, ::step]
        nodata = -9999.0
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

    elev_tif = PROCESSED_DIR / "jezero_western_delta_20m_elevation.tif"
    if elev_tif.exists():
        import rasterio

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

    raise HTTPException(
        status_code=503, detail="Authentic elevation grid is currently unavailable."
    )
