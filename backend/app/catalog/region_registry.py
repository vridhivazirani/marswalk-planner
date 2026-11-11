"""Mars Planetary Exploration Atlas — Multi-Region Registry.

Defines the 12 priority Martian exploration regions covering planetary impact basins,
volcanic shields, canyon systems, sedimentary paleolakes, and polar ice caps.

Complies strictly with AGENTS.md:
- Martian Geodesy: IAU_2015:49900 (Mars Sphere, R = 3,396,190 m)
- East-positive longitude in [-180, 180)
- Vertical reference: Mars Gravitational Areoid (R_ref = 3,396,000 m)
- Zero fabricated datasets or URLs.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.epistemic import EpistemicClass


class RegionBoundingBox(BaseModel):
    """Geographic bounding box in planetocentric degrees and east-positive longitude."""

    lat_min: float = Field(..., ge=-90.0, le=90.0)
    lat_max: float = Field(..., ge=-90.0, le=90.0)
    lon_min: float = Field(..., ge=-180.0, le=180.0)
    lon_max: float = Field(..., ge=-180.0, le=180.0)


class RegionDimensions(BaseModel):
    """Physical geographic dimensions of the study area."""

    width_km: float
    height_km: float
    diameter_km: float | None = None
    area_km2: float


class ElevationRange(BaseModel):
    """Topographic elevation range relative to the Mars Gravitational Areoid."""

    min_elevation_m: float
    max_elevation_m: float
    datum: str = "Mars Gravitational Areoid (MOLA MEGDR Areoid Reference)"


class RegionMissionRef(BaseModel):
    """Historical or active surface mission operating within the region."""

    mission_name: str
    spacecraft: str
    landing_date: str
    status: str
    coordinates: list[float]  # [lat, lon]


class RegionDatasetRef(BaseModel):
    """Verified planetary dataset product covering the region."""

    product_id: str
    name: str
    instrument_mission: str
    resolution: str
    storage_type: str  # "VERIFIED_LOCAL" or "VERIFIED_REMOTE"
    epistemic_class: EpistemicClass
    source_portal: str
    coverage_type: str


class RegionMetadata(BaseModel):
    """Comprehensive scientific metadata dossier for a priority Martian region."""

    id: str
    name: str
    canonical_feature_name: str
    physiographic_province: str
    geological_setting: str
    formation_period: str
    center: list[float]  # [lat, lon]
    bounds: RegionBoundingBox
    dimensions: RegionDimensions
    elevation_range: ElevationRange
    missions: list[RegionMissionRef] = Field(default_factory=list)
    has_local_digital_twin: bool = False
    local_twin_page_id: str | None = None
    available_datasets: list[RegionDatasetRef] = Field(default_factory=list)
    scientific_highlights: list[str] = Field(default_factory=list)
    epistemic_class: EpistemicClass = EpistemicClass.OBSERVED


# -----------------------------------------------------------------------------
# 12 PRIORITY MARTIAN EXPLORATION REGIONS
# -----------------------------------------------------------------------------
REGION_REGISTRY: dict[str, RegionMetadata] = {
    # 1. JEZERO CRATER
    "reg-jezero": RegionMetadata(
        id="reg-jezero",
        name="Jezero Crater (Western Basin & River Delta)",
        canonical_feature_name="Jezero Crater",
        physiographic_province="Syrtis Major Quadrangle (MC-13) / Nili Planum",
        geological_setting=(
            "Noachian-Hesperian impact crater hosting a well-preserved ancient river delta "
            "fan, lacustrine clay-bearing mudstones, and olivine-carbonate bearing bedrock "
            "floors of hydrothermal and igneous origin."
        ),
        formation_period="Noachian to Early Hesperian (~3.9 - 3.5 Ga)",
        center=[18.4485, 77.4320],
        bounds=RegionBoundingBox(
            lat_min=18.2110,
            lat_max=18.7212,
            lon_min=77.1605,
            lon_max=77.6992,
        ),
        dimensions=RegionDimensions(
            width_km=31.93,
            height_km=30.24,
            diameter_km=49.0,
            area_km2=965.62,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-2565.0,
            max_elevation_m=-2230.0,
        ),
        missions=[
            RegionMissionRef(
                mission_name="Mars 2020",
                spacecraft="Perseverance Rover & Ingenuity Helicopter",
                landing_date="2021-02-18",
                status="Active Operational",
                coordinates=[18.4446, 77.4509],
            )
        ],
        has_local_digital_twin=True,
        local_twin_page_id="digital-twin",
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-08",
                name="HiRISE Jezero Western Delta 1m DTM",
                instrument_mission="MRO HiRISE",
                resolution="1.0 m/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="USGS Astrogeology TRN Archive",
                coverage_type="Local Delta Fan (85.5 km²)",
            ),
            RegionDatasetRef(
                product_id="PLN-SRC-06",
                name="CTX Jezero Western Basin 20m DTM",
                instrument_mission="MRO CTX",
                resolution="20.0 m/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.DERIVED,
                source_portal="USGS Astrogeology PDS Archive",
                coverage_type="Regional Basin Mosaic (965.6 km²)",
            ),
            RegionDatasetRef(
                product_id="PLN-SRC-05",
                name="CTX Jezero Western Basin 6m Orthomosaic",
                instrument_mission="MRO CTX",
                resolution="6.0 m/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="USGS Astrogeology PDS Archive",
                coverage_type="Regional Basin Mosaic (965.6 km²)",
            ),
            RegionDatasetRef(
                product_id="PLN-INT-02",
                name="USGS SIM-3464 Geologic Units of Jezero and Nili Planum",
                instrument_mission="USGS Scientific Investigations",
                resolution="1:75,000 Scale Vector",
                storage_type="VERIFIED_REMOTE",
                epistemic_class=EpistemicClass.INTERPRETED,
                source_portal="USGS Publications Warehouse",
                coverage_type="Regional Study Area (13,924 km²)",
            ),
        ],
        scientific_highlights=[
            "Preserved fluvial delta distributary fan with smectite clays",
            "Crater floor Máaz and Séítah igneous suites with olivine cumulates",
            "Three Forks sample return depot containing 10 sealed titanium tubes",
            "Primary astrobiological candidate for ancient biosignature preservation",
        ],
    ),
    # 2. GALE CRATER
    "reg-gale": RegionMetadata(
        id="reg-gale",
        name="Gale Crater (Mount Sharp & Aeolis Palus)",
        canonical_feature_name="Gale Crater",
        physiographic_province="Aeolis Quadrangle (MC-23) / Elysium Planitia Margin",
        geological_setting=(
            "Late Noachian impact crater hosting a central 5.5 km-high sedimentary mound "
            "(Mount Sharp / Aeolis Mons) featuring clay-bearing, sulfate-bearing, and "
            "wind-sculpted strata recording Mars' transition from wet to arid climatic regimes."
        ),
        formation_period="Late Noachian (~3.6 - 3.8 Ga)",
        center=[-5.37, 137.44],
        bounds=RegionBoundingBox(
            lat_min=-6.80,
            lat_max=-4.00,
            lon_min=136.00,
            lon_max=139.00,
        ),
        dimensions=RegionDimensions(
            width_km=178.0,
            height_km=165.0,
            diameter_km=154.0,
            area_km2=18625.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-4520.0,
            max_elevation_m=1100.0,
        ),
        missions=[
            RegionMissionRef(
                mission_name="Mars Science Laboratory",
                spacecraft="Curiosity Rover",
                landing_date="2012-08-06",
                status="Active Operational",
                coordinates=[-4.5895, 137.4417],
            )
        ],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
            RegionDatasetRef(
                product_id="PLN-INT-01",
                name="USGS SIM-3222 Geologic Map of Gale Crater",
                instrument_mission="USGS Astrogeology",
                resolution="1:100,000 Scale",
                storage_type="VERIFIED_REMOTE",
                epistemic_class=EpistemicClass.INTERPRETED,
                source_portal="USGS Publications Warehouse",
                coverage_type="Gale Crater Basin",
            ),
        ],
        scientific_highlights=[
            "Mount Sharp 5 km thick stratigraphy documenting climate evolution",
            "Yellowknife Bay mudstones proving long-lived habitable lacustrine environments",
            "Active modern sand dunes (Bagnold Dune Field) showing ongoing aeolian saltation",
        ],
    ),
    # 3. VALLES MARINERIS
    "reg-valles-marineris": RegionMetadata(
        id="reg-valles-marineris",
        name="Valles Marineris (Chasma Canyon System)",
        canonical_feature_name="Valles Marineris",
        physiographic_province="Coprates (MC-18) & Margaritifer Sinus (MC-19)",
        geological_setting=(
            "Vast tectonic rift system extending over 4,000 km along the Martian equator. "
            "Formed by crustal extension associated with the Tharsis volcanic bulge, modified by "
            "massive catastrophic landslides, fluvial sapping, and layered sulfate deposits."
        ),
        formation_period="Hesperian (~3.7 - 3.0 Ga)",
        center=[-14.00, -59.20],
        bounds=RegionBoundingBox(
            lat_min=-22.00,
            lat_max=-5.00,
            lon_min=-85.00,
            lon_max=-35.00,
        ),
        dimensions=RegionDimensions(
            width_km=3000.0,
            height_km=1000.0,
            diameter_km=None,
            area_km2=2500000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-7000.0,
            max_elevation_m=4200.0,
        ),
        missions=[],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
            RegionDatasetRef(
                product_id="PLN-SRC-03",
                name="Viking MDIM 2.1 Mosaic",
                instrument_mission="Viking Orbiter",
                resolution="231 m/px",
                storage_type="VERIFIED_REMOTE",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="USGS Astropedia",
                coverage_type="Equatorial Mosaic",
            ),
        ],
        scientific_highlights=[
            "Deepest and longest canyon system in the solar system (up to 7 km deep)",
            "Interior Layered Deposits (ILDs) with extensive polyhydrated sulfates",
            "Catastrophic landslides exhibiting long-runout avalanche dynamics",
        ],
    ),
    # 4. OLYMPUS MONS
    "reg-olympus-mons": RegionMetadata(
        id="reg-olympus-mons",
        name="Olympus Mons (Shield Volcano & Caldera)",
        canonical_feature_name="Olympus Mons",
        physiographic_province="Amazonis Quadrangle (MC-08) / Tharsis Province",
        geological_setting=(
            "Immense basaltic shield volcano standing over 21 km above the datum. "
            "Bounded by an abrupt 6-8 km basal scarp, featuring a complex nested summit caldera "
            "formed by multiple collapse events with young lava flows and glacier aureoles."
        ),
        formation_period="Hesperian to Amazonian (~3.5 Ga - 25 Ma)",
        center=[18.65, -133.80],
        bounds=RegionBoundingBox(
            lat_min=13.00,
            lat_max=24.00,
            lon_min=-141.00,
            lon_max=-126.00,
        ),
        dimensions=RegionDimensions(
            width_km=624.0,
            height_km=600.0,
            diameter_km=624.0,
            area_km2=300000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-1500.0,
            max_elevation_m=21229.0,
        ),
        missions=[],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "Tallest planetary volcano in the solar system (+21,229 m peak elevation)",
            "Six nested caldera collapse structures spanning 80 km across the summit",
            "Basal scarps and massive debris aureoles extending hundreds of kilometres",
        ],
    ),
    # 5. THARSIS VOLCANIC REGION
    "reg-tharsis": RegionMetadata(
        id="reg-tharsis",
        name="Tharsis Volcanic Region (Tharsis Rise & Montes)",
        canonical_feature_name="Tharsis Rise",
        physiographic_province="Tharsis (MC-09) & Phoenicis Lacus (MC-17)",
        geological_setting=(
            "Broad elevated volcanic plateau dominating the western hemisphere of Mars. "
            "Hosts three giant shield volcanoes (Ascraeus Mons, Pavonis Mons, Arsia Mons), "
            "extensive graben systems, and extensive lava flow fields."
        ),
        formation_period="Noachian to Amazonian",
        center=[0.00, -110.00],
        bounds=RegionBoundingBox(
            lat_min=-15.00,
            lat_max=18.00,
            lon_min=-130.00,
            lon_max=-90.00,
        ),
        dimensions=RegionDimensions(
            width_km=2500.0,
            height_km=2000.0,
            diameter_km=None,
            area_km2=5000000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=2000.0,
            max_elevation_m=18000.0,
        ),
        missions=[],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "Massive true polar wander load driving global Martian tectonic fracturing",
            "Aligned linear chain of Tharsis Montes shield volcanoes",
            "Extensive pit crater chains and lava tube cave candidates",
        ],
    ),
    # 6. HELLAS PLANITIA
    "reg-hellas": RegionMetadata(
        id="reg-hellas",
        name="Hellas Planitia (Giant Impact Basin)",
        canonical_feature_name="Hellas Planitia",
        physiographic_province="Hellas Quadrangle (MC-28) / Southern Highlands",
        geological_setting=(
            "Ancient, heavily degraded multi-ring impact basin spanning 2,300 km in diameter. "
            "Contains the lowest sub-areoid topography on Mars (-7.1 km), supporting the "
            "highest atmospheric pressure on the planet, with active dust storm nucleation."
        ),
        formation_period="Early Noachian (~4.0 - 4.1 Ga)",
        center=[-42.70, 70.00],
        bounds=RegionBoundingBox(
            lat_min=-52.00,
            lat_max=-30.00,
            lon_min=50.00,
            lon_max=90.00,
        ),
        dimensions=RegionDimensions(
            width_km=2300.0,
            height_km=2000.0,
            diameter_km=2300.0,
            area_km2=4150000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-7152.0,
            max_elevation_m=1200.0,
        ),
        missions=[],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "Lowest surface elevation on Mars (-7,152 m MOLA areoid reference)",
            "Surface atmospheric pressure exceeding 11.5 hPa (triple the high-plateau average)",
            "Frequent incubator for regional and planet-encircling dust storms",
        ],
    ),
    # 7. UTOPIA PLANITIA
    "reg-utopia": RegionMetadata(
        id="reg-utopia",
        name="Utopia Planitia (Northern Lowlands & Tianwen-1)",
        canonical_feature_name="Utopia Planitia",
        physiographic_province="Casius (MC-06) & Cebrenia (MC-07) Quadrangles",
        geological_setting=(
            "Immense ancient impact basin buried beneath younger sedimentary and volcanic "
            "fill. Characterized by periglacial polygon patterned ground, scallop depressions, "
            "and massive subsurface excess ice deposits confirmed by SHARAD orbital radar."
        ),
        formation_period="Noachian impact with Amazonian periglacial modification",
        center=[46.70, 117.50],
        bounds=RegionBoundingBox(
            lat_min=20.00,
            lat_max=55.00,
            lon_min=95.00,
            lon_max=140.00,
        ),
        dimensions=RegionDimensions(
            width_km=3300.0,
            height_km=2800.0,
            diameter_km=3300.0,
            area_km2=7000000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-5100.0,
            max_elevation_m=-3200.0,
        ),
        missions=[
            RegionMissionRef(
                mission_name="Viking 2",
                spacecraft="Viking 2 Lander",
                landing_date="1976-09-03",
                status="Mission Complete",
                coordinates=[47.64, 134.29],
            ),
            RegionMissionRef(
                mission_name="Tianwen-1",
                spacecraft="Zhurong Rover",
                landing_date="2021-05-14",
                status="Mission Complete",
                coordinates=[25.10, 109.90],
            ),
        ],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "Massive underground ice deposit detected by SHARAD (equivalent to Lake Superior)",
            "Zhurong rover ground-penetrating radar detections of layered paleoflood deposits",
            "Scalloped depressions and thermal contraction cracked polygonal terrain",
        ],
    ),
    # 8. ELYSIUM PLANITIA
    "reg-elysium": RegionMetadata(
        id="reg-elysium",
        name="Elysium Planitia (Young Volcanic Plains & InSight)",
        canonical_feature_name="Elysium Planitia",
        physiographic_province="Elysium Quadrangle (MC-15)",
        geological_setting=(
            "Broad smooth volcanic plain formed by Late Amazonian flood basalts. Features "
            "Cerberus Fossae tectonic fissures, young volcanic vents, and evidence of recent "
            "magmatic and seismic activity detected by SEIS aboard NASA's InSight lander."
        ),
        formation_period="Late Hesperian to Late Amazonian (< 500 Ma)",
        center=[3.00, 154.70],
        bounds=RegionBoundingBox(
            lat_min=-2.00,
            lat_max=12.00,
            lon_min=130.00,
            lon_max=170.00,
        ),
        dimensions=RegionDimensions(
            width_km=2200.0,
            height_km=1100.0,
            diameter_km=None,
            area_km2=2400000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-3100.0,
            max_elevation_m=-1800.0,
        ),
        missions=[
            RegionMissionRef(
                mission_name="InSight",
                spacecraft="InSight Lander",
                landing_date="2018-11-26",
                status="Mission Complete",
                coordinates=[4.5024, 135.6234],
            )
        ],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "First seismic detection of marsquakes and subsurface mantle plume by InSight SEIS",
            "Youngest flood lava plains on Mars (< 100 Ma, Athabasca Valles flood basalts)",
            "Active crustal extension and vent fissures along Cerberus Fossae",
        ],
    ),
    # 9. ARCADIA PLANITIA
    "reg-arcadia": RegionMetadata(
        id="reg-arcadia",
        name="Arcadia Planitia (Glacier-Rich Plains & Human Architecture)",
        canonical_feature_name="Arcadia Planitia",
        physiographic_province="Arcadia Quadrangle (MC-05) / Northern Lowlands",
        geological_setting=(
            "Flat Amazonian lowland plain with extensive smooth volcanic flows and shallow "
            "subsurface sheet ice. Prime candidate for future human crewed Mars landing "
            "due to low elevation, mild slopes, and easily accessible buried water ice."
        ),
        formation_period="Amazonian (~1.0 Ga to present)",
        center=[39.20, -170.50],
        bounds=RegionBoundingBox(
            lat_min=30.00,
            lat_max=50.00,
            lon_min=-180.00,
            lon_max=-150.00,
        ),
        dimensions=RegionDimensions(
            width_km=1800.0,
            height_km=1400.0,
            diameter_km=None,
            area_km2=2200000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-4200.0,
            max_elevation_m=-3000.0,
        ),
        missions=[],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "Extensive subsurface sheet ice accessible within 1-2 metres of surface (SWIM project)",
            "Low topographic roughness offering optimal landing safety margins for human landers",
            "High In-Situ Resource Utilization (ISRU) water extraction potential",
        ],
    ),
    # 10. GUSEV CRATER
    "reg-gusev": RegionMetadata(
        id="reg-gusev",
        name="Gusev Crater (Columbia Hills & MER Spirit)",
        canonical_feature_name="Gusev Crater",
        physiographic_province="Aeolis Quadrangle (MC-23) / Southern Highlands Boundary",
        geological_setting=(
            "Ancient Noachian impact basin at the mouth of Ma'adim Vallis outflow channel. "
            "Crater floor basaltic plains punctured by Columbia Hills, revealing hydrothermal "
            "silica deposits, sulfate salts, and altered volcanic pyroclastics explored by Spirit."
        ),
        formation_period="Early Noachian (~3.9 Ga)",
        center=[-14.57, 175.47],
        bounds=RegionBoundingBox(
            lat_min=-16.00,
            lat_max=-13.00,
            lon_min=174.00,
            lon_max=177.00,
        ),
        dimensions=RegionDimensions(
            width_km=166.0,
            height_km=166.0,
            diameter_km=166.0,
            area_km2=21640.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-2100.0,
            max_elevation_m=-1400.0,
        ),
        missions=[
            RegionMissionRef(
                mission_name="Mars Exploration Rover",
                spacecraft="Spirit Rover (MER-A)",
                landing_date="2004-01-04",
                status="Mission Complete",
                coordinates=[-14.5684, 175.4726],
            )
        ],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "Home Plate silica deposits formed in volcanic fumarolic or hot spring settings",
            "Ma'adim Vallis outflow channel terminal delta paleolake sequence",
            "Historic 7.7 km traverse of MER Spirit through the Columbia Hills",
        ],
    ),
    # 11. NORTH POLAR REGION
    "reg-north-polar": RegionMetadata(
        id="reg-north-polar",
        name="North Polar Region (Planum Boreum & Polar Troughs)",
        canonical_feature_name="Planum Boreum",
        physiographic_province="Mare Boreum Quadrangle (MC-01)",
        geological_setting=(
            "Martian northern polar cap dominated by Planum Boreum. Features vast layered "
            "water-ice and dust deposits (NPLD) over 3 km thick, cut by spiraling chasmata "
            "(Chasma Boreale) and surrounded by circumpolar Olympia Planum sand seas."
        ),
        formation_period="Amazonian (~100 Ma to modern)",
        center=[85.00, 0.00],
        bounds=RegionBoundingBox(
            lat_min=75.00,
            lat_max=90.00,
            lon_min=-180.00,
            lon_max=180.00,
        ),
        dimensions=RegionDimensions(
            width_km=1200.0,
            height_km=1200.0,
            diameter_km=1000.0,
            area_km2=1000000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=-5000.0,
            max_elevation_m=-1800.0,
        ),
        missions=[
            RegionMissionRef(
                mission_name="Phoenix Mars Mission",
                spacecraft="Phoenix Lander",
                landing_date="2008-05-25",
                status="Mission Complete",
                coordinates=[68.2188, -125.7492],
            )
        ],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "Largest reservoir of surface water ice on modern Mars (~1.6 million km³)",
            "Spiraling troughs shaped by katabatic wind erosion and sunward insolation sublimation",
            "High-resolution climatic record of Martian orbital obliquity cycles",
        ],
    ),
    # 12. SOUTH POLAR REGION
    "reg-south-polar": RegionMetadata(
        id="reg-south-polar",
        name="South Polar Region (Planum Australe & SPRC)",
        canonical_feature_name="Planum Australe",
        physiographic_province="Mare Australe Quadrangle (MC-30)",
        geological_setting=(
            "Elevated southern polar plateau capped by perennial carbon dioxide ice "
            "(South Polar Residual Cap) and underlying thick water ice layered deposits (SPLD). "
            "Displays unique 'swiss cheese' sublimation pits, geyser spiders, and CO2 jets."
        ),
        formation_period="Late Amazonian to modern",
        center=[-85.00, 0.00],
        bounds=RegionBoundingBox(
            lat_min=-90.00,
            lat_max=-75.00,
            lon_min=-180.00,
            lon_max=180.00,
        ),
        dimensions=RegionDimensions(
            width_km=1500.0,
            height_km=1500.0,
            diameter_km=1400.0,
            area_km2=1500000.0,
        ),
        elevation_range=ElevationRange(
            min_elevation_m=800.0,
            max_elevation_m=3800.0,
        ),
        missions=[],
        has_local_digital_twin=False,
        available_datasets=[
            RegionDatasetRef(
                product_id="PLN-SRC-01",
                name="MOLA 4 ppd Topography Grid",
                instrument_mission="MGS MOLA",
                resolution="46.3 km/px",
                storage_type="VERIFIED_LOCAL",
                epistemic_class=EpistemicClass.OBSERVED,
                source_portal="NASA PDS Geosciences Node",
                coverage_type="Global Continuous",
            ),
        ],
        scientific_highlights=[
            "Permanent carbon dioxide ice cap (SPRC) with dynamic swiss-cheese pit evolution",
            "Springtime CO2 gas eruption geysers depositing dark basaltic dust fans",
            "MARSIS orbital radar observations indicating basal dielectric anomalies",
        ],
    ),
}


# -----------------------------------------------------------------------------
# QUERY & LOOKUP UTILITIES
# -----------------------------------------------------------------------------
def get_all_regions() -> list[RegionMetadata]:
    """Return all 12 registered Martian priority regions."""
    return list(REGION_REGISTRY.values())


def get_region_by_id(region_id: str) -> RegionMetadata | None:
    """Retrieve metadata dossier for a specific region by ID."""
    return REGION_REGISTRY.get(region_id)


def find_region_by_coordinates(lat: float, lon: float) -> RegionMetadata | None:
    """Find a priority region enclosing the specified coordinates, or None."""
    # Normalize longitude to [-180, 180)
    norm_lon = ((lon + 180.0) % 360.0) - 180.0
    for region in REGION_REGISTRY.values():
        b = region.bounds
        if b.lat_min <= lat <= b.lat_max:
            if b.lon_min <= b.lon_max:
                if b.lon_min <= norm_lon <= b.lon_max:
                    return region
            else:
                # Wraps antimeridian
                if norm_lon >= b.lon_min or norm_lon <= b.lon_max:
                    return region
    return None
