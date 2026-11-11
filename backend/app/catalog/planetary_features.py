"""Authentic IAU planetary gazetteer nomenclature and historical Mars landing sites.

All coordinates use canonical planetocentric latitude and east-positive longitude
in [-180, 180) on the IAU 2015 Mars Sphere (R = 3,396,190 m) with elevations relative
to the Mars MOLA areoid datum.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.core.epistemic import EpistemicClass


class PlanetaryFeatureType(StrEnum):
    MONS = "Mons (Shield Volcano)"
    CHASMA = "Chasma (Canyon System)"
    PLANITIA = "Planitia (Lowland Basin)"
    CRATER = "Crater (Impact Feature)"
    TERRA = "Terra (Highland Terrain)"
    VALLES = "Valles (Outflow / River Valley)"


@dataclass(frozen=True)
class PlanetaryFeature:
    """An authentic planetary feature from the IAU Gazetteer of Planetary Nomenclature."""

    id: str
    name: str
    feature_type: PlanetaryFeatureType
    lat: float  # Planetocentric latitude [-90, 90]
    lon: float  # Planetocentric east-positive longitude [-180, 180)
    diameter_km: float
    elevation_areoid_m: float | None
    description: str
    epistemic_class: str = EpistemicClass.OBSERVED.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "feature_type": self.feature_type.value,
            "lat": self.lat,
            "lon": self.lon,
            "diameter_km": self.diameter_km,
            "elevation_areoid_m": self.elevation_areoid_m,
            "description": self.description,
            "epistemic_class": self.epistemic_class,
        }


@dataclass(frozen=True)
class MarsLandingSite:
    """An authentic historical or active Mars surface landing site."""

    id: str
    mission: str
    agency: str
    craft_name: str
    lat: float
    lon: float
    elevation_areoid_m: float
    landing_date: str
    status: str
    target_region: str
    description: str
    epistemic_class: str = EpistemicClass.OBSERVED.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "mission": self.mission,
            "agency": self.agency,
            "craft_name": self.craft_name,
            "lat": self.lat,
            "lon": self.lon,
            "elevation_areoid_m": self.elevation_areoid_m,
            "landing_date": self.landing_date,
            "status": self.status,
            "target_region": self.target_region,
            "description": self.description,
            "epistemic_class": self.epistemic_class,
        }


# -----------------------------------------------------------------------------
# AUTHENTIC IAU PLANETARY GAZETTEER FEATURES
# -----------------------------------------------------------------------------
PLANETARY_FEATURES: list[PlanetaryFeature] = [
    PlanetaryFeature(
        id="iau-feat-01",
        name="Olympus Mons",
        feature_type=PlanetaryFeatureType.MONS,
        lat=18.65,
        lon=-133.80,
        diameter_km=624.0,
        elevation_areoid_m=21287.0,
        description=(
            "Largest shield volcano in the solar system, towering ~21.3 km above "
            "the MOLA datum with a 600 km basal diameter."
        ),
    ),
    PlanetaryFeature(
        id="iau-feat-02",
        name="Ascraeus Mons",
        feature_type=PlanetaryFeatureType.MONS,
        lat=11.92,
        lon=-104.08,
        diameter_km=462.0,
        elevation_areoid_m=18225.0,
        description="Northernmost volcano of the Tharsis Montes chain.",
    ),
    PlanetaryFeature(
        id="iau-feat-03",
        name="Pavonis Mons",
        feature_type=PlanetaryFeatureType.MONS,
        lat=1.48,
        lon=-112.96,
        diameter_km=375.0,
        elevation_areoid_m=14058.0,
        description="Central Tharsis shield volcano situated near the Martian equator.",
    ),
    PlanetaryFeature(
        id="iau-feat-04",
        name="Arsia Mons",
        feature_type=PlanetaryFeatureType.MONS,
        lat=-8.35,
        lon=-121.09,
        diameter_km=435.0,
        elevation_areoid_m=17761.0,
        description="Southernmost Tharsis volcano with an expansive 110 km summit caldera.",
    ),
    PlanetaryFeature(
        id="iau-feat-05",
        name="Elysium Mons",
        feature_type=PlanetaryFeatureType.MONS,
        lat=25.02,
        lon=147.21,
        diameter_km=410.0,
        elevation_areoid_m=14127.0,
        description="Isolated volcanic province in the eastern hemisphere.",
    ),
    PlanetaryFeature(
        id="iau-feat-06",
        name="Valles Marineris",
        feature_type=PlanetaryFeatureType.CHASMA,
        lat=-13.80,
        lon=-59.20,
        diameter_km=4000.0,
        elevation_areoid_m=-7000.0,
        description=(
            "Grand canyon system of Mars extending over 4,000 km in length "
            "and reaching depths exceeding 7 km."
        ),
    ),
    PlanetaryFeature(
        id="iau-feat-07",
        name="Noctis Labyrinthus",
        feature_type=PlanetaryFeatureType.CHASMA,
        lat=-7.00,
        lon=-102.20,
        diameter_km=1200.0,
        elevation_areoid_m=1200.0,
        description="Complex network of intersecting grabens and collapsed fault valleys.",
    ),
    PlanetaryFeature(
        id="iau-feat-08",
        name="Hellas Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=-42.40,
        lon=70.50,
        diameter_km=2300.0,
        elevation_areoid_m=-7152.0,
        description=(
            "Deepest impact basin on Mars (~7.1 km below datum) and primary "
            "dust storm genesis region."
        ),
    ),
    PlanetaryFeature(
        id="iau-feat-09",
        name="Isidis Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=12.90,
        lon=87.00,
        diameter_km=1500.0,
        elevation_areoid_m=-3800.0,
        description="Giant ancient impact basin whose northwestern rim hosts Jezero Crater.",
    ),
    PlanetaryFeature(
        id="iau-feat-10",
        name="Argyre Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=-49.70,
        lon=-43.80,
        diameter_km=800.0,
        elevation_areoid_m=-5200.0,
        description="Southern highland multi-ring impact basin with glacial and fluvial deposits.",
    ),
    PlanetaryFeature(
        id="iau-feat-11",
        name="Utopia Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=45.60,
        lon=118.30,
        diameter_km=3300.0,
        elevation_areoid_m=-5000.0,
        description="Vast northern lowland plain hosting Viking 2 and Zhurong landing sites.",
    ),
    PlanetaryFeature(
        id="iau-feat-12",
        name="Jezero Crater",
        feature_type=PlanetaryFeatureType.CRATER,
        lat=18.44,
        lon=77.45,
        diameter_km=49.0,
        elevation_areoid_m=-2530.0,
        description=(
            "Primary Marswalk study area: ancient open-basin paleolake with well-preserved "
            "river delta deposits."
        ),
    ),
    PlanetaryFeature(
        id="iau-feat-13",
        name="Gale Crater",
        feature_type=PlanetaryFeatureType.CRATER,
        lat=-5.37,
        lon=137.44,
        diameter_km=154.0,
        elevation_areoid_m=-4450.0,
        description="Impact crater hosting Mount Sharp (Aeolis Mons) and MSL Curiosity rover.",
    ),
    PlanetaryFeature(
        id="iau-feat-14",
        name="Gusev Crater",
        feature_type=PlanetaryFeatureType.CRATER,
        lat=-14.57,
        lon=175.47,
        diameter_km=166.0,
        elevation_areoid_m=-1910.0,
        description="Ancient paleolake basin explored by the MER Spirit rover.",
    ),
    PlanetaryFeature(
        id="iau-feat-15",
        name="Neretva Vallis",
        feature_type=PlanetaryFeatureType.VALLES,
        lat=18.41,
        lon=77.38,
        diameter_km=85.0,
        elevation_areoid_m=-2480.0,
        description="Inflow valley canyon that breached the western rim of Jezero Crater.",
    ),
    PlanetaryFeature(
        id="iau-feat-16",
        name="Isidis Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=12.90,
        lon=87.00,
        diameter_km=1500.0,
        elevation_areoid_m=-3700.0,
        description="Massive impact basin adjacent to Jezero Crater; ancient sediment sink.",
    ),
    PlanetaryFeature(
        id="iau-feat-17",
        name="Argyre Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=-49.70,
        lon=-44.00,
        diameter_km=892.0,
        elevation_areoid_m=-5200.0,
        description="Deep southern impact basin preserving evidence of glacial processes.",
    ),
    PlanetaryFeature(
        id="iau-feat-18",
        name="Chryse Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=28.40,
        lon=-41.90,
        diameter_km=1600.0,
        elevation_areoid_m=-3800.0,
        description="Lowland convergence plain for catastrophic circum-Chryse outflow floods.",
    ),
    PlanetaryFeature(
        id="iau-feat-19",
        name="Alba Mons",
        feature_type=PlanetaryFeatureType.MONS,
        lat=40.50,
        lon=-109.90,
        diameter_km=680.0,
        elevation_areoid_m=6700.0,
        description="Vast, low-profile volcanic construct with the largest footprint on Mars.",
    ),
    PlanetaryFeature(
        id="iau-feat-20",
        name="Syrtis Major Planum",
        feature_type=PlanetaryFeatureType.TERRA,
        lat=8.40,
        lon=69.50,
        diameter_km=1200.0,
        elevation_areoid_m=1100.0,
        description="Dark, unweathered basaltic volcanic shield upwind of Jezero Crater.",
    ),
    PlanetaryFeature(
        id="iau-feat-21",
        name="Planum Boreum (North Polar Region / Cap)",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=88.00,
        lon=0.00,
        diameter_km=1100.0,
        elevation_areoid_m=-4200.0,
        description="Perennial northern polar ice cap composed of water ice with spiral troughs.",
    ),
    PlanetaryFeature(
        id="iau-feat-22",
        name="Planum Australe (South Polar Region / Cap)",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=-85.00,
        lon=0.00,
        diameter_km=1450.0,
        elevation_areoid_m=3200.0,
        description="Perennial southern polar ice cap capped by a permanent CO2 ice slab.",
    ),
    PlanetaryFeature(
        id="iau-feat-23",
        name="Mawrth Vallis",
        feature_type=PlanetaryFeatureType.VALLES,
        lat=23.99,
        lon=-18.96,
        diameter_km=636.0,
        elevation_areoid_m=-2240.0,
        description="Ancient outflow channel rich in stratified phyllosilicates (smectite).",
    ),
    PlanetaryFeature(
        id="iau-feat-24",
        name="Tharsis Rise (Tharsis Montes Volcanic Plateau)",
        feature_type=PlanetaryFeatureType.TERRA,
        lat=0.00,
        lon=-100.00,
        diameter_km=5000.0,
        elevation_areoid_m=8500.0,
        description=(
            "Vast continent-sized volcanic plateau hosting the Tharsis Montes shield volcanoes "
            "and Olympus Mons flank."
        ),
    ),
    PlanetaryFeature(
        id="iau-feat-25",
        name="Elysium Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=3.00,
        lon=154.70,
        diameter_km=3000.0,
        elevation_areoid_m=-2600.0,
        description=(
            "Smooth volcanic plain near the equator; landing location for the NASA InSight "
            "geophysics mission."
        ),
    ),
    PlanetaryFeature(
        id="iau-feat-26",
        name="Arcadia Planitia",
        feature_type=PlanetaryFeatureType.PLANITIA,
        lat=47.20,
        lon=-171.30,
        diameter_km=2100.0,
        elevation_areoid_m=-4000.0,
        description=(
            "Northern lowland volcanic plains with extensive shallow subsurface sheet ice "
            "detected by MRO SHARAD radar."
        ),
    ),
]


# -----------------------------------------------------------------------------
# AUTHENTIC MARS SURFACE LANDING SITES
# -----------------------------------------------------------------------------
MARS_LANDING_SITES: list[MarsLandingSite] = [
    MarsLandingSite(
        id="land-01",
        mission="Viking 1",
        agency="NASA Langley / JPL",
        craft_name="Viking 1 Lander",
        lat=22.48,
        lon=-47.97,
        elevation_areoid_m=-2690.0,
        landing_date="1976-07-20",
        status="Mission Completed (Inactive)",
        target_region="Chryse Planitia",
        description="First successful long-duration American landing on the surface of Mars.",
    ),
    MarsLandingSite(
        id="land-02",
        mission="Viking 2",
        agency="NASA Langley / JPL",
        craft_name="Viking 2 Lander",
        lat=47.97,
        lon=134.28,
        elevation_areoid_m=-3630.0,
        landing_date="1976-09-03",
        status="Mission Completed (Inactive)",
        target_region="Utopia Planitia",
        description="High-latitude northern plains landing site with frost observations.",
    ),
    MarsLandingSite(
        id="land-03",
        mission="Mars Pathfinder",
        agency="NASA JPL",
        craft_name="Pathfinder & Sojourner Rover",
        lat=19.26,
        lon=-33.22,
        elevation_areoid_m=-3680.0,
        landing_date="1997-07-04",
        status="Mission Completed (Inactive)",
        target_region="Ares Vallis",
        description="First successful robotic rover (Sojourner) deployed on Mars.",
    ),
    MarsLandingSite(
        id="land-04",
        mission="Mars Exploration Rover A",
        agency="NASA JPL",
        craft_name="Spirit Rover (MER-A)",
        lat=-14.57,
        lon=175.47,
        elevation_areoid_m=-1910.0,
        landing_date="2004-01-04",
        status="Mission Completed (Inactive)",
        target_region="Gusev Crater (Columbia Hills)",
        description="Operated 2,210 sols, discovered ancient hydrothermal silica deposits.",
    ),
    MarsLandingSite(
        id="land-05",
        mission="Mars Exploration Rover B",
        agency="NASA JPL",
        craft_name="Opportunity Rover (MER-B)",
        lat=-1.95,
        lon=-5.53,
        elevation_areoid_m=-1440.0,
        landing_date="2004-01-25",
        status="Mission Completed (Inactive)",
        target_region="Meridiani Planum (Endeavour Rim)",
        description=(
            "Record-breaking 45.16 km traverse over 14+ years confirming acidic groundwater."
        ),
    ),
    MarsLandingSite(
        id="land-06",
        mission="Phoenix Polar Lander",
        agency="NASA / University of Arizona",
        craft_name="Phoenix",
        lat=68.22,
        lon=-125.75,
        elevation_areoid_m=-4120.0,
        landing_date="2008-05-25",
        status="Mission Completed (Inactive)",
        target_region="Vastitas Borealis",
        description="Directly sampled subsurface water ice and detected perchlorates.",
    ),
    MarsLandingSite(
        id="land-07",
        mission="Mars Science Laboratory",
        agency="NASA JPL",
        craft_name="Curiosity Rover",
        lat=-4.59,
        lon=137.44,
        elevation_areoid_m=-4450.0,
        landing_date="2012-08-06",
        status="Active Surface Mission",
        target_region="Gale Crater (Mount Sharp)",
        description="Nuclear-powered rover investigating ancient lacustrine habitability.",
    ),
    MarsLandingSite(
        id="land-08",
        mission="InSight",
        agency="NASA JPL / CNES / DLR",
        craft_name="InSight Lander",
        lat=4.50,
        lon=135.62,
        elevation_areoid_m=-2610.0,
        landing_date="2018-11-26",
        status="Mission Completed (Inactive)",
        target_region="Elysium Planitia",
        description=(
            "Seismometer and heat flow probe measuring internal crust and mantle structure."
        ),
    ),
    MarsLandingSite(
        id="land-09",
        mission="Mars 2020",
        agency="NASA JPL",
        craft_name="Perseverance Rover & Ingenuity Helicopter",
        lat=18.4446,
        lon=77.4509,
        elevation_areoid_m=-2570.0,
        landing_date="2021-02-18",
        status="Active Surface Mission",
        target_region="Jezero Crater (Octavia E. Butler Landing)",
        description="Marswalk baseline site: collecting sample cores for Mars Sample Return.",
    ),
    MarsLandingSite(
        id="land-10",
        mission="Tianwen-1",
        agency="CNSA",
        craft_name="Zhurong Rover",
        lat=25.07,
        lon=109.93,
        elevation_areoid_m=-4100.0,
        landing_date="2021-05-15",
        status="Mission Completed (Inactive)",
        target_region="Utopia Planitia",
        description="Chinese rover investigating subsurface ground ice with polarimetric radar.",
    ),
]


def get_all_planetary_features() -> list[PlanetaryFeature]:
    """Return all authentic IAU planetary features."""
    return PLANETARY_FEATURES


def search_planetary_features(
    search: str | None = None,
    feature_type: str | None = None,
    limit: int = 50,
) -> list[PlanetaryFeature]:
    """Search and filter authentic IAU planetary features with relevance ranking."""
    results = PLANETARY_FEATURES
    if search:
        q = search.lower().strip()
        matched: list[tuple[int, PlanetaryFeature]] = []
        for f in results:
            name_lower = f.name.lower()
            desc_lower = f.description.lower()
            if q == name_lower:
                matched.append((0, f))
            elif name_lower.startswith(q):
                matched.append((1, f))
            elif q in name_lower:
                matched.append((2, f))
            elif q in desc_lower:
                matched.append((3, f))
        matched.sort(key=lambda x: x[0])
        results = [m[1] for m in matched]
    if feature_type:
        ft = feature_type.lower().strip()
        results = [f for f in results if ft in f.feature_type.value.lower()]
    return results[:limit]


def get_all_landing_sites() -> list[MarsLandingSite]:
    """Return all authentic historical Mars landing sites."""
    return MARS_LANDING_SITES


# -----------------------------------------------------------------------------
# JEZERO REGIONAL COVERAGE FOOTPRINTS & GEOLOGICAL CONTEXT (PHASE 3)
# -----------------------------------------------------------------------------
JEZERO_REGIONAL_FOOTPRINTS: dict[str, Any] = {
    "center": [18.4485, 77.4320],
    "crs": "IAU_2015:49900",
    "analysis_crs": "Equirectangular (R=3396190m, lon0=0, lat0=0)",
    "layers": {
        "hirise_1m": {
            "name": "HiRISE 1m Local DTM Footprint",
            "product_id": "HiRISE_DTM_Delta_Jezero_DL_1m",
            "resolution": "1.0 m/pixel",
            "bounds": [[18.39209, 77.34370], [18.58953, 77.46579]],
            "shape": [11703, 7237],
            "epistemic_class": EpistemicClass.DERIVED.value,
            "description": "Sub-meter digital elevation model of the Jezero western delta.",
        },
        "ctx_20m": {
            "name": "CTX 20m Regional DTM Footprint",
            "product_id": "JEZ_ctx_B_soc_008_DTM_20m",
            "resolution": "20.0 m/pixel",
            "bounds": [[18.21103, 77.16047], [18.72119, 77.69898]],
            "shape": [1512, 1596],
            "epistemic_class": EpistemicClass.DERIVED.value,
            "description": (
                "Regional Context Camera DTM covering Jezero Crater floor, rim, and breach."
            ),
        },
        "analysis_grid": {
            "name": "Marswalk Aligned 20m Analysis Grid",
            "product_id": "jezero_western_delta_20m_grid",
            "resolution": "20.0 m/cell",
            "bounds": [[18.39180, 77.34370], [18.58953, 77.46584]],
            "shape": [588, 362],
            "epistemic_class": EpistemicClass.DERIVED.value,
            "description": (
                "Standardized analysis grid for terrain derivatives, hazards, and cost routing."
            ),
        },
    },
    "geological_context": [
        {
            "id": "geo-delta-fan",
            "name": "Western Fan Delta",
            "type": "Sedimentary Delta Deposits",
            "bounds": [[18.420, 77.380], [18.475, 77.445]],
            "description": (
                "Ancient clay- and carbonate-rich delta front deposited into Jezero paleolake."
            ),
        },
        {
            "id": "geo-neretva-breach",
            "name": "Neretva Vallis Inflow Breach",
            "type": "Canyon / Fluvial Breach",
            "bounds": [[18.395, 77.340], [18.435, 77.385]],
            "description": (
                "Deep incision through the western crater rim where catastrophic flows entered."
            ),
        },
        {
            "id": "geo-kodiak-butte",
            "name": "Kodiak Butte (Delta Remnant)",
            "type": "Erosional Mesa",
            "bounds": [[18.415, 77.410], [18.425, 77.425]],
            "description": (
                "Isolated sedimentary butte revealing preserved delta bottomset and topset beds."
            ),
        },
        {
            "id": "geo-belva-crater",
            "name": "Belva Crater",
            "type": "Secondary Impact Crater",
            "bounds": [[18.470, 77.350], [18.510, 77.390]],
            "description": (
                "1 km impact crater on the delta providing vertical cross-sections of strata."
            ),
        },
        {
            "id": "geo-landing-site",
            "name": "Octavia E. Butler Landing Site",
            "type": "Spacecraft Touchdown",
            "bounds": [[18.440, 77.445], [18.450, 77.455]],
            "description": ("Mars 2020 touchdown site on the olivine-bearing crater floor unit."),
        },
    ],
}


def get_jezero_regional_footprints() -> dict[str, Any]:
    """Return authentic Jezero regional coverage footprints, bounds, and geology."""
    return JEZERO_REGIONAL_FOOTPRINTS
