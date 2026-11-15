"""Scientific verification and synthetic test suite for Native-Resolution Hazard Processing.

Verifies:
1. Detection of 1m micro-features (isolated boulder, narrow scarp, crater, flat, known slope).
2. Conservative aggregation (any-hit obstacle preservation, conservative maximum).
3. Windowed processing halo consistency (zero boundary seam artifacts).
4. NoData conservative safety (unknown pixels stay impassable).
5. Exact 1:20 spatial alignment.
"""

from __future__ import annotations

import numpy as np

from app.terrain.native_hazards import (
    HIRISE_RAW_NODATA,
    aggregate_native_patch_to_20m,
    compute_native_hazards_patch,
)


def test_synthetic_flat_plane():
    """Flat synthetic terrain must produce zero slope, zero roughness, zero boulders."""
    # 40x40 1m patch (maps to 2x2 20m cells)
    dem = np.full((40, 40), 100.0, dtype=np.float32)

    metrics = compute_native_hazards_patch(dem, res_m=1.0)
    assert np.allclose(metrics.slope_deg, 0.0, atol=1e-3)
    assert np.allclose(metrics.tri_roughness_m, 0.0, atol=1e-3)
    assert np.allclose(metrics.boulder_score, 0.0, atol=1e-3)
    assert not np.any(metrics.obstacle_mask)

    agg = aggregate_native_patch_to_20m(metrics, target_shape=(2, 2), scale_factor=20)
    assert not np.any(agg.hard_impassable)
    assert np.allclose(agg.boulder_hazard_score, 0.0)
    assert np.allclose(agg.slope_deg_max, 0.0)


def test_synthetic_known_slope_plane():
    """Analytic inclined plane with slope theta must produce expected slope in aggregation."""
    # dz/dx = tan(30°) = 0.57735 per metre. 30° slope.
    # 30° > 25° threshold -> MUST be marked impassable!
    tan_30 = float(np.tan(np.radians(30.0)))
    x = np.arange(40, dtype=np.float32) * tan_30
    dem = np.tile(x, (40, 1))

    metrics = compute_native_hazards_patch(dem, res_m=1.0)
    interior_slope = metrics.slope_deg[2:-2, 2:-2]
    assert np.allclose(interior_slope, 30.0, atol=0.5)
    # Slopes >= 25° must be flagged as obstacles
    assert np.all(metrics.obstacle_mask[2:-2, 2:-2])

    agg = aggregate_native_patch_to_20m(metrics, target_shape=(2, 2), scale_factor=20)
    assert np.all(agg.hard_impassable)
    assert np.all(agg.slope_deg_max >= 29.5)


def test_synthetic_isolated_1m_boulder_preservation():
    """A single isolated 1.5m boulder in a 20x20m area MUST survive into the 20m routing cell.

    This directly tests the core scientific integrity requirement of AGENTS.md §3:
    Downsampling must not erase isolated small-scale hazards.
    """
    # 40x40 grid (2x2 cells of 20m).
    # Cell (0, 0) is completely flat regolith.
    # Cell (0, 1) has a single 1.8m tall boulder peak at (10, 30).
    dem = np.full((40, 40), 100.0, dtype=np.float32)
    dem[10, 30] += 1.8  # 1.8m pinnacle in cell (0, 1)

    metrics = compute_native_hazards_patch(dem, res_m=1.0)
    assert metrics.boulder_score[10, 30] >= 0.50
    assert metrics.obstacle_mask[10, 30]

    agg = aggregate_native_patch_to_20m(metrics, target_shape=(2, 2), scale_factor=20)
    # Cell (0, 0) flat -> traversable
    assert not agg.hard_impassable[0, 0]
    assert agg.boulder_hazard_score[0, 0] == 0.0

    # Cell (0, 1) contains the 1m boulder -> MUST BE IMPASSABLE and have high boulder score
    assert agg.hard_impassable[0, 1]
    assert agg.boulder_hazard_score[0, 1] >= 0.50


def test_synthetic_narrow_scarp_preservation():
    """A narrow 1-pixel-wide 2m scarp step across a cell must be preserved as impassable."""
    dem = np.full((40, 40), 100.0, dtype=np.float32)
    # Step drop of 2.5m at column 10 in cell (0, 0)
    dem[:, 10:] -= 2.5

    metrics = compute_native_hazards_patch(dem, res_m=1.0)
    # At the step transition (col 9 to 10), localized slope is steep (> 45 deg)
    assert np.any(metrics.slope_deg[:, 9:11] > 35.0)
    assert np.any(metrics.obstacle_mask[:, 9:11])

    agg = aggregate_native_patch_to_20m(metrics, target_shape=(2, 2), scale_factor=20)
    # Cell (0, 0) and (1, 0) both intersect the scarp line at col 10
    assert agg.hard_impassable[0, 0]
    assert agg.hard_impassable[1, 0]
    assert agg.slope_deg_max[0, 0] > 35.0


def test_synthetic_crater_feature():
    """Synthetic crater bowl with steep rims and depression depth."""
    # 40x40 grid, crater centered at (20, 20) with radius 12m, depth 4m
    y, x = np.ogrid[:40, :40]
    r = np.sqrt((x - 20) ** 2 + (y - 20) ** 2)
    dem = np.full((40, 40), 100.0, dtype=np.float32)
    # Parabolic depression
    crater_mask = r <= 12.0
    dem[crater_mask] -= 4.0 * (1.0 - (r[crater_mask] / 12.0) ** 2)

    metrics = compute_native_hazards_patch(dem, res_m=1.0)
    # Crater rim has elevated slope and scarp score
    assert np.any(metrics.slope_deg > 20.0)

    agg = aggregate_native_patch_to_20m(metrics, target_shape=(2, 2), scale_factor=20)
    # All 4 20m cells intersect the 24m diameter crater
    assert np.all(agg.slope_deg_max > 15.0)


def test_nodata_conservative_safety():
    """Unknown / NoData cells must NEVER become safe traversable terrain."""
    dem = np.full((40, 40), 100.0, dtype=np.float32)
    # Cell (1, 1) has NoData in 5 pixels
    dem[25:30, 25:30] = HIRISE_RAW_NODATA

    metrics = compute_native_hazards_patch(dem, res_m=1.0, nodata=HIRISE_RAW_NODATA)
    assert np.all(metrics.obstacle_mask[25:30, 25:30])
    assert not np.any(metrics.valid_mask[25:30, 25:30])

    agg = aggregate_native_patch_to_20m(metrics, target_shape=(2, 2), scale_factor=20)
    # Cell (1, 1) must be flagged as hard impassable and unknown
    assert agg.hard_impassable[1, 1]
    assert agg.unknown_mask[1, 1]


def test_obstacle_intersecting_20m_cell_boundary():
    """An obstacle on cell boundary (e.g. index 19 and 20) must flag both cells."""
    dem = np.full((40, 40), 100.0, dtype=np.float32)
    # Boulder straddling row 19 and row 20
    dem[19:21, 10] += 2.0

    metrics = compute_native_hazards_patch(dem, res_m=1.0)
    agg = aggregate_native_patch_to_20m(metrics, target_shape=(2, 2), scale_factor=20)

    # Row 19 is in cell (0, 0), row 20 is in cell (1, 0)
    assert agg.hard_impassable[0, 0]
    assert agg.hard_impassable[1, 0]


def test_windowed_processing_halo_equivalence():
    """Two adjacent strips with convolutional halo must match a single array."""
    # 80x40 DEM with various features
    np.random.seed(42)
    dem = np.full((80, 40), 100.0, dtype=np.float32)
    dem[15:17, 10] += 1.8  # Boulder in strip 1
    dem[55:58, 25] += 2.2  # Boulder in strip 2
    dem[39:41, :] -= 2.0   # Scarp right along strip split boundary (row 40)

    # 1. Full-array reference calculation
    ref_metrics = compute_native_hazards_patch(dem, res_m=1.0)

    # 2. Windowed split at row 40 with 4-pixel halo
    halo = 4
    strip1_dem = dem[: 40 + halo, :]
    strip2_dem = dem[40 - halo :, :]

    m1 = compute_native_hazards_patch(strip1_dem, res_m=1.0)
    m2 = compute_native_hazards_patch(strip2_dem, res_m=1.0)

    # Trim halos
    trim1_slope = m1.slope_deg[:40, :]
    trim2_slope = m2.slope_deg[halo:, :]
    reconstructed_slope = np.vstack([trim1_slope, trim2_slope])

    # Must match reference exactly (difference < 1e-4) across the entire boundary!
    diff = np.abs(reconstructed_slope - ref_metrics.slope_deg)
    assert np.max(diff) < 1e-4, f"Seam artifact detected: max diff = {np.max(diff)}"
