"""A* and Dijkstra shortest-path algorithms for 8-connected grid graphs."""

from __future__ import annotations

import heapq

from app.routing.exceptions import (
    BlockedDestinationError,
    BlockedStartError,
    OutOfBoundsCoordinateError,
    UnreachableDestinationError,
)
from app.routing.graph import GridGraph


def find_path(
    graph: GridGraph,
    start: tuple[int, int],
    goal: tuple[int, int],
    algorithm: str = "astar",
) -> tuple[list[tuple[int, int]], float, float]:
    """Find the optimal cost-weighted path between start and goal cells.

    Supports:
      - 'astar': Heuristic search using admissible octile distance.
      - 'dijkstra': Exact uniform-cost search (h = 0).

    Returns:
      (path, total_distance_m, accumulated_cost)

    Raises:
      OutOfBoundsCoordinateError: if start or goal is outside raster limits.
      BlockedStartError: if start cell is in blocked or unknown terrain.
      BlockedDestinationError: if destination cell is in blocked or unknown terrain.
      UnreachableDestinationError: if no continuous obstacle-free path exists.
    """
    sr, sc = start
    gr, gc = goal

    # 1. Start and destination validation
    if not graph.in_bounds(sr, sc):
        raise OutOfBoundsCoordinateError(
            f"Start coordinate ({sr}, {sc}) is out of grid bounds ({graph.height}, {graph.width})."
        )
    if not graph.in_bounds(gr, gc):
        raise OutOfBoundsCoordinateError(
            f"Goal coordinate ({gr}, {gc}) is out of grid bounds ({graph.height}, {graph.width})."
        )

    if not graph.is_passable(sr, sc):
        raise BlockedStartError(f"Start cell ({sr}, {sc}) is in hard-blocked or unknown terrain.")
    if not graph.is_passable(gr, gc):
        raise BlockedDestinationError(
            f"Destination cell ({gr}, {gc}) is in hard-blocked or unknown terrain."
        )

    if start == goal:
        return [start], 0.0, 0.0

    is_astar = algorithm.lower() == "astar"

    # Priority queue holds: (priority, accumulated_cost, (row, col))
    frontier: list[tuple[float, float, tuple[int, int]]] = []
    initial_h = graph.octile_heuristic(sr, sc, gr, gc) if is_astar else 0.0
    heapq.heappush(frontier, (initial_h, 0.0, start))

    came_from: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    cost_so_far: dict[tuple[int, int], float] = {start: 0.0}
    dist_so_far: dict[tuple[int, int], float] = {start: 0.0}

    goal_reached = False

    while frontier:
        _, current_cost, current = heapq.heappop(frontier)

        if current == goal:
            goal_reached = True
            break

        # If a cheaper path to current was already explored, skip
        if current_cost > cost_so_far[current]:
            continue

        cr, cc = current
        for neighbor in graph.get_neighbors(cr, cc):
            n_pos = (neighbor.row, neighbor.col)
            new_cost = current_cost + neighbor.transition_cost
            new_dist = dist_so_far[current] + neighbor.step_distance_m

            if n_pos not in cost_so_far or new_cost < cost_so_far[n_pos]:
                cost_so_far[n_pos] = new_cost
                dist_so_far[n_pos] = new_dist
                came_from[n_pos] = current

                h = graph.octile_heuristic(neighbor.row, neighbor.col, gr, gc) if is_astar else 0.0
                priority = new_cost + h
                heapq.heappush(frontier, (priority, new_cost, n_pos))

    if not goal_reached:
        raise UnreachableDestinationError(
            f"No obstacle-free path exists from start {start} to destination {goal}."
        )

    # Reconstruct optimal path from goal to start
    path: list[tuple[int, int]] = []
    curr: tuple[int, int] | None = goal
    while curr is not None:
        path.append(curr)
        curr = came_from[curr]

    path.reverse()
    return path, dist_so_far[goal], cost_so_far[goal]
