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
- **Known Limitations:** Edge gaps where stereo HiRISE pairs did not exist; steep crater walls in deep shadow occasionally suffer from stereo-correlation decorrelation artifacts (addressed via our uncertainty layer). Epistemically classified as `DERIVED` (stereo photogrammetric DTM extracted via ISIS3 / SOCET SET from observed HiRISE image pairs) while stored locally under `LOCAL_RAW` as an unmodified upstream USGS TRN GeoTIFF (`data/raw/usgs_trn/HiRISE_DTM_Delta_Jezero_DL_1m.tif`).
- **Decision:** **ACCEPT** (Tier 1 Core Elevation Product; Epistemic: `DERIVED`).

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
- **Known Limitations:** At 20 m/pixel, dangerous individual boulders, small gully drop-offs, and localized steep steps ($<20\text{ m}$) are smoothed out. Cannot be used alone for human-scale safety. Epistemically classified as `DERIVED` (SOCET SET photogrammetric stereo extraction from observed CTX image pairs) while stored locally under `LOCAL_RAW` as an unmodified upstream USGS TRN GeoTIFF (`data/raw/usgs_trn/JEZ_ctx_B_soc_008_DTM_20m.tif`).
- **Decision:** **ACCEPT** (Tier 2 Regional Topography Product; Epistemic: `DERIVED`).

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
- **Product Identifier:** `MGS-M-MOLA-5-MEGDR-L3-V1.0` (local global C-grid `MEGT90N000CB.IMG` stored at `data/raw/mola/megt90n000cb.img`; regional archive tiles such as `megt_16n_044_128` are not stored locally)
- **Originating Organization:** NASA Goddard Space Flight Center / PDS Geosciences Node
- **Official Download Portal:** PDS Geosciences Node / ODE (`https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1.0/`)
- **Geographic Coverage:** Global Mars ($180^\circ\text{ W}$ to $180^\circ\text{ E}$, $-90^\circ$ to $+90^\circ$).
- **Spatial Resolution:** **4.0 pixels/degree** ($14.818\text{ km/pixel}$ at the equator, $720 \times 1,440$ samples, $0.25^\circ \times 0.25^\circ$ grid) for the locally ingested file `data/raw/mola/megt90n000cb.img` (`MEGT90N000CB.LBL`). Note: the broader PDS `MGS-M-MOLA-5-MEGDR-L3-V1.0` archive also publishes regional tiles up to $128\text{ pixels/degree}$ ($\approx 463\text{ m/pixel}$ at the equator), which are not ingested in `data/raw/`.
- **Coordinate Reference System (CRS):** Planetocentric latitude, east-positive longitude.
- **Vertical Datum:** Mars Areoid.
- **File Format:** PDS3 binary grid (`.IMG`) with detached label (`.LBL`).
- **Data Availability & Access:** Public archive.
- **Suitability for Analysis:** **GLOBAL GEODETIC BACKBONE & FALLBACK.** Serves strictly as the datum reference to verify absolute vertical offsets and as the ultimate fallback in ARD Level 3.
- **Known Limitations:** **INADEQUATE FOR HUMAN HAZARDS.** At $14.818\text{ km/pixel}$ local C-grid spacing (and even at the $463\text{ m/pixel}$ maximum PDS MEGDR archive resolution), human obstacles (cliffs, ravines, boulder fields) are completely invisible. Any cell relying solely on MOLA will be heavily penalized and flagged `LOW_CONFIDENCE_FALLBACK`.
- **Decision:** **ACCEPT_WITH_CAVEATS** (Global Reference only; never safe alone; Epistemic: `OBSERVED`).

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

## 3. Summary of Approved Initial Product Catalog & API Reconciliation

| # | Dossier Product Name | Identifier | Core API ID (`catalog/datasets`) | Raw `data/raw/` Ingested? | Role | Decision |
|---|---|---|---|---|---|---|
| 1 | TRN HiRISE DTM Mosaic | `10.5066/P9REJ9JN` | `product-01` | Yes (`HiRISE_DTM_Delta_Jezero_DL_1m.tif`, `LOCAL_RAW`, `DERIVED`) | Primary Topography / Slopes | **ACCEPT** |
| 2 | TRN HiRISE Orthomosaic | `10.5066/P9QJDP48` | `product-02` | No (`STATIC_METADATA` dossier only, `OBSERVED`) | Primary Basemap / CV Reference | **ACCEPT** |
| 3 | TRN CTX DTM Mosaic | `10.5066/P906QQT8` | `product-03` | Yes (`JEZ_ctx_B_soc_008_DTM_20m.tif`, `LOCAL_RAW`, `DERIVED`) | Regional Topography / Base Grid | **ACCEPT** |
| 4 | TRN CTX Orthomosaic | `10.5066/P9GV1ND3` | `product-04` | Yes (`JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`, `LOCAL_RAW`, `OBSERVED`) | Regional Context Basemap | **ACCEPT** |
| — | ESA Mars Express HRSC | `ESA-PSA-HRSC-V1.0` | `product-05` | No (`STATIC_METADATA` regional ref, `DERIVED`) | Regional Elevation Benchmark | **ACCEPT_WITH_CAVEATS** |
| 5 | MOLA MEGDR Altimetry | `MGS-M-MOLA-5-MEGDR-L3-V1.0` | `product-06` | Yes (`megt90n000cb.img`, `4 px/deg` / `14.818 km/px`, `LOCAL_RAW`, `OBSERVED`) | Global Geodetic Datum Check | **ACCEPT_WITH_CAVEATS** |
| 6 | CRISM Targeted Scene | `FRT000047A3_MTRDR` / `frt00005850` | `product-07` | No (`STATIC_METADATA`, `INTERPRETED` curated summaries) | Astrobiology Science Value | **ACCEPT** |
| 7 | USGS Geologic Map | `10.3133/sim3464` | `product-08` | No (`STATIC_METADATA`, `INTERPRETED` unit summaries) | Stratigraphic Science Value | **ACCEPT** |
| 8 | Perseverance Traverse | `mars2020_places` | Referenced under `product-09` & Atlas `PLN-VEC-04` | Raw JSON (`data/raw/perseverance/M20_traverse.json`, `M20_waypoints.json`) | Ground-Truth Route Validation | **ACCEPT** |
| 9 | Perseverance MEDA In-Situ | `mars2020_meda` | `product-09` | No (`STATIC_METADATA`; curated historical scenarios) | Historical Weather & Dust Baseline | **ACCEPT** |
| 10 | Mars Climate Database (MCD) | `MCD_v6.1_LMD` | `product-10` | No (`MODEL_SIMULATED`, `reg-jezero` regional scope) | Macro Climatology & Diurnal Scenarios | **ACCEPT** |

> [!NOTE]
> `is_ingested = True` in `backend/app/catalog/datasets.py` tracks the four primary orbital/altimetric raw archive dossiers (`product-01`, `product-03`, `product-04`, `product-06`) stored under `data/raw/`. Perseverance traverse telemetry JSONs (`M20_traverse.json` and `M20_waypoints.json`) are stored locally under `data/raw/perseverance/` and indexed via Atlas `PLN-VEC-04`, whereas `product-09` (MEDA sensor time-series archive) and curated CRISM/SIM-3464 metadata tables report `is_ingested = False`.

---

## 4. Authoritative Resampling & Aggregation Policy (M0.2-GEO / MW-DATA-02)

To ensure scientific integrity and eliminate documentation drift, the following resampling methods are codified across the ingestion, analysis, and routing pipelines:

| Data Layer Category | Source Product Example | Reprojection / Warping Method | Downsampling / Aggregation Method | Scientific Justification |
|---|---|---|---|---|
| **Continuous Elevation (DTM)** | HiRISE 1m, CTX 20m DTM | `Resampling.bilinear` | Conservative Mean / Bilinear | Avoids artificial overshoots and ringing artifacts (Runge's phenomenon) on steep delta cliffs that occur with bicubic interpolation on step discontinuities. |
| **Visual Imagery / Orthophoto** | CTX 6m Ortho, HiRISE 0.25m ORI | `Resampling.cubic` | Cubic Convolution | Preserves high-frequency visual edge contrast and visual clarity for orbital basemap visualization. |
| **High-Resolution Hazards & Obstacles** | Boulders, Scarps, Hard Obstacles | **Native 1.0m Detection** (`native_hazards.py`) | **Conservative Maximum / Any-Hit OR** | In compliance with `AGENTS.md` §3, terrain hazards are computed at native 1.0m resolution *prior* to downsampling; isolated 1–3m boulders or cliff breaks are preserved via any-hit logical OR and block maximum pooling into the 20m ARD grid. |
| **Categorical / Geological Units** | USGS Jezero Geologic Map, Epistemic Source ID | `Resampling.nearest` | Nearest Neighbor / Mode | Prevents inventing artificial non-existent intermediate class IDs between distinct geologic or epistemic classifications. |
| **NoData / Coverage Masks** | Data Presence Masks, Shadow Keep-Out | `Resampling.nearest` | Any-Hit Unknown (`any(nodata) → impassable`) | Guarantees unknown terrain is never diluted into safe terrain. |

---

## 5. Authoritative Multi-Source Hazard Fusion & Obstacle Policy (M0.2.1)

### 5.1 Source-Resolution Hierarchy
Marswalk Planner strictly enforces a source-resolution hierarchy:
1. **Tier L0 / High-Resolution Orbital (1.0 m/pixel HiRISE):** Sufficient to detect metre-scale rocks, isolated boulders, micro-roughness, and steep cliff scarps.
2. **Tier L2 / Regional Context Orbital (20.0 m/pixel CTX):** Sufficient for macro-topography, regional valley slopes, and large craters, but **blind to metre-scale hazards** (Apollo-class spacesuit trip obstacles).
3. **Tier L3 / Global Altimetry (14.818 km/pixel local MOLA C-grid `megt90n000cb.img`; 463 m/pixel PDS archive max):** Regional geodetic datum check only; strictly prohibited as a sole basis for human traversability.

### 5.2 Four-Case Authoritative Fusion Policy
Every $20\text{ m} \times 20\text{ m}$ analysis grid cell is classified under one of four non-overlapping cases:

* **Case A — Authentic Native HiRISE Coverage (`source_id == 2`):**
  * Evaluated directly from 1.0 m native DTM Horn slope, TRI, morphological top-hat rock peaks, and scarp breaks via conservative aggregation (`NativeResolutionHazardPipeline`).
  * If native 1m detector flags an obstacle (slope $\ge 25^\circ$, boulder score $\ge 0.50$, scarp $\ge 0.50$): cell is marked **HARD IMPASSABLE** (`NATIVE_HIRISE_OBSTACLE`).
  * If sub-critical: cell is passable with ordinal Data Reliability Index `0.95` (uncalibrated relative index over 1m DTM; note that 20m CV optical boulder/sand/crater heuristics still consume the 20m-warped 6m CTX orthomosaic, NOT 0.25m HiRISE ortho).
  * **Nominal Precision Tier:** `0.20 m` provisional unverified relative tier (`HEURISTIC`; excludes unquantified absolute areoid bias, bilinear resampling attenuation, and local stereo decorrelation). Never report as a validated $\pm 1\sigma$ physical error bar.

* **Case B — HiRISE NoData, Valid CTX Coverage (`source_id == 1`):**
  * Observed at 20 m spacing, but metre-scale hazards are unresolved.
  * **Nominal Precision Tier:** `2.00 m` provisional unverified relative tier (`HEURISTIC`).
  * Macro-hazards from CTX (slope $\ge 25^\circ$, TRI $\ge 8.0\text{ m}$) are marked **HARD IMPASSABLE** (`CTX_SLOPE_GT_MAX` / `CTX_TRI_GT_MAX`).
  * Sub-critical CTX slopes: **Unresolved High-Resolution Hazard Uncertainty**.
    * **Default Conservative Safety Policy (`forbid_resolution_uncertainty=True`):** In compliance with `AGENTS.md` Rule 7 ("Unknown terrain is never safe"), unverified CTX-only terrain outside the HiRISE swath is marked **HARD IMPASSABLE** (`UNRESOLVED_RESOLUTION_HAZARD`).
    * **Permissive Risk Policy:** Exposes CTX-only terrain as passable with maximum uncertainty cost ($c_{\text{unc}} = 1.0$), explicitly flagged in the `resolution_uncertainty_mask` with an epistemic warning that safety is unverified.

* **Case C — Neither Sensor Valid / Unmapped (`source_id == 0`):**
  * Cell is marked **HARD IMPASSABLE** (`NO_DATA_UNKNOWN`).
  * **NoData & Reliability Semantics:** Continuous float32 uncertainty/reliability layers use `STANDARD_NODATA_FLOAT = -9999.0` (never `999.0` or `0.0`); uint8 binary masks use `nodata = 255` so valid `0` and `1` states remain distinct; API inspection returns `null` (`N/A`) with `epistemic_class = "UNKNOWN"`.

* **Case D — Conflicting Source Information:**
  * Strict conservative preservation: an obstacle detected by any valid sensor is preserved and never cleared or averaged away.

### 5.3 Authoritative Product Ownership Matrix

| Product Filename | Generating Engine | Epistemic Class | Downstream Consumer |
|---|---|---|---|
| `jezero_western_delta_20m_elevation.tif` | `PreprocessingPipeline` | `DERIVED` | All terrain, hazard & costmap pipelines |
| `jezero_western_delta_20m_source_id.tif` | `PreprocessingPipeline` (`nodata=255`; `0`=unmapped, `1`=CTX, `2`=HiRISE) | `OBSERVED` | Hazard & terrain intelligence engines |
| `jezero_western_delta_20m_ortho_imagery.tif` | `PreprocessingPipeline` (from `JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`, DOI `10.5066/P9GV1ND3`, warped to 20 m) | `DERIVED` | `TerrainIntelligenceEngine` CV optical detectors, UI Atlas |
| `jezero_western_delta_20m_hirise_coverage.tif` | **`PreprocessingPipeline` (Sole Owner)** (`nodata=255`) | `OBSERVED` | `NativeResolutionHazardPipeline`, `HazardIntelligenceEngine`, UI Atlas |
| `jezero_western_delta_20m_ctx_coverage.tif` | **`PreprocessingPipeline` (Sole Owner)** (`nodata=255`) | `OBSERVED` | `HazardIntelligenceEngine`, UI Atlas |
| `jezero_western_delta_20m_uncertainty_sigma_z.tif` | **`PreprocessingPipeline` (Sole Owner)** (`nodata=-9999.0`) | `HEURISTIC` | `HazardIntelligenceEngine`, `CostmapEngine`, `/hazards/inspect` |
| `jezero_western_delta_20m_slope_deg.tif` | **`TerrainIntelligenceEngine` (Sole Owner)** | `DERIVED` | `HazardIntelligenceEngine`, `CostmapEngine`, Routing |
| `jezero_western_delta_20m_tri_roughness_m.tif` | **`TerrainIntelligenceEngine` (Sole Owner)** | `DERIVED` | `HazardIntelligenceEngine`, `CostmapEngine`, Routing |
| `jezero_western_delta_20m_surface_roughness_m.tif` | **`TerrainIntelligenceEngine` (Sole Owner)** | `DERIVED` | `CostmapEngine`, Routing |
| `jezero_western_delta_20m_boulder_hazard_score.tif` | **`TerrainIntelligenceEngine` (Sole Owner, from 20m CTX ortho, `nodata=-9999.0`)** | `HEURISTIC` | `HazardIntelligenceEngine`, `/hazards/inspect` |
| `jezero_western_delta_20m_sand_hazard_score.tif` | **`TerrainIntelligenceEngine` (Sole Owner, from 20m CTX ortho, `nodata=-9999.0`)** | `HEURISTIC` | `HazardIntelligenceEngine`, `/hazards/inspect` |
| `jezero_western_delta_20m_crater_hazard_score.tif` | **`TerrainIntelligenceEngine` (Sole Owner, from 20m CTX ortho, `nodata=-9999.0`)** | `HEURISTIC` | `HazardIntelligenceEngine`, `/hazards/inspect` |
| `jezero_western_delta_20m_terrain_confidence.tif` | **`TerrainIntelligenceEngine` (Sole Owner)** (`nodata=-9999.0`) | `HEURISTIC` | `MultiResolutionTerrainInspector`, UI Atlas |
| `jezero_western_delta_20m_hirise_hazard_obstacles.tif` | **`NativeResolutionHazardPipeline` (Sole Owner)** (`nodata=255`) | `HEURISTIC` | `HazardIntelligenceEngine`, `/hazards/inspect` |
| `jezero_western_delta_20m_hirise_boulder_score.tif` | **`NativeResolutionHazardPipeline` (Sole Owner)** (`nodata=-9999.0`) | `HEURISTIC` | UI Atlas, QC Inspection |
| `jezero_western_delta_20m_hirise_slope_deg.tif` | **`NativeResolutionHazardPipeline` (Sole Owner)** | `DERIVED` | UI Atlas, QC Inspection |
| `jezero_western_delta_20m_hirise_surface_roughness_m.tif` | **`NativeResolutionHazardPipeline` (Sole Owner)** | `DERIVED` | UI Atlas, QC Inspection |
| `jezero_western_delta_20m_hazard_resolution_uncertainty.tif` | **`HazardIntelligenceEngine` (Sole Owner)** | `DERIVED` | `CostmapEngine`, UI Inspection |
| `jezero_western_delta_20m_hazard_unknown_mask.tif` | **`HazardIntelligenceEngine` (Sole Owner)** | `UNKNOWN` | `CostmapEngine`, UI Inspection |
| `jezero_western_delta_20m_hazard_data_confidence.tif` | **`HazardIntelligenceEngine` (Sole Owner)** (`nodata=-9999.0`) | `HEURISTIC` | `RouteOptimizationEngine`, UI Inspection |
| `jezero_western_delta_20m_hazard_detection_confidence.tif` | **`HazardIntelligenceEngine` (Sole Owner)** (`nodata=-9999.0`) | `HEURISTIC` | `RouteOptimizationEngine`, UI Inspection |
| `jezero_western_delta_20m_hazard_spatial_uncertainty_m.tif` | **`HazardIntelligenceEngine` (Sole Owner)** (`nodata=-9999.0`) | `HEURISTIC` | UI Inspection, Costmap Audit |
| `jezero_western_delta_20m_hazard_overall_score.tif` | **`HazardIntelligenceEngine` (Sole Owner)** | `HEURISTIC` | `CostmapEngine`, API `/hazards` |
| `jezero_western_delta_20m_hazard_hard_impassable.tif` | **`HazardIntelligenceEngine` (Sole Owner)** | `HEURISTIC` | **`RouteOptimizationEngine`**, **`CostmapEngine`** |
| `jezero_western_delta_20m_costmap_*.tif` | **`CostmapEngine` (Sole Owner)** | `HEURISTIC` | `RouteOptimizationEngine`, API `/costmap` |
