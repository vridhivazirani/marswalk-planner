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
