"""Tests for the Multi-Objective Route Comparison Service and API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.route_comparison import (
    MissionPreferences,
    RouteComparisonService,
)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_mission_preferences_normalization() -> None:
    prefs = MissionPreferences(
        safety_importance=4.0, science_importance=4.0, efficiency_importance=2.0
    )
    norm = prefs.normalized()
    assert (
        pytest.approx(norm.safety_importance + norm.science_importance + norm.efficiency_importance)
        == 1.0
    )
    assert pytest.approx(norm.safety_importance) == 0.4
    assert pytest.approx(norm.science_importance) == 0.4
    assert pytest.approx(norm.efficiency_importance) == 0.2


def test_mission_preferences_validation() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        MissionPreferences(
            safety_importance=-1.0, science_importance=1.0, efficiency_importance=1.0
        )

    with pytest.raises(ValueError, match="strictly positive"):
        MissionPreferences(safety_importance=0.0, science_importance=0.0, efficiency_importance=0.0)


def test_no_universal_optimal_principle() -> None:
    service = RouteComparisonService()
    scenarios = service.get_example_scenarios()
    scen = scenarios[0]

    comparison, _ = service.compare_routes(
        start_lat=scen["start"]["lat"],
        start_lon=scen["start"]["lon"],
        dest_lat=scen["destination"]["lat"],
        dest_lon=scen["destination"]["lon"],
    )

    # Must contain the non-negotiable notice
    assert "No single route is universally optimal" in comparison.no_universal_optimal_notice
    assert "Pareto-optimal" in comparison.no_universal_optimal_notice

    # Verify that each route clearly explains its primary objective and trade-off
    profiles_found = {r.profile_name for r in comparison.routes}
    assert profiles_found == {"SAFETY_FIRST", "SCIENCE_FIRST", "BALANCED"}

    for r in comparison.routes:
        assert len(r.primary_optimization_objective) > 10
        assert len(r.key_trade_off) > 10
        assert r.length_km > 0.0
        assert r.estimated_duration_min > 0.0
        assert 0.0 <= r.mean_hazard_exposure_pct <= 100.0
        assert r.accumulated_cost > 0.0
        assert 0.0 <= r.preference_utility_score <= 1.0


def test_route_comparison_reproducibility() -> None:
    """Ensure multi-objective comparison is deterministic and reproducible."""
    service = RouteComparisonService()
    scen = service.get_example_scenarios()[0]

    comp1, suite1 = service.compare_routes(
        start_lat=scen["start"]["lat"],
        start_lon=scen["start"]["lon"],
        dest_lat=scen["destination"]["lat"],
        dest_lon=scen["destination"]["lon"],
        preferences=MissionPreferences(
            safety_importance=0.5, science_importance=0.3, efficiency_importance=0.2
        ),
    )

    comp2, suite2 = service.compare_routes(
        start_lat=scen["start"]["lat"],
        start_lon=scen["start"]["lon"],
        dest_lat=scen["destination"]["lat"],
        dest_lon=scen["destination"]["lon"],
        preferences=MissionPreferences(
            safety_importance=0.5, science_importance=0.3, efficiency_importance=0.2
        ),
    )

    assert comp1.to_dict() == comp2.to_dict()
    for name in suite1:
        assert suite1[name].metrics == suite2[name].metrics
        assert len(suite1[name].waypoints) == len(suite2[name].waypoints)


def test_mission_preference_impact_on_utility_ranking() -> None:
    """Changing preferences should alter utility scoring and ranking."""
    service = RouteComparisonService()
    scen = service.get_example_scenarios()[0]

    # Strong safety preference
    safety_pref = MissionPreferences(
        safety_importance=0.9, science_importance=0.05, efficiency_importance=0.05
    )
    comp_safety, _ = service.compare_routes(
        start_lat=scen["start"]["lat"],
        start_lon=scen["start"]["lon"],
        dest_lat=scen["destination"]["lat"],
        dest_lon=scen["destination"]["lon"],
        preferences=safety_pref,
    )
    # Highest ranked route under safety preferences should be SAFETY_FIRST
    assert comp_safety.routes[0].profile_name == "SAFETY_FIRST"

    # Strong science preference
    science_pref = MissionPreferences(
        safety_importance=0.05, science_importance=0.9, efficiency_importance=0.05
    )
    comp_science, _ = service.compare_routes(
        start_lat=scen["start"]["lat"],
        start_lon=scen["start"]["lon"],
        dest_lat=scen["destination"]["lat"],
        dest_lon=scen["destination"]["lon"],
        preferences=science_pref,
    )
    # Highest ranked route under science preferences should be SCIENCE_FIRST
    assert comp_science.routes[0].profile_name == "SCIENCE_FIRST"


def test_trade_off_analysis_content() -> None:
    service = RouteComparisonService()
    scen = service.get_example_scenarios()[0]

    comp, _ = service.compare_routes(
        start_lat=scen["start"]["lat"],
        start_lon=scen["start"]["lon"],
        dest_lat=scen["destination"]["lat"],
        dest_lon=scen["destination"]["lon"],
    )

    assert len(comp.trade_off_analysis) >= 3
    joined = " ".join(comp.trade_off_analysis)
    assert "Science-First" in joined
    assert "Safety-First" in joined
    assert "Balanced Profile" in joined


def test_example_scenarios_query() -> None:
    service = RouteComparisonService()
    scenarios = service.get_example_scenarios()
    assert len(scenarios) == 3
    for s in scenarios:
        assert "scenario_id" in s
        assert "title" in s
        assert "start" in s
        assert "destination" in s
        assert "suggested_preferences" in s


def test_api_scenarios_endpoint(client: TestClient) -> None:
    resp = client.get("/api/v1/routing/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert "scenarios" in data
    assert len(data["scenarios"]) == 3


def test_api_compare_endpoint(client: TestClient) -> None:
    payload = {
        "start": {"lat": 18.4446, "lon": 77.4509},
        "destination": {"lat": 18.4550, "lon": 77.4050},
        "preferences": {
            "safety_importance": 0.4,
            "science_importance": 0.4,
            "efficiency_importance": 0.2,
        },
        "algorithm": "astar",
        "simplify": True,
    }
    resp = client.post("/api/v1/routing/compare", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 3
    assert "comparison" in data
    comp = data["comparison"]
    assert "routes" in comp
    assert len(comp["routes"]) == 3
    assert "no_universal_optimal_notice" in comp
    assert "trade_off_analysis" in comp
