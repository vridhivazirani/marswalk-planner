# Marswalk Planner — Planetary Data Sources Dossier (Phase 1)

> [!CAUTION]
> Marswalk Planner is a research and education decision-support prototype. It is not NASA software, has not been certified or endorsed by NASA, and must never claim operational astronaut safety.

---

## 1. Principles of Acceptance

In compliance with `AGENTS.md`:
1. Every dataset must be authentic and archived in official planetary databases (NASA PDS, USGS Astrogeology, HiRISE/UA).
2. All product identifiers, resolutions, coordinate frames, and vertical references must be verified prior to downloading into `data/raw/`.
3. Datasets evaluated below are designated with an explicit decision:
   - `ACCEPT`: Product fully meets geometric, resolution, and authenticity criteria.
   - `ACCEPT_WITH_CAVEATS`: Accepted for specific roles, subject to documented physical limitations (e.g. MOLA resolution).
   - `REJECT`: Uncontrolled or poorly documented dataset unsuitable for scientific routing.

---

## 2. Product Dossiers

### Product 1: USGS Mars 2020 Terrain Relative Navigation (TRN) HiRISE DTM Mosaic
- **Product Title:** Mars 2020 Terrain Relative Navigation HiRISE Digital Terrain Model (DTM) Mosaic
- **Product Identifier (DOI):** `10.5066/P9REJ9JN`
- **Originating Organization:** USGS Astrogeology Science Center (Authors: R.L. Fergason, D.M. Galuszka, T.M. Hare, D.P. Mayer, B.L. Redding et al., 2020)
- **Official Download Portal:** USGS Astropedia / PDS Cartography Node (`https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/HiRISE_DTM_Mosaic`)
- **Geographic Coverage:** Jezero Crater Western Fan, Floor, and Delta ($18.15^\circ\text{ N}$ to $18.65^\circ\text{ N}$, $77.20^\circ\text{ E}$ to $77.65^\circ\text{ E}$). Completely covers our primary study area.
- **Spatial Resolution:** **1.0 m/pixel** post spacing.
- **Coordinate Reference System (CRS):** Equirectangular projection on IAU Mars Sphere ($R = 3,396,190\text{ m}$), planetocentric latitude, east-positive longitude.
- **Vertical Reference Datum:** Mars Areoid (equipotential elevation zero-datum).
- **File Format:** Cloud-Optimized GeoTIFF / ISIS cube / VICAR formats with detached XML metadata.
- **Data Availability & Access:** Public domain (USGS / NASA Open Data). No authentication or export restrictions.
- **Suitability for Analysis:** **PRIMARY HIGH-RES TOPOGRAPHY.** Essential for computing slopes at astronaut footstep scale, micro-roughness, terrain curvature, and hard slope limits ($>25^\circ$).
- **Known Limitations:** Edge gaps where stereo HiRISE pairs did not exist; steep crater walls in deep shadow occasionally suffer from stereo-correlation decorrelation artifacts (addressed via our uncertainty layer).
- **Decision:** **ACCEPT** (Tier 1 Core Elevation Product).

---

### Product 2: USGS Mars 2020 TRN HiRISE Orthorectified Image Mosaic
- **Product Title:** Mars 2020 Terrain Relative Navigation HiRISE Orthorectified Image (ORI) Mosaic
- **Product Identifier (DOI):** `10.5066/P9QJDP48`
- **Originating Organization:** USGS Astrogeology Science Center / NASA JPL
- **Official Download Portal:** USGS Astropedia (`https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/HiRISE_Mosaic`)
- **Geographic Coverage:** Co-registered with Product 1 above ($100\%$ overlap over Jezero western fan).
- **Spatial Resolution:** **0.25 m/pixel** (25 cm/pixel).
- **Coordinate Reference System (CRS):** Identical to Product 1 (Equirectangular, IAU Mars Sphere, planetocentric, east-positive).
- **Vertical Datum:** N/A (Orthorectified 2D Surface Reflectance).
- **File Format:** GeoTIFF / JPEG2000 / ISIS cube with detached XML metadata.
- **Data Availability & Access:** Public domain. No restrictions.
- **Suitability for Analysis:** **PRIMARY VISUAL BASEMAP & COMPUTER VISION LAYER.** Essential for 2D map exploration, texture analysis, rock shadow detection ($>1\text{ m}$ diameter), and dune crest mapping.
- **Known Limitations:** Single-band visible radiance; seasonal lighting conditions fix shadow orientations (must be factored into CV boulder detection).
- **Decision:** **ACCEPT** (Tier 1 Core Imagery Product).

---

### Product 3: USGS Mars 2020 TRN Context Camera (CTX) DTM Mosaic
- **Product Title:** Mars 2020 Terrain Relative Navigation Context Camera (CTX) DTM Mosaic
- **Product Identifier (DOI):** `10.5066/P906QQT8`
- **Originating Organization:** USGS Astrogeology Science Center
- **Official Download Portal:** USGS Astropedia (`https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/CTX_DTM_Mosaic`)
- **Geographic Coverage:** Full Jezero Crater basin and western watershed ($\approx 60\text{ km} \times 60\text{ km}$).
- **Spatial Resolution:** **20.0 m/pixel**.
- **Coordinate Reference System (CRS):** Equirectangular, IAU Mars Sphere ($R = 3,396,190\text{ m}$), planetocentric, east-positive.
- **Vertical Datum:** Mars Areoid.
- **File Format:** GeoTIFF / ISIS cube.
- **Data Availability & Access:** Public domain. No restrictions.
- **Suitability for Analysis:** **REGIONAL TOPOGRAPHY & CRATER-WIDE ROUTING.** Serves as ARD Level 2 grid for coarse-scale A* and Dijkstra crater-scale cost maps.
- **Known Limitations:** At 20 m/pixel, dangerous individual boulders, small gully drop-offs, and localized steep steps ($<20\text{ m}$) are smoothed out. Cannot be used alone for human-scale safety.
- **Decision:** **ACCEPT** (Tier 2 Regional Topography Product).

---

### Product 4: USGS Mars 2020 TRN CTX Orthorectified Image Mosaic
- **Product Title:** Mars 2020 Terrain Relative Navigation CTX Orthorectified Image Mosaic
- **Product Identifier (DOI):** `10.5066/P9GV1ND3`
- **Originating Organization:** USGS Astrogeology Science Center
- **Official Download Portal:** USGS Astropedia (`https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/CTX_Mosaic`)
- **Geographic Coverage:** Full Jezero Crater regional basin.
- **Spatial Resolution:** **6.0 m/pixel**.
- **Coordinate Reference System (CRS):** Equirectangular, IAU Mars Sphere, planetocentric, east-positive.
- **Vertical Datum:** N/A (Orthorectified imagery).
- **File Format:** GeoTIFF / ISIS cube.
- **Data Availability & Access:** Public domain. No restrictions.
- **Suitability for Analysis:** Regional mid-resolution visual basemap for zoom levels where 0.25 m tiles are computationally unnecessary.
- **Known Limitations:** Monochromatic, lower spatial fidelity than HiRISE.
- **Decision:** **ACCEPT** (Tier 2 Regional Imagery Product).

---

### Product 5: MOLA MEGDR (Mars Global Surveyor)
- **Product Title:** Mars Orbiter Laser Altimeter Mission Experiment Gridded Data Record (MEGDR)
- **Product Identifier:** `MGS-M-MOLA-5-MEGDR-L3-V1.0` (specifically tile `megt_16n_044_128`)
- **Originating Organization:** NASA Goddard Space Flight Center / PDS Geosciences Node
- **Official Download Portal:** PDS Geosciences Node / ODE (`https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1.0/`)
- **Geographic Coverage:** Global Mars ($180^\circ\text{ W}$ to $180^\circ\text{ E}$, $-90^\circ$ to $+90^\circ$).
- **Spatial Resolution:** 128 pixels/degree ($\approx 463\text{ m/pixel}$ at the equator).
- **Coordinate Reference System (CRS):** Planetocentric latitude, east-positive longitude.
- **Vertical Datum:** Mars Areoid.
- **File Format:** PDS3 binary grid (`.IMG`) with detached label (`.LBL`).
- **Data Availability & Access:** Public archive.
- **Suitability for Analysis:** **GLOBAL GEODETIC BACKBONE & FALLBACK.** Serves strictly as the datum reference to verify absolute vertical offsets and as the ultimate fallback in ARD Level 3.
- **Known Limitations:** **INADEQUATE FOR HUMAN HAZARDS.** At ~463 m post spacing, human obstacles (cliffs, ravines, boulder fields) are completely invisible. Any cell relying solely on MOLA will be heavily penalized and flagged `LOW_CONFIDENCE_FALLBACK`.
- **Decision:** **ACCEPT_WITH_CAVEATS** (Global Reference only; never safe alone).

---

### Product 6: CRISM Targeted Observation MTRDR (Jezero Delta)
- **Product Title:** CRISM Map-projected Targeted Reduced Data Record (MTRDR)
- **Product Identifier:** `FRT000047A3` (Full-Resolution Targeted scene covering the western fan)
- **Originating Organization:** Johns Hopkins Applied Physics Laboratory (APL) / PDS Geosciences Node
- **Official Download Portal:** PDS Geosciences Node / ODE (`https://pds-geosciences.wustl.edu/mro/mro-m-crism-3-rdr-targeted-v1/`)
- **Geographic Coverage:** Centered on Jezero Western Fan ($18.35^\circ\text{–}18.55^\circ\text{ N}$, $77.30^\circ\text{–}77.50^\circ\text{ E}$).
- **Spatial Resolution:** **18.0 m/pixel** to **20.0 m/pixel**.
- **Coordinate Reference System (CRS):** Map-projected Equirectangular (IAU Mars).
- **Vertical Datum:** N/A (Hyperspectral summary parameter bands).
- **File Format:** PDS3 image cube (`.IMG`) with detached `.LBL` and ENVI `.HDR`. Includes Summary Parameter (`_SU`) multi-band files.
- **Data Availability & Access:** Public domain PDS archive.
- **Suitability for Analysis:** **PRIMARY SCIENCE OPPORTUNITY LAYER.** Bands include standard Viviano-Beck summary parameters (`BD2300` for Mg-carbonates, `OLINDEX3` for olivine, `BD1900` for smectite clays), enabling multi-objective routing towards scientific targets.
- **Known Limitations:** Atmospheric gas absorption residuals; cryocooler thermal noise at long IR wavelengths; spatial resolution is coarse (~18 m) compared to HiRISE (1 m).
- **Decision:** **ACCEPT** (Phase 7 Science Integration).

---

### Product 7: USGS Geologic Map of Jezero Crater and Nili Planum
- **Product Title:** Geologic Map of Jezero Crater and the Nili Planum Region, Mars
- **Product Identifier (DOI):** `10.3133/sim3464` (USGS Scientific Investigations Map 3464)
- **Originating Organization:** USGS / Vivian Z. Sun & Kathryn M. Stack (2020)
- **Official Download Portal:** USGS Publications Warehouse (`https://pubs.usgs.gov/sim/3464/`)
- **Geographic Coverage:** Full Jezero basin and surrounding regional units ($1:75,000$ scale).
- **Spatial Resolution:** Vector GIS polygons and fault linework.
- **Coordinate Reference System (CRS):** Equirectangular projection, Mars 2000 / IAU Sphere.
- **Vertical Datum:** N/A (Vector geology).
- **File Format:** Esri Shapefile / File Geodatabase packaged in a 349 MB ZIP archive.
- **Data Availability & Access:** Public domain. No restrictions.
- **Suitability for Analysis:** **STRATIGRAPHIC & SCIENTIFIC VALUE MAPPING.** Provides expert-interpreted lithologic units (delta deposits, crater floor fractured unit, olivine-rich unit) classified as `INTERPRETED`.
- **Known Limitations:** Mapped at $1:75,000$ scale; contact boundaries carry spatial uncertainty of tens of meters on the ground.
- **Decision:** **ACCEPT** (Phase 7 Science Integration).

---

### Product 8: NASA Mars 2020 Perseverance Rover Traverse & Localization Data
- **Product Title:** Mars 2020 Rover PLACES Telemetry & Traverse Localization Bundle
- **Product Identifier:** PDS Geosciences Mars 2020 PLACES Bundle (`urn:nasa:pds:mars2020_places`)
- **Originating Organization:** NASA Jet Propulsion Laboratory / PDS Geosciences Node
- **Official Download Portal:** PDS Geosciences Analyst's Notebook (`https://an.rsl.wustl.edu/`)
- **Geographic Coverage:** Ground track from Octavia E. Butler landing site across Séítah and up the delta scarp.
- **Spatial Resolution:** Centimeter-accurate rover waypoints (Rover Motion Counter sites).
- **Coordinate Reference System (CRS):** Mars 2020 Site Frame tied to IAU Mars Sphere.
- **Vertical Datum:** Mars Areoid elevation.
- **File Format:** Tabular CSV / GeoJSON point and line tracks.
- **Data Availability & Access:** Public PDS release.
- **Suitability for Analysis:** **IN-SITU VALIDATION GROUND TRUTH.** Evaluates whether Marswalk Planner's cost engine and hard-constraint masks align with actual robotic traverse paths chosen by JPL mission navigators.
- **Known Limitations:** Rover mobility limits (wheel clearance $\approx 50\text{ cm}$, max slope $\approx 15\text{–}20^\circ$) differ from suited astronaut walking dynamics.
- **Decision:** **ACCEPT** (Validation Ground Truth).

---

### Product 9: NASA Mars 2020 Perseverance MEDA In-Situ Meteorological Instrument Archive
- **Product Title:** Mars 2020 Mars Environmental Dynamics Analyzer (MEDA) Calibrated Sensor Data Bundle
- **Product Identifier (PDS URN):** `urn:nasa:pds:mars2020_meda`
- **Originating Organization:** Centro de Astrobiología (CAB, CSIC-INTA, Spain) / NASA Jet Propulsion Laboratory / PDS Atmospheres Node & Geosciences Node
- **Official Download Portal:** PDS Atmospheres Node (`https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html`)
- **Geographic Coverage:** Jezero Crater Floor and Western Delta along the Perseverance traverse ($18.38^\circ\text{ N} - 18.46^\circ\text{ N}$, $77.40^\circ\text{ E} - 77.46^\circ\text{ E}$).
- **Temporal Coverage:** Sols 1 to 1000+ (February 18, 2021 to present; spanning Mars Years 36 and 37).
- **Sensors & Measurement Types:**
  - `ATS` (Air Temperature Sensors): Atmospheric temperatures at $1.5\text{ m}$ and $0.8\text{ m}$ above surface.
  - `GTS` (Ground Temperature Sensor): Thermal infrared radiometry of surface regolith ($8.5\text{–}14\ \mu\text{m}$).
  - `WS` (Wind Sensors): 2D horizontal wind speed and azimuth at rover mast height ($1.5\text{ m}$).
  - `RDS` (Radiation and Dust Sensor): Solar direct and diffuse flux (UV, visible, NIR) and dust optical depth ($\tau$).
  - `PS` (Pressure Sensor): Surface atmospheric pressure ($680\text{–}760\text{ Pa}$).
  - `HS` (Humidity Sensor): Water vapor relative humidity.
- **File Format:** PDS4 XML labels with tabular CSV/ASCII and binary data tables.
- **Data Availability & Access:** Public domain PDS archive. Free open access.
- **Suitability for Analysis:** **HISTORICAL IN-SITU ENVIRONMENTAL BASELINE.** Provides authentic empirical distributions for temperature extremes, diurnal cycles, dust opacity, and wind gusts at Jezero.
- **Known Limitations:**
  - Measures historical weather, NOT real-time or forecasted weather for future human missions.
  - Local microclimate is point-sampled along the rover track; topographic wind channelling along the delta scarp or crater rim is not spatially continuous.
  - One wind sensor experienced minor damage during landing dust lofting.
- **Decision:** **ACCEPT** (Historical In-Situ Environmental Baseline; classified as `OBSERVED`).

---

### Product 10: Mars Climate Database (MCD v6.1 / LMD-CNRS-ESA)
- **Product Title:** The Mars Climate Database (MCD) Global Atmospheric Model
- **Product Identifier:** MCD Version 6.1 (European Space Agency / Laboratoire de Météorologie Dynamique)
- **Originating Organization:** LMD / CNRS / Sorbonne Université / ESA
- **Official Download Portal:** MCD Web Access Portal (`http://www-mars.lmd.jussieu.fr/`)
- **Geographic Coverage:** Global Mars ($0.0^\circ\text{–}360.0^\circ\text{ E}$, $-90.0^\circ\text{–}+90.0^\circ\text{ N}$) at arbitrary user-selected coordinates (including Jezero: $18.45^\circ\text{ N}, 77.45^\circ\text{ E}$).
- **Temporal Parameterization:** Parameterized by Solar Longitude ($L_s \in [0^\circ, 360^\circ]$) representing Martian seasons, and Local True Solar Time ($\text{LTST} \in [0.0, 24.0\text{ hours}]$).
- **Physical Quantities Modeled:** Diurnal cycle temperatures, surface solar flux, dust optical depth scenarios (climatology, cold/clear, dust storm), and boundary layer turbulence.
- **File Format:** NetCDF-4 grids and web-service tabular profiles.
- **Data Availability & Access:** Open scientific research access.
- **Suitability for Analysis:** **MACRO-SCALE CLIMATIC MODELING.** Bridges the gap where local in-situ time series are absent, enabling simulated seasonal and diurnal scenario generation.
- **Known Limitations:** GCM grid cells are ~60 km resolution; local microtopographic microclimates (shadowing by Kodiak Butte or delta scarps) require downscaled boundary layer heuristic parameterization.
- **Decision:** **ACCEPT** (Macro-Scale Climatology Model; classified as `SIMULATED` / `PREDICTED`).

---

## 3. Summary of Approved Initial Product Catalog

| # | Product Name | Identifier | Sensor | Native Res | Role | Decision |
|---|---|---|---|---|---|---|
| 1 | TRN HiRISE DTM Mosaic | `10.5066/P9REJ9JN` | HiRISE | 1.0 m | Primary Topography / Slopes | **ACCEPT** |
| 2 | TRN HiRISE Orthomosaic | `10.5066/P9QJDP48` | HiRISE | 0.25 m | Primary Basemap / CV Hazards | **ACCEPT** |
| 3 | TRN CTX DTM Mosaic | `10.5066/P906QQT8` | CTX | 20.0 m | Regional Topography / Base Grid | **ACCEPT** |
| 4 | TRN CTX Orthomosaic | `10.5066/P9GV1ND3` | CTX | 6.0 m | Regional Context Basemap | **ACCEPT** |
| 5 | MOLA MEGDR Altimetry | `MGS-M-MOLA-5-MEGDR-L3-V1.0` | MOLA | 463 m | Global Geodetic Datum Check | **ACCEPT_WITH_CAVEATS** |
| 6 | CRISM Targeted Scene | `FRT000047A3_MTRDR` | CRISM | 18 m | Astrobiology Science Value | **ACCEPT** |
| 7 | USGS Geologic Map | `10.3133/sim3464` | Multi | 1:75,000 | Stratigraphic Science Value | **ACCEPT** |
| 8 | Perseverance Traverse | `mars2020_places` | Rover | In-situ | Ground-Truth Route Validation | **ACCEPT** |
| 9 | Perseverance MEDA In-Situ | `mars2020_meda` | MEDA | In-situ (1 Hz) | Historical Weather & Dust Baseline | **ACCEPT** |
| 10 | Mars Climate Database (MCD) | `MCD_v6.1_LMD` | Model | GCM / Diurnal | Macro Climatology & Diurnal Scenarios | **ACCEPT** |
