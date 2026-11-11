"""Unit tests for the Marswalk Human EVA Mission Planning Engine."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.disclaimer import DISCLAIMER
from app.core.epistemic import EpistemicClass
from app.main import app
from app.mission.assumptions import (
    CrewAssumptions,
    EquipmentAssumptions,
    MissionPlanningAssumptions,
    OperationalTimelineAssumptions,
)
from app.mission.calculator import (
    EVAMissionCalculator,
    calculate_pandolf_santee_metabolic_power,
)
from app.mission.models import WarningSeverity
from app.routing.models import PathWaypoint, RouteMetrics, RoutePlan


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def synthetic_route_plan() -> RoutePlan:
    """Create a synthetic 1.0 km route plan with a 5% uphill incline."""
    waypoints: list[PathWaypoint] = []
    # 51 points spaced 20m apart = 1000m total distance
    for i in range(51):
        x = float(i * 20)
        y = 0.0
        elev = -2500.0 + (i * 1.0)  # 50m rise over 1000m = 5% grade (approx 2.86 degrees)
        waypoints.append(
            PathWaypoint(
                index=i,
                grid_row=i,
                grid_col=0,
                projected_x=x,
                projected_y=y,
                lon=77.40 + (i * 0.0001),
                lat=18.44 + (i * 0.0001),
                elevation_m=elev,
                cumulative_dist_m=float(i * 20),
                cumulative_cost=float(i * 25),
                slope_deg=2.86,
                hazard_score=0.10,
                uncertainty_m=1.2,
                science_opportunity=0.45,
            )
        )

    metrics = RouteMetrics(
        total_distance_m=1000.0,
        accumulated_cost=1250.0,
        estimated_duration_minutes=20.0,
        mean_hazard_exposure=0.10,
        mean_uncertainty_exposure=1.2,
        accumulated_science_opportunity=22.5,
        mean_science_opportunity=0.45,
        restricted_cells_crossed=0,
        unknown_cells_crossed=0,
    )

    return RoutePlan(
        route_id="TEST-ROUTE-01",
        profile_name="BALANCED",
        algorithm="astar",
        is_simplified=True,
        waypoints=waypoints,
        metrics=metrics,
        disclaimer=DISCLAIMER,
    )


def test_assumptions_validation() -> None:
    """Verify validation and bounds checking on mission assumptions."""
    with pytest.raises(ValueError, match="Crew count must be at least 1"):
        CrewAssumptions(nominal_crew_count=0)

    with pytest.raises(ValueError, match="positive"):
        EquipmentAssumptions(total_usable_o2_capacity_g=-10.0)

    with pytest.raises(ValueError, match="Walking speed must be positive"):
        OperationalTimelineAssumptions(nominal_walking_speed_mps=0.0)


def test_eva_timeline_components(synthetic_route_plan: RoutePlan) -> None:
    """Test calculation of individual timeline components and total duration."""
    calc = EVAMissionCalculator()
    summary = calc.evaluate_mission(
        route_plan=synthetic_route_plan,
        science_stops_count=3,
        is_round_trip=True,
    )

    t = summary.timeline
    # Outbound and return times must both be positive
    assert t.outbound_traversal_minutes > 10.0
    assert t.return_traversal_minutes > 10.0

    # Total walking time is strictly the sum of outbound and return
    expected_walk = t.outbound_traversal_minutes + t.return_traversal_minutes
    assert pytest.approx(t.total_walking_minutes) == expected_walk

    # Science time = 3 stops * 15 min = 45 min
    assert t.science_stops_count == 3
    assert pytest.approx(t.planned_science_minutes) == 45.0

    # Contingency reserve = 25% of total walking time
    assert pytest.approx(t.contingency_reserve_minutes) == t.total_walking_minutes * 0.25

    # Total EVA duration must strictly sum all individual operational components
    expected_total = (
        t.total_walking_minutes
        + t.planned_science_minutes
        + t.rest_pauses_minutes
        + t.contingency_reserve_minutes
    )
    assert pytest.approx(t.total_eva_duration_minutes) == expected_total
    assert pytest.approx(t.total_eva_duration_hours) == expected_total / 60.0

    # Traversal time must be strictly less than total EVA duration
    assert t.total_walking_minutes < t.total_eva_duration_minutes


def test_one_way_vs_round_trip(synthetic_route_plan: RoutePlan) -> None:
    """Test one-way mission disables return traversal time."""
    calc = EVAMissionCalculator()
    summary_round = calc.evaluate_mission(synthetic_route_plan, is_round_trip=True)
    summary_one_way = calc.evaluate_mission(synthetic_route_plan, is_round_trip=False)

    assert summary_one_way.timeline.return_traversal_minutes == 0.0
    assert summary_one_way.round_trip_distance_km == summary_one_way.one_way_distance_km
    assert (
        summary_one_way.timeline.total_walking_minutes
        < summary_round.timeline.total_walking_minutes
    )


def test_consumables_budgeting(synthetic_route_plan: RoutePlan) -> None:
    """Test oxygen and battery consumable proxy calculations."""
    calc = EVAMissionCalculator()
    summary = calc.evaluate_mission(synthetic_route_plan)

    c = summary.consumables
    # Usable O2 capacity is 1200g
    assert c.o2_capacity_per_suit_g == 1200.0
    assert 0.0 < c.o2_consumed_per_crew_g < 1200.0
    assert c.o2_remaining_per_suit_g == c.o2_capacity_per_suit_g - c.o2_consumed_per_crew_g
    assert 0.0 < c.o2_margin_pct < 100.0

    # Battery capacity is 1800 Wh
    assert c.battery_capacity_wh == 1800.0
    assert 0.0 < c.battery_energy_consumed_wh < 1800.0
    assert c.battery_remaining_wh == c.battery_capacity_wh - c.battery_energy_consumed_wh
    assert 0.0 < c.battery_margin_pct < 100.0

    # Total crew O2 consumption scales with crew count (2 astronauts)
    assert pytest.approx(c.total_o2_consumed_all_crew_g) == c.o2_consumed_per_crew_g * 2.0
    assert c.metabolic_energy_expended_kcal > 100.0
    assert c.average_metabolic_power_w > 100.0


def test_feasibility_warnings_triggered(synthetic_route_plan: RoutePlan) -> None:
    """Test detection and severity of constraint violations and feasibility warnings."""
    # Custom equipment with tiny 50g O2 capacity and 1 hour limit to force violations
    extreme_assumptions = MissionPlanningAssumptions(
        equipment=EquipmentAssumptions(
            total_usable_o2_capacity_g=50.0,
            max_recommended_eva_duration_hours=0.5,
        )
    )

    calc = EVAMissionCalculator(extreme_assumptions)
    summary = calc.evaluate_mission(synthetic_route_plan)

    # Must be marked non-feasible due to critical violations
    assert not summary.is_feasible
    severities = [w.severity for w in summary.warnings]
    assert WarningSeverity.CRITICAL in severities

    codes = [w.code for w in summary.warnings]
    assert "EVA_DURATION_EXCEEDED" in codes
    assert "O2_DEPLETION_PROJECTED" in codes


def test_epistemic_classification_and_disclaimers(synthetic_route_plan: RoutePlan) -> None:
    """Verify epistemic classification and mandatory disclaimers."""
    calc = EVAMissionCalculator()
    summary = calc.evaluate_mission(synthetic_route_plan)

    assert summary.epistemic_class == EpistemicClass.SIMULATED.value
    assert summary.disclaimer == DISCLAIMER
    assert "illustrative placeholder" in summary.assumptions_used["crew"]["status"]


def test_api_mission_endpoints(client: TestClient) -> None:
    """Test FastAPI mission planning endpoints."""
    # 1. Default assumptions
    resp_def = client.get("/api/v1/mission/default-assumptions")
    assert resp_def.status_code == 200
    data_def = resp_def.json()
    assert "crew" in data_def
    assert "equipment" in data_def
    assert "timeline" in data_def

    # 2. Plan mission
    payload = {
        "start": {"lat": 18.4446, "lon": 77.4509},
        "destination": {"lat": 18.4550, "lon": 77.4050},
        "profile": "BALANCED",
        "science_stops_count": 2,
        "is_round_trip": True,
        "algorithm": "astar",
        "simplify": True,
    }
    resp_plan = client.post("/api/v1/mission/plan", json=payload)
    assert resp_plan.status_code == 200
    data_plan = resp_plan.json()
    assert "mission" in data_plan
    assert "route_feature" in data_plan
    mission = data_plan["mission"]
    assert "timeline" in mission
    assert "consumables" in mission
    assert "warnings" in mission
    assert mission["is_feasible"] is True

    # 3. Compare mission profiles
    resp_comp = client.post("/api/v1/mission/compare", json=payload)
    assert resp_comp.status_code == 200
    data_comp = resp_comp.json()
    assert "profiles" in data_comp
    assert "SAFETY_FIRST" in data_comp["profiles"]
    assert "SCIENCE_FIRST" in data_comp["profiles"]
    assert "BALANCED" in data_comp["profiles"]


def test_pandolf_santee_metabolic_equations() -> None:
    """Verify adapted Pandolf/Santee equation slope penalties and load scaling."""
    # 1. Level walking
    p_level = calculate_pandolf_santee_metabolic_power(
        body_mass_kg=75.0,
        suit_mass_kg=50.0,
        speed_mps=1.0,
        slope_grade_pct=0.0,
    )
    assert 350.0 <= p_level <= 450.0

    # 2. Uphill grade increases metabolic power monotonically
    p_uphill_5 = calculate_pandolf_santee_metabolic_power(
        body_mass_kg=75.0,
        suit_mass_kg=50.0,
        speed_mps=1.0,
        slope_grade_pct=5.0,
    )
    p_uphill_15 = calculate_pandolf_santee_metabolic_power(
        body_mass_kg=75.0,
        suit_mass_kg=50.0,
        speed_mps=1.0,
        slope_grade_pct=15.0,
    )
    assert p_uphill_5 > p_level
    assert p_uphill_15 > p_uphill_5

    # 3. Downhill slope provides mechanical gravity assist
    p_downhill_5 = calculate_pandolf_santee_metabolic_power(
        body_mass_kg=75.0,
        suit_mass_kg=50.0,
        speed_mps=1.0,
        slope_grade_pct=-5.0,
    )
    assert p_downhill_5 < p_level

    # 4. Spacesuit mass penalty: heavier suit increases metabolic expenditure
    p_heavy_suit = calculate_pandolf_santee_metabolic_power(
        body_mass_kg=75.0,
        suit_mass_kg=100.0,
        speed_mps=1.0,
        slope_grade_pct=0.0,
    )
    assert p_heavy_suit > p_level

    # 5. Non-negative physiological floor
    p_min = calculate_pandolf_santee_metabolic_power(
        body_mass_kg=40.0,
        suit_mass_kg=0.0,
        speed_mps=0.1,
        slope_grade_pct=-30.0,
    )
    assert p_min >= 100.0


def test_multi_destination_mission_planning(client: TestClient) -> None:
    """Verify sequential multi-waypoint planning, legs, PNR, and emergency RTB calculation."""
    payload = {
        "origin": {"lat": 18.4446, "lon": 77.4509},
        "waypoints": [
            {"lat": 18.4485, "lon": 77.4320},
            {"lat": 18.4550, "lon": 77.4050},
        ],
        "profile": "BALANCED",
        "return_to_origin": True,
        "science_duration_per_stop_min": 15.0,
    }
    resp = client.post("/api/v1/mission/multi-destination", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["waypoint_count"] == 2
    assert data["return_to_origin"] is True
    assert len(data["legs"]) == 3  # Leg 1 -> Leg 2 -> Return to base
    assert data["total_distance_m"] > 0
    assert data["total_duration_hours"] > 0
    assert data["total_o2_consumed_g"] > 0
    assert data["total_battery_consumed_wh"] > 0
    assert "remaining_o2_reserve_pct" in data
    assert "remaining_battery_reserve_pct" in data
    assert len(data["emergency_return_paths"]) >= 1
    assert data["legs"][2]["is_return_leg"] is True


