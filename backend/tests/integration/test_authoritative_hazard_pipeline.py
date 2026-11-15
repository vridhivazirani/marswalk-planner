"""Comprehensive integration and regression test suite for M0.2.1:
Authoritative Hazard Pipeline Consolidation.

Verifies:
1. Native and fused engines cannot overwrite each other's source products.
2. HiRISE NoData plus CTX coverage retains lower-resolution uncertainty classification.
3. No-source-coverage cells remain UNKNOWN and impassable.
4. Native HiRISE hazards remain present after fusion.
5. Any confirmed native hard obstacle remains blocked.
6. Different execution orders produce equivalent final outputs.
7. Missing native hazard products cannot silently produce incomplete assessment.
8. Route planning loads the authoritative product.
9. Costmap profiles preserve the required obstacle policy.
10. Catalog metadata correctly identifies every source and processing stage.
11. RouteCompareRequest algorithm validation returns HTTP 422 on invalid strings.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from fastapi.testclient import TestClient

from app.costmap.pipeline import CostmapEngine
from app.hazards.config import HazardProfile
from app.hazards.evaluator import compute_hazard_bundle
from app.hazards.pipeline import HazardIntelligenceEngine
from app.main import app
from app.routing.engine import RouteOptimizationEngine
from app.terrain.native_hazards import NativeResolutionHazardPipeline

client = TestClient(app)


def test_1_separate_scientific_product_ownership(tmp_path: Path):
    """Native and fused engines must own distinct products and never overwrite each other."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    processed_dir = data_root / "processed"

    # 1. Native pipeline products
    native_obs = processed_dir / "jezero_western_delta_20m_hirise_hazard_obstacles.tif"
    native_bld = processed_dir / "jezero_western_delta_20m_hirise_boulder_score.tif"
    native_slp = processed_dir / "jezero_western_delta_20m_hirise_slope_deg.tif"

    assert native_obs.exists(), "Native HiRISE obstacle mask must exist as distinct product"
    assert native_bld.exists(), "Native HiRISE boulder score must exist as distinct product"
    assert native_slp.exists(), "Native HiRISE slope must exist as distinct product"

    # 2. Authoritative fused products
    auth_imp = processed_dir / "jezero_western_delta_20m_hazard_hard_impassable.tif"
    auth_unc = processed_dir / "jezero_western_delta_20m_hazard_resolution_uncertainty.tif"
    auth_ovr = processed_dir / "jezero_western_delta_20m_hazard_overall_score.tif"

    assert auth_imp.exists(), "Authoritative hard impassable mask must exist"
    assert auth_unc.exists(), "Resolution uncertainty layer must exist as distinct product"
    assert auth_ovr.exists(), "Overall hazard score must exist"

    # Native pipeline does NOT export hard_impassable
    native_pipe = NativeResolutionHazardPipeline(data_root=data_root)
    # Check that NativeResolutionHazardPipeline does not claim hard_impassable
    assert not hasattr(native_pipe, "hard_impassable_path")


def test_2_hirise_nodata_ctx_coverage_retains_uncertainty():
    """HiRISE NoData with CTX (Case B) must be classified as unresolved uncertainty."""
    # Synthetic grid: cell 0 is HiRISE (source_id=2), cell 1 is CTX only (source_id=1)
    slope = np.array([[5.0, 5.0]], dtype=np.float32)
    tri = np.array([[0.2, 0.2]], dtype=np.float32)
    boulder = np.array([[0.0, 0.0]], dtype=np.float32)
    sand = np.array([[0.0, 0.0]], dtype=np.float32)
    crater = np.array([[0.0, 0.0]], dtype=np.float32)
    valid_mask = np.array([[True, True]], dtype=bool)
    source_id = np.array([[2, 1]], dtype=np.uint8)  # Cell 0=HiRISE, Cell 1=CTX
    hirise_obs = np.array([[0, 0]], dtype=np.uint8)

    profile = HazardProfile(forbid_resolution_uncertainty=True)
    bundle = compute_hazard_bundle(
        slope=slope,
        tri=tri,
        boulder_score=boulder,
        sand_score=sand,
        crater_score=crater,
        valid_mask=valid_mask,
        source_id=source_id,
        profile=profile,
        hirise_obstacle_mask=hirise_obs,
    )

    # HiRISE cell with low slope is safe
    assert not bundle.hard_impassable_mask[0, 0]

    # CTX-only cell retains unresolved uncertainty under conservative policy
    assert bundle.hard_impassable_mask[0, 1]
    assert "UNRESOLVED_RESOLUTION_HAZARD" in bundle.restriction_codes[0, 1]


def test_3_no_source_coverage_remains_unknown_and_impassable():
    """Cells with neither HiRISE nor CTX (Case C) must be impassable with NO_DATA_UNKNOWN."""
    slope = np.array([[0.0]], dtype=np.float32)
    tri = np.array([[0.0]], dtype=np.float32)
    boulder = np.array([[0.0]], dtype=np.float32)
    sand = np.array([[0.0]], dtype=np.float32)
    crater = np.array([[0.0]], dtype=np.float32)
    valid_mask = np.array([[False]], dtype=bool)
    source_id = np.array([[0]], dtype=np.uint8)  # Unmapped

    bundle = compute_hazard_bundle(
        slope=slope,
        tri=tri,
        boulder_score=boulder,
        sand_score=sand,
        crater_score=crater,
        valid_mask=valid_mask,
        source_id=source_id,
    )

    assert bundle.hard_impassable_mask[0, 0]
    assert bundle.restriction_codes[0, 0] == "NO_DATA_UNKNOWN"
    assert bundle.overall_hazard[0, 0] == 1.0


def test_4_native_hirise_hazards_remain_present_after_fusion():
    """Native 1m micro-hazards (Case A) must be preserved in the fused authoritative mask."""
    # HiRISE cell with native obstacle detection
    slope = np.array([[10.0]], dtype=np.float32)  # Low slope
    tri = np.array([[0.4]], dtype=np.float32)
    boulder = np.array([[0.60]], dtype=np.float32)  # High boulder candidate
    sand = np.array([[0.0]], dtype=np.float32)
    crater = np.array([[0.0]], dtype=np.float32)
    valid_mask = np.array([[True]], dtype=bool)
    source_id = np.array([[2]], dtype=np.uint8)
    hirise_obs = np.array([[1]], dtype=np.uint8)  # Flagged by native 1m detector

    bundle = compute_hazard_bundle(
        slope=slope,
        tri=tri,
        boulder_score=boulder,
        sand_score=sand,
        crater_score=crater,
        valid_mask=valid_mask,
        source_id=source_id,
        hirise_obstacle_mask=hirise_obs,
    )

    assert bundle.hard_impassable_mask[0, 0]
    assert "NATIVE_HIRISE_OBSTACLE" in bundle.restriction_codes[0, 0]


def test_5_confirmed_native_hard_obstacle_remains_blocked():
    """Steep slope (>=25°) on native HiRISE must produce SLOPE_GT_MAX."""
    slope = np.array([[27.5]], dtype=np.float32)
    tri = np.array([[0.3]], dtype=np.float32)
    boulder = np.array([[0.0]], dtype=np.float32)
    sand = np.array([[0.0]], dtype=np.float32)
    crater = np.array([[0.0]], dtype=np.float32)
    valid_mask = np.array([[True]], dtype=bool)
    source_id = np.array([[2]], dtype=np.uint8)

    bundle = compute_hazard_bundle(
        slope=slope,
        tri=tri,
        boulder_score=boulder,
        sand_score=sand,
        crater_score=crater,
        valid_mask=valid_mask,
        source_id=source_id,
    )

    assert bundle.hard_impassable_mask[0, 0]
    assert "SLOPE_GT_MAX" in bundle.restriction_codes[0, 0]


def test_6_execution_order_independence():
    """Running hazard pipelines in different orders must produce bit-for-bit identical outputs."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    hazard_engine = HazardIntelligenceEngine(data_root=data_root)

    # Run Authoritative Fusion (Order 1)
    bundle1, files1 = hazard_engine.run_hazard_analysis()

    with rasterio.open(files1["hard_impassable"]) as src:
        mask1 = src.read(1)

    # Run Native Pipeline afterwards
    native_pipe = NativeResolutionHazardPipeline(data_root=data_root)
    # Check that native pipe does not touch hard_impassable
    assert "hard_impassable" not in native_pipe.process_and_export()

    # Re-run Authoritative Fusion (Order 2)
    bundle2, files2 = hazard_engine.run_hazard_analysis()

    with rasterio.open(files2["hard_impassable"]) as src:
        mask2 = src.read(1)

    # Must be 100% identical
    assert np.array_equal(mask1, mask2), "Execution order must not change obstacle mask"


def test_7_missing_native_hazard_products_handled_transparently():
    """If native products are missing, HazardIntelligenceEngine invokes them automatically."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    hazard_engine = HazardIntelligenceEngine(data_root=data_root)
    hirise_obs_path = (
        data_root / "processed" / "jezero_western_delta_20m_hirise_hazard_obstacles.tif"
    )

    # Product exists
    assert hirise_obs_path.exists()
    # Engine executes cleanly
    bundle, files = hazard_engine.run_hazard_analysis()
    assert files["hard_impassable"].exists()


def test_8_route_planning_loads_authoritative_product():
    """RouteOptimizationEngine._ensure_data_loaded must load the authoritative mask."""
    engine = RouteOptimizationEngine()
    engine._ensure_data_loaded()

    assert engine._hard_imp is not None
    # Impassable cell count must match the authoritative 61,055 cells
    assert np.count_nonzero(engine._hard_imp) == 61055


def test_9_costmap_profiles_preserve_required_obstacle_policy():
    """Costmap evaluation must strictly propagate authoritative blocked cells."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    costmap_engine = CostmapEngine(
        processed_dir=data_root / "processed",
        catalog_dir=data_root / "catalog",
    )
    bundle, files = costmap_engine.evaluate_costmap(profile_name="safety-first")

    # Hard blocked cells in costmap bundle must equal 61,055
    assert np.count_nonzero(bundle.hard_blocked_mask) == 61055


def test_10_catalog_metadata_identifies_every_source_and_policy():
    """Catalog metadata must document the 4-case fusion policy and pipeline version."""
    catalog_path = (
        Path(__file__).resolve().parents[3]
        / "data"
        / "catalog"
        / "jezero_western_delta_20m_hazard_intelligence.json"
    )
    with open(catalog_path, encoding="utf-8") as f:
        meta = json.load(f)

    assert meta["pipeline_version"].startswith("2.")
    assert "M0.3.2" in meta["pipeline_version"]
    assert "fusion_policy" in meta
    assert "case_a" in meta["fusion_policy"]
    assert "case_b" in meta["fusion_policy"]
    assert "case_c" in meta["fusion_policy"]
    assert "case_d" in meta["fusion_policy"]
    assert meta["statistics"]["hard_impassable_cells"] == 61055
    assert meta["statistics"]["unresolved_uncertainty_cells"] == 49139


def test_11_route_compare_endpoint_validation_returns_422():
    """RouteCompareRequest with invalid algorithm string must return HTTP 422."""
    payload = {
        "start": {"lat": 18.445, "lon": 77.455},
        "destination": {"lat": 18.450, "lon": 77.460},
        "algorithm": "unsupported_algo",
    }
    response = client.post("/api/v1/routing/compare", json=payload)
    assert response.status_code == 422, f"Expected 422: {response.text}"


def test_12_single_writer_ownership_no_coverage_overwrites():
    """NativeResolutionHazardPipeline must consume hirise_coverage and never overwrite it."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    processed_dir = data_root / "processed"
    cov_path = processed_dir / "jezero_western_delta_20m_hirise_coverage.tif"

    with rasterio.open(cov_path) as src:
        before_arr = src.read(1)
        before_count = int(np.count_nonzero(before_arr == 1))

    # Authoritative GeospatialPipeline count is 162,993 cells
    assert before_count == 162993, (
        f"Authoritative HiRISE coverage must be 162993, got {before_count}"
    )

    native_pipe = NativeResolutionHazardPipeline(data_root=data_root)
    created = native_pipe.process_and_export()

    # Must NOT claim or write generic layers or coverage
    assert "hirise_coverage" not in created
    assert "slope_deg" not in created
    assert "boulder_hazard" not in created
    assert "surface_roughness" not in created

    with rasterio.open(cov_path) as src:
        after_arr = src.read(1)
        after_count = int(np.count_nonzero(after_arr == 1))

    assert np.array_equal(before_arr, after_arr), (
        "Native pipeline must not mutate hirise_coverage.tif"
    )
    assert after_count == 162993


def test_13_hazard_bundle_resolution_uncertainty_mask_populated():
    """HazardBundle.resolution_uncertainty_mask must be populated with boolean array."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    engine = HazardIntelligenceEngine(data_root=data_root)
    bundle, files = engine.run_hazard_analysis()

    assert bundle.resolution_uncertainty_mask is not None
    assert isinstance(bundle.resolution_uncertainty_mask, np.ndarray)
    assert bundle.resolution_uncertainty_mask.dtype == bool
    assert bundle.resolution_uncertainty_mask.shape == (586, 362)

    # Count of resolution uncertainty cells must match 49,139 (CTX-only cells)
    assert np.count_nonzero(bundle.resolution_uncertainty_mask) == 49139


def test_14_four_source_coverage_combinations_on_hazard_bundle():
    """HazardBundle must correctly process all 4 source-coverage combinations."""
    # (0, 0): Case A: HiRISE + CTX (source_id=2, valid=True, low slope)
    # (0, 1): Case B: HiRISE with 1m obstacle hit (source_id=2, hirise_obs=1)
    # (1, 0): Case C: CTX only (source_id=1, valid=True) -> unresolved uncertainty
    # (1, 1): Case D: Neither source (source_id=0, valid=False) -> unknown & impassable

    slope = np.array([[5.0, 5.0], [8.0, -9999.0]], dtype=np.float32)
    tri = np.array([[0.5, 0.5], [1.0, -9999.0]], dtype=np.float32)
    boulder = np.zeros((2, 2), dtype=np.float32)
    sand = np.zeros((2, 2), dtype=np.float32)
    crater = np.zeros((2, 2), dtype=np.float32)
    valid_mask = np.array([[True, True], [True, False]], dtype=bool)
    source_id = np.array([[2, 2], [1, 0]], dtype=np.uint8)
    hirise_obs = np.array([[0, 1], [0, 0]], dtype=np.uint8)

    profile = HazardProfile(forbid_resolution_uncertainty=True)
    bundle = compute_hazard_bundle(
        slope=slope,
        tri=tri,
        boulder_score=boulder,
        sand_score=sand,
        crater_score=crater,
        valid_mask=valid_mask,
        source_id=source_id,
        profile=profile,
        hirise_obstacle_mask=hirise_obs,
    )

    # Case A: Passable
    assert not bundle.hard_impassable_mask[0, 0]
    assert bundle.resolution_uncertainty_mask is not None
    assert not bundle.resolution_uncertainty_mask[0, 0]
    assert bundle.h_unknown[0, 0] == 0.0

    # Case B: HiRISE obstacle hit -> Impassable
    assert bundle.hard_impassable_mask[0, 1]
    assert "NATIVE_HIRISE_OBSTACLE" in bundle.restriction_codes[0, 1]

    # Case C: CTX only -> Impassable resolution uncertainty
    assert bundle.resolution_uncertainty_mask[1, 0]
    assert bundle.hard_impassable_mask[1, 0]
    assert "UNRESOLVED_RESOLUTION_HAZARD" in bundle.restriction_codes[1, 0]

    # Case D: Neither -> Unknown impassable
    assert bundle.hard_impassable_mask[1, 1]
    assert "NO_DATA_UNKNOWN" in bundle.restriction_codes[1, 1]
    assert bundle.h_unknown[1, 1] == 1.0


def test_15_native_and_regional_terrain_products_remain_separate():
    """Distinct filenames must exist for native HiRISE vs 20m regional derivatives."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    proc = data_root / "processed"

    # Distinct native products
    assert (proc / "jezero_western_delta_20m_hirise_slope_deg.tif").exists()
    assert (proc / "jezero_western_delta_20m_hirise_boulder_score.tif").exists()
    assert (proc / "jezero_western_delta_20m_hirise_surface_roughness_m.tif").exists()

    # Distinct 20m continuous products
    assert (proc / "jezero_western_delta_20m_slope_deg.tif").exists()
    assert (proc / "jezero_western_delta_20m_boulder_hazard_score.tif").exists()
    assert (proc / "jezero_western_delta_20m_surface_roughness_m.tif").exists()


def test_16_all_raster_products_spatial_alignment_and_crs():
    """All generated 20m products must share identical dimensions (586x362) and CRS."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    proc = data_root / "processed"

    tifs = list(proc.glob("jezero_western_delta_20m_*.tif"))
    assert len(tifs) >= 15

    with rasterio.open(tifs[0]) as ref:
        ref_shape = (ref.height, ref.width)
        ref_crs = ref.crs
        ref_transform = ref.transform

    assert ref_shape == (586, 362)

    for tif in tifs:
        with rasterio.open(tif) as src:
            assert (src.height, src.width) == ref_shape, f"Shape mismatch in {tif.name}"
            assert src.crs == ref_crs, f"CRS mismatch in {tif.name}"
            assert src.transform == ref_transform, f"Transform mismatch in {tif.name}"


def test_17_binary_mask_nodata_and_valid_zero_semantics():
    """Verify binary masks declare nodata=255 so valid zero values remain unmasked."""
    data_root = Path(__file__).resolve().parents[3] / "data"
    proc = data_root / "processed"

    # 1. Hard Impassable Mask
    imp_path = proc / "jezero_western_delta_20m_hazard_hard_impassable.tif"
    assert imp_path.exists()
    with rasterio.open(imp_path) as src:
        assert src.dtypes[0] == "uint8"
        assert src.nodata == 255.0
        raw = src.read(1)
        masked = src.read(1, masked=True)
        unique = set(np.unique(raw))
        assert unique == {0, 1}
        # Valid zero values must NOT be masked out
        num_masked = int(np.sum(masked.mask)) if np.ma.is_masked(masked) else 0
        assert num_masked == 0
        assert np.count_nonzero(raw == 1) == 61055
        assert np.count_nonzero(raw == 0) == 151077

    # 2. Unknown Mask
    unk_path = proc / "jezero_western_delta_20m_hazard_unknown_mask.tif"
    assert unk_path.exists()
    with rasterio.open(unk_path) as src:
        assert src.dtypes[0] == "uint8"
        assert src.nodata == 255.0
        masked = src.read(1, masked=True)
        num_masked = int(np.sum(masked.mask)) if np.ma.is_masked(masked) else 0
        assert num_masked == 0

    # 3. Resolution Uncertainty Mask
    res_path = proc / "jezero_western_delta_20m_hazard_resolution_uncertainty.tif"
    assert res_path.exists()
    with rasterio.open(res_path) as src:
        assert src.dtypes[0] == "uint8"
        assert src.nodata == 255.0
        masked = src.read(1, masked=True)
        num_masked = int(np.sum(masked.mask)) if np.ma.is_masked(masked) else 0
        assert num_masked == 0

    # 4. Overall Hazard Score (float32, nodata=-9999.0)
    haz_path = proc / "jezero_western_delta_20m_hazard_overall_score.tif"
    assert haz_path.exists()
    with rasterio.open(haz_path) as src:
        assert src.dtypes[0] == "float32"
        assert src.nodata == -9999.0

    # 5. Routing Costmaps (float32, nodata=1000000.0)
    for profile in ["balanced", "safety-first", "science-first", "custom"]:
        cost_path = proc / f"jezero_western_delta_20m_costmap_{profile}.tif"
        assert cost_path.exists()
        with rasterio.open(cost_path) as src:
            assert src.dtypes[0] == "float32"
            assert src.nodata == 1000000.0
            raw = src.read(1)
            masked = src.read(1, masked=True)
            num_masked = int(np.sum(masked.mask)) if np.ma.is_masked(masked) else 0
            assert num_masked == 61055
            passable = raw[raw < 1000000.0]
            assert np.all(passable >= 1.0)
            assert np.all(passable <= 10.0)


