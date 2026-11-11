"""Unit tests for the Multi-Region Registry and API endpoints."""

from fastapi.testclient import TestClient

from app.catalog.region_registry import (
    find_region_by_coordinates,
    get_all_regions,
    get_region_by_id,
)
from app.main import app

client = TestClient(app)


def test_registry_contains_12_priority_regions() -> None:
    """Verify all 12 priority Martian regions are defined."""
    regions = get_all_regions()
    assert len(regions) == 12

    expected_ids = {
        "reg-jezero",
        "reg-gale",
        "reg-valles-marineris",
        "reg-olympus-mons",
        "reg-tharsis",
        "reg-hellas",
        "reg-utopia",
        "reg-elysium",
        "reg-arcadia",
        "reg-gusev",
        "reg-north-polar",
        "reg-south-polar",
    }
    actual_ids = {r.id for r in regions}
    assert actual_ids == expected_ids


def test_region_geodesy_and_bounds_validity() -> None:
    """Verify that every region complies with IAU 2015 Mars geodesy."""
    for r in get_all_regions():
        b = r.bounds
        assert -90.0 <= b.lat_min <= 90.0
        assert -90.0 <= b.lat_max <= 90.0
        assert b.lat_min < b.lat_max, f"Invalid lat bounds in {r.id}"
        assert -180.0 <= b.lon_min <= 180.0
        assert -180.0 <= b.lon_max <= 180.0

        center = r.center
        assert -90.0 <= center[0] <= 90.0
        assert -180.0 <= center[1] <= 180.0

        assert r.elevation_range.min_elevation_m < r.elevation_range.max_elevation_m
        assert "Areoid" in r.elevation_range.datum


def test_jezero_local_twin_flag() -> None:
    """Verify that only Jezero has a local digital twin active in Milestone 2."""
    jezero = get_region_by_id("reg-jezero")
    assert jezero is not None
    assert jezero.has_local_digital_twin is True
    assert jezero.local_twin_page_id == "digital-twin"

    gale = get_region_by_id("reg-gale")
    assert gale is not None
    assert gale.has_local_digital_twin is False


def test_coordinate_lookup_resolves_jezero() -> None:
    """Verify coordinate lookup finds Jezero for Western Delta coordinates."""
    match = find_region_by_coordinates(18.4485, 77.4320)
    assert match is not None
    assert match.id == "reg-jezero"

    # Out of bounds point (e.g. middle of an uncovered basin)
    outside = find_region_by_coordinates(0.0, 0.0)
    # 0,0 is near Sinus Meridiani, not one of the 12 bounding boxes
    assert outside is None


def test_api_list_regions() -> None:
    """Test GET /api/v1/regions endpoint."""
    res = client.get("/api/v1/regions")
    assert res.status_code == 200
    data = res.json()
    assert data["total_regions"] == 12
    assert len(data["regions"]) == 12

    # Verify summary fields
    first = data["regions"][0]
    assert "id" in first
    assert "name" in first
    assert "has_local_digital_twin" in first


def test_api_get_region_dossier() -> None:
    """Test GET /api/v1/regions/{region_id} endpoint."""
    res = client.get("/api/v1/regions/reg-gale")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "reg-gale"
    assert "Mount Sharp" in data["name"]
    assert len(data["missions"]) >= 1
    assert data["missions"][0]["spacecraft"] == "Curiosity Rover"


def test_api_get_region_dossier_404() -> None:
    """Test GET /api/v1/regions/{region_id} with invalid ID."""
    res = client.get("/api/v1/regions/reg-unknown-basin")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_api_lookup_coordinates() -> None:
    """Test GET /api/v1/regions/lookup/coordinates."""
    res = client.get("/api/v1/regions/lookup/coordinates?lat=18.45&lon=77.45")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "reg-jezero"
