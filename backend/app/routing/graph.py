"""Eight-directional grid graph representation for planetary terrain pathfinding.

Enforces:
1. Physical movement distances (20m cardinal, 20m * sqrt(2) diagonal).
2. Cost-weighted transition edges.
3. Hard traversability restrictions.
4. Diagonal corner-cutting prevention across obstacle vertices.
5. Admissible, consistent octile distance heuristic for A* search.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

SQRT_2 = math.sqrt(2.0)


@dataclass(frozen=True)
class GridNeighbor:
    """An adjacent traversable neighbor cell and transition metrics."""

    row: int
    col: int
    step_distance_m: float
    transition_cost: float


class GridGraph:
    """Eight-connected spatial grid graph with obstacle collision avoidance."""

    def __init__(
        self,
        cost_raster: np.ndarray,
        hard_blocked_mask: np.ndarray,
        cell_size_m: float = 20.0,
    ) -> None:
        if cost_raster.shape != hard_blocked_mask.shape:
            raise ValueError("Cost raster and hard blocked mask shapes must match exactly.")

        self.cost_raster = cost_raster
        self.hard_blocked_mask = hard_blocked_mask
        self.height, self.width = cost_raster.shape
        self.cell_size_m = cell_size_m

        # Minimum possible cost multiplier (1.0) for admissible heuristic scaling
        self.min_cost_multiplier = 1.0

        # Cardinal and diagonal neighbor relative offsets
        # Cardinal offsets: (dr, dc, is_diagonal)
        self._moves: list[tuple[int, int, bool]] = [
            (-1, 0, False),  # North
            (1, 0, False),  # South
            (0, -1, False),  # West
            (0, 1, False),  # East
            (-1, -1, True),  # Northwest
            (-1, 1, True),  # Northeast
            (1, -1, True),  # Southwest
            (1, 1, True),  # Southeast
        ]

    def in_bounds(self, r: int, c: int) -> bool:
        """Check if grid index is within raster boundaries."""
        return 0 <= r < self.height and 0 <= c < self.width

    def is_passable(self, r: int, c: int) -> bool:
        """Check if grid cell is inside bounds and not hard-blocked."""
        return self.in_bounds(r, c) and not self.hard_blocked_mask[r, c]

    def get_neighbors(self, r: int, c: int) -> list[GridNeighbor]:
        """Return valid 8-directional traversable neighbors.

        Prevents diagonal corner-cutting: when moving diagonally from (r, c) to (r+dr, c+dc),
        both orthogonal neighbors (r+dr, c) and (r, c+dc) must be passable.
        """
        neighbors: list[GridNeighbor] = []
        u_cost = float(self.cost_raster[r, c])

        for dr, dc, is_diag in self._moves:
            nr, nc = r + dr, c + dc

            # Destination cell must be passable
            if not self.is_passable(nr, nc):
                continue

            # Diagonal corner-cutting check
            if is_diag:
                # Orthogonal components
                ortho_1_passable = self.is_passable(r + dr, c)
                ortho_2_passable = self.is_passable(r, c + dc)
                if not (ortho_1_passable and ortho_2_passable):
                    # Movement would cut through or graze an obstacle corner
                    continue
                step_dist = self.cell_size_m * SQRT_2
            else:
                step_dist = self.cell_size_m

            v_cost = float(self.cost_raster[nr, nc])
            # Average cell cost multiplied by physical step distance
            edge_cost = step_dist * ((u_cost + v_cost) / 2.0)

            neighbors.append(
                GridNeighbor(
                    row=nr,
                    col=nc,
                    step_distance_m=step_dist,
                    transition_cost=edge_cost,
                )
            )

        return neighbors

    def octile_heuristic(self, r1: int, c1: int, r2: int, c2: int) -> float:
        """Admissible and consistent octile distance heuristic on an 8-connected grid.

        Scaled by the minimum possible cell cost multiplier (1.0).
        Guarantees h(n) <= true remaining cost, ensuring optimal A* paths.
        """
        dr = abs(r1 - r2)
        dc = abs(c1 - c2)
        min_d = min(dr, dc)
        max_d = max(dr, dc)
        # Optimal octile distance formula
        octile_steps = (SQRT_2 - 1.0) * min_d + max_d
        return octile_steps * self.cell_size_m * self.min_cost_multiplier
