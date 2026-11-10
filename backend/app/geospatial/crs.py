"""Mars Coordinate Reference Systems (CRS) registry and geodesic transformations.

Rules enforced:
1. Canonical convention: planetocentric latitude, east-positive longitude in [-180, 180).
2. Spheroid: IAU Mars 2015 Sphere (R = 3,396,190.0 m).
3. Primary Projected Analysis System: Equirectangular on Mars Sphere.
4. Earth Web Mercator (EPSG:3857) or Earth ellipsoids are strictly prohibited.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from pyproj import CRS, Transformer

# Canonical Mars sphere radius (metres) recommended by IAU 2015 and used across NASA/USGS products
MARS_RADIUS_M = 3_396_190.0

# Geographic IAU 2015 Mars Sphere (Planetocentric, East-positive)
MARS_GEOGRAPHIC_CRS_URN = "IAU_2015:49900"

# Projected Equirectangular Mars Sphere (ESRI:103885) as delivered by USGS TRN mosaics
# Central Meridian = 0, Standard Parallel = 0
MARS_EQUIRECTANGULAR_CRS_URN = "ESRI:103885"


@dataclass(frozen=True)
class MarsPoint:
    """A geographic coordinate on the Mars sphere."""

    lon: float  # Planetocentric east-positive degrees [-180, 180)
    lat: float  # Planetocentric latitude degrees [-90, 90]

    def __post_init__(self) -> None:
        if not (-90.0 <= self.lat <= 90.0):
            raise ValueError(f"Latitude {self.lat} out of bounds [-90, 90]")
        # Normalize longitude to [-180, 180)
        norm_lon = ((self.lon + 180.0) % 360.0) - 180.0
        object.__setattr__(self, "lon", norm_lon)


class MarsCoordinateSystem:
    """Handles coordinate reference systems and projections for Mars analysis."""

    def __init__(self) -> None:
        self.geo_crs = CRS.from_user_input(MARS_GEOGRAPHIC_CRS_URN)
        self.eqc_crs = CRS.from_user_input(MARS_EQUIRECTANGULAR_CRS_URN)

        # Pre-instantiate forward and inverse transformers
        self._geo_to_eqc = Transformer.from_crs(self.geo_crs, self.eqc_crs, always_xy=True)
        self._eqc_to_geo = Transformer.from_crs(self.eqc_crs, self.geo_crs, always_xy=True)

    def to_projected(self, lon: float, lat: float) -> tuple[float, float]:
        """Convert geographic lon/lat (degrees east, planetocentric) to projected metres (x, y)."""
        # Ensure longitude is normalized to [-180, 180)
        norm_lon = ((lon + 180.0) % 360.0) - 180.0
        x, y = self._geo_to_eqc.transform(norm_lon, lat)
        return float(x), float(y)

    def to_geographic(self, x: float, y: float) -> tuple[float, float]:
        """Convert projected metres (x, y) to geographic lon/lat (degrees east, planetocentric)."""
        lon, lat = self._eqc_to_geo.transform(x, y)
        norm_lon = ((lon + 180.0) % 360.0) - 180.0
        return float(norm_lon), float(lat)

    @staticmethod
    def haversine_distance_m(p1: MarsPoint, p2: MarsPoint) -> float:
        """Compute exact great-circle distance in metres between two points on the Mars sphere."""
        lat1 = math.radians(p1.lat)
        lat2 = math.radians(p2.lat)
        dlat = math.radians(p2.lat - p1.lat)
        dlon = math.radians(p2.lon - p1.lon)

        a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return MARS_RADIUS_M * c

    @staticmethod
    def validate_mars_crs(crs: CRS | None) -> bool:
        """Verify that a raster CRS represents Mars and not Earth."""
        if crs is None:
            return False
        # Check ellipsoid semi-major axis is approximately Mars radius
        ell = crs.ellipsoid
        if ell is None or ell.semi_major_metre is None:
            return False
        return math.isclose(ell.semi_major_metre, MARS_RADIUS_M, rel_tol=1e-3)
