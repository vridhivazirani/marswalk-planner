"""Data models for Mars EVA Mission Planning Engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.core.disclaimer import DISCLAIMER
from app.core.epistemic import EpistemicClass


class WarningSeverity(StrEnum):
    """Severity category for mission feasibility alerts."""

    CRITICAL = "CRITICAL"  # Threatens crew safety or breaks hard consumable limits
    WARNING = "WARNING"  # Exceeds recommended margins or flight-rule guidelines
    CAUTION = "CAUTION"  # High terrain fatigue, steep grade, or low reserve buffer
    ADVISORY = "ADVISORY"  # Informational operational consideration


@dataclass(frozen=True)
class MissionFeasibilityWarning:
    """Operational warning or constraint violation detected along the planned EVA."""

    severity: WarningSeverity
    code: str
    message: str
    remediation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity.value,
            "code": self.code,
            "message": self.message,
            "remediation": self.remediation,
        }


@dataclass(frozen=True)
class EVATimeline:
    """Operational timeline breakdown distinguishing traversal from total duration."""

    outbound_traversal_minutes: float
    return_traversal_minutes: float
    total_walking_minutes: float
    planned_science_minutes: float
    science_stops_count: int
    rest_pauses_minutes: float
    rest_stops_count: int
    contingency_reserve_minutes: float
    total_eva_duration_minutes: float
    total_eva_duration_hours: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "outbound_traversal_minutes": round(self.outbound_traversal_minutes, 1),
            "return_traversal_minutes": round(self.return_traversal_minutes, 1),
            "total_walking_minutes": round(self.total_walking_minutes, 1),
            "planned_science_minutes": round(self.planned_science_minutes, 1),
            "science_stops_count": self.science_stops_count,
            "rest_pauses_minutes": round(self.rest_pauses_minutes, 1),
            "rest_stops_count": self.rest_stops_count,
            "contingency_reserve_minutes": round(self.contingency_reserve_minutes, 1),
            "total_eva_duration_minutes": round(self.total_eva_duration_minutes, 1),
            "total_eva_duration_hours": round(self.total_eva_duration_hours, 2),
            "epistemic_class": EpistemicClass.SIMULATED.value,
        }


@dataclass(frozen=True)
class ConsumablesBudget:
    """Resource consumption proxies and remaining margins for the EVA mission."""

    o2_consumed_per_crew_g: float
    total_o2_consumed_all_crew_g: float
    o2_capacity_per_suit_g: float
    o2_remaining_per_suit_g: float
    o2_margin_pct: float
    battery_energy_consumed_wh: float
    battery_capacity_wh: float
    battery_remaining_wh: float
    battery_margin_pct: float
    metabolic_energy_expended_kcal: float
    average_metabolic_power_w: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "o2_consumed_per_crew_g": round(self.o2_consumed_per_crew_g, 1),
            "total_o2_consumed_all_crew_g": round(self.total_o2_consumed_all_crew_g, 1),
            "o2_capacity_per_suit_g": round(self.o2_capacity_per_suit_g, 1),
            "o2_remaining_per_suit_g": round(self.o2_remaining_per_suit_g, 1),
            "o2_margin_pct": round(self.o2_margin_pct, 1),
            "battery_energy_consumed_wh": round(self.battery_energy_consumed_wh, 1),
            "battery_capacity_wh": round(self.battery_capacity_wh, 1),
            "battery_remaining_wh": round(self.battery_remaining_wh, 1),
            "battery_margin_pct": round(self.battery_margin_pct, 1),
            "metabolic_energy_expended_kcal": round(self.metabolic_energy_expended_kcal, 1),
            "average_metabolic_power_w": round(self.average_metabolic_power_w, 1),
            "epistemic_class": EpistemicClass.SIMULATED.value,
        }


@dataclass(frozen=True)
class MissionPlanSummary:
    """Complete mission summary for a hypothetical human Mars EVA."""

    mission_id: str
    title: str
    start_location: dict[str, Any]
    destination_location: dict[str, Any]
    selected_route_profile: str
    one_way_distance_km: float
    round_trip_distance_km: float
    timeline: EVATimeline
    consumables: ConsumablesBudget
    warnings: list[MissionFeasibilityWarning] = field(default_factory=list)
    is_feasible: bool = True
    epistemic_class: str = EpistemicClass.SIMULATED.value
    assumptions_used: dict[str, Any] = field(default_factory=dict)
    disclaimer: str = DISCLAIMER

    def to_dict(self) -> dict[str, Any]:
        return {
            "mission_id": self.mission_id,
            "title": self.title,
            "start_location": self.start_location,
            "destination_location": self.destination_location,
            "selected_route_profile": self.selected_route_profile,
            "one_way_distance_km": round(self.one_way_distance_km, 3),
            "round_trip_distance_km": round(self.round_trip_distance_km, 3),
            "timeline": self.timeline.to_dict(),
            "consumables": self.consumables.to_dict(),
            "warnings": [w.to_dict() for w in self.warnings],
            "is_feasible": self.is_feasible,
            "epistemic_class": self.epistemic_class,
            "assumptions_used": self.assumptions_used,
            "disclaimer": self.disclaimer,
        }
