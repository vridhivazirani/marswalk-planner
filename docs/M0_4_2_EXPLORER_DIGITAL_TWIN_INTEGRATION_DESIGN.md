# M0.4.2 Architecture & Design Specification: Explorer + Jezero Digital Twin Integration

**Milestone:** M0.4.2  
**Project:** Marswalk Planner (`marswalk-planner`)  
**Status:** Design Approved Prior to Implementation (Phase 2)  
**Baseline:** M0.3.4 (Scientific & Raster Consistency) + M0.4.1 / M0.4.1.1 (`MissionContext`, pure bootstrap, URL sync, lifecycle hardening)  

> **Prototype Disclaimer:** Marswalk Planner is a research and educational decision-support prototype. It is **not** NASA software, is **not** certified or validated for flight or EVA astronaut safety, and makes no claims regarding extraterrestrial life.

---

## 1. Architecture Overview

M0.4.2 connects three previously loosely coupled exploration surfaces into a single coherent planetary mission workflow governed by the shared `MissionContext` (`MissionProvider`, `missionReducer`, and `MissionBundleV1`):

1. **Global & Regional Planetary Explorer (`MapExplorerPage.tsx`, `GlobalMarsMap.tsx`, `GlobalMarsGlobe3D.tsx`, `RegionalMarsMap.tsx`)**
   - Enables global exploration across Mars, regional inspection of the 12 registered priority study regions (`/api/v1/regions`), dataset provenance review, and honest region-capability inspection.
2. **Jezero Scientific Digital Twin (`DigitalTwinPage.tsx`, `MarsMap2D.tsx`, `MarsMap3D.tsx`)**
   - Provides interactive 2D (`L.CRS.EPSG4326`) and 3D (Three.js MOLA/CTX mesh) local terrain exploration strictly for the region that owns authentic high-resolution ARD rasters (`reg-jezero`).
   - Inspects multi-layer terrain telemetry, hazard scores, passability/NoData masks, reliability indices, costmap scores, and scientific opportunity at any clicked coordinate.
3. **Science Target Queue & EVA Route Handoff (`MissionContext`, `EVARoutePlannerPage.tsx`)**
   - Supports inspecting, adding/removing, and queueing ranked scientific targets (`SCI-01`..`SCI-07` from `/api/v1/science/targets`), recording lightweight field observations (`savedObservations`), setting Base Camp / Destination with explicit overwrite safeguards, and opening `EVARoutePlannerPage` with preserved geographic, scientific, and operational mission context.

All existing M0.1–M0.4.1.1 invariants remain intact:
- Authoritative geospatial, hazard fusion, uncertainty, costmap, and routing calculations stay **server-side**.
- `NoData` and unmapped terrain fail closed (`is_passable = false`, `UNKNOWN` / `IMPASSABLE`).
- No fabricated planetary datasets or synthetic overlays masquerading as Mars observations.

---

## 2. Component & Data Flow Diagram

```mermaid
flowchart TB
    subgraph Explorer["1. Mars Explorer (Global & Regional)"]
        GM2["GlobalMarsMap (2D)"]
        GM3["GlobalMarsGlobe3D (3D)"]
        RM["RegionalMarsMap + RegionCapabilityPanel"]
        ME["MapExplorerPage"]
    end

    subgraph SharedState["2. Shared MissionContext (MissionBundleV1 + localStorage + URL)"]
        MC["MissionProvider & useMission"]
        CAP["regionCapabilities.ts (12-Region Capability Matrix)"]
    end

    subgraph Twin["3. Jezero Scientific Digital Twin (reg-jezero only)"]
        DT["DigitalTwinPage + GuardBanner + InspectorActions"]
        M2D["MarsMap2D (L.CRS.EPSG4326) + Layer Controls"]
        M3D["MarsMap3D (Three.js + WebGL Dispose)"]
    end

    subgraph Planner["4. Downstream Mission Planning"]
        EVA["EVARoutePlannerPage (Base Camp, Destination, Queued Science Context)"]
    end

    subgraph Backend["5. Existing Authoritative Backend APIs (/api/v1)"]
        REG["/regions, /atlas/*"]
        TWINAPI["/twin/*, /terrain/inspect"]
        HAZ["/hazards/inspect, /costmap/inspect"]
        SCI["/science/targets, /science/inspect, /science/objectives"]
    end

    GM2 -->|select region/coords| ME
    GM3 -->|select region/coords| ME
    RM -->|fetch dossier| REG
    ME -->|setActiveRegion / setActivePage('digital-twin')| MC
    MC --> CAP
    CAP -->|supportsLocalDigitalTwin === true ('reg-jezero')| DT
    CAP -->|false (11 orbital-only regions)| Guard["Honest Non-Jezero Guard + Region Limitations"]
    DT <-->|read/toggle activeLayers, inspect coords| MC
    DT <--> M2D
    DT <--> M3D
    DT -->|inspectCoordinates()| TWINAPI
    DT -->|inspectCoordinates()| HAZ
    DT -->|inspectCoordinates() + target catalog| SCI
    DT -->|Set Base Camp / Dest (guarded) / Queue Target / Save Observation| MC
    DT -->|Open EVA Planner (setActivePage('route-planner'))| MC
    MC -->|startPoint, destPoint, queuedTargets, savedObservations| EVA
```

---

## 3. Shared `MissionContext` State Ownership & Actions

`MissionContext` (`frontend/src/context/MissionContext.tsx`) remains the single source of truth across page switches, explorer tabs, browser reload (`marswalk:mission:draft:v1`), and URL sync (`?page=...&region=...&mission=...`).

### 3.1 Owned State (`MissionBundleV1`, `schemaVersion: '1.0'`)
- **`geographic`:**
  - `regionId` (`reg-jezero` or any of the 12 registered region IDs)
  - `selectedLocation` (`MarsCoordinate | null` — clicked point in Explorer/Digital Twin)
  - `mapCenter` & `mapZoom` (context continuity across tabs/pages)
  - `activeLayers` (`Record<string, boolean>` synced with `MarsMap2D` toggles)
  - `terrainResolution` (`'1m' | '20m'`)
- **`science`:**
  - `selectedTarget`: currently active `MissionScienceTargetRef | null`
  - `selectedGeologicalFeature`: `MissionGeologicalFeatureRef | null`
  - `selectedHazard`: `MissionHazardRef | null` (using authentic backend `epistemicClass`, never hardcoded)
  - `queuedTargets`: `MissionScienceTargetRef[]` (persisted science targets queued for EVA sorting/planning)
  - `savedObservations`: `MissionObservationRecord[]` (lightweight scientist notes/observations linked to coordinate, optional `targetId`, `regionId`, `datasetRef`, and explicit `epistemicClass`)
- **`eva`:**
  - `baseCamp`: `MarsCoordinate`
  - `destination`: `MarsCoordinate`
  - `waypoints`: `MissionSortieWaypoint[]` (synced intentionally when queueing/sending science targets or editing EVA legs)
  - `routeProfile` & `customWeights`
- **Runtime (non-persisted inspect cache in `MissionProvider`):**
  - `selectedHazard` (`LocationHazardInspection | null`)
  - `selectedCost` (`CostmapInspectionResponse | null`)
  - `selectedTerrain` (`MultiResInspectResult | null`) — added so Digital Twin displays real 20m/1m elevation, slope, TRI, source product, and 1m micro-window telemetry!
  - `selectedScience` (`ScienceInspectionResponse | null`) — added so Digital Twin displays local scientific opportunity score and life-inference/safety disclaimers!
  - `inspectionError`: `string | null` — surfaced when coordinate inspection fails instead of leaving stale readings visible.
  - `selectedTargetFeature` (`CandidateTargetFeature | null`)
  - `isInspecting` (`boolean`) + `inspectionSeqRef` (monotonic sequence guard canceling/ignoring out-of-order responses, plus resetting runtime inspection cache when switching away from `reg-jezero`).

### 3.2 Backward-Compatible Additive Schema Extensions
All new fields on `MissionScienceTargetRef` and `MissionObservationRecord` are **optional** so any existing `MissionBundleV1` (`schemaVersion: '1.0'`) saved in `localStorage` remains valid without migration breakage:
- `MissionScienceTargetRef`: optional `regionId?: string`, `datasetRef?: string`, `notes?: string`, `addedAt?: string`.
- `MissionObservationRecord`: optional `regionId?: string`, `targetId?: string`, `datasetRef?: string`, `elevationM?: number | null`, `resolutionClass?: string`.

### 3.3 New / Upgraded Typed Actions
- `queueScienceTarget(target: MissionScienceTargetRef)` & `unqueueScienceTarget(targetId: string)` (backed by `MISSION/UPSERT_QUEUED_TARGET` and `MISSION/REMOVE_QUEUED_TARGET`)
- `syncTargetToWaypoints(target: MissionScienceTargetRef)` / `openEvaPlanner()` (sets active page to `'route-planner'` while carrying `baseCamp`, `destination`, `selectedTarget`, `queuedTargets`, and `savedObservations`)
- Upgraded `selectTargetFeature(feature)`: preserves `elevationM` from `feature.geometry.coordinates[2]` and carries `regionId: 'reg-jezero'`, `datasetRef: 'jezero_western_delta_20m_science_targets'`, `epistemicClass: feature.properties.epistemic_class`.
- Upgraded `inspectCoordinates(coords)`:
  1. Validates `isValidCoordinate(coords)` and rejects/marks non-Jezero local inspection gracefully if `regionId !== 'reg-jezero'`.
  2. Clears stale `inspectionError`, increments `inspectionSeqRef`.
  3. Runs `inspectLocationHazard`, `inspectLocationCost`, `inspectTerrainPoint`, and `inspectLocationScience` in `Promise.all` (with per-endpoint safe fallback where `/terrain/inspect` or `/science/inspect` is handled explicitly if temporarily unavailable, while marking any failed inspect clearly).
  4. Propagates `hazData.epistemic_class` faithfully (not hardcoded `'DERIVED'`).

---

## 4. Verified 12-Region Capability Matrix (`regionCapabilities.ts`)

Verified directly against `backend/app/catalog/region_registry.py`:

| Region ID | Region Name | `has_local_digital_twin` | Registered Datasets & Resolutions | Supported Explorer / Twin Capabilities | Limitations / Guardrail |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `reg-jezero` | Jezero Crater (Western Basin & River Delta) | **Yes** (`digital-twin`) | `PLN-SRC-08` (HiRISE 1.0 m/px `OBSERVED`), `PLN-SRC-06` (CTX 20.0 m/px `DERIVED`), `PLN-SRC-05` (CTX 6.0 m/px Ortho `OBSERVED`), `PLN-INT-02` (USGS 1:75k Vector `INTERPRETED`) | Global + Regional Dossier + Jezero 2D/3D Digital Twin + Multi-Res Hazard/Terrain Inspection + Ranked Science Targets + EVA Routing | Local Digital Twin restricted strictly to Western Delta footprint (`18.211°–18.7212°N`, `77.1605°–77.6992°E`). Outside footprint fails closed as `OUT_OF_BOUNDS`. |
| `reg-gale` | Gale Crater (Mount Sharp & Aeolis Palus) | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`), `PLN-INT-01` (USGS 1:100k `INTERPRETED`) | Global Map/Globe + Regional Metadata Dossier | No local HiRISE/CTX ARD Digital Twin rasters, local hazard mask, or EVA route graph ingested. |
| `reg-valles-marineris` | Valles Marineris (Chasma Canyon System) | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`), `PLN-SRC-03` (THEMIS Day IR 231 m/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-olympus-mons` | Olympus Mons | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-tharsis` | Tharsis Volcanic Region | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-hellas` | Hellas Planitia | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-utopia` | Utopia Planitia | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-elysium` | Elysium Planitia | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-arcadia` | Arcadia Planitia | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-gusev` | Gusev Crater | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-north-polar` | North Polar Region (Planum Boreum) | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |
| `reg-south-polar` | South Polar Region (Planum Australe) | **No** | `PLN-SRC-01` (MOLA 46.3 km/px `OBSERVED`) | Global Map/Globe + Regional Metadata Dossier | Orbital context only; no local Digital Twin or EVA routing rasters. |

**Strict Region Rule:** Never auto-redirect a user from a non-Jezero region into Jezero data silently, and never show `"Enter Digital Twin"` as an active local terrain workspace for non-Jezero regions. Instead, show accurate dataset coverage & capability badges (`Global/Regional Context Only` vs `High-Res Digital Twin Ready`), and provide an explicit user-triggered button `"Switch to Jezero Crater & Open Digital Twin"` only with clear disclosure that it changes active region to `reg-jezero`.

---

## 5. Coordinate & Projection Contracts

- **Canonical Geographic Frame:** `IAU_2015:49900` (Mars Sphere `R = 3,396,190 m`), planetocentric latitude in `[-90, 90]`, east-positive longitude in `[-180, 180)`.
- **Frontend Longitude Normalization:** Normalize antimeridian-wrapped Leaflet coordinates using `((lon + 180) % 360 + 360) % 360 - 180` (with `lon === 180` wrapped to `-180`) before storing in `MissionContext` or querying `/api/v1`.
- **Frontend/Backend Analysis Split:** `MarsMap2D` displays overlays in `L.CRS.EPSG4326` equirectangular lat/lon bounds computed by the backend (`ESRI:103885` -> `IAU_2015:49900` perimeter reprojection in `/api/v1/twin/layers`). All metric slopes, distances, and pixel lookups occur server-side in `ESRI:103885`.
- **Jezero Bounds Check:** Frontend Digital Twin checks whether coordinates fall within `study_area.bounds` / backend `OUT_OF_BOUNDS` status before allowing EVA destination placement.

---

## 6. Scientific Target & Observation Contracts + Synthetic CV Disclosure

1. **Ranked Science Targets (`/api/v1/science/targets`):**
   - Loaded from `jezero_western_delta_20m_science_targets.json` (`SCI-01-KODIAK` etc., GeoJSON `[lon, lat, elev]`).
   - User can click a target marker on the 2D map **or** choose from a target drawer/selector on `DigitalTwinPage` to inspect its rank, composite score, breakdown (`mineralogy`, `diversity`, `layered_features`, `delta_context`, `rover_proximity`, `confidence`), rationale, `safety_caveat`, `life_inference_warning`, and `epistemic_class` (`INTERPRETED`).
   - Supported actions: **Queue Target for EVA Mission**, **Remove from Queue**, **Set as Sortie Destination** (with overwrite safeguard), **Save Observation**.

2. **Lightweight Mission Observations (`mission.science.savedObservations`):**
   - Structured `MissionObservationRecord`:
     - `id`, `category` (`'TERRAIN' | 'HAZARD' | 'SCIENCE' | 'GEOLOGY' | 'CUSTOM'`), `label`, `coordinate`, `summary`, `epistemicClass`, `recordedAt`, plus optional `regionId`, `targetId`, `datasetRef`, `elevationM`, `resolutionClass`.
   - Zero raster arrays stored in `localStorage`. Easily inspected, filtered/listed, and deleted cleanly.

3. **Computer Vision Candidate Detectors (`/api/v1/terrain/cv/candidates`):**
   - Verified in `backend/app/api/routes/terrain.py` L69–87: constructs a synthetic `100x100` elevation/orthophoto test window (`dem_sample`, `img_sample`) for demonstrating shadow trigonometry and Hessian ridge algorithms!
   - `GeologyMineralogyPage.tsx` (which consumes `fetchCVCandidates`) **must** display an explicit, unambiguous `SIMULATED / SYNTHETIC DEMONSTRATION WINDOW` provenance notice alongside `HEURISTIC` so users never mistake CV demonstration candidates for authentic Jezero observations.

---

## 7. Provenance, Epistemic Tag, Error, Loading & `NoData` Rules

1. **Exact Epistemic Propagation:**
   - Replace hardcoded `OBSERVED & DERIVED` in `DigitalTwinPage.tsx` L148 and hardcoded `'DERIVED'` in `MissionContext.tsx` L454 with the actual `epistemic_class` and per-property `property_epistemic_classes` returned by the backend (`OBSERVED`, `DERIVED`, `INTERPRETED`, `HEURISTIC`, `SIMULATED`, `UNKNOWN`).
   - Display `data_reliability_index` and `detection_reliability_index` explicitly as **uncalibrated ordinal indices [0–1]**, and `nominal_vertical_precision_m` explicitly with `uncertainty_precision_status` (provisional unverified nominal tier, not ±1σ calibrated error bars).
   - Display **Resolution Source** (`HiRISE 1m` vs `CTX 20m`) and `evidence_dimensions` (`source_coverage`, `optical_imagery_source`, `unresolved_evidence`).

2. **Fail-Closed `NoData` & `OUT_OF_BOUNDS` Semantics:**
   - If `selectedHazard.status === 'OUT_OF_BOUNDS'` or `elevation_m == null` or `hard_restriction_codes` includes `NO_DATA_UNKNOWN`:
     - Never render elevation as `0 m`, slope as `0°`, or overall hazard as `0%`!
     - Display `UNKNOWN / UNMAPPED` (`IMPASSABLE BY DEFAULT`), show `hard_restriction_code`, and block using `"N/A (Unmapped)"` for missing numeric metrics while **disabling** `Set Base Camp` / `Set Destination` at unmapped out-of-bounds locations (or warning explicitly).
   - If `UNRESOLVED_RESOLUTION_HAZARD` applies (CTX 20m only): flag unresolved sub-20m hazards clearly per M0.3.2 policy.

3. **Overwrite Safeguard (`Set Base Camp` / `Set Destination`):**
   - If the user already has a Base Camp or Destination different from the inspected coordinate (`Math.hypot(latDiff, lonDiff) > 1e-5`), clicking `Set as Base Camp` / `Set as Destination` opens an inline monochrome confirmation bar showing `Current (lat, lon) -> Proposed (lat, lon)` with explicit **Confirm Replace** / **Cancel** buttons so existing points are never silently overwritten.
   - Coordinate validation checks finite Mars bounds and Jezero study bounds when `study_area.bounds` is known.

---

## 8. Implementation Sequence

1. **M0.4.2-A (`mission/` & `types/` & `navigation/`):**
   - Add `frontend/src/mission/regionCapabilities.ts` codifying verified 12-region capability metadata & disclaimers/limitations.
   - Add optional M0.4.2 fields to `MissionScienceTargetRef` & `MissionObservationRecord` in `types/mission.ts` and preserve v1.0 validation in `missionModel.ts`.
   - Upgrade `MissionContext.tsx` + `useMission.ts`: expose `selectedTerrain`, `selectedScience`, `inspectionError`, `queueScienceTarget`, `unqueueScienceTarget`, safe `selectTargetFeature` elevation, faithful `epistemicClass` propagation, region-aware inspection guard, and explicit `openEvaPlanner` helper.
2. **M0.4.2-B (Regional Explorer Integration):**
   - Enhance `RegionalMarsMap.tsx` & `MapExplorerPage.tsx` with clear Region Capability Dossier / Badges (`Global/Orbital Only` vs `High-Res Digital Twin Available`), available dataset resolution & epistemic provenance tags, and honest non-Jezero limitation banner + `"Enter Jezero Digital Twin"` context-preserving transition.
   - Ensure `GlobalMarsMap.tsx` and `GlobalMarsGlobe3D.tsx` update `MissionContext` cleanly without forcing non-Jezero clicks onto Jezero.
3. **M0.4.2-C (Jezero Digital Twin + Science Targets + Observations + EVA Handoff):**
   - Upgrade `DigitalTwinPage.tsx` (and `MarsMap2D.tsx` if needed for layer/marker highlights):
     - Active-region capability banner/guard when `mission.geographic.regionId !== 'reg-jezero'`.
     - Synchronized Exploration Layer quick-status / layer provenance summary (`elevation`, `slope_overlay`, `terrain_classes`, `overall_hazard`, `data_confidence`, `detection_confidence`, `spatial_uncertainty`, `resolution_uncertainty`, `source_coverage`, `science_opportunity`, `unified_costmap`).
     - Science Target Inspector & Queue Panel (list + map selection + rationale/caveats + Queue/Remove).
     - Complete Terrain / Hazard / Cost / Science / Uncertainty Inspector handling `OUT_OF_BOUNDS` and `NoData` fail-closed.
     - Explicit Handoff & Field Notebook Actions: `Set Base Camp`, `Set Destination` (with inline overwrite confirmation), `Add/Queue Science Target`, `Save Observation` (lightweight note + category + epistemic tag), `Open EVA Planner`.
     - Saved Observations list (view/remove persisted across navigation/reload).
   - Update `GeologyMineralogyPage.tsx` CV section with clear `SYNTHETIC DEMONSTRATION WINDOW` badge/disclaimer matching backend `terrain.py`.
   - Update `EVARoutePlannerPage.tsx` + `App.tsx` to display carried `regionId`, `selectedTarget`, `queuedTargets`, and `savedObservations` from `MissionContext` alongside `startPoint`/`destPoint` (with 1-click "Use Queued Target as Destination" / clear context banner).
4. **M0.4.2-D (Tests, Quality Gates & Completion Report):**
   - Focused unit & workflow tests in `frontend/tests/` covering `regionCapabilities`, `MissionContext` queue/observation/handoff actions, NoData/out-of-bounds guard formatting helpers, and v1.0 draft backward compatibility.
   - Run all FE & BE verification commands + inspect browser tooling status.
   - Produce `docs/M0_4_2_EXPLORER_DIGITAL_TWIN_COMPLETION_REPORT.md`.

---

## 9. Verification & Testing Strategy

- **Unit & Integration Logic Tests (`frontend/tests/*.test.ts`):**
  - Test `regionCapabilities.ts` across all 12 registered region IDs (`reg-jezero` vs 11 non-Jezero regions).
  - Test `missionReducer` & `missionModel` for queued targets (`UPSERT_QUEUED_TARGET`, `REMOVE_QUEUED_TARGET`), lightweight observations (`UPSERT_OBSERVATION`, `REMOVE_OBSERVATION`), coordinate overwrite validation, and backward-compatible parsing of older v1.0 drafts.
  - Test Digital Twin inspection formatting / fail-closed NoData / `OUT_OF_BOUNDS` / epistemic propagation & CV synthetic-demo disclosure helpers (`digitalTwinHelpers.ts`).
- **Static & Build Gates:**
  - `cd frontend && npm run lint && npx tsc -p tsconfig.test.json --noEmit && npm test && npm run build`
  - `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check .`
  - `git diff --check`
- **Live Browser Verification:**
  - Re-check browser automation availability against local dev servers (`5173` / `8000`) and record exact verified checks or explicit environment blockers honestly.

