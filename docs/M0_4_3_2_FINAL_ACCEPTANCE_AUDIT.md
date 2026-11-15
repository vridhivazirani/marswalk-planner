# MARSWALK — M0.4.3.2 INDEPENDENT FINAL ACCEPTANCE AUDIT

**Target:** M0.4.3.2 Scientific Provenance & Region Integrity Corrections  
**Date:** 2026-11-13  
**Branch:** `main`  
**Baseline HEAD:** `dce6f6985ed150eebf9374912116befc9eb2319c`  
**Audit Mode:** STRICT READ-ONLY (No source, test, data, or configuration files modified)

> **Research Prototype Disclaimer:** Marswalk Planner is a research and education decision-support prototype for Mars EVA route planning. It is not NASA software, is not certified or endorsed by NASA or any space agency, and must never claim operational astronaut safety.

---

## 1. Final Verdict

**Verdict: `REQUIRES CORRECTION` (Conditional on resolving `NEW-01`, `NEW-02`, and `NEW-03` — plus `NEW-04` through `NEW-06` polish — and completing Browser E2E Verification before closing M0.4.3.x or starting M0.4.4).**

### Executive Summary

M0.4.3.2 resolved the majority of the structural defects identified in `docs/M0_4_3_1_FINAL_ACCEPTANCE_AUDIT.md`:
- Authoritative `reg-jezero` and `'all'` source region tagging was implemented across Science Explorer and Geology & Mineralogy helpers, and the hardcoded `{ lat: 18.4446, lon: 77.4509 }` fallback coordinate was removed.
- `MissionObservationRecord.coordinate` is now nullable (`MarsCoordinate | null`), spatial extents (`spatialCoverage` and `coverageBounds`) survive validation and localStorage round-trips, and Digital Twin renders `No Point Coord` and `Extent:` metadata for areal/spectral observations.
- All 37 `ATLAS_CATALOGUE` entries now carry explicit `supports_regions` (`7` global `["all"]`, `30` Jezero `["reg-jezero"]`), and all 19 `VERIFIED_LOCAL` entries correspond to real files present on disk.
- `/api/v1/environmental/dust-climatology` now emits canonical `"epistemic_class": "SIMULATED"` with `"data_origin": "CLIMATE_MODELED"`, curated CRISM summaries emit `"INTERPRETED"`, and NASA Data Hub renders distinct per-class epistemic badges.
- `ScienceExplorerPage.tsx` now fetches candidate targets once on mount (`useEffect(..., [])`), and `formatMarsCoordinate` formats southern (`°S`) and western (`°W`) hemispheres properly.

However, independent code tracing and runtime probes uncovered **three medium-severity compliance gaps** against the mandatory M0.4.3.2 constraints and audit criteria, plus **three low-severity defects**:

1. **`NEW-01` (Medium — `AUD-01` / Mandatory Clarification 1):** In `GeologyMineralogyPage.tsx:194-235`, `handleLogIndexObservation` and `handleLogUnitObservation` set `coordinate: jezeroTargetCoord` (borrowing `activeTarget.coordinate` whenever any Jezero science target is selected in `MissionContext`). Logging an observation for a CRISM spectral index or a USGS SIM-3464 regional geologic unit while a target is selected stamps that target's point coordinate onto the areal/spectral geology observation, even when the unit or index does not intersect that target.
2. **`NEW-02` (Medium — `AUD-05` / Mandatory Clarification 4):** In `ScienceExplorerPage.tsx:126-154`, `handleInvestigateGeology` uses `inferTargetGeologyThemes(target)` (`scienceWorkflowHelpers.ts:342-385`, a substring/score heuristic) to assign `unitCode` (`Nff`, `Nld`, etc.) because `jezero_western_delta_20m_science_targets.json` contains no curated unit or CRISM foreign keys, yet labels the resulting `MissionGeologicalFeatureRef` with `relationshipMethod: 'CURATED_SOURCE_SUPPORTED'` and `relationshipEpistemicClass: 'INTERPRETED'`. Worse, `GeologyMineralogyPage.tsx:266-279` checks `geoFocus?.relationshipMethod === 'CURATED_SOURCE_SUPPORTED'` and short-circuits `"Explore Related Science Targets →"`, propagating `'CURATED_SOURCE_SUPPORTED'` (`'INTERPRETED'`) back to Science Explorer and suppressing the `Discovery Hint Only (HEURISTIC)` banner (`ScienceExplorerPage.tsx:275-292`).
3. **`NEW-03` (Medium — `AUD-04` Critical Check):** Preserved `queuedTargets` and `eva.waypoints` from `reg-jezero` can still be silently assigned as the active `mission.eva.destination` after switching the mission to an incompatible region (e.g., `reg-gale`). `MISSION/SET_REGION` (`missionReducer.ts:124-165`) does not clear or region-gate `eva.baseCamp`, `eva.destination`, or `eva.waypoints`, and `EVARoutePlannerPage.tsx:273-281, 299-309` leaves the `Use {key} as Dest →` and `#{idx + 1} {wp.name} → Dest` buttons enabled in non-Jezero regions without checking `tgt.regionId === mission.geographic.regionId` or `regionCaps.supportsEvaRouting`.
4. **`NEW-04` (Low — `AUD-01`):** `MissionContext.tsx:314-327` (`selectTargetFeature`) passes `missionRef.current.geographic.regionId` as the first argument (`regionId`) to `featureToMissionTargetRef` instead of `'reg-jezero'`.
5. **`NEW-05` (Low — `AUD-04` Test Quality):** `frontend/tests/scienceGeologyDataHub.test.ts:610-614` tests global geological feature retention across region switching by dispatching `regionId: 'reg-olympus'`, which is not in `KNOWN_REGION_IDS` (`'reg-olympus-mons'`, `routes.ts:162`), making that reducer call a no-op.
6. **`NEW-06` (Low — `AUD-02` / `AUD-03` Metadata Consistency):**
   - Local MOLA file `data/raw/mola/megt90n000cb.img` (`data/raw/mola/megt90n000cb.lbl`, `mola_global.py:3,24-25`) is the **4 pixels/degree (`14.818 km/pixel`, `1440 x 720`)** grid, whereas `datasets.py:233`, `catalog.ts:186`, `atlas_catalog.py:201` (`PLN-SRC-01`), and `docs/data_sources.md:92,96` claim `128 pixels/degree (~463 m/pixel)`.
   - `datasets.py:290` and `catalog.ts:212` state `nominal 1:5,000 scale` for USGS SIM-3464, whereas `docs/data_sources.md:129` and `scienceWorkflowHelpers.ts:244` state `1:75,000`.
   - `product-01` (HiRISE 1 m DTM) and `product-03` (CTX 20 m DTM) are labeled `OBSERVED` in `datasets.py:101,161` / `catalog.ts:119,157` but `DERIVED` in `atlas_catalog.py:553,611` / `regionCapabilities.ts:72,81`.
   - `PLN-DRV-04` (`atlas_catalog.py:854,867`, `CATALOGUED`) uses `doi_or_url="file:///data/processed/jezero_western_delta_20m_aspect_deg.tif"` for a file that is not stored in `data/processed/`.

Additionally, all **16 browser E2E scenarios** remain **`NOT VERIFIED`** on this host environment.

---

## 2. Finding-by-Finding Audit Results (`AUD-01` – `AUD-05`)

### AUD-01 — Source Geography and Coordinate Integrity

**Status:** **PARTIAL (`NEW-01`, `NEW-04` require correction)**

#### Verified Implementation Evidence
- **Authoritative Source Region Tagging:**
  - `frontend/src/mission/scienceWorkflowHelpers.ts:35-36` defines `JEZERO_SOURCE_REGION_ID = 'reg-jezero'` and `GLOBAL_SCOPE_REGION_ID = 'all'`.
  - `buildScienceTargetObservation` (`scienceWorkflowHelpers.ts:204-241`), `geologyUnitToMissionRef` (`387-420`), `crismSceneToMissionRef` (`443-480`), and `crismIndexToMissionRef` (`482-514`) always set `regionId: 'reg-jezero'` and record a non-Jezero browsing context separately in `activeMissionRegionId`.
  - `globalGeologyUnitToMissionRef` (`scienceWorkflowHelpers.ts:422-441`) and `handleLogGlobalUnitObservation` (`GeologyMineralogyPage.tsx:237-253`) always set `regionId: 'all'`, `coordinate: null`, `spatialCoverage: GLOBAL_SIM3292_EXTENT_LABEL`, and `coverageBounds: [[-90, -180], [90, 180]]`.
  - `ScienceExplorerPage.tsx:105, 129, 168-172` passes `JEZERO_SOURCE_REGION_ID` to `featureToMissionTargetRef` and `featureToSortieWaypoint`.
- **Nullable Coordinates & Spatial Extent Preservation:**
  - `frontend/src/types/mission.ts:37-65, 99-125` defines `coordinate: MarsCoordinate | null`, `spatialCoverage?: string | null`, `coverageBounds?: [[number, number], [number, number]] | null`, and `activeMissionRegionId?: string | null` on `MissionGeologicalFeatureRef` and `MissionObservationRecord`.
  - `frontend/src/mission/missionModel.ts:300-389, 486-542` validates `coordinate === null` on observations and geological feature refs, validates `coverageBounds` via `validateCoverageBounds` (`[-90, 90]`, `[-180, 180]`, `minLat <= maxLat`), and preserves `spatialCoverage` and `activeMissionRegionId` across serialization and `loadMissionDraftResult`.
  - `frontend/src/pages/DigitalTwinPage.tsx:1043-1091` checks `obs.coordinate ? (...) : (...)`, renders a `No Point Coord` badge when `obs.coordinate === null`, and displays `Extent: ${obs.spatialCoverage}`.

#### Remaining Defects Under AUD-01
- **`NEW-01` (Medium):** `GeologyMineralogyPage.tsx:194-235` (`handleLogIndexObservation` and `handleLogUnitObservation`) sets:
  ```ts
  const jezeroTargetCoord =
    activeTarget && activeTarget.regionId === JEZERO_SOURCE_REGION_ID
      ? activeTarget.coordinate
      : null
  ```
  and passes `coordinate: jezeroTargetCoord` to `buildGeologyObservation`. Whenever the user has previously selected any Jezero science target (e.g., `SCI-01-KODIAK`), logging an observation for any CRISM spectral index (`D2300`, `LCPINDEX`, etc.) or any USGS SIM-3464 stratigraphic unit (`Ncf`, `Nhb`, `Nld`, etc.) assigns `activeTarget.coordinate` as the point coordinate of that unit/index observation. This manufactures a point coordinate for an areal/spectral feature without verified spatial containment.
- **`NEW-04` (Low):** `MissionContext.tsx:314-327` (`selectTargetFeature`) calls `featureToMissionTargetRef(feature, missionRef.current.geographic.regionId)` without passing `'reg-jezero'` as the first parameter (`regionId`).

---

### AUD-02 — Storage Classification and Dataset Provenance

**Status:** **PARTIAL (`NEW-06` metadata discrepancies noted; core storage classifier and file verification PASS)**

#### Verified Implementation Evidence
- **37-Entry Atlas Inspection & Classifier Execution:**
  - Executed `mapAtlasEntryToStorageCategory` (`frontend/src/mission/scienceWorkflowHelpers.ts:89-138`) against all 37 live entries from `GET /api/v1/atlas/catalogue?page_size=100` and cross-checked every `VERIFIED_LOCAL` record against the filesystem (`data/raw/` and `data/processed/`):
    - **`LOCAL_RAW` (5 entries):**
      - `PLN-SRC-01` (`megt90n000cb.img`) -> `data/raw/mola/megt90n000cb.img` (exists, `2,073,600` bytes)
      - `PLN-SRC-05` (`JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`) -> `data/raw/usgs_trn/JEZ_ctx_B_soc_008_orthoMosaic_6m.tif` (exists, `36,269,402` bytes)
      - `PLN-SRC-06` (`JEZ_ctx_B_soc_008_DTM_20m.tif`) -> `data/raw/usgs_trn/JEZ_ctx_B_soc_008_DTM_20m.tif` (exists, `9,662,387` bytes)
      - `PLN-SRC-08` (`HiRISE_DTM_Delta_Jezero_DL_1m.tif`) -> `data/raw/usgs_trn/HiRISE_DTM_Delta_Jezero_DL_1m.tif` (exists, `114,658,582` bytes)
      - `PLN-VEC-04` (`M20_traverse.json`) -> `data/raw/perseverance/M20_traverse.json` (exists, `1,723,218` bytes; `M20_waypoints.json` also exists at `603,126` bytes)
    - **`LOCAL_DERIVED` (14 entries):** `PLN-DRV-02`, `PLN-DRV-03`, `PLN-DRV-05`..`09`, `PLN-DRV-11`..`14`, `PLN-VEC-01`, `PLN-VEC-02` — all 14 resolve to existing files in `data/processed/jezero_western_delta_*`.
    - **`REMOTE_CACHED_PROXY` (4 entries):** `PLN-DRV-01`, `PLN-SRC-02`, `PLN-SRC-03` (`VERIFIED_REMOTE_WMS`), `PLN-SRC-04` (`VERIFIED_REMOTE_WMTS`).
    - **`MODEL_SIMULATED` (2 entries):** `PLN-SIM-01`, `PLN-SIM-02` (`product_type: "SIM"`).
    - **`STATIC_METADATA` (12 entries):** `PLN-INT-01`..`05`, `PLN-SRC-07`, `PLN-SRC-09`..`11`, `PLN-DRV-04`, `PLN-DRV-10`, `PLN-VEC-03`, `PLN-VEC-05` (`validation_status: "CATALOGUED"`).
    - **Fail-safe `'UNKNOWN'`:** Verified in `scienceWorkflowHelpers.ts:115, 137` and tested in `frontend/tests/scienceGeologyDataHub.test.ts:522-530` that a `VERIFIED_LOCAL` entry without verified raw or processed lineage (`product_type: 'VEC'`, `product_identifier: 'unrecognized_vec'`) returns `'UNKNOWN'` rather than `'LOCAL_DERIVED'`.
- **Specific Dataset Checks:**
  - **Product-02 (`backend/app/catalog/datasets.py:113-143`, `frontend/src/api/catalog.ts:126-148`):** `is_ingested=False`, `storage_category="STATIC_METADATA"`, `data_origin="CURATED_METADATA"`, `supports_layers=()`, and `availability_status="Curated metadata dossier only; GeoTIFF not in data/raw/ and no HiRISE tile proxy or cache exists locally"`.
  - **Product-04 DOI:** Confirmed `10.5066/P9GV1ND3` in `datasets.py:177`, `catalog.ts:165`, `atlas_catalog.py:521` (`PLN-SRC-05`), and `docs/data_sources.md:75, 206, 272`.
  - **Product-10 Jezero-only coverage:** Confirmed `supports_regions=("reg-jezero",)` in `datasets.py:372` and `supportsRegions: ['reg-jezero']` in `catalog.ts:268`.
  - **Product-05 through Product-09 numbering & CRISM `FRT000047A3` vs `FRT00005850`:** Reconciled in `docs/data_sources.md:199-218` and `datasets.py:268-269` (`product-05` HRSC insertion shifts MOLA/CRISM/SIM-3464/MEDA to `product-06`..`09`; `docs/data_sources.md` Product 6 references `FRT000047A3` while `geological_units.py:268` and `datasets.py:257` reference `FRT00005850`).
  - **M20 traverse & waypoint paths:** Confirmed `data/raw/perseverance/M20_traverse.json` and `data/raw/perseverance/M20_waypoints.json` in `docs/data_sources.md:155, 211, 216`; non-existent `data/processed/mars2020_traverse/` reference removed.
  - **`PLN-DRV-02` dimensions and resolution:** Confirmed via `rasterio.open('data/processed/jezero_western_delta_20m_elevation.tif')` that `width = 362`, `height = 586` (`586` rows × `362` cols), `res = (20.0, 20.0)`, `crs = ESRI:103885`, matching `atlas_catalog.py:707` (`"20.0 m/pixel (Analysis Ready Grid: 586 x 362 cells)"`).

#### Remaining Metadata Discrepancies Under AUD-02 (`NEW-06`)
- **MOLA resolution mismatch (`128 ppd` claimed vs `4 ppd` on disk):** `data/raw/mola/megt90n000cb.lbl` (`lines 21-24`) and `backend/app/terrain/mola_global.py:3, 24-25` confirm that `data/raw/mola/megt90n000cb.img` is the **4 pixels/degree (`14.818 km/pixel`, `720` lines × `1440` samples)** MEGDR grid (`MEGT90N000CB.IMG`). However, `datasets.py:233` (`product-06`), `catalog.ts:186`, `atlas_catalog.py:201` (`PLN-SRC-01`), and `docs/data_sources.md:92, 96` all describe it as `128 pixels/degree (~463 m/pixel at equator)` (and `docs/data_sources.md:92` cites tile `megt_16n_044_128`).
- **SIM-3464 scale & CTX filename in docs:** `datasets.py:290` and `catalog.ts:212` state `nominal 1:5,000 scale` for USGS SIM-3464, whereas the published USGS SIM-3464 scale is `1:75,000` (`docs/data_sources.md:129`, `scienceWorkflowHelpers.ts:244`). In `docs/data_sources.md:205`, the table lists `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaE_20m.tif` whereas the file in `data/raw/usgs_trn/` is `JEZ_ctx_B_soc_008_DTM_20m.tif`.
- **`PLN-DRV-04` (`atlas_catalog.py:854, 867`):** Marked `CATALOGUED` (`STATIC_METADATA`), but its `doi_or_url` is `file:///data/processed/jezero_western_delta_20m_aspect_deg.tif`, which does not exist in `data/processed/`.

---

### AUD-03 — Epistemic Consistency

**Status:** **PASS (with minor `OBSERVED` vs `DERIVED` catalog note in `NEW-06`)**

#### Verified Implementation Evidence
- **Dust Climatology Endpoint (`backend/app/api/routes/environmental.py:177-186`):**
  - `GET /api/v1/environmental/dust-climatology` returns `"epistemic_class": EpistemicClass.SIMULATED.value` (`"SIMULATED"`) and `"data_origin": DataOriginCategory.CLIMATE_MODELED.value` (`"CLIMATE_MODELED"`), while preserving `"cycle_points"` and `"storm_season_range_ls"`.
- **Curated CRISM Definitions & Product-07:**
  - `CRIMSpectralIndex` (`backend/app/catalog/geological_units.py:140`) and `CRISMTargetedScene` (`geological_units.py:250`) default to `EpistemicClass.INTERPRETED.value`.
  - Live responses from `/api/v1/atlas/geology/crism-scenes` (`3` scenes), `/api/v1/atlas/geology/crism-indices` (`8` indices), and `/api/v1/atlas/geology/units` (`5` units) all emit `"epistemic_class": "INTERPRETED"`.
  - `product-07` in `backend/app/catalog/datasets.py:267` and `frontend/src/api/catalog.ts:206` emits `INTERPRETED`.
- **Frontend Badge Styling (`frontend/src/index.css:617-657`, `frontend/src/pages/NASADataHubPage.tsx:363, 624, 746`):**
  - Distinct CSS rules exist for `.badge-observed` (emerald `#6ee7b7`), `.badge-derived` (sky `#7dd3fc`), `.badge-heuristic` (purple `#d8b4fe`), `.badge-interpreted` (amber `#fde047`), `.badge-predicted` (orange `#fdba74`), `.badge-simulated` (blue `#93c5fd`), and `.badge-unknown` (critical red).
  - `NASADataHubPage.tsx` normalizes every dataset/Atlas epistemic tag via `normalizeDatasetEpistemicTag` and renders `badge-${epTag.toLowerCase()}` in the Core Dossier detail header (`line 363`), Atlas detail header (`line 624`), and Pinned Mission Datasets strip (`line 746`).
- **Minor Note (included in `NEW-06`):** `product-01` (HiRISE 1 m DTM) and `product-03` (CTX 20 m DTM) are labeled `OBSERVED` in `datasets.py:101, 161` and `catalog.ts:119, 157`, whereas the corresponding Atlas entries `PLN-SRC-08` and `PLN-SRC-06` are labeled `DERIVED` in `atlas_catalog.py:553, 611` and `regionCapabilities.ts:72, 81`.

---

### AUD-04 — Region Switching and History

**Status:** **REQUIRES CORRECTION (`NEW-03` critical EVA destination check and `NEW-05` vacuous test assertion)**

#### Verified Implementation Evidence
- **37 Atlas Entries `supports_regions` Verification:**
  - All 37 entries in `backend/app/catalog/atlas_catalog.py` emit explicit non-empty `supports_regions`:
    - `["all"]` on the 7 global entries: `PLN-SRC-01` (MOLA MEGDR), `PLN-DRV-01` (MOLA Shaded Relief WMS), `PLN-SRC-02` (THEMIS Day IR WMS), `PLN-SRC-03` (THEMIS Night IR WMS), `PLN-SRC-04` (Viking MDIM 2.1 WMTS), `PLN-INT-01` (USGS SIM-3292 Global Geology), and `PLN-SRC-11` (TES Global Albedo).
    - `["reg-jezero"]` on the remaining 30 Jezero regional/local entries.
  - `atlasEntryToMissionRef` (`scienceWorkflowHelpers.ts:171-191`) fails safe to `[]` if `entry.supports_regions` is omitted, and `datasetSupportsRegion([], regionId)` returns `false`.
- **`'all'` Treated Strictly as Global-Scope Marker:**
  - `KNOWN_REGION_IDS` (`frontend/src/navigation/routes.ts:158-171`) contains only the 12 physical Mars regions (`reg-jezero` through `reg-south-polar`).
  - Verified via runtime probe that `missionReducer(state, { type: 'MISSION/SET_REGION', payload: { regionId: 'all' } })` is rejected as a no-op and `createDefaultMissionBundle({ regionId: 'all' }).geographic.regionId` falls back to `'reg-jezero'`.
- **`MISSION/SET_REGION` Science State Cleanup & History Preservation (`frontend/src/mission/missionReducer.ts:124-165`):**
  - Clears `selectedGeologicalFeature` unless `prevGeo.regionId === 'all' || prevGeo.regionId === candidate` (`lines 131-135`).
  - Filters `attachedDatasets` via `datasetSupportsRegion(d.supportsRegions, candidate)` (`lines 136-138`) and clears `focusedDatasetId` if the focused dataset is no longer attached (`lines 139-143`).
  - Clears `selectedLocation`, `selectedTarget`, and `selectedHazard` when switching to a region where `supportsLocalDigitalTwin` is `false` (`lines 151, 158-159`).
  - Preserves `savedObservations`, `targetNotes`, and `queuedTargets` (with their original `regionId`, `sourceDataset`, `provenance`, `spatialCoverage`, and `coverageBounds`) across region switches and `saveMissionDraft`/`loadMissionDraftResult` round-trips (`frontend/tests/scienceGeologyDataHub.test.ts:703-744`).

#### Remaining Defects Under AUD-04
- **`NEW-03` (Medium — Critical Check Failure on Queued Targets / EVA Destination in Non-Jezero Regions):**
  1. In `missionReducer.ts:124-165`, `MISSION/SET_REGION` does **not** clear or region-gate `state.eva.baseCamp`, `state.eva.destination`, or `state.eva.waypoints` when switching from `reg-jezero` to an incompatible region such as `reg-gale`.
  2. In `EVARoutePlannerPage.tsx:245-285` ("Queued Science Targets (click to inspect/assign Destination)") and `lines 295-312` ("Active Sortie Waypoints"), although the top-level `Plan Route` and `Plan Comparative Suite` buttons are disabled when `!regionCaps.supportsEvaRouting` (`lines 57, 72, 105, 118`), the per-target **`Use {key} as Dest →`** button (`lines 273-281`) and per-waypoint **`#{idx + 1} {wp.name} → Dest`** button (`lines 299-309`) remain **enabled** in non-Jezero regions and do not check `tgt.regionId === mission.geographic.regionId` or `regionCaps.supportsEvaRouting`.
  3. Clicking `Use SCI-01-KODIAK as Dest →` while active region is `reg-gale` invokes `requestApplyDestination` (`line 46`) -> `onUpdateCoordinates` -> `MISSION/SET_EVA_COORDINATES` (`missionReducer.ts:293-312`), which silently sets the Jezero target's coordinates (`18.4315°N, 77.3812°E`) as the active `mission.eva.destination` in `reg-gale`. In addition, the queued target row (`lines 263-272`) does not display `tgt.regionId`.
- **`NEW-05` (Low — Vacuous Test Assertion):**
  - In `frontend/tests/scienceGeologyDataHub.test.ts:610-614`:
    ```ts
    withGlobalGeo = missionReducer(withGlobalGeo, {
      type: 'MISSION/SET_REGION',
      payload: { regionId: 'reg-olympus' },
    })
    assert.equal(withGlobalGeo.science.selectedGeologicalFeature?.featureId, 'sim3292-lNh')
    ```
    Because `'reg-olympus'` is not a valid region ID (`'reg-olympus-mons'` is the canonical ID in `routes.ts:162`), `missionReducer` returns `withGlobalGeo` unchanged at line 126. While independent probing with `'reg-olympus-mons'` confirmed that `missionReducer` does keep `sim3292-lNh`, the test in `scienceGeologyDataHub.test.ts:610-614` is a no-op.

---

### AUD-05 — Coordinate Formatting, Fetch Lifecycle, and Relationships

**Status:** **REQUIRES CORRECTION (`NEW-02` heuristic relationship mislabeled as `CURATED_SOURCE_SUPPORTED` / `INTERPRETED`)**

#### Verified Implementation Evidence
- **Hemisphere Coordinate Formatting & Longitude Normalization (`frontend/src/mission/digitalTwinHelpers.ts:40-42, 76-82`):**
  - `formatMarsCoordinate({ lat: -4.5, lon: 137.4 })` returns `'4.50000°S, 137.40000°E'`.
  - `formatMarsCoordinate({ lat: 18.4446, lon: -76.5 })` returns `'18.44460°N, 76.50000°W'`.
  - Near-zero negative floats (`-1e-9`) clamp cleanly to `'0.00000°N, 0.00000°E'`.
  - `normalizeEastLon` (`missionModel.ts:102-112`) wraps longitudes into `[-180, 180)`.
- **Science Explorer Fetch Lifecycle (`frontend/src/pages/ScienceExplorerPage.tsx:66-100`):**
  - `useEffect(..., [])` runs once on mount (`lines 66-88`).
  - `selectedTarget` is derived during render (`lines 91-100`) from `mission.science.selectedTarget?.targetId ?? mission.science.selectedGeologicalFeature?.relatedTargetIds?.[0]`, eliminating network re-fetches on target clicks.

#### Remaining Defect Under AUD-05
- **`NEW-02` (Medium — Keyword/Heuristic Relationships Labeled `CURATED_SOURCE_SUPPORTED` / `INTERPRETED`):**
  1. Inspection of `data/catalog/jezero_western_delta_20m_science_targets.json` confirms that target features contain only `['breakdown', 'composite_score', 'epistemic_class', 'life_inference_warning', 'name', 'primary_science_theme', 'rank', 'rationale', 'safety_caveat', 'target_id']` — there are no curated USGS SIM-3464 unit codes or CRISM scene IDs stored on target records.
  2. In `ScienceExplorerPage.tsx:126-154` (`handleInvestigateGeology`), clicking `"Investigate Geological Context"` calls `inferTargetGeologyThemes(target)` (`scienceWorkflowHelpers.ts:342-385`), which uses keyword substring matching (`text.includes('carbonate')`, `text.includes('delta')`, `text.includes('layer')`) and score thresholds (`props.breakdown.mineralogy >= 0.6`) to guess `recommendedUnitHints` (`Nff`, `Nld`, `Nldb`, `Ncf`) and `recommendedCrismHints` (`MIN2290`, `D2300`, `FRT00005850`, `HRL000040FF`). Yet `handleInvestigateGeology` dispatches:
     ```ts
     unitCode: hints.recommendedUnitHints[0] ?? hints.recommendedCrismHints[0] ?? null,
     ...
     relatedTargetIds: [tid],
     relationshipMethod: 'CURATED_SOURCE_SUPPORTED',
     relationshipEpistemicClass: 'INTERPRETED',
     ```
     This presents a heuristic keyword/threshold association as a `CURATED_SOURCE_SUPPORTED` (`INTERPRETED`) relationship.
  3. In `GeologyMineralogyPage.tsx:266-279` (`handleMatchTargetsAndExplore`), when the user subsequently clicks `"Explore Related Science Targets →"` / `"Inspect Related Science Targets →"` on a geological unit, CRISM scene, or CRISM index while `geoFocus?.relationshipMethod === 'CURATED_SOURCE_SUPPORTED'` remains set from step 2, the function short-circuits `matchScienceTargetsForKeywords` and stamps `method: 'CURATED_SOURCE_SUPPORTED', epistemicClass: 'INTERPRETED'` onto the geological feature reference, navigating back to Science Explorer **without** showing the `Discovery Hint Only (HEURISTIC)` banner (`ScienceExplorerPage.tsx:275-292`).

---

## 3. Verification Integrity & Observed Test Results

### Working Tree & Live Backend Process Verification
- Confirmed via `stat` and `ps`/`lsof` that the modified backend catalog and route files (`backend/app/catalog/datasets.py`, `backend/app/catalog/atlas_catalog.py`, `backend/app/catalog/geological_units.py`, `backend/app/api/routes/environmental.py`) were last written at `2026-11-13T05:28:15–05:28:16+05:30`, and the active Uvicorn worker process (`PID 19145` on `127.0.0.1:8000`) reloaded at `2026-11-13T05:37:51+05:30` (`Application startup complete` in `task-6400.log:6072-6074`).
- Therefore, all live HTTP responses inspected during M0.4.3.2 and this audit came from the current modified source code.

### Automated Verification Suite Results
| Check | Command | Result | Observed Output |
| :--- | :--- | :---: | :--- |
| **Frontend Lint** | `cd frontend && npm run lint` | **PASS** | `oxlint`: `Found 0 warnings and 0 errors. Finished in 564ms on 65 files with 116 rules` |
| **Frontend Typecheck** | `cd frontend && npx tsc -p tsconfig.test.json --noEmit` | **PASS** | Exit code `0` (`0` errors) |
| **Frontend Unit Tests** | `cd frontend && npm test` | **PASS*** | `42` passed, `0` failed, `0` skipped (`670.19ms`) (*Note: includes vacuous `'reg-olympus'` assertion `NEW-05`) |
| **Frontend Production Build** | `cd frontend && npm run build` | **PASS** | `tsc -b && vite build` clean (`343ms`) |
| **Backend Lint** | `cd backend && .venv/bin/ruff check .` | **PASS** | `All checks passed!` |
| **Backend Full Pytest Suite** | `cd backend && .venv/bin/pytest -q` | **PASS** | `287 passed in 137.75s (0:02:17)` (`0` failed, `0` skipped) |
| **Git Diff Whitespace Check** | `git diff --check` | **PASS** | Exit code `0` |

---

## 4. Newly Discovered Findings Summary Table

| ID | Severity | Audit Area | Location | Summary & Reproduction Condition |
| :--- | :---: | :---: | :--- | :--- |
| **NEW-01** | **Medium** | `AUD-01` (Clarification 1) | `frontend/src/pages/GeologyMineralogyPage.tsx:194-235` | `handleLogIndexObservation` and `handleLogUnitObservation` copy `activeTarget.coordinate` (`jezeroTargetCoord`) onto logged CRISM index and USGS SIM-3464 unit observations whenever any Jezero science target is selected, fabricating a point coordinate for non-point spectral/areal entities. |
| **NEW-02** | **Medium** | `AUD-05` (Clarification 4) | `frontend/src/pages/ScienceExplorerPage.tsx:126-154`, `frontend/src/pages/GeologyMineralogyPage.tsx:266-279` | `handleInvestigateGeology` uses `inferTargetGeologyThemes` (keyword/score heuristic) to assign `unitCode` while stamping `relationshipMethod: 'CURATED_SOURCE_SUPPORTED'` (`'INTERPRETED'`). `handleMatchTargetsAndExplore` then short-circuits on `geoFocus?.relationshipMethod === 'CURATED_SOURCE_SUPPORTED'`, preserving `'CURATED_SOURCE_SUPPORTED'` and suppressing the `Discovery Hint Only (HEURISTIC)` banner. |
| **NEW-03** | **Medium** | `AUD-04` (Critical Check) | `frontend/src/mission/missionReducer.ts:124-165`, `frontend/src/pages/EVARoutePlannerPage.tsx:46-54, 245-312` | Switching from `reg-jezero` to `reg-gale` leaves `eva.destination` / `eva.waypoints` intact and leaves `Use {key} as Dest →` and `#{idx + 1} {wp.name} → Dest` enabled in `EVARoutePlannerPage.tsx`, allowing preserved `reg-jezero` queued targets to be silently assigned as `mission.eva.destination` in `reg-gale`. |
| **NEW-04** | **Low** | `AUD-01` | `frontend/src/context/MissionContext.tsx:314-327` | `selectTargetFeature` passes `missionRef.current.geographic.regionId` instead of `'reg-jezero'` (`JEZERO_SOURCE_REGION_ID`) as the authoritative source `regionId` to `featureToMissionTargetRef`. |
| **NEW-05** | **Low** | `AUD-04` (Test Integrity) | `frontend/tests/scienceGeologyDataHub.test.ts:610-614` | Dispatches `MISSION/SET_REGION` with `'reg-olympus'` instead of canonical `'reg-olympus-mons'`, causing `missionReducer` to return `state` unchanged without testing the transition. |
| **NEW-06** | **Low** | `AUD-02` / `AUD-03` | `backend/app/catalog/datasets.py:101,161,233,290`, `backend/app/catalog/atlas_catalog.py:201,553,611,854`, `docs/data_sources.md:92,96,205` | Residual metadata mismatches: local MOLA `megt90n000cb.img` is `4 ppd` (`14.818 km/px`), not `128 ppd` (`463 m/px`); SIM-3464 scale is `1:75,000`, not `1:5,000`; `product-01`/`03` are `OBSERVED` vs `PLN-SRC-08`/`06` `DERIVED`; `PLN-DRV-04` (`CATALOGUED`) has a `file:///data/processed/jezero_western_delta_20m_aspect_deg.tif` URL for an un-generated file. |

---

## 5. Browser E2E Verification Status

Browser E2E verification was **not** executed (host Chrome DevTools remote debugging unavailable: `DevToolsActivePort` `ENOENT`). Per strict audit rules, unit tests, source inspection, and HTTP checks do not substitute for live browser interaction and persistence verification. All **16 browser E2E scenarios** remain **`NOT VERIFIED`**:

| # | Scenario | Milestone Origin | Status |
| :---: | :--- | :---: | :---: |
| **1** | `CUSTOM` observation save → page reload → mission remains valid | M0.4.2.3 Carry-Forward | **NOT VERIFIED** |
| **2** | Observation without target/hazard → epistemic class `UNKNOWN` | M0.4.2.3 Carry-Forward | **NOT VERIFIED** |
| **3** | Science target queue → EVA planner → metadata preserved | M0.4.2.3 Carry-Forward | **NOT VERIFIED** |
| **4** | Existing destination → overwrite prompt → cancel and confirm paths | M0.4.2.3 Carry-Forward | **NOT VERIFIED** |
| **5** | Jezero → another region → Jezero capability and state transitions | M0.4.2.3 Carry-Forward | **NOT VERIFIED** |
| **6** | Global globe pointer movement → no repeated inspection API calls | M0.4.2.3 Carry-Forward | **NOT VERIFIED** |
| **7** | Longitude boundary interactions and persistence | M0.4.2.3 Carry-Forward | **NOT VERIFIED** |
| **8** | Explorer and Digital Twin layer behavior, including unavailable layers | M0.4.2.3 Carry-Forward | **NOT VERIFIED** |
| **9** | Cross-region Science Explorer & Geology observation logging (`reg-gale` active preserves `reg-jezero` origin) | M0.4.3.2 (`AUD-01`) | **NOT VERIFIED** |
| **10** | Nullable-coordinate observation (`CRISM_INDEX`, `STRATIGRAPHIC_UNIT`, `SIM-3292` global unit) save, reload, and `No Point Coord` badge in Digital Twin | M0.4.3.2 (`AUD-01`) | **NOT VERIFIED** |
| **11** | Data Hub epistemic badge colors (`OBSERVED`, `DERIVED`, `INTERPRETED`, `SIMULATED`) & storage provenance (`product-02` `STATIC_METADATA`, `product-10` `reg-jezero` only) | M0.4.3.2 (`AUD-02`/`03`) | **NOT VERIFIED** |
| **12** | Atlas entry regional compatibility labels (`Global Mars`, `Compatible`, `Outside Active Region`) & disabled incompatible Pin button | M0.4.3.2 (`AUD-04`) | **NOT VERIFIED** |
| **13** | Switch `reg-jezero` → `reg-gale` after selecting Jezero `SIM-3464` unit and pinning mixed datasets (`PLN-SRC-01` retained, `PLN-DRV-02` & `selectedGeologicalFeature` cleared, `targetNotes` preserved) | M0.4.3.2 (`AUD-04`) | **NOT VERIFIED** |
| **14** | Switch `reg-jezero` → `reg-gale` with `SIM-3292` global unit focused (`SIM-3292` preserved) | M0.4.3.2 (`AUD-04`) | **NOT VERIFIED** |
| **15** | Science Explorer Network tab check: selecting candidate targets triggers zero repeated `GET /api/v1/science/targets` fetches | M0.4.3.2 (`AUD-05`) | **NOT VERIFIED** |
| **16** | Geology → `"Explore Related Science Targets →"` updates `relatedTargetIds` & focuses matching target in Science Explorer with `HEURISTIC` disclosure, plus `°S`/`°W` coordinate display | M0.4.3.2 (`AUD-05`) | **NOT VERIFIED** |

---

## 6. Gate Decision: Closure of M0.4.3.2 and Authorization for M0.4.4

- **Is M0.4.3.2 safe to close?** **No.** Findings `NEW-01`, `NEW-02`, and `NEW-03` (along with `NEW-04`–`NEW-06`) must be corrected in a targeted remediation pass, and the 16 browser E2E scenarios remain `NOT VERIFIED`.
- **May M0.4.4 begin?** **No.** Do not start M0.4.4 until `NEW-01` through `NEW-06` are remediated and verified.

