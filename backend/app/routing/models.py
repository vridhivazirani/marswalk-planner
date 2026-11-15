"""Domain models and serialization for the Marswalk Route Optimization Engine."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
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
    uncertainty_m: float | None
    science_opportunity: float
    data_confidence: float | None = None
    detection_confidence: float | None = None
    resolution_class: str = "UNKNOWN"

    def to_dict(self) -> dict[str, Any]:
        """Convert waypoint to JSON dictionary."""
        d = asdict(self)
        d["data_reliability_index"] = self.data_confidence
        d["detection_reliability_index"] = self.detection_confidence
        d["nominal_vertical_precision_m"] = self.uncertainty_m
        return d


@dataclass(frozen=True)
class RouteMetrics:
    """Quantitative performance and risk metrics evaluated along the planned route."""

    total_distance_m: float
    accumulated_cost: float
    estimated_duration_minutes: float
    mean_hazard_exposure: float
    mean_uncertainty_exposure: float | None
    accumulated_science_opportunity: float
    mean_science_opportunity: float
    restricted_cells_crossed: int
    unknown_cells_crossed: int
    mean_data_confidence: float | None = None
    mean_detection_confidence: float | None = None
    max_uncertainty_m: float | None = None
    p95_uncertainty_m: float | None = None
    resolution_uncertainty_distance_m: float = 0.0
    resolution_uncertainty_fraction: float = 0.0
    unknown_terrain_distance_m: float = 0.0
    unknown_terrain_fraction: float = 0.0
    terrain_characterization: str = "UNKNOWN"
    hazard_classification: str = "UNKNOWN"
    observation_reliability_tier: str = "UNKNOWN"
    uncertainty_precision_status: str = "PROVISIONAL_UNVERIFIED_NOMINAL_TIER"
    metric_averaging_method: str = "ARC_LENGTH_WEIGHTED_TRAPEZOIDAL"
    uncertainty_explanation: str = (
        "Observation reliability metrics unavailable; verify underlying terrain coverage."
    )
    visited_target_ids: list[str] = field(default_factory=list)
    scientific_targets_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert metrics to JSON dictionary."""

        def _r(val: float | None, digits: int) -> float | None:
            return round(val, digits) if val is not None else None

        mean_unc = _r(self.mean_uncertainty_exposure, 4)
        max_unc = _r(self.max_uncertainty_m, 4)
        p95_unc = _r(self.p95_uncertainty_m, 4)
        mean_data = _r(self.mean_data_confidence, 4)
        mean_det = _r(self.mean_detection_confidence, 4)

        return {
            "total_distance_m": round(self.total_distance_m, 2),
            "accumulated_cost": round(self.accumulated_cost, 2),
            "estimated_duration_minutes": round(self.estimated_duration_minutes, 1),
            "mean_hazard_exposure": round(self.mean_hazard_exposure, 4),
            "mean_uncertainty_exposure": mean_unc,
            "max_uncertainty_m": max_unc,
            "p95_uncertainty_m": p95_unc,
            "nominal_vertical_precision_mean_m": mean_unc,
            "nominal_vertical_precision_max_m": max_unc,
            "nominal_vertical_precision_p95_m": p95_unc,
            "accumulated_science_opportunity": round(self.accumulated_science_opportunity, 3),
            "mean_science_opportunity": round(self.mean_science_opportunity, 4),
            "restricted_cells_crossed": self.restricted_cells_crossed,
            "unknown_cells_crossed": self.unknown_cells_crossed,
            "mean_data_confidence": mean_data,
            "mean_detection_confidence": mean_det,
            "mean_data_reliability_index": mean_data,
            "mean_detection_reliability_index": mean_det,
            "resolution_uncertainty_distance_m": round(self.resolution_uncertainty_distance_m, 2),
            "resolution_uncertainty_fraction": round(self.resolution_uncertainty_fraction, 4),
            "unknown_terrain_distance_m": round(self.unknown_terrain_distance_m, 2),
            "unknown_terrain_fraction": round(self.unknown_terrain_fraction, 4),
            "terrain_characterization": self.terrain_characterization,
            "hazard_classification": self.hazard_classification,
            "observation_reliability_tier": self.observation_reliability_tier,
            "uncertainty_precision_status": self.uncertainty_precision_status,
            "metric_averaging_method": self.metric_averaging_method,
            "uncertainty_explanation": self.uncertainty_explanation,
            "visited_target_ids": list(self.visited_target_ids),
            "scientific_targets_count": self.scientific_targets_count,
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
