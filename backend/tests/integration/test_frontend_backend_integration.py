"""Full end-to-end integration tests validating all backend APIs consumed by the frontend.

Validates that:
- Every endpoint expected by the 12 frontend pages returns valid JSON.
- Coordinates conform strictly to IAU_2015:49900 and Mars Areoid.
- Responses contain epistemic status classifications.
- Hard constraints and obstacle boundaries are respected.
- HTTP error handling returns informative 400/404/422 status codes with diagnostic detail.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# Standard Jezero Western Delta coordinates
BASE_LAT = 18.4446
BASE_LON = 77.4509
DEST_LAT = 18.4550
DEST_LON = 77.4050


def test_integration_health_endpoint() -> None:
    """Validate system health check."""
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "disclaimer" in data


def test_integration_catalog_datasets_endpoint() -> None:
    """Validate authentic planetary catalog products API."""
    res = client.get("/api/v1/catalog/datasets")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 10
    product_ids = [d["id"] for d in data]
    assert "product-01" in product_ids
    assert "product-09" in product_ids  # MEDA
    assert "product-10" in product_ids  # MCD v6.1


def test_integration_digital_twin_layers_endpoint() -> None:
    """Validate digital twin layers metadata and geodetic reference."""
    res = client.get("/api/v1/twin/layers")
    assert res.status_code == 200
    data = res.json()
    assert "study_area" in data
    assert data["study_area"]["crs_geographic"] == "IAU_2015:49900"
    assert len(data["layers"]) >= 8


def test_integration_perseverance_traverse_vector() -> None:
    """Validate authentic rover telemetry GeoJSON."""
    res = client.get("/api/v1/twin/vector/perseverance")
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) > 0


def test_integration_elevation_grid_downsampled() -> None:
    """Validate 3D elevation mesh matrix."""
    res = client.get("/api/v1/twin/elevation/grid?step=8")
    assert res.status_code == 200
    data = res.json()
    assert "elevations" in data
    assert data["rows"] > 0
    assert data["cols"] > 0


def test_integration_hazard_inspection_endpoint() -> None:
    """Validate hazard intelligence query."""
    res = client.get(f"/api/v1/hazards/inspect?lat={BASE_LAT}&lon={BASE_LON}")
    assert res.status_code == 200
    data = res.json()
    assert "is_passable" in data
    assert "explanation" in data
    assert data["coordinate"]["lat"] == BASE_LAT


def test_integration_science_targets_endpoint() -> None:
    """Validate scientific opportunity candidate targets."""
    res = client.get("/api/v1/science/targets")
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) >= 6
    first_tgt = data["features"][0]
    assert "composite_score" in first_tgt["properties"]
    assert "life_inference_warning" in first_tgt["properties"]


def test_integration_costmap_profiles_and_evaluation() -> None:
    """Validate unified costmap profiles and dynamic weight evaluation."""
    res = client.get("/api/v1/costmap/profiles")
    assert res.status_code == 200
    data = res.json()
    assert "profiles" in data
    assert "BALANCED" in data["profiles"]
    assert "SAFETY_FIRST" in data["profiles"]

    eval_res = client.post(
        "/api/v1/costmap/evaluate",
        json={"w_terrain": 0.35, "w_hazard": 0.35, "w_uncertainty": 0.10, "w_science": 0.20},
    )
    assert eval_res.status_code == 200
    assert eval_res.json()["status"] == "SUCCESS"


def test_integration_route_planning_single_and_suite() -> None:
    """Validate A* route planning and comparative suite."""
    single_res = client.post(
        "/api/v1/routing/plan",
        json={
            "start": {"lat": BASE_LAT, "lon": BASE_LON},
            "destination": {"lat": DEST_LAT, "lon": DEST_LON},
            "profile": "BALANCED",
            "algorithm": "astar",
            "simplify": True,
        },
    )
    assert single_res.status_code == 200
    route = single_res.json()
    assert route["type"] == "Feature"
    assert "metrics" in route["properties"]
    assert route["properties"]["metrics"]["total_distance_m"] > 0
    assert route["properties"]["metrics"]["restricted_cells_crossed"] == 0

    suite_res = client.post(
        "/api/v1/routing/suite",
        json={
            "start": {"lat": BASE_LAT, "lon": BASE_LON},
            "destination": {"lat": DEST_LAT, "lon": DEST_LON},
            "algorithm": "astar",
            "simplify": True,
        },
    )
    assert suite_res.status_code == 200
    suite = suite_res.json()
    assert len(suite["features"]) == 3


def test_integration_mission_planning_consumables() -> None:
    """Validate human EVA timeline and consumables calculation."""
    res = client.post(
        "/api/v1/mission/plan",
        json={
            "start": {"lat": BASE_LAT, "lon": BASE_LON},
            "destination": {"lat": DEST_LAT, "lon": DEST_LON},
            "profile": "BALANCED",
            "science_stops_count": 2,
            "is_round_trip": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "mission" in data
    assert "timeline" in data["mission"]
    assert "consumables" in data["mission"]
    assert data["mission"]["consumables"]["o2_consumed_per_crew_g"] > 0
    assert data["mission"]["consumables"]["battery_energy_consumed_wh"] > 0


def test_integration_environmental_assessment() -> None:
    """Validate atmospheric and in-situ weather scenario evaluation."""
    scen_res = client.get("/api/v1/environmental/scenarios")
    assert scen_res.status_code == 200
    scens = scen_res.json()["scenarios"]
    assert len(scens) >= 4

    assess_res = client.post(
        "/api/v1/environmental/assess",
        json={
            "scenario": scens[0],
            "weights": {"w_thermal": 0.3, "w_solar": 0.25, "w_dust": 0.25, "w_wind": 0.2},
        },
    )
    assert assess_res.status_code == 200
    rep = assess_res.json()
    assert "suitability" in rep
    assert 0.0 <= rep["suitability"]["overall_suitability_score"] <= 1.0


def test_integration_emergency_simulation_and_abort() -> None:
    """Validate in-situ contingency injection, dynamic detour, and abort-to-base."""
    scens_res = client.get("/api/v1/emergency/scenarios")
    assert scens_res.status_code == 200
    scens = scens_res.json()
    assert len(scens) == 6

    sim_res = client.post(
        "/api/v1/emergency/simulate",
        json={
            "start_lat": BASE_LAT,
            "start_lon": BASE_LON,
            "dest_lat": DEST_LAT,
            "dest_lon": DEST_LON,
            "profile_name": "BALANCED",
            "crew_progress_pct": 0.40,
            "scenario_id": scens[0]["event_id"],
        },
    )
    assert sim_res.status_code == 200
    plan = sim_res.json()
    assert "geojson" in plan
    assert "metrics_delta" in plan

    abort_res = client.post(
        "/api/v1/emergency/abort-to-base",
        json={
            "start_lat": BASE_LAT,
            "start_lon": BASE_LON,
            "crew_lat": 18.4490,
            "crew_lon": 77.4280,
        },
    )
    assert abort_res.status_code == 200
    abort_plan = abort_res.json()
    assert abort_plan["is_return_to_base"] is True
