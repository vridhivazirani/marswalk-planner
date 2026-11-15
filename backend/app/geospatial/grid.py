"""Analysis-Ready Data (ARD) multi-resolution grid definitions for Jezero Crater.

Defines the spatial bounding boxes and discrete pixel-aligned grid specifications
for multi-tier rover & human EVA analysis:
- L0: 1.0 m  (HiRISE native corridor resolution)
- L1: 5.0 m  (HiRISE aggregated / CTX ortho aggregated)
- L2: 20.0 m (CTX DTM native crater-scale resolution)
- L3: 200.0 m (MOLA / HRSC regional context)

All tiers share the same projected coordinate system (ESRI:103885) and maintain
strict integer-multiple coordinate snapping.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import rasterio
from rasterio.transform import Affine

from app.geospatial.crs import MARS_EQUIRECTANGULAR_CRS_URN


@dataclass(frozen=True)
class GridSpec:
    """Rigid grid specification for an Analysis-Ready Data (ARD) layer."""

    name: str
    tier: Literal["L0", "L1", "L2", "L3"]
    resolution_m: float
    left: float
    bottom: float
    right: float
    top: float
    width: int
    height: int
    crs: str = MARS_EQUIRECTANGULAR_CRS_URN

    @property
    def transform(self) -> Affine:
        """Construct affine geotransform: Affine(x_res, 0.0, left, 0.0, -y_res, top)."""
        return Affine(self.resolution_m, 0.0, self.left, 0.0, -self.resolution_m, self.top)

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """(left, bottom, right, top) in projected metres."""
        return (self.left, self.bottom, self.right, self.top)


# Western Fan & Delta Margin Study Footprint (Tier 1 Core Exploration Area)
# Matches the native bounds of the USGS TRN HiRISE DTM tile (1m) exactly to prevent
# unnecessary spatial clipping or resampling degradation of high-res observations.
JEZERO_WESTERN_DELTA_BOUNDS = (
    4584524.3513494255,  # left (x_min)
    1090185.646211346,  # bottom (y_min)
    4591761.3513494255,  # right (x_max)
    1101888.646211346,  # top (y_max)
)

DELTA_WIDTH_1M = 7237
DELTA_HEIGHT_1M = 11703


def get_western_delta_grid_1m() -> GridSpec:
    """Retrieve the native 1.0 m ARD L0 grid specification for the Western Delta."""
    left, bottom, right, top = JEZERO_WESTERN_DELTA_BOUNDS
    return GridSpec(
        name="jezero_western_delta_1m",
        tier="L0",
        resolution_m=1.0,
        left=left,
        bottom=bottom,
        right=right,
        top=top,
        width=DELTA_WIDTH_1M,
        height=DELTA_HEIGHT_1M,
    )


def get_western_delta_grid_20m() -> GridSpec:
    """Retrieve the co-registered 20.0 m ARD L2 grid specification for the Western Delta.

    Ensures pixel boundaries align with the L0 grid (20 L0 pixels per L2 cell).
    """
    left, bottom, right, top = JEZERO_WESTERN_DELTA_BOUNDS
    # Compute rounded dimensions that enclose the area at 20 m
    # To maintain strict pixel alignment, width = ceil(7237 / 20) = 362
    # height = ceil(11703 / 20) = 586
    res = 20.0
    w_20m = (DELTA_WIDTH_1M + 19) // 20
    h_20m = (DELTA_HEIGHT_1M + 19) // 20
    new_right = left + w_20m * res
    new_bottom = top - h_20m * res

    return GridSpec(
        name="jezero_western_delta_20m",
        tier="L2",
        resolution_m=res,
        left=left,
        bottom=new_bottom,
        right=new_right,
        top=top,
        width=w_20m,
        height=h_20m,
    )


class IncompatibleRasterError(ValueError):
    """Raised when two rasters fail geodetic or spatial grid alignment validation."""


def validate_raster_alignment(
    src_a: rasterio.DatasetReader,
    src_b: rasterio.DatasetReader,
    check_dimensions: bool = True,
    tolerance_m: float = 1e-3,
) -> bool:
    """Validate spatial and geodetic alignment between two rasters.

    Verifies:
      1. CRS equivalence.
      2. Grid origin (left, top).
      3. Pixel resolution (res_x, res_y).
      4. Raster shape (width, height) if check_dimensions is True.
      5. Bounding box spatial overlap.

    Raises IncompatibleRasterError if rasters cannot be safely aligned or combined.
    """
    # 1. CRS Check
    if src_a.crs != src_b.crs:
        raise IncompatibleRasterError(
            f"CRS mismatch: '{src_a.crs}' != '{src_b.crs}'"
        )

    # 2. Origin Check (Left, Top)
    t_a = src_a.transform
    t_b = src_b.transform
    origin_matches = (
        math.isclose(t_a.c, t_b.c, abs_tol=tolerance_m)
        and math.isclose(t_a.f, t_b.f, abs_tol=tolerance_m)
    )
    if not origin_matches:
        raise IncompatibleRasterError(
            f"Grid origin mismatch: ({t_a.c:.3f}, {t_a.f:.3f}) != ({t_b.c:.3f}, {t_b.f:.3f})"
        )

    # 3. Pixel Size Check
    pixel_matches = (
        math.isclose(t_a.a, t_b.a, abs_tol=tolerance_m)
        and math.isclose(abs(t_a.e), abs(t_b.e), abs_tol=tolerance_m)
    )
    if not pixel_matches:
        raise IncompatibleRasterError(
            f"Pixel resolution mismatch: ({t_a.a:.3f}, {abs(t_a.e):.3f}) != "
            f"({t_b.a:.3f}, {abs(t_b.e):.3f})"
        )

    # 4. Dimensions Check
    if check_dimensions:
        if src_a.width != src_b.width or src_a.height != src_b.height:
            raise IncompatibleRasterError(
                f"Raster dimensions mismatch: ({src_a.width}x{src_a.height}) != "
                f"({src_b.width}x{src_b.height})"
            )

    # 5. Extent Overlap Check
    b_a = src_a.bounds
    b_b = src_b.bounds
    overlap_left = max(b_a.left, b_b.left)
    overlap_right = min(b_a.right, b_b.right)
    overlap_bottom = max(b_a.bottom, b_b.bottom)
    overlap_top = min(b_a.top, b_b.top)

    if overlap_left >= overlap_right or overlap_bottom >= overlap_top:
        raise IncompatibleRasterError("Rasters do not have positive spatial overlap.")

    return True
