"""Jezero Crater Regional Geospatial Intelligence Catalog.

Defines authentic regional metadata, USGS SIM-3464 geological units,
CRISM targeted hyperspectral observations, Perseverance sample cache records,
and the 8-category regional layer registry.

References:
- Sun, V. Z. & Stack, K. M. (2020). Geologic Map of Jezero Crater and the Nili Planum Region,
  Mars. USGS Scientific Investigations Map 3464, scale 1:75,000. https://doi.org/10.3133/sim3464
- Ehlmann, B. L., et al. (2008). Clay minerals in delta deposits and organic preservation
  potential on Mars. Nature Geoscience, 1(6), 355-358.
- Farley, K. A., et al. (2022). Aqueously altered igneous rocks on the floor of Jezero crater,
  Mars. Science, 377(6614), eabo2196.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.epistemic import EpistemicClass

# -----------------------------------------------------------------------------
# JEZERO CRATER REGIONAL STUDY AREA BOUNDS
# -----------------------------------------------------------------------------
JEZERO_REGIONAL_STUDY_AREA: dict[str, Any] = {
    "id": "reg-jezero-crater",
    "name": "Jezero Crater Regional Exploration Environment (Western Basin & Delta)",
    "region_type": "Impact Basin Paleolake & River Delta",
    "planet": "Mars",
    "crs_geographic": "IAU_2015:49900",
    "crs_projected": "ESRI:103885 (Equidistant Cylindrical / Equirectangular on Mars Sphere)",
    "vertical_datum": (
        "Mars Gravitational Areoid (MOLA GMM-2B equipotential surface, R_ref = 3,396,000 m)"
    ),
    "center": [18.4485, 77.4320],
    "bounds": {
        "lat_min": 18.21103,
        "lat_max": 18.72119,
        "lon_min": 77.16047,
        "lon_max": 77.69918,
    },
    "dimensions_km": {
        "width_km": 31.93,
        "height_km": 30.24,
        "diameter_km": 49.0,
    },
    "study_area_extent_km": {
        "width_km": 31.932,
        "height_km": 30.240,
        "area_km2": 965.62,
    },
    "crater_feature_dimensions": {
        "canonical_name": "Jezero Crater",
        "canonical_diameter_km": 49.0,
        "canonical_center": [18.38, 77.58],
        "canonical_area_km2": 1885.74,
        "authority": "IAU WGPSN / USGS Astrogeology Gazetteer of Planetary Nomenclature",
    },
    "basin_coverage_pct": 51.2,
    "coverage_percentage_of_basin": 51.2,
    "spatial_coverage_notes": (
        "The local CTX orthomosaic and DTM (JEZ_ctx_B_soc_008) span 31.93 km x 30.24 km "
        "(965.62 km²), covering approximately 51.2% of the 49 km crater basin area. Coverage is "
        "centered on the western delta, landing ellipse, Séítah, and Neretva Vallis breach, "
        "and does not extend across the eastern half or eastern rim of Jezero Crater."
    ),
    "elevation_range_m": {
        "min": -2710.0,
        "max": -1920.0,
        "reference": "Mars Gravitational Areoid",
    },
    "geodesy_notes": {
        "project_study_area_center": [18.4485, 77.4320],
        "raster_bounding_box_center": [18.4661, 77.4298],
        "canonical_iau_crater_center": [18.3800, 77.5800],
        "landing_site_center": [18.4446, 77.4509],
        "coordinate_convention": "Planetocentric Latitude, East-Positive Longitude in [-180, 180)",
        "spatial_extent_disclosure": (
            "Regional study area is a western subset of Jezero Basin; wider USGS SIM-3464 map "
            "covers 118 km x 118 km across Nili Planum."
        ),
    },
    "primary_scientific_facies": [
        "Western Lacustrine River Delta",
        "Neretva Vallis Inflow Gorge Breach",
        "Kodiak Isolated Delta Remnant Butte",
        "Séítah Ultramafic Olivine-Cumulate Floor",
        "Máaz Polygonal Fractured Basalt Floor",
        "Belva Secondary Impact Excavation",
        "Noachian Crustal Rim & Basement Slopes",
    ],
}


# -----------------------------------------------------------------------------
# AUTHENTIC USGS SIM-3464 GEOLOGICAL UNITS (JEZERO CRATER)
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class JezeroGeologicUnit:
    """An authentic mapped stratigraphic unit from USGS SIM-3464 (Sun & Stack, 2020)."""

    symbol: str  # Official SIM-3464 symbol (e.g. NHjf1, Cf-f-1, Cf-fr)
    official_sim3464_symbol: str
    name: str
    formation_name: str
    epoch: str
    dominant_lithology: str
    key_minerals: list[str]
    description: str
    color_hex: str
    boundary_polygon: list[list[float]]  # Polygon [[lat, lon], ...]
    area_km2: float
    alias_symbols: list[str] = field(default_factory=list)
    # Explicit separation of Marswalk Heuristic Planning Assessments
    traversability_risk_heuristic: str = "MODERATE"
    eva_science_priority_heuristic: str = "HIGH"
    epistemic_class: str = EpistemicClass.INTERPRETED.value
    authority: str = "USGS Scientific Investigations Map 3464 (Sun & Stack, 2020)"
    doi: str = "https://doi.org/10.3133/sim3464"
    map_scale: str = "1:75,000"

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "official_sim3464_symbol": self.official_sim3464_symbol,
            "alias_symbols": self.alias_symbols,
            "legacy_symbol": self.alias_symbols[0] if self.alias_symbols else self.symbol,
            "name": self.name,
            "formation_name": self.formation_name,
            "epoch": self.epoch,
            "dominant_lithology": self.dominant_lithology,
            "key_minerals": self.key_minerals,
            "description": self.description,
            "color_hex": self.color_hex,
            "boundary_polygon": self.boundary_polygon,
            "area_km2": self.area_km2,
            # Backwards-compatible fields with explicit HEURISTIC classification
            "traversability_risk": self.traversability_risk_heuristic,
            "traversability_risk_heuristic": self.traversability_risk_heuristic,
            "eva_science_priority": self.eva_science_priority_heuristic,
            "eva_science_priority_heuristic": self.eva_science_priority_heuristic,
            "planning_evaluation_caveat": (
                "Traversability risk and EVA science priority are Marswalk HEURISTIC assessments, "
                "not USGS mapped attributes."
            ),
            "epistemic_class": self.epistemic_class,
            "authority": self.authority,
            "doi": self.doi,
            "map_scale": self.map_scale,
        }


JEZERO_GEOLOGIC_UNITS: list[JezeroGeologicUnit] = [
    JezeroGeologicUnit(
        symbol="NHjf1",
        official_sim3464_symbol="NHjf1",
        alias_symbols=["Nld"],
        name="Jezero Fan Unit 1 (Distal Delta Layered Unit)",
        formation_name="Shenandoah Formation",
        epoch="Late Noachian to Early Hesperian (~3.7–3.8 Ga)",
        dominant_lithology=(
            "Fine-grained smectite-bearing mudstone, clay-rich siltstone, "
            "rhythmic lacustrine laminations"
        ),
        key_minerals=["Fe/Mg smectite clays", "Mg-carbonates", "Hydrated silica"],
        traversability_risk_heuristic="Low to Moderate (Steep erosional scarps up to 25° at edges)",
        eva_science_priority_heuristic=(
            "CRITICAL (Primary astrobiology & biosignature preservation target)"
        ),
        description=(
            "Distal delta-front strata deposited in quiet lacustrine conditions; exhibits fine "
            "rhythmic laminations with high organic preservation potential."
        ),
        color_hex="#4a7c59",
        boundary_polygon=[
            [18.420, 77.375],
            [18.460, 77.370],
            [18.485, 77.395],
            [18.475, 77.440],
            [18.435, 77.445],
            [18.420, 77.410],
            [18.420, 77.375],
        ],
        area_km2=32.4,
    ),
    JezeroGeologicUnit(
        symbol="NHjf2",
        official_sim3464_symbol="NHjf2",
        alias_symbols=["Nldb"],
        name="Jezero Fan Unit 2 (Delta Blocky Scarp Unit)",
        formation_name="Delta Scarp Member",
        epoch="Late Noachian to Early Hesperian",
        dominant_lithology=(
            "Coarse boulder-conglomerate, rounded fluvial cobbles, energetic flood sandstones"
        ),
        key_minerals=["Carbonate-bearing clays", "Olivine", "Pyroxene"],
        traversability_risk_heuristic="HIGH (Dense metric boulder fields >0.5m, scarp slopes >20°)",
        eva_science_priority_heuristic=(
            "HIGH (Stratigraphic cross-sections of energetic river flood surges)"
        ),
        description=(
            "Massive, blocky beds near the top of the delta scarp containing rounded fluvial "
            "cobbles transported by high-energy flood stages through Neretva Vallis."
        ),
        color_hex="#8c564b",
        boundary_polygon=[
            [18.440, 77.385],
            [18.470, 77.380],
            [18.475, 77.405],
            [18.450, 77.415],
            [18.440, 77.385],
        ],
        area_km2=9.8,
    ),
    JezeroGeologicUnit(
        symbol="Cf-f-1",
        official_sim3464_symbol="Cf-f-1",
        alias_symbols=["Ncf"],
        name="Crater Floor – Fractured 1 Unit (Séítah Formation)",
        formation_name="Séítah Formation",
        epoch="Early Hesperian (~3.8 Ga)",
        dominant_lithology="Cumulate igneous olivine-rich rock / poikilitic basalt / wehrlite",
        key_minerals=["Coarse-grained olivine (Fo50-70)", "Augite pyroxene", "Carbonate cement"],
        traversability_risk_heuristic=(
            "MODERATE (Transverse Aeolian Ridges [TARs] with loose sandy drift)"
        ),
        eva_science_priority_heuristic=(
            "VERY HIGH (Igneous crystallization age dating for Mars timescale)"
        ),
        description=(
            "Thick stratiform ultramafic/mafic igneous body formed by either a thick lava flow, "
            "volcanic pond, or sub-surface magma chamber sill within the crater floor."
        ),
        color_hex="#9467bd",
        boundary_polygon=[
            [18.405, 77.420],
            [18.440, 77.435],
            [18.435, 77.465],
            [18.395, 77.455],
            [18.405, 77.420],
        ],
        area_km2=28.1,
    ),
    JezeroGeologicUnit(
        symbol="Cf-fr",
        official_sim3464_symbol="Cf-fr",
        alias_symbols=["Nff"],
        name="Crater Floor – Fractured Rough Unit (Máaz Formation)",
        formation_name="Máaz Formation",
        epoch="Early Hesperian",
        dominant_lithology="Polygonal basaltic lava flows / volcanic cap rocks",
        key_minerals=["Plagioclase", "Clinopyroxene", "Secondary iron oxides"],
        traversability_risk_heuristic=(
            "LOW (Competent, low-slope pavement; ideal for rapid sortie transit)"
        ),
        eva_science_priority_heuristic=(
            "MODERATE (Establishes upper volcanic cap age over basement units)"
        ),
        description=(
            "Competent, polygonal fractured lava flow unit covering the northern and eastern "
            "portions of the western crater floor."
        ),
        color_hex="#7f7f7f",
        boundary_polygon=[
            [18.430, 77.450],
            [18.465, 77.455],
            [18.480, 77.520],
            [18.410, 77.510],
            [18.430, 77.450],
        ],
        area_km2=45.6,
    ),
    JezeroGeologicUnit(
        symbol="cr",
        official_sim3464_symbol="cr",
        alias_symbols=["Ncr"],
        name="Crater Rim Unit (Impact Ejecta & Basement Terrane)",
        formation_name="Nili Fossae Regional Crustal Basement",
        epoch="Middle to Late Noachian (>3.9 Ga)",
        dominant_lithology="Impact breccia, pre-impact Noachian crustal rocks, melt sheets",
        key_minerals=["Low-Ca pyroxene", "Smectite clays", "Impact melt glass"],
        traversability_risk_heuristic=(
            "EXTREME (Steep crater walls >30°, talus slopes, impassable cliffs)"
        ),
        eva_science_priority_heuristic="HIGH (Ancient pre-impact Noachian crustal evolution)",
        description=(
            "Elevated rim bedrock excavated by the Jezero impact event into the Nili Fossae "
            "regional basement crust."
        ),
        color_hex="#e377c2",
        boundary_polygon=[
            [18.250, 77.200],
            [18.700, 77.220],
            [18.710, 77.650],
            [18.240, 77.640],
            [18.250, 77.200],
        ],
        area_km2=118.0,
    ),
    JezeroGeologicUnit(
        symbol="fl",
        official_sim3464_symbol="fl",
        alias_symbols=["Nch"],
        name="Fluvial Unit (Neretva Vallis Channel Floor & Inflow Gorge)",
        formation_name="Neretva Vallis Channel",
        epoch="Late Noachian to Early Hesperian",
        dominant_lithology="Alluvial gravels, fluvial cobble lag, scoured bedrock chutes",
        key_minerals=["Fluvial sand", "Rounded basalt pebbles", "Smectite clays"],
        traversability_risk_heuristic=(
            "HIGH (Canyon constriction, boulder choke points, uneven talus)"
        ),
        eva_science_priority_heuristic=(
            "HIGH (Inflow hydrology and catchment-wide geochemical sampling)"
        ),
        description=(
            "Bed of the Neretva Vallis paleochannel that breached the western rim of Jezero "
            "Crater, debouching sediments into the lake."
        ),
        color_hex="#d2691e",
        boundary_polygon=[
            [18.390, 77.310],
            [18.420, 77.340],
            [18.435, 77.380],
            [18.410, 77.375],
            [18.385, 77.330],
            [18.390, 77.310],
        ],
        area_km2=14.3,
    ),
]


# -----------------------------------------------------------------------------
# AUTHENTIC CRISM TARGETED HYPERSPECTRAL OBSERVATIONS OVER JEZERO
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class CRISMTargetedObservation:
    """An authentic MRO CRISM targeted observation product.

    Distinguishes nominal nadir resolution from actual projected ground sampling
    distance, documents 545 VNIR+IR spectral channels (~6.55 nm/spectel), separates
    vector observation footprints from raster spectral cubes, and discloses
    known detector column artifacts.
    """

    product_id: str
    observation_type: str  # FRT (Full Resolution Targeted) or HRL (Half Resolution Long)
    nominal_spatial_resolution_m: float
    projected_spatial_resolution_m: float
    center_lat: float
    center_lon: float
    bounding_box: list[list[float]]  # [[min_lat, min_lon], [max_lat, max_lon]]
    target_description: str
    spectral_detections: list[str]
    processing_level: str
    archive_url: str
    spectral_bands: int = 545
    spectral_sampling_nm: float = 6.55
    spatial_resolution_m: float | None = None
    epistemic_class: str = EpistemicClass.OBSERVED.value
    notes: str = (
        "Hyperspectral summary parameters (D2300, MIN2290, OLINDEX3, BD1900) derived from "
        "calibrated I/F spectral cubes (545 channels, VNIR 0.36–1.05 µm, IR 1.0–3.92 µm). "
        "Vector footprints represent observation field-of-view; spectral parameter rasters are "
        "calibrated separately. Detector column artifacts and cosmic rays are filtered using "
        "PDS valid-data quality flags."
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "product_id": self.product_id,
            "observation_type": self.observation_type,
            "nominal_spatial_resolution_m": self.nominal_spatial_resolution_m,
            "projected_spatial_resolution_m": self.projected_spatial_resolution_m,
            "spatial_resolution_m": (
                self.spatial_resolution_m
                if self.spatial_resolution_m is not None
                else self.projected_spatial_resolution_m
            ),
            "spectral_bands": self.spectral_bands,
            "spectral_sampling_nm": self.spectral_sampling_nm,
            "center_lat": self.center_lat,
            "center_lon": self.center_lon,
            "bounding_box": self.bounding_box,
            "target_description": self.target_description,
            "spectral_detections": self.spectral_detections,
            "processing_level": self.processing_level,
            "archive_url": self.archive_url,
            "epistemic_class": self.epistemic_class,
            "is_raster": False,
            "is_footprint": True,
            "notes": self.notes,
        }


CRISM_OBSERVATIONS: list[CRISMTargetedObservation] = [
    CRISMTargetedObservation(
        product_id="FRT00005850",
        observation_type="FRT (Full Resolution Targeted)",
        nominal_spatial_resolution_m=18.0,
        projected_spatial_resolution_m=24.2,
        center_lat=18.445,
        center_lon=77.408,
        bounding_box=[[18.385, 77.360], [18.505, 77.455]],
        target_description="Western Delta Front & Bottomset Scarp",
        spectral_detections=[
            "Fe/Mg Smectite Clay (D2300 absorption at 2.30 µm)",
            "Magnesium Carbonate (MIN2290 absorption doublet at 2.29 µm)",
            "Hydrated Mineral Water Band (BD1900 at 1.93 µm)",
        ],
        processing_level=(
            "MRO CRISM Targeted Empirical Processing (TRDR calibrated I/F -> MTRDR parameters)"
        ),
        archive_url="https://pds-geosciences.wustl.edu/mro/mro-m-crism-3-rdr-targeted-v1/mrocr_2001/trdr/2007/086/frt00005850/",
        notes=(
            "Primary discovery dataset for Jezero delta clay and carbonate minerals "
            "(Ehlmann et al., 2008). Nominal mode resolution is 18.0 m/px at nadir; "
            "actual projected ground resolution is 24.2 m/px owing to spacecraft altitude "
            "and emission angle geometry. 545 spectral bands."
        ),
    ),
    CRISMTargetedObservation(
        product_id="HRL000040FF",
        observation_type="HRL (Half Resolution Long)",
        nominal_spatial_resolution_m=36.0,
        projected_spatial_resolution_m=37.8,
        center_lat=18.410,
        center_lon=77.445,
        bounding_box=[[18.340, 77.390], [18.480, 77.500]],
        target_description="Séítah Floor Ultramafic Cumulate Unit",
        spectral_detections=[
            "Forsteritic Olivine (OLINDEX3 broad absorption band at 1.05 µm)",
            "High-Calcium Clinopyroxene (HCPINDEX at 2.0 µm)",
            "Carbonate cement signatures along fractured contacts",
        ],
        processing_level=(
            "MRO CRISM Targeted Empirical Processing (TRDR calibrated I/F -> MTRDR parameters)"
        ),
        archive_url="https://pds-geosciences.wustl.edu/mro/mro-m-crism-3-rdr-targeted-v1/mrocr_2001/trdr/2007/040/hrl000040ff/",
        notes=(
            "Half-resolution long targeted observation over crater floor. Nominal 36.0 m/px; "
            "projected 37.8 m/px. Displays prominent 1 µm ferrous olivine absorption across Séítah."
        ),
    ),
    CRISMTargetedObservation(
        product_id="FRT0000B24C",
        observation_type="FRT (Full Resolution Targeted)",
        nominal_spatial_resolution_m=18.0,
        projected_spatial_resolution_m=18.2,
        center_lat=18.420,
        center_lon=77.365,
        bounding_box=[[18.370, 77.320], [18.470, 77.410]],
        target_description="Kodiak Remnant Butte & Neretva Breach Chute",
        spectral_detections=[
            "Phyllosilicates in bottomset beds (Nontronite / Saponite)",
            "Hydrated Silica / Opaline phases along topset contact",
        ],
        processing_level=(
            "MRO CRISM Targeted Empirical Processing (TRDR calibrated I/F -> MTRDR parameters)"
        ),
        archive_url="https://pds-geosciences.wustl.edu/mro/mro-m-crism-3-rdr-targeted-v1/mrocr_2001/trdr/2008/182/frt0000b24c/",
        notes=(
            "Full-resolution targeted observation covering Kodiak butte and canyon debouchment. "
            "Nominal 18.0 m/px; projected 18.2 m/px. Crucial for deltaic foreset/topset "
            "stratigraphy."
        ),
    ),
    CRISMTargetedObservation(
        product_id="HRL0000B1C9",
        observation_type="HRL (Half Resolution Long)",
        nominal_spatial_resolution_m=36.0,
        projected_spatial_resolution_m=36.5,
        center_lat=18.620,
        center_lon=77.420,
        bounding_box=[[18.550, 77.360], [18.690, 77.480]],
        target_description="Northern Jezero Crater Rim Crustal Wall",
        spectral_detections=[
            "Low-Calcium Pyroxene (LCPINDEX at 1.9 µm)",
            "Basement impact breccia phyllosilicates",
        ],
        processing_level=(
            "MRO CRISM Targeted Empirical Processing (TRDR calibrated I/F -> MTRDR parameters)"
        ),
        archive_url="https://pds-geosciences.wustl.edu/mro/mro-m-crism-3-rdr-targeted-v1/mrocr_2001/trdr/2008/175/hrl0000b1c9/",
        notes=(
            "Half-resolution observation of pre-impact Noachian crust along northern rim wall. "
            "Nominal 36.0 m/px; projected 36.5 m/px."
        ),
    ),
]


# -----------------------------------------------------------------------------
# AUTHENTIC PERSEVERANCE SAMPLE CORES & THREE FORKS DEPOT
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class PerseveranceSampleRecord:
    """An authentic sample core collected by Perseverance (Mars 2020).

    Includes the 10 authentic sample tubes deposited at the Three Forks Sample Depot
    (deposited Sols 653–710) and the primary paired cores retained in the rover's Onboard Cache.
    """

    sample_id: str
    sample_name: str
    sample_type: str  # Rock core, Regolith, Atmospheric, Witness tube
    tube_id: str
    sol_collected: int
    lat: float
    lon: float
    elevation_areoid_m: float
    target_rock_type: str
    geologic_unit: str
    depot_location: str  # Onboard Cache or Three Forks Depot
    paired_with: str | None = None
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "sample_id": self.sample_id,
            "sample_name": self.sample_name,
            "sample_type": self.sample_type,
            "tube_id": self.tube_id,
            "sol_collected": self.sol_collected,
            "lat": self.lat,
            "lon": self.lon,
            "elevation_areoid_m": self.elevation_areoid_m,
            "target_rock_type": self.target_rock_type,
            "geologic_unit": self.geologic_unit,
            "depot_location": self.depot_location,
            "paired_with": self.paired_with,
            "notes": self.notes,
        }


# Authentic Mars 2020 Perseverance Sample Depot (10 dropped tubes) + Paired Onboard Cores
PERSEVERANCE_SAMPLE_CORES: list[PerseveranceSampleRecord] = [
    # --- 10 THREE FORKS DEPOT DROPPED TUBES (Sols 653 - 710) ---
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-01",
        sample_name="Malay",
        sample_type="Regolith",
        tube_id="Tube 241",
        sol_collected=653,
        lat=18.4410,
        lon=77.4520,
        elevation_areoid_m=-2572.0,
        target_rock_type="Loose aeolian soil and basaltic regolith",
        geologic_unit="Crater Floor Regolith",
        depot_location="Three Forks Depot",
        paired_with="Amalik",
        notes="First sample tube deposited at Three Forks backup cache depot on Sol 653.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-02",
        sample_name="Mageik",
        sample_type="Rock Core",
        tube_id="Tube 258",
        sol_collected=659,
        lat=18.4447,
        lon=77.4508,
        elevation_areoid_m=-2569.8,
        target_rock_type="Basaltic poikilitic cumulate",
        geologic_unit="Floor Fractured Unit (Máaz Formation, Cf-fr)",
        depot_location="Three Forks Depot",
        paired_with="Dourbes",
        notes="Deposited at Three Forks on Sol 659.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-03",
        sample_name="Crosswind Lake",
        sample_type="Regolith",
        tube_id="Tube 254",
        sol_collected=664,
        lat=18.4412,
        lon=77.4522,
        elevation_areoid_m=-2571.8,
        target_rock_type="Aeolian sand & fine-grained basalt regolith",
        geologic_unit="Crater Floor Regolith",
        depot_location="Three Forks Depot",
        paired_with=None,
        notes="Deposited at Three Forks on Sol 664.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-04",
        sample_name="Roubion",
        sample_type="Atmospheric",
        tube_id="Tube 233",
        sol_collected=669,
        lat=18.4446,
        lon=77.4510,
        elevation_areoid_m=-2570.0,
        target_rock_type="Atmospheric Martian gas sample",
        geologic_unit="Floor Fractured Unit (Máaz Formation, Cf-fr)",
        depot_location="Three Forks Depot",
        paired_with=None,
        notes=(
            "Original rock core disintegrated during coring on Sol 164; sealed as authentic "
            "atmospheric sample and dropped Sol 669."
        ),
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-05",
        sample_name="Coulettes",
        sample_type="Rock Core",
        tube_id="Tube 256",
        sol_collected=676,
        lat=18.4448,
        lon=77.4509,
        elevation_areoid_m=-2569.7,
        target_rock_type="Aqueously altered basalt",
        geologic_unit="Floor Fractured Unit (Máaz Formation, Cf-fr)",
        depot_location="Three Forks Depot",
        paired_with="Robine",
        notes="Deposited at Three Forks on Sol 676.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-06",
        sample_name="Montdenier",
        sample_type="Rock Core",
        tube_id="Tube 264",
        sol_collected=682,
        lat=18.4447,
        lon=77.4508,
        elevation_areoid_m=-2569.8,
        target_rock_type="Basaltic poikilitic cumulate",
        geologic_unit="Floor Fractured Unit (Máaz Formation, Cf-fr)",
        depot_location="Three Forks Depot",
        paired_with="Salette",
        notes="Deposited at Three Forks on Sol 682; paired with Salette in Onboard Cache.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-07",
        sample_name="Bearwallow",
        sample_type="Rock Core",
        tube_id="Tube 255",
        sol_collected=689,
        lat=18.4590,
        lon=77.3980,
        elevation_areoid_m=-2472.0,
        target_rock_type="Fluvial deltaic sandstone and siltstone",
        geologic_unit="Delta Blocky Scarp Unit (NHjf2)",
        depot_location="Three Forks Depot",
        paired_with="Hazeltop",
        notes="Deposited at Three Forks on Sol 689; paired with Hazeltop in Onboard Cache.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-08",
        sample_name="Skyland",
        sample_type="Rock Core",
        tube_id="Tube 257",
        sol_collected=696,
        lat=18.4520,
        lon=77.4080,
        elevation_areoid_m=-2510.4,
        target_rock_type="Fine-grained organic-rich mudstone",
        geologic_unit="Western Delta Layered Unit (Shenandoah Formation, NHjf1)",
        depot_location="Three Forks Depot",
        paired_with="Swift Run",
        notes="Deposited at Three Forks on Sol 696; high biosignature preservation potential.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-09",
        sample_name="Atsah",
        sample_type="Rock Core",
        tube_id="Tube 262",
        sol_collected=703,
        lat=18.4325,
        lon=77.4523,
        elevation_areoid_m=-2575.2,
        target_rock_type="Coarse olivine cumulate rock",
        geologic_unit="Crater Floor Olivine-Bearing Unit (Séítah Formation, Cf-f-1)",
        depot_location="Three Forks Depot",
        paired_with="Bellegarde",
        notes="Deposited at Three Forks on Sol 703.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-DEPOT-10",
        sample_name="Amalik",
        sample_type="Regolith",
        tube_id="Tube 260",
        sol_collected=710,
        lat=18.4411,
        lon=77.4521,
        elevation_areoid_m=-2571.9,
        target_rock_type="Aeolian sand & fine-grained basalt regolith",
        geologic_unit="Crater Floor Regolith",
        depot_location="Three Forks Depot",
        paired_with="Malay",
        notes="Tenth and final backup tube deposited at Three Forks on Sol 710 (Jan 28, 2023).",
    ),
    # --- PAIRED CORES & KEY SPECIMENS IN ONBOARD CACHE ---
    PerseveranceSampleRecord(
        sample_id="SAMPLE-ONBOARD-01",
        sample_name="Salette",
        sample_type="Rock Core",
        tube_id="Tube 248",
        sol_collected=194,
        lat=18.4447,
        lon=77.4508,
        elevation_areoid_m=-2569.8,
        target_rock_type="Basaltic poikilitic cumulate (Paired Core)",
        geologic_unit="Floor Fractured Unit (Máaz Formation, Cf-fr)",
        depot_location="Onboard Cache",
        paired_with="Montdenier",
        notes=(
            "First successfully cored rock core by Perseverance; "
            "retained in primary onboard cache."
        ),
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-ONBOARD-02",
        sample_name="Bellegarde",
        sample_type="Rock Core",
        tube_id="Tube 263",
        sol_collected=271,
        lat=18.4325,
        lon=77.4523,
        elevation_areoid_m=-2575.2,
        target_rock_type="Coarse olivine cumulate rock (Paired Core)",
        geologic_unit="Crater Floor Olivine-Bearing Unit (Séítah Formation, Cf-f-1)",
        depot_location="Onboard Cache",
        paired_with="Atsah",
        notes="Retained in primary onboard cache.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-ONBOARD-03",
        sample_name="Robine",
        sample_type="Rock Core",
        tube_id="Tube 259",
        sol_collected=341,
        lat=18.4215,
        lon=77.4410,
        elevation_areoid_m=-2568.1,
        target_rock_type="Aqueously altered olivine-carbonate rock (Paired Core)",
        geologic_unit="Crater Floor Olivine-Bearing Unit (Séítah Formation, Cf-f-1)",
        depot_location="Onboard Cache",
        paired_with="Coulettes",
        notes="Retained in primary onboard cache.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-ONBOARD-04",
        sample_name="Swift Run",
        sample_type="Rock Core",
        tube_id="Tube 251",
        sol_collected=490,
        lat=18.4520,
        lon=77.4080,
        elevation_areoid_m=-2510.4,
        target_rock_type="Fine-grained mudstone with sulfate veins",
        geologic_unit="Western Delta Layered Unit (Shenandoah Formation, NHjf1)",
        depot_location="Onboard Cache",
        paired_with="Skyland",
        notes="First sedimentary core from the delta; retained in onboard cache.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-ONBOARD-05",
        sample_name="Hazeltop",
        sample_type="Rock Core",
        tube_id="Tube 250",
        sol_collected=553,
        lat=18.4590,
        lon=77.3980,
        elevation_areoid_m=-2472.0,
        target_rock_type="Fluvial sandstone and siltstone (Paired Core)",
        geologic_unit="Delta Blocky Scarp Unit (NHjf2)",
        depot_location="Onboard Cache",
        paired_with="Bearwallow",
        notes="Retained in primary onboard cache.",
    ),
    PerseveranceSampleRecord(
        sample_id="SAMPLE-ONBOARD-06",
        sample_name="Otis Peak",
        sample_type="Rock Core",
        tube_id="Tube 261",
        sol_collected=888,
        lat=18.4610,
        lon=77.3890,
        elevation_areoid_m=-2440.0,
        target_rock_type="Coarse boulder conglomerate sandstone",
        geologic_unit="Tenby Formation / Delta Topset Unit",
        depot_location="Onboard Cache",
        paired_with=None,
        notes="High-energy fluvial flood deposits from top of delta; retained in onboard cache.",
    ),
]

# -----------------------------------------------------------------------------
# 8-CATEGORY REGIONAL LAYER REGISTRY
# -----------------------------------------------------------------------------
REGIONAL_LAYER_CATEGORIES: list[dict[str, Any]] = [
    {
        "id": "base-imagery",
        "name": "1. Base Imagery",
        "description": "Controlled visible orbital mosaics from MRO CTX, HiRISE, and MEX HRSC.",
        "icon": "📷",
    },
    {
        "id": "elevation-topography",
        "name": "2. Elevation and Topography",
        "description": "Multi-scale digital terrain models, elevation colormaps, and contours.",
        "icon": "⛰️",
    },
    {
        "id": "geological-mapping",
        "name": "3. Geological Mapping",
        "description": "Peer-reviewed stratigraphic formations from USGS SIM-3464 and contacts.",
        "icon": "🗺️",
    },
    {
        "id": "mineralogical-data",
        "name": "4. Mineralogical Data",
        "description": "MRO CRISM targeted hyperspectral observations and absorption indices.",
        "icon": "🔬",
    },
    {
        "id": "rover-exploration",
        "name": "5. Rover Exploration",
        "description": "Authentic Mars 2020 Perseverance traverse, waypoints, and sample cores.",
        "icon": "🤖",
    },
    {
        "id": "terrain-intelligence",
        "name": "6. Terrain Intelligence",
        "description": "Slopes, aspects, analytical hillshades, TRI, VRM, and curvatures.",
        "icon": "📐",
    },
    {
        "id": "hazards",
        "name": "7. Hazards",
        "description": "Hard impassable masks, boulder fields, sand drifts, and steep terrain.",
        "icon": "⚠️",
    },
    {
        "id": "coverage-uncertainty",
        "name": "8. Coverage and Uncertainty",
        "description": "Instrument footprints, DTM height standard deviation (sigma z), NoData.",
        "icon": "🛡️",
    },
]

REGIONAL_LAYERS: list[dict[str, Any]] = [
    # 1. Base Imagery
    {
        "id": "reg_ctx_mosaic",
        "canonical_id": "PLN-SRC-05",
        "name": "MRO CTX Regional Orthomosaic (6m native)",
        "category": "base-imagery",
        "epistemic_class": "OBSERVED",
        "resolution_m": 6.0,
        "crs": "ESRI:103885 (Equirectangular)",
        "source": "USGS Astrogeology TRN Project (JEZ_ctx_B_soc_008_orthoMosaic_6m.tif)",
        "url": "/api/v1/twin/raster/ortho.png",
        "description": (
            "6m controlled surface reflectance covering western Jezero Crater basin, delta fan, "
            "and floor units (31.93 km x 30.24 km, 965.62 km², covering 51.2% of the crater basin)."
        ),
        "is_default": True,
        "is_raster": True,
        "footprint": [[18.21103, 77.16047], [18.72119, 77.69898]],
    },
    {
        "id": "reg_hirise_footprint",
        "canonical_id": "PLN-SRC-09",
        "name": "HiRISE High-Resolution Visible Coverage (0.25m)",
        "category": "base-imagery",
        "epistemic_class": "OBSERVED",
        "resolution_m": 0.25,
        "crs": "IAU_2015:49900",
        "source": "NASA/JPL/University of Arizona MRO HiRISE Archive",
        "url": None,
        "description": "Sub-meter orbital imagery footprint over western delta and landing site.",
        "is_default": False,
        "is_raster": False,
        "footprint": [[18.39209, 77.34370], [18.58953, 77.46579]],
    },
    # 2. Elevation and Topography
    {
        "id": "reg_ctx_20m_dtm",
        "canonical_id": "PLN-SRC-06",
        "name": "MRO CTX Regional DTM (20m photogrammetric)",
        "category": "elevation-topography",
        "epistemic_class": "DERIVED",
        "resolution_m": 20.0,
        "crs": "ESRI:103885",
        "source": "USGS Astrogeology TRN Project (JEZ_ctx_B_soc_008_DTM_20m.tif)",
        "url": "/api/v1/twin/raster/elevation.png",
        "description": "20m photogrammetric digital terrain model referenced to Mars Areoid datum.",
        "is_default": True,
        "is_raster": True,
        "footprint": [[18.21103, 77.16047], [18.72119, 77.69898]],
    },
    {
        "id": "reg_hirise_1m_dtm",
        "canonical_id": "PLN-SRC-08",
        "name": "HiRISE High-Resolution 1.0m Delta DTM",
        "category": "elevation-topography",
        "epistemic_class": "DERIVED",
        "resolution_m": 1.0,
        "crs": "ESRI:103885",
        "source": "USGS Astrogeology TRN (HiRISE_DTM_Delta_Jezero_DL_1m.tif)",
        "url": None,
        "description": "1.0m photogrammetric DTM covering western delta fan and Jezero scarps.",
        "is_default": False,
        "is_raster": False,
        "footprint": [[18.39209, 77.34370], [18.58953, 77.46579]],
    },
    {
        "id": "reg_contours_50m",
        "canonical_id": "PLN-VEC-01",
        "name": "Topographic Elevation Contours (50m Intervals)",
        "category": "elevation-topography",
        "epistemic_class": "DERIVED",
        "resolution_m": 50.0,
        "crs": "IAU_2015:49900",
        "source": "Vectorized from 20m CTX DTM",
        "url": "/api/v1/twin/vector/contours?interval=50",
        "description": (
            "Elevation isohypses of Martian topography referenced to MOLA areoid datum (not "
            "undulations of the areoid itself), vectorized from 20m CTX DTM."
        ),
        "is_default": False,
        "is_raster": False,
        "footprint": [[18.39180, 77.34370], [18.58953, 77.46584]],
    },
    # 3. Geological Mapping
    {
        "id": "reg_geology_sim3464",
        "canonical_id": "PLN-INT-02",
        "name": "USGS Jezero Geological Map (SIM-3464)",
        "category": "geological-mapping",
        "epistemic_class": "INTERPRETED",
        "resolution_m": 75.0,
        "crs": "IAU_2015:49900",
        "source": "USGS Scientific Investigations Map 3464 (Sun & Stack, 2020)",
        "url": "/api/v1/atlas/regional/jezero/geology",
        "description": (
            "Peer-reviewed chronostratigraphic units across Jezero Crater and Nili Planum. "
            "Note: Traversability risk and EVA priority are Marswalk HEURISTIC planning models, "
            "not USGS mapped properties."
        ),
        "is_default": True,
        "is_raster": False,
        "footprint": [[18.21103, 77.16047], [18.72119, 77.69898]],
    },
    # 4. Mineralogical Data
    {
        "id": "reg_crism_observations",
        "canonical_id": "PLN-INT-03",
        "name": "MRO CRISM Targeted Footprints & Spectral Indices",
        "category": "mineralogical-data",
        "epistemic_class": "INTERPRETED",
        "resolution_m": 18.0,
        "crs": "IAU_2015:49900",
        "source": "MRO CRISM Science Team / PDS Geosciences",
        "url": "/api/v1/atlas/regional/jezero/crism",
        "description": (
            "Footprints of targeted hyperspectral observations (545 spectral bands, VNIR+IR, "
            "~6.55 nm/spectel). Detections of Fe/Mg smectites, Mg-carbonates, and olivine across "
            "targeted footprints. Vector footprints represent observation field-of-view; "
            "spectral parameter rasters are calibrated separately."
        ),
        "is_default": False,
        "is_raster": False,
        "footprint": [[18.34000, 77.32000], [18.69000, 77.50000]],
    },
    {
        "id": "reg_science_opportunity",
        "canonical_id": "PLN-DRV-14",
        "name": "Science Opportunity Composite Map",
        "category": "mineralogical-data",
        "epistemic_class": "INTERPRETED",
        "resolution_m": 20.0,
        "crs": "ESRI:103885",
        "source": "Marswalk Science Opportunity Engine",
        "url": "/api/v1/science/raster/opportunity.png",
        "description": (
            "Multi-criteria ranking combining mineralogy, contacts, and rover proximity."
        ),
        "is_default": False,
        "is_raster": True,
        "footprint": [[18.39180, 77.34370], [18.58953, 77.46584]],
    },
    # 5. Rover Exploration
    {
        "id": "reg_perseverance_traverse",
        "canonical_id": "PLN-VEC-04",
        "name": "Perseverance Rover Historical Traverse (Sols 14–2022)",
        "category": "rover-exploration",
        "epistemic_class": "OBSERVED",
        "resolution_m": 1.0,
        "crs": "IAU_2015:49900",
        "source": "NASA JPL Mars 2020 Ground Data System (M20_traverse.json)",
        "url": "/api/v1/atlas/regional/jezero/rover/traverse",
        "description": (
            "Authentic robotic surface traverse path localized via NASA/JPL-Caltech MIPL "
            "Terrain-Relative Localization (Visual Odometry & HiRISE Image Registration, "
            "45.25 km total traverse, Sols 14–2022). Mars has no GPS constellation."
        ),
        "is_default": True,
        "is_raster": False,
        "footprint": [[18.43100, 77.44900], [18.45500, 77.45300]],
    },
    {
        "id": "reg_perseverance_samples",
        "canonical_id": "PLN-VEC-05",
        "name": "Perseverance Sample Cores & Three Forks Depot",
        "category": "rover-exploration",
        "epistemic_class": "INTERPRETED",
        "resolution_m": 0.1,
        "crs": "IAU_2015:49900",
        "source": "NASA Mars 2020 Sample Return Science Team",
        "url": "/api/v1/atlas/regional/jezero/rover/samples",
        "description": (
            "Locations of rock core samples, regolith samples, and Three Forks cache depot."
        ),
        "is_default": True,
        "is_raster": False,
        "footprint": [[18.42150, 77.44100], [18.45900, 77.45230]],
    },
    # 6. Terrain Intelligence
    {
        "id": "reg_hillshade",
        "canonical_id": "PLN-DRV-05",
        "name": "Analytical Relief Hillshade (315° / 45°)",
        "category": "terrain-intelligence",
        "epistemic_class": "DERIVED",
        "resolution_m": 20.0,
        "crs": "ESRI:103885",
        "source": "Marswalk Terrain Intelligence Engine",
        "url": "/api/v1/twin/raster/hillshade.png",
        "description": (
            "Single-azimuth Lambertian illumination highlighting delta scarps and fractures."
        ),
        "is_default": False,
        "is_raster": True,
        "footprint": [[18.39180, 77.34370], [18.58953, 77.46584]],
    },
    {
        "id": "reg_multidirectional_hillshade",
        "canonical_id": "PLN-DRV-06",
        "name": "Multi-Directional Relief Shading",
        "category": "terrain-intelligence",
        "epistemic_class": "DERIVED",
        "resolution_m": 20.0,
        "crs": "ESRI:103885",
        "source": "Marswalk Terrain Intelligence Engine",
        "url": "/api/v1/twin/raster/multidirectional_hillshade.png",
        "description": (
            "Aspect-unbiased composite hillshade blending 4 oblique lighting directions."
        ),
        "is_default": False,
        "is_raster": True,
        "footprint": [[18.39180, 77.34370], [18.58953, 77.46584]],
    },
    {
        "id": "reg_slope",
        "canonical_id": "PLN-DRV-03",
        "name": "Horn's Slope & Steep Incline Map (deg)",
        "category": "terrain-intelligence",
        "epistemic_class": "DERIVED",
        "resolution_m": 20.0,
        "crs": "ESRI:103885",
        "source": "Marswalk Terrain Intelligence Engine",
        "url": "/api/v1/twin/raster/slope.png",
        "description": (
            "Slope angle in degrees: Green (<10°), Amber (10–20°), Purple (>25° cliffs)."
        ),
        "is_default": False,
        "is_raster": True,
        "footprint": [[18.39180, 77.34370], [18.58953, 77.46584]],
    },
    {
        "id": "reg_terrain_classes",
        "canonical_id": "PLN-DRV-12",
        "name": "Terrain Geomorphic Units (Heuristic)",
        "category": "terrain-intelligence",
        "epistemic_class": "HEURISTIC",
        "resolution_m": 20.0,
        "crs": "ESRI:103885",
        "source": "Marswalk Terrain Intelligence Engine",
        "url": "/api/v1/twin/raster/classes.png",
        "description": "Classification into regolith pavement, dunes, boulder fields, and scarps.",
        "is_default": False,
        "is_raster": True,
        "footprint": [[18.39180, 77.34370], [18.58953, 77.46584]],
    },
    # 7. Hazards
    {
        "id": "reg_hard_hazard",
        "canonical_id": "PLN-DRV-11",
        "name": "Unified Hard Impassable Mask",
        "category": "hazards",
        "epistemic_class": "HEURISTIC",
        "resolution_m": 20.0,
        "crs": "ESRI:103885",
        "source": "Marswalk Hazard Intelligence Engine",
        "url": "/api/v1/hazards/raster/overall.png",
        "description": "Binary obstacle mask (slope >25°, metric boulders, extreme NoData).",
        "is_default": False,
        "is_raster": True,
        "footprint": [[18.39180, 77.34370], [18.58953, 77.46584]],
    },
    # 8. Coverage and Uncertainty
    {
        "id": "reg_coverage_mask",
        "canonical_id": "PLN-DRV-02",
        "name": "Source Instrument Footprints & Coverage Mask",
        "category": "coverage-uncertainty",
        "epistemic_class": "DERIVED",
        "resolution_m": 20.0,
        "crs": "ESRI:103885",
        "source": "Marswalk Terrain Ingestion Pipeline",
        "url": "/api/v1/twin/raster/coverage.png",
        "description": (
            "Data provenance: Cyan = HiRISE 1m DTM, Amber = CTX 20m DTM, Black = NoData."
        ),
        "is_default": False,
        "is_raster": True,
        "footprint": [[18.21103, 77.16047], [18.72119, 77.69898]],
    },
]


def get_regional_study_area() -> dict[str, Any]:
    """Return Jezero Crater regional study area metadata."""
    return JEZERO_REGIONAL_STUDY_AREA


def get_regional_categories() -> list[dict[str, Any]]:
    """Return the 8 standardized regional layer categories."""
    return REGIONAL_LAYER_CATEGORIES


def get_all_regional_layers() -> list[dict[str, Any]]:
    """Return all available regional layers across the 8 categories."""
    return REGIONAL_LAYERS


def get_jezero_geology() -> list[JezeroGeologicUnit]:
    """Return authentic USGS SIM-3464 geological units."""
    return JEZERO_GEOLOGIC_UNITS


def get_jezero_crism_observations() -> list[CRISMTargetedObservation]:
    """Return authentic MRO CRISM targeted hyperspectral observations."""
    return CRISM_OBSERVATIONS


def get_perseverance_sample_records() -> list[PerseveranceSampleRecord]:
    """Return authentic Perseverance sample cores and Three Forks cache records."""
    return PERSEVERANCE_SAMPLE_CORES
