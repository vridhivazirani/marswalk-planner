"""Unit and analytical tests for the Terrain Intelligence Engine and hazard detectors."""

from __future__ import annotations

import numpy as np

from app.terrain.classifier import TerrainClass, classify_terrain
from app.terrain.derivatives import (
    compute_local_elevation_variation,
    compute_slope_aspect_horn,
    compute_terrain_ruggedness_index,
)
from app.terrain.hazards_detector import (
    detect_boulder_candidates,
    detect_sand_dune_candidates,
)


def test_horn_slope_on_synthetic_plane():
    """Verify Horn's slope on an analytically inclined plane (dz/dx = tan(theta), dz/dy = 0)."""
    # 45-degree slope -> dz/dx = 1.0 (res_m = 10.0m, so delta_z per cell = 10.0m)
    res_m = 10.0
    x = np.arange(10, dtype=np.float32) * res_m
    plane = np.tile(x, (10, 1))

    slope, aspect = compute_slope_aspect_horn(plane, res_m=res_m)

    # Interior cells (ignoring boundary edge effects) should have slope ~45.0 degrees
    interior_slope = slope[2:-2, 2:-2]
    assert np.allclose(interior_slope, 45.0, atol=0.5)

    # Aspect: plane rises towards East (+x), downhill steepest descent points West (270 deg)
    interior_aspect = aspect[2:-2, 2:-2]
    assert np.allclose(interior_aspect, 270.0, atol=1.0)


def test_horn_slope_on_flat_surface():
    """Flat surface must yield slope = 0.0 degrees."""
    flat = np.full((15, 15), -2500.0, dtype=np.float32)
    slope, _ = compute_slope_aspect_horn(flat, res_m=20.0)
    assert np.allclose(slope, 0.0, atol=1e-3)


def test_tri_roughness_metric():
    """Flat surface must have TRI = 0.0, while perturbed surface has positive TRI."""
    flat = np.full((10, 10), 100.0, dtype=np.float32)
    tri_flat = compute_terrain_ruggedness_index(flat)
    assert np.allclose(tri_flat, 0.0, atol=1e-4)

    # Introduce checkerboard perturbation
    noisy = flat.copy()
    noisy[::2, ::2] += 5.0
    tri_noisy = compute_terrain_ruggedness_index(noisy)
    assert np.all(tri_noisy[1:-1, 1:-1] > 1.0)


def test_local_elevation_variation():
    """A central peak should have positive LEV, while a depression has negative LEV."""
    dem = np.full((15, 15), 100.0, dtype=np.float32)
    dem[7, 7] = 120.0  # +20m peak
    dem[2, 2] = 80.0  # -20m depression

    lev = compute_local_elevation_variation(dem, size=5)
    assert lev[7, 7] > 5.0
    assert lev[2, 2] < -5.0


def test_hazard_candidate_detectors():
    h, w = 20, 20
    imagery = np.full((h, w), 120, dtype=np.uint8)
    # Add noisy texture patch for rock field
    imagery[5:10, 5:10] = np.random.RandomState(42).randint(30, 220, size=(5, 5), dtype=np.uint8)

    tri = np.zeros((h, w), dtype=np.float32)
    tri[5:10, 5:10] = 3.5  # high roughness
    valid_mask = np.ones((h, w), dtype=bool)

    b_score, b_mask = detect_boulder_candidates(imagery, tri, valid_mask)
    assert np.any(b_mask[5:10, 5:10])
    assert not np.any(b_mask[0:4, 0:4])

    # Sand detector
    slope = np.zeros((h, w), dtype=np.float32)
    s_score, s_mask = detect_sand_dune_candidates(imagery, slope, tri, valid_mask)
    # Smooth region away from rock patch should flag sand
    assert s_score[0, 0] > 0.5


def test_terrain_classifier_rules():
    shape = (5, 5)
    valid_mask = np.ones(shape, dtype=bool)
    source_id = np.full(shape, 2, dtype=np.uint8)  # HiRISE
    slope = np.full(shape, 5.0, dtype=np.float32)
    tri = np.full(shape, 0.5, dtype=np.float32)
    lev = np.zeros(shape, dtype=np.float32)
    b_score = np.zeros(shape, dtype=np.float32)
    s_score = np.zeros(shape, dtype=np.float32)
    c_score = np.zeros(shape, dtype=np.float32)

    # Cell (1,1): steep slope > 25 deg -> MUST be STEEP_SCARP_CLIFF
    slope[1, 1] = 28.0
    # Cell (2,2): high boulder score -> BOULDER_FIELD_ROCK
    b_score[2, 2] = 0.8
    # Cell (3,3): invalid -> UNKNOWN_NO_DATA
    valid_mask[3, 3] = False

    classes, conf = classify_terrain(
        slope, tri, lev, b_score, s_score, c_score, valid_mask, source_id
    )

    assert classes[1, 1] == TerrainClass.STEEP_SCARP_CLIFF
    assert conf[1, 1] >= 0.90
    assert classes[2, 2] == TerrainClass.BOULDER_FIELD_ROCK
    assert classes[3, 3] == TerrainClass.UNKNOWN_NO_DATA
    assert conf[3, 3] == 0.0
    assert classes[0, 0] == TerrainClass.SMOOTH_REGOLITH


def test_nodata_boundary_handling():
    """Verify that NoData pixels (-9999.0) do not cause artificial 7000m cliffs in slope or TRI."""
    dem = np.full((7, 7), -2500.0, dtype=np.float32)
    # Set right boundary to NoData
    dem[:, -1] = -9999.0

    slope, _ = compute_slope_aspect_horn(dem, res_m=20.0, nodata=-9999.0)
    tri = compute_terrain_ruggedness_index(dem, nodata=-9999.0)

    # Valid cells bordering the NoData column must remain near zero slope and zero TRI
    assert np.allclose(slope[:, :-1], 0.0, atol=1e-2)
    assert np.allclose(tri[:, :-1], 0.0, atol=1e-2)

    # NoData column itself must preserve the NoData sentinel
    assert np.all(slope[:, -1] == -9999.0)
    assert np.all(tri[:, -1] == -9999.0)


def test_horn_slope_anisotropic_east_west():
    """Verify Horn slope with anisotropic pixel spacing (dx != dy) on known East-West slope.

    Analytical setup:
      dx_m = 10.0, dy_m = 25.0
      Plane rises 10m every 10m in x (+East): dz/dx = 1.0, dz/dy = 0.0
      Expected slope: arctan(1.0) = 45.0 degrees.
    """
    dx_m, dy_m = 10.0, 25.0
    x = np.arange(12, dtype=np.float32) * 10.0  # rises 10m per column (each column is 10m wide)
    plane = np.tile(x, (12, 1))

    slope, aspect = compute_slope_aspect_horn(plane, dx_m=dx_m, dy_m=dy_m)
    interior_slope = slope[2:-2, 2:-2]
    assert np.allclose(interior_slope, 45.0, atol=0.5)

    interior_aspect = aspect[2:-2, 2:-2]
    assert np.allclose(interior_aspect, 270.0, atol=1.0)


def test_horn_slope_anisotropic_north_south():
    """Verify Horn slope with anisotropic spacing on known North-South slope.

    Analytical setup:
      dx_m = 15.0, dy_m = 30.0
      Plane rises 15m every 30m in y (+North, row 0 to row 11): dz/dy = 0.5, dz/dx = 0.0
      Expected slope: arctan(0.5) ~ 26.565 degrees.
    """
    dx_m, dy_m = 15.0, 30.0
    # Row 0 is North, row 11 is South. If elevation decreases towards South:
    # row 0 has highest elev, row 11 lowest.
    # dz/dy (North minus South) > 0.
    r = np.arange(12, dtype=np.float32)[::-1] * 15.0  # 15m rise per row (dy = 30m)
    plane = np.tile(r[:, np.newaxis], (1, 12))

    slope, aspect = compute_slope_aspect_horn(plane, dx_m=dx_m, dy_m=dy_m)
    expected_slope = float(np.degrees(np.arctan(15.0 / 30.0)))  # ~26.565°
    interior_slope = slope[2:-2, 2:-2]
    assert np.allclose(interior_slope, expected_slope, atol=0.5)


def test_horn_slope_anisotropic_flat_and_validation():
    """Verify flat anisotropic surface and input parameter validation."""
    flat = np.full((10, 10), 50.0, dtype=np.float32)
    slope, _ = compute_slope_aspect_horn(flat, dx_m=12.5, dy_m=25.0)
    assert np.allclose(slope, 0.0, atol=1e-3)

    # Missing parameters should raise ValueError
    import pytest
    with pytest.raises(ValueError, match="Either 'res_m' or both 'dx_m' and 'dy_m'"):
        compute_slope_aspect_horn(flat)

    with pytest.raises(ValueError, match="Both 'dx_m' and 'dy_m' must be specified"):
        compute_slope_aspect_horn(flat, dx_m=10.0)

    with pytest.raises(ValueError, match="strictly positive"):
        compute_slope_aspect_horn(flat, dx_m=-5.0, dy_m=10.0)
