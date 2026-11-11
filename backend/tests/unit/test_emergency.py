"""Automated tests for Marswalk Emergency Response and Dynamic Rerouting Engine."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.epistemic import EpistemicClass
from app.main import app
from app.routing.emergency import (
    EMERGENCY_DISCLAIMER,
    SimulatedHazardEvent,
    SimulatedHazardType,
)
from app.services.emergency_response import EmergencyResponseService

client = TestClient(app)

# Standard reference points in Jezero study footprint
START_LAT = 18.4446
START_LON = 77.4509
DEST_LAT = 18.4550
DEST_LON = 77.4050


@pytest.fixture
def service() -> EmergencyResponseService:
    return EmergencyResponseService()


def test_curated_scenarios_definitions(service: EmergencyResponseService) -> None:
    """Verify all 6 curated emergency scenarios are properly defined."""
    scenarios = service.get_curated_scenarios()
    assert len(scenarios) == 6

    expected_types = {
        SimulatedHazardType.NEW_BOULDER_FIELD,
        SimulatedHazardType.SAND_DUNE_RESTRICTION,
        SimulatedHazardType.SUDDEN_ROUTE_CLOSURE,
        SimulatedHazardType.INCREASED_UNCERTAINTY,
        SimulatedHazardType.DESTINATION_INACCESSIBLE,
        SimulatedHazardType.RETURN_TO_BASE,
    }
    actual_types = {s.hazard_type for s in scenarios}
    assert actual_types == expected_types

    for s in scenarios:
        assert s.radius_m > 0.0
        assert s.epistemic_class == EpistemicClass.SIMULATED.value
        assert "RESEARCH DECISION-SUPPORT PROTOTYPE ONLY" in s.disclaimer


def test_scenario_1_boulder_field_reroute(service: EmergencyResponseService) -> None:
    """Scenario 1: Newly detected boulder field triggers safe reroute."""
    scenarios = service.get_curated_scenarios()
    boulder_scen = next(
        s for s in scenarios if s.hazard_type == SimulatedHazardType.NEW_BOULDER_FIELD
    )

    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=boulder_scen,
        crew_progress_pct=0.30,
    )

    assert plan.is_feasible is True
    assert plan.rerouted_route is not None
    assert plan.rerouted_route.metrics.restricted_cells_crossed == 0
    assert (
        "DYNAMIC DETOUR SUCCESSFUL" in plan.reasoning or "ROUTE CONFIRMED SECURE" in plan.reasoning
    )
    assert plan.epistemic_class == EpistemicClass.SIMULATED.value


def test_scenario_2_sand_dune_restriction(service: EmergencyResponseService) -> None:
    """Scenario 2: Active sand dune restriction applies high friction cost."""
    scenarios = service.get_curated_scenarios()
    dune_scen = next(
        s for s in scenarios if s.hazard_type == SimulatedHazardType.SAND_DUNE_RESTRICTION
    )

    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=dune_scen,
        crew_progress_pct=0.35,
    )

    assert plan.is_feasible is True
    assert plan.rerouted_route is not None
    assert plan.rerouted_route.metrics.total_distance_m > 0


def test_scenario_3_sudden_route_closure(service: EmergencyResponseService) -> None:
    """Scenario 3: Sudden scarp rockfall blocks primary pass, forcing detour."""
    scenarios = service.get_curated_scenarios()
    closure_scen = next(
        s for s in scenarios if s.hazard_type == SimulatedHazardType.SUDDEN_ROUTE_CLOSURE
    )

    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=closure_scen,
        crew_progress_pct=0.40,
    )

    assert plan.is_feasible is True
    assert plan.rerouted_route is not None
    assert plan.rerouted_route.metrics.restricted_cells_crossed == 0


def test_scenario_4_increased_uncertainty(service: EmergencyResponseService) -> None:
    """Scenario 4: Stereo sensor dust haze elevates elevation uncertainty cost."""
    scenarios = service.get_curated_scenarios()
    unc_scen = next(
        s for s in scenarios if s.hazard_type == SimulatedHazardType.INCREASED_UNCERTAINTY
    )

    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=unc_scen,
        crew_progress_pct=0.40,
    )

    assert plan.is_feasible is True
    assert plan.rerouted_route is not None


def test_scenario_5_destination_inaccessible(service: EmergencyResponseService) -> None:
    """Scenario 5: Destination enclosure detection when goal is blocked."""
    scenarios = service.get_curated_scenarios()
    dest_scen = next(
        s for s in scenarios if s.hazard_type == SimulatedHazardType.DESTINATION_INACCESSIBLE
    )

    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=dest_scen,
        crew_progress_pct=0.50,
    )

    assert plan.is_feasible is False
    assert plan.rerouted_route is None
    assert "DESTINATION UNREACHABLE" in plan.reasoning or "NO FEASIBLE PATH" in plan.reasoning
    assert plan.impact.destination_blocked is True


def test_scenario_6_return_to_base_emergency(service: EmergencyResponseService) -> None:
    """Scenario 6: Emergency Return-to-Base routing back to start camp."""
    scenarios = service.get_curated_scenarios()
    rtb_scen = next(s for s in scenarios if s.hazard_type == SimulatedHazardType.RETURN_TO_BASE)

    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=rtb_scen,
        crew_progress_pct=0.50,
    )

    assert plan.is_feasible is True
    assert plan.is_return_to_base is True
    assert plan.rerouted_route is not None
    # Destination of RTB is the start base
    last_wp = plan.rerouted_route.waypoints[-1]
    assert abs(last_wp.lat - START_LAT) < 0.005
    assert abs(last_wp.lon - START_LON) < 0.005
    assert "EMERGENCY RETURN-TO-BASE EXECUTED" in plan.reasoning


def test_unaffected_route_detection(service: EmergencyResponseService) -> None:
    """Test that a distant hazard does not falsely flag an active route as affected."""
    distant_hazard = SimulatedHazardEvent(
        event_id="DISTANT-HAZ",
        hazard_type=SimulatedHazardType.NEW_BOULDER_FIELD,
        title="Distant Boulder Field",
        description="Hazard far outside the travel corridor.",
        center_lat=18.4200,
        center_lon=77.4700,
        radius_m=100.0,
        is_hard_restriction=True,
        cost_multiplier=10.0,
    )

    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=distant_hazard,
    )

    assert plan.is_feasible is True
    assert plan.impact.is_route_affected is False
    assert plan.impact.affected_waypoints_count == 0


def test_geojson_generation(service: EmergencyResponseService) -> None:
    """Test that GeoJSON export contains original, rerouted, hazard, and crew layers."""
    scenarios = service.get_curated_scenarios()
    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=scenarios[0],
    )

    geojson = service.to_geojson(plan)
    assert geojson["type"] == "FeatureCollection"
    types = [f["properties"]["layer_type"] for f in geojson["features"]]
    assert "original_route" in types
    assert "rerouted_route" in types
    assert "simulated_hazard" in types
    assert "crew_position" in types


def test_safety_disclaimer_preservation(service: EmergencyResponseService) -> None:
    """Test that mandatory non-operational safety disclaimers are preserved."""
    scenarios = service.get_curated_scenarios()
    plan = service.simulate_incident_and_reroute(
        start_lat=START_LAT,
        start_lon=START_LON,
        dest_lat=DEST_LAT,
        dest_lon=DEST_LON,
        hazard=scenarios[0],
    )
    assert EMERGENCY_DISCLAIMER in plan.disclaimer
    data = plan.to_dict()
    assert EMERGENCY_DISCLAIMER in data["disclaimer"]


def test_emergency_api_scenarios_endpoint() -> None:
    """Test GET /api/v1/emergency/scenarios endpoint."""
    res = client.get("/api/v1/emergency/scenarios")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 6
    assert data[0]["event_id"] == "SIM-HAZ-001-BOULDER"


def test_emergency_api_simulate_endpoint() -> None:
    """Test POST /api/v1/emergency/simulate endpoint."""
    payload = {
        "start_lat": START_LAT,
        "start_lon": START_LON,
        "dest_lat": DEST_LAT,
        "dest_lon": DEST_LON,
        "profile_name": "BALANCED",
        "crew_progress_pct": 0.40,
        "scenario_id": "SIM-HAZ-001-BOULDER",
    }
    res = client.post("/api/v1/emergency/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["event_id"] == "SIM-HAZ-001-BOULDER"
    assert "geojson" in data
    assert data["geojson"]["type"] == "FeatureCollection"
    assert "metrics_delta" in data


def test_emergency_api_abort_to_base_endpoint() -> None:
    """Test POST /api/v1/emergency/abort-to-base endpoint."""
    payload = {
        "start_lat": START_LAT,
        "start_lon": START_LON,
        "crew_lat": 18.4490,
        "crew_lon": 77.4280,
    }
    res = client.post("/api/v1/emergency/abort-to-base", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["is_return_to_base"] is True
    assert data["is_feasible"] is True
    assert "geojson" in data
