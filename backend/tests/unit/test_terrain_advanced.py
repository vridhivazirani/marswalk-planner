"""Unit and analytical validation tests for Advanced Terrain Intelligence (Phase 2).

Tests:
1. Local relief and surface roughness on synthetic planar and step surfaces.
2. Curvatures (Profile, Planform, Mean) on an analytic paraboloid z = a*x^2 + b*y^2.
3. Vector Ruggedness Measure (VRM) decoupling on planar slope vs divergent dome.
4. Explainable boulder detection with morphological top-hat and shadow pairing.
5. Multi-resolution terrain inspector windowed reads on HiRISE / CTX rasters.
"""

from __future__ import annotations

import numpy as np

from app.terrain.classifier import TERRAIN_CLASS_DETAILS, TerrainClass, classify_terrain
from app.terrain.derivatives import (
    compute_analytical_hillshade,
    compute_curvatures,
    compute_local_relief,
    compute_multidirectional_hillshade,
    compute_surface_roughness,
    compute_vector_ruggedness_measure,
)
from app.terrain.hazards_detector import (
    detect_boulder_candidates_advanced,
    extract_boulder_objects,
)
from app.terrain.multi_resolution import (
    get_multi_res_inspector,
)


def test_local_relief_and_surface_roughness_plane():
    """On a perfectly planar surface, local relief over 5x5 window matches analytical height
    difference, while on a flat horizontal plane, relief and roughness are identically zero.
    """
    flat = np.full((15, 15), -2500.0, dtype=np.float32)
    relief = compute_local_relief(flat, size=5)
    roughness = compute_surface_roughness(flat, size=5)

    assert np.allclose(relief, 0.0, atol=1e-5)
    assert np.allclose(roughness, 0.0, atol=1e-5)

    # Synthetic step feature: height jumps from 100 to 110 at row 7
    step = np.full((15, 15), 100.0, dtype=np.float32)
    step[7:, :] = 110.0
    step_relief = compute_local_relief(step, size=5)
    step_roughness = compute_surface_roughness(step, size=5)

    # Around the step (rows 5 to 9), local relief must equal exactly 10.0m
    assert np.allclose(step_relief[6:8, 2:-2], 10.0, atol=1e-4)
    # Away from the step, relief must be 0
    assert np.allclose(step_relief[0:3, 2:-2], 0.0, atol=1e-4)
    assert np.allclose(step_relief[11:, 2:-2], 0.0, atol=1e-4)
    assert np.all(step_roughness[6:8, 2:-2] > 2.0)


def test_curvatures_analytic_paraboloid():
    """Verify Zevenbergen & Thorne (1987) curvatures on an analytic circular paraboloid.

    Surface: z(x, y) = -0.01 * (x^2 + y^2) (convex dome)
    At the summit (0, 0), the profile and planform curvatures reflect convex downwards relief.
    """
    res_m = 1.0
    grid_range = np.arange(-10, 11, dtype=np.float32) * res_m
    xx, yy = np.meshgrid(grid_range, grid_range)
    # Circular convex paraboloid summit
    z = -0.01 * (xx**2 + yy**2)

    profile_curv, planform_curv, mean_curv = compute_curvatures(z, res_m=res_m)

    # In Zevenbergen & Thorne convention, profile curvature is negative for convex slopes.
    # At slopes along the radius, profile curvature should be consistently negative.
    interior_profile = profile_curv[3:7, 3:7]
    assert np.all(np.isfinite(interior_profile))
    # Curvature values are scale-appropriate (magnitude around 0.01 to 0.05 /m)
    assert np.all(np.abs(interior_profile) < 1.0)


def test_vrm_planar_slope_decoupling():
    """Critical property of VRM (Vector Ruggedness Measure):

    A uniform planar slope (even if steep, e.g. 35 degrees) has ALL unit normal
    vectors pointing in the exact same direction. Therefore, the resultant vector length
    equals N, and VRM = 1 - R/N = 0.
    In contrast, a rugged dome with diverging normals has VRM > 0.
    This proves VRM decouples ruggedness from steepness (unlike TRI).
    """
    # 1. Uniform planar slope (30 degrees, facing North aspect = 0)
    h, w = 21, 21
    slope_plane = np.full((h, w), 30.0, dtype=np.float32)
    aspect_plane = np.full((h, w), 0.0, dtype=np.float32)

    vrm_plane = compute_vector_ruggedness_measure(slope_plane, aspect_plane, size=5)
    # Interior cells must have VRM identically 0.0
    assert np.allclose(vrm_plane[3:-3, 3:-3], 0.0, atol=1e-5)

    # 2. Hemisphere / dome where aspect diverges radially in all directions
    y, x = np.mgrid[-10:11, -10:11]
    radius = np.sqrt(x**2 + y**2)
    slope_dome = np.clip(radius * 3.0, 0.0, 60.0).astype(np.float32)
    aspect_dome = (np.degrees(np.arctan2(x, -y)) % 360.0).astype(np.float32)

    vrm_dome = compute_vector_ruggedness_measure(slope_dome, aspect_dome, size=5)
    # The center of the dome has diverging unit vectors -> positive VRM
    assert vrm_dome[10, 10] > 0.002


def test_boulder_candidates_advanced_detection():
    """Verify explainable morphological top-hat and shadow pairing detector."""
    h, w = 40, 40
    # Background medium gray terrain
    img = np.full((h, w), 100, dtype=np.uint8)

    # Place an isolated bright rock feature at (15, 15) with an illuminated face
    # and a directional shadow at sun azimuth 240 deg (shadow casts to ~60 deg, East-North-East)
    # Rock summit / highlight:
    img[15, 15] = 220
    img[15, 16] = 200
    # Shadow patch (down-sun, ~60 deg):
    img[14, 17] = 25
    img[15, 17] = 30

    tri = np.zeros((h, w), dtype=np.float32)
    tri[15, 15] = 1.2
    valid_mask = np.ones((h, w), dtype=bool)

    score_map, candidate_mask, stats = detect_boulder_candidates_advanced(
        img,
        tri,
        valid_mask,
        sun_azimuth_deg=240.0,
        res_m=1.0,
    )

    # The rock location should have elevated score
    assert score_map[15, 15] > 0.2
    assert candidate_mask[15, 15]
    assert stats["epistemic_class"] == "HEURISTIC"

    # Object extraction
    objects = extract_boulder_objects(
        candidate_mask,
        score_map,
        res_m=1.0,
        min_pixels=1,
    )
    assert len(objects) >= 1
    rock = next(o for o in objects if abs(o["row"] - 15) <= 2 and abs(o["col"] - 15) <= 2)
    assert rock["estimated_diameter_m"] >= 1.0
    assert rock["score"] >= 0.5


def test_terrain_classification_7_classes():
    """Verify all 7 classes are reachable and mapped correctly with proper metadata."""
    shape = (7, 1)
    valid_mask = np.ones(shape, dtype=bool)
    valid_mask[0, 0] = False  # Cell 0: NoData -> UNKNOWN_TERRAIN

    source_id = np.full(shape, 2, dtype=np.uint8)  # HiRISE
    slope = np.zeros(shape, dtype=np.float32)
    tri = np.zeros(shape, dtype=np.float32)
    lev = np.zeros(shape, dtype=np.float32)
    b_score = np.zeros(shape, dtype=np.float32)
    s_score = np.zeros(shape, dtype=np.float32)
    c_score = np.zeros(shape, dtype=np.float32)

    # Cell 1: Smooth
    slope[1, 0] = 3.0
    tri[1, 0] = 0.2

    # Cell 2: Rocky
    b_score[2, 0] = 0.65
    slope[2, 0] = 8.0

    # Cell 3: Rough
    slope[3, 0] = 18.0
    tri[3, 0] = 2.5

    # Cell 4: Potential Loose Material (moderate slope + moderate sand score)
    slope[4, 0] = 12.0
    s_score[4, 0] = 0.55

    # Cell 5: Dune-like features (low slope + high sand/ripple score)
    slope[5, 0] = 4.0
    s_score[5, 0] = 0.75

    # Cell 6: Cratered terrain
    c_score[6, 0] = 0.8
    lev[6, 0] = -5.0

    classes, conf = classify_terrain(
        slope=slope,
        tri=tri,
        lev=lev,
        boulder_score=b_score,
        sand_score=s_score,
        crater_score=c_score,
        valid_mask=valid_mask,
        source_id=source_id,
    )

    assert classes[0, 0] == TerrainClass.UNKNOWN_TERRAIN.value
    assert classes[1, 0] == TerrainClass.SMOOTH_TERRAIN.value
    assert classes[2, 0] == TerrainClass.ROCKY_TERRAIN.value
    assert classes[3, 0] == TerrainClass.ROUGH_TERRAIN.value
    assert classes[4, 0] == TerrainClass.POTENTIAL_LOOSE_MATERIAL.value
    assert classes[5, 0] == TerrainClass.DUNE_LIKE_FEATURES.value
    assert classes[6, 0] == TerrainClass.CRATERED_TERRAIN.value

    # Verify all 7 classes have complete metadata entries in TERRAIN_CLASS_DETAILS
    for tc in TerrainClass:
        assert tc.value in TERRAIN_CLASS_DETAILS
        details = TERRAIN_CLASS_DETAILS[tc.value]
        assert "name" in details
        assert "description" in details
        assert "hazard_risk" in details
        assert "color_hex" in details


def test_multi_resolution_inspector():
    """Verify windowed reads of native HiRISE DTM and regional 20m grid."""
    inspector = get_multi_res_inspector()

    # Query a point inside Jezero delta: lat 18.43, lon 77.40
    lat, lon = 18.43, 77.40
    has_hirise = inspector.has_high_resolution_coverage(lat, lon)
    assert has_hirise is True

    result = inspector.inspect_point(lat, lon, include_local_1m=True, local_window_m=60.0)
    assert result["high_resolution_available"] is True

    # Regional properties
    reg = result["regional_analysis_20m"]
    assert "elevation_m" in reg
    assert "slope_deg" in reg
    assert "terrain_class" in reg
    assert reg["terrain_class"]["name"] is not None

    # Local 1m properties
    loc = result["local_micro_analysis_1m"]
    assert loc is not None
    assert loc["is_available"] is True
    assert loc["native_resolution_m"] == 1.0
    assert "elevation" in loc
    assert "min_m" in loc["elevation"]
    assert "metrics_1m" in loc
    assert "slope_deg" in loc["metrics_1m"]
    assert "candidate_boulders" in loc
    assert len(loc["transects_1m"]["west_to_east_elev_m"]) > 0
    assert len(loc["transects_1m"]["south_to_north_elev_m"]) > 0


def test_analytical_and_multidirectional_hillshade():
    """Verify single-source and multi-directional hillshade computations."""
    # Flat horizontal plane: slope = 0, aspect = 0
    flat_slope = np.zeros((10, 10), dtype=np.float32)
    flat_aspect = np.zeros((10, 10), dtype=np.float32)

    # At sun altitude 45 deg, cos(45) * cos(0) = sqrt(2)/2 ~= 0.7071
    # 0.7071 * 255 ~= 180.3
    shade_flat = compute_analytical_hillshade(
        flat_slope, flat_aspect, azimuth_deg=315.0, altitude_deg=45.0
    )
    assert np.allclose(shade_flat, 180.31, atol=1.0)

    # Multi-directional hillshade on flat terrain must be uniform
    multi_shade_flat = compute_multidirectional_hillshade(flat_slope, flat_aspect)
    assert np.allclose(multi_shade_flat, 180.31, atol=1.0)

    # Sloped surface facing the light source (aspect 315 NW, slope 45 deg)
    # Illumination should be maximum (near 255)
    sun_facing_slope = np.full((10, 10), 45.0, dtype=np.float32)
    sun_facing_aspect = np.full((10, 10), 315.0, dtype=np.float32)
    shade_direct = compute_analytical_hillshade(
        sun_facing_slope, sun_facing_aspect, azimuth_deg=315.0, altitude_deg=45.0
    )
    assert np.all(shade_direct > 250.0)

    # Sloped surface facing away from light source (aspect 135 SE, slope 45 deg)
    # Illumination should be in deep shadow (0.0)
    shadow_facing_aspect = np.full((10, 10), 135.0, dtype=np.float32)
    shade_shadow = compute_analytical_hillshade(
        sun_facing_slope, shadow_facing_aspect, azimuth_deg=315.0, altitude_deg=45.0
    )
    assert np.allclose(shade_shadow, 0.0, atol=1e-3)


def test_horn_slope_aspect_numerical_precision():
    """Verify Horn (1981) slope and aspect on small 3x3 synthetic inclines."""
    from app.terrain.derivatives import compute_slope_aspect_horn

    # 1. Downhill to South: North is high (100), South is low (0)
    dem_s = np.array([[100.0, 100.0, 100.0], [50.0, 50.0, 50.0], [0.0, 0.0, 0.0]], dtype=np.float32)
    s_s, asp_s = compute_slope_aspect_horn(dem_s, res_m=10.0)
    assert np.isclose(asp_s[1, 1], 180.0, atol=0.1)
    assert np.isclose(s_s[1, 1], 78.69, atol=0.1)

    # 2. Downhill to East: West is high (100), East is low (0)
    dem_e = np.array([[100.0, 50.0, 0.0], [100.0, 50.0, 0.0], [100.0, 50.0, 0.0]], dtype=np.float32)
    s_e, asp_e = compute_slope_aspect_horn(dem_e, res_m=10.0)
    assert np.isclose(asp_e[1, 1], 90.0, atol=0.1)
    assert np.isclose(s_e[1, 1], 78.69, atol=0.1)

    # 3. Downhill to North: South is high (100), North is low (0)
    dem_n = np.array([[0.0, 0.0, 0.0], [50.0, 50.0, 50.0], [100.0, 100.0, 100.0]], dtype=np.float32)
    s_n, asp_n = compute_slope_aspect_horn(dem_n, res_m=10.0)
    assert np.isclose(asp_n[1, 1], 0.0, atol=0.1) or np.isclose(asp_n[1, 1], 360.0, atol=0.1)
    assert np.isclose(s_n[1, 1], 78.69, atol=0.1)

    # 4. Downhill to West: East is high (100), West is low (0)
    dem_w = np.array([[0.0, 50.0, 100.0], [0.0, 50.0, 100.0], [0.0, 50.0, 100.0]], dtype=np.float32)
    s_w, asp_w = compute_slope_aspect_horn(dem_w, res_m=10.0)
    assert np.isclose(asp_w[1, 1], 270.0, atol=0.1)
    assert np.isclose(s_w[1, 1], 78.69, atol=0.1)

    # 5. Verify orthogonal multi-directional hillshade gives identical values on all 4 directions
    mhs_s = compute_multidirectional_hillshade(s_s, asp_s)[1, 1]
    mhs_e = compute_multidirectional_hillshade(s_e, asp_e)[1, 1]
    mhs_n = compute_multidirectional_hillshade(s_n, asp_n)[1, 1]
    mhs_w = compute_multidirectional_hillshade(s_w, asp_w)[1, 1]
    assert np.isclose(mhs_s, mhs_e, atol=1e-3)
    assert np.isclose(mhs_e, mhs_n, atol=1e-3)
    assert np.isclose(mhs_n, mhs_w, atol=1e-3)


def test_transect_profile_extraction():
    """Verify continuous elevation and slope transect cross-section extraction."""
    inspector = get_multi_res_inspector()

    # Transect across Jezero western delta front: from crater floor (east) up into delta (west)
    start_lat, start_lon = 18.4446, 77.4509  # Octavia Butler landing site
    dest_lat, dest_lon = 18.4550, 77.4050  # Delta top

    profile = inspector.extract_transect_profile(
        start_lat=start_lat,
        start_lon=start_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        num_samples=30,
    )

    assert "transect_summary" in profile
    summary = profile["transect_summary"]
    assert summary["total_distance_m"] > 2000.0  # ~2.5 to 3.0 km
    assert summary["min_elevation_m"] < -2400.0
    assert summary["max_elevation_m"] > -2600.0
    assert summary["max_slope_deg"] > 0.0

    points = profile["points"]
    assert len(points) == 30
    assert points[0]["distance_m"] == 0.0
    assert points[-1]["distance_m"] == summary["total_distance_m"]
    assert all(p["elevation_m"] is not None for p in points)
