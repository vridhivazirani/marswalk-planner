"""Unit and property tests for geospatial preprocessing, CRS, alignment, NoData, and metadata."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import rasterio

from app.geospatial.crs import (
    MARS_EQUIRECTANGULAR_CRS_URN,
    MARS_GEOGRAPHIC_CRS_URN,
    MARS_RADIUS_M,
    MarsCoordinateSystem,
    MarsPoint,
)
from app.geospatial.grid import get_western_delta_grid_1m, get_western_delta_grid_20m
from app.geospatial.pipeline import STANDARD_NODATA_FLOAT


@pytest.fixture
def mars_sys():
    return MarsCoordinateSystem()


def test_mars_geographic_and_projected_crs_initialization(mars_sys: MarsCoordinateSystem):
    assert mars_sys.geo_crs.to_string() == MARS_GEOGRAPHIC_CRS_URN
    assert mars_sys.validate_mars_crs(mars_sys.geo_crs)
    assert mars_sys.validate_mars_crs(mars_sys.eqc_crs)


def test_earth_crs_rejected(mars_sys: MarsCoordinateSystem):
    from pyproj import CRS

    earth_wgs84 = CRS.from_epsg(4326)
    assert not mars_sys.validate_mars_crs(earth_wgs84)


def test_mars_coordinate_roundtrip(mars_sys: MarsCoordinateSystem):
    # Octavia E. Butler Landing: ~77.4508 E, 18.4447 N
    orig_lon, orig_lat = 77.4508, 18.4447
    x, y = mars_sys.to_projected(orig_lon, orig_lat)

    res_lon, res_lat = mars_sys.to_geographic(x, y)
    assert res_lon == pytest.approx(orig_lon, abs=1e-5)
    assert res_lat == pytest.approx(orig_lat, abs=1e-5)


def test_haversine_distance_computation(mars_sys: MarsCoordinateSystem):
    p1 = MarsPoint(lon=0.0, lat=0.0)
    p2 = MarsPoint(lon=0.0, lat=1.0)  # 1 degree of latitude
    dist = mars_sys.haversine_distance_m(p1, p2)

    # 1 deg on sphere with R=3,396,190m is 2*pi*R / 360
    expected = (2.0 * np.pi * MARS_RADIUS_M) / 360.0
    assert dist == pytest.approx(expected, rel=1e-4)


def test_grid_spec_pixel_alignment():
    g1 = get_western_delta_grid_1m()
    g20 = get_western_delta_grid_20m()

    assert g1.resolution_m == 1.0
    assert g20.resolution_m == 20.0
    assert g1.crs == MARS_EQUIRECTANGULAR_CRS_URN
    assert g20.crs == MARS_EQUIRECTANGULAR_CRS_URN

    # Left and top boundaries must snap exactly
    assert g1.left == g20.left
    assert g1.top == g20.top


def test_processed_rasters_alignment_and_nodata():
    """Verify that generated ARD products have matching extent, CRS and NoData."""
    data_dir = Path(__file__).resolve().parents[3] / "data" / "processed"
    elev_path = data_dir / "jezero_western_delta_20m_elevation.tif"
    src_path = data_dir / "jezero_western_delta_20m_source_id.tif"
    unc_path = data_dir / "jezero_western_delta_20m_uncertainty_sigma_z.tif"

    if not elev_path.exists():
        pytest.skip("Processed rasters not yet generated on disk")

    with rasterio.open(elev_path) as e, rasterio.open(src_path) as s, rasterio.open(unc_path) as u:
        # 1. Extent & transform consistency
        assert e.bounds == s.bounds == u.bounds
        assert e.transform == s.transform == u.transform
        assert e.shape == s.shape == u.shape
        assert e.res == (20.0, 20.0)

        # 2. CRS consistency
        assert e.crs == s.crs == u.crs

        # 3. NoData integrity
        assert e.nodata == STANDARD_NODATA_FLOAT
        assert s.nodata == 0

        # Read array data
        elev = e.read(1)
        src = s.read(1)
        unc = u.read(1)

        # Check values are realistic for Jezero crater (-2.7km to -2.0km)
        valid_elev = elev[elev != STANDARD_NODATA_FLOAT]
        assert len(valid_elev) > 0
        assert -2700.0 <= valid_elev.min() <= -2400.0
        assert -2400.0 <= valid_elev.max() <= -2000.0

        # Check that high-res HiRISE cells have ~0.2m uncertainty, CTX ~2.0m
        assert np.all(unc[src == 2] == pytest.approx(0.2, abs=1e-3))
        assert np.all(unc[src == 1] == pytest.approx(2.0, abs=1e-3))


def test_provenance_metadata_recorded():
    data_dir = Path(__file__).resolve().parents[3] / "data" / "catalog"
    prov_file = data_dir / "jezero_western_delta_20m_provenance.json"

    if not prov_file.exists():
        pytest.skip("Provenance file not yet generated")

    data = json.loads(prov_file.read_text())
    assert data["target_grid"] == "jezero_western_delta_20m"
    assert data["target_resolution_m"] == 20.0
    assert "10.5066/P9REJ9JN" in data["source_products"]
    assert "10.5066/P906QQT8" in data["source_products"]
    assert data["nodata_value"] == STANDARD_NODATA_FLOAT
    assert data["valid_pixel_count"] > 0
