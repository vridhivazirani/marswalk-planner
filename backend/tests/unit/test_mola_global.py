"""Unit tests for the MOLA global elevation engine and multi-scale topography sampling.

Verifies:
1. Authentic MOLA 4 ppd grid loading from data/raw/mola/megt90n000cb.img.
2. Bilinear interpolation accuracy and polar clamping.
3. Longitude wrapping between [-180, 180) and [0, 360).
4. Major planetary elevation benchmarks (Olympus Mons, Hellas Basin, Jezero Crater).
5. Seamless multi-scale elevation handover (Local 1m HiRISE, Regional 20m CTX, Global MOLA).
"""

from __future__ import annotations

import pytest

from app.terrain.mola_global import (
    MOLA_GRID_PATH,
    get_mola_grid,
    sample_mola_elevation,
    sample_multiscale_elevation,
)


def test_mola_grid_file_exists_and_loads():
    """Verify authentic NASA PDS MGS MOLA 4 ppd grid file exists and loads."""
    assert MOLA_GRID_PATH.exists(), f"MOLA grid file {MOLA_GRID_PATH} missing"
    grid = get_mola_grid()
    assert grid.shape == (720, 1440)
    assert grid.dtype == ">i2" or grid.dtype == "int16"
    assert -9000 < int(grid.min()) < -7000
    assert 20000 < int(grid.max()) < 22000


def test_mola_elevation_sampling_landmarks():
    """Verify elevation sampling at canonical Martian topographic benchmarks."""
    # Olympus Mons summit: ~21.2 km MOLA datum
    elev_olympus = sample_mola_elevation(18.65, -133.80)
    assert elev_olympus > 19000.0, f"Olympus Mons elevation too low: {elev_olympus} m"

    # Ascraeus Mons summit: ~18.2 km MOLA datum
    elev_ascraeus = sample_mola_elevation(11.92, -104.08)
    assert elev_ascraeus > 17000.0, f"Ascraeus Mons elevation too low: {elev_ascraeus} m"

    # Hellas Planitia floor: ~ -7.1 km MOLA datum
    elev_hellas = sample_mola_elevation(-42.70, 70.00)
    assert elev_hellas < -6000.0, f"Hellas Basin elevation too high: {elev_hellas} m"

    # Jezero Crater regional basin: ~ -2.5 km MOLA datum
    elev_jezero = sample_mola_elevation(18.44, 77.45)
    assert -2700.0 < elev_jezero < -2300.0, f"Jezero elevation out of range: {elev_jezero} m"


def test_mola_longitude_wrapping():
    """Verify elevation is consistent across negative vs positive longitude representations."""
    # Olympus Mons at -133.80° E should equal 226.20° E
    elev_neg = sample_mola_elevation(18.65, -133.80)
    elev_pos = sample_mola_elevation(18.65, 226.20)
    assert pytest.approx(elev_neg, abs=0.5) == elev_pos

    # Prime Meridian wrap-around at 0° vs 360°
    elev_0 = sample_mola_elevation(0.0, 0.0)
    elev_360 = sample_mola_elevation(0.0, 360.0)
    assert pytest.approx(elev_0, abs=0.1) == elev_360


def test_mola_polar_clamping():
    """Verify polar clamping behaves gracefully without out-of-bounds errors."""
    elev_north_pole = sample_mola_elevation(90.0, 0.0)
    assert isinstance(elev_north_pole, float)

    elev_south_pole = sample_mola_elevation(-90.0, 0.0)
    assert isinstance(elev_south_pole, float)

    # Clamping beyond [-90, 90]
    elev_over_north = sample_mola_elevation(95.0, 0.0)
    assert elev_over_north == elev_north_pole


def test_multiscale_elevation_handover():
    """Verify multi-scale elevation automatically transitions between Local, Regional, Global."""
    # 1. Inside Jezero Delta fan -> Local 1.0m HiRISE
    loc = sample_multiscale_elevation(18.4485, 77.4320)
    assert loc["scale_tier"] == "LOCAL"
    assert loc["resolution_m"] == 1.0
    assert loc["canonical_id"] == "PLN-SRC-08"
    assert -2650.0 < loc["elevation_m"] < -2400.0

    # 2. Inside Jezero Crater basin outside delta -> Regional 20.0m CTX
    reg = sample_multiscale_elevation(18.6800, 77.2000)
    assert reg["scale_tier"] == "REGIONAL"
    assert reg["resolution_m"] == 20.0
    assert reg["canonical_id"] == "PLN-SRC-06"
    assert -2200.0 < reg["elevation_m"] < -1800.0

    # 3. Outside Jezero entirely -> Global MOLA
    glo = sample_multiscale_elevation(18.65, -133.80)
    assert glo["scale_tier"] == "GLOBAL"
    assert glo["resolution_m"] == 14800.0
    assert glo["canonical_id"] == "PLN-SRC-01"
    assert glo["elevation_m"] > 19000.0
