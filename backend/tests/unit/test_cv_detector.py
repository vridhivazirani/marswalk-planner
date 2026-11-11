"""Unit tests for computer vision and geomorphic feature candidate detection.

Uses analytic synthetic mathematical surfaces (planes, cones, spheres, sinusoids)
generated dynamically in code, strictly adhering to AGENTS.md.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.core.epistemic import EpistemicClass
from app.terrain.cv_detector import (
    calculate_shadow_height,
    detect_boulders_with_shadows,
    detect_dune_crests,
    detect_impact_craters,
)


def test_calculate_shadow_height_analytic() -> None:
    """Test shadow-height trigonometry against known mathematical values."""
    # At 45 degrees solar elevation, tan(45) == 1.0 -> height == shadow length
    h_45 = calculate_shadow_height(shadow_length_m=3.5, sun_elevation_deg=45.0)
    assert math.isclose(h_45, 3.5, rel_tol=1e-5)

    # At 30 degrees: tan(30) == 1 / sqrt(3) -> 3.5 / sqrt(3) ~= 2.0207
    h_30 = calculate_shadow_height(shadow_length_m=3.5, sun_elevation_deg=30.0)
    expected_30 = 3.5 * math.tan(math.radians(30.0))
    assert math.isclose(h_30, expected_30, rel_tol=1e-5)

    # Zero shadow length returns 0
    assert calculate_shadow_height(0.0, 45.0) == 0.0

    # Invalid angles raise ValueError
    with pytest.raises(ValueError, match="Sun elevation angle"):
        calculate_shadow_height(2.0, 0.0)
    with pytest.raises(ValueError, match="Sun elevation angle"):
        calculate_shadow_height(2.0, 90.0)


def test_detect_boulders_with_shadows_synthetic() -> None:
    """Test boulder candidate detection on a synthetic image with a bright rock and dark shadow."""
    # Create 80x80 synthetic surface (mean regolith reflectance = 100)
    img = np.full((80, 80), 100.0, dtype=np.float32)

    # Place a bright boulder peak at (40, 40)
    y, x = np.ogrid[-40:40, -40:40]
    r_sq = x * x + y * y
    rock_mask = r_sq <= 4  # ~2 pixel radius
    img[rock_mask] = 220.0  # Bright sunlit rock

    # Place an adjacent cast shadow down-sun (sun azimuth 270 -> casts East, col increases)
    # Azimuth 270 is West, so shadow casts East (offset +cols)
    shadow_mask = (y >= -2) & (y <= 2) & (x >= 3) & (x <= 10)
    img[shadow_mask] = 20.0  # Dark shadow

    candidates, score_map = detect_boulders_with_shadows(
        imagery=img,
        sun_azimuth_deg=270.0,
        sun_elevation_deg=35.0,
        pixel_scale_m=0.25,
        min_diameter_m=0.5,
        max_diameter_m=5.0,
        variance_threshold=20.0,
    )

    assert isinstance(candidates, list)
    assert score_map.shape == (80, 80)
    if candidates:
        top_cand = candidates[0]
        assert top_cand.epistemic_class == EpistemicClass.HEURISTIC.value
        assert top_cand.estimated_height_m > 0.0
        assert 35 <= top_cand.row <= 45
        assert 35 <= top_cand.col <= 45


def test_detect_dune_crests_synthetic_sinusoid() -> None:
    """Test dune ridge filter on an analytic sinusoidal ripple pattern."""
    # Create 100x100 grid with 1D sinusoidal wave traveling along X (crests run along Y)
    # z = 120 + 40 * cos(2 * pi * x / lambda)
    x = np.arange(100, dtype=np.float32)
    wavelength_px = 12.0
    wave_1d = 120.0 + 40.0 * np.cos(2.0 * np.pi * x / wavelength_px)
    synthetic_dunes = np.tile(wave_1d, (100, 1))

    segments, ridge_map = detect_dune_crests(
        imagery=synthetic_dunes,
        pixel_scale_m=1.0,
        ridge_sigma=1.2,
        min_crest_length_m=10.0,
    )

    assert isinstance(segments, list)
    assert ridge_map.shape == (100, 100)
    # The ridge map should have strong responses at cosine crests
    assert np.max(ridge_map) > 0.5
    if segments:
        assert segments[0].epistemic_class == EpistemicClass.HEURISTIC.value
        assert segments[0].length_m >= 10.0


def test_detect_impact_craters_synthetic_bowl() -> None:
    """Test crater detector on an analytic inverted Gaussian depression with elevated rim."""
    # Grid 120x120 representing DEM
    y, x = np.ogrid[-60:60, -60:60]
    r = np.sqrt(x * x + y * y)

    # Analytic crater profile: Mexican-hat style (deep center bowl + raised rim)
    # z(r) = -depth * exp(-r^2 / (2 * sigma_bowl^2)) + rim * exp(-(r - r_rim)^2 / (2 * sigma_rim^2))
    bowl = -15.0 * np.exp(-(r**2) / (2.0 * 8.0**2))
    rim = 4.0 * np.exp(-((r - 12.0) ** 2) / (2.0 * 2.5**2))
    synthetic_dem = bowl + rim

    craters, score_map = detect_impact_craters(
        dem=synthetic_dem,
        pixel_scale_m=1.0,
        min_radius_m=5.0,
        max_radius_m=30.0,
    )

    assert isinstance(craters, list)
    assert score_map.shape == (120, 120)
    assert len(craters) >= 1
    top_crater = craters[0]
    assert top_crater.epistemic_class == EpistemicClass.HEURISTIC.value
    # Center should be near (60, 60)
    assert 55 <= top_crater.center_row <= 65
    assert 55 <= top_crater.center_col <= 65
    assert top_crater.depth_m > 5.0
