"""Configurable physiological, equipment, and timeline assumptions for Mars human EVA planning.

All parameters are explicitly designated as HEURISTIC illustrative placeholders.
Per AGENTS.md rules:
- NEVER invent or claim actual certified spacesuit specifications.
- Keep all assumptions strictly configurable.
- Every simulated quantity must carry epistemic classification and disclaimers.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from app.core.epistemic import EpistemicClass


@dataclass(frozen=True)
class CrewAssumptions:
    """Configurable physiological assumptions for the planetary EVA crew."""

    nominal_crew_count: int = 2  # Standard planetary buddy system
    body_mass_kg: float = 75.0  # Illustrative average astronaut mass
    suit_mass_kg: float = 50.0  # Illustrative planetary exploration suit mass
    base_metabolic_rate_w: float = 120.0  # Resting metabolic rate in suit (Watts)
    nominal_walking_power_w: float = 280.0  # Level walking metabolic output (Watts)
    slope_power_factor_w_per_deg: float = 14.0  # Additional Watts per degree of uphill slope
    o2_consumption_rate_g_per_hour_base: float = 40.0  # Baseline basal O2 consumption (g/hr)
    o2_consumption_rate_g_per_wh: float = 0.16  # O2 consumption per Watt-hour of metabolic work

    def __post_init__(self) -> None:
        if self.nominal_crew_count < 1:
            raise ValueError("Crew count must be at least 1.")
        if self.body_mass_kg <= 0 or self.suit_mass_kg <= 0:
            raise ValueError("Body and suit mass must be positive.")
        if self.base_metabolic_rate_w <= 0 or self.nominal_walking_power_w <= 0:
            raise ValueError("Metabolic rates must be positive.")

    @property
    def total_system_mass_kg(self) -> float:
        """Total mass of astronaut plus suit (kg)."""
        return self.body_mass_kg + self.suit_mass_kg

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["epistemic_class"] = EpistemicClass.HEURISTIC.value
        data["status"] = "illustrative placeholder (unvalidated prototype)"
        return data


@dataclass(frozen=True)
class EquipmentAssumptions:
    """Configurable life-support equipment capacities and consumable budgets."""

    suit_designation: str = "Illustrative Planetary Suit Prototype (Placeholder)"
    total_usable_o2_capacity_g: float = 1200.0  # Total usable oxygen per suit (grams)
    total_battery_capacity_wh: float = 1800.0  # Total battery energy capacity (Watt-hours)
    base_life_support_power_w: float = 85.0  # Avionics, ventilation, CO2 scrubber (Watts)
    min_o2_reserve_fraction: float = 0.20  # Minimum mandatory 20% O2 reserve margin
    min_battery_reserve_fraction: float = 0.20  # Minimum mandatory 20% battery reserve margin
    max_recommended_eva_duration_hours: float = 8.0  # Nominal flight rule hard EVA limit

    def __post_init__(self) -> None:
        if self.total_usable_o2_capacity_g <= 0:
            raise ValueError("O2 capacity must be positive.")
        if self.total_battery_capacity_wh <= 0:
            raise ValueError("Battery capacity must be positive.")
        if not (0.0 < self.min_o2_reserve_fraction < 1.0):
            raise ValueError("Reserve fraction must be in (0, 1).")

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["epistemic_class"] = EpistemicClass.HEURISTIC.value
        data["status"] = "illustrative placeholder (unvalidated prototype)"
        return data


@dataclass(frozen=True)
class OperationalTimelineAssumptions:
    """Configurable scheduling intervals, rest pauses, and contingency buffers."""

    nominal_walking_speed_mps: float = 1.0  # Nominal human traverse speed on flat regolith (m/s)
    science_stop_duration_minutes: float = 15.0  # Nominal sampling & inspection time per site (min)
    rest_stop_interval_minutes: float = 45.0  # Enforced rest pause every N minutes of walking (min)
    rest_stop_duration_minutes: float = 10.0  # Duration of each rest pause (min)
    contingency_reserve_time_fraction: float = 0.25  # 25% safety reserve allowance on travel time
    return_journey_fatigue_multiplier: float = 1.05  # 5% fatigue deceleration on return trek

    def __post_init__(self) -> None:
        if self.nominal_walking_speed_mps <= 0:
            raise ValueError("Walking speed must be positive.")
        if self.science_stop_duration_minutes < 0:
            raise ValueError("Science stop duration cannot be negative.")
        if self.rest_stop_interval_minutes <= 0 or self.rest_stop_duration_minutes < 0:
            raise ValueError("Rest intervals must be valid positive durations.")
        if self.contingency_reserve_time_fraction < 0:
            raise ValueError("Contingency reserve fraction cannot be negative.")

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["epistemic_class"] = EpistemicClass.HEURISTIC.value
        data["status"] = "illustrative placeholder (unvalidated prototype)"
        return data


@dataclass(frozen=True)
class MissionPlanningAssumptions:
    """Combined configuration container for all EVA mission assumptions."""

    crew: CrewAssumptions = CrewAssumptions()
    equipment: EquipmentAssumptions = EquipmentAssumptions()
    timeline: OperationalTimelineAssumptions = OperationalTimelineAssumptions()

    def to_dict(self) -> dict[str, Any]:
        return {
            "crew": self.crew.to_dict(),
            "equipment": self.equipment.to_dict(),
            "timeline": self.timeline.to_dict(),
            "notice": (
                "All parameters are illustrative engineering placeholders for research "
                "decision-support prototyping. They do not represent certified NASA "
                "flight rules or operational spacesuit specifications."
            ),
        }
