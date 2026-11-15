"""Unit tests for the Marswalk Route Optimization Engine.

Covers:
- Known shortest-path grid evaluation
- Obstacle avoidance and barrier wrapping
- Impossible destination detection (UnreachableDestinationError)
- Blocked start and goal cells (BlockedStartError, BlockedDestinationError)
- Diagonal corner-cutting prevention across obstacle vertices
- A* versus Dijkstra optimality (both yield identical minimal cost)
- Route simplification without obstacle collision
- Real Jezero Crater route suite (Safety-First, Science-First, Balanced)
- REST API endpoints for single plan and comparative suite
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routing.engine import RouteOptimizationEngine
from app.routing.exceptions import (
    BlockedDestinationError,
    BlockedStartError,
    OutOfBoundsCoordinateError,
    UnreachableDestinationError,
)
from app.routing.graph import GridGraph
from app.routing.search import find_path
from app.routing.simplifier import simplify_path

client = TestClient(app)


def test_known_shortest_path_grid():
    """Test optimal 8-directional path on a uniform 5x5 grid with known diagonal shortest path."""
    shape = (5, 5)
    cost = np.ones(shape, dtype=np.float32)  # Uniform cost multiplier 1.0
    blocked = np.zeros(shape, dtype=bool)

    graph = GridGraph(cost, blocked, cell_size_m=20.0)
    path, dist, total_cost = find_path(graph, start=(0, 0), goal=(4, 4), algorithm="astar")

    # Optimal path is pure diagonal: (0,0) -> (1,1) -> (2,2) -> (3,3) -> (4,4)
    expected_path = [(0, 0), (1, 1), (2, 2), (3, 3), (4, 4)]
    assert path == expected_path

    # Diagonal distance: 4 steps * (20 * sqrt(2)) ≈ 113.137m
    expected_dist = 4 * 20.0 * math.sqrt(2.0)
    assert np.isclose(dist, expected_dist)
    assert np.isclose(total_cost, expected_dist * 1.0)


def test_obstacle_avoidance():
    """Test that path wraps around a barrier wall rather than crossing blocked cells."""
    shape = (7, 7)
    cost = np.ones(shape, dtype=np.float32)
    blocked = np.zeros(shape, dtype=bool)

    # Place vertical wall at col 3 with a gap only at row 0
    blocked[1:7, 3] = True

    graph = GridGraph(cost, blocked, cell_size_m=20.0)
    path, _, _ = find_path(graph, start=(3, 1), goal=(3, 5), algorithm="astar")

    # Path must route through the gap at row 0
    path_rows_at_col_3 = [r for r, c in path if c == 3]
    assert path_rows_at_col_3 == [0]

    # No blocked cell may be in the path
    for r, c in path:
        assert not blocked[r, c]


def test_impossible_destination_detection():
    """Test that fully enclosed destinations raise UnreachableDestinationError."""
    shape = (5, 5)
    cost = np.ones(shape, dtype=np.float32)
    blocked = np.zeros(shape, dtype=bool)

    # Box off goal (2, 2)
    blocked[1, 1:4] = True
    blocked[3, 1:4] = True
    blocked[2, 1] = True
    blocked[2, 3] = True

    graph = GridGraph(cost, blocked, cell_size_m=20.0)
    with pytest.raises(UnreachableDestinationError):
        find_path(graph, start=(0, 0), goal=(2, 2))


def test_blocked_start_and_end_cells():
    """Test that blocked or out-of-bounds start/goal cells raise appropriate domain errors."""
    shape = (4, 4)
    cost = np.ones(shape, dtype=np.float32)
    blocked = np.zeros(shape, dtype=bool)
    blocked[0, 0] = True
    blocked[3, 3] = True

    graph = GridGraph(cost, blocked, cell_size_m=20.0)

    # Blocked start
    with pytest.raises(BlockedStartError):
        find_path(graph, start=(0, 0), goal=(2, 2))

    # Blocked goal
    with pytest.raises(BlockedDestinationError):
        find_path(graph, start=(1, 1), goal=(3, 3))

    # Out of bounds
    with pytest.raises(OutOfBoundsCoordinateError):
        find_path(graph, start=(-1, 0), goal=(2, 2))


def test_diagonal_corner_cutting_prevention():
    """Test that diagonal movements cannot cut across the corner of touching obstacles."""
    # 2x2 grid:
    # (0, 0): passable   (0, 1): BLOCKED
    # (1, 0): BLOCKED    (1, 1): passable
    shape = (2, 2)
    cost = np.ones(shape, dtype=np.float32)
    blocked = np.zeros(shape, dtype=bool)
    blocked[0, 1] = True
    blocked[1, 0] = True

    graph = GridGraph(cost, blocked, cell_size_m=20.0)

    # Moving diagonally from (0,0) to (1,1) would cut the obstacle pinch point
    # Because (0, 1) and (1, 0) are both blocked, corner cutting is prohibited!
    with pytest.raises(UnreachableDestinationError):
        find_path(graph, start=(0, 0), goal=(1, 1))


def test_astar_vs_dijkstra_optimality():
    """Test that A* and Dijkstra yield the identical minimal path cost on a non-uniform grid."""
    shape = (15, 15)
    rng = np.random.default_rng(101)
    # Random cell costs between 1.0 and 8.0
    cost = rng.uniform(1.0, 8.0, size=shape).astype(np.float32)
    blocked = np.zeros(shape, dtype=bool)
    # Random obstacles
    blocked[5, 2:10] = True
    blocked[9, 5:13] = True

    graph = GridGraph(cost, blocked, cell_size_m=20.0)
    start = (1, 1)
    goal = (13, 13)

    _, dist_astar, cost_astar = find_path(graph, start, goal, algorithm="astar")
    _, dist_dijkstra, cost_dijkstra = find_path(graph, start, goal, algorithm="dijkstra")

    # A* and Dijkstra must achieve the exact same optimal accumulated cost
    assert np.isclose(cost_astar, cost_dijkstra, atol=1e-3)
    assert np.isclose(dist_astar, dist_dijkstra, atol=1e-3)


def test_route_simplification():
    """Test that route simplification reduces waypoint count without obstacle collisions."""
    shape = (10, 10)
    cost = np.ones(shape, dtype=np.float32)
    blocked = np.zeros(shape, dtype=bool)

    graph = GridGraph(cost, blocked, cell_size_m=20.0)
    # Diagonal staircase path from (0,0) to (0,6)
    path = [(0, c) for c in range(7)]

    simplified = simplify_path(path, graph)
    # Straight open corridor simplifies down to [start, goal]
    assert len(simplified) == 2
    assert simplified[0] == (0, 0)
    assert simplified[-1] == (0, 6)


def test_simplifier_corner_cut_prevention():
    """Verify that route simplification does not string-pull across pinch-point vertices."""
    from app.routing.simplifier import line_of_sight_clear

    shape = (3, 3)
    cost = np.ones(shape, dtype=np.float32)
    blocked = np.zeros(shape, dtype=bool)
    blocked[0, 1] = True
    blocked[1, 0] = True
    graph = GridGraph(cost, blocked, cell_size_m=20.0)

    # Direct diagonal from (0,0) to (1,1) cuts between blocked (0,1) and (1,0)
    assert not line_of_sight_clear(graph, 0, 0, 1, 1)


def test_jezero_suite_route_profiles():
    """Test computing comparative routes across Jezero Western Delta study area."""
    engine = RouteOptimizationEngine()
    # Near Perseverance Octavia Butler landing site -> Hawksbill Gap Delta Front
    start_lat, start_lon = 18.4446, 77.4509
    dest_lat, dest_lon = 18.4550, 77.4050

    suite = engine.compute_suite(start_lat, start_lon, dest_lat, dest_lon)
    assert "SAFETY_FIRST" in suite
    assert "SCIENCE_FIRST" in suite
    assert "BALANCED" in suite

    plan_safety = suite["SAFETY_FIRST"]
    plan_science = suite["SCIENCE_FIRST"]

    # In no case may a route cross restricted or unknown cells
    assert plan_safety.metrics.restricted_cells_crossed == 0
    assert plan_safety.metrics.unknown_cells_crossed == 0
    assert plan_science.metrics.restricted_cells_crossed == 0
    assert plan_science.metrics.unknown_cells_crossed == 0

    # Physical distance must be positive
    assert plan_safety.metrics.total_distance_m > 1000.0


def test_routing_api_plan_endpoint():
    """Test POST /api/v1/routing/plan endpoint returns valid GeoJSON LineString."""
    payload = {
        "start": {"lat": 18.4446, "lon": 77.4509},
        "destination": {"lat": 18.4550, "lon": 77.4050},
        "profile": "BALANCED",
        "algorithm": "astar",
        "simplify": True,
    }
    response = client.post("/api/v1/routing/plan", json=payload)
    assert response.status_code == 200
    geojson = response.json()
    assert geojson["type"] == "Feature"
    assert geojson["geometry"]["type"] == "LineString"
    props = geojson["properties"]
    assert "metrics" in props
    assert props["metrics"]["restricted_cells_crossed"] == 0
    assert props["metrics"]["total_distance_m"] > 0


def test_routing_api_suite_endpoint():
    """Test POST /api/v1/routing/suite endpoint returns comparative FeatureCollection."""
    payload = {
        "start": {"lat": 18.4446, "lon": 77.4509},
        "destination": {"lat": 18.4550, "lon": 77.4050},
        "algorithm": "astar",
        "simplify": True,
    }
    response = client.post("/api/v1/routing/suite", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 3
    assert "comparison" in data
    assert "SAFETY_FIRST" in data["comparison"]
    assert "SCIENCE_FIRST" in data["comparison"]
    assert "BALANCED" in data["comparison"]


def test_routing_api_invalid_algorithm_returns_422():
    """Verify that submitting an unsupported algorithm via the API returns HTTP 422."""
    payload = {
        "start": {"lat": 18.4446, "lon": 77.4509},
        "destination": {"lat": 18.4550, "lon": 77.4050},
        "profile": "BALANCED",
        "algorithm": "quantum_annealing",  # Unsupported algorithm
        "simplify": True,
    }
    response = client.post("/api/v1/routing/plan", json=payload)
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("algorithm" in err["loc"] for err in errors)


def test_find_path_invalid_algorithm_raises_value_error():
    """Direct invocation of find_path with an unsupported algorithm must raise ValueError."""
    shape = (5, 5)
    cost = np.ones(shape, dtype=np.float32)
    blocked = np.zeros(shape, dtype=bool)
    graph = GridGraph(cost, blocked, cell_size_m=20.0)

    with pytest.raises(ValueError, match="Unsupported routing algorithm"):
        find_path(graph, start=(0, 0), goal=(4, 4), algorithm="floyd_warshall")


def test_grid_graph_defensive_cost_validation():
    """GridGraph must reject invalid cost inputs: sub-unit, NaNs, -inf, non-positive cell size."""
    shape = (5, 5)
    valid_blocked = np.zeros(shape, dtype=bool)

    # 1. Sub-unit cost (< 1.0) must be rejected to preserve A* admissibility
    sub_unit_cost = np.ones(shape, dtype=np.float32)
    sub_unit_cost[2, 2] = 0.5
    with pytest.raises(ValueError, match="Traversable cost values must be >= 1.0"):
        GridGraph(sub_unit_cost, valid_blocked, cell_size_m=20.0)

    # 2. NaN values must be rejected
    nan_cost = np.ones(shape, dtype=np.float32)
    nan_cost[1, 1] = np.nan
    with pytest.raises(ValueError, match="NaN values"):
        GridGraph(nan_cost, valid_blocked, cell_size_m=20.0)

    # 3. Negative infinity must be rejected
    neginf_cost = np.ones(shape, dtype=np.float32)
    neginf_cost[0, 0] = -np.inf
    with pytest.raises(ValueError, match="negative infinity"):
        GridGraph(neginf_cost, valid_blocked, cell_size_m=20.0)

    # 4. Non-positive cell size must be rejected
    valid_cost = np.ones(shape, dtype=np.float32)
    with pytest.raises(ValueError, match="strictly positive"):
        GridGraph(valid_cost, valid_blocked, cell_size_m=0.0)

    with pytest.raises(ValueError, match="strictly positive"):
        GridGraph(valid_cost, valid_blocked, cell_size_m=-20.0)

    # 5. Graph with all cells blocked must be rejected
    all_blocked = np.ones(shape, dtype=bool)
    with pytest.raises(ValueError, match="no traversable cells"):
        GridGraph(valid_cost, all_blocked, cell_size_m=20.0)

    # 6. Positive infinity is allowed as an obstacle, but must not be passable
    inf_cost = np.ones(shape, dtype=np.float32)
    inf_cost[2, 3] = np.inf
    inf_graph = GridGraph(inf_cost, valid_blocked, cell_size_m=20.0)
    assert not inf_graph.is_passable(2, 3)


def test_latlon_to_grid_rejects_non_finite_coordinates():
    """Engine.latlon_to_grid must reject NaN, inf, or None coordinates with ValueError."""
    engine = RouteOptimizationEngine()

    with pytest.raises(ValueError, match="Coordinate values must be finite numbers"):
        engine.latlon_to_grid(float("nan"), 77.40)

    with pytest.raises(ValueError, match="Coordinate values must be finite numbers"):
        engine.latlon_to_grid(18.45, float("inf"))

    with pytest.raises(ValueError, match="Coordinate values must be finite numbers"):
        engine.latlon_to_grid(float("-inf"), 77.40)


def test_compute_multi_stop_route():
    """Engine must compute multi-stop route and identify visited science targets."""
    engine = RouteOptimizationEngine()

    # Jezero Delta Scarp area coordinates
    start_lat, start_lon = 18.4446, 77.4509  # Near Perseverance landing
    wp_lat, wp_lon = 18.459456, 77.408313    # Kodiak Butte (SCI-01-KODIAK)
    dest_lat, dest_lon = 18.4550, 77.4050   # Hawksbill Gap Delta Front

    plan = engine.compute_multi_stop_route(
        stops=[(start_lat, start_lon), (wp_lat, wp_lon), (dest_lat, dest_lon)],
        profile_name="BALANCED",
    )

    assert plan is not None
    assert len(plan.waypoints) > 5
    assert plan.metrics.total_distance_m > 0.0
    # Kodiak should be visited since we routed directly to it
    assert "SCI-01-KODIAK" in plan.metrics.visited_target_ids
    assert plan.metrics.scientific_targets_count >= 1

    d = plan.metrics.to_dict()
    assert "visited_target_ids" in d
    assert "scientific_targets_count" in d
    assert d["scientific_targets_count"] >= 1


def test_api_multi_stop_routing_endpoints():
    """REST API endpoints (/plan, /suite, /compare) must support intermediate waypoints."""
    start = {"lat": 18.4446, "lon": 77.4509}
    dest = {"lat": 18.4550, "lon": 77.4050}
    wp = {"lat": 18.459456, "lon": 77.408313}

    # 1. /plan with waypoints
    resp_plan = client.post(
        "/api/v1/routing/plan",
        json={"start": start, "destination": dest, "waypoints": [wp], "profile": "BALANCED"},
    )
    assert resp_plan.status_code == 200
    feat = resp_plan.json()
    assert feat["type"] == "Feature"
    assert "visited_target_ids" in feat["properties"]["metrics"]
    assert "SCI-01-KODIAK" in feat["properties"]["metrics"]["visited_target_ids"]

    # 2. /suite with waypoints
    resp_suite = client.post(
        "/api/v1/routing/suite",
        json={"start": start, "destination": dest, "waypoints": [wp]},
    )
    assert resp_suite.status_code == 200
    suite_data = resp_suite.json()
    assert len(suite_data["features"]) == 3
    for prof in ["SAFETY_FIRST", "SCIENCE_FIRST", "BALANCED"]:
        assert "visited_target_ids" in suite_data["comparison"][prof]

    # 3. /compare with waypoints
    resp_compare = client.post(
        "/api/v1/routing/compare",
        json={
            "start": start,
            "destination": dest,
            "waypoints": [wp],
            "preferences": {
                "safety_importance": 0.4,
                "science_importance": 0.4,
                "efficiency_importance": 0.2,
            },
        },
    )
    assert resp_compare.status_code == 200
    comp_data = resp_compare.json()
    assert len(comp_data["comparison"]["routes"]) == 3
    for r in comp_data["comparison"]["routes"]:
        assert "visited_target_ids" in r
        assert "scientific_targets_count" in r
