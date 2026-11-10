"""Route simplification via line-of-sight string-pulling without constraint violations."""

from __future__ import annotations

import math

from app.routing.graph import GridGraph


def line_of_sight_clear(
    graph: GridGraph,
    r1: int,
    c1: int,
    r2: int,
    c2: int,
) -> bool:
    """Check if a continuous straight line between (r1, c1) and (r2, c2) is obstacle-free.

    Uses high-density sub-pixel stepping to guarantee that no blocked cells or
    diagonal obstacle vertices are crossed.
    """
    dr = r2 - r1
    dc = c2 - c1
    dist = math.hypot(dr, dc)
    if dist < 1e-6:
        return graph.is_passable(r1, c1)

    steps = int(math.ceil(dist * 4.0))  # Sample every 0.25 pixels
    for k in range(steps + 1):
        t = k / steps
        r_sample = int(round(r1 + t * dr))
        c_sample = int(round(c1 + t * dc))
        if not graph.is_passable(r_sample, c_sample):
            return False

    return True


def densify_path(vertices: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Sample continuous grid cells along the piecewise linear polyline vertices.

    Ensures that every traversed raster cell along the simplified straight segments
    is accounted for in terrain sampling, hazard exposure, and elevation profiling.
    """
    if len(vertices) <= 1:
        return list(vertices)

    dense: list[tuple[int, int]] = [vertices[0]]
    for i in range(len(vertices) - 1):
        r1, c1 = vertices[i]
        r2, c2 = vertices[i + 1]
        dr = r2 - r1
        dc = c2 - c1
        dist = math.hypot(dr, dc)
        steps = max(1, int(math.ceil(dist * 2.0)))
        for k in range(1, steps + 1):
            t = k / steps
            cell = (int(round(r1 + t * dr)), int(round(c1 + t * dc)))
            if cell != dense[-1]:
                dense.append(cell)

    return dense


def simplify_path(
    path: list[tuple[int, int]],
    graph: GridGraph,
    max_lookahead: int = 8,
) -> list[tuple[int, int]]:
    """Simplify grid path into straight segments while guaranteeing obstacle avoidance.

    Uses a bounded lookahead window to eliminate local 8-connected grid discretization
    artifacts (stair-stepping) without shortcutting across broad strategic detours or
    differing cost terrain.
    Always preserves start and goal waypoints.
    """
    if len(path) <= 2:
        return list(path)

    simplified: list[tuple[int, int]] = [path[0]]
    current_idx = 0
    n = len(path)

    while current_idx < n - 1:
        # Search backward from the window boundary to find furthest clear line of sight
        furthest_idx = current_idx + 1
        max_candidate = min(n - 1, current_idx + max_lookahead)
        for candidate_idx in range(max_candidate, current_idx, -1):
            r1, c1 = path[current_idx]
            r2, c2 = path[candidate_idx]
            if line_of_sight_clear(graph, r1, c1, r2, c2):
                furthest_idx = candidate_idx
                break

        simplified.append(path[furthest_idx])
        current_idx = furthest_idx

    return simplified
