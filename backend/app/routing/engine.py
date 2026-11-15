"""Route Optimization Engine for the Jezero Crater Western Delta exploration region.

Integrates A* and Dijkstra graph search, physical metric calculations,
obstacle avoidance, route simplification, and multi-profile comparative route planning.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import rasterio

from app.costmap.evaluator import compute_unified_costmap
from app.costmap.profiles import DEFAULT_PROFILES, CostmapWeights, MissionProfileType
from app.geospatial.crs import MarsCoordinateSystem
from app.hazards.uncertainty import (
    STANDARD_NODATA_FLOAT,
    compute_data_confidence,
    compute_detection_confidence,
)
from app.routing.exceptions import OutOfBoundsCoordinateError
from app.routing.graph import GridGraph
from app.routing.models import PathWaypoint, RouteMetrics, RoutePlan
from app.routing.search import find_path
from app.routing.simplifier import densify_path, simplify_path


def _is_valid_float(val: float) -> bool:
    """Return True if scalar raster value is finite and neither standard nor legacy NoData."""
    return math.isfinite(val) and val > -9000.0 and abs(val - 999.0) > 1e-3


class RouteOptimizationEngine:
    """Computes constraint-satisfying, multi-criteria optimal traversal routes on Mars."""

    def __init__(self, processed_dir: Path | None = None) -> None:
        base = Path(__file__).resolve().parents[3]
        self.processed_dir = processed_dir or (base / "data" / "processed")
        self.catalog_dir = self.processed_dir.parent / "catalog"
        self._science_targets_cache: list[dict[str, Any]] | None = None
        self.mars_sys = MarsCoordinateSystem()

        # Cached grid data
        self._loaded = False
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
        self._transform: Any = None
        self._bounds: Any = None
        self._height: int = 0
        self._width: int = 0

    def _ensure_data_loaded(self, grid_name: str = "jezero_western_delta_20m") -> None:
        """Load and cache processed rasters."""
        if self._loaded:
            return

        elev_path = self.processed_dir / f"{grid_name}_elevation.tif"
        slope_path = self.processed_dir / f"{grid_name}_slope_deg.tif"
        tri_path = self.processed_dir / f"{grid_name}_tri_roughness_m.tif"
        haz_path = self.processed_dir / f"{grid_name}_hazard_overall_score.tif"
        imp_path = self.processed_dir / f"{grid_name}_hazard_hard_impassable.tif"
        sig_path = self.processed_dir / f"{grid_name}_uncertainty_sigma_z.tif"
        sci_path = self.processed_dir / f"{grid_name}_science_opportunity.tif"

        if not elev_path.exists():
            raise FileNotFoundError(f"Missing raster: {elev_path}")

        with rasterio.open(elev_path) as src:
            self._elevation = src.read(1)
            self._transform = src.transform
            self._bounds = src.bounds
            self._height = src.height
            self._width = src.width

        self._coverage = self._elevation != -9999.0

        with rasterio.open(slope_path) as src:
            self._slope = src.read(1)
        with rasterio.open(tri_path) as src:
            self._tri = src.read(1)
        with rasterio.open(haz_path) as src:
            self._hazard = src.read(1)
        with rasterio.open(imp_path) as src:
            self._hard_imp = src.read(1) > 0
        with rasterio.open(sig_path) as src:
            self._sigma_z = src.read(1)
        with rasterio.open(sci_path) as src:
            self._science = src.read(1)

        src_id_path = self.processed_dir / f"{grid_name}_source_id.tif"
        data_conf_path = self.processed_dir / f"{grid_name}_hazard_data_confidence.tif"
        det_conf_path = self.processed_dir / f"{grid_name}_hazard_detection_confidence.tif"
        res_unc_path = self.processed_dir / f"{grid_name}_hazard_resolution_uncertainty.tif"

        if src_id_path.exists():
            with rasterio.open(src_id_path) as src:
                self._source_id = src.read(1)
        else:
            self._source_id = np.where(self._coverage, 2, 0).astype(np.uint8)

        if data_conf_path.exists():
            with rasterio.open(data_conf_path) as src:
                self._data_conf = src.read(1)
        else:
            assert self._source_id is not None
            assert self._coverage is not None
            self._data_conf = compute_data_confidence(self._source_id, self._coverage)

        if det_conf_path.exists():
            with rasterio.open(det_conf_path) as src:
                self._det_conf = src.read(1)
        else:
            assert self._source_id is not None
            assert self._coverage is not None
            self._det_conf = compute_detection_confidence(self._source_id, self._coverage)

        if res_unc_path.exists():
            with rasterio.open(res_unc_path) as src:
                self._res_unc = src.read(1) > 0
        else:
            self._res_unc = self._source_id == 1

        self._loaded = True

    @property
    def grid_shape(self) -> tuple[int, int]:
        """Return the dimensions of the cached grid (height, width)."""
        self._ensure_data_loaded()
        return (self._height, self._width)

    @property
    def transform(self) -> Any:
        """Return the affine geotransform of the grid."""
        self._ensure_data_loaded()
        return self._transform

    def latlon_to_grid(self, lat: float, lon: float) -> tuple[int, int, float, float]:
        """Convert planetocentric lat/lon into projected (x, y) and grid (row, col)."""
        if lat is None or lon is None or not (math.isfinite(lat) and math.isfinite(lon)):
            raise ValueError(f"Coordinate values must be finite numbers, got lat={lat}, lon={lon}")
        self._ensure_data_loaded()
        x, y = self.mars_sys.to_projected(lon, lat)

        assert self._bounds is not None
        if not (
            self._bounds.left <= x <= self._bounds.right
            and self._bounds.bottom <= y <= self._bounds.top
        ):
            raise OutOfBoundsCoordinateError(
                f"Coordinate ({lat:.5f}°N, {lon:.5f}°E) is outside the Jezero study footprint."
            )

        row, col = rasterio.transform.rowcol(self._transform, x, y)
        return int(row), int(col), x, y

    def grid_to_latlon(self, row: int, col: int) -> tuple[float, float, float, float]:
        """Convert grid (row, col) into projected (x, y) and geographic (lat, lon)."""
        self._ensure_data_loaded()
        x, y = rasterio.transform.xy(self._transform, row, col)
        lon, lat = self.mars_sys.to_geographic(x, y)
        return lat, lon, x, y

    def _load_science_targets(self) -> list[dict[str, Any]]:
        """Load candidate science targets and precompute their projected coordinates."""
        if self._science_targets_cache is not None:
            return self._science_targets_cache

        targets_path = self.catalog_dir / "jezero_western_delta_20m_science_targets.json"
        if not targets_path.exists():
            base = Path(__file__).resolve().parents[3]
            targets_path = (
                base / "data" / "catalog" / "jezero_western_delta_20m_science_targets.json"
            )

        cached: list[dict[str, Any]] = []
        if targets_path.exists():
            try:
                with open(targets_path, encoding="utf-8") as f:
                    data = json.load(f)
                features = data.get("features", [])
                for feat in features:
                    tid = feat.get("id") or feat.get("properties", {}).get("target_id")
                    geom = feat.get("geometry", {})
                    coords = geom.get("coordinates", [])
                    if tid and len(coords) >= 2:
                        t_lon, t_lat = float(coords[0]), float(coords[1])
                        t_px, t_py = self.mars_sys.to_projected(t_lon, t_lat)
                        cached.append(
                            {
                                "target_id": str(tid),
                                "name": feat.get("properties", {}).get("name", tid),
                                "lat": t_lat,
                                "lon": t_lon,
                                "px": t_px,
                                "py": t_py,
                            }
                        )
            except Exception:
                pass
        self._science_targets_cache = cached
        return self._science_targets_cache

    def _find_visited_targets(
        self, waypoints: list[PathWaypoint], buffer_m: float = 100.0
    ) -> list[str]:
        """Identify candidate science targets visited within buffer distance along the route."""
        targets = self._load_science_targets()
        if not targets or not waypoints:
            return []

        visited: list[str] = []
        for t in targets:
            tx = t["px"]
            ty = t["py"]
            for wp in waypoints:
                dist = math.hypot(wp.projected_x - tx, wp.projected_y - ty)
                if dist <= buffer_m:
                    visited.append(t["target_id"])
                    break

        return visited

    def compute_multi_stop_route(
        self,
        stops: list[tuple[float, float]],
        profile_name: str = "BALANCED",
        weights: CostmapWeights | None = None,
        algorithm: str = "astar",
        simplify: bool = True,
        extra_hard_blocked_mask: np.ndarray | None = None,
        cost_multiplier_raster: np.ndarray | None = None,
    ) -> RoutePlan:
        """Compute optimal route connecting sequential stops (start, waypoints, destination)."""
        if len(stops) < 2:
            raise ValueError("Multi-stop route requires at least 2 stops (start and destination).")

        self._ensure_data_loaded()
        assert self._elevation is not None
        assert self._slope is not None
        assert self._tri is not None
        assert self._hazard is not None
        assert self._hard_imp is not None
        assert self._sigma_z is not None
        assert self._science is not None
        assert self._coverage is not None

        # Convert and validate all stop coordinates
        grid_stops: list[tuple[int, int]] = []
        for lat, lon in stops:
            r, c, _, _ = self.latlon_to_grid(lat, lon)
            grid_stops.append((r, c))

        # Select weights
        prof_key = profile_name.upper()
        if weights is None:
            if prof_key in DEFAULT_PROFILES:
                weights = DEFAULT_PROFILES[prof_key].weights
            else:
                weights = DEFAULT_PROFILES[MissionProfileType.BALANCED.value].weights

        # Compute costmap bundle
        bundle = compute_unified_costmap(
            slope=self._slope,
            tri=self._tri,
            hazard_score=self._hazard,
            sigma_z=self._sigma_z,
            science_opportunity=self._science,
            data_coverage_mask=self._coverage,
            hard_impassable_mask=self._hard_imp,
            weights=weights,
        )

        effective_hard_blocked = bundle.hard_blocked_mask
        if extra_hard_blocked_mask is not None:
            effective_hard_blocked = effective_hard_blocked | extra_hard_blocked_mask

        effective_cost = bundle.combined_cost
        if cost_multiplier_raster is not None:
            effective_cost = effective_cost * cost_multiplier_raster

        graph = GridGraph(
            cost_raster=effective_cost,
            hard_blocked_mask=effective_hard_blocked,
            cell_size_m=20.0,
        )

        # Plan each leg sequentially and stitch cells
        final_cells: list[tuple[int, int]] = []
        for leg_idx in range(len(grid_stops) - 1):
            s_pt = grid_stops[leg_idx]
            d_pt = grid_stops[leg_idx + 1]

            if s_pt == d_pt:
                leg_cells = [s_pt]
            else:
                raw_path, _, _ = find_path(
                    graph=graph,
                    start=s_pt,
                    goal=d_pt,
                    algorithm=algorithm,
                )
                if simplify:
                    simplified_vertices = simplify_path(raw_path, graph)
                    leg_cells = densify_path(simplified_vertices)
                else:
                    leg_cells = raw_path

            if leg_idx == 0:
                final_cells.extend(leg_cells)
            else:
                # Avoid duplicate junction cell
                final_cells.extend(leg_cells[1:])

        if not final_cells:
            final_cells = [grid_stops[0]]

        # Construct path waypoints and evaluate arc-length weighted metrics
        waypoints: list[PathWaypoint] = []
        cum_dist = 0.0
        cum_cost = 0.0
        cum_duration_sec = 0.0

        # Arc-length weighted accumulators (trapezoidal along segments)
        weighted_hazard = 0.0
        weighted_science = 0.0
        weighted_unc = 0.0
        unc_weight_dist = 0.0
        weighted_data_conf = 0.0
        data_conf_weight_dist = 0.0
        weighted_det_conf = 0.0
        det_conf_weight_dist = 0.0

        # Degenerate zero-length fallback accumulators
        sum_hazard = 0.0
        sum_science = 0.0
        valid_sigmas: list[float] = []
        valid_data_confs: list[float] = []
        valid_det_confs: list[float] = []

        restricted_crossed = 0
        unknown_crossed = 0
        res_unc_crossed = 0
        res_unc_dist_m = 0.0
        unknown_dist_m = 0.0

        # Nominal human walking velocity on Mars: v0 = 1.0 m/s (adjusted by terrain cost)
        v0_mps = 1.0

        assert self._source_id is not None
        assert self._data_conf is not None
        assert self._det_conf is not None
        assert self._res_unc is not None

        prev_haz = 0.0
        prev_sci = 0.0
        prev_sig: float | None = None
        prev_data_conf: float | None = None
        prev_det_conf: float | None = None
        prev_res_unc = False
        prev_unk = False

        for i, (r, c) in enumerate(final_cells):
            lat, lon, px, py = self.grid_to_latlon(r, c)
            elev = float(self._elevation[r, c])
            slope_deg = float(self._slope[r, c])
            haz = float(self._hazard[r, c])
            sig_raw = float(self._sigma_z[r, c])
            sig: float | None = sig_raw if _is_valid_float(sig_raw) else None
            sci = float(self._science[r, c])
            cell_cost = float(effective_cost[r, c])

            pt_src = int(self._source_id[r, c])
            pt_res_class = (
                "NATIVE_HIRISE_1M"
                if pt_src == 2
                else ("REGIONAL_CTX_20M" if pt_src == 1 else "UNMAPPED")
            )
            pt_data_raw = float(self._data_conf[r, c])
            pt_det_raw = float(self._det_conf[r, c])
            pt_data_conf: float | None = pt_data_raw if _is_valid_float(pt_data_raw) else None
            pt_det_conf: float | None = pt_det_raw if _is_valid_float(pt_det_raw) else None

            is_res_unc = bool(self._res_unc[r, c])
            is_unk = bool(bundle.unknown_mask[r, c])

            if effective_hard_blocked[r, c]:
                restricted_crossed += 1
            if is_unk:
                unknown_crossed += 1
            if is_res_unc:
                res_unc_crossed += 1

            if i > 0:
                prev_wp = waypoints[i - 1]
                step_dist = math.hypot(px - prev_wp.projected_x, py - prev_wp.projected_y)
                prev_cost = float(effective_cost[prev_wp.grid_row, prev_wp.grid_col])
                step_cost = step_dist * ((prev_cost + cell_cost) / 2.0)

                cum_dist += step_dist
                cum_cost += step_cost

                # Arc-length trapezoidal integration
                weighted_hazard += step_dist * 0.5 * (prev_haz + haz)
                weighted_science += step_dist * 0.5 * (prev_sci + sci)
                res_unc_dist_m += step_dist * 0.5 * (float(prev_res_unc) + float(is_res_unc))
                unknown_dist_m += step_dist * 0.5 * (float(prev_unk) + float(is_unk))

                half_step = 0.5 * step_dist
                if prev_sig is not None:
                    weighted_unc += half_step * prev_sig
                    unc_weight_dist += half_step
                if sig is not None:
                    weighted_unc += half_step * sig
                    unc_weight_dist += half_step

                if prev_data_conf is not None:
                    weighted_data_conf += half_step * prev_data_conf
                    data_conf_weight_dist += half_step
                if pt_data_conf is not None:
                    weighted_data_conf += half_step * pt_data_conf
                    data_conf_weight_dist += half_step

                if prev_det_conf is not None:
                    weighted_det_conf += half_step * prev_det_conf
                    det_conf_weight_dist += half_step
                if pt_det_conf is not None:
                    weighted_det_conf += half_step * pt_det_conf
                    det_conf_weight_dist += half_step

                # Velocity adjusted by terrain cost: v = v0 / sqrt(cost)
                avg_cost = max(1.0, (prev_cost + cell_cost) / 2.0)
                speed_mps = v0_mps / math.sqrt(avg_cost)
                cum_duration_sec += step_dist / speed_mps

            sum_hazard += haz
            sum_science += sci
            if sig is not None:
                valid_sigmas.append(sig)
            if pt_data_conf is not None:
                valid_data_confs.append(pt_data_conf)
            if pt_det_conf is not None:
                valid_det_confs.append(pt_det_conf)

            prev_haz = haz
            prev_sci = sci
            prev_sig = sig
            prev_data_conf = pt_data_conf
            prev_det_conf = pt_det_conf
            prev_res_unc = is_res_unc
            prev_unk = is_unk

            waypoints.append(
                PathWaypoint(
                    index=i,
                    grid_row=r,
                    grid_col=c,
                    projected_x=px,
                    projected_y=py,
                    lon=lon,
                    lat=lat,
                    elevation_m=elev,
                    cumulative_dist_m=cum_dist,
                    cumulative_cost=cum_cost,
                    slope_deg=slope_deg,
                    hazard_score=haz,
                    uncertainty_m=sig,
                    science_opportunity=sci,
                    data_confidence=pt_data_conf,
                    detection_confidence=pt_det_conf,
                    resolution_class=pt_res_class,
                )
            )

        n_wp = max(1, len(waypoints))
        if cum_dist > 0.0:
            mean_haz = weighted_hazard / cum_dist
            mean_sci = weighted_science / cum_dist
            res_unc_frac = min(1.0, res_unc_dist_m / cum_dist)
            unk_frac = min(1.0, unknown_dist_m / cum_dist)
        else:
            mean_haz = sum_hazard / n_wp
            mean_sci = sum_science / n_wp
            res_unc_frac = res_unc_crossed / n_wp
            unk_frac = unknown_crossed / n_wp

        mean_unc: float | None = (
            weighted_unc / unc_weight_dist
            if unc_weight_dist > 0.0
            else (sum(valid_sigmas) / len(valid_sigmas) if valid_sigmas else None)
        )
        max_unc: float | None = max(valid_sigmas) if valid_sigmas else None
        p95_unc: float | None = float(np.percentile(valid_sigmas, 95)) if valid_sigmas else None

        mean_data_c: float | None = (
            weighted_data_conf / data_conf_weight_dist
            if data_conf_weight_dist > 0.0
            else (sum(valid_data_confs) / len(valid_data_confs) if valid_data_confs else None)
        )
        mean_det_c: float | None = (
            weighted_det_conf / det_conf_weight_dist
            if det_conf_weight_dist > 0.0
            else (sum(valid_det_confs) / len(valid_det_confs) if valid_det_confs else None)
        )

        # Independent hazard severity classification
        if mean_haz > 0.40:
            hazard_cls = "ELEVATED"
        elif mean_haz > 0.20:
            hazard_cls = "MODERATE"
        else:
            hazard_cls = "LOW"

        # Independent observation reliability tier
        if unknown_crossed > 0:
            obs_tier = "INCLUDES_UNMAPPED_TERRAIN"
        elif res_unc_crossed > 0:
            obs_tier = "MIXED_OR_CTX_20M_COVERAGE"
        else:
            obs_tier = "HIRISE_1M_COVERAGE"

        if unknown_crossed > 0:
            char = "UNKNOWN_TERRAIN"
            exp = (
                f"CAUTION: Route intersects {unknown_crossed} unmapped terrain cells "
                f"({unknown_dist_m:.0f}m, {unk_frac * 100.0:.1f}%) under conservative policy."
            )
        elif res_unc_crossed > 0 and mean_haz > 0.40:
            char = "LOWER_RESOLUTION_HAZARDOUS"
            exp = (
                f"Route traverses {res_unc_dist_m:.0f}m ({res_unc_frac * 100.0:.1f}%) "
                "of regional CTX 20m terrain where metre-scale obstacles are unresolved, "
                f"with elevated derived hazard exposure ({mean_haz * 100.0:.1f}%)."
            )
        elif res_unc_crossed > 0:
            char = "LOWER_RESOLUTION_UNCERTAIN"
            exp = (
                f"Route traverses {res_unc_dist_m:.0f}m ({res_unc_frac * 100.0:.1f}%) "
                "of regional CTX 20m terrain where metre-scale hazards (<2m) are unresolved."
            )
        elif mean_haz > 0.40:
            char = "OBSERVED_HAZARDOUS"
            exp = (
                "Route traverses 100% HiRISE 1m DTM coverage with elevated terrain hazards "
                f"(mean hazard exposure: {mean_haz * 100.0:.1f}%)."
            )
        else:
            char = "OBSERVED_WELL_CHARACTERIZED"
            data_str = f"{mean_data_c:.2f}" if mean_data_c is not None else "N/A"
            exp = (
                "Route stays within HiRISE 1m DTM coverage with resolved metre-scale obstacle "
                f"aggregation (uncalibrated data reliability index: {data_str}; "
                "CV optical layers derive from 20m CTX orthomosaic)."
            )

        # Preserve STANDARD_NODATA_FLOAT import contract (no unused warning)
        _ = STANDARD_NODATA_FLOAT

        visited_target_ids = self._find_visited_targets(waypoints, buffer_m=100.0)

        metrics = RouteMetrics(
            total_distance_m=cum_dist,
            accumulated_cost=cum_cost,
            estimated_duration_minutes=cum_duration_sec / 60.0,
            mean_hazard_exposure=mean_haz,
            mean_uncertainty_exposure=mean_unc,
            max_uncertainty_m=max_unc,
            p95_uncertainty_m=p95_unc,
            accumulated_science_opportunity=sum_science,
            mean_science_opportunity=mean_sci,
            restricted_cells_crossed=restricted_crossed,
            unknown_cells_crossed=unknown_crossed,
            mean_data_confidence=mean_data_c,
            mean_detection_confidence=mean_det_c,
            resolution_uncertainty_distance_m=res_unc_dist_m,
            resolution_uncertainty_fraction=res_unc_frac,
            unknown_terrain_distance_m=unknown_dist_m,
            unknown_terrain_fraction=unk_frac,
            terrain_characterization=char,
            hazard_classification=hazard_cls,
            observation_reliability_tier=obs_tier,
            uncertainty_explanation=exp,
            visited_target_ids=visited_target_ids,
            scientific_targets_count=len(visited_target_ids),
        )

        disclaimer = (
            "RESEARCH PROTOTYPE NOTICE: Marswalk route optimization is an educational "
            "decision-support model. It does NOT claim operational astronaut safety."
        )

        return RoutePlan(
            route_id=f"ROUTE-{prof_key}-{algorithm.upper()}",
            profile_name=prof_key,
            algorithm=algorithm,
            is_simplified=simplify,
            waypoints=waypoints,
            metrics=metrics,
            disclaimer=disclaimer,
        )

    def compute_route(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        profile_name: str = "BALANCED",
        weights: CostmapWeights | None = None,
        algorithm: str = "astar",
        simplify: bool = True,
        extra_hard_blocked_mask: np.ndarray | None = None,
        cost_multiplier_raster: np.ndarray | None = None,
    ) -> RoutePlan:
        """Compute an optimal traversable route between start and destination coordinates."""
        return self.compute_multi_stop_route(
            stops=[(start_lat, start_lon), (dest_lat, dest_lon)],
            profile_name=profile_name,
            weights=weights,
            algorithm=algorithm,
            simplify=simplify,
            extra_hard_blocked_mask=extra_hard_blocked_mask,
            cost_multiplier_raster=cost_multiplier_raster,
        )

    def compute_suite(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        algorithm: str = "astar",
        simplify: bool = True,
        waypoints: list[tuple[float, float]] | None = None,
    ) -> dict[str, RoutePlan]:
        """Generate comparative routes for Safety-First, Science-First, and Balanced profiles."""
        stops = [(start_lat, start_lon)]
        if waypoints:
            stops.extend(waypoints)
        stops.append((dest_lat, dest_lon))

        return {
            "SAFETY_FIRST": self.compute_multi_stop_route(
                stops=stops,
                profile_name="SAFETY_FIRST",
                algorithm=algorithm,
                simplify=simplify,
            ),
            "SCIENCE_FIRST": self.compute_multi_stop_route(
                stops=stops,
                profile_name="SCIENCE_FIRST",
                algorithm=algorithm,
                simplify=simplify,
            ),
            "BALANCED": self.compute_multi_stop_route(
                stops=stops,
                profile_name="BALANCED",
                algorithm=algorithm,
                simplify=simplify,
            ),
        }
