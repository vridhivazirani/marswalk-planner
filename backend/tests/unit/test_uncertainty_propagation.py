"""Unit and regression tests for M0.3: Hazard Uncertainty Propagation.

Verifies:
1. Data confidence strictly reflects physical sensor provenance and native resolution.
2. Detection confidence separates direct geometric derivatives from heuristic classifiers.
3. Spatial uncertainty preserves physical elevation sigma_z and resolution tiers.
4. Cell-level uncertainty schema completeness and reason code preservation.
5. Route uncertainty propagation: distinguishes well-characterized, hazardous, and uncertain routes.
6. Backward compatibility with existing routing and inspection endpoints.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from fastapi.testclient import TestClient

from app.costmap.evaluator import normalize_uncertainty
from app.hazards.config import HazardProfile
from app.hazards.evaluator import compute_hazard_bundle
from app.hazards.pipeline import HazardIntelligenceEngine
from app.hazards.uncertainty import (
    STANDARD_NODATA_FLOAT,
    DataConfidenceLevel,
    DetectionConfidenceLevel,
    ResolutionClass,
    RouteTerrainCharacterization,
    build_cell_uncertainty_profile,
    compute_data_confidence,
    compute_detection_confidence,
    compute_optical_imagery_reliability,
    compute_spatial_uncertainty,
    evaluate_uncertainty_bundle,
)
from app.main import app
from app.routing.engine import RouteOptimizationEngine

client = TestClient(app)


def test_1_data_confidence_provenance_and_nodata_separation():
    """HiRISE (source 2) has index 0.95, CTX (source 1) 0.70, NoData strictly -9999.0."""
    source_id = np.array([[2, 1], [0, 2]], dtype=np.uint8)
    valid_mask = np.array([[True, True], [False, True]], dtype=bool)

    conf = compute_data_confidence(source_id, valid_mask)
    assert np.isclose(conf[0, 0], 0.95)
    assert np.isclose(conf[0, 1], 0.70)
    assert conf[1, 0] == STANDARD_NODATA_FLOAT
    assert np.isclose(conf[1, 1], 0.95)


def test_2_detection_confidence_provenance_and_hazard_independence():
    """Detection reliability reflects sensor/optical/resolution evidence, NOT hazard magnitude."""
    shape = (2, 2)
    slope_mixed = np.array([[0.0, 22.0], [35.0, 2.0]], dtype=np.float32)
    tri_mixed = np.array([[0.0, 2.5], [4.0, 0.1]], dtype=np.float32)
    boulder_mixed = np.array([[0.0, 0.95], [0.85, 0.0]], dtype=np.float32)
    sand = np.array([[0.0, 0.90], [0.0, 0.40]], dtype=np.float32)
    crater = np.array([[0.0, 0.80], [0.50, 0.0]], dtype=np.float32)
    source_id = np.array([[2, 2], [1, 1]], dtype=np.uint8)
    valid_mask = np.ones(shape, dtype=bool)

    det_conf = compute_detection_confidence(
        slope_mixed, tri_mixed, boulder_mixed, sand, crater, source_id, valid_mask
    )

    # Identical HiRISE provenance yields same evidence reliability regardless of hazard magnitude
    assert np.isclose(det_conf[0, 0], det_conf[0, 1])
    assert np.isclose(det_conf[0, 0], 0.8125, atol=1e-4)  # 0.50*0.95 + 0.25*0.40 + 0.25*0.95
    # CTX provenance yields lower evidence reliability (0.50*0.70 + 0.25*0.40 + 0.25*0.35)
    assert np.isclose(det_conf[1, 0], det_conf[1, 1])
    assert np.isclose(det_conf[1, 0], 0.5375, atol=1e-4)

    # With native high-resolution optical imagery (imagery_source_id=2), HiRISE reaches 0.925 (HIGH)
    det_hi_opt = compute_detection_confidence(
        slope_mixed,
        tri_mixed,
        boulder_mixed,
        sand,
        crater,
        source_id,
        valid_mask,
        imagery_source_id=np.full(shape, 2, dtype=np.uint8),
    )
    assert det_hi_opt[0, 0] >= 0.90


def test_3_spatial_uncertainty_physical_sigma_z():
    """Spatial elevation uncertainty must reflect physical vertical precision."""
    source_id = np.array([[2, 1]], dtype=np.uint8)
    sigma_z = np.array([[0.20, 2.00]], dtype=np.float32)
    valid_mask = np.array([[True, True]], dtype=bool)

    spat_unc = compute_spatial_uncertainty(source_id, sigma_z, valid_mask)
    assert np.isclose(spat_unc[0, 0], 0.20)
    assert np.isclose(spat_unc[0, 1], 2.00)


def test_4_uncertainty_bundle_integration():
    """evaluate_uncertainty_bundle returns complete structured raster layers."""
    shape = (4, 4)
    slope = np.full(shape, 12.0, dtype=np.float32)
    tri = np.full(shape, 0.8, dtype=np.float32)
    boulder = np.zeros(shape, dtype=np.float32)
    sand = np.zeros(shape, dtype=np.float32)
    crater = np.zeros(shape, dtype=np.float32)
    source_id = np.full(shape, 2, dtype=np.uint8)
    source_id[2:, :] = 1
    sigma_z = np.where(source_id == 2, 0.2, 2.0).astype(np.float32)
    valid_mask = np.ones(shape, dtype=bool)

    bundle = evaluate_uncertainty_bundle(
        slope, tri, boulder, sand, crater, source_id, sigma_z, valid_mask
    )

    assert bundle.data_confidence.shape == shape
    assert bundle.detection_confidence.shape == shape
    assert bundle.spatial_uncertainty_m.shape == shape
    assert bundle.resolution_uncertainty.shape == shape
    assert bundle.unknown_mask.shape == shape

    # Top half (HiRISE): resolution_uncertainty is 0
    assert np.all(bundle.resolution_uncertainty[:2, :] == 0)
    # Bottom half (CTX): resolution_uncertainty is 1
    assert np.all(bundle.resolution_uncertainty[2:, :] == 1)


def test_5_cell_level_uncertainty_schema():
    """build_cell_uncertainty_profile outputs documented schema with reason codes."""
    prof_hirise = build_cell_uncertainty_profile(
        lat=18.4501,
        lon=77.4321,
        source_id=2,
        is_valid=True,
        slope_deg=14.5,
        tri_m=0.85,
        boulder_score=0.20,
        sand_score=0.10,
        crater_score=0.05,
        sigma_z_m=0.20,
        is_impassable=False,
        restriction_code="",
    )

    assert prof_hirise.resolution_class == ResolutionClass.NATIVE_HIRISE_1M.value
    assert prof_hirise.data_reliability_level == DataConfidenceLevel.HIGH.value
    assert prof_hirise.detection_reliability_level == DetectionConfidenceLevel.MODERATE.value
    assert prof_hirise.nominal_vertical_precision_m == 0.20
    assert prof_hirise.uncertainty_precision_status == "PROVISIONAL_UNVERIFIED_NOMINAL_TIER"
    assert prof_hirise.property_epistemic_classes["cv_hazard_heuristics"] == "HEURISTIC"
    assert prof_hirise.property_epistemic_classes["terrain_derivatives"] == "DERIVED"
    assert prof_hirise.hazard_classification == "PASSABLE"

    # Unmapped cell returns None scalars rather than fabricating 0.0% / 2.0m
    prof_unmapped = build_cell_uncertainty_profile(
        lat=18.4501,
        lon=77.4321,
        source_id=0,
        is_valid=False,
        slope_deg=-9999.0,
        tri_m=-9999.0,
        boulder_score=0.0,
        sand_score=0.0,
        crater_score=0.0,
        sigma_z_m=-9999.0,
        is_impassable=True,
        restriction_code="NO_DATA_UNKNOWN",
    )
    assert prof_unmapped.is_unknown is True
    assert prof_unmapped.data_reliability_index is None
    assert prof_unmapped.detection_reliability_index is None
    assert prof_unmapped.nominal_vertical_precision_m is None
    assert prof_unmapped.epistemic_class == "UNKNOWN"

    prof_ctx = build_cell_uncertainty_profile(
        lat=18.4600,
        lon=77.4100,
        source_id=1,
        is_valid=True,
        slope_deg=26.5,
        tri_m=4.2,
        boulder_score=0.1,
        sand_score=0.1,
        crater_score=0.0,
        sigma_z_m=2.0,
        is_impassable=True,
        restriction_code="CTX_SLOPE_GT_MAX+UNRESOLVED_RESOLUTION_HAZARD",
    )

    assert prof_ctx.resolution_class == ResolutionClass.REGIONAL_CTX_20M.value
    assert prof_ctx.data_confidence_level == DataConfidenceLevel.MODERATE.value
    assert prof_ctx.hazard_classification == "RESTRICTED"
    assert "CTX_SLOPE_GT_MAX" in prof_ctx.restriction_codes
    assert "UNRESOLVED_RESOLUTION_HAZARD" in prof_ctx.restriction_codes


def test_6_hazard_bundle_has_m03_uncertainty_fields():
    """compute_hazard_bundle populates distinct M0.3 multi-dimensional uncertainty layers."""
    shape = (3, 3)
    slope = np.full(shape, 8.0, dtype=np.float32)
    tri = np.full(shape, 0.4, dtype=np.float32)
    boulder = np.zeros(shape, dtype=np.float32)
    sand = np.zeros(shape, dtype=np.float32)
    crater = np.zeros(shape, dtype=np.float32)
    valid_mask = np.ones(shape, dtype=bool)
    source_id = np.full(shape, 2, dtype=np.uint8)

    bundle = compute_hazard_bundle(
        slope=slope,
        tri=tri,
        boulder_score=boulder,
        sand_score=sand,
        crater_score=crater,
        valid_mask=valid_mask,
        source_id=source_id,
        profile=HazardProfile(),
    )

    assert bundle.data_confidence is not None
    assert bundle.detection_confidence is not None
    assert bundle.spatial_uncertainty_m is not None
    assert bundle.data_confidence.shape == shape
    assert np.all(bundle.data_confidence == 0.95)


def test_7_route_planning_propagates_uncertainty_metrics():
    """RouteOptimizationEngine computes route uncertainty exposure and characterization."""
    engine = RouteOptimizationEngine()
    plan = engine.compute_route(
        start_lat=18.4400,
        start_lon=77.4400,
        dest_lat=18.4480,
        dest_lon=77.4480,
        profile_name="BALANCED",
    )

    m = plan.metrics
    assert hasattr(m, "mean_data_confidence")
    assert hasattr(m, "mean_detection_confidence")
    assert hasattr(m, "resolution_uncertainty_distance_m")
    assert hasattr(m, "resolution_uncertainty_fraction")
    assert hasattr(m, "terrain_characterization")
    assert hasattr(m, "uncertainty_explanation")

    assert 0.0 <= m.mean_data_confidence <= 1.0
    assert 0.0 <= m.mean_detection_confidence <= 1.0
    assert m.resolution_uncertainty_distance_m >= 0.0
    assert m.terrain_characterization in [
        RouteTerrainCharacterization.OBSERVED_WELL_CHARACTERIZED.value,
        RouteTerrainCharacterization.OBSERVED_HAZARDOUS.value,
        RouteTerrainCharacterization.LOWER_RESOLUTION_UNCERTAIN.value,
        RouteTerrainCharacterization.LOWER_RESOLUTION_HAZARDOUS.value,
        RouteTerrainCharacterization.UNKNOWN_TERRAIN.value,
    ]
    assert len(m.uncertainty_explanation) > 10

    # Check waypoints preserve uncertainty and resolution tier
    wp = plan.waypoints[0]
    assert hasattr(wp, "data_confidence")
    assert hasattr(wp, "resolution_class")
    assert wp.resolution_class in ["NATIVE_HIRISE_1M", "REGIONAL_CTX_20M", "UNMAPPED"]


def test_8_api_hazard_inspect_returns_uncertainty_profile():
    """GET /hazards/inspect returns multi-dimensional uncertainty and epistemic class."""
    resp = client.get("/api/v1/hazards/inspect?lat=18.4485&lon=77.4320")
    assert resp.status_code == 200
    data = resp.json()

    assert "data_confidence" in data
    assert "detection_confidence" in data
    assert "spatial_uncertainty_m" in data
    assert "resolution_class" in data
    assert "uncertainty_profile" in data

    up = data["uncertainty_profile"]
    assert "data_confidence_score" in up
    assert "detection_confidence_score" in up
    assert "spatial_uncertainty_m" in up
    assert "reasoning" in up


def test_9_api_uncertainty_png_overlays_exist():
    """All M0.3 uncertainty PNG preview endpoints return valid image/png."""
    endpoints = [
        "/api/v1/hazards/raster/data-confidence.png",
        "/api/v1/hazards/raster/detection-confidence.png",
        "/api/v1/hazards/raster/spatial-uncertainty.png",
        "/api/v1/hazards/raster/resolution-uncertainty.png",
    ]
    for ep in endpoints:
        resp = client.get(ep)
        assert resp.status_code == 200, f"Endpoint {ep} failed: {resp.status_code}"
        assert resp.headers["content-type"] == "image/png"
        assert len(resp.content) > 100


def test_10_authoritative_raster_products_exist_and_aligned():
    """All M0.3 GeoTIFF products match the authoritative 586x362 grid."""
    proc = Path(__file__).resolve().parents[3] / "data" / "processed"
    m03_tifs = [
        "jezero_western_delta_20m_hazard_data_confidence.tif",
        "jezero_western_delta_20m_hazard_detection_confidence.tif",
        "jezero_western_delta_20m_hazard_spatial_uncertainty_m.tif",
    ]

    for filename in m03_tifs:
        tif_path = proc / filename
        assert tif_path.exists(), f"Missing M0.3 product: {filename}"
        with rasterio.open(tif_path) as src:
            assert src.shape == (586, 362)
            assert src.nodata == -9999.0
            assert src.dtypes[0] == "float32"


def test_11_nodata_and_valid_zero_distinction(tmp_path: Path):
    """Valid zero stays distinguishable from STANDARD_NODATA_FLOAT (-9999.0); no 999.0 leak."""
    shape = (2, 2)
    source_id = np.array([[2, 2], [0, 1]], dtype=np.uint8)
    valid_mask = np.array([[True, True], [False, True]], dtype=bool)
    slope = np.array([[5.0, -9999.0], [-9999.0, 5.0]], dtype=np.float32)
    tri = np.array([[0.3, 0.3], [-9999.0, 0.3]], dtype=np.float32)
    no_opt = np.full(shape, -9999.0, dtype=np.float32)

    det = compute_detection_confidence(
        slope,
        tri,
        no_opt,
        no_opt,
        no_opt,
        source_id,
        valid_mask,
    )
    # Valid zero (mapped cell missing geom + opt evidence) -> 0.0 vs NoData (-9999.0)
    assert det[0, 1] == 0.0
    assert det[1, 0] == STANDARD_NODATA_FLOAT

    # Missing sigma_z or legacy 999.0 maps cleanly to -9999.0 (float) and 1.0 (costmap)
    spat = compute_spatial_uncertainty(
        source_id=np.array([[2, 1, 0]], dtype=np.uint8),
        sigma_z=np.array([[0.20, 999.0, -9999.0]], dtype=np.float32),
        valid_mask=np.array([[True, True, False]], dtype=bool),
    )
    assert np.isclose(spat[0, 0], 0.20)
    assert spat[0, 1] == STANDARD_NODATA_FLOAT
    assert spat[0, 2] == STANDARD_NODATA_FLOAT

    c_unc = normalize_uncertainty(
        np.array([0.20, -9999.0, 999.0, np.nan], dtype=np.float32),
        np.array([True, False, True, True]),
    )
    assert np.isclose(c_unc[0], 0.0)
    assert np.allclose(c_unc[1:], 1.0)

    # Check actual processed rasters for -9999.0 NoData and zero 999.0 leak
    proc = Path(__file__).resolve().parents[3] / "data" / "processed"
    for fname in [
        "jezero_western_delta_20m_uncertainty_sigma_z.tif",
        "jezero_western_delta_20m_hazard_data_confidence.tif",
        "jezero_western_delta_20m_hazard_detection_confidence.tif",
        "jezero_western_delta_20m_hazard_spatial_uncertainty_m.tif",
    ]:
        with rasterio.open(proc / fname) as src:
            arr = src.read(1)
            assert src.nodata == -9999.0
            assert not np.any(np.isclose(arr, 999.0))


def test_12_hazard_magnitude_independence_and_continuity():
    """Evidence reliability index is invariant to slope, boulder, sand, and crater severity."""
    sweeps = np.array([[0.0, 0.149, 0.151, 0.199, 0.201, 0.299, 0.301, 0.95]], dtype=np.float32)
    slopes = np.array([[0.0, 4.0, 8.0, 15.0, 24.9, 25.1, 35.0, 45.0]], dtype=np.float32)
    tris = np.array([[0.0, 0.2, 0.5, 1.5, 4.0, 7.9, 8.1, 15.0]], dtype=np.float32)
    valid = np.ones_like(sweeps, dtype=bool)

    for sid, expected_det in [(2, 0.8125), (1, 0.5375)]:
        src_arr = np.full(sweeps.shape, sid, dtype=np.uint8)
        det = compute_detection_confidence(
            slopes, tris, sweeps, sweeps[::-1], sweeps, src_arr, valid
        )
        assert np.allclose(det, expected_det, atol=1e-5)


def test_13_raster_vs_api_inspect_exact_equivalence():
    """GET /hazards/inspect matches processed TIF values verbatim on HiRISE and CTX pixels."""
    from app.geospatial.crs import MarsCoordinateSystem

    proc = Path(__file__).resolve().parents[3] / "data" / "processed"
    with (
        rasterio.open(proc / "jezero_western_delta_20m_source_id.tif") as sid_src,
        rasterio.open(proc / "jezero_western_delta_20m_hazard_data_confidence.tif") as dc_src,
        rasterio.open(proc / "jezero_western_delta_20m_hazard_detection_confidence.tif") as det_src,
        rasterio.open(proc / "jezero_western_delta_20m_hazard_spatial_uncertainty_m.tif") as sp_src,
    ):
        sid = sid_src.read(1)
        dc = dc_src.read(1)
        det = det_src.read(1)
        sp = sp_src.read(1)
        transform = sid_src.transform

        hi_idx = np.argwhere(sid == 2)[100]
        ctx_idx = np.argwhere(sid == 1)[100]

    mars = MarsCoordinateSystem()
    for row, col in [hi_idx, ctx_idx]:
        px, py = rasterio.transform.xy(transform, int(row), int(col))
        lon, lat = mars.to_geographic(px, py)
        resp = client.get(f"/api/v1/hazards/inspect?lat={lat}&lon={lon}")
        assert resp.status_code == 200
        data = resp.json()

        assert np.isclose(data["data_reliability_index"], float(dc[row, col]), atol=1e-4)
        assert np.isclose(data["detection_reliability_index"], float(det[row, col]), atol=1e-4)
        assert np.isclose(data["nominal_vertical_precision_m"], float(sp[row, col]), atol=1e-4)
        # No 0.80 legacy divergence
        assert data["confidence"] == data["data_reliability_index"]
        assert data["uncertainty_precision_status"] == "PROVISIONAL_UNVERIFIED_NOMINAL_TIER"


def test_14_optical_cv_provenance_and_epistemic_labels():
    """Optical CV defaults to 20m CTX tier (0.40) and epistemic tags classify heuristics."""
    import json

    opt_rel = compute_optical_imagery_reliability(
        source_id=np.array([[2, 1, 0]], dtype=np.uint8),
        valid_mask=np.array([[True, True, False]]),
    )
    assert np.isclose(opt_rel[0, 0], 0.40)  # Even HiRISE terrain uses 20m CTX ortho
    assert np.isclose(opt_rel[0, 1], 0.40)
    assert opt_rel[0, 2] == STANDARD_NODATA_FLOAT

    catalog = Path(__file__).resolve().parents[3] / "data" / "catalog"
    haz_cat = json.loads(
        (catalog / "jezero_western_delta_20m_hazard_intelligence.json").read_text(encoding="utf-8")
    )
    assert haz_cat["provenance"]["cv_optical_imagery_input"]["product_doi"] == "10.5066/P9GV1ND3"
    by_cat_layer = {layer["id"]: layer for layer in haz_cat["layers"]}
    assert by_cat_layer["h_boulder"]["epistemic"] == "HEURISTIC"
    assert by_cat_layer["data_confidence"]["epistemic"] == "HEURISTIC"
    assert by_cat_layer["detection_confidence"]["epistemic"] == "HEURISTIC"
    assert by_cat_layer["spatial_uncertainty"]["epistemic"] == "HEURISTIC"
    assert by_cat_layer["resolution_uncertainty"]["epistemic"] == "DERIVED"

    layers = client.get("/api/v1/twin/layers").json()["layers"]
    by_id = {layer["id"]: layer for layer in layers}
    assert by_id["data_confidence"]["epistemic_class"] == "HEURISTIC"
    assert by_id["detection_confidence"]["epistemic_class"] == "HEURISTIC"
    assert by_id["spatial_uncertainty"]["epistemic_class"] == "HEURISTIC"
    assert by_id["resolution_uncertainty"]["epistemic_class"] == "DERIVED"


def test_15_qc_png_palette_and_jezero_obstacle_count_preserved(tmp_path: Path):
    """QC PNGs distinguish valid low indices from NoData; 61,055 obstacles remain exact."""
    arr_conf = np.array([[0.0, 0.5, 0.75, 0.95, -9999.0]], dtype=np.float32)
    unk = np.array([[False, False, False, False, True]], dtype=bool)
    conf_png = tmp_path / "conf_qc.png"
    HazardIntelligenceEngine._generate_confidence_qc(arr_conf, conf_png, unknown_mask=unk)
    with rasterio.open(conf_png) as src:
        rgb = src.read()
        # Valid 0.0 -> Crimson (220, 38, 38); NoData -> Dark Slate (15, 23, 42)
        assert tuple(rgb[:, 0, 0]) == (220, 38, 38)
        assert tuple(rgb[:, 0, 4]) == (15, 23, 42)

    arr_sp = np.array([[0.20, 2.00, -9999.0, 999.0]], dtype=np.float32)
    unk_sp = np.array([[False, False, True, False]], dtype=bool)
    sp_png = tmp_path / "sp_qc.png"
    HazardIntelligenceEngine._generate_spatial_qc(arr_sp, sp_png, unknown_mask=unk_sp)
    with rasterio.open(sp_png) as src:
        rgb_sp = src.read()
        assert tuple(rgb_sp[:, 0, 0]) == (56, 189, 248)
        assert tuple(rgb_sp[:, 0, 1]) == (249, 115, 22)
        assert tuple(rgb_sp[:, 0, 2]) == (255, 0, 220)
        assert tuple(rgb_sp[:, 0, 3]) == (255, 0, 220)

    proc = Path(__file__).resolve().parents[3] / "data" / "processed"
    with rasterio.open(proc / "jezero_western_delta_20m_hazard_hard_impassable.tif") as src:
        imp = src.read(1)
        assert src.nodata == 255.0
        assert int(np.count_nonzero(imp == 1)) == 61055
        assert int(np.count_nonzero(imp == 0)) == 151077


def test_16_route_arc_length_metrics_and_ctx_fraction_consistency():
    """Route metrics use arc-length weighting, max/p95 sigma_z, and consistent CTX fraction."""
    engine = RouteOptimizationEngine()
    for simplify in (True, False):
        plan = engine.compute_route(
            start_lat=18.4446,
            start_lon=77.4509,
            dest_lat=18.4550,
            dest_lon=77.4050,
            profile_name="BALANCED",
            simplify=simplify,
        )
        m = plan.metrics
        assert m.metric_averaging_method == "ARC_LENGTH_WEIGHTED_TRAPEZOIDAL"
        assert m.max_uncertainty_m is not None
        assert m.p95_uncertainty_m is not None
        assert m.mean_uncertainty_exposure is not None
        assert m.max_uncertainty_m >= m.p95_uncertainty_m >= m.mean_uncertainty_exposure
        assert np.isclose(
            m.resolution_uncertainty_distance_m / m.total_distance_m,
            m.resolution_uncertainty_fraction,
            atol=1e-4,
        )
        assert m.hazard_classification in ("LOW", "MODERATE", "ELEVATED")
        assert m.observation_reliability_tier in (
            "HIRISE_1M_COVERAGE",
            "MIXED_OR_CTX_20M_COVERAGE",
            "INCLUDES_UNMAPPED_TERRAIN",
        )


def test_17_synthetic_lower_resolution_hazardous_and_unmapped_inspect(tmp_path: Path):
    """Permissive routing separates hazard vs CTX tier; unmapped /inspect returns null."""
    from rasterio.transform import from_origin

    shape = (6, 6)
    transform = from_origin(0.0, 120.0, 20.0, 20.0)
    meta = {
        "driver": "GTiff",
        "height": shape[0],
        "width": shape[1],
        "count": 1,
        "crs": "ESRI:103885",
        "transform": transform,
    }

    def _write(name: str, data: np.ndarray, dtype: str, nodata: float | int) -> None:
        m = dict(meta, dtype=dtype, nodata=nodata)
        with rasterio.open(tmp_path / f"jezero_western_delta_20m_{name}.tif", "w", **m) as dst:
            dst.write(data.astype(dtype), 1)

    _write("elevation", np.full(shape, -2500.0, dtype=np.float32), "float32", -9999.0)
    _write("slope_deg", np.full(shape, 18.0, dtype=np.float32), "float32", -9999.0)
    _write("tri_roughness_m", np.full(shape, 2.0, dtype=np.float32), "float32", -9999.0)
    _write("hazard_overall_score", np.full(shape, 0.55, dtype=np.float32), "float32", -9999.0)
    _write("hazard_hard_impassable", np.zeros(shape, dtype=np.uint8), "uint8", 255)
    _write("uncertainty_sigma_z", np.full(shape, 2.0, dtype=np.float32), "float32", -9999.0)
    _write("science_opportunity", np.full(shape, 0.5, dtype=np.float32), "float32", -9999.0)
    _write("source_id", np.ones(shape, dtype=np.uint8), "uint8", 255)
    _write("hazard_data_confidence", np.full(shape, 0.70, dtype=np.float32), "float32", -9999.0)
    _write(
        "hazard_detection_confidence", np.full(shape, 0.5375, dtype=np.float32), "float32", -9999.0
    )
    _write("hazard_resolution_uncertainty", np.ones(shape, dtype=np.uint8), "uint8", 255)

    engine = RouteOptimizationEngine(processed_dir=tmp_path)
    lat0, lon0, _, _ = engine.grid_to_latlon(1, 1)
    lat1, lon1, _, _ = engine.grid_to_latlon(4, 4)

    plan = engine.compute_route(
        start_lat=lat0,
        start_lon=lon0,
        dest_lat=lat1,
        dest_lon=lon1,
        profile_name="BALANCED",
    )
    assert (
        plan.metrics.terrain_characterization
        == RouteTerrainCharacterization.LOWER_RESOLUTION_HAZARDOUS.value
    )
    assert plan.metrics.hazard_classification == "ELEVATED"
    assert plan.metrics.observation_reliability_tier == "MIXED_OR_CTX_20M_COVERAGE"
    assert np.isclose(plan.metrics.resolution_uncertainty_fraction, 1.0)
    assert np.isclose(plan.metrics.max_uncertainty_m or 0.0, 2.0)

    # Unmapped cell profile check (API schema guarantees null rather than 2.0m/0.0%)
    unmapped = build_cell_uncertainty_profile(
        lat=18.4,
        lon=77.4,
        source_id=0,
        is_valid=False,
        slope_deg=-9999.0,
        tri_m=-9999.0,
        boulder_score=0.0,
        sand_score=0.0,
        crater_score=0.0,
        sigma_z_m=-9999.0,
        is_impassable=True,
        restriction_code="NO_DATA_UNKNOWN",
    )
    assert unmapped.nominal_vertical_precision_m is None
    assert unmapped.data_reliability_index is None
    assert unmapped.detection_reliability_index is None
