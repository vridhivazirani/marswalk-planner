"""Hazard calculation engine: normalizes individual hazards and evaluates constraints.

All outputs maintain explicit separation between:
1. Hard constraints (binary bool array + reason codes like 'SLOPE_GT_MAX').
2. Soft hazard scores (individual float arrays normalized from 0.0 to 1.0).
3. Overall composite hazard score (weighted sum).
4. Epistemic confidence and uncertainty.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.hazards.config import HazardProfile


@dataclass(frozen=True)
class HazardBundle:
    """Complete bundle of evaluated hazard layers."""

    hard_impassable_mask: np.ndarray  # True where travel is strictly forbidden
    restriction_codes: np.ndarray  # Array of string restriction codes (or empty string)
    h_slope: np.ndarray  # Normalized slope hazard (0.0 - 1.0)
    h_roughness: np.ndarray  # Normalized roughness hazard (0.0 - 1.0)
    h_boulder: np.ndarray  # Rock/boulder hazard (0.0 - 1.0)
    h_sand: np.ndarray  # Loose material/dune hazard (0.0 - 1.0)
    h_crater: np.ndarray  # Crater/depression hazard (0.0 - 1.0)
    h_unknown: np.ndarray  # Missing data hazard (1.0 where unknown, 0.0 where observed)
    overall_hazard: np.ndarray  # Weighted composite hazard score (0.0 - 1.0)
    confidence: np.ndarray  # Epistemic confidence (0.0 - 1.0)
    profile: HazardProfile


def compute_hazard_bundle(
    slope: np.ndarray,
    tri: np.ndarray,
    boulder_score: np.ndarray,
    sand_score: np.ndarray,
    crater_score: np.ndarray,
    valid_mask: np.ndarray,
    source_id: np.ndarray,
    profile: HazardProfile | None = None,
) -> HazardBundle:
    """Compute individual normalized hazard layers, hard restrictions, and composite risk."""
    if profile is None:
        profile = HazardProfile()

    # -------------------------------------------------------------
    # 1. Individual Soft Hazard Normalization (0.0 to 1.0)
    # -------------------------------------------------------------
    # A. Slope Hazard: piecewise linear from safe_deg to critical_deg
    s_span = max(1.0, profile.slope_critical_deg - profile.slope_safe_deg)
    h_slope = np.clip((slope - profile.slope_safe_deg) / s_span, 0.0, 1.0)
    h_slope = np.where(valid_mask, h_slope, 1.0).astype(np.float32)

    # B. Roughness (TRI) Hazard: piecewise linear from safe_m to critical_m
    tri_span = max(0.1, profile.tri_critical_m - profile.tri_safe_m)
    h_roughness = np.clip((tri - profile.tri_safe_m) / tri_span, 0.0, 1.0)
    h_roughness = np.where(valid_mask, h_roughness, 1.0).astype(np.float32)

    # C. Boulder Hazard: derived from computer vision texture + TRI score
    h_boulder = np.clip(boulder_score, 0.0, 1.0)
    h_boulder = np.where(valid_mask, h_boulder, 1.0).astype(np.float32)

    # D. Sand / Dune Hazard: derived from sand candidate score
    h_sand = np.clip(sand_score, 0.0, 1.0)
    h_sand = np.where(valid_mask, h_sand, 1.0).astype(np.float32)

    # E. Crater Depression Hazard: derived from depression depth score
    h_crater = np.clip(crater_score, 0.0, 1.0)
    h_crater = np.where(valid_mask, h_crater, 1.0).astype(np.float32)

    # F. Unknown Data Hazard: 1.0 where unmapped/nodata, 0.0 where valid data exists
    h_unknown = np.where(valid_mask, 0.0, 1.0).astype(np.float32)

    # Uncertainty penalty based on sensor resolution:
    # HiRISE (source_id 2) = 0.0 penalty, CTX (source_id 1) = 0.35 penalty, NoData = 1.0
    uncertainty_penalty = np.zeros_like(slope, dtype=np.float32)
    uncertainty_penalty[source_id == 1] = 0.35
    uncertainty_penalty[~valid_mask] = 1.0

    # -------------------------------------------------------------
    # 2. Hard Traversability Constraints & Reason Codes
    # -------------------------------------------------------------
    impassable_mask = np.zeros_like(valid_mask, dtype=bool)
    restriction_codes = np.full(valid_mask.shape, "", dtype=object)

    # Rule 1: Unknown / NoData restriction
    if profile.forbid_unknown:
        unknown_cells = ~valid_mask
        impassable_mask |= unknown_cells
        restriction_codes[unknown_cells] = "NO_DATA_UNKNOWN"

    # Rule 2: Extreme slope threshold
    slope_cells = valid_mask & (slope >= profile.max_slope_deg)
    impassable_mask |= slope_cells
    restriction_codes[slope_cells] = "SLOPE_GT_MAX"

    # Rule 3: Extreme roughness threshold
    tri_cells = valid_mask & (tri >= profile.max_tri_m)
    impassable_mask |= tri_cells
    # If cell already flagged by slope, combine codes
    for r in range(valid_mask.shape[0]):
        for c in range(valid_mask.shape[1]):
            if tri_cells[r, c]:
                curr = restriction_codes[r, c]
                restriction_codes[r, c] = f"{curr}+TRI_GT_MAX" if curr else "TRI_GT_MAX"

    # -------------------------------------------------------------
    # 3. Overall Composite Hazard Score (Weighted Sum)
    # -------------------------------------------------------------
    # Normalize weights to ensure sum = 1.0
    w_sum = (
        profile.w_slope
        + profile.w_roughness
        + profile.w_boulder
        + profile.w_sand
        + profile.w_crater
        + profile.w_uncertainty
    )
    w_slope = profile.w_slope / w_sum
    w_rough = profile.w_roughness / w_sum
    w_boulder = profile.w_boulder / w_sum
    w_sand = profile.w_sand / w_sum
    w_crater = profile.w_crater / w_sum
    w_unc = profile.w_uncertainty / w_sum

    overall_soft = (
        w_slope * h_slope
        + w_rough * h_roughness
        + w_boulder * h_boulder
        + w_sand * h_sand
        + w_crater * h_crater
        + w_unc * uncertainty_penalty
    )

    # Impassable cells receive maximum hazard score 1.0
    overall = np.where(impassable_mask, 1.0, np.clip(overall_soft, 0.0, 1.0)).astype(np.float32)

    # Epistemic confidence: 0.95 for HiRISE, 0.80 for CTX, 0.0 for NoData
    confidence = np.zeros_like(slope, dtype=np.float32)
    confidence[valid_mask & (source_id == 2)] = 0.95
    confidence[valid_mask & (source_id == 1)] = 0.80

    return HazardBundle(
        hard_impassable_mask=impassable_mask,
        restriction_codes=restriction_codes,
        h_slope=h_slope,
        h_roughness=h_roughness,
        h_boulder=h_boulder,
        h_sand=h_sand,
        h_crater=h_crater,
        h_unknown=h_unknown,
        overall_hazard=overall,
        confidence=confidence,
        profile=profile,
    )
