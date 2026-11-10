"""Evaluation engine for the Unified Cost Map.

Calculates normalized soft cost terms, enforces hard constraints separately,
guarantees that unknown data is never treated as safe or zero-cost, and synthesizes
reproducible, weighted cost maps across arbitrary mission profiles.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from app.costmap.profiles import CostmapWeights


@dataclass(frozen=True)
class CostmapBundle:
    """Evaluated unified cost map and individual normalized cost components."""

    c_terrain: np.ndarray  # Normalized terrain difficulty [0.0, 1.0]
    c_hazard: np.ndarray  # Normalized environmental hazard [0.0, 1.0]
    c_uncertainty: np.ndarray  # Normalized sensor uncertainty [0.0, 1.0]
    c_science_opportunity: np.ndarray  # Science opportunity score [0.0, 1.0]
    combined_cost: np.ndarray  # Final cost multiplier [1.0, 10.0] on passable, inf on blocked
    hard_blocked_mask: np.ndarray  # True where travel is strictly forbidden
    unknown_mask: np.ndarray  # True where data is missing / unmapped
    weights: CostmapWeights
    statistics: dict[str, Any]


def normalize_terrain_difficulty(
    slope: np.ndarray,
    tri: np.ndarray,
    valid_mask: np.ndarray,
    max_slope_deg: float = 25.0,
    max_tri_m: float = 6.0,
) -> np.ndarray:
    """Normalize slope and roughness into a combined mechanical difficulty index in [0.0, 1.0]."""
    s_norm = np.clip(slope / max(1.0, max_slope_deg), 0.0, 1.0)
    tri_norm = np.clip(tri / max(0.1, max_tri_m), 0.0, 1.0)
    # 60% slope gradient difficulty, 40% surface roughness friction
    c_terrain = 0.60 * s_norm + 0.40 * tri_norm
    c_terrain = np.where(valid_mask, c_terrain, 1.0)
    return np.clip(c_terrain, 0.0, 1.0).astype(np.float32)


def normalize_uncertainty(
    sigma_z: np.ndarray,
    valid_mask: np.ndarray,
    min_sigma_m: float = 0.20,
    max_sigma_m: float = 2.00,
) -> np.ndarray:
    """Normalize elevation vertical uncertainty into a penalty in [0.0, 1.0]."""
    span = max(0.1, max_sigma_m - min_sigma_m)
    c_unc = np.clip((sigma_z - min_sigma_m) / span, 0.0, 1.0)
    c_unc = np.where(valid_mask, c_unc, 1.0)
    return np.clip(c_unc, 0.0, 1.0).astype(np.float32)


def compute_unified_costmap(
    slope: np.ndarray,
    tri: np.ndarray,
    hazard_score: np.ndarray,
    sigma_z: np.ndarray,
    science_opportunity: np.ndarray,
    data_coverage_mask: np.ndarray,
    hard_impassable_mask: np.ndarray,
    weights: CostmapWeights,
) -> CostmapBundle:
    """Compute the multi-criteria cost map using explicit hard/soft separation.

    Mathematical formulation:
      1. Missing data is identified: unknown_mask = ~data_coverage_mask.
      2. Hard blocked cells = hard_impassable_mask | unknown_mask.
      3. For all passable cells, soft cost components are normalized to [0.0, 1.0].
      4. Science opportunity provides an inverse penalty: c_sci = 1.0 - science_opportunity.
      5. Combined soft cost is scaled to a standard routing cost multiplier [1.0, 10.0]:
           C_soft = 1.0 + 9.0 * (w_terr * c_terr + w_haz * c_haz + w_unc * c_unc + w_sci * c_sci)
      6. Blocked and unknown cells are assigned cost = np.inf (strictly forbidden).
    """
    w_norm = weights.normalized()

    # Identify unknown / NoData areas
    unknown_mask = ~data_coverage_mask

    # Combine hard constraints and unknown areas (unknown is never safe by default)
    hard_blocked = hard_impassable_mask | unknown_mask

    # 1. Individual normalized terms [0.0, 1.0]
    c_terrain = normalize_terrain_difficulty(slope, tri, data_coverage_mask)
    c_hazard = np.where(data_coverage_mask, np.clip(hazard_score, 0.0, 1.0), 1.0).astype(np.float32)
    c_uncertainty = normalize_uncertainty(sigma_z, data_coverage_mask)
    c_science_opp = np.where(
        data_coverage_mask, np.clip(science_opportunity, 0.0, 1.0), 0.0
    ).astype(np.float32)

    # Opportunity cost of missing science: low science = high penalty
    c_science_penalty = 1.0 - c_science_opp

    # 2. Linear weighted sum in [0.0, 1.0]
    soft_sum = (
        w_norm.w_terrain * c_terrain
        + w_norm.w_hazard * c_hazard
        + w_norm.w_uncertainty * c_uncertainty
        + w_norm.w_science * c_science_penalty
    )

    # 3. Map to standard cost multiplier [1.0, 10.0]
    # 1.0 = optimal conditions (flat, safe, high-confidence, maximum science)
    # 10.0 = maximal difficulty passable terrain
    combined_soft = 1.0 + 9.0 * np.clip(soft_sum, 0.0, 1.0)

    # 4. Enforce infinite cost on blocked and unknown cells
    combined_cost = np.where(hard_blocked, np.inf, combined_soft).astype(np.float32)

    # Calculate descriptive statistics on passable cells
    passable_cells = combined_cost[~hard_blocked]
    total_cells = int(combined_cost.size)
    blocked_count = int(np.count_nonzero(hard_blocked))
    unknown_count = int(np.count_nonzero(unknown_mask))

    stats: dict[str, Any] = {
        "total_cells": total_cells,
        "blocked_cells": blocked_count,
        "blocked_percentage": round((blocked_count / total_cells) * 100.0, 2),
        "unknown_cells": unknown_count,
        "unknown_percentage": round((unknown_count / total_cells) * 100.0, 2),
        "weights_applied": w_norm.to_dict(),
    }

    if len(passable_cells) > 0:
        stats.update(
            {
                "mean_passable_cost": round(float(passable_cells.mean()), 3),
                "min_passable_cost": round(float(passable_cells.min()), 3),
                "max_passable_cost": round(float(passable_cells.max()), 3),
                "p50_passable_cost": round(float(np.median(passable_cells)), 3),
                "p90_passable_cost": round(float(np.percentile(passable_cells, 90)), 3),
            }
        )

    return CostmapBundle(
        c_terrain=c_terrain,
        c_hazard=c_hazard,
        c_uncertainty=c_uncertainty,
        c_science_opportunity=c_science_opp,
        combined_cost=combined_cost,
        hard_blocked_mask=hard_blocked,
        unknown_mask=unknown_mask,
        weights=w_norm,
        statistics=stats,
    )
