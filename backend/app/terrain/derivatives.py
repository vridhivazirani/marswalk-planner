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
    if not np.any(valid_mask):
        empty = np.full_like(dem, nodata, dtype=np.float32)
        return empty, empty.copy()

    # To prevent sentinel values (e.g. -9999.0) from creating artificial 7000m cliffs
    # at data boundaries, fill invalid cells with their nearest valid neighbor elevation
    # before convolution gradient estimation.
    if np.all(valid_mask):
        dem_clean = dem
    else:
        indices = ndimage.distance_transform_edt(
            ~valid_mask, return_distances=False, return_indices=True
        )
        dem_clean = dem[tuple(indices)]

    # Replicate edges for valid padding
    padded = np.pad(dem_clean, pad_width=1, mode="edge")

    # Correlation kernels for 8*dx weighting (Horn 1981):
    # a b c
    # d e f
    # g h i
    # dz/dx kernel (East minus West):
    # -1  0  1
    # -2  0  2
    # -1  0  1
    kx = np.array([[-1.0, 0.0, 1.0], [-2.0, 0.0, 2.0], [-1.0, 0.0, 1.0]], dtype=np.float32) / (
        8.0 * res_m
    )

    # dz/dy kernel (North minus South, where row 0 is North and row 2 is South):
    #  1  2  1
    #  0  0  0
    # -1 -2 -1
    ky = np.array([[1.0, 2.0, 1.0], [0.0, 0.0, 0.0], [-1.0, -2.0, -1.0]], dtype=np.float32) / (
        8.0 * res_m
    )

    # Use correlate (direct spatial kernel application without 180° flip)
    dz_dx = ndimage.correlate(padded, kx, mode="nearest")[1:-1, 1:-1]
    dz_dy = ndimage.correlate(padded, ky, mode="nearest")[1:-1, 1:-1]

    # Gradient magnitude
    grad = np.sqrt(dz_dx**2 + dz_dy**2)
    slope_deg = np.degrees(np.arctan(grad))

    # Downhill slope aspect: 0°=North, 90°=East, 180°=South, 270°=West
    # Downhill vector is (-dz/dx, -dz/dy)
    aspect_rad = np.arctan2(-dz_dx, -dz_dy)
    aspect_deg = np.degrees(aspect_rad) % 360.0

    # Preserve NoData
    slope_deg = np.where(valid_mask, slope_deg, nodata)
    aspect_deg = np.where(valid_mask, aspect_deg, nodata)

    return slope_deg.astype(np.float32), aspect_deg.astype(np.float32)


def compute_terrain_ruggedness_index(
    dem: np.ndarray,
    nodata: float = -9999.0,
) -> np.ndarray:
    """Compute Riley et al. (1999) Terrain Ruggedness Index (TRI) in elevation units (metres).

    TRI = sqrt( sum( (z_ij - z_center)^2 ) / N_valid ) over 3x3 neighborhood.
    Ignores NoData neighbors so boundary cells do not acquire artificial multi-kilometre roughness.
    """
    valid_mask = (dem != nodata) & ~np.isnan(dem)
    if not np.any(valid_mask):
        return np.full_like(dem, nodata, dtype=np.float32)

    dem_masked = np.where(valid_mask, dem, np.nan)
    padded = np.pad(dem_masked, pad_width=1, mode="edge")

    sq_diff_sum = np.zeros_like(dem, dtype=np.float32)
    valid_count = np.zeros_like(dem, dtype=np.float32)

    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dx == 0 and dy == 0:
                continue
            shifted = padded[1 + dy : 1 + dy + dem.shape[0], 1 + dx : 1 + dx + dem.shape[1]]
            is_valid_neighbor = ~np.isnan(shifted)
            diff = np.where(is_valid_neighbor, shifted - dem, 0.0)
            sq_diff_sum += np.where(valid_mask, diff**2, 0.0)
            valid_count += is_valid_neighbor

    tri = np.where(valid_count > 0, np.sqrt(sq_diff_sum / np.maximum(1.0, valid_count)), 0.0)
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
    if not np.any(valid_mask):
        return np.full_like(dem, nodata, dtype=np.float32)

    filled = np.where(valid_mask, dem, np.median(dem[valid_mask]))
    local_mean = ndimage.uniform_filter(filled, size=size, mode="reflect")
    lev = dem - local_mean
    lev = np.where(valid_mask, lev, nodata)
    return lev.astype(np.float32)


def compute_local_relief(
    dem: np.ndarray,
    size: int = 5,
    nodata: float = -9999.0,
) -> np.ndarray:
    """Calculate Local Relief (metres): max(elevation) - min(elevation) in a local neighborhood.

    Quantifies macroscopic topographic range across the moving window
    (e.g. 5x5 cells = 100m for 20m DTM).
    """
    valid_mask = (dem != nodata) & ~np.isnan(dem)
    if not np.any(valid_mask):
        return np.full_like(dem, nodata, dtype=np.float32)

    # Fill invalid areas for filter without edge anomalies
    filled = np.where(valid_mask, dem, np.median(dem[valid_mask]))
    local_max = ndimage.maximum_filter(filled, size=size, mode="reflect")
    local_min = ndimage.minimum_filter(filled, size=size, mode="reflect")
    relief = local_max - local_min
    relief = np.where(valid_mask, relief, nodata)
    return relief.astype(np.float32)


def compute_surface_roughness(
    dem: np.ndarray,
    size: int = 5,
    nodata: float = -9999.0,
) -> np.ndarray:
    """Calculate Surface Roughness (metres) as local standard deviation of elevation.

    Based on planetary geomorphology roughness quantification (Shepard et al., 2001).
    Roughness = sqrt( mean(z^2) - mean(z)^2 ) within local window.
    """
    valid_mask = (dem != nodata) & ~np.isnan(dem)
    if not np.any(valid_mask):
        return np.full_like(dem, nodata, dtype=np.float32)

    filled = np.where(valid_mask, dem, np.median(dem[valid_mask]))
    mean = ndimage.uniform_filter(filled, size=size, mode="reflect")
    sqr_mean = ndimage.uniform_filter(filled**2, size=size, mode="reflect")
    variance = np.maximum(0.0, sqr_mean - mean**2)
    roughness = np.sqrt(variance)
    roughness = np.where(valid_mask, roughness, nodata)
    return roughness.astype(np.float32)


def compute_curvatures(
    dem: np.ndarray,
    res_m: float,
    nodata: float = -9999.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Calculate profile curvature, planform curvature, and mean curvature.

    Uses Zevenbergen & Thorne (1987) 3x3 second-order polynomial surface fit:
      z = A*x^2 + B*y^2 + C*x*y + D*x + E*y + F

    Definitions:
    - Profile curvature (1/m): rate of slope change along the direction of maximum gradient.
      Negative = concave (decelerating flow/pit); Positive = convex (accelerating flow/ridge).
    - Planform curvature (1/m): curvature perpendicular to gradient (along contour lines).
      Negative = diverging ridges; Positive = converging valleys/gullies.
    - Mean curvature (1/m): overall average surface curvature -(A + B).
    """
    valid_mask = (dem != nodata) & ~np.isnan(dem)
    if not np.any(valid_mask):
        empty = np.full_like(dem, nodata, dtype=np.float32)
        return empty, empty.copy(), empty.copy()

    # Fill invalid edges with nearest valid neighbor
    if np.all(valid_mask):
        dem_clean = dem
    else:
        indices = ndimage.distance_transform_edt(
            ~valid_mask, return_distances=False, return_indices=True
        )
        dem_clean = dem[tuple(indices)]

    padded = np.pad(dem_clean, pad_width=1, mode="edge")

    # 3x3 neighborhood indices:
    # z1 z2 z3
    # z4 z5 z6
    # z7 z8 z9
    z1 = padded[:-2, :-2]
    z2 = padded[:-2, 1:-1]
    z3 = padded[:-2, 2:]
    z4 = padded[1:-1, :-2]
    z5 = padded[1:-1, 1:-1]
    z6 = padded[1:-1, 2:]
    z7 = padded[2:, :-2]
    z8 = padded[2:, 1:-1]
    z9 = padded[2:, 2:]

    spacing_l = float(res_m)
    spacing_l2 = spacing_l * spacing_l

    # Polynomial coefficients
    coeff_d = (z6 - z4) / (2.0 * spacing_l)
    coeff_e = (z2 - z8) / (2.0 * spacing_l)  # y increases downward in raster coordinates
    coeff_a = (z4 + z6 - 2.0 * z5) / (2.0 * spacing_l2)
    coeff_b = (z2 + z8 - 2.0 * z5) / (2.0 * spacing_l2)
    coeff_c = (z3 + z7 - z1 - z9) / (4.0 * spacing_l2)

    p = -coeff_d
    q = -coeff_e
    p2_plus_q2 = p**2 + q**2

    # Handle flat or near-flat slopes to prevent division by zero
    flat_threshold = 1e-7
    steep_enough = p2_plus_q2 > flat_threshold

    # Profile curvature
    denom_prof = np.where(
        steep_enough,
        p2_plus_q2 * np.power(1.0 + p2_plus_q2, 1.5),
        1.0,
    )
    prof_curv = np.where(
        steep_enough,
        -2.0 * (coeff_a * p**2 + coeff_b * q**2 + coeff_c * p * q) / denom_prof,
        0.0,
    )

    # Planform curvature
    denom_plan = np.where(
        steep_enough,
        np.power(p2_plus_q2, 1.5),
        1.0,
    )
    plan_curv = np.where(
        steep_enough,
        2.0 * (coeff_a * q**2 + coeff_b * p**2 - coeff_c * p * q) / denom_plan,
        0.0,
    )

    # Mean curvature (independent of gradient direction)
    mean_curv = -(coeff_a + coeff_b)

    # Mask NoData
    prof_curv = np.where(valid_mask, prof_curv, nodata).astype(np.float32)
    plan_curv = np.where(valid_mask, plan_curv, nodata).astype(np.float32)
    mean_curv = np.where(valid_mask, mean_curv, nodata).astype(np.float32)

    return prof_curv, plan_curv, mean_curv


def compute_vector_ruggedness_measure(
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
    size: int = 3,
    nodata: float = -9999.0,
) -> np.ndarray:
    """Calculate Vector Ruggedness Measure (VRM) (Hobson 1972; Sappington et al., 2007).

    VRM measures the dispersion of 3D unit normal vectors across a local neighborhood.
    Unlike slope or TRI, VRM decouples ruggedness from gradient steepness:
    - Steep but planar scarps have low VRM (~0.0).
    - Highly fractured, undulating, blocky terrain has high VRM (>0.05).

    Formula:
      x = sin(slope) * sin(aspect)
      y = sin(slope) * cos(aspect)
      z = cos(slope)
      R = sqrt( (sum_x)^2 + (sum_y)^2 + (sum_z)^2 )
      VRM = 1.0 - (R / N)
    """
    valid_mask = (slope_deg != nodata) & (aspect_deg != nodata) & ~np.isnan(slope_deg)
    if not np.any(valid_mask):
        return np.full_like(slope_deg, nodata, dtype=np.float32)

    slope_rad = np.radians(np.where(valid_mask, slope_deg, 0.0))
    aspect_rad = np.radians(np.where(valid_mask, aspect_deg, 0.0))

    # 3D unit vector components of the surface normal
    x = np.sin(slope_rad) * np.sin(aspect_rad)
    y = np.sin(slope_rad) * np.cos(aspect_rad)
    z = np.cos(slope_rad)

    # Zero out invalid values for window accumulation
    x = np.where(valid_mask, x, 0.0)
    y = np.where(valid_mask, y, 0.0)
    z = np.where(valid_mask, z, 0.0)
    valid_float = valid_mask.astype(np.float32)

    # Sum vector components in neighborhood
    sum_x = ndimage.uniform_filter(x, size=size, mode="reflect") * (size * size)
    sum_y = ndimage.uniform_filter(y, size=size, mode="reflect") * (size * size)
    sum_z = ndimage.uniform_filter(z, size=size, mode="reflect") * (size * size)
    valid_count = ndimage.uniform_filter(valid_float, size=size, mode="reflect") * (size * size)

    r_resultant = np.sqrt(sum_x**2 + sum_y**2 + sum_z**2)
    vrm = np.where(
        valid_count > 0,
        np.clip(1.0 - (r_resultant / np.maximum(1.0, valid_count)), 0.0, 1.0),
        0.0,
    )
    vrm = np.where(valid_mask, vrm, nodata)
    return vrm.astype(np.float32)


def compute_analytical_hillshade(
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
    azimuth_deg: float = 315.0,
    altitude_deg: float = 45.0,
    nodata: float = -9999.0,
) -> np.ndarray:
    """Calculate single-source analytical hillshade [0, 255] using Lambertian reflectance.

    Formula:
      zenith_rad = radians(90.0 - altitude_deg)
      azimuth_math = radians(360.0 - azimuth_deg + 90.0) % (2 * pi)
      hillshade = 255.0 * (
          cos(zenith_rad) * cos(slope_rad) +
          sin(zenith_rad) * sin(slope_rad) * cos(azimuth_math - aspect_rad)
      )
    """
    valid_mask = (slope_deg != nodata) & (aspect_deg != nodata) & ~np.isnan(slope_deg)
    if not np.any(valid_mask):
        return np.full_like(slope_deg, nodata, dtype=np.float32)

    slope_rad = np.radians(np.where(valid_mask, slope_deg, 0.0))
    aspect_rad = np.radians(np.where(valid_mask, aspect_deg, 0.0))

    zenith_rad = np.radians(90.0 - altitude_deg)
    azimuth_rad = np.radians(azimuth_deg)

    # Both azimuth and aspect are in canonical geographic convention (0°=N, 90°=E)
    illumination = np.cos(zenith_rad) * np.cos(slope_rad) + np.sin(zenith_rad) * np.sin(
        slope_rad
    ) * np.cos(azimuth_rad - aspect_rad)
    hillshade = np.clip(illumination * 255.0, 0.0, 255.0)
    hillshade = np.where(valid_mask, hillshade, nodata)
    return hillshade.astype(np.float32)


def compute_multidirectional_hillshade(
    slope_deg: np.ndarray,
    aspect_deg: np.ndarray,
    nodata: float = -9999.0,
) -> np.ndarray:
    """Calculate multi-directional relief shading (Mark 1992 orthogonal formulation).

    Eliminates aspect lighting bias by blending four evenly distributed orthogonal
    illumination directions (90° apart) at 45° altitude:
      - 225° (Southwest)
      - 315° (Northwest, canonical)
      - 45°  (Northeast)
      - 135° (Southeast)
    Equally weighted at 0.25 each, ensuring symmetrical illumination
    across all terrain orientations.
    """
    valid_mask = (slope_deg != nodata) & (aspect_deg != nodata) & ~np.isnan(slope_deg)
    if not np.any(valid_mask):
        return np.full_like(slope_deg, nodata, dtype=np.float32)

    angles = [225.0, 315.0, 45.0, 135.0]
    weights = [0.25, 0.25, 0.25, 0.25]

    blended = np.zeros_like(slope_deg, dtype=np.float32)
    for angle, w in zip(angles, weights, strict=False):
        shade = compute_analytical_hillshade(
            slope_deg=slope_deg,
            aspect_deg=aspect_deg,
            azimuth_deg=angle,
            altitude_deg=45.0,
            nodata=nodata,
        )
        blended += np.where(valid_mask, shade * w, 0.0)

    blended = np.clip(blended, 0.0, 255.0)
    blended = np.where(valid_mask, blended, nodata)
    return blended.astype(np.float32)
