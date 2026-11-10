"""Unit tests for the Marswalk Scientific Opportunity Engine.

Verifies:
- CRISM mineralogical layer calculations and value bounds [0.0, 1.0]
- Stratigraphic layered feature and delta context evaluation
- Rover proximity decay calculation
- Candidate target extraction, ordering, and metadata
- Strict epistemic rules: non-inference of life and rover safety caveats
- REST API endpoints for profile, raster PNG, GeoJSON targets, and coordinate inspection
"""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.science.config import ScienceProfile
from app.science.evaluator import (
    compute_confidence_layer,
    compute_delta_context_layer,
    compute_geological_diversity_layer,
    compute_layered_stratigraphy_layer,
    compute_mineralogical_layer,
    compute_rover_proximity_layer,
    compute_science_opportunity_bundle,
    extract_candidate_targets,
)

client = TestClient(app)


def test_confidence_and_delta_context_layers():
    """Test confidence scoring by source and delta geomorphic envelope."""
    source_id = np.array([[2, 1], [0, 2]], dtype=np.int32)
    valid_mask = np.array([[True, True], [False, True]])

    conf = compute_confidence_layer(source_id, valid_mask)
    assert conf[0, 0] == 1.0  # HiRISE
    assert conf[0, 1] == 0.75  # CTX
    assert conf[1, 0] == 0.0  # Invalid

    lats = np.array([[18.50, 18.44]], dtype=np.float32)
    lons = np.array([[77.36, 77.42]], dtype=np.float32)
    elev = np.array([[-2480.0, -2500.0]], dtype=np.float32)
    s_del = compute_delta_context_layer(lats, lons, elev, np.ones((1, 2), dtype=bool))
    assert 0.0 <= s_del.min() <= s_del.max() <= 1.0


def test_mineralogical_layer_bounded_and_valid():
    """Test that mineralogical scoring stays bounded in [0.0, 1.0] and zeros NoData cells."""
    profile = ScienceProfile()
    lats = np.array([[18.455, 18.420], [18.400, 18.500]], dtype=np.float32)
    lons = np.array([[77.405, 77.365], [77.450, 77.350]], dtype=np.float32)
    elev = np.array([[-2515.0, -2515.0], [-2580.0, -2400.0]], dtype=np.float32)
    valid_mask = np.array([[True, True], [True, False]])

    s_min = compute_mineralogical_layer(lats, lons, elev, valid_mask, profile)

    assert 0.0 <= s_min.min() <= s_min.max() <= 1.0
    # NoData cell must be 0.0
    assert s_min[1, 1] == 0.0
    # Peak near delta front clays
    assert s_min[0, 0] > 0.3


def test_stratigraphic_and_diversity_layers():
    """Test layered feature evaluation identifies steep scarps at target elevations."""
    slope = np.array([[14.0, 2.0]], dtype=np.float32)
    elev = np.array([[-2470.0, -2470.0]], dtype=np.float32)
    valid_mask = np.array([[True, True]])

    s_lay = compute_layered_stratigraphy_layer(slope, elev, valid_mask)

    # 14° scarp at -2470m should score significantly higher than flat 2° regolith
    assert s_lay[0, 0] > s_lay[0, 1]

    elev_grid = np.array([[-2500.0, -2460.0], [-2500.0, -2460.0]], dtype=np.float32)
    slope_grid = np.array([[15.0, 15.0], [15.0, 15.0]], dtype=np.float32)
    s_div = compute_geological_diversity_layer(elev_grid, slope_grid, np.ones((2, 2), dtype=bool))
    assert 0.0 <= s_div.min() <= s_div.max() <= 1.0


def test_rover_proximity_decay():
    """Test Euclidean distance decay from authentic rover waypoints."""
    x_coords = np.array([[100.0, 600.0]], dtype=np.float32)
    y_coords = np.array([[100.0, 100.0]], dtype=np.float32)
    waypoints = [(100.0, 100.0)]  # Waypoint exactly at (100, 100)
    valid_mask = np.array([[True, True]])

    s_prx = compute_rover_proximity_layer(x_coords, y_coords, waypoints, 500.0, valid_mask)

    # Exact waypoint cell should have proximity ~ 1.0
    assert np.isclose(s_prx[0, 0], 1.0, atol=1e-3)
    # Cell 500m away should be ~ exp(-1) ≈ 0.368
    assert np.isclose(s_prx[0, 1], np.exp(-1.0), atol=0.05)


def test_life_inference_and_rover_safety_disclaimers():
    """Test strict enforcement of non-inference of life and rover safety notices."""
    profile = ScienceProfile()
    assert "indicate abiotic aqueous alteration" in profile.disclaimer_life_inference
    assert "do NOT infer or confirm" in profile.disclaimer_life_inference
    assert "do NOT prove terrain is safe for human" in profile.disclaimer_rover_safety


def test_candidate_targets_extraction():
    """Test full bundle computation and extraction of candidate targets."""
    shape = (40, 40)
    elevation = np.full(shape, -2500.0, dtype=np.float32)
    slope = np.full(shape, 12.0, dtype=np.float32)
    source_id = np.full(shape, 2, dtype=np.int32)
    valid_mask = np.ones(shape, dtype=bool)
    lats = np.full(shape, 18.45, dtype=np.float32)
    lons = np.full(shape, 77.40, dtype=np.float32)
    xs = np.zeros(shape, dtype=np.float32)
    ys = np.zeros(shape, dtype=np.float32)

    profile = ScienceProfile(max_candidate_targets=5)
    bundle = compute_science_opportunity_bundle(
        elevation=elevation,
        slope=slope,
        source_id=source_id,
        valid_mask=valid_mask,
        lat_grid=lats,
        lon_grid=lons,
        x_coords=xs,
        y_coords=ys,
        rover_waypoints_xy=[(0.0, 0.0)],
        profile=profile,
    )

    assert bundle.composite_opportunity.shape == shape
    assert 0.0 <= bundle.composite_opportunity.min() <= bundle.composite_opportunity.max() <= 1.0

    # Inject two test peaks to verify peak extraction logic
    bundle.composite_opportunity[10, 10] = 0.85
    bundle.composite_opportunity[30, 30] = 0.70

    targets = extract_candidate_targets(bundle, lats, lons, elevation, xs, ys, pixel_size_m=20.0)

    assert len(targets) >= 2
    # Verify descending score rank
    assert targets[0].composite_opportunity_score >= targets[1].composite_opportunity_score
    assert targets[0].rank == 1
    assert targets[1].rank == 2
    assert "abiotic" in targets[0].life_inference_warning


def test_science_api_profile_endpoint():
    """Test GET /api/v1/science/profile endpoint."""
    response = client.get("/api/v1/science/profile")
    assert response.status_code == 200
    data = response.json()
    assert "w_mineralogy" in data
    assert "w_diversity" in data
    assert "disclaimer_life_inference" in data


def test_science_api_targets_endpoint():
    """Test GET /api/v1/science/targets endpoint returns GeoJSON FeatureCollection."""
    response = client.get("/api/v1/science/targets")
    assert response.status_code == 200
    geojson = response.json()
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 0

    first = geojson["features"][0]
    assert "geometry" in first
    assert first["geometry"]["type"] == "Point"
    props = first["properties"]
    assert "target_id" in props
    assert "composite_score" in props
    assert "life_inference_warning" in props


def test_science_api_raster_endpoint():
    """Test GET /api/v1/science/raster/opportunity.png serves valid PNG."""
    response = client.get("/api/v1/science/raster/opportunity.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert len(response.content) > 1000


def test_science_api_inspect_endpoint():
    """Test GET /api/v1/science/inspect at Jezero Crater coordinates."""
    lat, lon = 18.45, 77.40
    response = client.get(f"/api/v1/science/inspect?lat={lat}&lon={lon}")
    assert response.status_code == 200
    data = response.json()
    assert "composite_opportunity_score" in data
    assert 0.0 <= data["composite_opportunity_score"] <= 1.0
    assert "explanation" in data
    assert "disclaimers" in data

    # Out of bounds query
    oob = client.get("/api/v1/science/inspect?lat=0.0&lon=0.0")
    assert oob.status_code == 200
    assert oob.json()["status"] == "OUT_OF_BOUNDS"
