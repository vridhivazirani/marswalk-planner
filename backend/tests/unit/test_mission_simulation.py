"""Unit tests for M0.4.5 Integrated Mission Simulation & Environmental Coupling."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.mission.calculator import EVAMissionCalculator
from app.mission.models import WarningSeverity
from app.routing.engine import RouteOptimizationEngine
from app.services.mission_planning import MissionPlanningService

client = TestClient(app)


@pytest.fixture
def test_route_plan():
    """Compute a deterministic route plan at Jezero Crater for simulation tests."""
    engine = RouteOptimizationEngine()
    return engine.compute_route(
        start_lat=18.4446,
        start_lon=77.4509,
        dest_lat=18.4550,
        dest_lon=77.4050,
        profile_name="BALANCED",
        simplify=True,
    )


def test_baseline_vs_environmental_coupling(test_route_plan):
    """Verify that environmental modifiers scale consumption without breaking baseline."""
    calc = EVAMissionCalculator()

    # 1. Baseline evaluation
    baseline_summary = calc.evaluate_mission(
        route_plan=test_route_plan,
        science_stops_count=2,
        is_round_trip=True,
    )
    assert not baseline_summary.environmental_modifiers_applied
    assert baseline_summary.environmental_factors is None
    assert not any(
        w.code.startswith("ENVIRONMENTAL_") for w in baseline_summary.warnings
    )

    # 2. Coupled evaluation with severe cold and dust
    severe_env = {
        "air_temperature_c": -68.0,
        "dust_optical_depth_tau": 0.95,
        "wind_speed_mps": 14.0,
        "suitability_score": 0.52,
    }
    coupled_summary = calc.evaluate_mission(
        route_plan=test_route_plan,
        science_stops_count=2,
        is_round_trip=True,
        environmental_modifiers=severe_env,
    )
    assert coupled_summary.environmental_modifiers_applied
    assert coupled_summary.environmental_factors == severe_env

    # Slower walking speed from dust increases traversal duration
    assert (
        coupled_summary.timeline.total_walking_minutes
        > baseline_summary.timeline.total_walking_minutes
    )

    # Extreme cold heating power increases battery consumption
    assert (
        coupled_summary.consumables.battery_energy_consumed_wh
        > baseline_summary.consumables.battery_energy_consumed_wh
    )

    # Wind and low suitability increase metabolic kcal
    assert (
        coupled_summary.consumables.metabolic_energy_expended_kcal
        > baseline_summary.consumables.metabolic_energy_expended_kcal
    )

    # Warning for elevated environmental stress should be present
    env_warnings = [
        w for w in coupled_summary.warnings if w.code == "ENVIRONMENTAL_STRESS_ELEVATED"
    ]
    assert len(env_warnings) == 1
    assert env_warnings[0].severity == WarningSeverity.WARNING


def test_mission_planning_service_environmental_coupling():
    """Verify MissionPlanningService propagates environmental modifiers."""
    service = MissionPlanningService()
    env = {
        "air_temperature_c": -45.0,
        "dust_optical_depth_tau": 0.35,
        "wind_speed_mps": 6.0,
        "suitability_score": 0.88,
    }
    summary, _ = service.plan_mission(
        start_lat=18.4446,
        start_lon=77.4509,
        dest_lat=18.4550,
        dest_lon=77.4050,
        profile_name="BALANCED",
        environmental_modifiers=env,
    )
    assert summary.environmental_modifiers_applied
    advisories = [
        w for w in summary.warnings if w.code == "ENVIRONMENTAL_COUPLING_ACTIVE"
    ]
    assert len(advisories) == 1
    assert advisories[0].severity == WarningSeverity.ADVISORY


def test_api_mission_plan_with_environmental_modifiers():
    """Verify HTTP POST /api/v1/mission/plan accepts and applies environmental modifiers."""
    payload = {
        "start": {"lat": 18.4446, "lon": 77.4509},
        "destination": {"lat": 18.4550, "lon": 77.4050},
        "profile": "BALANCED",
        "science_stops_count": 1,
        "is_round_trip": True,
        "environmental_modifiers": {
            "air_temperature_c": -70.0,
            "dust_optical_depth_tau": 0.85,
            "wind_speed_mps": 12.0,
            "suitability_score": 0.58,
        },
    }
    res = client.post("/api/v1/mission/plan", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "mission" in data
    assert data["mission"]["environmental_modifiers_applied"] is True
    assert data["mission"]["environmental_factors"]["air_temperature_c"] == -70.0


def test_api_multi_destination_with_environmental_modifiers():
    """Verify HTTP POST /api/v1/mission/multi-destination accepts environmental modifiers."""
    payload = {
        "origin": {"lat": 18.4446, "lon": 77.4509},
        "waypoints": [{"lat": 18.4485, "lon": 77.4320}],
        "profile": "BALANCED",
        "return_to_origin": True,
        "environmental_modifiers": {
            "air_temperature_c": -55.0,
            "dust_optical_depth_tau": 0.70,
            "wind_speed_mps": 10.0,
            "suitability_score": 0.75,
        },
    }
    res = client.post("/api/v1/mission/multi-destination", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "legs" in data
    assert len(data["legs"]) == 2
