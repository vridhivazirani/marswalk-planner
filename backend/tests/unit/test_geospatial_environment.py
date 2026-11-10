"""Checks that the geospatial stack can represent Mars (Phase 0 definition of done)."""

import pytest

from app.geospatial.environment import MARS_GEOGRAPHIC_CRS, check_geospatial_environment

# IAU Mars sphere radius used by NASA/USGS Mars map products (metres).
MARS_SPHERE_RADIUS_M = 3_396_190.0


@pytest.fixture(scope="module")
def env():
    return check_geospatial_environment()


def test_iau_mars_crs_resolves(env) -> None:
    assert env.mars_crs_available, f"{MARS_GEOGRAPHIC_CRS} not resolvable: {env.error}"


def test_iau_mars_crs_is_mars_sphere(env) -> None:
    assert env.mars_crs_name is not None and "mars" in env.mars_crs_name.lower()
    assert env.mars_semi_major_axis_m == pytest.approx(MARS_SPHERE_RADIUS_M)
    assert env.mars_semi_minor_axis_m == pytest.approx(MARS_SPHERE_RADIUS_M)


def test_iau_mars_crs_is_not_earth(env) -> None:
    earth_wgs84_a = 6_378_137.0
    assert env.mars_semi_major_axis_m != pytest.approx(earth_wgs84_a)


def test_gdal_available_through_rasterio(env) -> None:
    major = int(env.gdal_version.split(".")[0])
    assert major >= 3
