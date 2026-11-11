"""Comprehensive Mars Planetary Exploration Atlas catalog.

Organized into 11 distinct planetary map categories with authentic data provenance,
strict epistemic classifications, and Mars geodesy reference standards per AGENTS.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.core.epistemic import EpistemicClass


class AtlasCategory(StrEnum):
    GLOBAL_MARS = "global_mars"
    REGIONAL_MARS = "regional_mars"
    HIGH_RES_LOCAL = "high_res_local"
    ELEVATION_TOPOGRAPHY = "elevation_topography"
    TERRAIN_ANALYSIS = "terrain_analysis"
    GEOLOGICAL = "geological"
    MINERALOGICAL = "mineralogical"
    SURFACE_PROPERTIES = "surface_properties"
    HAZARDS = "hazards"
    ROVER_EXPLORATION = "rover_exploration"
    MISSION_PLANNING = "mission_planning"


class ProductType(StrEnum):
    SRC = "SRC"  # Source flight/archive dataset
    DRV = "DRV"  # Derived raster product
    VEC = "VEC"  # Vector GIS product
    INT = "INT"  # Interpretive geological/spectral model
    SIM = "SIM"  # Numerical simulation / heuristic corridor


class ValidationStatus(StrEnum):
    VERIFIED_LOCAL = "VERIFIED_LOCAL"
    VERIFIED_REMOTE_WMS = "VERIFIED_REMOTE_WMS"
    VERIFIED_REMOTE_WMTS = "VERIFIED_REMOTE_WMTS"
    VERIFIED_ARCHIVE = "VERIFIED_ARCHIVE"
    CATALOGUED = "CATALOGUED"


CATEGORY_METADATA: dict[AtlasCategory, dict[str, str]] = {
    AtlasCategory.GLOBAL_MARS: {
        "title": "Global Mars Maps",
        "description": (
            "Planetary-scale basemaps, global altimetry, thermal inertia, and planet-wide geology."
        ),
        "icon": "🪐",
    },
    AtlasCategory.REGIONAL_MARS: {
        "title": "Regional Mars Maps",
        "description": (
            "Crater-scale context mosaics (CTX, HRSC) and Nili Fossae regional watershed."
        ),
        "icon": "🗺️",
    },
    AtlasCategory.HIGH_RES_LOCAL: {
        "title": "High-Resolution Local Maps",
        "description": (
            "Sub-meter and meter-scale HiRISE DTMs and orthorectified inspection footprints."
        ),
        "icon": "🔍",
    },
    AtlasCategory.ELEVATION_TOPOGRAPHY: {
        "title": "Elevation and Topography",
        "description": (
            "Digital elevation models, Mars Areoid equipotential datums, and relief products."
        ),
        "icon": "⛰️",
    },
    AtlasCategory.TERRAIN_ANALYSIS: {
        "title": "Terrain Analysis",
        "description": (
            "Scientifically documented slope, aspect, TRI, curvature, and vector ruggedness."
        ),
        "icon": "📐",
    },
    AtlasCategory.GEOLOGICAL: {
        "title": "Geological Maps",
        "description": (
            "Stratigraphic rock units, delta fan deposits, fault scarps, and formation boundaries."
        ),
        "icon": "🪨",
    },
    AtlasCategory.MINERALOGICAL: {
        "title": "Mineralogical Maps",
        "description": (
            "Hyperspectral CRISM mineral detections: smectite clays, "
            "carbonates, olivine, and silica."
        ),
        "icon": "🔬",
    },
    AtlasCategory.SURFACE_PROPERTIES: {
        "title": "Surface Property Maps",
        "description": (
            "Thermal inertia, surface albedo, dust cover index, and regolith consolidation."
        ),
        "icon": "🌡️",
    },
    AtlasCategory.HAZARDS: {
        "title": "Hazard Maps",
        "description": (
            "Hard traversability limits, steep scarps, boulder densities, and aeolian dune slips."
        ),
        "icon": "⚠️",
    },
    AtlasCategory.ROVER_EXPLORATION: {
        "title": "Rover Exploration Maps",
        "description": (
            "Mars 2020 Perseverance traverse path, scientific waypoints, and sample drill cores."
        ),
        "icon": "🤖",
    },
    AtlasCategory.MISSION_PLANNING: {
        "title": "Mission Planning Maps",
        "description": (
            "Unified costmaps, multi-objective trade-offs, and emergency return-to-base corridors."
        ),
        "icon": "🧭",
    },
}


@dataclass(frozen=True)
class AtlasMapEntry:
    """A verified planetary map entry in the Marswalk Planetary Atlas."""

    id: str
    canonical_id: str
    name: str
    category: AtlasCategory
    product_type: ProductType
    epistemic_class: str
    instrument_mission: str
    source_organisation: str
    product_identifier: str
    doi_or_url: str
    original_spatial_resolution: str
    processing_resolution: str
    spatial_coverage: str
    coverage_bounds: list[list[float]]  # [[min_lat, min_lon], [max_lat, max_lon]]
    crs: str
    vertical_datum: str
    processing_history: str
    licence_attribution: str
    validation_status: ValidationStatus
    known_limitations: str
    description: str
    native_crs: str = ""
    processing_crs: str = ""
    display_crs: str = ""
    observation_date: str = "Archive Mission Reference"
    layer_id: str | None = None
    default_enabled: bool = False
    tags: tuple[str, ...] = ()

    # Backwards-compatibility property accessors
    @property
    def resolution(self) -> str:
        return self.original_spatial_resolution

    @property
    def coverage(self) -> str:
        return self.spatial_coverage

    @property
    def source(self) -> str:
        return self.source_organisation

    @property
    def caveats_limitations(self) -> str:
        return self.known_limitations

    @property
    def processing_status(self) -> str:
        return f"{self.validation_status.value} ({self.processing_resolution})"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "canonical_id": self.canonical_id,
            "name": self.name,
            "category": self.category.value,
            "category_name": CATEGORY_METADATA[self.category]["title"],
            "category_icon": CATEGORY_METADATA[self.category]["icon"],
            "product_type": self.product_type.value,
            "epistemic_class": self.epistemic_class,
            "instrument_mission": self.instrument_mission,
            "mission_instrument": self.instrument_mission,
            "source_organisation": self.source_organisation,
            "source": self.source_organisation,
            "product_identifier": self.product_identifier,
            "doi_or_url": self.doi_or_url,
            "original_spatial_resolution": self.original_spatial_resolution,
            "resolution": self.original_spatial_resolution,
            "processing_resolution": self.processing_resolution,
            "spatial_coverage": self.spatial_coverage,
            "coverage": self.spatial_coverage,
            "coverage_bounds": self.coverage_bounds,
            "crs": self.crs,
            "native_crs": self.native_crs or self.crs,
            "processing_crs": self.processing_crs or self.crs,
            "display_crs": self.display_crs or "IAU_2015:49900 (Mars 2015 Equirectangular Display)",
            "vertical_datum": self.vertical_datum,
            "processing_history": self.processing_history,
            "processing_status": self.processing_status,
            "licence_attribution": self.licence_attribution,
            "validation_status": self.validation_status.value,
            "known_limitations": self.known_limitations,
            "caveats_limitations": self.known_limitations,
            "description": self.description,
            "observation_date": self.observation_date,
            "layer_id": self.layer_id,
            "default_enabled": self.default_enabled,
            "tags": list(self.tags),
        }


# Complete catalog of authentic planetary maps across all 11 categories
ATLAS_CATALOGUE: list[AtlasMapEntry] = [
    # -------------------------------------------------------------------------
    # 1. GLOBAL MARS MAPS (6 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-global-01",
        canonical_id="PLN-SRC-01",
        name="MOLA Global Mission Elevation Grid (MEGDR)",
        category=AtlasCategory.GLOBAL_MARS,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.OBSERVED.value,
        instrument_mission="Mars Global Surveyor / MOLA Altimeter",
        source_organisation="NASA PDS Geosciences Node / GSFC",
        product_identifier="megt90n000cb.img",
        doi_or_url="https://pds-geosciences.wustl.edu/missions/mgs/mola.html",
        original_spatial_resolution="128 pixels/degree (~463 m/pixel at equator)",
        processing_resolution="Native Gridded Record (Unresampled)",
        spatial_coverage="Global Mars (-90° to +90° Lat, -180° to +180° Lon)",
        coverage_bounds=[[-90.0, -180.0], [90.0, 180.0]],
        crs="Planetocentric Plate Carrée (IAU_2015:49900 Mars Sphere)",
        vertical_datum=(
            "Mars Gravitational Areoid (GMM-2B equipotential surface, mean equatorial "
            "radius R_ref = 3,396,000 m)"
        ),
        processing_history=(
            "MGS orbital crossover range solution with zero areoid reference. "
            "Local grid: data/raw/mola/megt90n000cb.img "
            "(SHA-256: 25f16fb7aaf857898dcf98bc4f841341a24f8b9f7e98453ca083bc45d897ca2c)."
        ),
        licence_attribution="NASA Open Data Policy (Public Domain)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Post spacing (~463m) is inadequate for EVA micro-hazard detection or local "
            "rock avoidance."
        ),
        description=(
            "Fundamental global elevation baseline defining the zero equipotential surface "
            "(areoid) of Mars."
        ),
        native_crs="IAU_2000 Mars Planetocentric Cylindrical (Sphere R=3,396,190 m)",
        processing_crs="IAU_2015:49900 (Mars Sphere R=3,396,190 m, Planetocentric Lat/Lon)",
        display_crs="IAU_2015:49900 (Equirectangular Mars Sphere Display)",
        observation_date="1999–2006 (MGS Primary & Extended Mission)",
        layer_id="mola_global_elevation",
        default_enabled=False,
        tags=("mola", "global", "elevation", "areoid", "altimetry", "topography"),
    ),
    AtlasMapEntry(
        id="atlas-global-02",
        canonical_id="PLN-DRV-01",
        name="MOLA Global Shaded Relief Basemap",
        category=AtlasCategory.GLOBAL_MARS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="MGS MOLA Synthesis / USGS Astrogeology",
        source_organisation="USGS Astrogeology Science Center",
        product_identifier="MOLA_bw (WMS Layer)",
        doi_or_url=(
            "https://planetarymaps.usgs.gov/cgi- bin/mapserv?map=/maps/mars/mars_simp_cyl.map"
        ),
        original_spatial_resolution="128 pixels/degree (~463 m/pixel)",
        processing_resolution="128 pixels/degree WMS Pyramidal Stream",
        spatial_coverage="Global Mars (-90° to +90° Lat, -180° to +180° Lon)",
        coverage_bounds=[[-90.0, -180.0], [90.0, 180.0]],
        crs="Planetocentric Plate Carrée (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Analytical Lambertian hillshade computed by USGS Astrogeology from MOLA MEGDR "
            "topography."
        ),
        licence_attribution="USGS Open Science / Public Domain",
        validation_status=ValidationStatus.VERIFIED_REMOTE_WMS,
        known_limitations=(
            "Illumination from single virtual azimuth creates unidirectional shadowing bias "
            "on North-South features."
        ),
        description=(
            "Global grayscale shaded relief basemap emphasizing planetary impact craters "
            "and volcanic provinces."
        ),
        native_crs="IAU_2000 Simple Cylindrical (USGS Astrogeology)",
        processing_crs="IAU_2015:49900 (WMS Pyramidal Render)",
        display_crs="IAU_2015:49900 (Equirectangular Display, Leaflet / EPSG:4326)",
        observation_date="Synthesized 2003 (USGS Open-File Report 03-357)",
        layer_id="mola_shaded_relief",
        default_enabled=True,
        tags=("mola", "shaded-relief", "basemap", "global", "usgs"),
    ),
    AtlasMapEntry(
        id="atlas-global-03",
        canonical_id="PLN-SRC-02",
        name="THEMIS Global Daytime Infrared Mosaic",
        category=AtlasCategory.GLOBAL_MARS,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.OBSERVED.value,
        instrument_mission="2001 Mars Odyssey / THEMIS IR Camera",
        source_organisation="Arizona State University / USGS Astrogeology",
        product_identifier="THEMIS_controlled (WMS Layer)",
        doi_or_url="https://themis.asu.edu/maps",
        original_spatial_resolution="100 m/pixel",
        processing_resolution="100 m/pixel WMS Controlled Mosaic",
        spatial_coverage="Near-Global Mars (-85° to +85° Lat, -180° to +180° Lon)",
        coverage_bounds=[[-85.0, -180.0], [85.0, 180.0]],
        crs="Equatorial Cylindrical (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Radiometrically calibrated Band 9 (12.57 um) daytime radiance frames "
            "tie-pointed and blended."
        ),
        licence_attribution="NASA Open Data Policy (ASU / JPL)",
        validation_status=ValidationStatus.VERIFIED_REMOTE_WMS,
        known_limitations=(
            "Coverage drops at high latitudes (>85°); atmospheric dust variations introduce "
            "slight tile-boundary seams."
        ),
        description=(
            "Global thermal infrared radiance highlighting exposed rocky outcrop versus "
            "mantling fine dust."
        ),
        native_crs="IAU_2000 Simple Cylindrical (themis.asu.edu WMS, R=3,396,190 m)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2002–Present (Odyssey Mission)",
        layer_id="themis_day_ir",
        default_enabled=False,
        tags=("themis", "infrared", "daytime", "odyssey", "thermal", "global"),
    ),
    AtlasMapEntry(
        id="atlas-global-04",
        canonical_id="PLN-SRC-03",
        name="THEMIS Global Nighttime Thermal Infrared Mosaic",
        category=AtlasCategory.GLOBAL_MARS,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.OBSERVED.value,
        instrument_mission="2001 Mars Odyssey / THEMIS IR Camera",
        source_organisation="Arizona State University / USGS Astrogeology",
        product_identifier="THEMIS_night (WMS Layer)",
        doi_or_url="https://themis.asu.edu/maps",
        original_spatial_resolution="100 m/pixel",
        processing_resolution="100 m/pixel WMS Controlled Stream",
        spatial_coverage="Near-Global Mars (-85° to +85° Lat, -180° to +180° Lon)",
        coverage_bounds=[[-85.0, -180.0], [85.0, 180.0]],
        crs="IAU_2015:49900",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Band 9 nocturnal brightness temperature orthorectified and controlled to MOLA "
            "geodetic network."
        ),
        licence_attribution="NASA Open Data Policy (ASU / JPL)",
        validation_status=ValidationStatus.VERIFIED_REMOTE_WMS,
        known_limitations=(
            "Strongly influenced by seasonal thermal inertia and atmospheric dust opacity "
            "variations."
        ),
        description=(
            "Nocturnal thermal infrared emission mapping surface thermophysical properties: "
            "warm bedrock stands out from cold dust."
        ),
        native_crs="IAU_2000 Simple Cylindrical (themis.asu.edu WMS, R=3,396,190 m)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2002–Present (Odyssey Mission)",
        layer_id="themis_night_ir",
        default_enabled=False,
        tags=("themis", "night-ir", "thermal-inertia", "regolith", "global"),
    ),
    AtlasMapEntry(
        id="atlas-global-06",
        canonical_id="PLN-SRC-04",
        name="Viking Orbiter MDIM 2.1 Visual Color Mosaic",
        category=AtlasCategory.GLOBAL_MARS,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.OBSERVED.value,
        instrument_mission="Viking Orbiters 1 & 2 / Visual Imaging Subsystem (VIS)",
        source_organisation="USGS Astrogeology / NASA Trek",
        product_identifier="Mars_Viking_MDIM21_ClrMosaic_global_232m",
        doi_or_url="https://trek.nasa.gov/mars/",
        original_spatial_resolution="232 m/pixel (256 pixels/degree)",
        processing_resolution="232 m/pixel WMTS Tile Service",
        spatial_coverage="Global Mars (-90° to +90° Lat, -180° to +180° Lon)",
        coverage_bounds=[[-90.0, -180.0], [90.0, 180.0]],
        crs="Planetocentric Equirectangular (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "USGS MDIM 2.1 photometrically normalized and color-calibrated visual mosaic "
            "tied to MOLA geodesy."
        ),
        licence_attribution="NASA Open Data Policy (Public Domain)",
        validation_status=ValidationStatus.VERIFIED_REMOTE_WMTS,
        known_limitations=(
            "Viking-era imaging (1976-1980) has lower signal-to-noise ratio in low-contrast "
            "dust-mantled basins."
        ),
        description=(
            "Historical global true-color reference mosaic defining visual albedo features "
            "across Mars."
        ),
        native_crs="IAU_2000 Sinusoidal / Simple Cylindrical (USGS Flagstaff)",
        processing_crs="IAU_2015:49900 (NASA Trek Tile Service)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="1976–1980 (Viking Orbiter Mission)",
        layer_id="viking_mdim21",
        default_enabled=False,
        tags=("viking", "mdim", "color", "visual", "albedo", "global"),
    ),
    AtlasMapEntry(
        id="atlas-global-05",
        canonical_id="PLN-INT-01",
        name="USGS Global Geologic Map of Mars (SIM-3292)",
        category=AtlasCategory.GLOBAL_MARS,
        product_type=ProductType.INT,
        epistemic_class=EpistemicClass.INTERPRETED.value,
        instrument_mission="Global Spacecraft Synthesis / Tanaka et al. (2014)",
        source_organisation="USGS Astrogeology Science Center",
        product_identifier="USGS SIM-3292 (Pamphlet & Geologic GIS Database)",
        doi_or_url="https://doi.org/10.3133/sim3292",
        original_spatial_resolution="1:20,000,000 Nominal Scale",
        processing_resolution="Vector GIS Polygons / Planetary Scale",
        spatial_coverage="Global Mars (-90° to +90° Lat, -180° to +180° Lon)",
        coverage_bounds=[[-90.0, -180.0], [90.0, 180.0]],
        crs="IAU_2015:49900 (Mars Sphere)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Peer-reviewed planetary chronostratigraphic compilation synthesizing MGS, "
            "Odyssey, MRO, and MEX observations."
        ),
        licence_attribution="USGS Open Access / Public Domain",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Regional mapping scale (1:20M) cannot resolve outcrop-scale sedimentary beds "
            "in Jezero delta."
        ),
        description=(
            "Authoritative planetary stratigraphic unit classification dividing Mars into "
            "Noachian, Hesperian, and Amazonian epochs."
        ),
        native_crs="IAU_2000 Mars Polar Stereographic / Simple Cylindrical (USGS)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Published 2014 (Tanaka et al., USGS SIM 3292)",
        layer_id=None,
        default_enabled=False,
        tags=("geology", "global", "stratigraphy", "tanaka", "usgs", "epochs"),
    ),
    # -------------------------------------------------------------------------
    # 2. REGIONAL MARS MAPS (3 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-regional-01",
        canonical_id="PLN-SRC-05",
        name="USGS Mars 2020 TRN CTX Controlled Orthoimage Mosaic",
        category=AtlasCategory.REGIONAL_MARS,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.OBSERVED.value,
        instrument_mission="Mars Reconnaissance Orbiter / Context Camera (CTX)",
        source_organisation="USGS Astrogeology Science Center",
        product_identifier="JEZ_ctx_B_soc_008_orthoMosaic_6m.tif",
        doi_or_url="https://doi.org/10.5066/P9GV1ND3",
        original_spatial_resolution="6.0 m/pixel",
        processing_resolution="6.0 m/pixel (Native GeoTIFF)",
        spatial_coverage="Jezero Crater & Regional Rim (60 km x 60 km)",
        coverage_bounds=[[18.15, 77.15], [18.7, 77.75]],
        crs="Equirectangular Mars Sphere (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "USGS Astrogeology Terrain-Relative Navigation bundle-adjusted orthoimage "
            "mosaic tied to HRSC control."
        ),
        licence_attribution="USGS / NASA Open Data Policy (Public Domain)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Sub-6m rocks, vehicle tracks, and meter-scale fractures are unresolved at 6m "
            "pixel spacing."
        ),
        description=(
            "Controlled panchromatic orthomosaic providing synoptic context for Jezero "
            "Crater and Western Delta."
        ),
        native_crs=(
            "ESRI:103885 (Equirectangular, Mars Sphere R=3,396,190 m, standard parallel 0.0°)"
        ),
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2007–2018 (MRO CTX Ingestion)",
        layer_id="ctx_orthomosaic",
        default_enabled=True,
        tags=("ctx", "jezero", "regional", "orthomosaic", "trn", "usgs", "mro"),
    ),
    AtlasMapEntry(
        id="atlas-regional-02",
        canonical_id="PLN-SRC-06",
        name="USGS Mars 2020 TRN Context Camera (CTX) Regional DTM",
        category=AtlasCategory.REGIONAL_MARS,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Mars Reconnaissance Orbiter / Context Camera (CTX)",
        source_organisation="USGS Astrogeology Science Center",
        product_identifier="JEZ_ctx_B_soc_008_DTM_20m.tif",
        doi_or_url="https://doi.org/10.5066/P906QQT8",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Analysis Baseline)",
        spatial_coverage="Jezero Crater Regional Basin (60 km x 60 km)",
        coverage_bounds=[[18.15, 77.15], [18.7, 77.75]],
        crs="Equirectangular Mars Sphere (ESRI:103885)",
        vertical_datum=(
            "Mars Gravitational Areoid (MOLA reference datum, R_ref = 3,396,000 m, Jezero "
            "undulation N ~ -830m to -850m)"
        ),
        processing_history=(
            "SOCET SET photogrammetric stereopair extraction tied to MOLA MEGDR vertical datum."
        ),
        licence_attribution="USGS / NASA Open Data Policy (Public Domain)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Vertical elevation uncertainty sigma_z ~ 2.0m; scarp slopes over 25° appear "
            "slightly smoothed at 20m."
        ),
        description=(
            "Authentic 20m digital elevation model covering Jezero Crater floor, western "
            "fan, and inflow breach."
        ),
        native_crs=(
            "ESRI:103885 (Equirectangular, Mars Sphere R=3,396,190 m, standard parallel 0.0°)"
        ),
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2007–2018 (Stereo Pair Ingestion)",
        layer_id="ctx_20m_dtm",
        default_enabled=True,
        tags=("ctx", "dtm", "elevation", "jezero", "regional", "usgs", "trn"),
    ),
    AtlasMapEntry(
        id="atlas-regional-03",
        canonical_id="PLN-SRC-07",
        name="ESA Mars Express HRSC Jezero Crater Regional Color & DEM",
        category=AtlasCategory.REGIONAL_MARS,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Mars Express / High Resolution Stereo Camera (HRSC)",
        source_organisation="ESA Planetary Science Archive / DLR",
        product_identifier="h5270_0000_dt4.img (Orbit 5270)",
        doi_or_url="https://archives.esac.esa.int/psa/#!Table%20View/HRSC=instrument",
        original_spatial_resolution="50.0 m/pixel (DTM), 12.5 m/pixel (Color)",
        processing_resolution="50.0 m/pixel ESA Archive Record",
        spatial_coverage="Jezero Watershed & Syrtis Major Highland Strip",
        coverage_bounds=[[16.5, 75.0], [20.0, 80.0]],
        crs="Sinusoidal / Equirectangular (IAU_2015:49900)",
        vertical_datum="Mars Gravitational Areoid (MOLA datum, R_ref = 3,396,000 m)",
        processing_history=(
            "DLR multi-line pushbroom stereophotogrammetry photometrically adjusted to "
            "regional control."
        ),
        licence_attribution="ESA Open Access Policy (CC BY-SA 3.0 IGO)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Intermediate resolution between MOLA and CTX; orbital atmospheric haze varies "
            "across strip."
        ),
        description=(
            "Regional context strip covering Jezero Crater within its broad Nili Fossae "
            "volcanic and fluvial watershed."
        ),
        native_crs="Sinusoidal on Mars Ellipsoid (IAU 2000, a=3396.19 km, b=3376.20 km)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2008-02-14 (MEX Orbit 5270)",
        layer_id=None,
        default_enabled=False,
        tags=("hrsc", "mex", "esa", "regional", "watershed", "syrtis_major"),
    ),
    # -------------------------------------------------------------------------
    # 3. HIGH-RESOLUTION LOCAL MAPS (2 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-local-01",
        canonical_id="PLN-SRC-08",
        name="USGS Mars 2020 TRN HiRISE DTM Mosaic (Delta Jezero DL)",
        category=AtlasCategory.HIGH_RES_LOCAL,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Mars Reconnaissance Orbiter / HiRISE Camera",
        source_organisation="USGS Astrogeology Science Center / UA HiRISE Team",
        product_identifier=(
            "HiRISE_DTM_Delta_Jezero_DL_1m.tif (Stereo Pair: ESP_049906_1990 / "
            "ESP_050618_1990; PDS DTM: DTEEC_049906_1990_050618_1990_A01)"
        ),
        doi_or_url="https://doi.org/10.5066/P9REJ9JN",
        original_spatial_resolution="1.0 m/pixel",
        processing_resolution="1.0 m/pixel (Native Stereo Elevation Grid)",
        spatial_coverage="Jezero Crater Western Fan Delta (7.2 km x 11.7 km)",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular Mars Sphere (ESRI:103885)",
        vertical_datum=(
            "Mars Gravitational Areoid (MOLA datum, R_ref = 3,396,000 m, Jezero undulation "
            "N ~ -830m to -850m)"
        ),
        processing_history=(
            "Stereo reconstruction of HiRISE pair ESP_049906_1990 and ESP_050618_1990 using "
            "USGS ISIS3 and SOCET SET. Exported as Down-Leveled ('DL') mosaic clipped to "
            "Western Delta landing study area at 1.0 m/pixel post spacing, tied to MOLA "
            "areoid elevation datum. Local file SHA-256: "
            "1cd061c66ce4a9f38afade744256009b7e5c1fa40d8ddad3d14d6eba887bbdc1."
        ),
        licence_attribution="NASA / USGS / UA HiRISE Open Data (Public Domain)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Confined to western delta scarp and immediate crater floor; coverage does not "
            "extend to eastern rim."
        ),
        description=(
            "Authentic 1.0 m/pixel digital elevation model resolving metre-scale boulders, "
            "channels, and bedrock ledges."
        ),
        native_crs=(
            "ESRI:103885 (Equirectangular Mars Sphere, R=3,396,190 m, standard parallel 0.0°)"
        ),
        processing_crs="ESRI:103885 (Jezero Western Delta 20m / 1m Local Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2017-03-24 (Stereo Pair Acquisition)",
        layer_id="hirise_1m_dtm",
        default_enabled=True,
        tags=("hirise", "1m", "dtm", "elevation", "western_delta", "usgs", "trn"),
    ),
    AtlasMapEntry(
        id="atlas-local-02",
        canonical_id="PLN-SRC-09",
        name="HiRISE Orthorectified Visible Radiance Footprint (0.25m)",
        category=AtlasCategory.HIGH_RES_LOCAL,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.OBSERVED.value,
        instrument_mission="Mars Reconnaissance Orbiter / HiRISE Camera",
        source_organisation="University of Arizona / NASA PDS",
        product_identifier="PSP_003923_1985_RED.JP2",
        doi_or_url="https://doi.org/10.5066/P9QJDP48",
        original_spatial_resolution="0.25 m/pixel",
        processing_resolution="0.25 m/pixel Panchromatic Radiance",
        spatial_coverage="Jezero Western Delta Scarp Footprint (6 km x 20 km)",
        coverage_bounds=[[18.4, 77.36], [18.55, 77.48]],
        crs="Equirectangular (IAU_2015:49900 / ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Radiometrically calibrated RED channel orthorectified onto HiRISE DTM."
        ),
        licence_attribution="NASA / UA HiRISE Team (Public Domain)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Single orbital pass geometry; shadows vary strongly with local solar time (LST 15:14)."
        ),
        description=(
            "Sub-meter orthorectified visible image resolving meter-scale boulders, sand "
            "ripples, and rover tracks."
        ),
        native_crs="ESRI:103885 (Equirectangular Mars Sphere, R=3,396,190 m)",
        processing_crs="ESRI:103885",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2007-05-30 (HiRISE Primary Science Phase)",
        layer_id="hirise_visible_ortho",
        default_enabled=False,
        tags=("hirise", "ortho", "submeter", "visible", "boulders", "delta"),
    ),
    # -------------------------------------------------------------------------
    # 4. ELEVATION AND TOPOGRAPHY (3 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-elev-01",
        canonical_id="PLN-DRV-02",
        name="Jezero Western Delta 20m ARD Elevation Grid",
        category=AtlasCategory.ELEVATION_TOPOGRAPHY,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Ingestion Pipeline (Fused HiRISE & CTX)",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_elevation.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_elevation.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Analysis Ready Grid: 742 x 1002 cells)",
        spatial_coverage="Marswalk Primary Research Area (20 km x 14.8 km)",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular Mars Sphere (ESRI:103885)",
        vertical_datum=(
            "Mars Gravitational Areoid (MOLA datum, R_ref = 3,396,000 m, elevations -2599m "
            "to -2240m)"
        ),
        processing_history=(
            "Area-weighted conservative downsampling of 1m HiRISE DTM fused with 20m CTX baseline."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations="Resampled grid does not fabricate sub-20m micro-topography.",
        description=(
            "Unified analysis-ready digital elevation model powering route gradient "
            "calculations and viewsheds."
        ),
        native_crs="ESRI:103885 (Equirectangular Mars Sphere, R=3,396,190 m)",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Generated 2026 (Marswalk Pipeline)",
        layer_id="analysis_grid_elevation",
        default_enabled=True,
        tags=("ard", "elevation", "grid", "jezero", "dtm", "areoid"),
    ),
    AtlasMapEntry(
        id="atlas-elev-02",
        canonical_id="PLN-VEC-01",
        name="Jezero Western Delta 50m Topographic Elevation Contours",
        category=AtlasCategory.ELEVATION_TOPOGRAPHY,
        product_type=ProductType.VEC,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Cartographic Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_contours_50m.geojson",
        doi_or_url="file:///data/processed/jezero_western_delta_contours_50m.geojson",
        original_spatial_resolution="50 m elevation contour intervals",
        processing_resolution="Vector LineString FeatureCollection",
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular Mars Sphere (ESRI:103885)",
        vertical_datum="Mars Gravitational Areoid (MOLA datum, R_ref = 3,396,000 m)",
        processing_history=(
            "Marching squares contour extraction with topological saddle disambiguation."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Index contours at 50m spacing do not represent sub-50m benches or micro- terraces."
        ),
        description=(
            "Vector contour lines at 50-meter intervals defining delta scarp geometry and "
            "regional elevation drop."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Generated 2026 (Marswalk Engine)",
        layer_id="contours_50m",
        default_enabled=False,
        tags=("contours", "vector", "50m", "elevation", "cartography", "topography"),
    ),
    AtlasMapEntry(
        id="atlas-elev-03",
        canonical_id="PLN-VEC-02",
        name="Jezero Western Delta 10m High-Resolution Contours",
        category=AtlasCategory.ELEVATION_TOPOGRAPHY,
        product_type=ProductType.VEC,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Cartographic Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_contours_10m.geojson",
        doi_or_url="file:///data/processed/jezero_western_delta_contours_10m.geojson",
        original_spatial_resolution="10 m elevation contour intervals",
        processing_resolution="Vector LineString FeatureCollection",
        spatial_coverage="Jezero Western Delta Fan Scarp",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular Mars Sphere (ESRI:103885)",
        vertical_datum="Mars Gravitational Areoid (MOLA datum, R_ref = 3,396,000 m)",
        processing_history="Sub-pixel marching squares extraction from 1m HiRISE DTM mosaic.",
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Higher vertex density; recommended for local EVA planning zoom levels 13-16."
        ),
        description=(
            "Detailed 10-meter vector contour lines resolving delta lobe step-downs and "
            "crater rims."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Generated 2026 (Marswalk Engine)",
        layer_id="contours_10m",
        default_enabled=False,
        tags=("contours", "vector", "10m", "elevation", "high_res", "topography"),
    ),
    # -------------------------------------------------------------------------
    # 5. TERRAIN ANALYSIS (7 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-terrain-01",
        canonical_id="PLN-DRV-03",
        name="Horn's Slope Gradient Surface Normal Map",
        category=AtlasCategory.TERRAIN_ANALYSIS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Terrain Intelligence Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_slope_deg.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_slope_deg.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Float32 in Degrees: 0.0° - 42.8°)",
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Horn (1981) 3x3 finite-difference correlation with distance weighting."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "20m cell spacing aggregates local boulder faces and vertical ledges into "
            "smoothed gradients."
        ),
        description=(
            "Rigorous surface gradient map identifying walkable terrain (<15°), cautionary "
            "slopes (15°-25°), and impassable cliffs (>25°)."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="terrain_slope",
        default_enabled=True,
        tags=("slope", "horn", "gradient", "terrain", "traversability"),
    ),
    AtlasMapEntry(
        id="atlas-terrain-04",
        canonical_id="PLN-DRV-04",
        name="Downhill Slope Aspect Compass Gradient Map",
        category=AtlasCategory.TERRAIN_ANALYSIS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Terrain Intelligence Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_aspect_deg.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_aspect_deg.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Float32 in Degrees: 0° - 360°)",
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Computed downhill steepest descent azimuth atan2(-dz/dx, -dz/dy) mod 360."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Aspect values on flat basin floors (<0.5° slope) have high azimuthal "
            "sensitivity to sensor noise."
        ),
        description=(
            "Compass orientation of steepest descent governing solar illumination angles "
            "and downhill slide trajectories."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Dynamic In-Engine Gradient)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="terrain_aspect",
        default_enabled=False,
        tags=("aspect", "compass", "azimuth", "downhill", "solar_flux"),
    ),
    AtlasMapEntry(
        id="atlas-terrain-05",
        canonical_id="PLN-DRV-05",
        name="Single-Azimuth Analytical Hillshade (315° Azimuth)",
        category=AtlasCategory.TERRAIN_ANALYSIS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Terrain Intelligence Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_hillshade.png",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_hillshade.png",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (8-bit Grayscale)",
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=("Lambertian illumination with sun azimuth 315° (NW) and altitude 45°."),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Northwest illumination casts deep shadows obscuring southeast crater walls."
        ),
        description=(
            "Standard single-source hillshade visualization highlighting regional "
            "topographic relief."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="terrain_hillshade",
        default_enabled=False,
        tags=("hillshade", "lambertian", "relief", "illumination"),
    ),
    AtlasMapEntry(
        id="atlas-terrain-06",
        canonical_id="PLN-DRV-06",
        name="Mark (1992) Orthogonal Multi-Directional Hillshade",
        category=AtlasCategory.TERRAIN_ANALYSIS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Terrain Intelligence Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_multidirectional_hillshade.png",
        doi_or_url=(
            "file:///data/processed/jezero_western_delta_20m_multidirectional_hillshade.png"
        ),
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (8-bit Grayscale)",
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Mark (1992) orthogonal 4-source illumination (225°, 315°, 45°, 135°) weighted "
            "at 0.25 each."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Slightly lowers localized contrast compared to harsh single-source shadowing."
        ),
        description=(
            "Unbiased multi-directional hillshade illuminating craters and scarps evenly "
            "from all four cardinal quadrants."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="terrain_multishade",
        default_enabled=False,
        tags=("multishade", "orthogonal", "mark1992", "unbiased", "relief"),
    ),
    AtlasMapEntry(
        id="atlas-terrain-07",
        canonical_id="PLN-DRV-07",
        name="Riley Terrain Ruggedness Index (TRI)",
        category=AtlasCategory.TERRAIN_ANALYSIS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Terrain Intelligence Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_tri_roughness_m.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_tri_roughness_m.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Float32 in Metres: 0.0m - 18.4m)",
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Riley et al. (1999) 3x3 moving window root-mean-square elevation difference."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Correlates strongly with steep planar slopes; use VRM to decouple roughness "
            "from inclination."
        ),
        description=(
            "Quantitative measure of elevation heterogeneity distinguishing smooth plains "
            "from dissected scarps."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="terrain_tri",
        default_enabled=False,
        tags=("tri", "ruggedness", "roughness", "riley", "geomorphology"),
    ),
    AtlasMapEntry(
        id="atlas-terrain-02",
        canonical_id="PLN-DRV-08",
        name="Vector Ruggedness Measure (VRM) Roughness Map",
        category=AtlasCategory.TERRAIN_ANALYSIS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Terrain Intelligence Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_vrm.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_vrm.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Dimensionless Float32 [0.0, 1.0])",
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Hobson (1972) / Sappington et al. (2007) unit surface normal vector dispersion "
            "in 3x3 window."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Window size (3x3 vs 5x5) determines scale of roughness detected; 3x3 at 20m "
            "captures geomorphic breaks."
        ),
        description=(
            "Slope-independent terrain roughness measuring dispersion of 3D unit surface "
            "normal vectors."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="terrain_vrm",
        default_enabled=False,
        tags=("vrm", "ruggedness", "hobson", "sappington", "roughness", "surface_normals"),
    ),
    AtlasMapEntry(
        id="atlas-terrain-03",
        canonical_id="PLN-DRV-09",
        name="Zevenbergen & Thorne Profile & Planform Curvatures",
        category=AtlasCategory.TERRAIN_ANALYSIS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Marswalk Terrain Intelligence Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_profile_curvature.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_profile_curvature.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Float32 in m^-1 x 100)",
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Second-order polynomial surface fitting via Zevenbergen & Thorne (1987) algorithm."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations="Extreme sensitivity to high-frequency DTM stereo-matching noise.",
        description=(
            "Second-order derivative identifying convex delta ridges, concave gullies, and "
            "breaklines."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="terrain_curvature",
        default_enabled=False,
        tags=("curvature", "profile", "planform", "zevenbergen", "ridges", "channels"),
    ),
    # -------------------------------------------------------------------------
    # 6. GEOLOGICAL MAPS (2 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-geol-01",
        canonical_id="PLN-INT-02",
        name="USGS Jezero Crater Scientific Geologic Map (SIM-3464)",
        category=AtlasCategory.GEOLOGICAL,
        product_type=ProductType.INT,
        epistemic_class=EpistemicClass.INTERPRETED.value,
        instrument_mission="USGS Astrogeology / Sun & Stack (2020)",
        source_organisation="USGS Astrogeology Science Center",
        product_identifier="USGS Scientific Investigations Map 3464",
        doi_or_url="https://doi.org/10.3133/sim3464",
        original_spatial_resolution="1:75,000 Map Scale (~10m feature resolution)",
        processing_resolution="Vector Feature Polygons with Lithology & Epoch Attributes",
        spatial_coverage="Jezero Crater Floor, Western Delta, and Inflow Breach",
        coverage_bounds=[[18.25, 77.2], [18.65, 77.65]],
        crs="Equirectangular (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Expert photo-interpretation and stratigraphic classification by USGS Mars 2020 "
            "mapping team."
        ),
        licence_attribution="USGS Open Access / Public Domain",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Geological unit boundaries are interpretive models subject to non-unique "
            "classification."
        ),
        description=(
            "Authoritative stratigraphic mapping delineating the Western Delta front, "
            "crater floor, and rim blocks."
        ),
        native_crs="IAU_2000 Mars Sphere / ESRI:103885 (USGS Astropedia)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Published 2020 (Sun & Stack, USGS SIM 3464)",
        layer_id="geologic_units",
        default_enabled=True,
        tags=("geology", "jezero", "stratigraphy", "sim3464", "delta", "usgs"),
    ),
    AtlasMapEntry(
        id="atlas-geol-02",
        canonical_id="PLN-VEC-03",
        name="Jezero Stratigraphic Unit Contact Boundaries",
        category=AtlasCategory.GEOLOGICAL,
        product_type=ProductType.VEC,
        epistemic_class=EpistemicClass.INTERPRETED.value,
        instrument_mission="Marswalk Geological Context Engine / Sun & Stack",
        source_organisation="USGS / Marswalk",
        product_identifier="jezero_geological_contacts.geojson",
        doi_or_url="file:///docs/science_opportunity.md",
        original_spatial_resolution="1:75,000 LineString Contacts",
        processing_resolution=("Vector LineString Contacts with Lithologic Transition Attributes"),
        spatial_coverage="Jezero Western Fan & Floor Margin",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Extracted contact traces between blocky delta deposits and crater floor "
            "olivine- clastic units."
        ),
        licence_attribution="USGS / Open Data",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Concealed contacts beneath loose modern aeolian sand mantles are inferred."
        ),
        description=(
            "Discrete geologic contact lines demarcating sharp scientific sampling transitions."
        ),
        native_crs="IAU_2015:49900 (Planetocentric East-Positive Lat/Lon)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Synthesized 2026",
        layer_id="geologic_contacts",
        default_enabled=False,
        tags=("contacts", "stratigraphy", "boundaries", "sampling", "transitions"),
    ),
    # -------------------------------------------------------------------------
    # 7. MINERALOGICAL MAPS (3 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-mineral-01",
        canonical_id="PLN-INT-03",
        name="CRISM Fe/Mg-Smectite Clay Mineral Abundance Map",
        category=AtlasCategory.MINERALOGICAL,
        product_type=ProductType.INT,
        epistemic_class=EpistemicClass.INTERPRETED.value,
        instrument_mission="MRO / Compact Reconnaissance Imaging Spectrometer (CRISM)",
        source_organisation="NASA PDS Geosciences Node / JHU-APL",
        product_identifier="HRL000040FF / FRT00005C5E (D2300 Band Depth)",
        doi_or_url="https://doi.org/10.1029/2009JE003439",
        original_spatial_resolution="18.0 m/pixel (Targeted Full-Resolution)",
        processing_resolution="18.0 m/pixel Spectral Absorption Index",
        spatial_coverage="Jezero Western Delta Front & Lower Fan",
        coverage_bounds=[[18.41, 77.38], [18.49, 77.46]],
        crs="Equirectangular (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "CRISM CAT pipeline atmospheric correction, photometric normalization, and "
            "D2300 parameter extraction."
        ),
        licence_attribution="NASA / JHU-APL (Public Domain)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Requires continuous bedrock exposure; fine dust mantling attenuates diagnostic "
            "infrared absorption."
        ),
        description=(
            "Hyperspectral band depth mapping phyllosilicates (smectite clays) indicative "
            "of neutral-pH aqueous alteration."
        ),
        native_crs="IAU_2000 Planetocentric (MRO CRISM Targeted EDR/CDR)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2007–2009 (MRO CRISM Targeted Scans)",
        layer_id="mineral_smectite",
        default_enabled=False,
        tags=("crism", "clay", "smectite", "d2300", "aqueous", "phyllosilicate"),
    ),
    AtlasMapEntry(
        id="atlas-mineral-02",
        canonical_id="PLN-INT-04",
        name="CRISM Magnesium-Carbonate Mineral Absorption Index",
        category=AtlasCategory.MINERALOGICAL,
        product_type=ProductType.INT,
        epistemic_class=EpistemicClass.INTERPRETED.value,
        instrument_mission="MRO / Compact Reconnaissance Imaging Spectrometer (CRISM)",
        source_organisation="NASA PDS Geosciences Node / JHU-APL",
        product_identifier="FRT0000B204 (MIN2290 / BD2300 Spectral Parameter)",
        doi_or_url="https://doi.org/10.1126/science.1164759",
        original_spatial_resolution="18.0 m/pixel",
        processing_resolution="18.0 m/pixel Spectral Parameter Ratio",
        spatial_coverage="Jezero Delta Scarp & Marginal Rim",
        coverage_bounds=[[18.42, 77.39], [18.48, 77.45]],
        crs="Equirectangular (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Spectral parameter extraction isolating 2.3 um and 2.5 um absorption features "
            "of Mg-carbonates."
        ),
        licence_attribution="NASA / JHU-APL (Public Domain)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Narrow spatial footprints cover specific targeted swaths across delta margin."
        ),
        description=(
            "Hyperspectral mapping of magnesium carbonates capable of preserving ancient "
            "biosignatures."
        ),
        native_crs="IAU_2000 Planetocentric (MRO CRISM Targeted EDR/CDR)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2008-08-19 (CRISM FRT0000B204)",
        layer_id="mineral_carbonate",
        default_enabled=False,
        tags=("crism", "carbonate", "magnesium", "biosignature", "paleolake"),
    ),
    AtlasMapEntry(
        id="atlas-mineral-03",
        canonical_id="PLN-INT-05",
        name="CRISM Olivine Absorption Index (OLINDEX3)",
        category=AtlasCategory.MINERALOGICAL,
        product_type=ProductType.INT,
        epistemic_class=EpistemicClass.INTERPRETED.value,
        instrument_mission="MRO / Compact Reconnaissance Imaging Spectrometer (CRISM)",
        source_organisation="NASA PDS Geosciences Node / JHU-APL",
        product_identifier="FRT00005C5E (OLINDEX3 Broad 1.0 um Parameter)",
        doi_or_url="https://doi.org/10.1029/2009JE003439",
        original_spatial_resolution="18.0 m/pixel",
        processing_resolution="18.0 m/pixel Spectral Parameter",
        spatial_coverage="Jezero Crater Floor (Séítah & Máaz Formations)",
        coverage_bounds=[[18.4, 77.4], [18.46, 77.48]],
        crs="Equirectangular (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "CRISM OLINDEX3 band depth extraction measuring broad Fe2+ absorption in "
            "olivine crystal lattices."
        ),
        licence_attribution="NASA / JHU-APL (Public Domain)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Mixes with pyroxene and basaltic glass spectral signatures on sandy floor plains."
        ),
        description=(
            "Spectral mapping of primary igneous olivine on the crater floor dating the "
            "pre- lacustrine crust."
        ),
        native_crs="IAU_2000 Planetocentric (MRO CRISM Targeted EDR/CDR)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2007-06-12 (CRISM FRT00005C5E)",
        layer_id="mineral_olivine",
        default_enabled=False,
        tags=("crism", "olivine", "olindex3", "igneous", "crater_floor", "sejtah"),
    ),
    # -------------------------------------------------------------------------
    # 8. SURFACE PROPERTY MAPS (4 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-surf-01",
        canonical_id="PLN-SRC-10",
        name="Regional Thermal Inertia (THEMIS / TES Multi-Scale Synthesis)",
        category=AtlasCategory.SURFACE_PROPERTIES,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Odyssey THEMIS & MGS TES / Putzig et al. (2005)",
        source_organisation="USGS Astrogeology / Planetary Science Institute",
        product_identifier="Putzig_Mellon_2007_MarsThermalInertia",
        doi_or_url="https://doi.org/10.1016/j.icarus.2007.05.013",
        original_spatial_resolution="100 m/pixel (THEMIS) / 3 km/pixel (TES)",
        processing_resolution="Calibrated Regional In-Engine Synthesis (320 TIU at Jezero)",
        spatial_coverage="Jezero Crater Regional Basin",
        coverage_bounds=[[18.15, 77.15], [18.7, 77.75]],
        crs="Equirectangular (IAU_2015:49900)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Multi-point diurnal surface temperature fitting against KRC numerical heat "
            "transfer models."
        ),
        licence_attribution="Open Planetary Science Data (Public Domain)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Assumes homogeneous vertical regolith layering; thin dust coatings can depress "
            "effective bulk TIU."
        ),
        description=(
            "Thermophysical metric distinguishing unconsolidated dust (<100 TIU) from "
            "pebble lags (320 TIU) and solid bedrock (>800 TIU)."
        ),
        native_crs="IAU_2000 Mars Planetocentric Cylindrical",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Synthesized Multi-Mission Record",
        layer_id="surface_thermal_inertia",
        default_enabled=False,
        tags=("thermal_inertia", "tiu", "themis", "tes", "regolith", "bearing_strength"),
    ),
    AtlasMapEntry(
        id="atlas-surf-02",
        canonical_id="PLN-SRC-11",
        name="MGS TES Bolometric Solar Albedo Grid",
        category=AtlasCategory.SURFACE_PROPERTIES,
        product_type=ProductType.SRC,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Mars Global Surveyor / Thermal Emission Spectrometer (TES)",
        source_organisation="Arizona State University / NASA PDS",
        product_identifier="Christensen_2001_TES_Albedo_8ppd",
        doi_or_url="https://doi.org/10.1029/2000JE001374",
        original_spatial_resolution="128 pixels/degree (~463 m/pixel)",
        processing_resolution="Calibrated Regional Grid (0.215 at Jezero Delta)",
        spatial_coverage="Global Mars / Jezero Study Area",
        coverage_bounds=[[-90.0, -180.0], [90.0, 180.0]],
        crs="IAU_2015:49900",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "TES solar band (0.3 - 2.7 um) radiance integrated and photometrically "
            "corrected to zero phase angle."
        ),
        licence_attribution="NASA Open Data Policy (Public Domain)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Low spatial resolution; local bright dust drifts in lee of crater boulders are "
            "averaged out."
        ),
        description=(
            "Broadband surface reflectivity controlling diurnal solar thermal absorption "
            "and spacesuit radiation flux."
        ),
        native_crs="IAU_2000 Mars Planetocentric Cylindrical (8 ppd)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="1999–2006 (MGS Mission)",
        layer_id="surface_albedo",
        default_enabled=False,
        tags=("albedo", "reflectivity", "tes", "solar_flux", "radiative_balance"),
    ),
    AtlasMapEntry(
        id="atlas-surf-03",
        canonical_id="PLN-DRV-10",
        name="Ruff & Christensen TES Dust Cover Index (DCI)",
        category=AtlasCategory.SURFACE_PROPERTIES,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.DERIVED.value,
        instrument_mission="Mars Global Surveyor / Thermal Emission Spectrometer (TES)",
        source_organisation="Arizona State University / Ruff & Christensen (2002)",
        product_identifier="Ruff_Christensen_2002_DCI",
        doi_or_url="https://doi.org/10.1029/2001JE001580",
        original_spatial_resolution="128 pixels/degree (~463 m/pixel)",
        processing_resolution="Calibrated DCI Score (0.962 at Jezero Floor)",
        spatial_coverage="Jezero Crater & Regional Rim",
        coverage_bounds=[[18.15, 77.15], [18.7, 77.75]],
        crs="IAU_2015:49900",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Ratio of 10 um silicate band depth to atmospheric continuum identifying active "
            "wind-scoured terrain."
        ),
        licence_attribution="NASA / ASU Open Research",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Regional scale; does not map decameter-scale transverse aeolian ridges."
        ),
        description=(
            "Spectral metric quantifying atmospheric dust mantling: Jezero score 0.962 "
            "indicates low dust cover and active scouring."
        ),
        native_crs="IAU_2000 Mars Planetocentric Cylindrical (TES)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2002 (Ruff & Christensen, JGR)",
        layer_id="surface_dci",
        default_enabled=False,
        tags=("dci", "dust", "mantling", "scour", "tes", "regolith"),
    ),
    AtlasMapEntry(
        id="atlas-surf-04",
        canonical_id="PLN-SIM-01",
        name="Diurnal Atmospheric-Regolith Thermophysical Model",
        category=AtlasCategory.SURFACE_PROPERTIES,
        product_type=ProductType.SIM,
        epistemic_class=EpistemicClass.SIMULATED.value,
        instrument_mission="Marswalk Planetary Environment Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="marswalk_diurnal_thermal_1d",
        doi_or_url="file:///docs/environmental_scenarios.md",
        original_spatial_resolution="Non-spatial 1D Diurnal Profile (15-minute timesteps)",
        processing_resolution="Thermophysical 1D Numerical Model (185 K to 268 K)",
        spatial_coverage="Jezero Western Delta Study Area",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="N/A (Temporal Profile)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "1D Fourier heat conduction model forced by solar insolation at L_s = 180° with "
            "CO2 atmospheric flux."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Simulated baseline placeholder; does not ingest live telemetry from "
            "Perseverance MEDA sensors."
        ),
        description=(
            "Predicted diurnal temperature swings (185 K night to 268 K day) for astronaut "
            "suit heating and cooling loads."
        ),
        native_crs="NOT_APPLICABLE (1D Point Time-Series)",
        processing_crs="NOT_APPLICABLE",
        display_crs="NOT_APPLICABLE (Diurnal Chart)",
        observation_date="Simulated Model (L_s = 180°)",
        layer_id="diurnal_temperature",
        default_enabled=False,
        tags=("thermal", "temperature", "diurnal", "simulation", "spacesuit", "heat_load"),
    ),
    # -------------------------------------------------------------------------
    # 9. HAZARD MAPS (3 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-hazard-01",
        canonical_id="PLN-DRV-11",
        name="Unified Hard Impassable Traversability Mask",
        category=AtlasCategory.HAZARDS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.HEURISTIC.value,
        instrument_mission="Marswalk Hazard Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_hazard_hard_impassable.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_hazard_hard_impassable.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution=("20.0 m/pixel (Binary Mask: 0 = Traversable, 1 = Hard Impassable)"),
        spatial_coverage="Jezero Western Delta Analysis Grid",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Logical union of slope threshold (>25°), severe boulder clusters, and nodata "
            "boundary regions."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Heuristic walking limit; assumes Apollo-class EVA suit mobility envelope."
        ),
        description=(
            "Non-negotiable binary safety mask forbidding paths across sheer delta scarps "
            "and cliff faces."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="hazard_hard_mask",
        default_enabled=True,
        tags=("hazard", "impassable", "mask", "safety", "no_go", "cliffs"),
    ),
    AtlasMapEntry(
        id="atlas-hazard-02",
        canonical_id="PLN-DRV-12",
        name="Explainable Morphological Boulder & Rock Density Map",
        category=AtlasCategory.HAZARDS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.HEURISTIC.value,
        instrument_mission="Marswalk Computer Vision Hazard Subsystem",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_boulder_hazard_score.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_boulder_hazard_score.tif",
        original_spatial_resolution="20.0 m/pixel (Derived from 1m HiRISE)",
        processing_resolution="20.0 m/pixel (Normalized Risk Score [0.0, 1.0])",
        spatial_coverage="Jezero Western Delta Study Area",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Morphological white top-hat filter paired with directional shadow verification "
            "on 1m HiRISE mosaic."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Requires shadow contrast; sub-meter rocks matching surface albedo can escape "
            "detection."
        ),
        description=(
            "Identifies hazardous boulder fields along the delta front where rocks pose "
            "trip hazards for pressurized spacesuits."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="hazard_boulder_density",
        default_enabled=False,
        tags=("hazard", "boulders", "rocks", "tophat", "trip_hazard"),
    ),
    AtlasMapEntry(
        id="atlas-hazard-03",
        canonical_id="PLN-DRV-13",
        name="Aeolian Dune & Loose Regolith Slip Hazard Map",
        category=AtlasCategory.HAZARDS,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.HEURISTIC.value,
        instrument_mission="Marswalk Terrain Intelligence Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_sand_hazard_score.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_sand_hazard_score.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Normalized Risk Score [0.0, 1.0])",
        spatial_coverage="Jezero Western Delta Study Area",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Fusion of low surface roughness, moderate slope, and low thermal inertia "
            "detecting loose sand traps."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Cannot distinguish thin sand veneer over hard bedrock from deep unpassable "
            "megaripples without radar."
        ),
        description=(
            "Predicts areas with high entrapment risk where loose aeolian sands impede "
            "astronaut and rover locomotion."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="hazard_sand_dunes",
        default_enabled=False,
        tags=("hazard", "sand", "dunes", "slip", "entrapment", "regolith"),
    ),
    # -------------------------------------------------------------------------
    # 10. ROVER EXPLORATION MAPS (2 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-rover-01",
        canonical_id="PLN-VEC-04",
        name="Perseverance Rover Historical Traverse Path (Sols 0–1000+)",
        category=AtlasCategory.ROVER_EXPLORATION,
        product_type=ProductType.VEC,
        epistemic_class=EpistemicClass.OBSERVED.value,
        instrument_mission="NASA Mars 2020 Mission / Perseverance Rover",
        source_organisation="NASA JPL / MMGIS PDS Archive",
        product_identifier="M20_traverse.json (Sols 0 to 1050)",
        doi_or_url="https://mars.nasa.gov/mars2020/mission/where-is-the-rover/",
        original_spatial_resolution="Sub-meter telemetry waypoint coordinates",
        processing_resolution="Vector GeoJSON LineString (35+ km traversed distance)",
        spatial_coverage="Octavia E. Butler Landing Site through Western Delta",
        coverage_bounds=[[18.43, 77.4], [18.46, 77.47]],
        crs="IAU_2015:49900",
        vertical_datum="Mars Gravitational Areoid (MOLA datum, R_ref = 3,396,000 m)",
        processing_history=(
            "Reconstructed surface drive track from rover localization telemetry published "
            "to NASA PDS."
        ),
        licence_attribution="NASA / JPL-Caltech Open Access",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Slip corrections in sandy terrain cause occasional minor odometry adjustments."
        ),
        description=(
            "Authentic ground truth traverse showing proven rover-accessible corridors "
            "across the crater floor and delta fan."
        ),
        native_crs="IAU_2015:49900 (Rover Motion Counter Telemetry)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2021–Present (Sols 0–1050+)",
        layer_id="perseverance_traverse",
        default_enabled=True,
        tags=("perseverance", "rover", "traverse", "mars2020", "sols", "jpl", "ground_truth"),
    ),
    AtlasMapEntry(
        id="atlas-rover-02",
        canonical_id="PLN-VEC-05",
        name="Perseverance Sample Core Collection & Three Forks Depot",
        category=AtlasCategory.ROVER_EXPLORATION,
        product_type=ProductType.VEC,
        epistemic_class=EpistemicClass.INTERPRETED.value,
        instrument_mission="NASA Mars 2020 / Adaptive Caching Assembly (ACA)",
        source_organisation="NASA JPL-Caltech / Mars 2020 Science Team",
        product_identifier="Perseverance_Sample_Depot_Catalog (Sols 0–1050+)",
        doi_or_url="https://mars.nasa.gov/mars-sample-return/mission/samples/",
        original_spatial_resolution="Centimeter-scale drill core coordinates",
        processing_resolution="Vector Point FeatureCollection with Sample Petrology Attributes",
        spatial_coverage="Three Forks Sample Depot & Delta Abrasion Stations",
        coverage_bounds=[[18.435, 77.41], [18.455, 77.45]],
        crs="IAU_2015:49900",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Derived from NASA JPL Mars 2020 Perseverance sample registry and mission logs. "
            "Core identifiers (e.g. Montdenier, Salette, Guillaumes) correlated with USGS "
            "SIM-3464 geologic formations and mapped to rover telemetry drop points."
        ),
        licence_attribution="NASA / JPL-Caltech Open Access",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=(
            "Sample tubes sealed and positioned on ground; access requires careful approach "
            "planning."
        ),
        description=(
            "Catalog of hermetically sealed titanium sample cores and drill stations cached "
            "at Jezero Crater and Three Forks, correlated with USGS SIM-3464 geological "
            "formations."
        ),
        native_crs="IAU_2015:49900 (Planetocentric East-Positive Lat/Lon)",
        processing_crs="IAU_2015:49900",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="2021–Present (Mars 2020)",
        layer_id="perseverance_samples",
        default_enabled=False,
        tags=("samples", "drill_cores", "mars2020", "caches", "three_forks", "msr"),
    ),
    # -------------------------------------------------------------------------
    # 11. MISSION PLANNING MAPS (2 products)
    # -------------------------------------------------------------------------
    AtlasMapEntry(
        id="atlas-plan-01",
        canonical_id="PLN-DRV-14",
        name="Unified Multi-Factor Costmap Engine (Balanced Profile)",
        category=AtlasCategory.MISSION_PLANNING,
        product_type=ProductType.DRV,
        epistemic_class=EpistemicClass.HEURISTIC.value,
        instrument_mission="Marswalk Costmap Synthesis Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="jezero_western_delta_20m_costmap_balanced.tif",
        doi_or_url="file:///data/processed/jezero_western_delta_20m_costmap_balanced.tif",
        original_spatial_resolution="20.0 m/pixel",
        processing_resolution="20.0 m/pixel (Float32 Cost Metric: 0.0 - 1000.0)",
        spatial_coverage="Jezero Western Delta Study Area",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Weighted multi-criteria evaluation combining terrain slope (30%), hazard score "
            "(30%), uncertainty (15%), and science attraction (25%)."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.VERIFIED_LOCAL,
        known_limitations=(
            "Weights are configurable heuristics designed for decision support, not "
            "certified flight software."
        ),
        description=(
            "Comprehensive traversal cost surface guiding A* pathfinding towards high- "
            "science, low-hazard walking corridors."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Jezero Western Delta 20m Analysis Grid)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Current Processing",
        layer_id="costmap_balanced",
        default_enabled=False,
        tags=("costmap", "balanced", "routing", "astar", "multi_objective"),
    ),
    AtlasMapEntry(
        id="atlas-plan-03",
        canonical_id="PLN-SIM-02",
        name="Emergency Dynamic Return-to-Base Corridors",
        category=AtlasCategory.MISSION_PLANNING,
        product_type=ProductType.SIM,
        epistemic_class=EpistemicClass.SIMULATED.value,
        instrument_mission="Marswalk Emergency Rerouting Engine",
        source_organisation="Marswalk Research Architecture",
        product_identifier="marswalk_emergency_corridors_v1",
        doi_or_url="file:///docs/emergency_rerouting.md",
        original_spatial_resolution="Vector Traversal Paths + Dynamic Obstacle Buffers",
        processing_resolution=("Dynamic Real-Time Graph Traversal (1-second reroute computation)"),
        spatial_coverage="Jezero Western Delta Study Area",
        coverage_bounds=[[18.3918, 77.3437], [18.58953, 77.46584]],
        crs="Equirectangular (ESRI:103885)",
        vertical_datum="NOT_APPLICABLE",
        processing_history=(
            "Dynamic Dijkstra/A* execution incorporating real-time hazard exclusion zones "
            "and astronaut metabolic limits."
        ),
        licence_attribution="Public Research Prototype (Open Source)",
        validation_status=ValidationStatus.CATALOGUED,
        known_limitations=("Simulated emergency decision support; not certified flight software."),
        description=(
            "Calculates deterministic, safest-return routes to the habitat or rover base "
            "when sudden environmental hazards occur."
        ),
        native_crs="ESRI:103885",
        processing_crs="ESRI:103885 (Dynamic Graph Network)",
        display_crs="IAU_2015:49900 (Equirectangular Display)",
        observation_date="Dynamic Real-Time Execution",
        layer_id="emergency_corridors",
        default_enabled=False,
        tags=("emergency", "return_to_base", "contingency", "reroute", "abort", "safety"),
    ),
]


def get_all_atlas_entries() -> list[AtlasMapEntry]:
    """Return all catalogued planetary maps across all 11 categories."""
    return ATLAS_CATALOGUE


def get_entries_by_category(category: AtlasCategory | str) -> list[AtlasMapEntry]:
    """Return catalogued maps matching a given category."""
    cat_val = category.value if isinstance(category, AtlasCategory) else str(category)
    return [e for e in ATLAS_CATALOGUE if e.category.value == cat_val]


def search_atlas_entries(
    query: str | None = None,
    category: str | None = None,
    epistemic_class: str | None = None,
    product_type: str | None = None,
    validation_status: str | None = None,
    status: str | None = None,
) -> list[AtlasMapEntry]:
    """Filter atlas entries by search text, category, epistemic class, product type, and status."""
    results = ATLAS_CATALOGUE

    if category and category.lower() != "all":
        results = [e for e in results if e.category.value == category.lower()]

    if epistemic_class and epistemic_class.upper() != "ALL":
        results = [e for e in results if e.epistemic_class == epistemic_class.upper()]

    if product_type and product_type.upper() != "ALL":
        target_pt = product_type.upper()
        results = [e for e in results if e.product_type.value == target_pt]

    if validation_status and validation_status.upper() != "ALL":
        target_vs = validation_status.upper()
        results = [e for e in results if e.validation_status.value == target_vs]

    if status and status.lower() != "all":
        results = [e for e in results if status.lower() in e.processing_status.lower()]

    if query and query.strip():
        q = query.strip().lower()
        filtered = []
        for e in results:
            match = (
                q in e.name.lower()
                or q in e.instrument_mission.lower()
                or q in e.description.lower()
                or q in e.source_organisation.lower()
                or q in e.product_identifier.lower()
                or q in e.canonical_id.lower()
                or q in e.id.lower()
                or any(q in t.lower() for t in e.tags)
            )
            if match:
                filtered.append(e)
        results = filtered

    return results


def get_atlas_entry_by_id(entry_id: str) -> AtlasMapEntry | None:
    """Find a specific atlas map by unique ID, canonical ID, product identifier, or layer ID."""
    target = entry_id.strip().lower()
    for e in ATLAS_CATALOGUE:
        if (
            e.id.lower() == target
            or e.canonical_id.lower() == target
            or e.product_identifier.lower() == target
            or (e.layer_id and e.layer_id.lower() == target)
        ):
            return e
    return None
