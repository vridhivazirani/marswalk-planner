"""Domain models and definitions for Marswalk Emergency Response and Dynamic Rerouting."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.core.epistemic import EpistemicClass
from app.routing.models import RoutePlan

EMERGENCY_DISCLAIMER = (
    "RESEARCH DECISION-SUPPORT PROTOTYPE ONLY. Marswalk emergency response and dynamic "
    "rerouting simulations are illustrative models. They do NOT certify, guarantee, or "
    "provide operational astronaut safety or life-support survival. Mars surface operations "
    "require human mission control, space agency flight rules, and qualified personnel."
)


class SimulatedHazardType(StrEnum):
    """Categorization of simulated in-situ surface hazards and operational contingencies."""

    NEW_BOULDER_FIELD = "NEW_BOULDER_FIELD"
    SAND_DUNE_RESTRICTION = "SAND_DUNE_RESTRICTION"
    SUDDEN_ROUTE_CLOSURE = "SUDDEN_ROUTE_CLOSURE"
    INCREASED_UNCERTAINTY = "INCREASED_UNCERTAINTY"
    DESTINATION_INACCESSIBLE = "DESTINATION_INACCESSIBLE"
    RETURN_TO_BASE = "RETURN_TO_BASE"


class HazardSeverity(StrEnum):
    """Severity classification of the simulated contingency."""

    CRITICAL = "CRITICAL"  # Complete path severance or immediate abort trigger
    HIGH = "HIGH"  # Severe traversability restriction or steep detour penalty
    MODERATE = "MODERATE"  # Elevated cost or localized caution zone


@dataclass(frozen=True)
class SimulatedHazardEvent:
    """A documented, non-random simulated hazard incident injected into the Martian environment."""

    event_id: str
    hazard_type: SimulatedHazardType
    title: str
    description: str
    center_lat: float
    center_lon: float
    radius_m: float
    is_hard_restriction: bool
    cost_multiplier: float
    severity: HazardSeverity = HazardSeverity.HIGH
    epistemic_class: str = EpistemicClass.SIMULATED.value
    created_at_ltst: str = "13:30 LTST"
    disclaimer: str = EMERGENCY_DISCLAIMER

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "hazard_type": self.hazard_type.value,
            "title": self.title,
            "description": self.description,
            "center_lat": round(self.center_lat, 6),
            "center_lon": round(self.center_lon, 6),
            "radius_m": round(self.radius_m, 1),
            "is_hard_restriction": self.is_hard_restriction,
            "cost_multiplier": round(self.cost_multiplier, 2),
            "severity": self.severity.value,
            "epistemic_class": self.epistemic_class,
            "created_at_ltst": self.created_at_ltst,
            "disclaimer": self.disclaimer,
        }


@dataclass(frozen=True)
class HazardImpactAssessment:
    """Evaluation of whether and how an active route intersects a simulated hazard."""

    is_route_affected: bool
    affected_waypoints_count: int
    total_waypoints_count: int
    first_affected_km: float | None = None
    last_affected_km: float | None = None
    affected_segment_length_m: float = 0.0
    destination_blocked: bool = False
    crew_in_hazard_zone: bool = False
    impact_summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_route_affected": self.is_route_affected,
            "affected_waypoints_count": self.affected_waypoints_count,
            "total_waypoints_count": self.total_waypoints_count,
            "first_affected_km": (
                round(self.first_affected_km, 3) if self.first_affected_km is not None else None
            ),
            "last_affected_km": (
                round(self.last_affected_km, 3) if self.last_affected_km is not None else None
            ),
            "affected_segment_length_m": round(self.affected_segment_length_m, 1),
            "destination_blocked": self.destination_blocked,
            "crew_in_hazard_zone": self.crew_in_hazard_zone,
            "impact_summary": self.impact_summary,
            "epistemic_class": EpistemicClass.SIMULATED.value,
        }


@dataclass(frozen=True)
class DynamicReroutePlan:
    """Comprehensive rerouting result comparing original and alternative routes."""

    event_id: str
    original_route: RoutePlan
    rerouted_route: RoutePlan | None
    is_feasible: bool
    is_return_to_base: bool
    crew_location: dict[str, float]
    hazard_event: SimulatedHazardEvent
    impact: HazardImpactAssessment
    reasoning: str
    distance_delta_m: float = 0.0
    duration_delta_minutes: float = 0.0
    cost_delta: float = 0.0
    hazard_exposure_delta: float = 0.0
    timeline_delta_minutes: float = 0.0
    o2_consumption_delta_g: float = 0.0
    battery_consumption_delta_wh: float = 0.0
    mission_warnings: list[dict[str, Any]] = field(default_factory=list)
    epistemic_class: str = EpistemicClass.SIMULATED.value
    disclaimer: str = EMERGENCY_DISCLAIMER

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "original_route": self.original_route.to_dict(),
            "rerouted_route": self.rerouted_route.to_dict() if self.rerouted_route else None,
            "is_feasible": self.is_feasible,
            "is_return_to_base": self.is_return_to_base,
            "crew_location": self.crew_location,
            "hazard_event": self.hazard_event.to_dict(),
            "impact": self.impact.to_dict(),
            "reasoning": self.reasoning,
            "metrics_delta": {
                "distance_delta_m": round(self.distance_delta_m, 1),
                "duration_delta_minutes": round(self.duration_delta_minutes, 1),
                "cost_delta": round(self.cost_delta, 2),
                "hazard_exposure_delta": round(self.hazard_exposure_delta, 4),
                "timeline_delta_minutes": round(self.timeline_delta_minutes, 1),
                "o2_consumption_delta_g": round(self.o2_consumption_delta_g, 1),
                "battery_consumption_delta_wh": round(self.battery_consumption_delta_wh, 1),
            },
            "mission_warnings": self.mission_warnings,
            "epistemic_class": self.epistemic_class,
            "disclaimer": self.disclaimer,
        }

