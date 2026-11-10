"""Route Optimization Engine for the Jezero Crater Western Delta exploration region.

Integrates A* and Dijkstra graph search, physical metric calculations,
obstacle avoidance, route simplification, and multi-profile comparative route planning.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import rasterio

from app.costmap.evaluator import compute_unified_costmap
from app.costmap.profiles import DEFAULT_PROFILES, CostmapWeights, MissionProfileType
from app.geospatial.crs import MarsCoordinateSystem
from app.routing.exceptions import OutOfBoundsCoordinateError
from app.routing.graph import GridGraph
from app.routing.models import PathWaypoint, RouteMetrics, RoutePlan
from app.routing.search import find_path
from app.routing.simplifier import densify_path, simplify_path


class RouteOptimizationEngine:
    """Computes constraint-satisfying, multi-criteria optimal traversal routes on Mars."""

    def __init__(self, processed_dir: Path | None = None) -> None:
        base = Path(__file__).resolve().parents[3]
        self.processed_dir = processed_dir or (base / "data" / "processed")
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
        self._ensure_data_loaded()
        assert self._elevation is not None
        assert self._slope is not None
        assert self._tri is not None
        assert self._hazard is not None
        assert self._hard_imp is not None
        assert self._sigma_z is not None
        assert self._science is not None
        assert self._coverage is not None

        # Convert coordinates
        s_row, s_col, _, _ = self.latlon_to_grid(start_lat, start_lon)
        d_row, d_col, _, _ = self.latlon_to_grid(dest_lat, dest_lon)

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

        # Execute path search
        raw_path, _, _ = find_path(
            graph=graph,
            start=(s_row, s_col),
            goal=(d_row, d_col),
            algorithm=algorithm,
        )

        # Simplify if requested
        if simplify:
            simplified_vertices = simplify_path(raw_path, graph)
            final_cells = densify_path(simplified_vertices)
        else:
            final_cells = raw_path

        # Construct path waypoints and evaluate metrics
        waypoints: list[PathWaypoint] = []
        cum_dist = 0.0
        cum_cost = 0.0
        cum_duration_sec = 0.0

        total_hazard = 0.0
        total_uncertainty = 0.0
        total_science = 0.0
        restricted_crossed = 0
        unknown_crossed = 0

        # Nominal human walking velocity on Mars: v0 = 1.0 m/s (adjusted by terrain cost)
        v0_mps = 1.0

        for i, (r, c) in enumerate(final_cells):
            lat, lon, px, py = self.grid_to_latlon(r, c)
            elev = float(self._elevation[r, c])
            slope_deg = float(self._slope[r, c])
            haz = float(self._hazard[r, c])
            sig = float(self._sigma_z[r, c])
            sci = float(self._science[r, c])
            cell_cost = float(effective_cost[r, c])

            if effective_hard_blocked[r, c]:
                restricted_crossed += 1
            if bundle.unknown_mask[r, c]:
                unknown_crossed += 1

            if i > 0:
                prev_wp = waypoints[i - 1]
                step_dist = math.hypot(px - prev_wp.projected_x, py - prev_wp.projected_y)
                prev_cost = float(effective_cost[prev_wp.grid_row, prev_wp.grid_col])
                step_cost = step_dist * ((prev_cost + cell_cost) / 2.0)

                cum_dist += step_dist
                cum_cost += step_cost

                # Velocity adjusted by terrain cost: v = v0 / sqrt(cost)
                avg_cost = max(1.0, (prev_cost + cell_cost) / 2.0)
                speed_mps = v0_mps / math.sqrt(avg_cost)
                cum_duration_sec += step_dist / speed_mps

            total_hazard += haz
            total_uncertainty += sig
            total_science += sci

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
                )
            )

        n_wp = max(1, len(waypoints))
        metrics = RouteMetrics(
            total_distance_m=cum_dist,
            accumulated_cost=cum_cost,
            estimated_duration_minutes=cum_duration_sec / 60.0,
            mean_hazard_exposure=total_hazard / n_wp,
            mean_uncertainty_exposure=total_uncertainty / n_wp,
            accumulated_science_opportunity=total_science,
            mean_science_opportunity=total_science / n_wp,
            restricted_cells_crossed=restricted_crossed,
            unknown_cells_crossed=unknown_crossed,
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

    def compute_suite(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        algorithm: str = "astar",
        simplify: bool = True,
    ) -> dict[str, RoutePlan]:
        """Generate comparative routes for Safety-First, Science-First, and Balanced profiles."""
        return {
            "SAFETY_FIRST": self.compute_route(
                start_lat,
                start_lon,
                dest_lat,
                dest_lon,
                profile_name="SAFETY_FIRST",
                algorithm=algorithm,
                simplify=simplify,
            ),
            "SCIENCE_FIRST": self.compute_route(
                start_lat,
                start_lon,
                dest_lat,
                dest_lon,
                profile_name="SCIENCE_FIRST",
                algorithm=algorithm,
                simplify=simplify,
            ),
            "BALANCED": self.compute_route(
                start_lat,
                start_lon,
                dest_lat,
                dest_lon,
                profile_name="BALANCED",
                algorithm=algorithm,
                simplify=simplify,
            ),
        }
