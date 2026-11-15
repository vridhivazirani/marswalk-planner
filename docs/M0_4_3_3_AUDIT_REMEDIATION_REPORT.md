# MARSWALK — M0.4.3.3 Audit Remediation Report

> [!CAUTION]
> **Disclaimer:** Marswalk Planner is a research and education decision-support prototype for human EVA route planning at Jezero Crater, Mars. It is **not NASA software**, is **not certified, endorsed, or validated** by NASA or any space agency, and must **never** be used for operational astronaut safety.

---

## 1. Repository Baseline & Safeguard Verification

| Property | Baseline Value | Post-Remediation Value |
|---|---|---|
| **Branch** | `main` | `main` |
| **HEAD Commit** | `dce6f6985ed150eebf9374912116befc9eb2319c` | `dce6f6985ed150eebf9374912116befc9eb2319c` |
| **Staged Changes** | `0` | `0` |
| **Unstaged Diff Stat** | `61 files changed, 6141 insertions(+), 1166 deletions(-)` | `63 files changed, 6290 insertions(+), 1194 deletions(-)` |
| **Destructive Git Commands Used** | None (`git reset`, `git clean`, `git checkout`, `git restore`, `git stash`, `git commit`, `git push` strictly avoided) | None |
| **M0.1–M0.4.3.2 Work Preserved** | Yes | Yes (100% preserved) |

---

## 2. Finding-by-Finding Remediation Matrix (`NEW-01` – `NEW-06`)

| Finding ID | Severity | Audit Title | Status | Files Modified |
|---|---|---|---|---|
| **NEW-01** | Medium | Selecting a Jezero target fabricates point coordinates for CRISM index and SIM-3464 regional unit observations | **RESOLVED** | `frontend/src/mission/scienceWorkflowHelpers.ts`, `frontend/src/pages/GeologyMineralogyPage.tsx`, `frontend/src/pages/DigitalTwinPage.tsx`, `frontend/tests/scienceGeologyDataHub.test.ts` |
| **NEW-02** | Medium | Heuristic geology-target relationships are stamped and promoted to `CURATED_SOURCE_SUPPORTED` (`INTERPRETED`) | **RESOLVED** | `frontend/src/api/science.ts`, `frontend/src/mission/scienceWorkflowHelpers.ts`, `frontend/src/pages/ScienceExplorerPage.tsx`, `frontend/src/pages/GeologyMineralogyPage.tsx`, `frontend/tests/scienceGeologyDataHub.test.ts` |
| **NEW-03** | Medium | Preserved historical Jezero targets and waypoints can be assigned as active EVA destinations in incompatible regions | **RESOLVED** | `frontend/src/mission/regionCapabilities.ts`, `frontend/src/mission/missionReducer.ts`, `frontend/src/pages/EVARoutePlannerPage.tsx`, `frontend/src/components/EVAMissionPlannerPanel.tsx`, `frontend/tests/scienceGeologyDataHub.test.ts` |
| **NEW-04** | Low | `MissionContext.selectTargetFeature` passes active browsing region instead of `'reg-jezero'` as source `regionId` | **RESOLVED** | `frontend/src/context/MissionContext.tsx`, `frontend/tests/scienceGeologyDataHub.test.ts` |
| **NEW-05** | Low | Region-switch test in `scienceGeologyDataHub.test.ts` dispatches non-canonical `'reg-olympus'` (no-op) | **RESOLVED** | `frontend/tests/scienceGeologyDataHub.test.ts` |
| **NEW-06** | Low | Scientific metadata and broken local file URI discrepancies across MOLA (`product-06` / `PLN-SRC-01`), SIM-3464 (`product-08`), TRN DTMs (`product-01` / `product-03` / `product-05`), and `PLN-DRV-04` | **RESOLVED** | `backend/app/catalog/datasets.py`, `backend/app/catalog/atlas_catalog.py`, `frontend/src/api/catalog.ts`, `docs/data_sources.md`, `backend/tests/unit/test_m0_4_3_provenance_integrity.py`, `frontend/tests/scienceGeologyDataHub.test.ts` |

---

## 3. Root-Cause Analysis & Exact Code Changes (`NEW-01` – `NEW-05`)

### 3.1 `NEW-01` — Eliminate Fabricated Point Coordinates for Regional Geology Observations

- **Root Cause:** In `frontend/src/pages/GeologyMineralogyPage.tsx`, `jezeroTargetCoord` was derived from `mission.science.selectedTarget?.coordinate ?? null` and passed into `buildGeologyObservation(...)` inside `handleLogIndexObservation` (CRISM spectral index) and `handleLogUnitObservation` (USGS SIM-3464 stratigraphic unit). Whenever a user had a Jezero science target selected, logging a CRISM summary parameter or regional stratigraphic unit stamped the point target's `lat`/`lon` onto the regional observation instead of keeping `coordinate: null`.
- **Remediation:**
  1. **`frontend/src/mission/scienceWorkflowHelpers.ts`:**
     - Added `JEZERO_CRISM_SWATH_BOUNDS: [[number, number], [number, number]] = [[18.3918, 77.3437], [18.58953, 77.46584]]` and included `coverageBounds: JEZERO_CRISM_SWATH_BOUNDS` on `crismIndexToMissionRef`.
     - Added dedicated helpers `buildCrismIndexObservation(index, activeMissionRegionId, userNote, nowIso)` and `buildGeologicUnitObservation(unit, activeMissionRegionId, userNote, nowIso)` which unconditionally set `coordinate: null`, preserve `spatialCoverage` and `coverageBounds` (`JEZERO_CRISM_SWATH_BOUNDS` for CRISM indices; `JEZERO_SIM3464_UNIT_BOUNDS` for SIM-3464 units), stamp `regionId: 'reg-jezero'`, and record `activeMissionRegionId`.
  2. **`frontend/src/pages/GeologyMineralogyPage.tsx`:**
     - Removed `jezeroTargetCoord` from `handleLogIndexObservation` and `handleLogUnitObservation` and wired both handlers to `buildCrismIndexObservation` and `buildGeologicUnitObservation`.
     - CRISM targeted scenes (`handleLogSceneObservation`) continue to use their authentic scene center coordinate `[scene.center_lat, scene.center_lon]`, and Science Explorer candidate targets continue to use their authentic point geometry.
  3. **`frontend/src/pages/DigitalTwinPage.tsx`:**
     - Updated the Saved Field Observations metadata badges (`lines 1084–1096`) so observations with `coordinate === null` display `No Point Coord`, `Extent: {spatialCoverage}`, and `Bounds: [{minLat}°, {minLon}° – {maxLat}°, {maxLon}°]` without throwing or fabricating coordinates.

### 3.2 `NEW-02` — Honest Epistemic Labelling of Target-Geology Relationships

- **Root Cause:**
  1. `inferTargetGeologyThemes(target)` in `frontend/src/mission/scienceWorkflowHelpers.ts` returned `relationshipMethod: 'CURATED_SOURCE_SUPPORTED'` (`'INTERPRETED'`) whenever `target.properties.mineral_score >= 0.75` or `geology_score >= 0.75`, even though those links were inferred via keyword/score heuristics rather than explicit curated foreign keys.
  2. `ScienceExplorerPage.tsx` (`handleInvestigateGeology`) hardcoded `relationshipMethod: 'CURATED_SOURCE_SUPPORTED'` and `relationshipEpistemicClass: 'INTERPRETED'` when constructing `MissionGeologicalFeatureRef`.
  3. `GeologyMineralogyPage.tsx` (`handleMatchTargetsAndExplore`) reused `geoFocus.relatedTargetIds` from that handoff and stamped `CURATED_SOURCE_SUPPORTED` (`INTERPRETED`) onto the selected geological unit/scene/index.
  4. `GeologyMineralogyPage.tsx` rendered `OBSERVED: CRISM Summary Metadata` in the header badge instead of `INTERPRETED: CRISM Summary Metadata`.
- **Remediation:**
  1. **`frontend/src/api/science.ts`:** Added optional explicit curated association fields (`curated_unit_symbols?: string[]`, `curated_crism_scenes?: string[]`, `curated_crism_indices?: string[]`) to `CandidateTargetFeature['properties']`.
  2. **`frontend/src/mission/scienceWorkflowHelpers.ts`:**
     - Updated `inferTargetGeologyThemes(target)` so `relationshipMethod: 'CURATED_SOURCE_SUPPORTED'` and `relationshipEpistemicClass: 'INTERPRETED'` are returned **only** when explicit source-backed curated arrays (`curated_unit_symbols`, `curated_crism_scenes`, or `curated_crism_indices`) are present on `target.properties`. All keyword/theme/score inferences return `relationshipMethod: 'KEYWORD_DISCOVERY_HINT'` and `relationshipEpistemicClass: 'HEURISTIC'`.
     - Added `buildTargetGeologyHandoffRef(target, activeMissionRegionId)` to propagate the true `relationshipMethod`, `relationshipEpistemicClass`, and explicit provenance string during Science → Geology handoff.
     - Added `resolveGeologicalTargetMatches({ targets, featureType, featureCode, keywords })` which checks explicit curated foreign keys first and falls back to `matchScienceTargetsForKeywords` with `KEYWORD_DISCOVERY_HINT` (`HEURISTIC`), never promoting a prior heuristic handoff to `CURATED_SOURCE_SUPPORTED`.
  3. **`frontend/src/pages/ScienceExplorerPage.tsx` & `frontend/src/pages/GeologyMineralogyPage.tsx`:**
     - Wired `handleInvestigateGeology` to `buildTargetGeologyHandoffRef` and `handleMatchTargetsAndExplore` to `resolveGeologicalTargetMatches`.
     - Rendered distinct UI disclosures for `KEYWORD_DISCOVERY_HINT` (`HEURISTIC`) vs `CURATED_SOURCE_SUPPORTED` (`INTERPRETED`) in both `ScienceExplorerPage.tsx` and `GeologyMineralogyPage.tsx`.
     - Updated the `GeologyMineralogyPage.tsx` header badge to `INTERPRETED: CRISM Summary Metadata`.

### 3.3 `NEW-03` — Prevent Cross-Region EVA Destination Assignment & Incompatible Simulation Execution

- **Root Cause:** While `MISSION/SET_REGION` preserved historical `science.queuedTargets`, `eva.waypoints`, `eva.baseCamp`, and `eva.destination` (per Clarification 3), `EVARoutePlannerPage.tsx` and `EVAMissionPlannerPanel.tsx` allowed preserved `reg-jezero` targets and waypoints to be clicked (`Use as Dest →`, `#1 Waypoint → Dest`) or simulated (`Simulate Human EVA`) when the active mission region was switched to an incompatible orbital-only region (such as `reg-gale`), and `missionReducer.ts` did not gate EVA coordinate/waypoint mutations against active-region routing capabilities.
- **Remediation:**
  1. **`frontend/src/mission/regionCapabilities.ts`:**
     - Added `isTargetCompatibleWithRegion(targetOrWaypoint, activeRegionId, dossier)` which verifies: (a) `caps.supportsEvaRouting` is `true` for `activeRegionId`, (b) `targetOrWaypoint.regionId` (when present and not `'all'`) matches `activeRegionId`, and (c) `targetOrWaypoint` coordinates lie within `caps.studyBounds`.
     - Added `evaluateEvaConfigCompatibility({ activeRegionId, baseCamp, destination, waypoints, dossier })` which validates the active region's `supportsEvaRouting` capability, `baseCamp` and `destination` study bounds, and every sortie waypoint's regional compatibility.
  2. **`frontend/src/mission/missionReducer.ts`:**
     - Gated `MISSION/SET_BASE_CAMP` (when non-null), `MISSION/SET_DESTINATION` (when non-null), `MISSION/SET_EVA_COORDINATES`, and `MISSION/SET_WAYPOINTS` (when non-empty) on `supportsEvaRouting` and `isTargetCompatibleWithRegion`.
     - Preserved historical `eva.baseCamp`, `eva.destination`, `eva.waypoints`, and `science.queuedTargets` intact during `MISSION/SET_REGION` so switching back to `reg-jezero` restores full usability.
  3. **`frontend/src/pages/EVARoutePlannerPage.tsx` & `frontend/src/components/EVAMissionPlannerPanel.tsx`:**
     - Gated `requestApplyDestination`, `handlePlanSingle`, and `handlePlanSuite` in `EVARoutePlannerPage.tsx` with `isTargetCompatibleWithRegion` and `evaluateEvaConfigCompatibility`.
     - Disabled per-target `Use as Dest →` and per-waypoint `→ Dest` buttons when `isTargetCompatibleWithRegion` returns `compatible: false`, displaying source region badges (`[reg-jezero]`) and explicit incompatibility labels (`Incompatible (reg-jezero only)`).
     - Gated `Simulate Human EVA` / `Simulate N-Target Sortie` in `EVAMissionPlannerPanel.tsx` with `evaluateEvaConfigCompatibility`, rendering an explicit warning banner when the active EVA configuration belongs to another region.

### 3.4 `NEW-04` — Fix `MissionContext.selectTargetFeature` Source Region Argument

- **Root Cause:** In `frontend/src/context/MissionContext.tsx` (`line 323`), `selectTargetFeature` called `featureToMissionTargetRef(feature, missionRef.current.geographic.regionId)` with only two arguments, passing the active browsing region as `regionId` instead of `'reg-jezero'` as `regionId` and `missionRef.current.geographic.regionId` as `activeMissionRegionId`.
- **Remediation:** Updated `selectTargetFeature` in `frontend/src/context/MissionContext.tsx` (`lines 321–328`) to call `featureToMissionTargetRef(feature, 'reg-jezero', missionRef.current.geographic.regionId)`, and updated `selectTargetForRouting` (`lines 361–365`) to include `regionId: 'reg-jezero'` on the `MISSION/SET_DESTINATION` payload.

### 3.5 `NEW-05` — Fix Invalid Region ID in `frontend/tests/scienceGeologyDataHub.test.ts`

- **Root Cause:** In `frontend/tests/scienceGeologyDataHub.test.ts`, the global geological feature region-switch test dispatched `MISSION/SET_REGION` with `regionId: 'reg-olympus'`, which is not in `KNOWN_REGION_IDS` (the canonical ID is `'reg-olympus-mons'`), causing `missionReducer` to return `state` unchanged as a silent no-op.
- **Remediation:** Replaced `'reg-olympus'` with canonical `'reg-olympus-mons'` (`lines 614–621`), asserted `assert.notEqual(afterOlympus, withGlobalGeo)` and `assert.equal(afterOlympus.geographic.regionId, 'reg-olympus-mons')`, and verified that global feature `sim3292-lNh` (`regionId: 'all'`) survives the canonical region transition.

---

## 4. Scientific Metadata & Broken URI Reconciliation Table (`NEW-06`)

| Sub-Item | Affected Product(s) | Previous Conflicting State | Authoritative Evidence | Reconciled State Across Code & Docs |
|---|---|---|---|---|
| **6A. MOLA Resolution** | `product-06` (`datasets.py`, `catalog.ts`), `PLN-SRC-01` (`atlas_catalog.py`), Product 5 (`docs/data_sources.md`) | Claimed `128 pixels/degree (~463 m/pixel at equator)` for local file `megt90n000cb.img` | `data/raw/mola/megt90n000cb.lbl` (`MAP_RESOLUTION = 4.0 <PIXEL/DEGREE>`, `MAP_SCALE = 14.818 <KM/PIXEL>`, `LINES = 720`, `LINE_SAMPLES = 1440`) and `backend/app/terrain/mola_global.py` (`resolution_m = 14800.0`) | Updated `product-06`, `PLN-SRC-01`, `catalog.ts`, and `docs/data_sources.md` to state `4 pixels/degree (14.818 km/pixel local grid MEGT90N000CB.IMG; PDS archive up to 128 px/deg ~463 m/pixel)` and `720 x 1440 samples` |
| **6B. SIM-3464 Scale & CTX Filename** | `product-08` (`datasets.py`, `catalog.ts`), Section 3 table (`docs/data_sources.md`) | `datasets.py` and `catalog.ts` claimed `(nominal 1:5,000 scale)`; `docs/data_sources.md:205` listed `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaE_20m.tif` | Sun & Stack (2020) USGS SIM-3464 (`https://doi.org/10.3133/sim3464`) is published at **`1:75,000` scale**; local CTX DTM in `data/raw/usgs_trn/` is `JEZ_ctx_B_soc_008_DTM_20m.tif` | Updated `product-08` in `datasets.py` and `catalog.ts` to `(published 1:75,000 scale)` and updated `docs/data_sources.md:205` to `JEZ_ctx_B_soc_008_DTM_20m.tif` |
| **6C. Stereo DTM Epistemic Class** | `product-01` vs `PLN-SRC-08` (HiRISE 1m DTM), `product-03` vs `PLN-SRC-06` (CTX 20m DTM), `product-05` vs `PLN-SRC-07` (HRSC 50m DTM) | `datasets.py` & `catalog.ts` defaulted `product-01`, `product-03`, `product-05` to `OBSERVED`, whereas `atlas_catalog.py` & `regionCapabilities.ts` classified `PLN-SRC-08`, `PLN-SRC-06`, `PLN-SRC-07` as `DERIVED` | Stereo photogrammetric DTMs are derived via ISIS3 / SOCET SET stereo correlation from orbital image pairs (`DERIVED`), while unmodified upstream USGS GeoTIFFs in `data/raw/usgs_trn/` have storage category `LOCAL_RAW`; direct orthoimages (`product-02`, `product-04`) and MOLA altimetry (`product-06`) are `OBSERVED` | Aligned `product-01`, `product-03`, and `product-05` to `epistemic_class = "DERIVED"` across `datasets.py`, `catalog.ts`, and `docs/data_sources.md` |
| **6D. `PLN-DRV-04` Local URI** | `PLN-DRV-04` (`backend/app/catalog/atlas_catalog.py`) | `doi_or_url = "file:///data/processed/jezero_western_delta_20m_aspect_deg.tif"` pointed to a non-existent file on disk | Slope aspect is computed dynamically in-engine by `TerrainIntelligenceEngine` (`processing_crs = "ESRI:103885 (Dynamic In-Engine Gradient)"`, `validation_status = ValidationStatus.CATALOGUED`) and documented in `docs/terrain_intelligence.md` | Updated `PLN-DRV-04` to `product_identifier = "marswalk_dynamic_aspect_gradient_20m"` and `doi_or_url = "file:///docs/terrain_intelligence.md"` (matching `PLN-VEC-03`, `PLN-SIM-01`, `PLN-SIM-02`); verified 100% of `file:///` URIs in `ATLAS_CATALOGUE` exist on disk |

---

## 5. Verification Command Results

| Check | Command | Result |
|---|---|---|
| **Frontend Lint (`oxlint`)** | `cd frontend && npm run lint` | **PASS** (`0 warnings and 0 errors` across 65 files) |
| **Frontend Test Typecheck** | `cd frontend && npx tsc -p tsconfig.test.json --noEmit` | **PASS** (`0 errors`) |
| **Frontend Unit & Integration Tests** | `cd frontend && npm test` | **PASS** (`45/45 tests passed`, `0 failed`) |
| **Frontend Production Build** | `cd frontend && npm run build` | **PASS** (`tsc -b && vite build` succeeded in 321ms) |
| **Backend Ruff Lint** | `cd backend && .venv/bin/ruff check .` | **PASS** (`All checks passed!`) |
| **Backend Pytest Suite** | `cd backend && .venv/bin/pytest -q` | **PASS** (`288 passed`) |
| **Git Whitespace / Conflict Check** | `git diff --check` | **PASS** (0 issues) |

---

## 6. Live API Verification Summary (`http://127.0.0.1:8000`)

| Endpoint | HTTP Status | Verified Payload Properties |
|---|---|---|
| `GET /api/v1/catalog/datasets` | `200 OK` | `product-01`, `product-03`, `product-05` `epistemicClass == "DERIVED"`; `product-02`, `product-04`, `product-06`, `product-09` `epistemicClass == "OBSERVED"`; `product-06` `resolution` includes `"4 pixels/degree (14.818 km/pixel local grid MEGT90N000CB.IMG; PDS archive up to 128 px/deg ~463 m/pixel)"`; `product-08` `resolution` includes `"published 1:75,000 scale"` |
| `GET /api/v1/atlas/catalogue?page_size=100` | `200 OK` | `PLN-SRC-01` `original_spatial_resolution` includes `"4 pixels/degree (14.818 km/pixel local grid MEGT90N000CB.IMG..."` and `processing_resolution` includes `"720 x 1440 samples"`; `PLN-DRV-04` has `validation_status == "CATALOGUED"` and `doi_or_url == "file:///docs/terrain_intelligence.md"` |
| `GET /api/v1/environmental/dust-climatology` | `200 OK` | `epistemic_class == "SIMULATED"`, `data_origin == "CLIMATE_MODELED"`, `cycle_points` length `24`, `storm_season_range_ls == [180.0, 330.0]` |
| `GET /api/v1/atlas/geology/crism-scenes` | `200 OK` | `3` scenes returned, all `epistemic_class == "INTERPRETED"` |
| `GET /api/v1/atlas/geology/crism-indices` | `200 OK` | `8` spectral summary parameters returned, all `epistemic_class == "INTERPRETED"` |
| `GET /api/v1/atlas/geology/units` | `200 OK` | `5` USGS SIM-3464 units returned, all `epistemic_class == "INTERPRETED"` |

---

## 7. Honest Browser E2E Verification Status

Live browser UI automation was not executed during this M0.4.3.3 remediation turn. Per Section 7 of the M0.4.3.3 specification, all 16 browser E2E scenarios remain explicitly marked **`NOT VERIFIED`** in a live browser session (covered at the state/reducer/helper/API level by `frontend/tests/scienceGeologyDataHub.test.ts` and `backend/tests/unit/test_m0_4_3_provenance_integrity.py`):

| # | Browser E2E Scenario | Live Browser Status | Automated Test Coverage |
|---|---|---|---|
| 1 | Science Explorer target inspection & hemisphere coordinate formatting (`18.44460°N, 77.45090°E`) | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`AUD-05`) |
| 2 | Science Explorer target selection while browsing `reg-gale` preserves `regionId: 'reg-jezero'` and `activeMissionRegionId: 'reg-gale'` | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`AUD-01`, `NEW-04`) |
| 3 | Science Explorer → Geology handoff banner distinguishes `HEURISTIC` (`KEYWORD_DISCOVERY_HINT`) vs `INTERPRETED` (`CURATED_SOURCE_SUPPORTED`) | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`NEW-02`) |
| 4 | Geology & Mineralogy CRISM index observation logging with active Jezero target keeps `coordinate: null` and `coverageBounds` | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`NEW-01`) |
| 5 | Geology & Mineralogy USGS SIM-3464 unit observation logging with active Jezero target keeps `coordinate: null` and `coverageBounds` | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`NEW-01`) |
| 6 | Geology & Mineralogy → Science Explorer return handoff does not promote heuristic match to `CURATED_SOURCE_SUPPORTED` | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`NEW-02`) |
| 7 | Geology & Mineralogy global SIM-3292 unit inspection & logging preserves `regionId: 'all'` and `coordinate: null` | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`AUD-01`) |
| 8 | NASA Data Hub core dossier storage badges (`LOCAL_RAW`, `STATIC_METADATA`, `MODEL_SIMULATED`) & epistemic tags | `NOT VERIFIED` | `backend/tests/unit/test_m0_4_3_provenance_integrity.py` (`NEW-06`) |
| 9 | NASA Data Hub Atlas registry cards display reconciled `PLN-SRC-01` (`4 px/deg`) and `PLN-DRV-04` (`CATALOGUED`) metadata | `NOT VERIFIED` | `backend/tests/unit/test_m0_4_3_provenance_integrity.py` (`NEW-06`) |
| 10 | Pinning datasets in NASA Data Hub and switching active region filters incompatible `attachedDatasets` | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`AUD-02 & AUD-04`) |
| 11 | Switching active region from `reg-jezero` to `reg-gale` clears Jezero-only `selectedGeologicalFeature` and `focusedDatasetId` | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`AUD-02 & AUD-04`, `NEW-05`) |
| 12 | Switching active region to `reg-gale` preserves historical `savedObservations`, `queuedTargets`, and `targetNotes` across reload | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`Clarifications 1, 3, 4`, `NEW-03`) |
| 13 | EVA Route Planner in `reg-gale` disables `Use as Dest →` and `→ Dest` for preserved `reg-jezero` targets/waypoints with explicit reason | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`NEW-03`) |
| 14 | EVA Mission Planner Panel in `reg-gale` blocks `Simulate Human EVA` when persisted EVA coordinates/waypoints are Jezero-only | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`NEW-03`) |
| 15 | Returning active region from `reg-gale` to `reg-jezero` restores full EVA destination assignment and simulation usability | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`NEW-03`) |
| 16 | Mars Digital Twin saved observation cards render `No Point Coord`, `Extent`, and `Bounds` for `coordinate: null` observations | `NOT VERIFIED` | `frontend/tests/scienceGeologyDataHub.test.ts` (`NEW-01`) |

---

## 8. Remaining Risks & Limitations

1. **Curated Target-Geology Foreign Keys:** `CandidateTargetFeature['properties']` supports optional `curated_unit_symbols`, `curated_crism_scenes`, and `curated_crism_indices`, and the current backend `/api/v1/science/targets` response does not populate those foreign-key arrays; therefore, all live target-geology links in the UI are honestly labelled `KEYWORD_DISCOVERY_HINT` (`HEURISTIC`) until explicit source-backed target-to-unit mappings are added to the backend target catalog.
2. **Browser E2E Automation:** All 16 browser UI scenarios remain `NOT VERIFIED` in a live headless/interactive browser session and can be verified in a dedicated browser E2E pass if requested.

---

## 9. New & Updated Automated Tests Added in M0.4.3.3

1. **`frontend/tests/scienceGeologyDataHub.test.ts` — `M0.4.3.3 NEW-01`:** Verifies that selecting a Jezero science target and logging a CRISM spectral index (`buildCrismIndexObservation`) or USGS SIM-3464 stratigraphic unit (`buildGeologicUnitObservation`) never fabricates point coordinates (`coordinate: null` preserved alongside `spatialCoverage`, `coverageBounds`, `regionId: 'reg-jezero'`, and `activeMissionRegionId` across save/reload).
2. **`frontend/tests/scienceGeologyDataHub.test.ts` — `M0.4.3.3 NEW-02`:** Verifies that keyword/score-inferred geology relationships stay `KEYWORD_DISCOVERY_HINT` (`HEURISTIC`) across Science → Geology → Science round-trip navigation and mission reload, while targets with explicit `curated_unit_symbols` produce `CURATED_SOURCE_SUPPORTED` (`INTERPRETED`).
3. **`frontend/tests/scienceGeologyDataHub.test.ts` — `M0.4.3.3 NEW-03, NEW-04 & NEW-05`:** Verifies all 7 `NEW-03` cross-region EVA destination/simulation gating requirements, `NEW-04` source region preservation (`featureToMissionTargetRef(SAMPLE_TARGET, 'reg-jezero', 'reg-gale')`), `NEW-05` canonical `'reg-olympus-mons'` region switching, and `NEW-06` frontend catalog reconciliation.
4. **`backend/tests/unit/test_m0_4_3_provenance_integrity.py` — `test_m0_4_3_3_new_06_metadata_and_local_uri_reconciliation`:** Verifies MOLA `4 pixels/degree` (`14.818 km/pixel`, `720 x 1440`) alignment on `product-06` and `PLN-SRC-01`, SIM-3464 `1:75,000` scale on `product-08`, `DERIVED` epistemic consistency across `product-01`/`product-03`/`product-05` and `PLN-SRC-08`/`PLN-SRC-06`/`PLN-SRC-07`, and verifies that every `file:///` URI in `ATLAS_CATALOGUE` resolves to an existing file on disk.

---

## 10. Final Readiness Verdict

**`READY FOR INDEPENDENT AUDIT`**

