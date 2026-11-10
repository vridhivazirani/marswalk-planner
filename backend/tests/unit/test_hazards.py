"""Unit tests for the Marswalk Hazard Intelligence Engine.

Covers:
- Missing / NoData terrain restriction (epistemic rule: unknown is never safe)
- Extreme slope restriction (SLOPE_GT_MAX)
- Extreme roughness restriction (TRI_GT_MAX)
- Combined restriction codes
- Configurable hazard weights and soft scoring normalization
- API endpoints for hazard profile, overall raster heatmap, and coordinate inspection
"""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from app.hazards.config import HazardProfile
from app.hazards.evaluator import compute_hazard_bundle
from app.main import app

client = TestClient(app)


def test_missing_data_restricted_cell():
    """Test that missing / NoData pixels are strictly impassable by default (NO_DATA_UNKNOWN)."""
    slope = np.array([[5.0]])
    tri = np.array([[0.2]])
    boulder = np.array([[0.0]])
    sand = np.array([[0.0]])
    crater = np.array([[0.0]])
    valid_mask = np.array([[False]])  # NoData / unmapped
    source_id = np.array([[0]])

    bundle = compute_hazard_bundle(slope, tri, boulder, sand, crater, valid_mask, source_id)

    assert bundle.hard_impassable_mask[0, 0] is True or bundle.hard_impassable_mask[0, 0] == 1
    assert bundle.restriction_codes[0, 0] == "NO_DATA_UNKNOWN"
    assert bundle.h_unknown[0, 0] == 1.0
    assert bundle.overall_hazard[0, 0] == 1.0
    assert bundle.confidence[0, 0] == 0.0


def test_extreme_slope_restriction():
    """Test that slope >= 25.0° triggers hard restriction SLOPE_GT_MAX."""
    slope = np.array([[32.0]])  # Exceeds max_slope_deg (25.0°)
    tri = np.array([[0.5]])
    boulder = np.array([[0.1]])
    sand = np.array([[0.1]])
    crater = np.array([[0.0]])
    valid_mask = np.array([[True]])
    source_id = np.array([[2]])  # HiRISE

    bundle = compute_hazard_bundle(slope, tri, boulder, sand, crater, valid_mask, source_id)

    assert bundle.hard_impassable_mask[0, 0] is True or bundle.hard_impassable_mask[0, 0] == 1
    assert bundle.restriction_codes[0, 0] == "SLOPE_GT_MAX"
    assert bundle.h_slope[0, 0] == 1.0
    assert bundle.overall_hazard[0, 0] == 1.0


def test_extreme_roughness_restriction():
    """Test that TRI >= 8.0m triggers hard restriction TRI_GT_MAX."""
    slope = np.array([[6.0]])  # Gentle slope
    tri = np.array([[9.5]])  # Exceeds max_tri_m (8.0m)
    boulder = np.array([[0.2]])
    sand = np.array([[0.1]])
    crater = np.array([[0.0]])
    valid_mask = np.array([[True]])
    source_id = np.array([[2]])

    bundle = compute_hazard_bundle(slope, tri, boulder, sand, crater, valid_mask, source_id)

    assert bundle.hard_impassable_mask[0, 0] is True or bundle.hard_impassable_mask[0, 0] == 1
    assert "TRI_GT_MAX" in bundle.restriction_codes[0, 0]
    assert bundle.h_roughness[0, 0] == 1.0
    assert bundle.overall_hazard[0, 0] == 1.0


def test_combined_restrictions():
    """Test combining multiple hard constraints produces combined reason codes."""
    slope = np.array([[28.0]])  # Steep
    tri = np.array([[10.0]])  # Very rough
    boulder = np.array([[0.5]])
    sand = np.array([[0.5]])
    crater = np.array([[0.0]])
    valid_mask = np.array([[True]])
    source_id = np.array([[2]])

    bundle = compute_hazard_bundle(slope, tri, boulder, sand, crater, valid_mask, source_id)

    assert bundle.hard_impassable_mask[0, 0] is True or bundle.hard_impassable_mask[0, 0] == 1
    code = bundle.restriction_codes[0, 0]
    assert "SLOPE_GT_MAX" in code
    assert "TRI_GT_MAX" in code


def test_passable_cell_soft_hazards():
    """Test that safe terrain below critical thresholds is passable with low hazard score."""
    slope = np.array([[4.0]])  # Safe (<8°)
    tri = np.array([[0.3]])  # Safe (<0.5m)
    boulder = np.array([[0.05]])
    sand = np.array([[0.1]])
    crater = np.array([[0.0]])
    valid_mask = np.array([[True]])
    source_id = np.array([[2]])  # HiRISE

    bundle = compute_hazard_bundle(slope, tri, boulder, sand, crater, valid_mask, source_id)

    assert bundle.hard_impassable_mask[0, 0] is False or bundle.hard_impassable_mask[0, 0] == 0
    assert bundle.restriction_codes[0, 0] == ""
    assert bundle.h_slope[0, 0] == 0.0
    assert bundle.h_roughness[0, 0] == 0.0
    assert bundle.overall_hazard[0, 0] < 0.25
    assert bundle.confidence[0, 0] == 0.95


def test_hazard_profile_weight_customization():
    """Test that custom hazard profile weights are applied and scores stay bounded in [0, 1]."""
    slope = np.array([[16.5]])  # Mid-slope ((16.5-8)/17 = 0.5)
    tri = np.array([[3.25]])  # Mid-roughness ((3.25-0.5)/5.5 = 0.5)
    boulder = np.array([[0.5]])
    sand = np.array([[0.5]])
    crater = np.array([[0.5]])
    valid_mask = np.array([[True]])
    source_id = np.array([[2]])

    custom_profile = HazardProfile(
        w_slope=0.8,
        w_roughness=0.1,
        w_boulder=0.05,
        w_sand=0.05,
        w_crater=0.0,
        w_uncertainty=0.0,
    )

    bundle = compute_hazard_bundle(
        slope, tri, boulder, sand, crater, valid_mask, source_id, profile=custom_profile
    )

    assert not bundle.hard_impassable_mask[0, 0]
    assert 0.45 <= bundle.overall_hazard[0, 0] <= 0.55


def test_hazard_api_profile_endpoint():
    """Test GET /api/v1/hazards/profile returns configurable parameters."""
    response = client.get("/api/v1/hazards/profile")
    assert response.status_code == 200
    data = response.json()
    assert "max_slope_deg" in data
    assert data["max_slope_deg"] == 25.0
    assert data["forbid_unknown"] is True
    assert "w_slope" in data


def test_hazard_api_raster_overall_endpoint():
    """Test GET /api/v1/hazards/raster/overall.png serves valid PNG."""
    response = client.get("/api/v1/hazards/raster/overall.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert len(response.content) > 1000


def test_hazard_api_inspect_endpoint():
    """Test GET /api/v1/hazards/inspect with coordinates in Jezero Crater."""
    # Near Jezero delta center
    lat, lon = 18.45, 77.40
    response = client.get(f"/api/v1/hazards/inspect?lat={lat}&lon={lon}")
    assert response.status_code == 200
    data = response.json()
    assert "is_passable" in data
    assert "overall_hazard_score" in data
    assert 0.0 <= data["overall_hazard_score"] <= 1.0
    assert "individual_hazards" in data
    assert "confidence" in data
    assert "explanation" in data
    assert len(data["explanation"]) > 10


def test_hazard_api_inspect_out_of_bounds():
    """Test GET /api/v1/hazards/inspect returns OUT_OF_BOUNDS for coordinates outside study area."""
    response = client.get("/api/v1/hazards/inspect?lat=0.0&lon=0.0")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "OUT_OF_BOUNDS"
    assert data["is_passable"] is False
