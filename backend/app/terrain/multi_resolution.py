"""Multi-resolution planetary terrain inspection engine for Marswalk Planner.

Supports:
1. Regional 20m terrain intelligence evaluation across the entire Jezero study area.
2. Local 1.0m micro-terrain inspection via windowed reads of authentic USGS TRN HiRISE DTM.
3. Explicit verification of whether high-resolution data exists at a coordinate.
4. Preserves source resolution metadata without implying resampling creates new information.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from app.geospatial.crs import MarsCoordinateSystem
from app.terrain.classifier import TERRAIN_CLASS_DETAILS
from app.terrain.derivatives import (
    compute_curvatures,
    compute_local_relief,
    compute_slope_aspect_horn,
    compute_surface_roughness,
    compute_terrain_ruggedness_index,
    compute_vector_ruggedness_measure,
)
from app.terrain.hazards_detector import (
    detect_boulder_candidates_advanced,
    extract_boulder_objects,
)


class MultiResolutionTerrainInspector:
    """Inspects Martian surface topography at regional (20m) and local (1.0m) resolutions."""

    def __init__(self, data_root: Path | None = None) -> None:
        if data_root is None:
            self.data_root = Path(__file__).resolve().parents[3] / "data"
        else:
            self.data_root = Path(data_root)

        self.processed_dir = self.data_root / "processed"
        self.raw_dir = self.data_root / "raw"

        # Regional 20m rasters
        self.regional_elev_path = self.processed_dir / "jezero_western_delta_20m_elevation.tif"
        self.regional_slope_path = self.processed_dir / "jezero_western_delta_20m_slope_deg.tif"
        self.regional_tri_path = self.processed_dir / "jezero_western_delta_20m_tri_roughness_m.tif"
        self.regional_classes_path = (
            self.processed_dir / "jezero_western_delta_20m_terrain_classes.tif"
        )
        self.regional_conf_path = (
            self.processed_dir / "jezero_western_delta_20m_terrain_confidence.tif"
        )
        self.regional_source_path = self.processed_dir / "jezero_western_delta_20m_source_id.tif"

        # Native 1.0m HiRISE DTM
        self.hirise_1m_path = self.raw_dir / "usgs_trn" / "HiRISE_DTM_Delta_Jezero_DL_1m.tif"
        self.crs = MarsCoordinateSystem()

    def has_high_resolution_coverage(self, lat: float, lon: float) -> bool:
        """Check whether authentic 1.0m HiRISE DTM coverage exists at the coordinate."""
        if not self.hirise_1m_path.exists():
            return False

        px, py = self.crs.to_projected(lon, lat)
        try:
            with rasterio.open(self.hirise_1m_path) as src:
                bounds = src.bounds
                if not (bounds.left <= px <= bounds.right and bounds.bottom <= py <= bounds.top):
                    return False

                row, col = src.index(px, py)
                if not (0 <= row < src.height and 0 <= col < src.width):
                    return False

                # Windowed single-pixel query
                window = rasterio.windows.Window(col, row, 1, 1)
                val = src.read(1, window=window)[0, 0]
                return bool(val != src.nodata and not np.isnan(val))
        except Exception:
            return False

    def inspect_point(
        self,
        lat: float,
        lon: float,
        include_local_1m: bool = True,
        local_window_m: float = 60.0,
    ) -> dict[str, Any]:
        """Perform comprehensive multi-resolution terrain inspection for a Martian coordinate."""
        px, py = self.crs.to_projected(lon, lat)

        # 1. Regional 20m Inspection
        regional_info = self._query_regional_point(lat, lon, px, py)

        # 2. Local 1.0m HiRISE Micro-Terrain Inspection
        has_hirise = self.has_high_resolution_coverage(lat, lon)
        local_1m_info: dict[str, Any] | None = None

        if include_local_1m and has_hirise and self.hirise_1m_path.exists():
            local_1m_info = self._query_local_hirise_window(px, py, radius_m=local_window_m)

        return {
            "coordinate": {
                "lat": float(lat),
                "lon": float(lon),
                "projected_x_m": float(px),
                "projected_y_m": float(py),
                "crs_geographic": "IAU_2015:49900",
                "crs_projected": "ESRI:103885",
            },
            "high_resolution_available": has_hirise,
            "regional_analysis_20m": regional_info,
            "local_micro_analysis_1m": local_1m_info,
            "provenance_and_metadata": {
                "regional_source": "USGS TRN Jezero Western Delta 20m Synthesis",
                "high_res_source": "HiRISE DTM Delta Jezero DL 1.0m (NASA PDS / USGS TRN)"
                if has_hirise
                else "Unavailable at this coordinate (falls back to regional 20m CTX)",
                "resampling_policy": (
                    "Strict preservation of source resolution. "
                    "20m regional layers are native CTX/aggregated HiRISE; "
                    "local 1m micro-terrain uses native HiRISE DTM with zero upsampling."
                ),
                "disclaimer": (
                    "Research and decision-support prototype. "
                    "Never claim astronaut operational safety certification."
                ),
            },
        }

    def _query_regional_point(self, lat: float, lon: float, px: float, py: float) -> dict[str, Any]:
        """Query 20m regional layers at point location."""
        if not self.regional_elev_path.exists():
            return {"status": "UNAVAILABLE", "message": "Regional rasters not found"}

        with rasterio.open(self.regional_elev_path) as src_elev:
            bounds = src_elev.bounds
            in_bounds = bounds.left <= px <= bounds.right and bounds.bottom <= py <= bounds.top
            if not in_bounds:
                return {
                    "is_valid": False,
                    "reason": "Coordinate outside study area boundary",
                    "elevation_m": None,
                }

            r, c = src_elev.index(px, py)
            if not (0 <= r < src_elev.height and 0 <= c < src_elev.width):
                return {
                    "is_valid": False,
                    "reason": "Coordinate index out of raster bounds",
                    "elevation_m": None,
                }

            elev = float(src_elev.read(1, window=rasterio.windows.Window(c, r, 1, 1))[0, 0])
            nodata = src_elev.nodata or -9999.0
            if elev == nodata or np.isnan(elev):
                return {
                    "is_valid": False,
                    "reason": "Cell contains NoData in regional elevation",
                    "elevation_m": None,
                }

        # Query slope, tri, classification, confidence
        slope = self._read_pixel_safely(self.regional_slope_path, c, r)
        tri = self._read_pixel_safely(self.regional_tri_path, c, r)
        class_id = int(self._read_pixel_safely(self.regional_classes_path, c, r) or 0)
        confidence = self._read_pixel_safely(self.regional_conf_path, c, r)
        src_id = int(self._read_pixel_safely(self.regional_source_path, c, r) or 1)

        class_details = TERRAIN_CLASS_DETAILS.get(class_id, TERRAIN_CLASS_DETAILS[0])

        return {
            "is_valid": True,
            "elevation_m": round(elev, 2),
            "slope_deg": round(slope, 2) if slope is not None else None,
            "tri_m": round(tri, 3) if tri is not None else None,
            "terrain_class": {
                "id": class_id,
                "name": class_details["name"],
                "code": class_details["code"],
                "description": class_details["description"],
                "traversability": class_details["traversability"],
                "speed_factor": class_details["speed_factor"],
                "hazard_risk": class_details["hazard_risk"],
            },
            "confidence_score": round(confidence, 3) if confidence is not None else 0.70,
            "source_product": "HiRISE 1m (fused)" if src_id == 2 else "CTX 20m (native)",
            "source_resolution_m": 20.0,
            "cell_size_m": 20.0,
        }

    def _query_local_hirise_window(
        self, px: float, py: float, radius_m: float = 60.0
    ) -> dict[str, Any]:
        """Perform native 1.0m micro-topography calculation in window around point."""
        with rasterio.open(self.hirise_1m_path) as src:
            win = from_bounds(
                px - radius_m, py - radius_m, px + radius_m, py + radius_m, src.transform
            )
            data = src.read(1, window=win).astype(np.float32)
            nodata = src.nodata or -32768.0

        valid_mask = (data != nodata) & ~np.isnan(data)
        if not np.any(valid_mask):
            return {
                "is_available": False,
                "message": "HiRISE window contains only NoData at this location",
            }

        valid_elev = data[valid_mask]
        min_elev = float(np.min(valid_elev))
        max_elev = float(np.max(valid_elev))
        mean_elev = float(np.mean(valid_elev))
        center_elev = (
            float(data[data.shape[0] // 2, data.shape[1] // 2])
            if valid_mask[data.shape[0] // 2, data.shape[1] // 2]
            else mean_elev
        )

        # Calculate native 1.0m derivatives in window
        slope_1m, aspect_1m = compute_slope_aspect_horn(data, res_m=1.0, nodata=nodata)
        tri_1m = compute_terrain_ruggedness_index(data, nodata=nodata)
        relief_1m = compute_local_relief(data, size=5, nodata=nodata)
        roughness_1m = compute_surface_roughness(data, size=5, nodata=nodata)
        prof_c, plan_c, mean_c = compute_curvatures(data, res_m=1.0, nodata=nodata)
        vrm_1m = compute_vector_ruggedness_measure(slope_1m, aspect_1m, size=5, nodata=nodata)

        valid_slope = slope_1m[valid_mask & (slope_1m != nodata)]
        valid_tri = tri_1m[valid_mask & (tri_1m != nodata)]
        valid_relief = relief_1m[valid_mask & (relief_1m != nodata)]
        valid_roughness = roughness_1m[valid_mask & (roughness_1m != nodata)]
        valid_vrm = vrm_1m[valid_mask & (vrm_1m != nodata)]

        # Extract transects across the center of window (West-to-East and South-to-North)
        mid_row = data.shape[0] // 2
        mid_col = data.shape[1] // 2

        we_transect = [
            round(float(z), 2) if (z != nodata and not np.isnan(z)) else None
            for z in data[mid_row, :]
        ]
        sn_transect = [
            round(float(z), 2) if (z != nodata and not np.isnan(z)) else None
            for z in data[:, mid_col]
        ]

        # Candidate boulder extraction in micro-window
        # Normalize local elevation to 0-255 proxy for morphological obstacle identification
        elev_span = max(1.0, max_elev - min_elev)
        proxy_img = np.clip((data - min_elev) / elev_span * 255.0, 0, 255).astype(np.uint8)
        _, boulder_mask, bld_stats = detect_boulder_candidates_advanced(
            imagery=proxy_img,
            tri=tri_1m,
            nodata_mask=valid_mask,
            sun_azimuth_deg=240.0,
            res_m=1.0,
        )
        boulder_objects = extract_boulder_objects(
            candidate_mask=boulder_mask,
            score_map=tri_1m,
            res_m=1.0,
            min_pixels=2,
            max_pixels=100,
            max_objects=25,
        )

        return {
            "is_available": True,
            "window_radius_m": float(radius_m),
            "window_size_pixels": [int(data.shape[0]), int(data.shape[1])],
            "native_resolution_m": 1.0,
            "elevation": {
                "center_m": round(center_elev, 2),
                "min_m": round(min_elev, 2),
                "max_m": round(max_elev, 2),
                "mean_m": round(mean_elev, 2),
                "local_relief_m": round(max_elev - min_elev, 2),
            },
            "metrics_1m": {
                "slope_deg": {
                    "mean": round(float(np.mean(valid_slope)), 2) if len(valid_slope) > 0 else None,
                    "max": round(float(np.max(valid_slope)), 2) if len(valid_slope) > 0 else None,
                    "p90": round(float(np.percentile(valid_slope, 90)), 2)
                    if len(valid_slope) > 0
                    else None,
                },
                "tri_roughness_m": {
                    "mean": round(float(np.mean(valid_tri)), 3) if len(valid_tri) > 0 else None,
                    "max": round(float(np.max(valid_tri)), 3) if len(valid_tri) > 0 else None,
                },
                "surface_roughness_m": {
                    "mean": round(float(np.mean(valid_roughness)), 3)
                    if len(valid_roughness) > 0
                    else None,
                },
                "local_relief_m": {
                    "mean": round(float(np.mean(valid_relief)), 2)
                    if len(valid_relief) > 0
                    else None,
                },
                "vector_ruggedness_measure": {
                    "mean": round(float(np.mean(valid_vrm)), 4) if len(valid_vrm) > 0 else None,
                },
                "curvatures_1_per_m": {
                    "profile_mean": round(float(np.mean(prof_c[valid_mask])), 5),
                    "planform_mean": round(float(np.mean(plan_c[valid_mask])), 5),
                    "mean_curvature": round(float(np.mean(mean_c[valid_mask])), 5),
                },
            },
            "candidate_boulders": {
                "total_candidate_cells": bld_stats["candidate_count_pixels"],
                "discrete_objects_found": len(boulder_objects),
                "top_candidates": boulder_objects[:10],
            },
            "transects_1m": {
                "west_to_east_elev_m": we_transect[
                    ::2
                ],  # Sample every 2m for concise JSON transport
                "south_to_north_elev_m": sn_transect[::2],
                "sample_step_m": 2.0,
            },
            "epistemic": {
                "elevation": "OBSERVED (HiRISE DTM 1.0m)",
                "derivatives": (
                    "DERIVED (Horn / Riley / Zevenbergen-Thorne / Sappington at 1.0m post spacing)"
                ),
                "boulders": "HEURISTIC (Morphological Top-Hat & Shadow Association)",
            },
        }

    def _read_pixel_safely(self, path: Path, col: int, row: int) -> float | None:
        """Helper to read single pixel from raster if exists."""
        if not path.exists():
            return None
        try:
            with rasterio.open(path) as src:
                val = float(src.read(1, window=rasterio.windows.Window(col, row, 1, 1))[0, 0])
                if val == src.nodata or np.isnan(val):
                    return None
                return val
        except Exception:
            return None

    def extract_transect_profile(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        num_samples: int = 100,
    ) -> dict[str, Any]:
        """Extract continuous elevation, slope, and terrain unit profile along a transect."""
        num_samples = max(10, min(num_samples, 500))

        # Sample points along geodesic line in Mars coordinates
        lats = np.linspace(start_lat, dest_lat, num_samples)
        lons = np.linspace(start_lon, dest_lon, num_samples)

        points = []
        cum_dist_m = 0.0
        prev_px: float | None = None
        prev_py: float | None = None

        elev_gain = 0.0
        elev_loss = 0.0
        prev_elev: float | None = None

        if not self.regional_elev_path.exists():
            raise FileNotFoundError("Elevation raster not found")

        with (
            rasterio.open(self.regional_elev_path) as src_elev,
            rasterio.open(self.regional_slope_path) as src_slope,
            rasterio.open(self.regional_classes_path) as src_class,
        ):
            for i in range(num_samples):
                lat = float(lats[i])
                lon = float(lons[i])
                px, py = self.crs.to_projected(lon, lat)

                if prev_px is not None and prev_py is not None:
                    step_dist = float(np.hypot(px - prev_px, py - prev_py))
                    cum_dist_m += step_dist
                prev_px, prev_py = px, py

                # Query regional values
                row, col = src_elev.index(px, py)
                elev_val: float | None = None
                slope_val: float | None = None
                class_id: int | None = None
                class_name = "Unknown Terrain"

                if 0 <= row < src_elev.height and 0 <= col < src_elev.width:
                    w = rasterio.windows.Window(col, row, 1, 1)
                    e = float(src_elev.read(1, window=w)[0, 0])
                    s = float(src_slope.read(1, window=w)[0, 0])
                    c = int(src_class.read(1, window=w)[0, 0])

                    if e != src_elev.nodata and not np.isnan(e):
                        elev_val = round(e, 2)
                        if prev_elev is not None:
                            diff = elev_val - prev_elev
                            if diff > 0:
                                elev_gain += diff
                            else:
                                elev_loss += abs(diff)
                        prev_elev = elev_val

                    if s != src_slope.nodata and not np.isnan(s):
                        slope_val = round(s, 2)

                    if c in TERRAIN_CLASS_DETAILS:
                        class_id = c
                        class_name = TERRAIN_CLASS_DETAILS[c]["name"]

                has_hirise = self.has_high_resolution_coverage(lat, lon)

                points.append(
                    {
                        "sample_index": i,
                        "distance_m": round(cum_dist_m, 1),
                        "distance_km": round(cum_dist_m / 1000.0, 3),
                        "lat": round(lat, 5),
                        "lon": round(lon, 5),
                        "elevation_m": elev_val,
                        "slope_deg": slope_val,
                        "terrain_class_id": class_id,
                        "terrain_class_name": class_name,
                        "has_hirise_coverage": has_hirise,
                    }
                )

        valid_elevs = [p["elevation_m"] for p in points if p["elevation_m"] is not None]
        valid_slopes = [p["slope_deg"] for p in points if p["slope_deg"] is not None]

        return {
            "transect_summary": {
                "start": {"lat": start_lat, "lon": start_lon},
                "destination": {"lat": dest_lat, "lon": dest_lon},
                "total_distance_m": round(cum_dist_m, 1),
                "total_distance_km": round(cum_dist_m / 1000.0, 3),
                "elevation_gain_m": round(elev_gain, 1),
                "elevation_loss_m": round(elev_loss, 1),
                "min_elevation_m": min(valid_elevs) if valid_elevs else None,
                "max_elevation_m": max(valid_elevs) if valid_elevs else None,
                "max_slope_deg": max(valid_slopes) if valid_slopes else None,
                "mean_slope_deg": round(float(np.mean(valid_slopes)), 2) if valid_slopes else None,
                "hirise_fraction": round(
                    sum(1 for p in points if p["has_hirise_coverage"]) / num_samples, 3
                ),
            },
            "points": points,
            "datum": "Mars Areoid (MOLA)",
            "crs": "IAU_2015:49900",
            "epistemic_class": "DERIVED",
        }


_default_inspector: MultiResolutionTerrainInspector | None = None


def get_multi_res_inspector() -> MultiResolutionTerrainInspector:
    """Return singleton instance of MultiResolutionTerrainInspector."""
    global _default_inspector
    if _default_inspector is None:
        _default_inspector = MultiResolutionTerrainInspector()
    return _default_inspector
