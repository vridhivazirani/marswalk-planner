"""Geospatial software-environment diagnostics.

This module does not process any planetary data. It only checks that the
installed GDAL/PROJ stack can represent Mars coordinate reference systems, which
is a prerequisite for every later geospatial module (risk R3/R21 in
docs/architecture.md).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

# IAU 2015 Mars sphere, planetocentric latitude, east-positive longitude.
# Provided by the PROJ database (PROJ >= 8.2) under the "IAU_2015" authority.
MARS_GEOGRAPHIC_CRS = "IAU_2015:49900"


@dataclass(frozen=True)
class GeospatialEnvironment:
    """Versions of the geospatial stack and the result of the Mars CRS check."""

    pyproj_version: str
    proj_version: str
    rasterio_version: str
    gdal_version: str
    mars_crs_code: str
    mars_crs_available: bool
    mars_crs_name: str | None
    mars_semi_major_axis_m: float | None
    mars_semi_minor_axis_m: float | None
    error: str | None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def check_geospatial_environment() -> GeospatialEnvironment:
    """Inspect pyproj/rasterio versions and try to resolve the IAU Mars CRS."""
    import pyproj
    import rasterio
    from pyproj import CRS
    from pyproj.exceptions import CRSError

    name: str | None = None
    a: float | None = None
    b: float | None = None
    error: str | None = None
    try:
        crs = CRS.from_user_input(MARS_GEOGRAPHIC_CRS)
        name = crs.name
        a = crs.ellipsoid.semi_major_metre if crs.ellipsoid else None
        b = crs.ellipsoid.semi_minor_metre if crs.ellipsoid else None
    except CRSError as exc:  # PROJ too old or database missing the IAU authority
        error = str(exc)

    return GeospatialEnvironment(
        pyproj_version=pyproj.__version__,
        proj_version=pyproj.proj_version_str,
        rasterio_version=rasterio.__version__,
        gdal_version=rasterio.__gdal_version__,
        mars_crs_code=MARS_GEOGRAPHIC_CRS,
        mars_crs_available=error is None,
        mars_crs_name=name,
        mars_semi_major_axis_m=a,
        mars_semi_minor_axis_m=b,
        error=error,
    )
