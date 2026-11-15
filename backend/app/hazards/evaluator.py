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
from app.hazards.uncertainty import (
    STANDARD_NODATA_FLOAT,
    compute_data_confidence,
    compute_detection_confidence,
    compute_spatial_uncertainty,
)


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
    # True where CTX-only leaves metre hazards unresolved
    resolution_uncertainty_mask: np.ndarray | None = None
    # Dedicated M0.3 multi-dimensional uncertainty layers
    data_confidence: np.ndarray | None = None
    detection_confidence: np.ndarray | None = None
    spatial_uncertainty_m: np.ndarray | None = None


def compute_hazard_bundle(
    slope: np.ndarray,
    tri: np.ndarray,
    boulder_score: np.ndarray,
    sand_score: np.ndarray,
    crater_score: np.ndarray,
    valid_mask: np.ndarray,
    source_id: np.ndarray,
    profile: HazardProfile | None = None,
    hirise_obstacle_mask: np.ndarray | None = None,
    sigma_z: np.ndarray | None = None,
    imagery_source_id: np.ndarray | None = None,
) -> HazardBundle:
    """Compute individual normalized hazard layers, hard restrictions, and composite risk.

    Implements Authoritative Source-Aware Hazard Fusion Policy:
      - Case A (HiRISE Observed, source_id == 2):
          Native 1m hazard detections and conservative aggregation apply.
          Any 1m obstacle flags the parent cell as impassable ('NATIVE_HIRISE_OBSTACLE').
      - Case B (CTX Observed only, source_id == 1):
          Classified as lower-resolution coverage with unresolved high-resolution uncertainty.
          CTX macro-hazards (slope >= 25°, TRI >= 8m) are flagged impassable ('CTX_SLOPE_GT_MAX').
          Under the default conservative safety policy (forbid_resolution_uncertainty=True),
          cells are marked impassable ('UNRESOLVED_RESOLUTION_HAZARD').
      - Case C (Neither source valid / NoData, source_id == 0 or ~valid_mask):
          Marked UNKNOWN and impassable by default ('NO_DATA_UNKNOWN').
      - Case D (Conflicting information):
          Conservative rule: obstacle from any valid sensor is preserved and never cleared.
    """
    if profile is None:
        profile = HazardProfile()

    # Valid terrain requires valid_mask, recognized sensor ID (1=CTX, 2=HiRISE),
    # and finite non-NoData geometry derivatives. Missing inputs never default to safe zero.
    valid_src = (source_id == 1) | (source_id == 2)
    slope_ok = np.isfinite(slope) & (slope > -9000.0) & (slope != STANDARD_NODATA_FLOAT)
    tri_ok = np.isfinite(tri) & (tri > -9000.0) & (tri != STANDARD_NODATA_FLOAT)
    effective_valid = valid_mask & valid_src & slope_ok & tri_ok

    def _safe_score(score_arr: np.ndarray) -> np.ndarray:
        score_ok = (
            np.isfinite(score_arr)
            & (score_arr != STANDARD_NODATA_FLOAT)
            & (score_arr >= 0.0)
        )
        clipped = np.where(score_ok, np.clip(score_arr, 0.0, 1.0), 1.0)
        return np.where(effective_valid, clipped, 1.0).astype(np.float32)

    # -------------------------------------------------------------
    # 1. Individual Soft Hazard Normalization (0.0 to 1.0)
    # -------------------------------------------------------------
    # A. Slope Hazard: piecewise linear from safe_deg to critical_deg
    s_span = max(1.0, profile.slope_critical_deg - profile.slope_safe_deg)
    safe_slope = np.where(slope_ok, slope, 0.0)
    h_slope = np.clip((safe_slope - profile.slope_safe_deg) / s_span, 0.0, 1.0)
    h_slope = np.where(effective_valid, h_slope, 1.0).astype(np.float32)

    # B. Roughness (TRI) Hazard: piecewise linear from safe_m to critical_m
    tri_span = max(0.1, profile.tri_critical_m - profile.tri_safe_m)
    safe_tri = np.where(tri_ok, tri, 0.0)
    h_roughness = np.clip((safe_tri - profile.tri_safe_m) / tri_span, 0.0, 1.0)
    h_roughness = np.where(effective_valid, h_roughness, 1.0).astype(np.float32)

    # C-E. CV Hazard Scores: missing / NoData (-9999.0 or NaN) fail closed to 1.0
    h_boulder = _safe_score(boulder_score)
    h_sand = _safe_score(sand_score)
    h_crater = _safe_score(crater_score)

    # F. Unknown Data Hazard: 1.0 where unmapped/nodata, 0.0 where valid data exists
    h_unknown = np.where(effective_valid, 0.0, 1.0).astype(np.float32)

    # Uncertainty penalty based on sensor resolution:
    # HiRISE (source_id 2) = 0.0 penalty, CTX (source_id 1) = 0.35 penalty, NoData = 1.0
    uncertainty_penalty = np.zeros_like(slope, dtype=np.float32)
    uncertainty_penalty[source_id == 1] = 0.35
    uncertainty_penalty[~effective_valid] = 1.0

    # -------------------------------------------------------------
    # 2. Hard Traversability Constraints & Authoritative Reason Codes
    # -------------------------------------------------------------
    impassable_mask = np.zeros_like(effective_valid, dtype=bool)
    restriction_codes = np.full(effective_valid.shape, "", dtype=object)

    # Case C: Unknown / NoData restriction (Rule 1)
    if profile.forbid_unknown:
        unknown_cells = ~effective_valid
        impassable_mask |= unknown_cells
        restriction_codes[unknown_cells] = "NO_DATA_UNKNOWN"

    # Extreme slope threshold (Rule 2)
    slope_cells = effective_valid & (slope >= profile.max_slope_deg)
    impassable_mask |= slope_cells
    for r, c in zip(*np.where(slope_cells), strict=True):
        curr = restriction_codes[r, c]
        code = "CTX_SLOPE_GT_MAX" if source_id[r, c] == 1 else "SLOPE_GT_MAX"
        restriction_codes[r, c] = f"{curr}+{code}" if curr else code

    # Extreme roughness threshold (Rule 3)
    tri_cells = effective_valid & (tri >= profile.max_tri_m)
    impassable_mask |= tri_cells
    for r, c in zip(*np.where(tri_cells), strict=True):
        curr = restriction_codes[r, c]
        code = "CTX_TRI_GT_MAX" if source_id[r, c] == 1 else "TRI_GT_MAX"
        restriction_codes[r, c] = f"{curr}+{code}" if curr else code

    # Case A: Native HiRISE Obstacle Integration (Rule 4)
    if hirise_obstacle_mask is not None:
        hirise_nodata = effective_valid & (source_id == 2) & (hirise_obstacle_mask == 255)
        impassable_mask |= hirise_nodata
        for r, c in zip(*np.where(hirise_nodata), strict=True):
            curr = restriction_codes[r, c]
            code = "NO_DATA_UNKNOWN"
            if code not in curr:
                restriction_codes[r, c] = f"{curr}+{code}" if curr else code

        hirise_obs = (
            effective_valid
            & (source_id == 2)
            & (hirise_obstacle_mask > 0)
            & (hirise_obstacle_mask != 255)
        )
        impassable_mask |= hirise_obs
        for r, c in zip(*np.where(hirise_obs), strict=True):
            curr = restriction_codes[r, c]
            if "SLOPE_GT_MAX" not in curr and "TRI_GT_MAX" not in curr:
                code = "NATIVE_HIRISE_OBSTACLE"
                restriction_codes[r, c] = f"{curr}+{code}" if curr else code

    # Case B: Resolution Uncertainty in CTX-only regions (Rule 5)
    resolution_uncertainty_mask = effective_valid & (source_id == 1)
    if profile.forbid_resolution_uncertainty:
        ctx_unresolved = resolution_uncertainty_mask & ~slope_cells & ~tri_cells
        impassable_mask |= ctx_unresolved
        for r, c in zip(*np.where(ctx_unresolved), strict=True):
            curr = restriction_codes[r, c]
            code = "UNRESOLVED_RESOLUTION_HAZARD"
            restriction_codes[r, c] = f"{curr}+{code}" if curr else code

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

    # Ordinal data reliability summary (aligned with data_confidence: 0.95 HiRISE, 0.70 CTX)
    confidence = np.zeros_like(slope, dtype=np.float32)
    confidence[effective_valid & (source_id == 2)] = 0.95
    confidence[effective_valid & (source_id == 1)] = 0.70

    # Dedicated M0.3 multi-dimensional reliability & nominal uncertainty layers
    # (Invalid / NoData cells receive STANDARD_NODATA_FLOAT = -9999.0, never 0.0 or 999.0)
    data_conf = compute_data_confidence(source_id, effective_valid)
    det_conf = compute_detection_confidence(
        slope,
        tri,
        boulder_score,
        sand_score,
        crater_score,
        source_id,
        effective_valid,
        imagery_source_id=imagery_source_id,
    )
    effective_sigma = (
        sigma_z
        if sigma_z is not None
        else np.where(
            effective_valid & (source_id == 2),
            0.2,
            np.where(effective_valid & (source_id == 1), 2.0, STANDARD_NODATA_FLOAT),
        ).astype(np.float32)
    )
    spatial_unc = compute_spatial_uncertainty(source_id, effective_sigma, effective_valid)

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
        resolution_uncertainty_mask=resolution_uncertainty_mask,
        data_confidence=data_conf,
        detection_confidence=det_conf,
        spatial_uncertainty_m=spatial_unc,
    )
