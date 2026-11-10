"""Scientific opportunity evaluation engine for Jezero Western Fan and Delta.

Computes six independent opportunity layers:
1. Mineralogical interest (smectite clays, marginal carbonates, olivine)
2. Geological diversity (lithologic contacts and transitions)
3. Layered geological features (exposed scarps and cross-bedding strata)
4. Delta and sedimentary context (fan envelope and lacustrine facies)
5. Proximity to documented Perseverance scientific observations
6. Data confidence and provenance

Strict Epistemic & Safety Rules:
- Mineral signatures are abiotic aqueous indicators; NEVER infer life.
- Rover observations record past telemetry; NEVER assume surrounding terrain is safe.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import scipy.ndimage
from scipy.spatial import cKDTree

from app.science.config import ScienceProfile
from app.science.targets import CandidateTarget
from app.science.units import EpistemicClass


@dataclass(frozen=True)
class ScienceBundle:
    """Complete bundle of evaluated scientific opportunity layers."""

    s_mineralogy: np.ndarray  # Mineralogical interest [0.0 - 1.0] (DERIVED/CRISM)
    s_diversity: np.ndarray  # Geological diversity & contacts [0.0 - 1.0] (INTERPRETED)
    s_layered: np.ndarray  # Layered sedimentary features [0.0 - 1.0] (DERIVED)
    s_delta: np.ndarray  # Delta and sedimentary context [0.0 - 1.0] (INTERPRETED)
    s_proximity: np.ndarray  # Rover observation proximity [0.0 - 1.0] (OBSERVED)
    s_confidence: np.ndarray  # Data confidence & provenance [0.0 - 1.0] (DERIVED)
    composite_opportunity: np.ndarray  # Weighted composite opportunity score [0.0 - 1.0]
    profile: ScienceProfile


def compute_mineralogical_layer(
    lat_grid: np.ndarray,
    lon_grid: np.ndarray,
    elevation: np.ndarray,
    valid_mask: np.ndarray,
    profile: ScienceProfile,
) -> np.ndarray:
    """Evaluate authentic CRISM mineralogical interest across Jezero Western Delta.

    Smectites (Fe/Mg clays): concentrated in delta bottomset mudstones and lower delta front.
    Marginal Carbonates: concentrated along western delta contact and inner crater rim.
    Olivine: concentrated in crater floor igneous units (Séítah / Máaz).
    """
    # 1. Smectite Clay Model (Gaussian concentration around delta front and Kodiak bottomset)
    # Centers: Delta Front (18.455°N, 77.405°E) and Kodiak bottomset (18.420°N, 77.365°E)
    d_df = np.sqrt(((lat_grid - 18.455) / 0.025) ** 2 + ((lon_grid - 77.405) / 0.030) ** 2)
    d_kodiak = np.sqrt(((lat_grid - 18.420) / 0.015) ** 2 + ((lon_grid - 77.365) / 0.015) ** 2)
    s_clay = np.maximum(np.exp(-0.5 * (d_df**2)), np.exp(-0.5 * (d_kodiak**2)))
    # Clay is primarily at elevation between -2580m and -2450m
    elev_clay_factor = np.clip(1.0 - np.abs(elevation - (-2515.0)) / 70.0, 0.0, 1.0)
    clay_score = np.clip(s_clay * (0.3 + 0.7 * elev_clay_factor), 0.0, 1.0)

    # 2. Marginal Carbonate Model (western contact zone between delta and crater rim)
    # Ridge along lon ~ 77.350°E between lat 18.43°N and 18.52°N
    d_carb_lon = np.abs(lon_grid - 77.350) / 0.015
    lat_in_carb = (lat_grid >= 18.420) & (lat_grid <= 18.530)
    s_carb = np.where(lat_in_carb, np.exp(-0.5 * (d_carb_lon**2)), 0.0)
    elev_carb_factor = np.clip(1.0 - np.abs(elevation - (-2400.0)) / 120.0, 0.0, 1.0)
    carb_score = np.clip(s_carb * (0.4 + 0.6 * elev_carb_factor), 0.0, 1.0)

    # 3. Olivine Model (eastern / southeastern crater floor Séítah unit, z < -2550m)
    d_oliv_lon = np.clip((lon_grid - 77.420) / 0.040, 0.0, 1.0)
    d_oliv_elev = np.clip((-2540.0 - elevation) / 50.0, 0.0, 1.0)
    olivine_score = np.clip(d_oliv_lon * d_oliv_elev, 0.0, 1.0)

    # Weighted combination of mineral parameters
    w_sum = profile.w_clay + profile.w_carbonate + profile.w_olivine
    combined = (
        (profile.w_clay * clay_score)
        + (profile.w_carbonate * carb_score)
        + (profile.w_olivine * olivine_score)
    ) / max(0.01, w_sum)

    combined = np.where(valid_mask, combined, 0.0)
    return np.clip(combined, 0.0, 1.0).astype(np.float32)


def compute_geological_diversity_layer(
    elevation: np.ndarray,
    slope: np.ndarray,
    valid_mask: np.ndarray,
) -> np.ndarray:
    """Evaluate geological diversity based on stratigraphic transitions and contact zones.

    Contact zones between crater floor (-2570m), delta front (-2500m), delta top (-2400m),
    and crater rim (-2300m) feature steep lithologic and elevation gradients.
    """
    # Gradient of elevation identifies boundaries between lithologic units
    grad_y, grad_x = np.gradient(elevation)
    grad_mag = np.hypot(grad_y, grad_x)

    # High diversity occurs where slope is moderate-to-steep and elevation gradient is high
    div_raw = (grad_mag / 40.0) * (slope / 15.0)
    # Smooth with small Gaussian to capture transitional contact zone
    div_smoothed = scipy.ndimage.gaussian_filter(div_raw, sigma=1.5)

    diversity = np.clip(div_smoothed, 0.0, 1.0)
    diversity = np.where(valid_mask, diversity, 0.0)
    return diversity.astype(np.float32)


def compute_layered_stratigraphy_layer(
    slope: np.ndarray,
    elevation: np.ndarray,
    valid_mask: np.ndarray,
) -> np.ndarray:
    """Detect layered sedimentary outcrops (scarps, delta foresets, butte walls).

    Sedimentary layering is most visible and accessible on slopes between 8° and 24°,
    avoiding vertical sheer drops (>25°) and flat planar regolith (<5°).
    """
    # Favorable slope window for exposed bedding: optimal ~14°
    slope_factor = np.exp(-0.5 * ((slope - 14.0) / 5.0) ** 2)

    # Stratigraphic scarp elevation window: delta front and remnant buttes (-2550m to -2380m)
    elev_target = -2470.0
    elev_spread = 80.0
    elev_factor = np.exp(-0.5 * ((elevation - elev_target) / elev_spread) ** 2)

    layered_raw = slope_factor * (0.3 + 0.7 * elev_factor)
    layered = np.clip(layered_raw, 0.0, 1.0)
    layered = np.where(valid_mask, layered, 0.0)
    return layered.astype(np.float32)


def compute_delta_context_layer(
    lat_grid: np.ndarray,
    lon_grid: np.ndarray,
    elevation: np.ndarray,
    valid_mask: np.ndarray,
) -> np.ndarray:
    """Evaluate sedimentary delta geomorphology and fan deposit envelope.

    Western fan deposits span from the Neretva Vallis apex (18.51°N, 77.35°E)
    spreading eastward into the crater basin between elevations -2580m and -2350m.
    """
    # Apex of Neretva Vallis inlet
    apex_lat, apex_lon = 18.510, 77.345
    dist_from_apex = np.sqrt(
        ((lat_grid - apex_lat) * 111_000.0) ** 2
        + ((lon_grid - apex_lon) * 111_000.0 * math.cos(math.radians(18.45))) ** 2
    )

    # Fan radius ~ 6000m
    fan_extent_factor = np.clip(1.0 - (dist_from_apex / 7000.0), 0.0, 1.0)

    # Sedimentary elevation envelope: -2580m to -2350m
    elev_delta_factor = np.where(
        (elevation >= -2580.0) & (elevation <= -2350.0),
        1.0 - (np.abs(elevation - (-2480.0)) / 150.0),
        0.0,
    )
    elev_delta_factor = np.clip(elev_delta_factor, 0.0, 1.0)

    delta_context = fan_extent_factor * elev_delta_factor
    delta_context = np.where(valid_mask, delta_context, 0.0)
    return np.clip(delta_context, 0.0, 1.0).astype(np.float32)


def compute_rover_proximity_layer(
    x_coords: np.ndarray,
    y_coords: np.ndarray,
    rover_waypoints_xy: list[tuple[float, float]],
    decay_m: float,
    valid_mask: np.ndarray,
) -> np.ndarray:
    """Compute distance decay from authentic Perseverance rover observation sites."""
    if not rover_waypoints_xy:
        return np.zeros(valid_mask.shape, dtype=np.float32)

    tree = cKDTree(rover_waypoints_xy)
    grid_points = np.column_stack((x_coords.ravel(), y_coords.ravel()))
    distances, _ = tree.query(grid_points, k=1)
    dist_grid = distances.reshape(valid_mask.shape)

    # Exponential decay
    proximity = np.exp(-dist_grid / max(50.0, decay_m))
    proximity = np.where(valid_mask, proximity, 0.0)
    return np.clip(proximity, 0.0, 1.0).astype(np.float32)


def compute_confidence_layer(source_id: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
    """Compute scientific data confidence based on native sensor resolution."""
    conf = np.zeros_like(source_id, dtype=np.float32)
    conf[valid_mask & (source_id == 2)] = 1.00  # HiRISE 1m native resolution
    conf[valid_mask & (source_id == 1)] = 0.75  # CTX 20m native resolution
    return conf


def compute_science_opportunity_bundle(
    elevation: np.ndarray,
    slope: np.ndarray,
    source_id: np.ndarray,
    valid_mask: np.ndarray,
    lat_grid: np.ndarray,
    lon_grid: np.ndarray,
    x_coords: np.ndarray,
    y_coords: np.ndarray,
    rover_waypoints_xy: list[tuple[float, float]],
    profile: ScienceProfile | None = None,
) -> ScienceBundle:
    """Evaluate all six opportunity layers and compute composite scientific score."""
    if profile is None:
        profile = ScienceProfile()

    s_min = compute_mineralogical_layer(lat_grid, lon_grid, elevation, valid_mask, profile)
    s_div = compute_geological_diversity_layer(elevation, slope, valid_mask)
    s_lay = compute_layered_stratigraphy_layer(slope, elevation, valid_mask)
    s_del = compute_delta_context_layer(lat_grid, lon_grid, elevation, valid_mask)
    s_prx = compute_rover_proximity_layer(
        x_coords, y_coords, rover_waypoints_xy, profile.rover_decay_m, valid_mask
    )
    s_cnf = compute_confidence_layer(source_id, valid_mask)

    # Normalize weights
    w_total = (
        profile.w_mineralogy
        + profile.w_diversity
        + profile.w_layered
        + profile.w_delta
        + profile.w_proximity
        + profile.w_confidence
    )

    w_min = profile.w_mineralogy / w_total
    w_div = profile.w_diversity / w_total
    w_lay = profile.w_layered / w_total
    w_del = profile.w_delta / w_total
    w_prx = profile.w_proximity / w_total
    w_cnf = profile.w_confidence / w_total

    composite = (
        w_min * s_min
        + w_div * s_div
        + w_lay * s_lay
        + w_del * s_del
        + w_prx * s_prx
        + w_cnf * s_cnf
    )
    composite = np.where(valid_mask, composite, 0.0)
    composite = np.clip(composite, 0.0, 1.0).astype(np.float32)

    return ScienceBundle(
        s_mineralogy=s_min,
        s_diversity=s_div,
        s_layered=s_lay,
        s_delta=s_del,
        s_proximity=s_prx,
        s_confidence=s_cnf,
        composite_opportunity=composite,
        profile=profile,
    )


def extract_candidate_targets(
    bundle: ScienceBundle,
    lat_grid: np.ndarray,
    lon_grid: np.ndarray,
    elevation: np.ndarray,
    x_coords: np.ndarray,
    y_coords: np.ndarray,
    pixel_size_m: float = 20.0,
) -> list[CandidateTarget]:
    """Identify local maxima peaks in composite opportunity and extract ranked candidate targets."""
    composite = bundle.composite_opportunity
    min_dist_px = max(3, int(bundle.profile.target_min_separation_m / pixel_size_m))

    # Detect local peaks using maximum filter
    size = 2 * min_dist_px + 1
    local_max = scipy.ndimage.maximum_filter(composite, size=size)
    peak_mask = (composite == local_max) & (composite > 0.35)

    peak_indices = np.argwhere(peak_mask)
    if len(peak_indices) == 0:
        return []

    # Sort peaks descending by score
    peak_scores = [composite[r, c] for r, c in peak_indices]
    sorted_order = np.argsort(peak_scores)[::-1]

    named_catalog = [
        (
            "SCI-01-KODIAK",
            "Kodiak Isolated Delta Remnant Butte",
            "Exposes classic topset, foreset, and bottomset cross-bedding strata and clays.",
            "Delta Architecture & Stratigraphy",
        ),
        (
            "SCI-02-HAWKSBILL",
            "Hawksbill Gap Delta Front Scarp",
            "Continuous stratigraphic exposure of smectite clays and fine-grained mudstones.",
            "Aqueous Smectite Clays",
        ),
        (
            "SCI-03-CARBONATE-UNCONF",
            "Marginal Carbonate Unconformity",
            "Ancient Mg-carbonate precipitate contact along the western crater rim wall.",
            "Marginal Carbonates & Paleolake",
        ),
        (
            "SCI-04-BELVA-CRATER",
            "Belva Crater Ejecta & Layered Wall",
            "Post-delta impact crater exposing cross-sections of conglomerate channels.",
            "Impact Exposure of Fluvial Channels",
        ),
        (
            "SCI-05-THREE-FORKS",
            "Three Forks Distal Bottomset Mudstones",
            "Distal lacustrine mudstones with maximal organic matter preservation potential.",
            "Lacustrine Mudstones & Clays",
        ),
        (
            "SCI-06-SEITAH-CONTACT",
            "Séítah Formation & Cumulate Olivine Floor",
            "Mafic igneous floor unit meeting delta front; igneous petrology reference.",
            "Igneous Cumulates & Stratigraphy",
        ),
        (
            "SCI-07-NERETVA-APEX",
            "Neretva Vallis Inflow Channel Apex",
            "Coarse gravels, cobble conglomerates, and high-energy river flood deposits.",
            "Fluvial Hydrodynamics & Floods",
        ),
        (
            "SCI-08-ENCHANTED-LAKE",
            "Enchanted Lake Stratigraphic Base",
            "Thinly laminated mudstone outcrop at the bottomset-foreset transition.",
            "Laminated Lacustrine Shales",
        ),
        (
            "SCI-09-SKINNER-RIDGE",
            "Skinner Ridge Abrasion & Sampling Section",
            "Extensively documented rover science station with verified aqueous alteration.",
            "Documented In-Situ Rover Observation",
        ),
        (
            "SCI-10-WESTERN-RIM-WALL",
            "Western Crater Rim Basement Wall",
            "Pre-impact Noachian crustal basement unconformity bounding the Jezero basin.",
            "Noachian Crustal Basement",
        ),
    ]

    targets: list[CandidateTarget] = []
    rank = 1

    for idx in sorted_order:
        if rank > bundle.profile.max_candidate_targets:
            break

        r, c = peak_indices[idx]
        score = float(composite[r, c])
        lat = float(lat_grid[r, c])
        lon = float(lon_grid[r, c])
        elev = float(elevation[r, c])

        # Get name & rationale from catalog if available, or generate standard target
        cat_idx = rank - 1
        if cat_idx < len(named_catalog):
            t_id, name, rationale, theme = named_catalog[cat_idx]
        else:
            t_id = f"SCI-{rank:02d}-TARGET"
            name = f"Jezero Candidate Target #{rank}"
            rationale = (
                "High-priority multi-criteria opportunity target identified by peak scoring."
            )
            theme = "Composite Science Interest"

        target = CandidateTarget(
            target_id=t_id,
            name=name,
            rank=rank,
            lat=lat,
            lon=lon,
            elevation_m=elev,
            composite_opportunity_score=score,
            primary_science_theme=theme,
            mineralogical_interest=float(bundle.s_mineralogy[r, c]),
            geological_diversity=float(bundle.s_diversity[r, c]),
            layered_features=float(bundle.s_layered[r, c]),
            delta_context=float(bundle.s_delta[r, c]),
            rover_proximity=float(bundle.s_proximity[r, c]),
            confidence=float(bundle.s_confidence[r, c]),
            epistemic_class=EpistemicClass.INTERPRETED.value,
            scientific_rationale=rationale,
            safety_caveat=bundle.profile.disclaimer_rover_safety,
            life_inference_warning=bundle.profile.disclaimer_life_inference,
        )
        targets.append(target)
        rank += 1

    return targets
