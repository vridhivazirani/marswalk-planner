"""Unit tests for Marswalk Digital Twin endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_twin_layers_endpoint():
    response = client.get("/api/v1/twin/layers")
    assert response.status_code == 200
    data = response.json()

    # Check study area metadata
    study_area = data["study_area"]
    assert study_area["crs_geographic"] == "IAU_2015:49900"
    assert study_area["crs_projected"] == "ESRI:103885"
    assert study_area["resolution_m"] == 20.0
    assert len(study_area["bounds"]) == 2

    # Check layer catalog
    layer_ids = [layer["id"] for layer in data["layers"]]
    assert "ortho_imagery" in layer_ids
    assert "elevation_colormap" in layer_ids
    assert "source_coverage" in layer_ids
    assert "perseverance_traverse" in layer_ids

    # Scientific integrity: verify no heuristic rule is falsely labeled as "ML"
    for layer in data["layers"]:
        assert "ML" not in layer["name"], f"Layer {layer['id']} incorrectly contains 'ML'"
        assert "machine learning" not in layer["name"].lower()

    # Specific layer checks
    classes_layer = next(lyr for lyr in data["layers"] if lyr["id"] == "terrain_classes")
    assert classes_layer["epistemic_class"] == "HEURISTIC"
    assert "Rule-Based" in classes_layer["name"]

    rover_layer = next(lyr for lyr in data["layers"] if lyr["id"] == "perseverance_traverse")
    assert rover_layer["epistemic_class"] == "OBSERVED"
    assert "Historical" in rover_layer["name"]


def test_twin_raster_layer_serving():
    for name in ["ortho", "elevation", "coverage"]:
        response = client.get(f"/api/v1/twin/raster/{name}.png")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert len(response.content) > 1000


def test_twin_perseverance_vector_serving():
    response = client.get("/api/v1/twin/vector/perseverance")
    assert response.status_code == 200
    geojson = response.json()
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 500


def test_twin_elevation_grid_endpoint():
    response = client.get("/api/v1/twin/elevation/grid?step=8")
    assert response.status_code == 200
    grid = response.json()
    assert grid["step"] == 8
    assert grid["grid_resolution_m"] == 160.0
    assert grid["rows"] > 0
    assert grid["cols"] > 0
    assert -2700.0 <= grid["elev_min_m"] <= -2500.0
    assert -2400.0 <= grid["elev_max_m"] <= -2100.0
    assert len(grid["elevations"]) == grid["rows"]
    assert len(grid["elevations"][0]) == grid["cols"]
