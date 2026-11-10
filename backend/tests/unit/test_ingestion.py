"""Unit tests for planetary data acquisition, resume logic, and validator inspection."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from app.geospatial.downloader import DownloadManifestEntry, PlanetaryDownloader
from app.geospatial.validator import validate_geojson, validate_raster


@pytest.fixture
def temp_data_env(tmp_path: Path):
    """Create an isolated test directory mimicking the data/ structure."""
    raw_dir = tmp_path / "raw"
    manifest_dir = tmp_path / "manifests"
    raw_dir.mkdir()
    manifest_dir.mkdir()
    return tmp_path


def test_downloader_compute_sha256(temp_data_env: Path):
    test_file = temp_data_env / "sample.bin"
    test_file.write_bytes(b"Mars 2020 Jezero Crater authentic test payload")

    downloader = PlanetaryDownloader(data_root=temp_data_env)
    digest = downloader.compute_sha256(test_file)

    import hashlib

    expected = hashlib.sha256(b"Mars 2020 Jezero Crater authentic test payload").hexdigest()
    assert digest == expected


def test_downloader_manifest_logging(temp_data_env: Path):
    downloader = PlanetaryDownloader(data_root=temp_data_env)
    entry = DownloadManifestEntry(
        product_id="TEST-PRODUCT-01",
        target_rel_path="raw/test.tif",
        source_url="https://example.com/test.tif",
        sha256="abcdef1234567890",
        byte_size=1024,
        retrieved_utc="2026-11-10T12:00:00Z",
        status="SUCCESS",
    )
    downloader.record_manifest(entry)

    manifest_file = temp_data_env / "manifests" / "download_manifest.jsonl"
    assert manifest_file.exists()

    lines = manifest_file.read_text().splitlines()
    assert len(lines) == 1
    data = json.loads(lines[0])
    assert data["product_id"] == "TEST-PRODUCT-01"
    assert data["status"] == "SUCCESS"


def test_validate_raster_fixture(tmp_path: Path):
    """Validate a small analytic raster fixture (never fake NASA data)."""
    tif_path = tmp_path / "test_surface.tif"
    data = np.array([[100.0, 105.0], [102.0, 108.0]], dtype=np.float32)
    transform = from_origin(77.4, 18.4, 1.0, 1.0)

    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=2,
        width=2,
        count=1,
        dtype=data.dtype,
        crs="IAU_2015:49900",
        transform=transform,
        nodata=-9999.0,
    ) as dst:
        dst.write(data, 1)

    report = validate_raster(tif_path)
    assert report.is_valid
    assert report.width == 2
    assert report.height == 2
    assert report.count == 1
    assert report.nodata == -9999.0
    assert report.min_value == 100.0
    assert report.max_value == 108.0


def test_validate_geojson_fixture(tmp_path: Path):
    """Validate a small GeoJSON structure fixture."""
    geojson_path = tmp_path / "test_track.geojson"
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [77.45, 18.44]},
                "properties": {"sol": 10},
            },
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": [[77.45, 18.44], [77.46, 18.45]]},
                "properties": {"sol": 11},
            },
        ],
    }
    geojson_path.write_text(json.dumps(payload))

    report = validate_geojson(geojson_path)
    assert report.is_valid
    assert report.feature_count == 2
    assert "Point" in report.geometry_types
    assert "LineString" in report.geometry_types
    assert report.bounding_box == (77.45, 18.44, 77.46, 18.45)
