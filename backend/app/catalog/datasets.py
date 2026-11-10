"""Planetary datasets catalog and metadata records for Marswalk Planner.

Sourced from verified official dossiers in docs/data_sources.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.epistemic import EpistemicClass


@dataclass(frozen=True)
class PlanetaryDatasetRecord:
    """Authentic archived planetary dataset product record."""

    id: str
    title: str
    agency: str
    instrument: str
    doi_or_urn: str
    resolution: str
    coverage: str
    crs: str
    vertical_datum: str
    file_format: str
    decision: str
    role: str
    caveats: str
    official_url: str
    is_ingested: bool
    epistemic_class: str = EpistemicClass.OBSERVED.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "agency": self.agency,
            "instrument": self.instrument,
            "doiOrUrn": self.doi_or_urn,
            "resolution": self.resolution,
            "coverage": self.coverage,
            "crs": self.crs,
            "verticalDatum": self.vertical_datum,
            "fileFormat": self.file_format,
            "decision": self.decision,
            "role": self.role,
            "caveats": self.caveats,
            "officialUrl": self.official_url,
            "isIngested": self.is_ingested,
            "epistemic_class": self.epistemic_class,
        }


AUTHENTIC_DATASETS: list[PlanetaryDatasetRecord] = [
    PlanetaryDatasetRecord(
        id="product-01",
        title="USGS Mars 2020 TRN HiRISE DTM Mosaic",
        agency="USGS Astrogeology / NASA JPL",
        instrument="High Resolution Imaging Science Experiment (HiRISE)",
        doi_or_urn="10.5066/P9REJ9JN",
        resolution="1.0 m/pixel",
        coverage="Jezero Western Fan & Delta (18.15°N to 18.65°N, 77.20°E to 77.65°E)",
        crs="Equirectangular (IAU Mars 2015 Sphere, R = 3,396,190 m)",
        vertical_datum="Mars Areoid (MOLA Equipotential Zero)",
        file_format="Cloud-Optimized GeoTIFF / ISIS3 Cube",
        decision="ACCEPT",
        role="Primary High-Resolution Topography (Slopes, TRI, Boulders, Hard Limits)",
        caveats=(
            "Stereo HiRISE coverage footprints have narrow margins; deep shadow areas contain "
            "stereo decorrelation artifacts."
        ),
        official_url="https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/HiRISE_DTM_Mosaic",
        is_ingested=True,
    ),
    PlanetaryDatasetRecord(
        id="product-02",
        title="USGS Mars 2020 TRN HiRISE Orthorectified Image Mosaic",
        agency="USGS Astrogeology / NASA JPL",
        instrument="HiRISE Visual Radiance (RED Filter)",
        doi_or_urn="10.5066/P9QJDP48",
        resolution="0.25 m/pixel (25 cm/pixel)",
        coverage="Jezero Western Delta & Crater Floor (100% overlap with Product 1)",
        crs="Equirectangular (IAU Mars 2015 Sphere, IAU_2015:49900)",
        vertical_datum="N/A (Orthorectified Surface Reflectance)",
        file_format="GeoTIFF / JPEG2000",
        decision="ACCEPT",
        role="Primary Visual Basemap, Computer Vision Boulder Shadows, Dune Bedforms",
        caveats=(
            "Single-band visible reflectance; fixed solar illumination azimuth requires "
            "directional shadow handling."
        ),
        official_url="https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/HiRISE_Mosaic",
        is_ingested=True,
    ),
    PlanetaryDatasetRecord(
        id="product-03",
        title="USGS Mars 2020 TRN Context Camera (CTX) DTM Mosaic",
        agency="USGS Astrogeology Science Center",
        instrument="Context Camera (CTX) Stereo Pairs",
        doi_or_urn="10.5066/P906QQT8",
        resolution="20.0 m/pixel",
        coverage="Full Jezero Crater Basin & Western Watershed (~60 km x 60 km)",
        crs="Equirectangular (IAU Mars 2015 Sphere)",
        vertical_datum="Mars Areoid",
        file_format="GeoTIFF / ISIS3",
        decision="ACCEPT",
        role="Regional Topography & Crater-Scale Route Cost Map Analysis",
        caveats=(
            "Smooths micro-topography below 20m; cannot be used alone for human footstep "
            "traversability safety."
        ),
        official_url="https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/CTX_DTM_Mosaic",
        is_ingested=True,
    ),
    PlanetaryDatasetRecord(
        id="product-04",
        title="USGS Mars 2020 TRN CTX Controlled Orthoimage Mosaic",
        agency="USGS Astrogeology Science Center",
        instrument="CTX Panchromatic Radiance (500–800 nm)",
        doi_or_urn="10.5066/P906QQT8",
        resolution="6.0 m/pixel",
        coverage="Jezero Crater & Regional Surrounds",
        crs="Equirectangular (IAU Mars 2015 Sphere)",
        vertical_datum="N/A",
        file_format="GeoTIFF / ISIS3",
        decision="ACCEPT",
        role="Wide-Area Visual Context & Large Geological Unit Boundary Mapping",
        caveats="Sub-meter boulders and narrow crevices unresolvable.",
        official_url="https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/CTX_Mosaic",
        is_ingested=True,
    ),
    PlanetaryDatasetRecord(
        id="product-05",
        title="ESA Mars Express HRSC Jezero Crater DTM & Color Mosaic",
        agency="European Space Agency (ESA) / DLR Berlin",
        instrument="High Resolution Stereo Camera (HRSC)",
        doi_or_urn="ESA-PSA-HRSC-V1.0",
        resolution="50.0 m/pixel DTM, 12.5 m/pixel Color",
        coverage="Regional Jezero Watershed & Syrtis Major Margin",
        crs="Sinusoidal / Equirectangular (Mars Sphere)",
        vertical_datum="Mars Areoid (MOLA Datum)",
        file_format="PDS3 IMG / VICAR / GeoTIFF",
        decision="ACCEPT_WITH_CAVEATS",
        role="Regional Elevation Benchmark & Multispectral Color Context",
        caveats=(
            "Resolution too coarse for tactical EVA safety; serves strictly as secondary "
            "regional context."
        ),
        official_url="https://psa.esa.int/psa/#/pages/search?mission=Mars%20Express",
        is_ingested=False,
    ),
    PlanetaryDatasetRecord(
        id="product-06",
        title="NASA MGS MOLA Mission Elevation Grid (MEGDR)",
        agency="NASA PDS Geosciences Node / GSFC",
        instrument="Mars Orbiter Laser Altimeter (MOLA)",
        doi_or_urn="MGS-M-MOLA-5-MEGDR-L3-V1.0",
        resolution="128 pixels/degree (~463 m/pixel at equator)",
        coverage="Global Mars (-90° to +90° Lat, 0° to 360° Lon)",
        crs="Planetocentric Equirectangular",
        vertical_datum="Mars Areoid (Fundamental Geodetic Zero Definition)",
        file_format="PDS3 IMG / GeoTIFF",
        decision="ACCEPT_WITH_CAVEATS",
        role="Geodetic Elevation Datum Reference for all derived DTMs",
        caveats="Global scale only. Completely inadequate for local slope or route planning.",
        official_url="https://pds-geosciences.wustl.edu/missions/mgs/mola.html",
        is_ingested=True,
    ),
    PlanetaryDatasetRecord(
        id="product-07",
        title="CRISM Targeted Empirical Mineralogical Cube (MTRDR)",
        agency="NASA PDS Geosciences Node / JHU-APL",
        instrument="Compact Reconnaissance Imaging Spectrometer for Mars (CRISM)",
        doi_or_urn="urn:nasa:pds:crism_mtrdr:frt00005850_07_if166l_trr3",
        resolution="18.0 m/pixel hyperspectral (VNIR + IR)",
        coverage="Jezero Western Delta Outcrop",
        crs="Equirectangular (Mars Sphere)",
        vertical_datum="N/A (Spectral Summary Parameters)",
        file_format="PDS3 / CAT ENVI format with detached headers",
        decision="ACCEPT",
        role="Science Opportunity Layer: Carbonate, Smectite, and Hydrated Silica Signatures",
        caveats=(
            "High detector noise in cryocooled IR detector past 2012; must utilize "
            "pre-2012 FRT cubes."
        ),
        official_url="https://pds-geosciences.wustl.edu/missions/mro/crism.htm",
        is_ingested=True,
    ),
    PlanetaryDatasetRecord(
        id="product-08",
        title="USGS Jezero Crater Scientific Geologic Map (SIM-3464)",
        agency="USGS Astrogeology (Sun & Stack, 2020)",
        instrument="Stratigraphic & Morphology Cartographic Synthesis",
        doi_or_urn="10.3133/sim3464",
        resolution="Vector GIS shapefile / GeoPackage (nominal 1:5,000 scale)",
        coverage="Jezero Crater Floor & Western Delta Deposit",
        crs="Equirectangular (IAU Mars 2015 Sphere)",
        vertical_datum="N/A (Stratigraphic Layer Vector Boundaries)",
        file_format="GeoPackage / Shapefile with attribute tables",
        decision="ACCEPT",
        role="Geological Diversity Scoring & Formation Contact Transition Costing",
        caveats=(
            "Cartographic interpretation (epistemic: INTERPRETED); contact boundaries have "
            "inherent human delineation fuzziness."
        ),
        official_url="https://pubs.er.usgs.gov/publication/sim3464",
        is_ingested=True,
    ),
    PlanetaryDatasetRecord(
        id="product-09",
        title="NASA Mars 2020 Perseverance MEDA In-Situ Archive",
        agency="NASA PDS Geosciences Node / CAB-INTA-CSIC",
        instrument="Mars Environmental Dynamics Analyzer (MEDA)",
        doi_or_urn="urn:nasa:pds:mars2020_meda",
        resolution="In-situ time-series (1 Hz ATS, RDS, WS1/WS2 sensors)",
        coverage="Perseverance Traverse Sols 1–1000+ at Jezero Crater",
        crs="Rover Site Frames & IAU_2015:49900",
        vertical_datum="Local Rover Deck / Mars Areoid",
        file_format="PDS4 XML + CSV / Parquet time series tables",
        decision="ACCEPT",
        role="Ground-Truth Historical Martian Weather Baseline (Temperature, Dust Tau, Winds)",
        caveats="Local spot measurements along rover path; not a crater-wide future forecast.",
        official_url="https://pds-geosciences.wustl.edu/missions/mars2020/meda.htm",
        is_ingested=True,
    ),
    PlanetaryDatasetRecord(
        id="product-10",
        title="Mars Climate Database (MCD v6.1) Jezero Regional Model",
        agency="LMD-CNRS / Sorbonne Université / ESA",
        instrument="Numerical Global & Meso-Scale Circulation Model (GCM)",
        doi_or_urn="MCD_v6.1_LMD_CNRS_ESA",
        resolution="5.625° x 3.75° global with local sub-grid Jezero topography",
        coverage="Jezero Crater (18.44°N, 77.45°E) across all Solar Longitudes (Ls 0°–360°)",
        crs="Mars Spherical coordinates",
        vertical_datum="Mars Areoid",
        file_format="NetCDF4 / Fortran API output tables",
        decision="ACCEPT",
        role="Seasonal Diurnal Environmental Suitability Modeling & Scenario Generation",
        caveats=(
            "Numerical climate model simulation (epistemic: CLIMATE_MODELED); does not replace "
            "in-situ monitoring."
        ),
        official_url="http://www-mars.lmd.jussieu.fr/mcd_python/",
        is_ingested=True,
    ),
]


def get_all_datasets() -> list[PlanetaryDatasetRecord]:
    """Return all authentic planetary dataset dossiers."""
    return AUTHENTIC_DATASETS


def get_dataset_by_id(product_id: str) -> PlanetaryDatasetRecord | None:
    """Return specific dataset product dossier by ID."""
    for p in AUTHENTIC_DATASETS:
        if p.id == product_id or p.doi_or_urn == product_id:
            return p
    return None
