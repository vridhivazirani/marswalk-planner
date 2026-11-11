"""Regional Jezero Crater geospatial computation engine.

Implements:
1. High-speed multi-scale elevation sampling across regional Jezero terrain.
2. Topographic cross-section elevation profile generator along linear transects.
3. Sol-filtered authentic Perseverance rover traverse and waypoint querying.
4. Layer comparison spatial overlap analysis and compatibility validation.

Safety & Epistemic Rules:
- Canonical Mars CRS: IAU_2015:49900 (Mars sphere R = 3,396,190 m).
- Vertical Reference: Mars Gravitational Areoid (R_ref = 3,396,000 m).
- NoData is never assumed to be safe terrain.
- Rover telemetry is historical observation; never implies human EVA safety certification.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from pyproj import Geod

from app.catalog.regional_catalog import (
    REGIONAL_LAYERS,
)
from app.terrain.mola_global import sample_multiscale_elevation

# Discovery of data root
PROJECT_DATA_ROOT = Path(__file__).resolve().parents[3] / "data"
if not PROJECT_DATA_ROOT.exists():
    PROJECT_DATA_ROOT = Path("data")

RAW_PERSEVERANCE_DIR = PROJECT_DATA_ROOT / "raw/perseverance"

# Mars Great-Circle Geodesic calculator (IAU 2015 Mars Sphere)
_MARS_GEOD = Geod(a=3396190.0, b=3396190.0)


def haversine_mars_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute surface distance in metres between two points on the IAU 2015 Mars sphere."""
    _, _, dist_m = _MARS_GEOD.inv(lon1, lat1, lon2, lat2)
    return float(dist_m)


def generate_elevation_profile(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    num_points: int = 100,
) -> dict[str, Any]:
    """Generate topographic elevation profile along a linear transect on Mars.

    Samples authentic elevations along the transect using the multi-scale
    sampling hierarchy (HiRISE 1m -> CTX 20m -> MOLA 4ppd).
    Computes slope gradient, min/max/mean elevation, and total ascent/descent.
    """
    # Validation & clamping
    start_lat = max(-90.0, min(90.0, float(start_lat)))
    end_lat = max(-90.0, min(90.0, float(end_lat)))
    start_lon = float(start_lon) % 360.0
    end_lon = float(end_lon) % 360.0
    if start_lon >= 180.0:
        start_lon -= 360.0
    if end_lon >= 180.0:
        end_lon -= 360.0

    n_pts = max(2, min(500, int(num_points)))

    # Compute intermediate coordinates along great circle
    lats = [start_lat + (end_lat - start_lat) * (i / (n_pts - 1)) for i in range(n_pts)]
    lons = [start_lon + (end_lon - start_lon) * (i / (n_pts - 1)) for i in range(n_pts)]

    profile_points: list[dict[str, Any]] = []
    cumulative_dist_m = 0.0
    total_ascent_m = 0.0
    total_descent_m = 0.0
    slopes: list[float] = []

    prev_elev: float | None = None
    prev_lat = start_lat
    prev_lon = start_lon

    for i in range(n_pts):
        lat = lats[i]
        lon = lons[i]

        if i > 0:
            step_dist = haversine_mars_distance(prev_lat, prev_lon, lat, lon)
            cumulative_dist_m += step_dist

        sample = sample_multiscale_elevation(lat, lon)
        elev = sample["elevation_m"]

        slope_deg = 0.0
        if prev_elev is not None and i > 0:
            delta_h = elev - prev_elev
            if step_dist > 0.001:
                slope_rad = math.atan(abs(delta_h) / step_dist)
                slope_deg = round(math.degrees(slope_rad), 2)
                slopes.append(slope_deg)
            if delta_h > 0:
                total_ascent_m += delta_h
            else:
                total_descent_m += abs(delta_h)

        profile_points.append(
            {
                "index": i,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "distance_m": round(cumulative_dist_m, 1),
                "elevation_m": round(elev, 2),
                "slope_deg": slope_deg,
                "scale_tier": sample["scale_tier"],
                "epistemic_class": sample["epistemic_class"],
                "source_product": sample["source_product"],
            }
        )

        prev_elev = elev
        prev_lat = lat
        prev_lon = lon

    elevations = [p["elevation_m"] for p in profile_points]

    return {
        "transect": {
            "start": [round(start_lat, 6), round(start_lon, 6)],
            "end": [round(end_lat, 6), round(end_lon, 6)],
            "total_distance_m": round(cumulative_dist_m, 1),
            "num_points": n_pts,
        },
        "summary": {
            "elev_min_m": round(min(elevations), 2),
            "elev_max_m": round(max(elevations), 2),
            "elev_mean_m": round(sum(elevations) / len(elevations), 2),
            "elev_relief_m": round(max(elevations) - min(elevations), 2),
            "total_ascent_m": round(total_ascent_m, 1),
            "total_descent_m": round(total_descent_m, 1),
            "max_slope_deg": round(max(slopes), 2) if slopes else 0.0,
            "mean_slope_deg": round(sum(slopes) / len(slopes), 2) if slopes else 0.0,
            "vertical_datum": (
                "Mars Gravitational Areoid (GMM-2B equipotential surface, R_ref = 3,396,000 m)"
            ),
        },
        "points": profile_points,
    }


def query_rover_traverse(
    sol_min: int = 0,
    sol_max: int = 9999,
    limit: int = 500,
) -> dict[str, Any]:
    """Query authentic Perseverance rover traverse segments filtered by sol range."""
    traverse_file = RAW_PERSEVERANCE_DIR / "M20_traverse.json"
    if not traverse_file.exists():
        return {
            "type": "FeatureCollection",
            "features": [],
            "error": "Perseverance traverse file missing",
        }

    with open(traverse_file, encoding="utf-8") as f:
        data = json.load(f)

    all_features = data.get("features", [])
    filtered: list[dict[str, Any]] = []

    for feat in all_features:
        sol = feat.get("properties", {}).get("sol")
        if sol is not None and sol_min <= sol <= sol_max:
            filtered.append(feat)
            if len(filtered) >= limit:
                break

    return {
        "type": "FeatureCollection",
        "name": f"Perseverance_Traverse_Sols_{sol_min}_to_{sol_max}",
        "crs": {"type": "name", "properties": {"name": "IAU_2015:49900"}},
        "sol_filter": {"sol_min": sol_min, "sol_max": sol_max},
        "total_available": len(all_features),
        "count": len(filtered),
        "features": filtered,
        "epistemic_class": "OBSERVED",
        "localization_method": (
            "NASA/JPL-Caltech MIPL Terrain-Relative Localization "
            "(Visual Odometry & HiRISE Image Registration, not GPS)"
        ),
        "traverse_span_sols": "14–2022",
        "total_distance_km": 45.25,
        "telemetry_disclaimer": (
            "Perseverance telemetry represents historical robotic exploration "
            "(Sols 14–2022, 45.25 km total traverse). Localization is derived from visual odometry "
            "and HiRISE image registration, not GPS. Robotic paths do NOT certify terrain safety "
            "for human EVA."
        ),
    }


def query_rover_waypoints(
    sol_min: int = 0,
    sol_max: int = 9999,
    limit: int = 200,
) -> dict[str, Any]:
    """Query authentic Perseverance rover waypoints with localization telemetry."""
    wp_file = RAW_PERSEVERANCE_DIR / "M20_waypoints.json"
    if not wp_file.exists():
        return {
            "type": "FeatureCollection",
            "features": [],
            "error": "Perseverance waypoints file missing",
        }

    with open(wp_file, encoding="utf-8") as f:
        data = json.load(f)

    all_features = data.get("features", [])
    filtered: list[dict[str, Any]] = []

    for feat in all_features:
        sol = feat.get("properties", {}).get("sol")
        if sol is not None and sol_min <= sol <= sol_max:
            filtered.append(feat)
            if len(filtered) >= limit:
                break

    return {
        "type": "FeatureCollection",
        "name": f"Perseverance_Waypoints_Sols_{sol_min}_to_{sol_max}",
        "crs": {"type": "name", "properties": {"name": "IAU_2015:49900"}},
        "sol_filter": {"sol_min": sol_min, "sol_max": sol_max},
        "total_available": len(all_features),
        "count": len(filtered),
        "features": filtered,
        "epistemic_class": "OBSERVED",
        "localization_method": (
            "NASA/JPL-Caltech MIPL Terrain-Relative Localization "
            "(Visual Odometry & HiRISE Image Registration, not GPS)"
        ),
        "waypoint_span_sols": "13–2022",
        "telemetry_disclaimer": (
            "Perseverance waypoint telemetry represents historical robotic stops (Sols 13–2022). "
            "Localization is derived from visual odometry and HiRISE image registration, not GPS. "
            "Robotic paths do NOT certify terrain safety for human EVA."
        ),
    }


def compare_regional_layers(layer_a_id: str, layer_b_id: str) -> dict[str, Any]:
    """Evaluate spatial overlap, resolution ratio, and comparison feasibility between two layers."""
    layer_map = {layer["id"]: layer for layer in REGIONAL_LAYERS}

    layer_a = layer_map.get(layer_a_id)
    layer_b = layer_map.get(layer_b_id)

    if not layer_a or not layer_b:
        return {
            "error": "One or both layer identifiers not found in regional registry",
            "can_compare": False,
        }

    fp_a = layer_a["footprint"]
    fp_b = layer_b["footprint"]

    # Compute bounding intersection
    overlap_lat_min = max(fp_a[0][0], fp_b[0][0])
    overlap_lat_max = min(fp_a[1][0], fp_b[1][0])
    overlap_lon_min = max(fp_a[0][1], fp_b[0][1])
    overlap_lon_max = min(fp_a[1][1], fp_b[1][1])

    has_overlap = (overlap_lat_max > overlap_lat_min) and (overlap_lon_max > overlap_lon_min)

    overlap_bounds = None
    overlap_area_km2 = 0.0

    if has_overlap:
        overlap_bounds = [
            [round(overlap_lat_min, 5), round(overlap_lon_min, 5)],
            [round(overlap_lat_max, 5), round(overlap_lon_max, 5)],
        ]
        # Calculate approximate area on Mars sphere
        lat_dist_km = (overlap_lat_max - overlap_lat_min) * (math.pi / 180.0) * 3396.19
        mid_lat_rad = math.radians((overlap_lat_min + overlap_lat_max) / 2.0)
        lon_dist_km = (
            (overlap_lon_max - overlap_lon_min)
            * (math.pi / 180.0)
            * 3396.19
            * math.cos(mid_lat_rad)
        )
        overlap_area_km2 = round(lat_dist_km * lon_dist_km, 2)

    res_ratio = None
    if layer_a.get("resolution_m") and layer_b.get("resolution_m"):
        res_ratio = round(layer_a["resolution_m"] / layer_b["resolution_m"], 2)

    return {
        "layer_a": {
            "id": layer_a["id"],
            "name": layer_a["name"],
            "category": layer_a["category"],
            "resolution_m": layer_a.get("resolution_m"),
            "epistemic_class": layer_a["epistemic_class"],
        },
        "layer_b": {
            "id": layer_b["id"],
            "name": layer_b["name"],
            "category": layer_b["category"],
            "resolution_m": layer_b.get("resolution_m"),
            "epistemic_class": layer_b["epistemic_class"],
        },
        "can_compare": has_overlap,
        "has_spatial_overlap": has_overlap,
        "overlap_bounds": overlap_bounds,
        "overlap_area_km2": overlap_area_km2,
        "resolution_ratio_a_to_b": res_ratio,
        "scientific_caveat": (
            "Never assume that visual or elevation layer alignment implies identical "
            "native resolution. Compare layers only within their verified spatial intersection."
        ),
    }
