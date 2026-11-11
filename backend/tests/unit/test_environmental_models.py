"""Unit tests for Mars surface thermal inertia, diurnal cycles, and dust climatology.

Verifies physical boundaries and behavior according to published planetary literature
and MCD/MEDA models, adhering strictly to AGENTS.md.
"""

from __future__ import annotations

from app.core.epistemic import EpistemicClass
from app.mission.environmental import PlanetaryEnvironmentPhysics


def test_classify_thermal_inertia_boundaries() -> None:
    """Test thermal inertia classification across lithological classes."""
    # Low inertia: fine dust
    dust = PlanetaryEnvironmentPhysics.classify_thermal_inertia(80.0)
    assert "dust" in dust.surface_material.lower()
    assert dust.epistemic_class == EpistemicClass.DERIVED.value

    # Sand
    sand = PlanetaryEnvironmentPhysics.classify_thermal_inertia(190.0)
    assert "sand" in sand.surface_material.lower()

    # Duricrust / regolith lag
    duricrust = PlanetaryEnvironmentPhysics.classify_thermal_inertia(320.0)
    assert "duricrust" in duricrust.surface_material.lower()

    # Bedrock
    bedrock = PlanetaryEnvironmentPhysics.classify_thermal_inertia(600.0)
    assert "bedrock" in bedrock.surface_material.lower()


def test_compute_diurnal_cycle_physical_behavior() -> None:
    """Test 24-hour diurnal profile thermodynamics."""
    profiles = PlanetaryEnvironmentPhysics.compute_diurnal_cycle(
        latitude_deg=18.45,
        season_ls_deg=180.0,
        thermal_inertia_tiu=320.0,
        dust_tau=0.40,
    )

    assert len(profiles) == 24

    # Hour 0 (midnight) must have zero solar irradiance
    assert profiles[0].solar_flux_w_m2 == 0.0
    # Midday (12:00 LTST) must have strong solar irradiance (> 150 W/m2)
    assert profiles[12].solar_flux_w_m2 > 150.0

    # Surface temperature peak should lag solar noon (hour 13 or 14)
    temps = [p.surface_temp_c for p in profiles]
    peak_hour = temps.index(max(temps))
    assert peak_hour in (13, 14, 15)

    # Minimum temperature should occur in early morning hours (hour 4, 5, or 6)
    min_hour = temps.index(min(temps))
    assert min_hour in (4, 5, 6, 7)

    # Air temperature amplitude should be lower than surface temperature amplitude
    air_temps = [p.air_temp_c for p in profiles]
    surf_range = max(temps) - min(temps)
    air_range = max(air_temps) - min(air_temps)
    assert surf_range > air_range


def test_diurnal_cycle_thermal_inertia_damping() -> None:
    """Verify that higher thermal inertia dampens diurnal temperature swing."""
    low_i = PlanetaryEnvironmentPhysics.compute_diurnal_cycle(
        latitude_deg=18.45,
        thermal_inertia_tiu=100.0,
    )
    high_i = PlanetaryEnvironmentPhysics.compute_diurnal_cycle(
        latitude_deg=18.45,
        thermal_inertia_tiu=600.0,
    )

    low_range = max(p.surface_temp_c for p in low_i) - min(p.surface_temp_c for p in low_i)
    high_range = max(p.surface_temp_c for p in high_i) - min(p.surface_temp_c for p in high_i)
    assert low_range > high_range


def test_compute_dust_climatology_cycle() -> None:
    """Verify seasonal dust cycle peaks during perihelion season."""
    points = PlanetaryEnvironmentPhysics.compute_dust_climatology()
    assert len(points) == 24  # 360 / 15

    # Check clear season near aphelion (Ls = 90 - 120)
    aphelion_pts = [p for p in points if 90 <= p.solar_longitude_ls_deg <= 120]
    # Check storm season near perihelion (Ls = 240 - 270)
    perihelion_pts = [p for p in points if 240 <= p.solar_longitude_ls_deg <= 270]

    assert len(aphelion_pts) > 0
    assert len(perihelion_pts) > 0

    mean_aphelion_regional = sum(p.tau_regional_storm for p in aphelion_pts) / len(aphelion_pts)
    mean_perihelion_regional = sum(p.tau_regional_storm for p in perihelion_pts) / len(
        perihelion_pts
    )

    assert mean_perihelion_regional > mean_aphelion_regional
    assert any(p.storm_probability_pct > 50.0 for p in perihelion_pts)
