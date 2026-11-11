# Mars Planetary Exploration Atlas — Architectural & Scientific Dossier

## 1. Overview & Scope

The **Mars Planetary Exploration Atlas** expands Marswalk Planner from a Jezero-focused digital twin into an authentic multi-scale planetary exploration environment. It bridges global Martian geophysics (MOLA altimetry, THEMIS thermal inertia, Viking albedo) with regional crater geology (USGS SIM-3464, CTX 20m DTM) and sub-meter local terrain intelligence (1.0m HiRISE DTM).

All components strictly comply with:
1. **Scientific Integrity**: No fabricated rasters, URLs, or fake observations. Every layer maps to an authentic product from NASA PDS, USGS Astrogeology, ESA PSA, or IAU WGPSN.
2. **Canonical Mars Geodesy**: Planetocentric latitude, east-positive longitude in $[-180, 180)^\circ$ on the IAU 2015 Mars Sphere ($R = 3,396,190\text{ m}$, `IAU_2015:49900`), and elevations in metres relative to the Mars areoid (MOLA datum).
3. **Epistemic Classification**: Every data layer and value is tagged with its epistemic status: `OBSERVED`, `DERIVED`, `INTERPRETED`, `HEURISTIC`, `SIMULATED`, or `UNKNOWN`.
4. **Pure Dark Monochrome Aerospace Theme**: Design palette (`#090909`, `#111111`, `#181818`, `#202020`, `#f5f5f5`, `#a3a3a3`) preserving high visual contrast and professional mission-control readability.

---

## 2. Multi-Scale Hierarchy & Cartographic Architecture

The Atlas establishes three distinct scale tiers with strict boundaries to avoid false upsampling:

```text
+---------------------------------------------------------------------------------------+
| GLOBAL MARS ATLAS (Scale: 1:5,000,000 to 1:500,000 | CRS: IAU_2015:49900 Plate Carrée)|
| - MOLA B&W Shaded Relief (463m, USGS WMS)                                             |
| - MOLA Color Topography (463m, NASA Trek WMTS)                                        |
| - THEMIS Daytime Infrared Mosaic (100m, USGS WMS)                                     |
| - THEMIS Nighttime Thermal Inertia (100m, USGS WMS)                                   |
| - Viking MDIM 2.1 Controlled Color Albedo (232m, NASA Trek WMTS)                      |
| - IAU Nomenclature Gazetteer (Volcanoes, Craters, Canyons, Basins)                    |
| - Historical Surface Landing Sites (Viking 1/2, MER, MSL, M2020, Tianwen-1)          |
+---------------------------------------------------------------------------------------+
                                            │ (Seamless Zoom & Fly-To Navigation)
                                            ▼
+---------------------------------------------------------------------------------------+
| JEZERO REGIONAL CONTEXT (Scale: 1:500,000 to 1:50,000 | CRS: Equirectangular Jezero) |
| - CTX Regional DTM (20m/px, 60 km x 60 km, USGS TRN JEZ_ctx_B_soc_008)              |
| - CTX Controlled Orthomosaic (6m/px, USGS TRN)                                        |
| - USGS SIM-3464 Geologic Formations (Sun & Stack 2020)                                |
| - MRO CRISM Hyperspectral Mineral Indices (Fe/Mg clays D2300, Carbonates MIN2290)     |
| - HiRISE 1m Coverage Boundary & Regional Footprint Polygon                            |
+---------------------------------------------------------------------------------------+
                                            │ (Windowed Raster Read / Micro-Inspection)
                                            ▼
+---------------------------------------------------------------------------------------+
| LOCAL MARSWALK DIGITAL TWIN (Scale: 1:50,000 to 1:1,000 | 20m Aligned Analysis Grid)  |
| - Native HiRISE 1.0m DTM (NASA PDS / USGS TRN Delta Jezero DL)                        |
| - Single-Source Analytical Hillshade (NW 315°, altitude 45°)                          |
| - Multi-Directional Relief Shading (Aspect-unbiased 4-angle composite)               |
| - Dynamic Elevation Contours (10m and 50m MOLA areoid GeoJSON vectors)                |
| - Continuous Geodesic Cross-Section Transects (Elevation & Slope profiler)            |
| - 7-Class Rule-Based Geomorphic Classifier (Terrain Ruggedness, LEV, VRM)             |
| - Explainable Boulder & Sand Ripple Detection Engine                                  |
+---------------------------------------------------------------------------------------+
```

---

## 3. Map Catalogue Organization (11 Official Categories)

The Map Explorer provides complete metadata, provenance, and live layer toggles for 29 catalogued products across 11 official categories:

1. **Global Mars Maps** (`global_mars`): MOLA Shaded Relief, MOLA Color Topography, THEMIS Day IR, THEMIS Night IR, Viking MDIM 2.1.
2. **Regional Mars Maps** (`regional_mars`): Jezero CTX Regional Orthomosaic ($6\text{m}$), CTX Regional DTM ($20\text{m}$).
3. **High-Resolution Local Maps** (`high_res_local`): HiRISE Western Delta DTM ($1.0\text{m}$), HiRISE Color Orthomosaic ($0.25\text{m}$).
4. **Elevation and Topography** (`elevation_topography`): Aligned $20\text{m}$ Analysis DTM, MOLA areoid datum grid, $10\text{m}$/$50\text{m}$ Vector Elevation Contours.
5. **Terrain Analysis** (`terrain_analysis`): Analytical Hillshade ($315^\circ$), Multi-Directional Hillshade, Horn's Slope Gradient ($^\circ$), Riley Terrain Ruggedness Index (TRI), Vector Ruggedness Measure (VRM).
6. **Geological Maps** (`geological`): USGS SIM-3464 Geologic Map of Jezero ($1:75,000$, Sun & Stack 2020) with delta layered, blocky scarp, crater floor, and basement terrane units.
7. **Mineralogical Maps** (`mineralogical`): CRISM Fe/Mg Smectite Clay Index (D2300), CRISM Magnesium Carbonate Index (MIN2290), CRISM Olivine Index (OLINDEX3).
8. **Surface Property Maps** (`surface_properties`): TES/THEMIS Thermal Inertia ($320\text{ TIU}$), MGS TES Bolometric Albedo ($0.215$), Ruff & Christensen Dust Cover Index ($0.962$).
9. **Hazard Maps** (`hazards`): Unified Hazard Intelligence Score, Impassable Hard Constraint Mask, Boulder Field Density, Crater Depression Hazard.
10. **Rover Exploration Maps** (`rover_exploration`): Perseverance Rover Historical Traverse (Sols 0–1000+), Mars 2020 Waypoints, Martian Sample Return Core Locations.
11. **Mission Planning Maps** (`mission_planning`): Unified Cost Surface Maps (Safety-First, Science-First, Balanced), Candidate Science Targets, Dynamic Emergency Reroute Zones.

---

## 4. API Specification & Endpoints

| Endpoint | Method | Response Description | Scale Tier | Epistemic Class |
|---|---|---|---|---|
| `/api/v1/atlas/catalogue` | GET | Complete 29-product catalogue with category, text, and epistemic filtering | All | Meta |
| `/api/v1/atlas/categories` | GET | Summary of the 11 official categories with live product counts | All | Meta |
| `/api/v1/atlas/maps/{id}` | GET | Detailed metadata dossier, DOI, provenance, and geodetic reference | Product | Meta |
| `/api/v1/atlas/global/basemaps` | GET | Verified WMS/WMTS endpoints for USGS Astrogeology & NASA Trek | Global | OBSERVED / DERIVED |
| `/api/v1/atlas/global/features` | GET | Authentic IAU planetary features (Olympus Mons, Valles Marineris, etc.) | Global | OBSERVED |
| `/api/v1/atlas/global/landing-sites` | GET | Verified Mars landing sites (Viking 1/2, MER, MSL, M2020, Tianwen-1) | Global | OBSERVED |
| `/api/v1/atlas/global/navigation-targets`| GET | Bounding boxes and camera targets for planetary jump-to navigation | Global | Meta |
| `/api/v1/atlas/regional/jezero/footprints`| GET | Exact footprint bounds for HiRISE 1m DTM, CTX 20m DTM, and geology | Regional | OBSERVED / DERIVED |
| `/api/v1/atlas/geology/units` | GET | USGS SIM-3464 stratigraphic units, minerals, traversability, and cores | Regional | INTERPRETED |
| `/api/v1/atlas/geology/crism-indices` | GET | CRISM absorption band wavelengths, formulas, and significance | Regional | OBSERVED |
| `/api/v1/atlas/environment/surface-properties`| GET | Thermal inertia, bolometric albedo, dust cover index, and diurnal model | Regional | OBSERVED / SIMULATED |
| `/api/v1/twin/vector/contours` | GET | GeoJSON elevation contour lines ($10\text{m}$ or $50\text{m}$ intervals) | Local | DERIVED |
| `/api/v1/terrain/transect` | POST | Continuous geodesic cross-section elevation, slope, and terrain profiling | Local | DERIVED |

---

## 5. Mathematical Formulations for Derived Terrain Layers

### 5.1 Single-Azimuth Analytical Hillshade
Using Lambertian surface reflectance:
$$\text{Hillshade} = 255.0 \cdot \max\left(0, \cos(\theta_z) \cos(S) + \sin(\theta_z) \sin(S) \cos(\psi_{\text{az}} - \psi_{\text{asp}})\right)$$
where:
- $\theta_z = 90^\circ - \text{altitude}^\circ$ is the solar zenith angle ($\theta_z = 45^\circ$ for $45^\circ$ altitude).
- $S$ is the terrain slope in radians calculated via Horn's (1981) 8-neighbor convolution.
- $\psi_{\text{az}}$ is the solar azimuth in radians clockwise from North ($315^\circ$ NW).
- $\psi_{\text{asp}}$ is the terrain slope aspect in radians clockwise from North ($0^\circ = \text{North}, 90^\circ = \text{East}$).

### 5.2 Multi-Directional Relief Shading
To eliminate directional illumination bias (where east-west ridges disappear under single NW lighting), four illumination directions are blended:
$$\text{MHS} = \sum_{k=1}^{4} w_k \cdot \text{Hillshade}(\psi_k, \theta_z = 45^\circ)$$
with angles $\psi_k \in \{225^\circ, 270^\circ, 315^\circ, 360^\circ\}$ and weights $w = [0.20, 0.30, 0.30, 0.20]$.

### 5.3 Vector Ruggedness Measure (VRM)
Decouples terrain roughness from constant planar slope:
$$\vec{n} = (\sin S \sin \psi_{\text{asp}}, \sin S \cos \psi_{\text{asp}}, \cos S)$$
$$R = \left\| \sum_{i \in \mathcal{N}} \vec{n}_i \right\|$$
$$\text{VRM} = 1.0 - \frac{R}{N}$$
Planar surfaces yield $\text{VRM} \approx 0.0$ regardless of steepness; broken, bouldery, undulating terrain yields $\text{VRM} > 0.05$.

---

## 6. Verification & Quality Assurance Summary

1. **Backend Test Suite**: 155 unit, analytical, and architectural tests pass with zero failures.
2. **Static Type Checking & Linting**:
   - `ruff check .` passes with zero errors on the backend.
   - `oxlint` passes with zero errors on 40 TypeScript modules.
   - `tsc -b && vite build` completes in $\sim 300\text{ ms}$ with clean bundle output.
3. **NoData & Unknown Terrain Enforcement**: Missing elevation data is never treated as passable; NoData cells default to impassable barriers in the routing and cost engine.
4. **Research Disclaimer**: All views, exports, and reports carry the mandatory disclaimer:
   > Marswalk Planner is a research and decision-support prototype. It is not operational NASA software and does not certify human astronaut extravehicular activity safety.

