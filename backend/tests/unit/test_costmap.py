"""Unit tests for the Marswalk Unified Cost Map Engine.

Covers:
- Weight changes and profile configurations
- Normalization of soft cost components into [0.0, 1.0] and combined cost into [1.0, 10.0]
- Missing values (unknown terrain is strictly blocked, not zero-cost)
- Hard blocked cells enforcement (cost = np.inf)
- Grid mismatch detection (CRS, shape, resolution, bounding extent)
- Cost map reproducibility
- REST API endpoints for profiles, custom evaluation, raster PNGs, and point inspection
"""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.costmap.evaluator import (
    compute_unified_costmap,
    normalize_terrain_difficulty,
    normalize_uncertainty,
)
from app.costmap.exceptions import CostmapValidationError, GridMismatchError
from app.costmap.grid import RasterGridSpec, validate_grid_compatibility
from app.costmap.profiles import DEFAULT_PROFILES, CostmapWeights, MissionProfileType
from app.main import app

client = TestClient(app)


def test_weight_changes_and_normalization():
    """Test weight normalization to sum = 1.0 and validation of negative or zero weights."""
    w = CostmapWeights(w_terrain=2.0, w_hazard=2.0, w_uncertainty=1.0, w_science=5.0)
    w_norm = w.normalized()
    assert np.isclose(
        w_norm.w_terrain + w_norm.w_hazard + w_norm.w_uncertainty + w_norm.w_science, 1.0
    )
    assert np.isclose(w_norm.w_science, 0.50)

    # Negative weights must raise validation error
    with pytest.raises(CostmapValidationError):
        CostmapWeights(w_terrain=-0.1)

    # All-zero weights must raise validation error
    with pytest.raises(CostmapValidationError):
        CostmapWeights(w_terrain=0, w_hazard=0, w_uncertainty=0, w_science=0)


def test_soft_cost_normalization():
    """Test that soft cost terms are normalized into [0.0, 1.0] and cost is in [1.0, 10.0]."""
    slope = np.array([[0.0, 12.5, 25.0, 35.0]])
    tri = np.array([[0.0, 3.0, 6.0, 10.0]])
    valid = np.ones((1, 4), dtype=bool)

    c_terr = normalize_terrain_difficulty(slope, tri, valid, max_slope_deg=25.0, max_tri_m=6.0)
    assert 0.0 <= c_terr.min() <= c_terr.max() <= 1.0
    assert c_terr[0, 0] == 0.0  # Flat planar regolith
    assert c_terr[0, 2] == 1.0  # At max threshold
    assert c_terr[0, 3] == 1.0  # Clipped above max threshold

    sigma_z = np.array([[0.20, 1.10, 2.00, 3.00]])
    c_unc = normalize_uncertainty(sigma_z, valid, min_sigma_m=0.20, max_sigma_m=2.00)
    assert 0.0 <= c_unc.min() <= c_unc.max() <= 1.0
    assert c_unc[0, 0] == 0.0
    assert c_unc[0, 2] == 1.0


def test_missing_values_distinct_from_low_scores():
    """Test that missing data (unknown) is never treated as zero cost or safe."""
    shape = (2, 2)
    slope = np.zeros(shape, dtype=np.float32)
    tri = np.zeros(shape, dtype=np.float32)
    hazard = np.zeros(shape, dtype=np.float32)
    sigma_z = np.full(shape, 0.20, dtype=np.float32)
    science = np.full(shape, 1.00, dtype=np.float32)

    # Cell (1, 1) has missing / unknown data
    coverage = np.array([[True, True], [True, False]])
    hard_imp = np.zeros(shape, dtype=bool)

    bundle = compute_unified_costmap(
        slope, tri, hazard, sigma_z, science, coverage, hard_imp, CostmapWeights()
    )

    # Valid flat cells with high science have minimal cost = 1.0
    assert np.isclose(bundle.combined_cost[0, 0], 1.0)
    # Missing data cell must be unknown, blocked, and infinite cost
    assert bundle.unknown_mask[1, 1] is True or bundle.unknown_mask[1, 1] == 1
    assert bundle.hard_blocked_mask[1, 1] is True or bundle.hard_blocked_mask[1, 1] == 1
    assert np.isinf(bundle.combined_cost[1, 1])


def test_blocked_cells_enforcement():
    """Test that cells with hard traversability restrictions receive infinite cost."""
    shape = (1, 2)
    slope = np.array([[5.0, 30.0]], dtype=np.float32)
    tri = np.array([[0.5, 0.5]], dtype=np.float32)
    hazard = np.array([[0.1, 0.9]], dtype=np.float32)
    sigma_z = np.array([[0.3, 0.3]], dtype=np.float32)
    science = np.array([[0.5, 0.5]], dtype=np.float32)
    coverage = np.ones(shape, dtype=bool)
    # Cell 1 is flagged impassable
    hard_imp = np.array([[False, True]])

    bundle = compute_unified_costmap(
        slope, tri, hazard, sigma_z, science, coverage, hard_imp, CostmapWeights()
    )

    assert not bundle.hard_blocked_mask[0, 0]
    assert 1.0 <= bundle.combined_cost[0, 0] <= 10.0
    assert bundle.hard_blocked_mask[0, 1]
    assert np.isinf(bundle.combined_cost[0, 1])


def test_grid_mismatch_validation():
    """Test that grid mismatches (shape, CRS, resolution, bounds) raise GridMismatchError."""
    ref = RasterGridSpec(
        crs="ESRI:103885",
        shape=(100, 100),
        bounds=(0.0, 0.0, 2000.0, 2000.0),
        resolution=(20.0, 20.0),
    )

    # 1. Shape mismatch
    diff_shape = RasterGridSpec(
        crs="ESRI:103885",
        shape=(100, 105),
        bounds=(0.0, 0.0, 2000.0, 2000.0),
        resolution=(20.0, 20.0),
    )
    with pytest.raises(GridMismatchError, match="shape mismatch"):
        validate_grid_compatibility(ref, diff_shape, "diff_shape")

    # 2. CRS mismatch
    diff_crs = RasterGridSpec(
        crs="IAU_2015:49900",
        shape=(100, 100),
        bounds=(0.0, 0.0, 2000.0, 2000.0),
        resolution=(20.0, 20.0),
    )
    with pytest.raises(GridMismatchError, match="CRS mismatch"):
        validate_grid_compatibility(ref, diff_crs, "diff_crs")

    # 3. Resolution mismatch
    diff_res = RasterGridSpec(
        crs="ESRI:103885",
        shape=(100, 100),
        bounds=(0.0, 0.0, 2000.0, 2000.0),
        resolution=(25.0, 25.0),
    )
    with pytest.raises(GridMismatchError, match="resolution mismatch"):
        validate_grid_compatibility(ref, diff_res, "diff_res")

    # 4. Bounds mismatch
    diff_bounds = RasterGridSpec(
        crs="ESRI:103885",
        shape=(100, 100),
        bounds=(100.0, 0.0, 2100.0, 2000.0),
        resolution=(20.0, 20.0),
    )
    with pytest.raises(GridMismatchError, match="bounds mismatch"):
        validate_grid_compatibility(ref, diff_bounds, "diff_bounds")


def test_cost_map_reproducibility():
    """Test that cost map evaluation is deterministic and bitwise reproducible."""
    shape = (20, 20)
    rng = np.random.default_rng(42)
    slope = rng.uniform(0.0, 24.0, size=shape).astype(np.float32)
    tri = rng.uniform(0.0, 5.0, size=shape).astype(np.float32)
    hazard = rng.uniform(0.0, 1.0, size=shape).astype(np.float32)
    sigma_z = rng.uniform(0.2, 1.8, size=shape).astype(np.float32)
    science = rng.uniform(0.0, 1.0, size=shape).astype(np.float32)
    coverage = np.ones(shape, dtype=bool)
    hard_imp = slope > 20.0

    weights = DEFAULT_PROFILES[MissionProfileType.BALANCED.value].weights

    bundle_1 = compute_unified_costmap(
        slope, tri, hazard, sigma_z, science, coverage, hard_imp, weights
    )
    bundle_2 = compute_unified_costmap(
        slope, tri, hazard, sigma_z, science, coverage, hard_imp, weights
    )

    assert np.array_equal(bundle_1.combined_cost, bundle_2.combined_cost, equal_nan=True)
    assert np.array_equal(bundle_1.hard_blocked_mask, bundle_2.hard_blocked_mask)


def test_costmap_api_profiles_endpoint():
    """Test GET /api/v1/costmap/profiles returns standard pre-configured profiles."""
    response = client.get("/api/v1/costmap/profiles")
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data
    profiles = data["profiles"]
    assert "SAFETY_FIRST" in profiles
    assert "SCIENCE_FIRST" in profiles
    assert "BALANCED" in profiles
    assert profiles["SAFETY_FIRST"]["weights"]["w_hazard"] >= 0.40


def test_costmap_api_evaluate_custom_endpoint():
    """Test POST /api/v1/costmap/evaluate with interactive custom weights."""
    payload = {
        "w_terrain": 0.40,
        "w_hazard": 0.30,
        "w_uncertainty": 0.10,
        "w_science": 0.20,
    }
    response = client.post("/api/v1/costmap/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert "statistics" in data
    assert "mean_passable_cost" in data["statistics"]
    assert 1.0 <= data["statistics"]["mean_passable_cost"] <= 10.0


def test_costmap_api_raster_endpoint():
    """Test GET /api/v1/costmap/raster/{profile}.png serves valid PNG."""
    for prof in ["balanced", "safety-first", "science-first"]:
        response = client.get(f"/api/v1/costmap/raster/{prof}.png")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert len(response.content) > 1000


def test_costmap_api_inspect_endpoint():
    """Test GET /api/v1/costmap/inspect at Jezero Crater coordinates."""
    lat, lon = 18.45, 77.40
    response = client.get(f"/api/v1/costmap/inspect?lat={lat}&lon={lon}&profile=BALANCED")
    assert response.status_code == 200
    data = response.json()
    assert "is_blocked" in data
    assert "combined_cost" in data
    assert "individual_components" in data
    assert "explanation" in data

    # Out of bounds query
    oob = client.get("/api/v1/costmap/inspect?lat=0.0&lon=0.0")
    assert oob.status_code == 200
    assert oob.json()["status"] == "OUT_OF_BOUNDS"
    assert oob.json()["is_blocked"] is True
