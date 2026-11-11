"""Unit tests for Milestone 2.2 Regional Mars Atlas (Jezero Crater) APIs."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_regional_study_area():
    """Verify regional study area metadata returns Jezero metrics."""
    resp = client.get("/api/v1/atlas/regional/jezero/study-area")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "reg-jezero-crater"
    assert "Western Basin & Delta" in data["name"]
    assert data["planet"] == "Mars"
    assert data["center"][0] == 18.4485
    assert data["center"][1] == 77.4320
    assert data["dimensions_km"]["diameter_km"] == 49.0
    assert data["coverage_percentage_of_basin"] == 51.2
    assert "elevation_range_m" in data
    assert "primary_scientific_facies" in data
    assert len(data["primary_scientific_facies"]) >= 4


def test_get_regional_categories():
    """Verify 8 regional categories with active layer counts."""
    resp = client.get("/api/v1/atlas/regional/jezero/categories")
    assert resp.status_code == 200
    data = resp.json()
    cats = data["categories"]
    assert len(cats) >= 8
    cat_ids = [c["id"] for c in cats]
    assert "base-imagery" in cat_ids
    assert "elevation-topography" in cat_ids
    assert "geological-mapping" in cat_ids
    assert "mineralogical-data" in cat_ids
    assert "rover-exploration" in cat_ids
    assert "terrain-intelligence" in cat_ids
    assert "hazards" in cat_ids
    assert "coverage-uncertainty" in cat_ids


def test_get_regional_layers():
    """Verify listing regional layers with optional category filter."""
    resp = client.get("/api/v1/atlas/regional/jezero/layers")
    assert resp.status_code == 200
    data = resp.json()
    layers = data["layers"]
    assert len(layers) >= 12

    # Filter by geological-mapping
    resp_geo = client.get("/api/v1/atlas/regional/jezero/layers?category=geological-mapping")
    assert resp_geo.status_code == 200
    geo_layers = resp_geo.json()["layers"]
    assert len(geo_layers) >= 1
    assert all(layer["category"] == "geological-mapping" for layer in geo_layers)


def test_get_regional_geology_units():
    """Verify USGS SIM-3464 geologic units retrieval and alias support."""
    resp = client.get("/api/v1/atlas/regional/jezero/geology")
    assert resp.status_code == 200
    data = resp.json()
    units = data["units"]
    assert len(units) >= 6
    symbols = [u["symbol"] for u in units]
    assert "NHjf1" in symbols
    assert "Cf-fr" in symbols
    assert "Cf-f-1" in symbols

    # Check official symbols and planning caveat
    for u in units:
        assert "official_sim3464_symbol" in u
        assert "traversability_risk_heuristic" in u
        assert "planning_evaluation_caveat" in u
        assert "HEURISTIC" in u["planning_evaluation_caveat"]

    # Query by canonical USGS symbol
    resp_canonical = client.get("/api/v1/atlas/regional/jezero/geology/NHjf1")
    assert resp_canonical.status_code == 200
    nhjf1 = resp_canonical.json()
    assert "Delta" in nhjf1["name"]
    assert nhjf1["epistemic_class"] == "INTERPRETED"
    assert len(nhjf1["boundary_polygon"]) >= 4

    # Query by legacy alias code (Nld)
    resp_alias = client.get("/api/v1/atlas/regional/jezero/geology/Nld")
    assert resp_alias.status_code == 200
    nld = resp_alias.json()
    assert nld["official_sim3464_symbol"] == "NHjf1"

    # Non-existent unit
    resp_404 = client.get("/api/v1/atlas/regional/jezero/geology/NON_EXISTENT")
    assert resp_404.status_code == 404


def test_get_crism_observations():
    """Verify authentic CRISM targeted observations with projected resolution and 545 bands."""
    resp = client.get("/api/v1/atlas/regional/jezero/crism")
    assert resp.status_code == 200
    data = resp.json()
    crism = data["observations"]
    assert len(crism) >= 4
    obs_ids = [c["product_id"] for c in crism]
    assert "FRT00005850" in obs_ids
    assert "HRL000040FF" in obs_ids

    frt5850 = next(c for c in crism if c["product_id"] == "FRT00005850")
    assert frt5850["nominal_spatial_resolution_m"] == 18.0
    assert frt5850["projected_spatial_resolution_m"] == 24.2
    assert frt5850["spectral_bands"] == 545
    assert frt5850["is_raster"] is False
    assert frt5850["is_footprint"] is True

    for c in crism:
        assert c["epistemic_class"] in ["OBSERVED", "INTERPRETED"]
        assert len(c["spectral_detections"]) > 0


def test_rover_traverse_and_waypoints():
    """Verify Perseverance rover traverse, localization (not GPS), and Three Forks depot tubes."""
    resp_trav = client.get("/api/v1/atlas/regional/jezero/rover/traverse")
    assert resp_trav.status_code == 200
    trav_data = resp_trav.json()
    assert trav_data["type"] == "FeatureCollection"
    assert len(trav_data["features"]) > 0
    assert "certify terrain safety for human eva" in trav_data["telemetry_disclaimer"].lower()
    assert "visual odometry" in trav_data["localization_method"].lower()
    assert "gps" in trav_data["localization_method"].lower()  # Discloses NOT GPS

    # Sol filter
    resp_trav_filtered = client.get(
        "/api/v1/atlas/regional/jezero/rover/traverse?sol_min=0&sol_max=100"
    )
    assert resp_trav_filtered.status_code == 200
    filtered_data = resp_trav_filtered.json()
    assert len(filtered_data["features"]) <= len(trav_data["features"])

    # Waypoints
    resp_wp = client.get("/api/v1/atlas/regional/jezero/rover/waypoints?sol_max=50")
    assert resp_wp.status_code == 200
    wp_data = resp_wp.json()
    assert wp_data["type"] == "FeatureCollection"
    assert len(wp_data["features"]) > 0
    assert "visual odometry" in wp_data["localization_method"].lower()

    # Samples - Three Forks Depot 10 tubes and Onboard Cache
    resp_samples = client.get("/api/v1/atlas/regional/jezero/rover/samples")
    assert resp_samples.status_code == 200
    samples_data = resp_samples.json()
    samples = samples_data["samples"]
    assert len(samples) >= 16

    depot_samples = [s for s in samples if s["depot_location"] == "Three Forks Depot"]
    assert len(depot_samples) == 10
    depot_names = [s["sample_name"] for s in depot_samples]
    assert "Malay" in depot_names
    assert "Mageik" in depot_names
    assert "Crosswind Lake" in depot_names
    assert "Roubion" in depot_names
    assert "Coulettes" in depot_names
    assert "Montdenier" in depot_names
    assert "Bearwallow" in depot_names
    assert "Skyland" in depot_names
    assert "Atsah" in depot_names
    assert "Amalik" in depot_names

    onboard_samples = [s for s in samples if s["depot_location"] == "Onboard Cache"]
    assert len(onboard_samples) >= 6
    onboard_names = [s["sample_name"] for s in onboard_samples]
    assert "Salette" in onboard_names
    assert "Bellegarde" in onboard_names
    assert "Robine" in onboard_names
    assert "Swift Run" in onboard_names
    assert "Hazeltop" in onboard_names
    assert "Otis Peak" in onboard_names


def test_elevation_sampling_and_profile():
    """Verify elevation point sampling and cross-sectional transect."""
    # Point sampling
    resp_pt = client.get("/api/v1/atlas/regional/jezero/elevation-sample?lat=18.44&lon=77.43")
    assert resp_pt.status_code == 200
    pt = resp_pt.json()
    assert pt["elevation_m"] is not None
    assert "HiRISE" in pt["source_product"] or "CTX" in pt["source_product"]

    # Transect profile
    payload = {
        "start_lat": 18.42,
        "start_lon": 77.40,
        "end_lat": 18.46,
        "end_lon": 77.45,
        "num_points": 30,
    }
    resp_prof = client.post("/api/v1/atlas/regional/jezero/elevation-profile", json=payload)
    assert resp_prof.status_code == 200
    prof = resp_prof.json()
    assert prof["transect"]["num_points"] == 30
    assert prof["transect"]["total_distance_m"] > 0
    assert len(prof["points"]) == 30
    assert "elev_min_m" in prof["summary"]
    assert "elev_max_m" in prof["summary"]


def test_layer_comparison():
    """Verify layer comparison endpoint and spatial overlap calculation."""
    resp = client.get(
        "/api/v1/atlas/regional/jezero/compare?layer_a=reg_ctx_mosaic&layer_b=reg_hirise_1m_dtm"
    )
    assert resp.status_code == 200
    comp = resp.json()
    assert comp["has_spatial_overlap"] is True
    assert comp["overlap_area_km2"] > 0
    assert comp["resolution_ratio_a_to_b"] == 6.0
