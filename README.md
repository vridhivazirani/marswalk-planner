# MARSWALK — An Integrated Planetary Exploration and Human Mars Mission Planning Platform

> ⚠️ **Scientific Integrity & Safety Disclaimer:**  
> Marswalk Planner is a research and education decision-support prototype. It is not NASA software, is not endorsed or certified by NASA or any space agency, and must not be used for operational astronaut-safety or mission decisions.

---

## 1. Project Overview

**MARSWALK** is an advanced planetary geospatial intelligence and human Extravehicular Activity (EVA) mission planning decision-support platform designed for Mars exploration, focusing on Jezero Crater and priority Martian exploration provinces.

Planning human surface traverses on Mars demands bridging the gap between orbital planetary science and tactical surface operations. Marswalk connects:
- Global planetary exploration across authenticated Martian reference systems (`IAU_2015:49900` sphere, $R = 3{,}396{,}190\text{ m}$).
- Authentic scientific datasets from NASA PDS, USGS Astrogeology, MOLA, and CRISM archives.
- High-resolution digital elevation models and aspect-unbiased geomorphic hazard analytics.
- Multi-objective human EVA traverse optimization comparing safety-first, science-first, and balanced cost profiles.
- Operational mission simulation with astronaut metabolic telemetry, daylight/shadow conditions, dust storm contingencies, and persistent mission decisions.

---

## 2. Key Features

### 🗺️ Mars Explorer
- **Interactive 3D Mars Globe:** Real-time Three.js planetary globe rendering authentic global MOLA color topography and shaded relief textures, with atmospheric limb shading, camera controls, and geographic coordinate raycasting.
- **2D Planetary Atlas:** High-performance Leaflet-based Mars cartographic atlas operating in Mars Plate Carrée coordinates, linking 12 priority exploration regions (Olympus Mons, Gale Crater, Valles Marineris, Jezero Crater, etc.).
- **Authoritative Feature Synchronization:** Unidirectional state management synchronizing feature selection, regional dossiers, coordinate inspection, and camera focus between the 3D Globe, 2D Atlas, and Mission Control.

### 🔬 Scientific Exploration & Regional GIS
- **Jezero Crater Regional GIS Atlas:** High-fidelity regional context covering the Jezero Western Fan and delta margin, integrating USGS SIM-3464 geologic units with detailed stratigraphy.
- **CRISM Targeted Mineralogy:** Co-registered Compact Reconnaissance Imaging Spectrometer for Mars (CRISM) targeted spectral indices highlighting carbonates, smectites, and hydrated silica deposits.
- **Perseverance Historical Telemetry:** Authentic rover traverse vectors and waypoint stops (Sols 0–1000+) with MOLA geoid elevations, sample depot locations, and scientific field notes.
- **Scientific Opportunity Scoring:** Objective target prioritization evaluating mineral diversity, delta fan architecture, and geomorphic context.

> *Note on Optical Imagery:* In keeping with strict scientific integrity, high-resolution optical camera orthomosaics are not simulated or artificially upscaled. Missing optical coverage is clearly labeled as unavailable, with terrain and routing operations powered by authentic digital terrain models and vector elevation contours.

### 🧭 Human EVA Mission Planner
- **Sortie Configuration:** Interactive configuration of Base Camp, primary Science Destination, and multi-stop scientific target sequences within validated bounding envelopes.
- **Terrain-Aware Traversal Engine:** Cost surfaces evaluated across Horn's slope derivatives, micro-relief hazards, surface roughness, and epistemic uncertainty penalties.
- **Multi-Objective Route Comparison:** Simultaneous computation and side-by-side trade-off analysis of three distinct profiles:
  - `SAFETY_FIRST`: Heavily penalizes slopes $\ge 15^\circ$, terrain classes, and data uncertainty.
  - `SCIENCE_FIRST`: Maximizes proximity to high-value astrobiological and stratigraphic targets.
  - `BALANCED`: Standard compromise between energetic expenditure, traversal distance, and science return.
- **Mission Decision Persistence:** Authoritative route selection, stale-route detection on waypoint modification, and lossless JSON mission bundle exports (`MissionBundleV1`).

### 🧑‍🚀 Mission Control & Operations
- **Real-Time EVA Sortie Simulation:** Real-time simulation of astronaut traversal dynamics, oxygen consumption, suit battery depletion, and distance pacing.
- **Environmental Context Scenarios:** Solar elevation calculations, diurnal shadows, ambient temperature fluctuations, and atmospheric dust storm optical depth ($\tau$) modifiers.
- **Emergency Abort & Rerouting:** Automated fail-safe shortest-path escape computation back to Base Camp upon trigger of thermal, metabolic, or environmental contingencies.
- **Mission Reports & Provenance:** Generation of structured expedition dossiers documenting epistemic classifications (`OBSERVED`, `DERIVED`, `INTERPRETED`, `HEURISTIC`), data lineage, and disclaimers.

---

## 3. System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             REACT FRONTEND (Vite)                           │
│   ├── Navigation & Mission Context State (useMission / missionReducer)      │
│   ├── 3D Mars Globe (Three.js / WebGL / IAU_2015 Sphere)                    │
│   ├── 2D Cartographic Atlas & Regional GIS (Leaflet / GeoJSON / Contours)    │
│   ├── EVA Route Comparison & Mission Simulation HUD                         │
│   └── MissionBundleV1 Serialization & Storage Engine                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST API (/api/v1)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            FASTAPI PYTHON BACKEND                           │
│   ├── API Layer (routes: atlas, terrain, hazards, routing, mission, science)│
│   ├── Domain Services (route_comparison, emergency_response, mission_plan)  │
│   ├── Routing Engine (A* Search / Cost Evaluation / Heuristics)             │
│   ├── Hazards & Uncertainty Engine (Horn's Slope / Epistemic Fusion)        │
│   ├── Geospatial Core (CRS Transformation: IAU_2015:49900 <-> ESRI:103885) │
│   └── Scientific Catalog & Data Lake (data/raw/, data/processed/, catalogs) │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Geodetic Integrity:** Mars planetocentric latitude and east-positive longitude in $[-180, 180)^\circ$. Geographic analyses anchor to the Mars 2015 Sphere (`IAU_2015:49900`, $R = 3{,}396{,}190\text{ m}$), projected into Jezero Equirectangular (`ESRI:103885`). Earth projections (e.g. EPSG:3857) are strictly prohibited.
- **Backend Layering:** Enforced unidirectional architecture (`api` $\rightarrow$ `services` $\rightarrow$ `domain` $\rightarrow$ `core`). Routers remain thin; scientific and routing logic resides strictly within domain packages.

---

## 4. Technology Stack

- **Frontend:**
  - React 19 + TypeScript (strict mode)
  - Vite 8.3
  - Three.js (WebGL 3D planetary rendering)
  - Leaflet 1.9 (2D GIS cartography & GeoJSON vector rendering)
  - Tailwind CSS + Custom Aerospace HUD Design System
  - Oxlint + Node Test Runner
- **Backend:**
  - Python 3.12+
  - FastAPI + Uvicorn (async REST API)
  - Rasterio & GDAL (windowed raster analysis, GeoTIFF processing)
  - NumPy & SciPy (numerical array convolutions, gradient evaluation)
  - PyProj (Mars ellipsoid and coordinate reference transformations)
  - Ruff (linting and formatting)
  - Pytest (unit, architecture, and scientific parity tests)

---

## 5. Repository Structure

```text
marswalk-planner/
├── AGENTS.md                  # Project rules & scientific integrity principles
├── README.md                  # Comprehensive project documentation
├── .env.example               # Environment configuration template
├── backend/                   # Python FastAPI backend & geospatial library
│   ├── app/
│   │   ├── api/routes/        # REST endpoints (atlas, routing, hazards, mission)
│   │   ├── catalog/           # Planetary datasets, regions, and geology registries
│   │   ├── core/              # Epistemic tags, configuration, disclaimer
│   │   ├── costmap/           # Multi-criteria traversal cost pipelines
│   │   ├── geospatial/        # MarsCoordinateSystem, grid utilities, projections
│   │   ├── hazards/           # Slope masks, rock densities, uncertainty propagation
│   │   ├── mission/           # Mission models, bundle migration, validators
│   │   ├── routing/           # Graph search, A* algorithm, EVA sortie solver
│   │   ├── services/          # Route comparison, emergency response, mission planning
│   │   └── terrain/           # DTM processing, analytical hillshade, geomorphic units
│   ├── tests/                 # Unit, integration, and architecture test suites
│   └── pyproject.toml         # Python package dependencies & build configuration
├── frontend/                  # React 19 + TypeScript web application
│   ├── src/
│   │   ├── api/               # API clients for backend services
│   │   ├── components/        # UI components (Globe, Regional Map, EVA HUDs)
│   │   ├── context/           # MissionContext & mission hook architecture
│   │   ├── mission/           # Reducer, URL synchronizer, validation models
│   │   ├── navigation/        # Experience routes and regional capability profiles
│   │   ├── pages/             # Mars Explorer, EVA Planner, Mission Simulation, etc.
│   │   └── types/             # TypeScript domain models and DTO interfaces
│   ├── tests/                 # Node.js automated test suites
│   └── package.json           # Frontend dependencies and npm scripts
├── data/                      # Planetary data lake
│   ├── catalog/               # Tracked JSON metadata, provenances, and manifests
│   └── raw/ / processed/     # Authentic planetary rasters (git-ignored for hygiene)
└── docs/                      # Architectural Decision Records (ADRs) & audit reports
```

---

## 6. Installation & Setup

### Prerequisites
- Python $\ge$ 3.11 (tested on Python 3.12.4)
- Node.js $\ge$ 20.0 (tested on Node.js 22+)
- npm $\ge$ 10.0
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/vridhivazirani/marswalk-planner.git
cd marswalk-planner
```

### 2. Backend Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
cd ..
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cd ..
```

### 4. Running the Application
Launch both servers in separate terminal sessions:

**Terminal 1 — Backend API Server:**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API Health Status: `http://127.0.0.1:8000/api/v1/health`
- Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`

**Terminal 2 — Frontend Application:**
```bash
cd frontend
npm run dev
```
Open **`http://localhost:5173`** in Safari, Chrome, or any modern web browser.

---

## 7. Testing & Quality Verification

All suites must execute cleanly before changes are integrated:

```bash
# 1. Backend Linting & Formatting
cd backend && .venv/bin/ruff check .

# 2. Backend Unit, Integration & Architecture Tests (296 tests)
cd backend && .venv/bin/pytest -q

# 3. Frontend Static Analysis & Strict Linting (0 warnings, 0 errors)
cd frontend && npx oxlint

# 4. Frontend Automated Test Suite (53 tests)
cd frontend && npm test

# 5. Production TypeScript Build & Asset Packaging
cd frontend && npm run build
```

---

## 8. Data Sources & Scientific Provenance

| Dataset | Mission / Instrument | Official Archive / Provider | Product ID / Reference |
|---|---|---|---|
| **MOLA Global MEGDR** | Mars Global Surveyor (MOLA) | NASA PDS Geosciences Node | `megt_128_topo` (128 px/deg) |
| **MOLA Shaded Relief** | Mars Global Surveyor (MOLA) | USGS Astrogeology Science Center | Mars MOLA Color/Shaded Basemaps |
| **Jezero Regional Geologic Map** | Mars Reconnaissance Orbiter / HRSC | USGS Scientific Investigations Map | USGS SIM-3464 (Sun & Stack, 2020) |
| **CRISM Targeted Observations** | Mars Reconnaissance Orbiter (CRISM) | NASA PDS Geosciences Node | TRR3 Spectral Mineral Parameters |
| **Perseverance Rover Telemetry** | Mars 2020 Perseverance Rover | NASA Jet Propulsion Laboratory (JPL) | M20 Rover Waypoint & Traverse Logs |
| **HiRISE & CTX Terrain Models** | MRO HiRISE / CTX Stereophotogrammetry | USGS Astrogeology TRN Project | Jezero Western Delta ARD Elevation Grid |

---

## 9. Limitations & Scientific Integrity

1. **Epistemic Classifications:** All data values and layers are explicitly marked with one canonical epistemic tag: `OBSERVED`, `DERIVED`, `INTERPRETED`, `PREDICTED`, `HEURISTIC`, or `SIMULATED`.
2. **Geographic Scoping:** Metre-scale traversal hazard evaluation applies strictly to the Jezero Western Fan and Delta study footprint. Regional provinces (e.g. Olympus Mons, Gale Crater) are supported through regional and orbital GIS datasets without fabricating local DTM coverage.
3. **Fail-Closed Hazard Semantics:** Unmapped or NoData terrain regions are treated as strictly impassable by default. Unknown terrain is never assumed safe.
4. **Human Suit Heuristics:** Spacesuit metabolic consumption models, consumables pacing, and speed envelopes are illustrative engineering heuristics for educational decision support.
5. **Digital Twin Isolation:** The high-resolution local raster display component of the Jezero Digital Twin is currently isolated from the primary user flow to prioritize application stability and verified vector workflows.

---

## 10. License & Credits

- **License:** No license has yet been specified for this repository. All rights reserved by the original project contributors.
- **Acknowledgements:** Planetary datasets courtesy of NASA, Jet Propulsion Laboratory (JPL), USGS Astrogeology Science Center, and the international planetary science community.
