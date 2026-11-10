"""Domain models and serialization for the Marswalk Route Optimization Engine."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from app.geospatial.crs import MARS_GEOGRAPHIC_CRS_URN


@dataclass(frozen=True)
class PathWaypoint:
    """A spatial waypoint along a planned extravehicular traversal route."""

    index: int
    grid_row: int
    grid_col: int
    projected_x: float
    projected_y: float
    lon: float  # Planetocentric East-Positive degrees
    lat: float  # Planetocentric East-Positive degrees
    elevation_m: float
    cumulative_dist_m: float
    cumulative_cost: float
    slope_deg: float
    hazard_score: float
    uncertainty_m: float
    science_opportunity: float

    def to_dict(self) -> dict[str, Any]:
        """Convert waypoint to JSON dictionary."""
        return asdict(self)


@dataclass(frozen=True)
class RouteMetrics:
    """Quantitative performance and risk metrics evaluated along the planned route."""

    total_distance_m: float
    accumulated_cost: float
    estimated_duration_minutes: float
    mean_hazard_exposure: float
    mean_uncertainty_exposure: float
    accumulated_science_opportunity: float
    mean_science_opportunity: float
    restricted_cells_crossed: int
    unknown_cells_crossed: int

    def to_dict(self) -> dict[str, Any]:
        """Convert metrics to JSON dictionary."""
        return {
            "total_distance_m": round(self.total_distance_m, 2),
            "accumulated_cost": round(self.accumulated_cost, 2),
            "estimated_duration_minutes": round(self.estimated_duration_minutes, 1),
            "mean_hazard_exposure": round(self.mean_hazard_exposure, 4),
            "mean_uncertainty_exposure": round(self.mean_uncertainty_exposure, 4),
            "accumulated_science_opportunity": round(self.accumulated_science_opportunity, 3),
            "mean_science_opportunity": round(self.mean_science_opportunity, 4),
            "restricted_cells_crossed": self.restricted_cells_crossed,
            "unknown_cells_crossed": self.unknown_cells_crossed,
        }


@dataclass(frozen=True)
class RoutePlan:
    """A complete planned traversal path between start and destination coordinates."""

    route_id: str
    profile_name: str
    algorithm: str
    is_simplified: bool
    waypoints: list[PathWaypoint]
    metrics: RouteMetrics
    disclaimer: str

    def to_dict(self) -> dict[str, Any]:
        """Convert route plan to dictionary."""
        return {
            "route_id": self.route_id,
            "profile_name": self.profile_name,
            "algorithm": self.algorithm,
            "is_simplified": self.is_simplified,
            "metrics": self.metrics.to_dict(),
            "waypoint_count": len(self.waypoints),
            "disclaimer": self.disclaimer,
        }

    def to_geojson_feature(self) -> dict[str, Any]:
        """Serialize route plan to a GeoJSON LineString Feature."""
        coordinates = [
            [round(wp.lon, 6), round(wp.lat, 6), round(wp.elevation_m, 2)] for wp in self.waypoints
        ]
        return {
            "type": "Feature",
            "id": self.route_id,
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates,
            },
            "properties": {
                "route_id": self.route_id,
                "profile_name": self.profile_name,
                "algorithm": self.algorithm,
                "is_simplified": self.is_simplified,
                "crs": MARS_GEOGRAPHIC_CRS_URN,
                "metrics": self.metrics.to_dict(),
                "disclaimer": self.disclaimer,
            },
        }
