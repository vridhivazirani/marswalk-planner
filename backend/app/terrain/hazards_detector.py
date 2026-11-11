"""Computer vision algorithms for boulder, sand, and crater candidate detection.

Uses transparent, explainable image processing:
- Boulders / Rocks: localized contrast, high local variance, and cast shadow detection.
- Sand / Dunes: low surface roughness, uniform reflectance, and ripple texture.
- Craters / Depressions: concave profile curvature and negative LEV.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy import ndimage


def detect_boulder_candidates(
    imagery: np.ndarray,
    tri: np.ndarray,
    nodata_mask: np.ndarray,
    variance_threshold: float = 18.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Identify candidate boulder fields and rock outcrops (baseline method).

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


def detect_boulder_candidates_advanced(
    imagery: np.ndarray,
    tri: np.ndarray,
    nodata_mask: np.ndarray,
    sun_azimuth_deg: float = 240.0,
    res_m: float = 1.0,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Advanced explainable computer vision pipeline for rock and boulder candidate detection.

    Methods:
    1. White Top-Hat Morphological Transformation:
       Extracts bright, reflective candidate rock peaks of scale 1m–5m.
    2. Black Top-Hat Morphological Transformation:
       Extracts deep, localized cast shadows adjacent to obstacles.
    3. Sun-Azimuth Consistent Shadow-Peak Pairing:
       Verifies that dark cast shadow occurs down-sun (opposite sun azimuth).
    4. Sobel Edge Gradient:
       Captures sharp boundary contrast between boulder block and background regolith.
    5. Topographic Roughness Integration:
       Elevated TRI confirms physical 3D elevation disruption.

    Disclaimer:
    Output represents HEURISTIC candidate detections, NOT ground-truth validated objects.
    """
    img_f = imagery.astype(np.float32)

    # 1. Morphological structuring element (size adapted to resolution: ~3m window)
    radius_px = max(1, int(round(1.5 / max(0.25, res_m))))
    y, x = np.ogrid[-radius_px : radius_px + 1, -radius_px : radius_px + 1]
    struct_disk = (x * x + y * y <= radius_px * radius_px).astype(bool)

    # White top-hat: bright peaks relative to neighborhood
    white_th = ndimage.white_tophat(img_f, structure=struct_disk)
    norm_white = np.clip(white_th / 35.0, 0.0, 1.0)

    # Black top-hat: dark depressions / cast shadows
    black_th = ndimage.black_tophat(img_f, structure=struct_disk)
    norm_black = np.clip(black_th / 35.0, 0.0, 1.0)

    # 2. Sobel edge magnitude
    sx = ndimage.sobel(img_f, axis=1)
    sy = ndimage.sobel(img_f, axis=0)
    edge_mag = np.sqrt(sx**2 + sy**2)
    norm_edge = np.clip(edge_mag / 80.0, 0.0, 1.0)

    # 3. Sun-azimuth shadow pairing
    # On Mars, shadows cast in direction: azimuth + 180 deg
    cast_dir_rad = np.radians((sun_azimuth_deg + 180.0) % 360.0)
    dy = int(round(np.cos(cast_dir_rad) * radius_px))
    dx = int(round(np.sin(cast_dir_rad) * radius_px))

    # Shift black top-hat shadow towards the candidate rock
    shifted_shadow = ndimage.shift(norm_black, shift=(-dy, -dx), order=0, cval=0.0)
    paired_indicator = np.clip(norm_white * shifted_shadow * 2.5, 0.0, 1.0)

    # 4. Roughness component
    norm_tri = np.clip(tri / 3.0, 0.0, 1.0)

    # 5. Composite score:
    # 30% bright top-hat + 30% paired cast shadow + 20% edge sharpness + 20% TRI
    score = 0.30 * norm_white + 0.30 * paired_indicator + 0.20 * norm_edge + 0.20 * norm_tri
    score = np.where(nodata_mask, score, 0.0).astype(np.float32)

    # Threshold for candidate mask
    candidate_mask = (score >= 0.50) & nodata_mask

    stats = {
        "candidate_count_pixels": int(np.sum(candidate_mask)),
        "mean_score_on_candidates": float(np.mean(score[candidate_mask]))
        if np.any(candidate_mask)
        else 0.0,
        "max_score": float(np.max(score)) if np.any(nodata_mask) else 0.0,
        "sun_azimuth_deg": float(sun_azimuth_deg),
        "method": (
            "Morphological White/Black Top-Hat with Directional Shadow Pairing "
            "& Sobel Edge Filtering"
        ),
        "epistemic_class": "HEURISTIC",
    }

    return score, candidate_mask, stats


def extract_boulder_objects(
    candidate_mask: np.ndarray,
    score_map: np.ndarray,
    res_m: float = 1.0,
    min_pixels: int = 1,
    max_pixels: int = 200,
    max_objects: int = 500,
) -> list[dict[str, Any]]:
    """Extract discrete candidate boulder objects using connected components labeling.

    Returns list of candidate rock summaries with centroid, size, and confidence.
    """
    labeled, num_features = ndimage.label(candidate_mask)
    if num_features == 0:
        return []

    objects: list[dict[str, Any]] = []
    # Get component slices
    component_slices = ndimage.find_objects(labeled)

    for i, slc in enumerate(component_slices, start=1):
        if slc is None:
            continue
        comp_mask = labeled[slc] == i
        area = int(np.sum(comp_mask))
        if area < min_pixels or area > max_pixels:
            continue

        # Sub-window coordinates
        r_min, r_max = slc[0].start, slc[0].stop
        c_min, c_max = slc[1].start, slc[1].stop

        # Centroid
        r_indices, c_indices = np.where(comp_mask)
        centroid_r = float(r_min + np.mean(r_indices))
        centroid_c = float(c_min + np.mean(c_indices))

        # Mean score across candidate
        sub_scores = score_map[slc]
        mean_score = float(np.mean(sub_scores[comp_mask]))

        # Equivalent circular diameter
        equiv_diam_m = float(2.0 * np.sqrt(area / np.pi) * res_m)

        objects.append(
            {
                "candidate_id": f"BLD-{i:05d}",
                "row": centroid_r,
                "col": centroid_c,
                "area_pixels": area,
                "estimated_diameter_m": round(equiv_diam_m, 2),
                "score": round(mean_score, 3),
                "bbox": [r_min, c_min, r_max, c_max],
            }
        )

        if len(objects) >= max_objects:
            break

    # Sort descending by score
    objects.sort(key=lambda o: o["score"], reverse=True)
    return objects


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
