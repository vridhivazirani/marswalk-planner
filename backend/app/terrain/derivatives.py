"""Scientific computation of terrain derivatives on Martian digital elevation models.

Methods implemented:
1. Horn's Slope (degrees): 3x3 convolution estimating dz/dx and dz/dy.
2. Aspect (degrees): compass direction of steepest slope.
3. Terrain Ruggedness Index (TRI): root-mean-square difference between a cell and its 8 neighbors.
4. Local Elevation Variation (LEV): difference between elevation and a local neighborhood mean.
5. Profile & Planform Curvatures: rate of slope/aspect change.
6. Conservative aggregation rules (preserving maximum hazards when downsampled).
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage


def compute_slope_aspect_horn(
    dem: np.ndarray,
    res_m: float,
    nodata: float = -9999.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Calculate slope (degrees) and aspect (degrees east of north) using Horn's (1981) formula.

    Slope:
      dz/dx = ((c + 2f + i) - (a + 2d + g)) / (8 * dx)
      dz/dy = ((g + 2h + i) - (a + 2b + c)) / (8 * dy)
      slope_rad = arctan(sqrt((dz/dx)^2 + (dz/dy)^2))
      slope_deg = degrees(slope_rad)
    """
    valid_mask = (dem != nodata) & ~np.isnan(dem)

    # Replicate edges for valid padding
    padded = np.pad(dem, pad_width=1, mode="edge")

    # Convolution kernels for 8*dx weighting
    # a b c
    # d e f
    # g h i
    # dz/dx kernel:
    # -1  0  1
    # -2  0  2
    # -1  0  1
    kx = np.array([[-1.0, 0.0, 1.0], [-2.0, 0.0, 2.0], [-1.0, 0.0, 1.0]], dtype=np.float32) / (
        8.0 * res_m
    )

    # dz/dy kernel (in matrix coordinates, y increases downward, so top is -y, bottom is +y):
    ky = np.array([[-1.0, -2.0, -1.0], [0.0, 0.0, 0.0], [1.0, 2.0, 1.0]], dtype=np.float32) / (
        8.0 * res_m
    )

    dz_dx = ndimage.convolve(padded, kx, mode="nearest")[1:-1, 1:-1]
    dz_dy = ndimage.convolve(padded, ky, mode="nearest")[1:-1, 1:-1]

    # Gradient magnitude
    grad = np.sqrt(dz_dx**2 + dz_dy**2)
    slope_deg = np.degrees(np.arctan(grad))

    # Aspect: 0=North, 90=East, 180=South, 270=West
    aspect_rad = np.arctan2(-dz_dx, dz_dy)
    aspect_deg = np.degrees(aspect_rad)
    aspect_deg = np.where(aspect_deg < 0, aspect_deg + 360.0, aspect_deg)

    # Preserve NoData
    slope_deg = np.where(valid_mask, slope_deg, nodata)
    aspect_deg = np.where(valid_mask, aspect_deg, nodata)

    return slope_deg.astype(np.float32), aspect_deg.astype(np.float32)


def compute_terrain_ruggedness_index(
    dem: np.ndarray,
    nodata: float = -9999.0,
) -> np.ndarray:
    """Compute Riley et al. (1999) Terrain Ruggedness Index (TRI) in elevation units (metres).

    TRI = sqrt( sum( (z_ij - z_center)^2 ) / 8 ) over 3x3 neighborhood.
    """
    valid_mask = (dem != nodata) & ~np.isnan(dem)
    padded = np.pad(dem, pad_width=1, mode="edge")

    sq_diff_sum = np.zeros_like(dem, dtype=np.float32)
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dx == 0 and dy == 0:
                continue
            shifted = padded[1 + dy : 1 + dy + dem.shape[0], 1 + dx : 1 + dx + dem.shape[1]]
            sq_diff_sum += (shifted - dem) ** 2

    tri = np.sqrt(sq_diff_sum / 8.0)
    tri = np.where(valid_mask, tri, nodata)
    return tri.astype(np.float32)


def compute_local_elevation_variation(
    dem: np.ndarray,
    size: int = 5,
    nodata: float = -9999.0,
) -> np.ndarray:
    """Calculate Local Elevation Variation (LEV): difference between elevation and mean.

    Positive values indicate local ridges; negative values indicate depressions/craters.
    """
    valid_mask = (dem != nodata) & ~np.isnan(dem)
    # Mask invalid data by filling with median for filter, then re-masking
    filled = np.where(valid_mask, dem, np.median(dem[valid_mask]))

    local_mean = ndimage.uniform_filter(filled, size=size, mode="reflect")
    lev = dem - local_mean
    lev = np.where(valid_mask, lev, nodata)
    return lev.astype(np.float32)
