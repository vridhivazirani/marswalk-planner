"""Unit tests for the Marswalk Environmental Scenario Assessment Engine."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.epistemic import EpistemicClass
from app.main import app
from app.mission.environmental import (
    ENVIRONMENTAL_SAFETY_DISCLAIMER,
    DataOriginCategory,
    EnvironmentalScenarioEngine,
    EnvironmentalWeights,
)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_environmental_weights_validation() -> None:
    """Test validation and normalization of environmental weights."""
    with pytest.raises(ValueError, match="non-negative"):
        EnvironmentalWeights(w_thermal=-0.1)

    with pytest.raises(ValueError, match="strictly positive"):
        EnvironmentalWeights(w_thermal=0.0, w_solar=0.0, w_dust=0.0, w_wind=0.0)

    weights = EnvironmentalWeights(w_thermal=2.0, w_solar=2.0, w_dust=2.0, w_wind=2.0)
    norm = weights.normalized()
    assert pytest.approx(norm.w_thermal + norm.w_solar + norm.w_dust + norm.w_wind) == 1.0
    assert pytest.approx(norm.w_thermal) == 0.25


def test_data_sources_provenance() -> None:
    """Verify authentic planetary in-situ and modeled dataset dossiers."""
    engine = EnvironmentalScenarioEngine()
    dossier = engine.get_data_sources_dossier()

    assert "sources" in dossier
    assert len(dossier["sources"]) >= 2

    meda = next(s for s in dossier["sources"] if "meda" in s["product_id"])
    assert meda["product_id"] == "urn:nasa:pds:mars2020_meda"
    assert meda["epistemic_class"] == EpistemicClass.OBSERVED.value
    assert "Perseverance" in meda["title"]
    assert "historical weather" in meda["caveats"]

    mcd = next(s for s in dossier["sources"] if "MCD" in s["product_id"])
    assert mcd["epistemic_class"] == EpistemicClass.SIMULATED.value


def test_curated_scenarios_authenticity() -> None:
    """Verify curated Jezero scenarios contain valid parameters and origins."""
    engine = EnvironmentalScenarioEngine()
    scenarios = engine.get_curated_scenarios()

    assert len(scenarios) == 4
    clear_midday = scenarios[0]
    assert clear_midday.data_origin == DataOriginCategory.HISTORICAL_OBSERVED
    assert clear_midday.epistemic_class == EpistemicClass.OBSERVED
    assert clear_midday.solar_irradiance_w_per_m2 > 400.0
    assert clear_midday.dust_optical_depth_tau < 0.50

    frost = next(s for s in scenarios if "FROST" in s.scenario_id)
    assert frost.data_origin == DataOriginCategory.CLIMATE_MODELED
    assert frost.air_temperature_c < -70.0


def test_suitability_scoring_clear_midday() -> None:
    """Verify optimal scoring on clear midday window."""
    engine = EnvironmentalScenarioEngine()
    clear_midday = engine.get_curated_scenarios()[0]

    report = engine.assess_scenario(clear_midday)
    s = report.suitability

    assert s.suitability_category == "OPTIMAL"
    assert s.overall_suitability_score >= 0.85
    assert s.thermal_score == 1.0
    assert s.solar_illumination_score == 1.0
    assert s.dust_opacity_score == 1.0
    assert len(report.warnings) == 0


def test_suitability_scoring_dust_storm() -> None:
    """Verify dust storm heavily penalizes dust and solar scores and triggers alerts."""
    engine = EnvironmentalScenarioEngine()
    dust_scenario = next(s for s in engine.get_curated_scenarios() if "DUST" in s.scenario_id)

    report = engine.assess_scenario(dust_scenario)
    s = report.suitability

    assert s.overall_suitability_score < 0.50
    assert s.dust_opacity_score < 0.30
    assert s.solar_illumination_score < 0.60
    assert any("dust storm" in w.lower() for w in report.warnings)


def test_suitability_scoring_cryogenic_cold() -> None:
    """Verify cryogenic cold triggers temperature warnings."""
    engine = EnvironmentalScenarioEngine()
    frost_scenario = next(s for s in engine.get_curated_scenarios() if "FROST" in s.scenario_id)

    report = engine.assess_scenario(frost_scenario)
    assert report.suitability.thermal_score < 0.30
    assert any("cryogenic cold" in w.lower() for w in report.warnings)


def test_scenario_comparison_ranking() -> None:
    """Verify scenario comparison ranks from most to least suitable."""
    engine = EnvironmentalScenarioEngine()
    scenarios = engine.get_curated_scenarios()

    reports = engine.compare_scenarios(scenarios)
    assert len(reports) == len(scenarios)

    # First ranked must be Clear Midday
    assert reports[0].scenario.scenario_id == "SCENARIO-ENV-01-CLEAR-MIDDAY"
    # Scores must be in descending order
    scores = [r.suitability.overall_suitability_score for r in reports]
    assert scores == sorted(scores, reverse=True)


def test_safety_disclaimer_preservation() -> None:
    """Verify the non-negotiable safety disclaimer is included in all reports."""
    engine = EnvironmentalScenarioEngine()
    scenario = engine.get_curated_scenarios()[0]

    report = engine.assess_scenario(scenario)
    assert "does NOT guarantee astronaut safety" in report.safety_disclaimer
    assert report.safety_disclaimer == ENVIRONMENTAL_SAFETY_DISCLAIMER


def test_api_environmental_endpoints(client: TestClient) -> None:
    """Test FastAPI environmental scenario endpoints."""
    # 1. Sources dossier
    resp_src = client.get("/api/v1/environmental/sources")
    assert resp_src.status_code == 200
    assert "sources" in resp_src.json()

    # 2. Curated scenarios
    resp_scen = client.get("/api/v1/environmental/scenarios")
    assert resp_scen.status_code == 200
    scenarios = resp_scen.json()["scenarios"]
    assert len(scenarios) == 4

    # 3. Assess scenario
    assess_payload = {
        "scenario": scenarios[0],
        "weights": {"w_thermal": 0.4, "w_solar": 0.2, "w_dust": 0.2, "w_wind": 0.2},
    }
    resp_assess = client.post("/api/v1/environmental/assess", json=assess_payload)
    assert resp_assess.status_code == 200
    data_assess = resp_assess.json()
    assert "suitability" in data_assess
    assert data_assess["suitability"]["overall_suitability_score"] > 0.8
    assert "safety_disclaimer" in data_assess

    # 4. Compare scenarios
    comp_payload = {
        "scenarios": scenarios,
    }
    resp_comp = client.post("/api/v1/environmental/compare", json=comp_payload)
    assert resp_comp.status_code == 200
    comps = resp_comp.json()["comparisons"]
    assert len(comps) == 4
    first_score = comps[0]["suitability"]["overall_suitability_score"]
    last_score = comps[-1]["suitability"]["overall_suitability_score"]
    assert first_score >= last_score
