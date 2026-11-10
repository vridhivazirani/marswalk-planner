"""Service for environmental scenario assessment and comparative trade-off analysis."""

from __future__ import annotations

from typing import Any

from app.mission.environmental import (
    EnvironmentalAssessmentReport,
    EnvironmentalScenarioEngine,
    EnvironmentalScenarioInput,
    EnvironmentalWeights,
)


class EnvironmentalAssessmentService:
    """Service orchestrating environmental suitability assessment and scenario comparisons."""

    def __init__(self, engine: EnvironmentalScenarioEngine | None = None) -> None:
        self.engine = engine or EnvironmentalScenarioEngine()

    def assess_scenario(
        self,
        scenario: EnvironmentalScenarioInput,
        weights: EnvironmentalWeights | None = None,
    ) -> EnvironmentalAssessmentReport:
        """Evaluate suitability, component decomposition, and warnings for a scenario."""
        return self.engine.assess_scenario(scenario, weights)

    def compare_scenarios(
        self,
        scenarios: list[EnvironmentalScenarioInput],
        weights: EnvironmentalWeights | None = None,
    ) -> list[EnvironmentalAssessmentReport]:
        """Assess multiple scenarios and rank descending by environmental suitability."""
        return self.engine.compare_scenarios(scenarios, weights)

    def get_curated_scenarios(self) -> list[dict[str, Any]]:
        """Return curated representative environmental scenarios for Jezero Crater."""
        scenarios = self.engine.get_curated_scenarios()
        return [s.to_dict() for s in scenarios]

    def get_data_sources_dossier(self) -> dict[str, Any]:
        """Return dataset provenance dossiers for real planetary environmental records."""
        return self.engine.get_data_sources_dossier()
