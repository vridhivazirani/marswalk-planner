"""Computer vision algorithms for boulder, sand, and crater candidate detection.

Uses transparent, explainable image processing:
- Boulders / Rocks: localized contrast, high local variance, and cast shadow detection.
- Sand / Dunes: low surface roughness, uniform reflectance, and ripple texture.
- Craters / Depressions: concave profile curvature and negative LEV.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage


def detect_boulder_candidates(
    imagery: np.ndarray,
    tri: np.ndarray,
    nodata_mask: np.ndarray,
    variance_threshold: float = 18.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Identify candidate boulder fields and rock outcrops.

    Combines:
    1. Local image variance (representing high-frequency rock textures and cast shadows).
    2. High Terrain Ruggedness Index (micro-roughness).

    Returns:
    - boulder_score (0.0 to 1.0)
    - boulder_mask (binary bool array)
    """
    img_f = imagery.astype(np.float32)

    # Local variance filter (3x3)
    mean = ndimage.uniform_filter(img_f, size=3)
    sqr_mean = ndimage.uniform_filter(img_f**2, size=3)
    local_std = np.sqrt(np.maximum(0.0, sqr_mean - mean**2))

    # Normalize metrics between 0 and 1
    norm_tex = np.clip(local_std / variance_threshold, 0.0, 1.0)
    norm_tri = np.clip(tri / 4.0, 0.0, 1.0)

    # Composite boulder score (60% texture variance + 40% topographic roughness)
    score = 0.6 * norm_tex + 0.4 * norm_tri
    score = np.where(nodata_mask, score, 0.0)

    # Binary detection: score > 0.55
    boulder_mask = (score >= 0.55) & nodata_mask
    return score.astype(np.float32), boulder_mask


def detect_sand_dune_candidates(
    imagery: np.ndarray,
    slope: np.ndarray,
    tri: np.ndarray,
    nodata_mask: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Detect candidate sand ripples, transverse aeolian ridges (TARs), and dune fields.

    Characteristics of Martian Jezero sand:
    1. Low micro-roughness (TRI < 1.0m).
    2. Slopes below angle of repose (slope < 18 deg).
    3. Moderate to high uniform reflectance (imagery pixel values between 70 and 170).
    4. Uniform low texture variance.
    """
    img_f = imagery.astype(np.float32)

    # Local standard deviation
    mean = ndimage.uniform_filter(img_f, size=5)
    sqr_mean = ndimage.uniform_filter(img_f**2, size=5)
    local_std = np.sqrt(np.maximum(0.0, sqr_mean - mean**2))

    # Smoothness indicator: 1 when std is low (uniform sand), 0 when noisy rock
    smoothness = np.clip(1.0 - (local_std / 15.0), 0.0, 1.0)
    # Low roughness indicator
    tri_smooth = np.clip(1.0 - (tri / 1.5), 0.0, 1.0)
    # Slope indicator (dunes generally level to moderate angles)
    slope_factor = np.clip(1.0 - (slope / 20.0), 0.0, 1.0)

    score = 0.4 * smoothness + 0.35 * tri_smooth + 0.25 * slope_factor
    score = np.where(nodata_mask, score, 0.0)

    # Sand candidate mask
    sand_mask = (score >= 0.65) & nodata_mask
    return score.astype(np.float32), sand_mask


def detect_crater_depression_candidates(
    lev: np.ndarray,
    slope: np.ndarray,
    nodata_mask: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Identify craters, impact pits, and canyon depressions from topographic curvature and LEV.

    Characteristics:
    1. Negative Local Elevation Variation (LEV < -1.5m).
    2. Inward slope walls > 5 deg surrounding the depression bowl.
    """
    depression_depth = np.clip(-lev / 6.0, 0.0, 1.0)
    rim_slope = np.clip(slope / 15.0, 0.0, 1.0)

    score = 0.6 * depression_depth + 0.4 * rim_slope
    score = np.where(nodata_mask, score, 0.0)

    crater_mask = (lev <= -1.5) & (score >= 0.45) & nodata_mask
    return score.astype(np.float32), crater_mask
