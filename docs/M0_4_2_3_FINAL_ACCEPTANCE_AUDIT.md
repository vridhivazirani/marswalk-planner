# MARSWALK — M0.4.2.3 FINAL ACCEPTANCE AUDIT

**Audit Milestone:** M0.4.2.3 (Independent Final Acceptance Audit of M0.4.2.2)  
**Target Branch:** `main`  
**HEAD Commit:** `dce6f6985ed150eebf9374912116befc9eb2319c`  
**Audit Mode:** Strict audit-only inspection (no application source, test, backend contract, dataset, raster, or configuration files modified; no git commit, push, reset, clean, restore, or stash executed)  
**Final Verdict:** **CONDITIONAL PASS**

> **Prototype Disclaimer:** Marswalk Planner is a research and educational decision-support prototype for Jezero Crater, Mars. It is not NASA software, is not certified or endorsed by NASA or any space agency, and must never be represented as operational astronaut-safety software.

---

## 1. Baseline & Repository State

Inspected prior to running checks or writing this audit report:
- **Branch / HEAD:** `main` @ `dce6f6985ed150eebf9374912116befc9eb2319c`.
- **Preserved Prior Work:** Uncommitted M0.1–M0.4.2.2 changes across backend M0.3.x modules, data catalogs, documentation, and frontend `src/` / `tests/` directories were preserved intact without destructive Git operations.
- **CRS & Backend Scientific Preservation Check:** `git diff backend/app/geospatial/crs.py` is empty. `IAU_2015:49900` (`R = 3,396,190.0 m`) and `ESRI:103885` (`always_xy=True`) remain unchanged in [crs.py](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/app/geospatial/crs.py). Live checks and `test_api_raster_parity.py` / `test_authoritative_hazard_pipeline.py` confirm M0.3.4 raster/API parity remains intact.
- **Files Changed by M0.4.2.3:** Only [M0_4_2_3_FINAL_ACCEPTANCE_AUDIT.md](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/docs/M0_4_2_3_FINAL_ACCEPTANCE_AUDIT.md) (this audit report).

---

## 2. Executive Summary — Findings F01–F06

| Finding ID | Scope | Audit Status | Notes / Remaining Non-Critical Observations |
| :--- | :--- | :---: | :--- |
| **F01** | `'CUSTOM'` observation persistence & validation | **PASS** (with minor non-critical gap) | `'CUSTOM'` and all 5 categories round-trip cleanly; unsafe type cast removed; valid drafts/observations survive malformed entries; unsupported `schemaVersion` preserves storage untouched. **Minor gap:** malformed entries skipped by `validateMissionBundle()` (`L557-L564`) are dropped without surfacing a warning/count in `loadMissionDraftResult().message`, and no DOM component test exercises `<select>` rendering. |
| **F02** | Observation provenance & epistemic honesty | **PASS** | `userNote` and `derivedSummary` stay separated; `regionId`, `sourceDataset`, `provenance`, `targetId`, `hazardClassification`, and `resolutionClass` persist intact; missing target + hazard resolves strictly to `'UNKNOWN'` (never `'INTERPRETED'`); historical timestamps and epistemic tags are never rewritten or upgraded on reload. |
| **F03** | Science Explorer → `MissionContext` → EVA Route Planner workflow | **PASS** | Full metadata (`SCI-01-KODIAK`) survives queueing and handoff to `'route-planner'`; overwrite confirmation prompts consistently before replacing Destination on `ScienceExplorerPage`, `DigitalTwinPage`, and `EVARoutePlannerPage` (Cancel preserves existing point, Confirm updates it); `!regionCaps.supportsEvaRouting` disables EVA execution buttons. |
| **F04** | Region & 16-layer integrity + 3D globe hover control | **PASS** | `DEFAULT_DIGITAL_TWIN_LAYERS` matches all `16` backend `/api/v1/twin/layers` IDs with only `ortho_imagery` and `perseverance_traverse` active on startup; 12/12 region IDs align with `/api/v1/regions`; Jezero-only gating prevents Jezero overlays/routing in non-Jezero regions; misleading non-Jezero Jezero-Twin CTA removed; globe selection moved from `handlePointerMove` to `handleGlobeClick`. |
| **F05 (Browser E2E)** | Interactive live browser scenarios (`1–8`) | **NOT VERIFIED** | Chrome DevTools MCP fails with `DevToolsActivePort` `ENOENT`; macOS `safaridriver` fails with remote automation disabled; no Playwright/Puppeteer/Selenium runtime installed. |
| **F06** | Canonical `[-180, 180)` longitude normalization & fail-closed bounds | **PASS** | Exact fast-path `normalizeEastLon()` preserves `179.9999`/`-179.9999`/`-180` without IEEE-754 drift and wraps `+180 -> -180`, `180.0001 -> -179.9999`, `-180.0001 -> 179.9999`; enforced across 2D/3D maps, reducer, storage, URL parsing/building, and bootstrap. `isInsideBounds()` and `requestApplyEvaCoordinate()` fail closed (`false`) when `study_area.bounds` or `layersMeta` is absent. |

---

## 3. Finding-by-Finding Independent Verification

### 3.1 F01 — Observation Persistence (`PASS` with minor non-critical gap)

**Independent Code Trace:**
1. **UI category selection:** In [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L85), `obsCategory` uses typed `MissionObservationCategory` ([mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts#L80): `'TERRAIN' | 'HAZARD' | 'SCIENCE' | 'GEOLOGY' | 'CUSTOM'`). The `<select>` at [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L734-L756) maps over `VALID_OBS_CATEGORIES` and guards updates via `isValidObservationCategory(value)`—no unsafe `as` cast remains.
2. **Observation creation:** `handleSaveObservation()` ([DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L211-L241)) builds a `MissionObservationRecord` via `buildObservationFromInspection()` ([digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L294-L381)) and calls `actions.addObservation(obs)`.
3. **Reducer & context persistence:** `addObservation` ([MissionContext.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx#L455-L460)) dispatches `MISSION/UPSERT_OBSERVATION` ([missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts#L332-L348)), which runs `validateObservation()`. `MissionContext`'s `useEffect` ([L137-L158](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx#L137-L158)) calls `saveMissionDraft()` ([missionStorage.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionStorage.ts#L122-L162)), normalizing coordinates before writing `marswalk:mission:draft:v1`.
4. **Bootstrap, migration & validation on reload:** `initializeMissionBootstrap()` ([missionBootstrap.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionBootstrap.ts#L45-L137)) calls `loadMissionDraftResult()` → `migrateMissionBundle()` ([missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L744-L765)) → `validateMissionBundle()` ([L446-L686](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L446-L686)).
   - Supported categories: `VALID_OBS_CATEGORIES` ([L73-L79](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L73-L79)) includes all 5 categories (`TERRAIN`, `HAZARD`, `SCIENCE`, `GEOLOGY`, `CUSTOM`).
   - Individual malformed observation handling: Non-array `savedObservations` fails `invalid_science` (`L546-L556`). For arrays (`L557-L564`), each element is checked with `validateObservation(obs)`; valid observations survive when another element is malformed.
   - Backward compatibility & schema protection: Older pre-M0.4.2.2 drafts omitting optional fields (`userNote`, `derivedSummary`, `regionId`, `sourceDataset`, etc.) validate cleanly. Unsupported `schemaVersion` returns `unsupported_version` (`loadStatus: 'unsupported_version'`), setting `blockAutoPersist = true` ([missionBootstrap.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionBootstrap.ts#L101-L109)) so existing storage is not overwritten.
5. **Rendering:** Saved observations render in [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L1010-L1060) showing category, epistemic badge, derived summary, separated user note, region, and dataset.

**Test Coverage & Identified Gaps:**
- **Covered (`explorerDigitalTwinIntegration.test.ts` lines 357-432):** Verifies round-trip persistence + bootstrap reload of all 5 categories including `'CUSTOM'`, plus recovery of 5 valid observations when an entry with `'BOGUS_CATEGORY'` is injected into persisted `savedObservations`. `missionStorage.test.ts` verifies unsupported `schemaVersion` leaves storage intact.
- **Identified Gaps (Non-Critical):**
  1. **Silent pruning of malformed observations (`missionModel.ts:557-564`, `missionStorage.ts:114-120`):** `validateMissionBundle()` returns `{ ok: true, bundle }` with no `skippedObservationCount` or warning field, and `loadMissionDraftResult()` returns `{ status: 'restored', message: null }`. While valid observations are preserved, dropping a corrupted observation entry happens without a user-visible partial-recovery notice.
  2. `missionModel.test.ts` and `missionStorage.test.ts` do not separately assert partial-recovery notices, and no automated React DOM test verifies `<select>` UI interaction directly.

---

### 3.2 F02 — Observation Provenance (`PASS`)

**Trace Across Creation → Persistence → Validation → Rendering:**
- **Creation ([digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L294-L381)):**
  - `userNote` captures trimmed `params.note` (`null` when empty), kept structurally separate from `derivedSummary` (`null` when neither target nor hazard inspection telemetry exists).
  - Provenance fields populated where applicable: `regionId: params.regionId`, `sourceDataset` (`SCIENCE_TARGETS_DATASET_ID` or hazard `sourceLabel` when not OOB/NoData, `null` otherwise), `provenance`, `targetId`, `hazardClassification`, `resolutionClass`.
  - Epistemic assignment (`L328-L336`): uses `target.properties.epistemic_class` if target present, else `hazard.status === 'OUT_OF_BOUNDS' ? 'UNKNOWN' : hazard.epistemic_class` if hazard present, else `'UNKNOWN'` when both `target` and `hazard` are `null`. `'INTERPRETED'` is never used as an unbacked default.
- **Validation & Persistence ([missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L356-L403)):**
  - `validateObservation()` preserves `userNote`, `derivedSummary`, `regionId`, `sourceDataset`, `provenance`, `targetId`, `hazardClassification`, `resolutionClass`, `epistemicClass`, and original `recordedAt` verbatim without re-deriving telemetry, overwriting historical measurements, or upgrading epistemic class.
- **Rendering ([DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L1032-L1060)):**
  - Displays `obs.category`, `obs.epistemicClass`, `obs.derivedSummary ?? obs.summary`, optional `Note: {obs.userNote}`, and `Region: {obs.regionId}` / `Dataset: {obs.sourceDataset}` cleanly separated.

---

### 3.3 F03 — Science-to-EVA Workflow (`PASS`)

**Real Target Provenance Trace (`SCI-01-KODIAK`):**

| Workflow Stage | File / Symbol | Observed Values & Behavior |
| :--- | :--- | :--- |
| **1. Authoritative Backend API** | `GET /api/v1/science/targets` | `target_id: "SCI-01-KODIAK"`, `name: "Kodiak Isolated Delta Remnant Butte"`, `geometry.coordinates: [77.408313, 18.459456, -2514.4]`, `primary_science_theme: "Delta Architecture & Stratigraphy"`, `composite_score: 0.4854`, `epistemic_class: "INTERPRETED"` |
| **2. Science Explorer UI** | [ScienceExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/ScienceExplorerPage.tsx#L92-L135) | Selecting calls `actions.selectTargetFeature(tgt)`; `handleQueueWaypoint()` calls `featureToSortieWaypoint(target, mission.geographic.regionId, fieldNotes[targetId])` and `actions.queueScienceTarget(waypoint)`, writing directly to `mission.science.queuedTargets` (no disconnected local queue). |
| **3. Target / Waypoint Mapper** | [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L249-L292) | `featureToSortieWaypoint` preserves `id: "SCI-01-KODIAK"`, `regionId`, `lat: 18.459456`, `lon: 77.408313`, `coordinateRef: "IAU_2015:49900"`, `elevationM: -2514.4`, `primaryTheme: "Delta Architecture & Stratigraphy"`, `compositeScore: 0.4854`, `epistemicClass: "INTERPRETED"`, `sourceDataset: "jezero_western_delta_20m_science_targets.json"`, `provenance: "Jezero Western Delta Ranked Target Catalog (IAU_2015:49900)"`, `notes`. |
| **4. MissionContext Validation & Storage** | [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L246-L272,L318-L354), [missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts#L363-L428) | `validateScienceTargetRef()` & `validateWaypoint()` validate and preserve all 10 provenance fields without replacing missing/explicit fields with invented defaults; `MISSION/UPSERT_QUEUED_TARGET`, `MISSION/REMOVE_QUEUED_TARGET`, `MISSION/CLEAR_QUEUED_TARGETS`, and `MISSION/SET_WAYPOINTS` preserve metadata cleanly. |
| **5. Handoff Page Transition** | [MissionContext.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx#L397-L420) | `sendWaypointsToEVAPlanner()` normalizes longitudes, preserves all waypoint metadata via `MISSION/SET_WAYPOINTS`, and navigates to `'route-planner'` (not `'simulation'`). |
| **6. Destination Overwrite Safeguard & Cancel/Confirm** | [ScienceExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/ScienceExplorerPage.tsx#L106-L119,L310-L345), [EVARoutePlannerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/EVARoutePlannerPage.tsx#L39-L47,L193-L237), [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L140-L190) | Clicking `"🧭 Route Directly"`, `"Use ... as Dest →"`, `"#N ... → Dest"`, or `"Set as Destination"` calls `checkCoordinateOverwrite('destination', existing, proposed)`. When `willOverwrite === true`, inline confirmation is displayed. **Cancel** sets pending state to `null` (preserving existing Destination); **Confirm** calls `onUpdateCoordinates` / `onSelectTargetForRouting` with the proposed normalized coordinate. |
| **7. Region Incompatibility Blocking** | [ScienceExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/ScienceExplorerPage.tsx#L276-L300,L469-L480,L513-L526), [EVARoutePlannerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/EVARoutePlannerPage.tsx#L102-L125,L165-L191) | When `!regionCaps.supportsEvaRouting`, route execution (`Plan ... Route`, `Plan Comparative Suite`, `🧭 Route Directly`, `🚀 Plan Multi-Destination Sortie`) buttons are `disabled` and honest Jezero-only notices + `"Switch Region to Jezero Crater"` recovery buttons appear. |

*Non-blocking observation:* Direct numeric `<input type="number">` fields on `EVARoutePlannerPage` allow manual coordinate entry without an overwrite confirmation modal (standard form behavior), and `ScienceExplorerPage` retains legacy `localStorage` key `marswalk_science_field_notes_v1` solely for draft textarea persistence before queueing into `MissionBundleV1`.

---

### 3.4 F04 — Region and Layer Integrity (`PASS`)

#### 16-Layer Registry Compatibility Table

Verified live against `GET /api/v1/twin/layers` (`16` layers, all HTTP `200`) and `DEFAULT_DIGITAL_TWIN_LAYERS` ([missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L37-L54)), [MarsMap2D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/MarsMap2D.tsx#L150-L275,L590-L602), and [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L260-L318):

| # | Frontend Layer ID | Backend Layer ID | Backend Endpoint Exists (Live Status) | Supported for Jezero | Default Active | Behavior When Unavailable / Error | Behavior After Switching Away From Jezero |
| :---: | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| 1 | `ortho_imagery` | `ortho_imagery` | Yes (`/api/v1/twin/raster/ortho.png`, `200`) | Yes (`OBSERVED`) | **Yes (`true`)** | `MarsMap2D` image overlay logs warning on `'error'` without fabricating data; if `!layersMeta`, Digital Twin awaits metadata | Retained in `geographic.activeLayers` as Jezero preference; **not rendered** because `DigitalTwinPage` blocks on `!isJezeroActive` before mounting maps |
| 2 | `elevation_colormap` | `elevation_colormap` | Yes (`/api/v1/twin/raster/elevation.png`, `200`) | Yes (`DERIVED`) | No (`false`) | Same as above | Same as above |
| 3 | `hillshade` | `hillshade` | Yes (`/api/v1/twin/raster/hillshade.png`, `200`) | Yes (`DERIVED`) | No (`false`) | Same as above | Same as above |
| 4 | `multidirectional_hillshade` | `multidirectional_hillshade` | Yes (`/api/v1/twin/raster/multidirectional_hillshade.png`, `200`) | Yes (`DERIVED`) | No (`false`) | Same as above | Same as above |
| 5 | `elevation_contours` | `elevation_contours` | Yes (`/api/v1/twin/vector/contours?interval=50`, `200`) | Yes (`DERIVED`) | No (`false`) | Promise `.catch()` logs error cleanly without adding vector layer | Same as above (not fetched/mounted outside Jezero) |
| 6 | `slope_overlay` | `slope_overlay` | Yes (`/api/v1/twin/raster/slope.png`, `200`) | Yes (`DERIVED`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 7 | `terrain_classes` | `terrain_classes` | Yes (`/api/v1/twin/raster/classes.png`, `200`) | Yes (`HEURISTIC`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 8 | `source_coverage` | `source_coverage` | Yes (`/api/v1/twin/raster/coverage.png`, `200`) | Yes (`DERIVED`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 9 | `data_confidence` | `data_confidence` | Yes (`/api/v1/hazards/raster/data-confidence.png`, `200`) | Yes (`HEURISTIC`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 10 | `detection_confidence` | `detection_confidence` | Yes (`/api/v1/hazards/raster/detection-confidence.png`, `200`) | Yes (`HEURISTIC`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 11 | `spatial_uncertainty` | `spatial_uncertainty` | Yes (`/api/v1/hazards/raster/spatial-uncertainty.png`, `200`) | Yes (`HEURISTIC`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 12 | `resolution_uncertainty` | `resolution_uncertainty` | Yes (`/api/v1/hazards/raster/resolution-uncertainty.png`, `200`) | Yes (`DERIVED`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 13 | `overall_hazard` | `overall_hazard` | Yes (`/api/v1/hazards/raster/overall.png`, `200`) | Yes (`HEURISTIC`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 14 | `science_opportunity` | `science_opportunity` | Yes (`/api/v1/science/raster/opportunity.png`, `200`) | Yes (`INTERPRETED`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 15 | `unified_costmap` | `unified_costmap` | Yes (`/api/v1/costmap/raster/balanced.png`, `200`) | Yes (`HEURISTIC`) | No (`false`) | Logs warning on overlay `'error'`; no fake fallback | Same as above |
| 16 | `perseverance_traverse` | `perseverance_traverse` | Yes (`/api/v1/twin/vector/perseverance`, `200`) | Yes (`OBSERVED`) | **Yes (`true`)** | Promise `.catch()` logs error cleanly without adding vector layer | Same as above (not fetched/mounted outside Jezero) |

**Additional Region & Hover Checks:**
- **12-Region Consistency:** Live `GET /api/v1/regions` returned `12` regions (`reg-jezero` `has_local_digital_twin: true`, all `11` remaining regions `has_local_digital_twin: false`), matching [regionCapabilities.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/regionCapabilities.ts) 1:1. Unknown IDs fall back to `UNKNOWN_REGION` with all local flags `false`.
- **Region Switching State Cleanup:** `MISSION/SET_REGION` ([missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts#L117-L143)) clears `geographic.selectedLocation`, `science.selectedTarget`, and `science.selectedHazard` when switching to non-twin regions, updates `geographic.terrainResolution`, and preserves `science.savedObservations` and unrelated settings; `MissionContext.setActiveRegion` ([L250-L270](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx#L250-L270)) clears runtime inspection cache and advances `inspectionSeqRef`.
- **Non-Jezero UI Honesty:** Misleading cyan `"OPEN JEZERO DIGITAL TWIN (16 LAYERS)"` CTA was verified absent from [RegionalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/RegionalMarsMap.tsx#L926-L950).
- **Globe Hover Separation:** Verified in [GlobalMarsGlobe3D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsGlobe3D.tsx#L683-L758) that `handlePointerMove` only updates cursor `pointerCoords` and never calls `onSelectCoordinates`; `onSelectCoordinates` is only called on deliberate clicks inside `handleGlobeClick`.

---

### 3.5 F06 — Coordinate Integrity (`PASS`)

| Path | File / Symbol | Verified Behavior |
| :--- | :--- | :--- |
| **Canonical Normalizer** | [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L99-L120) (`normalizeEastLon`, `normalizeCoordinate`, `isCanonicalCoordinate`) | Fast-path inside `[-180, 180)` prevents IEEE-754 rounding drift (`179.9999 -> 179.9999`); wraps `+180 -> -180`, `-180 -> -180`, `180.0001 -> -179.9999`, `-180.0001 -> 179.9999`, `-0 -> 0`. |
| **3D Globe Interaction** | [GlobalMarsGlobe3D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsGlobe3D.tsx#L683-L758) | Normalizes hover readout `pointerCoords` and click-selected `onSelectCoordinates` via `normalizeEastLon`. |
| **2D Map Interaction** | [GlobalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsMap.tsx#L194-L231), [MarsMap2D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/MarsMap2D.tsx#L113-L115) | `GlobalMarsMap` normalizes both `mousemove` and `click` via `normalizeEastLon`; `MarsMap2D` clicks route through `MissionContext.inspectCoordinates()`, which runs `normalizeMarsCoordinate()`. |
| **Mission Reducer** | [missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts#L173-L428) | Normalizes coordinates across `UPDATE_MAP_STATE`, `SET_BASE_CAMP`, `SET_DESTINATION`, `SET_EVA_COORDINATES`, `SELECT_TARGET`, `SELECT_GEOLOGICAL_FEATURE`, `SELECT_HAZARD`, `UPSERT_OBSERVATION`, `UPSERT_QUEUED_TARGET`, and `SET_WAYPOINTS`. |
| **Persistence** | [missionStorage.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionStorage.ts#L122-L140), [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L691-L738) | `saveMissionDraft()` runs `normalizeMissionBundleCoordinates()` before JSON serialization; `loadMissionDraftResult()` normalizes during `validateMissionBundle()`. |
| **URL Parse / Build & Bootstrap** | [routes.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/navigation/routes.ts#L257-L313), [missionBootstrap.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionBootstrap.ts#L53-L130) | `parseUrlCoordinate` and `buildMissionUrl` wrap `?lat=&lon=` using `normalizeUrlEastLon()` while keeping `parseMissionUrl()`'s 3-key `{ page, region, missionId }` return shape intact. `initializeMissionBootstrap()` normalizes URL and restored coordinates. |
| **Fail-Closed Bounds** | [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L59-L74), [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L152-L159) | `isInsideBounds(coord, bounds)` returns `false` if `!bounds`; `requestApplyEvaCoordinate` blocks EVA placement if `!layersMeta?.study_area?.bounds` or outside bounds. |
| **Mars CRS Unchanged** | [crs.py](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/app/geospatial/crs.py) | `git diff backend/app/geospatial/crs.py` is empty; `IAU_2015:49900` (`R = 3,396,190.0 m`) and `ESRI:103885` remain intact. |

---

## 4. Browser E2E Acceptance Verification

### Installed Browser Tooling Probe (No Dependencies Installed / No Config Changed)
- **Chrome DevTools MCP (`browser` subagent `55eaba65-c07d-45b1-9f79-5e49538c7567` at `2026-11-12T22:51:02Z`):** Failed on `mcp_chrome_devtools_list_pages` with:
  ```text
  Cause: Could not find DevToolsActivePort for chrome at /Users/vridhivazirani/Library/Application Support/Google/Chrome/DevToolsActivePort
  Cause: ENOENT: no such file or directory, open '/Users/vridhivazirani/Library/Application Support/Google/Chrome/DevToolsActivePort'
  ```
- **macOS Safari WebDriver (`/System/Cryptexes/App/usr/bin/safaridriver`):** Probed session creation on `http://127.0.0.1:44444/session`; rejected cleanly with:
  ```text
  {"value":{"error":"session not created","message":"Could not create a session: You must enable 'Allow remote automation' in the Developer section of Safari Settings to control Safari via WebDriver.","stacktrace":""}}
  ```
  (`defaults read com.apple.Safari AllowRemoteAutomation` -> not set).
- **Installed Automation Packages Check:** `playwright`, `puppeteer`, `selenium-webdriver`, `jsdom`, `happy-dom`, and `pyppeteer` are not installed in `frontend/node_modules`, npm globals, `~/.npm/_npx`, `backend/.venv`, or `/opt/anaconda3/bin/python3`; CLI binaries `playwright`, `chromium`, `google-chrome`, `chromedriver`, and `geckodriver` are not present.

### Browser Scenarios (`1–8`) Status

| # | Scenario | Status | Recorded Evidence |
| :---: | :--- | :---: | :--- |
| **1** | `CUSTOM` observation save → page reload → mission remains valid | **NOT VERIFIED** | Chrome DevTools MCP `DevToolsActivePort` `ENOENT`; `safaridriver` remote automation disabled; no Playwright/Puppeteer/Selenium installed |
| **2** | Observation without target/hazard → epistemic class `UNKNOWN` | **NOT VERIFIED** | Same environment blocker (HTTP/unit tests do not substitute for live browser verification) |
| **3** | Science target queue → EVA planner → metadata preserved | **NOT VERIFIED** | Same environment blocker |
| **4** | Existing destination → overwrite prompt → cancel and confirm paths | **NOT VERIFIED** | Same environment blocker |
| **5** | Jezero → another region → Jezero capability and state transitions | **NOT VERIFIED** | Same environment blocker |
| **6** | Global globe pointer movement → no repeated inspection API calls | **NOT VERIFIED** | Same environment blocker |
| **7** | Longitude boundary interactions and persistence | **NOT VERIFIED** | Same environment blocker |
| **8** | Explorer and Digital Twin layer behavior, including unavailable layers | **NOT VERIFIED** | Same environment blocker |

---

## 5. Fresh Regression Check Results (Executed During M0.4.2.3)

All automated checks were executed fresh in read-only mode during this audit:

| Check | Command | Outcome | Exact Observed Output |
| :--- | :--- | :---: | :--- |
| Frontend Lint | `cd frontend && npm run lint` | **PASS** | `oxlint`: `Found 0 warnings and 0 errors. Finished in 454ms on 63 files with 116 rules using 8 threads.` |
| Frontend Test Typecheck | `cd frontend && npx tsc -p tsconfig.test.json --noEmit` | **PASS** | Exit code `0` (clean) |
| Frontend Unit/Integration Tests | `cd frontend && npm test` | **PASS** | `node --test tests/*.test.ts`: `33` tests, `33` pass, `0` fail, `0` cancelled, `0` skipped (`616.03ms`) |
| Frontend Production Build | `cd frontend && npm run build` | **PASS** | `tsc -b && vite build`: `✓ built in 339ms` |
| Backend Full Suite | `cd backend && .venv/bin/pytest -q` | **PASS** | `283 passed in 139.68s (0:02:19)` (`0` failed, `0` skipped) |
| Backend M0.3.4 Parity & Hazard Suite | `cd backend && .venv/bin/pytest -v tests/integration/test_api_raster_parity.py tests/integration/test_authoritative_hazard_pipeline.py` | **PASS** | `20 passed in 92.20s (0:01:32)` (incl. `test_full_grid_212132_cell_passability_parity`, `test_api_inspect_matches_raster_across_all_categories`, `test_unknown_cell_and_missing_inputs_fail_closed`, `test_1`..`test_17`) |
| Backend Linter | `cd backend && .venv/bin/ruff check .` | **PASS** | `All checks passed!` |
| Diff Hygiene | `git diff --check` | **PASS** | Exit code `0` |

---

## 6. Remaining Risks & Recommendations

1. **Unverified Live DOM / WebGL Interaction (`NOT VERIFIED` Scenarios 1–8):** TypeScript, Vite bundling, and `node --test` suites verify state/model/API contracts, but rendered Leaflet/Three.js DOM interactions in Chrome/Safari remain unexecuted until host Chrome remote debugging (`chrome://inspect/#remote-debugging`) or Safari `Allow remote automation` is enabled.
2. **Minor Non-Critical Partial-Recovery Silence (`F01` follow-up):** `validateMissionBundle()` skips corrupt entries inside `science.savedObservations` cleanly so valid observations survive, yet does not return a non-fatal warning string for `loadMissionDraftResult()` to display in `persistence.notice`. Exposing a partial-recovery notice count in a later polish pass is recommended.
3. **Final Recommendation:** Accept M0.4.2.2 as **CONDITIONAL PASS**. Do **not** start **M0.4.3** until the project owner reviews this audit, runs a quick manual or Chrome-DevTools smoke pass over Scenarios `1–8` if desired, and explicitly authorizes **M0.4.3**.

