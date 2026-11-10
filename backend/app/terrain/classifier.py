"""Explainable rule-based terrain classification and confidence estimation for Marswalk Planner.

Evaluates whether supervised deep learning is scientifically feasible:
- Without extensive ground-truth labels at Jezero, supervised deep learning risks severe
  domain hallucination and false confidence.
- Therefore, we implement an explainable, physics-grounded classification engine
  and assign epistemic confidence to every cell.

Classes:
- 0: UNKNOWN / NO_DATA (Never safe by default)
- 1: SMOOTH_REGOLITH (Flat, low roughness, passable)
- 2: SAND_RIPPLES_DUNES (Soft terrain hazard, high traversal energy cost)
- 3: BOULDER_FIELD_ROCK (High roughness, tripping/obstacle hazard)
- 4: STEEP_SCARP_CLIFF (Slope > 25 degrees, hard impassable constraint)
- 5: CRATER_DEPRESSION (Impact pit, incised channel)
"""

from __future__ import annotations

from enum import IntEnum

import numpy as np

TERRAIN_CLASS_NAMES = {
    0: "UNKNOWN_NO_DATA",
    1: "SMOOTH_REGOLITH",
    2: "SAND_RIPPLES_DUNES",
    3: "BOULDER_FIELD_ROCK",
    4: "STEEP_SCARP_CLIFF",
    5: "CRATER_DEPRESSION",
}


class TerrainClass(IntEnum):
    UNKNOWN_NO_DATA = 0
    SMOOTH_REGOLITH = 1
    SAND_RIPPLES_DUNES = 2
    BOULDER_FIELD_ROCK = 3
    STEEP_SCARP_CLIFF = 4
    CRATER_DEPRESSION = 5


def classify_terrain(
    slope: np.ndarray,
    tri: np.ndarray,
    lev: np.ndarray,
    boulder_score: np.ndarray,
    sand_score: np.ndarray,
    crater_score: np.ndarray,
    valid_mask: np.ndarray,
    source_id: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Execute transparent heuristic classification and confidence estimation.

    Returns:
    - classification_map (uint8 array of TerrainClass IDs)
    - confidence_map (float32 array 0.0 to 1.0)
    """
    classes = np.zeros_like(slope, dtype=np.uint8)
    confidence = np.zeros_like(slope, dtype=np.float32)

    # 1. Unknown / No Data (Default 0, confidence 0.0)
    classes[~valid_mask] = TerrainClass.UNKNOWN_NO_DATA
    confidence[~valid_mask] = 0.0

    # 2. Smooth Regolith (Baseline for valid cells)
    classes[valid_mask] = TerrainClass.SMOOTH_REGOLITH
    confidence[valid_mask] = 0.70

    # 3. Sand Ripples / Dunes (sand_score > 0.60 and slope < 15)
    sand_cond = valid_mask & (sand_score >= 0.60) & (slope < 15.0)
    classes[sand_cond] = TerrainClass.SAND_RIPPLES_DUNES
    confidence[sand_cond] = 0.65 + 0.3 * (sand_score[sand_cond] - 0.60)

    # 4. Crater / Depression (crater_score > 0.50 and lev < -1.5m)
    crater_cond = valid_mask & (crater_score >= 0.50) & (lev <= -1.5)
    classes[crater_cond] = TerrainClass.CRATER_DEPRESSION
    confidence[crater_cond] = 0.75

    # 5. Boulder / Rock Field (boulder_score > 0.50 or tri > 2.0m)
    boulder_cond = valid_mask & ((boulder_score >= 0.50) | (tri >= 2.0))
    classes[boulder_cond] = TerrainClass.BOULDER_FIELD_ROCK
    confidence[boulder_cond] = 0.80

    # 6. Steep Scarp / Cliff (Slope > 25.0 degrees - HIGHEST PRIORITY HARD CONSTRAINT)
    steep_cond = valid_mask & (slope >= 25.0)
    classes[steep_cond] = TerrainClass.STEEP_SCARP_CLIFF
    confidence[steep_cond] = 0.95  # Steep slope geometry is directly derived from DTM

    # Scale confidence by source resolution (HiRISE 1m yields higher confidence than CTX 20m)
    # source_id == 2 is HiRISE, 1 is CTX
    ctx_cond = valid_mask & (source_id == 1)
    confidence[ctx_cond] *= 0.85  # 15% discount for 20m CTX resolution

    return classes, np.clip(confidence, 0.0, 1.0).astype(np.float32)
