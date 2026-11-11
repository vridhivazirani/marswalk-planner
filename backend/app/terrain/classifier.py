"""Explainable rule-based terrain classification and confidence estimation for Marswalk Planner.

Evaluates whether supervised deep learning is scientifically feasible:
- Without extensive ground-truth labels at Jezero, supervised deep learning risks severe
  domain hallucination and false confidence.
- Therefore, we implement an explainable, physics-grounded classification engine
  and assign epistemic confidence to every cell.

Classes:
- 0: UNKNOWN_TERRAIN (NoData or outside authentic coverage)
- 1: SMOOTH_TERRAIN (Low slope, low roughness, benign regolith lakebed)
- 2: ROCKY_TERRAIN (High boulder candidate density / morphological blocks)
- 3: ROUGH_TERRAIN (Dissected relief, high TRI, steep delta scarps)
- 4: POTENTIAL_LOOSE_MATERIAL (Fine-grained aeolian mantles / dust deposits)
- 5: DUNE_LIKE_FEATURES (Transverse Aeolian Ridges [TARs], periodic ripples)
- 6: CRATERED_TERRAIN (Impact pits, concave bowls, rim ejecta)
"""

from __future__ import annotations

from enum import IntEnum
from typing import Any

import numpy as np


class TerrainClass(IntEnum):
    UNKNOWN_TERRAIN = 0
    UNKNOWN_NO_DATA = 0  # Backward-compatible alias
    SMOOTH_TERRAIN = 1
    SMOOTH_REGOLITH = 1  # Backward-compatible alias
    ROCKY_TERRAIN = 2
    BOULDER_FIELD_ROCK = 2  # Backward-compatible alias
    ROUGH_TERRAIN = 3
    STEEP_SCARP_CLIFF = 3  # Backward-compatible alias
    POTENTIAL_LOOSE_MATERIAL = 4
    DUNE_LIKE_FEATURES = 5
    SAND_RIPPLES_DUNES = 5  # Backward-compatible alias
    CRATERED_TERRAIN = 6
    CRATER_DEPRESSION = 6  # Backward-compatible alias


TERRAIN_CLASS_NAMES = {
    0: "UNKNOWN_TERRAIN",
    1: "SMOOTH_TERRAIN",
    2: "ROCKY_TERRAIN",
    3: "ROUGH_TERRAIN",
    4: "POTENTIAL_LOOSE_MATERIAL",
    5: "DUNE_LIKE_FEATURES",
    6: "CRATERED_TERRAIN",
}

TERRAIN_CLASS_DETAILS: dict[int, dict[str, Any]] = {
    0: {
        "id": 0,
        "name": "Unknown Terrain",
        "code": "UNKNOWN_TERRAIN",
        "description": (
            "Missing or out-of-coverage elevation data. Impassable by default per AGENTS.md Rule 7."
        ),
        "traversability": "IMPASSABLE_DEFAULT",
        "speed_factor": 0.0,
        "hazard_risk": "CRITICAL_UNKNOWN",
        "color_hex": "#181818",
    },
    1: {
        "id": 1,
        "name": "Smooth Terrain",
        "code": "SMOOTH_TERRAIN",
        "description": (
            "Flat to gently sloping lacustrine regolith with minimal micro-roughness. "
            "Optimal human walking corridor."
        ),
        "traversability": "PASSABLE_OPTIMAL",
        "speed_factor": 1.0,
        "hazard_risk": "NOMINAL",
        "color_hex": "#a3a3a3",
    },
    2: {
        "id": 2,
        "name": "Rocky Terrain",
        "code": "ROCKY_TERRAIN",
        "description": (
            "High concentration of candidate boulders (>0.5m) and blocky scree. "
            "Significant tripping and circumvention risk."
        ),
        "traversability": "RESTRICTED_CAUTION",
        "speed_factor": 0.45,
        "hazard_risk": "ELEVATED_OBSTACLE",
        "color_hex": "#d4d4d4",
    },
    3: {
        "id": 3,
        "name": "Rough Terrain",
        "code": "ROUGH_TERRAIN",
        "description": (
            "Dissected relief, high Terrain Ruggedness Index, or steep slopes (>15°–25°). "
            "High metabolic walking cost."
        ),
        "traversability": "HIGH_COST_OR_BARRIER",
        "speed_factor": 0.30,
        "hazard_risk": "HIGH_SLOPE_ROUGHNESS",
        "color_hex": "#ffffff",
    },
    4: {
        "id": 4,
        "name": "Potential Loose Material",
        "code": "POTENTIAL_LOOSE_MATERIAL",
        "description": (
            "Unconsolidated fine-grained airfall dust or loose sandy mantles. "
            "Risk of foot sinkage and slip."
        ),
        "traversability": "SOFT_GROUND_DRAG",
        "speed_factor": 0.60,
        "hazard_risk": "MODERATE_SINKAGE",
        "color_hex": "#737373",
    },
    5: {
        "id": 5,
        "name": "Dune-Like Features",
        "code": "DUNE_LIKE_FEATURES",
        "description": (
            "Periodic Transverse Aeolian Ridges (TARs) and active ripple fields. "
            "Wheel-sinkage and human mobility impedance."
        ),
        "traversability": "RESTRICTED_AVOIDANCE",
        "speed_factor": 0.35,
        "hazard_risk": "HIGH_AEOLIAN_SLIP",
        "color_hex": "#525252",
    },
    6: {
        "id": 6,
        "name": "Cratered Terrain",
        "code": "CRATERED_TERRAIN",
        "description": (
            "Impact craters, incised channels, and concave depression bowls "
            "with steep inner slopes."
        ),
        "traversability": "TOPOGRAPHIC_DEPRESSION",
        "speed_factor": 0.40,
        "hazard_risk": "CIRCUMVENTION_RECOMMENDED",
        "color_hex": "#383838",
    },
}


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
    """Execute transparent heuristic 7-class terrain classification and confidence estimation.

    Hierarchical decision structure:
    1. Unknown / No Data -> UNKNOWN_TERRAIN (0)
    2. Steep slope (>= 25.0°) or Extreme TRI (>= 2.5m) -> ROUGH_TERRAIN (3)
    3. High Boulder Score (>= 0.48) -> ROCKY_TERRAIN (2)
    4. Craters / Depressions (crater_score >= 0.48 & lev <= -1.2m) -> CRATERED_TERRAIN (6)
    5. Dunes / TARs (sand_score >= 0.65 & slope < 18°) -> DUNE_LIKE_FEATURES (5)
    6. Potential Loose Material (sand_score in [0.45, 0.65) & slope < 15°)
       -> POTENTIAL_LOOSE_MATERIAL (4)
    7. Benign baseline -> SMOOTH_TERRAIN (1)

    Returns:
    - classification_map (uint8 array of TerrainClass IDs)
    - confidence_map (float32 array 0.0 to 1.0)
    """
    classes = np.zeros_like(slope, dtype=np.uint8)
    confidence = np.zeros_like(slope, dtype=np.float32)

    # 1. Unknown / No Data (Default 0, confidence 0.0)
    classes[~valid_mask] = TerrainClass.UNKNOWN_TERRAIN
    confidence[~valid_mask] = 0.0

    # 2. Smooth Terrain (Baseline for valid cells)
    classes[valid_mask] = TerrainClass.SMOOTH_TERRAIN
    confidence[valid_mask] = 0.75

    # 3. Potential Loose Material (sand_score >= 0.45 and < 0.65, slope < 15)
    loose_cond = valid_mask & (sand_score >= 0.45) & (sand_score < 0.65) & (slope < 15.0)
    classes[loose_cond] = TerrainClass.POTENTIAL_LOOSE_MATERIAL
    confidence[loose_cond] = 0.70

    # 4. Dune-like Features (sand_score >= 0.65 and slope < 18)
    dune_cond = valid_mask & (sand_score >= 0.65) & (slope < 18.0)
    classes[dune_cond] = TerrainClass.DUNE_LIKE_FEATURES
    confidence[dune_cond] = 0.72 + 0.25 * (sand_score[dune_cond] - 0.65)

    # 5. Crater / Depression (crater_score >= 0.48 and lev <= -1.2)
    crater_cond = valid_mask & (crater_score >= 0.48) & (lev <= -1.2)
    classes[crater_cond] = TerrainClass.CRATERED_TERRAIN
    confidence[crater_cond] = 0.78

    # 6. Boulder / Rocky Terrain (boulder_score >= 0.48 or tri >= 1.5)
    rocky_cond = valid_mask & ((boulder_score >= 0.48) | (tri >= 1.5))
    classes[rocky_cond] = TerrainClass.ROCKY_TERRAIN
    confidence[rocky_cond] = 0.82

    # 7. Rough Terrain / Steep Scarp (Slope >= 25.0° or TRI >= 2.5m - HIGHEST PRIORITY)
    rough_cond = valid_mask & ((slope >= 25.0) | (tri >= 2.5))
    classes[rough_cond] = TerrainClass.ROUGH_TERRAIN
    confidence[rough_cond] = 0.95  # Slope and roughness geometry directly derived from DTM

    # Scale confidence by source resolution (HiRISE 1m yields higher confidence than CTX 20m)
    # source_id == 2 is HiRISE (1m), 1 is CTX (20m)
    ctx_cond = valid_mask & (source_id == 1)
    confidence[ctx_cond] *= 0.85  # 15% discount for 20m CTX resolution

    return classes, np.clip(confidence, 0.0, 1.0).astype(np.float32)
