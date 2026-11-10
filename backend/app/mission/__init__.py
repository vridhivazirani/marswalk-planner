"""Marswalk human EVA mission planning domain package.

Estimates operational timelines, consumables budgets (O2, battery power, metabolic energy),
rest requirements, contingency buffers, and mission feasibility warnings for hypothetical
human EVA traverses at Jezero Crater.

Human-EVA models are HEURISTIC and scenarios are SIMULATED.
All parameters are illustrative engineering placeholders.
"""

from __future__ import annotations

from app.mission.assumptions import (
    CrewAssumptions,
    EquipmentAssumptions,
    MissionPlanningAssumptions,
    OperationalTimelineAssumptions,
)
from app.mission.calculator import EVAMissionCalculator
from app.mission.environmental import (
    DataOriginCategory,
    EnvironmentalAssessmentReport,
    EnvironmentalScenarioEngine,
    EnvironmentalScenarioInput,
    EnvironmentalSuitabilityScore,
    EnvironmentalWeights,
)
from app.mission.models import (
    ConsumablesBudget,
    EVATimeline,
    MissionFeasibilityWarning,
    MissionPlanSummary,
    WarningSeverity,
)

__all__ = [
    "CrewAssumptions",
    "EquipmentAssumptions",
    "OperationalTimelineAssumptions",
    "MissionPlanningAssumptions",
    "EVAMissionCalculator",
    "EVATimeline",
    "ConsumablesBudget",
    "MissionFeasibilityWarning",
    "MissionPlanSummary",
    "WarningSeverity",
    "DataOriginCategory",
    "EnvironmentalAssessmentReport",
    "EnvironmentalScenarioEngine",
    "EnvironmentalScenarioInput",
    "EnvironmentalSuitabilityScore",
    "EnvironmentalWeights",
]
