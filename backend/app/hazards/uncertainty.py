"""Dedicated Hazard and Terrain Uncertainty & Reliability Propagation Model.

Strictly separates:
1. Data Source Reliability (sensor provenance, native DTM resolution, coverage).
2. Evidence Reliability Dimensions (terrain derivative reliability, actual optical CV
   imagery reliability, spatial resolution adequacy, detector applicability, unresolved
   evidence) — independent of hazard severity magnitude.
3. Nominal Spatial Precision Tier (provisional unverified relative vertical tier,
   distinct from unquantified absolute areoid accuracy, resampling error, and local
   stereo decorrelation). Missing/NoData cells strictly use STANDARD_NODATA_FLOAT (-9999.0).
4. Per-Property Epistemic Classifications (OBSERVED, DERIVED, INTERPRETED, HEURISTIC, UNKNOWN).
5. Route Uncertainty & Reliability Propagation (arc-length weighted).

Important Scientific Notice:
All scalar reliability indices in [0.0, 1.0] and nominal vertical precision tier values
(0.20 m HiRISE nominal / 2.00 m CTX nominal) are UNCALIBRATED heuristic indices and
provisional tiers — NOT statistical probabilities or validated ±1σ physical error bars.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Any

import numpy as np

from app.core.epistemic import EpistemicClass

STANDARD_NODATA_FLOAT: float = -9999.0
UNVERIFIED_HIRISE_NOMINAL_TIER_M: float = 0.20
UNVERIFIED_CTX_NOMINAL_TIER_M: float = 2.00


class ResolutionClass(StrEnum):
    """Spatial resolution tier of terrain observation data."""

    NATIVE_HIRISE_1M = "NATIVE_HIRISE_1M"
    REGIONAL_CTX_20M = "REGIONAL_CTX_20M"
    UNMAPPED = "UNMAPPED"


class DataConfidenceLevel(StrEnum):
    """Categorical ordinal tier for underlying terrain elevation provenance (uncalibrated)."""

    HIGH = "HIGH"          # HiRISE 1m stereo DTM resampled to 20m + native 1m aggregation
    MODERATE = "MODERATE"  # CTX 20m native regional stereo DTM
    LOW = "LOW"            # Degraded or partial evidence
    NONE = "NONE"          # NoData / Unmapped


class DetectionConfidenceLevel(StrEnum):
    """Categorical ordinal tier for hazard evidence reliability (uncalibrated)."""

    HIGH = "HIGH"          # High-resolution DTM + high-res optical evidence
    MODERATE = "MODERATE"  # 1m DTM derivatives paired with 20m regional optical heuristics
    LOW = "LOW"            # Regional 20m DTM/imagery only; metre-scale obstacles unresolved
    NONE = "NONE"          # NoData / Unmapped / Missing all evidence


class RouteTerrainCharacterization(StrEnum):
    """Overall reliability & hazard characterization of a planned route."""

    OBSERVED_WELL_CHARACTERIZED = "OBSERVED_WELL_CHARACTERIZED"
    OBSERVED_HAZARDOUS = "OBSERVED_HAZARDOUS"
    LOWER_RESOLUTION_UNCERTAIN = "LOWER_RESOLUTION_UNCERTAIN"
    LOWER_RESOLUTION_HAZARDOUS = "LOWER_RESOLUTION_HAZARDOUS"
    UNKNOWN_TERRAIN = "UNKNOWN_TERRAIN"


@dataclass(frozen=True)
class CellUncertaintyProfile:
    """Cell-level multi-dimensional uncertainty and epistemic preservation schema."""

    coordinate: dict[str, float]
    source_dataset: str
    resolution_class: str
    data_reliability_index: float | None
    data_reliability_level: str
    detection_reliability_index: float | None
    detection_reliability_level: str
    nominal_vertical_precision_m: float | None
    precision_tier_label: str
    uncertainty_precision_status: str
    evidence_dimensions: dict[str, Any]
    property_epistemic_classes: dict[str, str]
    epistemic_class: str
    is_unknown: bool
    hazard_classification: str
    restriction_codes: list[str]
    reasoning: str
    # Backward-compatible non-conflicting fields (reflect exact same uncalibrated indices)
    data_confidence_score: float | None = None
    data_confidence_level: str = ""
    detection_confidence_score: float | None = None
    detection_confidence_level: str = ""
    spatial_uncertainty_m: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize cell uncertainty profile to dictionary."""
        return asdict(self)


@dataclass(frozen=True)
class UncertaintyBundle:
    """Raster bundle containing distinct uncertainty and reliability layers.

    Continuous float32 layers use STANDARD_NODATA_FLOAT (-9999.0) for invalid/unmapped pixels.
    Valid zero-valued measurements remain 0.0 and unmasked.
    """

    data_confidence: np.ndarray        # float32 in [0.0, 1.0], -9999.0 on NoData
    detection_confidence: np.ndarray   # float32 in [0.0, 1.0], -9999.0 on NoData
    spatial_uncertainty_m: np.ndarray  # float32 provisional tier (m), -9999.0 on NoData
    resolution_uncertainty: np.ndarray # uint8 (1 where CTX only, 0 otherwise, 255 NoData-reserved)
    unknown_mask: np.ndarray           # uint8 (1 where unmapped/NoData, 0 where valid)
    terrain_derivative_reliability: np.ndarray | None = None
    optical_imagery_reliability: np.ndarray | None = None
    spatial_resolution_adequacy: np.ndarray | None = None


def _valid_float_evidence(arr: np.ndarray | None, shape: tuple[int, int]) -> np.ndarray:
    """Return boolean mask of pixels where a float evidence raster is finite and not NoData."""
    if arr is None:
        return np.ones(shape, dtype=bool)
    return np.isfinite(arr) & (arr != STANDARD_NODATA_FLOAT) & (arr != 999.0)


def _valid_source_mask(source_id: np.ndarray) -> np.ndarray:
    """Return boolean mask of valid terrain source codes (1=CTX, 2=HiRISE; 0/255 invalid)."""
    return (source_id == 1) | (source_id == 2)


def _fmt_metric(value: float, fmt: str) -> str:
    """Format finite, non-NoData metric values or return 'N/A'."""
    if not np.isfinite(value) or value == STANDARD_NODATA_FLOAT or value == 999.0:
        return "N/A"
    return format(value, fmt)


def compute_terrain_derivative_reliability(
    source_id: np.ndarray,
    valid_mask: np.ndarray,
    slope: np.ndarray | None = None,
    tri: np.ndarray | None = None,
) -> np.ndarray:
    """Compute uncalibrated reliability index for DTM-derived terrain geometry (slope, TRI).

    - HiRISE 1m stereo DTM (source_id == 2): 0.95 (nominal high ordinal index).
    - CTX 20m native regional stereo DTM (source_id == 1): 0.70 (nominal moderate index).
    - Valid elevation cell with missing/NaN derivative evidence: 0.0 (distinguished from NoData).
    - Missing/unmapped elevation (source_id not in {1, 2} or ~valid_mask):
      STANDARD_NODATA_FLOAT (-9999.0).
    """
    is_mapped = valid_mask & _valid_source_mask(source_id)
    deriv_valid = _valid_float_evidence(slope, source_id.shape) & _valid_float_evidence(
        tri, source_id.shape
    )
    rel = np.full(source_id.shape, STANDARD_NODATA_FLOAT, dtype=np.float32)
    rel[is_mapped] = 0.0
    rel[is_mapped & deriv_valid & (source_id == 1)] = 0.70
    rel[is_mapped & deriv_valid & (source_id == 2)] = 0.95
    return rel


def compute_optical_imagery_reliability(
    source_id: np.ndarray,
    valid_mask: np.ndarray,
    imagery_source_id: np.ndarray | None = None,
    optical_evidence_valid: np.ndarray | None = None,
) -> np.ndarray:
    """Compute uncalibrated reliability index for CV optical hazard heuristics.

    Provenance rule:
      - In the authoritative 20m ARD terrain pipeline, CV boulder/sand/crater scores are
        computed from `ortho_imagery.tif` warped from the 6.0 m CTX orthomosaic resampled
        to 20.0 m (NOT HiRISE 0.25 m ORI).
      - Unless `imagery_source_id` explicitly indicates native high-res optical imagery (2),
        optical CV reliability is capped at the regional CTX optical tier (0.40) even over
        HiRISE DTM terrain.
      - Valid cell with missing optical evidence: 0.0.
      - Unmapped / NoData cell: STANDARD_NODATA_FLOAT (-9999.0).
    """
    is_mapped = valid_mask & _valid_source_mask(source_id)
    opt_ok = (
        np.ones(source_id.shape, dtype=bool)
        if optical_evidence_valid is None
        else optical_evidence_valid
    )
    rel = np.full(source_id.shape, STANDARD_NODATA_FLOAT, dtype=np.float32)
    rel[is_mapped] = 0.0

    if imagery_source_id is None:
        # Honest pipeline provenance: CV detector consumes 20m-resampled CTX 6m orthomosaic
        rel[is_mapped & opt_ok] = 0.40
    else:
        rel[is_mapped & opt_ok & (imagery_source_id == 1)] = 0.40
        rel[is_mapped & opt_ok & (imagery_source_id == 2)] = 0.85

    return rel


def compute_spatial_resolution_adequacy(
    source_id: np.ndarray,
    valid_mask: np.ndarray,
) -> np.ndarray:
    """Compute uncalibrated adequacy index for human-scale (metre-scale) obstacle resolution.

    - HiRISE 1m native hazard aggregation (source_id == 2): 0.95.
    - CTX 20m regional DTM only (source_id == 1): 0.35 (metre-scale hazards unresolved).
    - Unmapped / NoData (source_id == 0 or ~valid_mask): STANDARD_NODATA_FLOAT (-9999.0).
    """
    is_mapped = valid_mask & _valid_source_mask(source_id)
    adequacy = np.full(source_id.shape, STANDARD_NODATA_FLOAT, dtype=np.float32)
    adequacy[is_mapped & (source_id == 1)] = 0.35
    adequacy[is_mapped & (source_id == 2)] = 0.95
    return adequacy


def compute_data_confidence(
    source_id: np.ndarray,
    valid_mask: np.ndarray,
) -> np.ndarray:
    """Compute nominal data-source reliability index based on DTM provenance.

    Note: Returned values are uncalibrated heuristic indices [0.0, 1.0], NOT probabilities.
      - HiRISE 1m DTM (source_id == 2): 0.95 (sub-metre native observation aggregated to 20m).
      - CTX 20m DTM (source_id == 1): 0.70 (20m native regional stereo DTM).
      - NoData / Unmapped (source_id == 0 or ~valid_mask): STANDARD_NODATA_FLOAT (-9999.0).
    """
    is_mapped = valid_mask & _valid_source_mask(source_id)
    rel = np.full(source_id.shape, STANDARD_NODATA_FLOAT, dtype=np.float32)
    rel[is_mapped & (source_id == 1)] = 0.70
    rel[is_mapped & (source_id == 2)] = 0.95
    return rel


def compute_detection_confidence(
    slope: np.ndarray | None,
    tri: np.ndarray | None,
    boulder_score: np.ndarray | None,
    sand_score: np.ndarray | None,
    crater_score: np.ndarray | None,
    source_id: np.ndarray,
    valid_mask: np.ndarray,
    imagery_source_id: np.ndarray | None = None,
) -> np.ndarray:
    """Compute evidence reliability index independently of hazard severity magnitude.

    Mathematical formulation (strictly independent of slope/TRI/hazard magnitudes):
      Let:
        R_geom = terrain derivative reliability (0.95 HiRISE 1m DTM, 0.70 CTX 20m DTM, 0 missing)
        R_opt  = actual optical CV imagery reliability (0.40 20m CTX ortho, 0.85 if native
                 HiRISE ORI supplied, 0 missing)
        R_res  = metre-scale spatial resolution adequacy (0.95 HiRISE 1m, 0.35 CTX 20m)

      When both terrain and optical evidence are absent on a mapped cell, ERI = 0.0 (valid zero).
      Otherwise:
        ERI = 0.50 * R_geom + 0.25 * R_opt + 0.25 * R_res

      Properties:
        - Strictly invariant with respect to terrain flatness/steepness and hazard score values.
        - Zero discontinuities (no threshold jump at 1e-4).
        - Unmapped / NoData pixels receive STANDARD_NODATA_FLOAT (-9999.0), never 0.0.
        - Uncalibrated heuristic ordinal index in [0.0, 1.0], NOT a probability.
    """
    shape = source_id.shape
    is_mapped = valid_mask & _valid_source_mask(source_id)

    r_geom = compute_terrain_derivative_reliability(source_id, valid_mask, slope=slope, tri=tri)

    opt_valid = (
        _valid_float_evidence(boulder_score, shape)
        & _valid_float_evidence(sand_score, shape)
        & _valid_float_evidence(crater_score, shape)
    )
    r_opt = compute_optical_imagery_reliability(
        source_id,
        valid_mask,
        imagery_source_id=imagery_source_id,
        optical_evidence_valid=opt_valid,
    )
    r_res = compute_spatial_resolution_adequacy(source_id, valid_mask)

    deriv_valid = _valid_float_evidence(slope, shape) & _valid_float_evidence(tri, shape)
    any_evidence = deriv_valid | opt_valid

    eri = np.full(shape, STANDARD_NODATA_FLOAT, dtype=np.float32)
    valid_eval = is_mapped & any_evidence
    eri[is_mapped & ~any_evidence] = 0.0
    eri[valid_eval] = np.clip(
        0.50 * r_geom[valid_eval] + 0.25 * r_opt[valid_eval] + 0.25 * r_res[valid_eval],
        0.0,
        1.0,
    ).astype(np.float32)
    return eri


def compute_spatial_uncertainty(
    source_id: np.ndarray,
    sigma_z: np.ndarray,
    valid_mask: np.ndarray,
) -> np.ndarray:
    """Return provisional nominal relative vertical precision tier (metres) with explicit NoData.

    Unmapped cells, source_id == 0, legacy sentinel 999.0, non-finite values, or negative
    sentinels are strictly encoded as STANDARD_NODATA_FLOAT (-9999.0).
    """
    is_valid = (
        valid_mask
        & _valid_source_mask(source_id)
        & np.isfinite(sigma_z)
        & (sigma_z != STANDARD_NODATA_FLOAT)
        & (sigma_z != 999.0)
        & (sigma_z >= 0.0)
    )
    return np.where(is_valid, sigma_z, STANDARD_NODATA_FLOAT).astype(np.float32)


def evaluate_uncertainty_bundle(
    slope: np.ndarray,
    tri: np.ndarray,
    boulder_score: np.ndarray,
    sand_score: np.ndarray,
    crater_score: np.ndarray,
    source_id: np.ndarray,
    sigma_z: np.ndarray,
    valid_mask: np.ndarray,
    imagery_source_id: np.ndarray | None = None,
) -> UncertaintyBundle:
    """Evaluate and package all authoritative reliability and uncertainty layers."""
    data_rel = compute_data_confidence(source_id, valid_mask)
    r_geom = compute_terrain_derivative_reliability(source_id, valid_mask, slope=slope, tri=tri)
    opt_valid = (
        _valid_float_evidence(boulder_score, source_id.shape)
        & _valid_float_evidence(sand_score, source_id.shape)
        & _valid_float_evidence(crater_score, source_id.shape)
    )
    r_opt = compute_optical_imagery_reliability(
        source_id,
        valid_mask,
        imagery_source_id=imagery_source_id,
        optical_evidence_valid=opt_valid,
    )
    r_res = compute_spatial_resolution_adequacy(source_id, valid_mask)
    det_rel = compute_detection_confidence(
        slope,
        tri,
        boulder_score,
        sand_score,
        crater_score,
        source_id,
        valid_mask,
        imagery_source_id=imagery_source_id,
    )
    spatial_unc = compute_spatial_uncertainty(source_id, sigma_z, valid_mask)
    res_unc = (valid_mask & (source_id == 1)).astype(np.uint8)
    unknown = (~valid_mask | ~_valid_source_mask(source_id)).astype(np.uint8)

    return UncertaintyBundle(
        data_confidence=data_rel,
        detection_confidence=det_rel,
        spatial_uncertainty_m=spatial_unc,
        resolution_uncertainty=res_unc,
        unknown_mask=unknown,
        terrain_derivative_reliability=r_geom,
        optical_imagery_reliability=r_opt,
        spatial_resolution_adequacy=r_res,
    )


def _classify_reliability_tier(val: float | None, thresholds: tuple[float, float]) -> str:
    """Map an uncalibrated [0, 1] reliability index onto categorical ordinal tiers."""
    if val is None or not np.isfinite(val) or val == STANDARD_NODATA_FLOAT:
        return DetectionConfidenceLevel.NONE.value
    high_thr, mod_thr = thresholds
    if val >= high_thr:
        return DetectionConfidenceLevel.HIGH.value
    if val >= mod_thr:
        return DetectionConfidenceLevel.MODERATE.value
    return DetectionConfidenceLevel.LOW.value


def build_cell_uncertainty_profile(
    lat: float,
    lon: float,
    source_id: int,
    is_valid: bool,
    slope_deg: float,
    tri_m: float,
    boulder_score: float,
    sand_score: float,
    crater_score: float,
    sigma_z_m: float,
    is_impassable: bool,
    restriction_code: str,
    imagery_source_id: int = 1,
) -> CellUncertaintyProfile:
    """Construct a cell-level uncertainty profile using the single authoritative model.

    Guarantees 100% consistency between exported raster layers and `/hazards/inspect`
    point queries, and preserves distinct per-property EpistemicClass tags.
    """
    is_unmapped = (not is_valid) or (source_id not in (1, 2))

    bundle = evaluate_uncertainty_bundle(
        slope=np.array([[slope_deg]], dtype=np.float32),
        tri=np.array([[tri_m]], dtype=np.float32),
        boulder_score=np.array([[boulder_score]], dtype=np.float32),
        sand_score=np.array([[sand_score]], dtype=np.float32),
        crater_score=np.array([[crater_score]], dtype=np.float32),
        source_id=np.array([[max(0, source_id)]], dtype=np.uint8),
        sigma_z=np.array([[sigma_z_m]], dtype=np.float32),
        valid_mask=np.array([[not is_unmapped]], dtype=bool),
        imagery_source_id=np.array([[imagery_source_id]], dtype=np.uint8),
    )

    raw_data_rel = float(bundle.data_confidence[0, 0])
    raw_det_rel = float(bundle.detection_confidence[0, 0])
    raw_spatial = float(bundle.spatial_uncertainty_m[0, 0])
    assert bundle.terrain_derivative_reliability is not None
    assert bundle.optical_imagery_reliability is not None
    assert bundle.spatial_resolution_adequacy is not None
    raw_geom_rel = float(bundle.terrain_derivative_reliability[0, 0])
    raw_opt_rel = float(bundle.optical_imagery_reliability[0, 0])
    raw_res_rel = float(bundle.spatial_resolution_adequacy[0, 0])

    def _clean(v: float) -> float | None:
        if not np.isfinite(v) or v == STANDARD_NODATA_FLOAT or v == 999.0:
            return None
        return round(float(v), 4)

    data_rel = None if is_unmapped else _clean(raw_data_rel)
    det_rel = None if is_unmapped else _clean(raw_det_rel)
    spatial_val = None if is_unmapped else _clean(raw_spatial)
    geom_rel = None if is_unmapped else _clean(raw_geom_rel)
    opt_rel = None if is_unmapped else _clean(raw_opt_rel)
    res_rel = None if is_unmapped else _clean(raw_res_rel)

    if is_unmapped:
        source_name = "UNMAPPED_NO_DATA"
        res_class = ResolutionClass.UNMAPPED.value
        data_level = DataConfidenceLevel.NONE.value
        det_level = DetectionConfidenceLevel.NONE.value
        precision_label = "UNMAPPED_NO_DATA"
        hazard_class = "UNKNOWN_IMPASSABLE"
        optical_src_desc = "UNAVAILABLE"
        applicability = ["NO_ELEVATION_COVERAGE"]
        unresolved = ["ALL_TERRAIN_AND_HAZARD_PROPERTIES"]
        prop_epistemic = {
            "source_elevation": EpistemicClass.UNKNOWN.value,
            "terrain_derivatives": EpistemicClass.UNKNOWN.value,
            "cv_hazard_heuristics": EpistemicClass.UNKNOWN.value,
            "passability_classification": EpistemicClass.UNKNOWN.value,
            "reliability_indices": EpistemicClass.UNKNOWN.value,
            "nominal_vertical_precision_tier": EpistemicClass.UNKNOWN.value,
            "resolution_uncertainty": EpistemicClass.UNKNOWN.value,
        }
        epistemic_summary = EpistemicClass.UNKNOWN.value
        reason = "Missing elevation observations. Unknown terrain is impassable by default."
    elif source_id == 2:
        source_name = "HiRISE DTM (1.0 m/px native -> 20.0 m ARD; 6.0 m CTX Ortho -> 20.0 m CV)"
        res_class = ResolutionClass.NATIVE_HIRISE_1M.value
        data_level = _classify_reliability_tier(data_rel, (0.90, 0.65))
        det_level = _classify_reliability_tier(det_rel, (0.85, 0.65))
        precision_label = "SUBMETRE_NOMINAL_TIER_UNVERIFIED"
        hazard_class = "RESTRICTED" if is_impassable else "PASSABLE"
        optical_src_desc = (
            "CTX Orthomosaic (6.0 m/px resampled to 20.0 m/px)"
            if imagery_source_id == 1
            else "HiRISE Orthomosaic"
        )
        applicability = [
            "HIRISE_1M_NATIVE_OBSTACLE_AGGREGATION",
            "20M_DEM_GEOMETRIC_DERIVATIVES",
            "20M_CTX_ORTHO_OPTICAL_HEURISTICS",
        ]
        unresolved = (
            ["NATIVE_SUBMETRE_OPTICAL_CV_NOT_INGESTED"] if imagery_source_id == 1 else []
        )
        prop_epistemic = {
            "source_elevation": EpistemicClass.DERIVED.value,
            "terrain_derivatives": EpistemicClass.DERIVED.value,
            "cv_hazard_heuristics": EpistemicClass.HEURISTIC.value,
            "passability_classification": EpistemicClass.HEURISTIC.value,
            "reliability_indices": EpistemicClass.HEURISTIC.value,
            "nominal_vertical_precision_tier": EpistemicClass.HEURISTIC.value,
            "resolution_uncertainty": EpistemicClass.DERIVED.value,
        }
        epistemic_summary = EpistemicClass.HEURISTIC.value
        reason = (
            "Elevation & native hazards anchored by HiRISE 1 m DTM; CV boulder/sand/crater scores "
            "derived heuristically from 20 m resampled CTX ortho. "
            f"Slope: {_fmt_metric(slope_deg, '.1f')}°, "
            f"TRI: {_fmt_metric(tri_m, '.2f')} m, "
            f"Boulder score: {_fmt_metric(boulder_score, '.2f')}."
        )
    else:  # source_id == 1
        source_name = "CTX DTM (20.0 m/px native regional) + CTX Ortho (6.0 m -> 20.0 m)"
        res_class = ResolutionClass.REGIONAL_CTX_20M.value
        data_level = _classify_reliability_tier(data_rel, (0.90, 0.65))
        det_level = _classify_reliability_tier(det_rel, (0.85, 0.65))
        precision_label = "METRE_SCALE_NOMINAL_TIER_UNVERIFIED"
        hazard_class = "RESTRICTED" if is_impassable else "PASSABLE"
        optical_src_desc = "CTX Orthomosaic (6.0 m/px resampled to 20.0 m/px)"
        applicability = [
            "20M_CTX_MACRO_TOPOGRAPHY_ONLY",
            "20M_CTX_ORTHO_OPTICAL_HEURISTICS",
        ]
        unresolved = [
            "METRE_SCALE_BOULDERS_AND_MICRO_SCARPS_UNRESOLVED",
            "NATIVE_HIRISE_DTM_ABSENT",
        ]
        prop_epistemic = {
            "source_elevation": EpistemicClass.DERIVED.value,
            "terrain_derivatives": EpistemicClass.DERIVED.value,
            "cv_hazard_heuristics": EpistemicClass.HEURISTIC.value,
            "passability_classification": EpistemicClass.HEURISTIC.value,
            "reliability_indices": EpistemicClass.HEURISTIC.value,
            "nominal_vertical_precision_tier": EpistemicClass.HEURISTIC.value,
            "resolution_uncertainty": EpistemicClass.DERIVED.value,
        }
        epistemic_summary = EpistemicClass.HEURISTIC.value
        reason = (
            "Regional CTX coverage (20 m DTM). Metre-scale hazards cannot be resolved; "
            f"resolution uncertainty applies. Slope: {_fmt_metric(slope_deg, '.1f')}°."
        )

    evidence_dims: dict[str, Any] = {
        "terrain_derivative_reliability": geom_rel,
        "optical_imagery_reliability": opt_rel,
        "spatial_resolution_adequacy": res_rel,
        "source_coverage": source_name,
        "optical_imagery_source": optical_src_desc,
        "detector_applicability": applicability,
        "unresolved_evidence": unresolved,
        "unquantified_uncertainty_components": [
            "absolute_areoid_vertical_accuracy",
            "bilinear_resampling_error_1m_to_20m",
            "local_stereo_decorrelation_error",
            "sensor_coregistration_offset",
        ],
        "calibration_status": "UNCALIBRATED_HEURISTIC_ORDINAL_INDICES",
    }

    codes = [c for c in restriction_code.split("+") if c] if restriction_code else []

    return CellUncertaintyProfile(
        coordinate={"lat": round(lat, 6), "lon": round(lon, 6)},
        source_dataset=source_name,
        resolution_class=res_class,
        data_reliability_index=data_rel,
        data_reliability_level=data_level,
        detection_reliability_index=det_rel,
        detection_reliability_level=det_level,
        nominal_vertical_precision_m=spatial_val,
        precision_tier_label=precision_label,
        uncertainty_precision_status="PROVISIONAL_UNVERIFIED_NOMINAL_TIER",
        evidence_dimensions=evidence_dims,
        property_epistemic_classes=prop_epistemic,
        epistemic_class=epistemic_summary,
        is_unknown=is_unmapped,
        hazard_classification=hazard_class,
        restriction_codes=codes,
        reasoning=reason,
        data_confidence_score=data_rel,
        data_confidence_level=data_level,
        detection_confidence_score=det_rel,
        detection_confidence_level=det_level,
        spatial_uncertainty_m=spatial_val,
    )
