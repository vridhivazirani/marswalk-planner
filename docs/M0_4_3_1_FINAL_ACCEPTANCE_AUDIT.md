# MARSWALK — M0.4.3.1 INDEPENDENT FINAL ACCEPTANCE AUDIT

**Target Milestone:** M0.4.3 — Science, Geology & NASA Data Hub Integration  
**Branch / HEAD:** `main` @ `dce6f6985ed150eebf9374912116befc9eb2319c` (with pre-existing uncommitted M0.1–M0.4.3 working-tree changes preserved)  
**Audit Date:** 2026-11-13  
**Mode:** STRICT AUDIT ONLY — NO SOURCE, TEST, DATA, OR CONFIG MODIFICATIONS  
**Final Verdict:** **REQUIRES CORRECTION**

---

## 1. Executive Summary

Independent code, data, API, test, and repository verification confirms that M0.4.3 established meaningful structural building blocks (`scienceWorkflowHelpers.ts`, expanded `MissionBundleV1` science state in `missionModel.ts` / `missionReducer.ts`, `product-04` DOI alignment to `10.5066/P9GV1ND3`, explicit synthetic disclosure on `/api/v1/terrain/cv/candidates`, and non-destructive storage guards), and **all automated unit/integration/lint/build gates passed** (286 backend pytest tests, 38 frontend unit tests, `ruff`, `oxlint`, `tsc`, `vite build`, `git diff --check`).

However, independent inspection identified **2 HIGH** and **2 MEDIUM** defects (plus **4 LOW** observations) affecting cross-region provenance attribution, Atlas storage-category accuracy, epistemic classification consistency, and region-switch isolation, while live interactive browser verification (**F08**) could not execute in this environment (`NOT VERIFIED`).

Because a mission bundle can stamp non-Jezero `regionId` values (`reg-gale`) onto Jezero-only science targets and geological observations (**AUD-01**) and the NASA Data Hub classifies verified local hazard/slope ARD Atlas entries as `UNKNOWN` while advertising Jezero-only regional climatology metadata as `Covers Gale Crater` (**AUD-02**), M0.4.3 is graded **REQUIRES CORRECTION**.

---

## 2. Repository State & Integrity Baseline (F09)

- **Branch & Commit:** `main` at `dce6f6985ed150eebf9374912116befc9eb2319c`.
- **Modifications Preserved:** Uncommitted M0.1–M0.4.3 changes across 53 tracked files plus untracked M0.3/M0.4 files were left untouched. Only `docs/M0_4_3_1_FINAL_ACCEPTANCE_AUDIT.md` was created during this audit.
- **Note on Existing M0.4.3 Doc:** `docs/M0_4_3_SCIENCE_GEOLOGY_DATA_HUB_COMPLETION_REPORT.md` (271 lines) currently contains the M0.4.3.1 audit specification text rather than a completion summary; no reliance was placed on completion claims.
- **M0.3 Raster / Hazard / CRS Preservation:** `jezero_western_delta_20m_elevation.tif` (`ESRI:103885`, `[586, 362]`), `jezero_western_delta_20m_science_targets.json` (`IAU_2015:49900`), `backend/app/geospatial/crs.py`, and M0.3 catalog/manifest files remain intact. `git diff --check` exited `0`.

### Fresh Verification Suite Runs (Executed During Audit)

| Check | Command | Outcome | Observed Result |
|---|---|---|---|
| Backend Lint | `cd backend && .venv/bin/ruff check .` | PASS | `All checks passed!` |
| Backend Tests | `cd backend && .venv/bin/pytest -q` | PASS | `286 passed in 152.80s (0:02:32)` |
| Frontend Lint | `cd frontend && npm run lint` | PASS | `oxlint`: `Found 0 warnings and 0 errors` (`65 files`, `116 rules`) |
| Frontend Test Typecheck | `cd frontend && npx tsc -p tsconfig.test.json --noEmit` | PASS | Exit code `0` |
| Frontend Unit Tests | `cd frontend && npm test` | PASS | `tests 38`, `pass 38`, `fail 0`, `skipped 0` (`717.2ms`) |
| Frontend Production Build | `cd frontend && npm run build` | PASS (with chunk warning) | `tsc -b && vite build` built in `327ms`; Vite warned on `index-*.js` (`1,144.32 kB` > 500 kB) |
| Diff Hygiene | `git diff --check` | PASS | Exit code `0` |

---

## 3. Section-by-Section Audit Findings (F01 – F09)

### Summary Table of Findings

| ID | Severity | Area | Summary | Status |
|---|---|---|---|---|
| **AUD-01** | **HIGH** | F05 / F06 | Science Explorer & Geology pages stamp non-Jezero active `regionId` (e.g., `reg-gale`) onto Jezero-only targets, CRISM scenes, SIM-3464 units, observations, and sortie waypoints | Verified |
| **AUD-02** | **HIGH** | F02 / F03 / F05 | `mapAtlasEntryToStorageCategory()` misclassifies locally verified hazard/slope ARD Atlas layers & WMS streams as `UNKNOWN`; `product-10` combines Jezero-only title/coverage with `supports_regions=("all",)`; `product-02` claims `REMOTE_CACHED_PROXY` with zero cached HiRISE tiles; catalog product numbering/CRISM ID drifted from `docs/data_sources.md` | Verified |
| **AUD-03** | **MEDIUM** | F03 | `/api/v1/environmental/dust-climatology` emits non-canonical `"CLIMATE_MODELED"` epistemic class; CRISM metadata/index summaries marked `"OBSERVED"`; `NASADataHubPage` hardcodes `badge-observed` styling across all epistemic classes and `product_type` values | Verified |
| **AUD-04** | **MEDIUM** | F05 / F08 | `MISSION/SET_REGION` leaves Jezero `selectedGeologicalFeature` and `focusedDatasetId` populated on non-Jezero switches; NASA Data Hub Atlas tab lacks regional compatibility badges & defaults non-`"global"` Atlas records to `['reg-jezero']`; `regionCapabilities.ts` vs Atlas epistemic mismatch on `PLN-SRC-08` | Verified |
| **AUD-05** | **LOW** | F01 / F06 / F08 | Minor defects: `formatMarsCoordinate()` appends `°N`/`°E` to negative southern/western coordinates; `ScienceExplorerPage` re-fetches `/science/targets` on every target click; `GeologyMineralogyPage` return buttons do not populate target matching hints cleanly | Verified |
| **AUD-06** | **UNVERIFIED** | F08 | Live interactive browser E2E scenarios (`Chrome DevTools` / `Playwright`) could not run because no active Chrome remote debugging session or headless browser binary exists in this environment | Blocked / Not Verified |

---

### Detailed Audit Results

#### F01 — Coordinate Reference System Integrity
- **Status:** Core geospatial math **PASS** (1 `LOW` display defect in **AUD-05a**).
- **Evidence:**
  - `data/catalog/jezero_western_delta_20m_science_targets.json:1-65` declares GeoJSON `"crs": {"type": "name", "properties": {"name": "IAU_2015:49900"}}` with `(lon, lat, z)` coordinates (e.g., `SCI-01-KODIAK` at `[77.408313, 18.459456, -2514.4]`).
  - `backend/app/science/pipeline.py:95-100, 168` explicitly converts pixel centers from `ESRI:103885` (projected metres on `Mars_2000_(Sphere)` $R = 3\,396\,190\text{ m}$) to `IAU_2015:49900` (planetocentric geographic degrees on the identical sphere radius) before export, rather than conflating degrees with metres.
  - Direct `rasterio` + `pyproj` verification confirmed `SCI-01-KODIAK` `(77.408313, 18.459456)` transforms via `Transformer.from_crs('IAU_2015:49900', 'ESRI:103885', always_xy=True)` to `(4588354.339, 1094178.671)` strictly inside `jezero_western_delta_20m_elevation.tif` bounds `[left=4584524.35, bottom=1090168.65, right=4591764.35, top=1101888.65]`.
  - `/api/v1/twin/layers` (`backend/app/api/routes/twin.py:49-78`) transforms raster perimeters `ESRI:103885 → IAU_2015:49900`; `/api/v1/science/inspect` (`backend/app/api/routes/science.py`) transforms `IAU_2015:49900 → ESRI:103885`. Frontend maps (`MarsMap2D.tsx:75`, `RegionalMarsMap.tsx:250`, `GlobalMarsMap.tsx:172`) consistently use `L.CRS.EPSG4326` rather than Earth Web Mercator (`EPSG:3857`). Longitude normalization into `[-180, 180)` East is handled in `backend/app/geospatial/crs.py` and `frontend/src/mission/digitalTwinHelpers.ts` / `missionModel.ts`.

#### F02 — Dataset Ingestion and Provenance (`AUD-02`, HIGH)
- **Verified Disk & Manifest State:**
  - `data/manifests/download_manifest.jsonl` records 5 downloaded entries (`10.5066/P9REJ9JN` HiRISE DTM 1m, `10.5066/P906QQT8` CTX DTM 20m, `10.5066/P9GV1ND3` CTX Ortho 6m, plus Perseverance `M20_waypoints.json` and `M20_traverse.json`), all physically present under `data/raw/usgs_trn/` and `data/raw/perseverance/`. `data/raw/mola/megt90n000cb.{img,lbl}` is also physically present on disk.
  - `data/cache/tiles/` (`941` files) contains `606` `mola_*`, `291` `viking_mdim21_*`, and `44` `wms_mola_shaded_relief_*` cached JPEG tiles — **0 HiRISE tiles**.
  - **Confirmed DOI fix:** `product-04` (`USGS Mars 2020 TRN CTX Controlled Orthoimage Mosaic`) now accurately uses DOI `10.5066/P9GV1ND3` in `backend/app/catalog/datasets.py:167` and `frontend/src/api/catalog.ts:120`, matching `docs/data_sources.md:75, 206` and `data/manifests/download_manifest.jsonl`.
- **Audit Matrix of All 10 Core Catalog Products (`backend/app/catalog/datasets.py:73-363` & `GET /api/v1/catalog/datasets`):**

| ID | Identifier (`doi_or_urn`) | `storage_category` | `data_origin` | `epistemic_class` | `is_ingested` | `supports_regions` | Physical Disk Check | Audit Note |
|---|---|---|---|---|---|---|---|---|
| `product-01` | `10.5066/P9REJ9JN` | `LOCAL_RAW` | `LOCAL_GEOTIFF_RAW` | `OBSERVED` | `True` | `("reg-jezero",)` | `data/raw/usgs_trn/HiRISE_DTM_Delta_Jezero_DL_1m.tif` present | Consistent |
| `product-02` | `10.5066/P9QJDP48` | `REMOTE_CACHED_PROXY` | `REMOTE_WMTS_OR_METADATA` | `OBSERVED` | `False` | `("reg-jezero",)` | **No local raw file; 0 HiRISE tiles in `data/cache/tiles/`** | **Defect (AUD-02):** `availability_status` & `storage_category` claim remote Mars Trek/USGS tile proxy (`atlas_basemap`), yet `atlas.py:58-181` defines no HiRISE tile proxy |
| `product-03` | `10.5066/P906QQT8` | `LOCAL_RAW` | `LOCAL_GEOTIFF_RAW` | `OBSERVED` | `True` | `("reg-jezero",)` | `data/raw/usgs_trn/JEZ_ctx_B_soc_008_DTM_20m.tif` present | Consistent |
| `product-04` | `10.5066/P9GV1ND3` | `LOCAL_RAW` | `LOCAL_GEOTIFF_RAW` | `OBSERVED` | `True` | `("reg-jezero",)` | `data/raw/usgs_trn/JEZ_ctx_B_soc_008_orthoMosaic_6m.tif` present | Fixed DOI matches `docs/data_sources.md` |
| `product-05` | `ESA-PSA-HRSC-V1.0` | `STATIC_METADATA` | `CURATED_METADATA` | `OBSERVED` | `False` | `("reg-jezero",)` | Not on disk (honestly `False`) | **Drift (AUD-02):** Added in catalog without dossier in `docs/data_sources.md:201-212`; uses non-DOI string `ESA-PSA-HRSC-V1.0` |
| `product-06` | `MGS-M-MOLA-5-MEGDR-L3-V1.0` | `LOCAL_RAW` | `LOCAL_PDS3_IMG` | `OBSERVED` | `True` | `("all",)` | `data/raw/mola/megt90n000cb.img` present | Consistent (`Product 5` in `docs/data_sources.md`) |
| `product-07` | `urn:nasa:pds:crism_mtrdr:frt00005850_07_if166l_trr3` | `STATIC_METADATA` | `CURATED_METADATA` | `OBSERVED` | `False` | `("reg-jezero",)` | Not on disk (honestly `False`) | **Drift / Epistemic (AUD-02/03):** `docs/data_sources.md:119, 208` documents `FRT000047A3_MTRDR` while catalog lists `frt00005850`; curated metadata marked `OBSERVED` |
| `product-08` | `10.3133/sim3464` | `STATIC_METADATA` | `CURATED_METADATA` | `INTERPRETED` | `False` | `("reg-jezero",)` | Not on disk (honestly `False`) | Consistent (`INTERPRETED`; resolution states `1:5,000` vs `1:75,000` in `atlas.py:483` & `docs/data_sources.md:209`) |
| `product-09` | `urn:nasa:pds:mars2020_meda` | `STATIC_METADATA` | `CURATED_METADATA` | `OBSERVED` | `False` | `("reg-jezero",)` | MEDA absent; `M20_traverse/waypoints.json` present | Ingested `mars2020_places` traverse/waypoints (`docs/data_sources.md:210`) lacks its own Core Dossier entry and is only mentioned in caveats |
| `product-10` | `MCD_v6.1_LMD_CNRS_ESA` | `MODEL_SIMULATED` | `PARAMETRIC_SIMULATION` | `SIMULATED` | `False` | `("all",)` | Parametric simulation (no NetCDF4 on disk) | **Defect (AUD-02):** Title (`Jezero Regional Model`) and `coverage` (`Jezero Crater 18.44°N, 77.45°E`) contradict `supports_regions=("all",)` |

- **Additional Critical Finding in Atlas Storage Provenance (`AUD-02`):**
  - **File & Lines:** `frontend/src/mission/scienceWorkflowHelpers.ts:83-102` (`mapAtlasEntryToStorageCategory`).
  - **Evidence:** Live `GET /api/v1/atlas/catalogue?page=1&page_size=100` (37 entries) returns `processing_status` strings such as:
    - `PLN-DRV-11`, `PLN-DRV-12`, `PLN-DRV-13` (`product_type: "DRV"`): `"VERIFIED_LOCAL (20.0 m/pixel ...)"` (no `PROCESSED`/`READY`/`ARD` substring).
    - `PLN-DRV-01` (`product_type: "DRV"`): `"VERIFIED_REMOTE_WMS (128 pixels/degree WMS Pyramidal Stream)"` (no `TILE`/`WMTS`/`PROXY`).
    - `PLN-SRC-02`, `PLN-SRC-03` (`product_type: "SRC"`): `"VERIFIED_REMOTE_WMS (100 m/pixel WMS Controlled Mosaic)"`.
  - **Actual Behavior:** `mapAtlasEntryToStorageCategory()` checks `status.includes('PROCESSED') || status.includes('READY') || status.includes('ARD')` for `DRV`, and `TILE`/`WMTS`/`PROXY` for proxies — failing all of the above and returning **`UNKNOWN`** (`UNVERIFIED / UNKNOWN`). (Notice `PLN-SRC-02`/`03` only hit `UNKNOWN` because `"LOCAL"` isn't in `"VERIFIED_REMOTE_WMS"`, whereas `"VERIFIED_LOCAL"` on `PLN-DRV-11` misses `"ARD"` and falls through to `UNKNOWN`!).
  - **Expected Behavior:** `VERIFIED_LOCAL` `DRV` entries should classify as `LOCAL_DERIVED`; `VERIFIED_REMOTE_WMS` / `VERIFIED_REMOTE_WMTS` entries should classify as `REMOTE_CACHED_PROXY`.

#### F03 — Epistemic Integrity (`AUD-03`, MEDIUM)
- **`CLIMATE_MODELED → SIMULATED` Normalization:**
  - Scientifically, `CLIMATE_MODELED` (GCM numerical output / parametric harmonic thermal curves) represents simulated model predictions rather than physical measurements, so mapping `CLIMATE_MODELED → SIMULATED` in `normalizeDatasetEpistemicTag()` (`frontend/src/mission/scienceWorkflowHelpers.ts:39-44`) is scientifically sound.
  - However, `GET /api/v1/environmental/dust-climatology` (`backend/app/api/routes/environmental.py:184`) still emits non-canonical `"epistemic_class": "CLIMATE_MODELED"`, which is not a member of `EpistemicClass` (`backend/app/core/epistemic.py:10-32`). `GeologyMineralogyPage.tsx` does not normalize this field when rendering the Dust Climatology panel.
- **CRISM Curated Summaries Labelled `OBSERVED`:**
  - `backend/app/catalog/geological_units.py:140, 250` and `backend/app/catalog/datasets.py:261` classify `CRISM_INDICES`, `CRISM_TARGETED_SCENES`, and `product-07` as `OBSERVED`, even though no PDS ENVI hyperspectral pixel data is ingested (`is_ingested=False`, curated literature summaries pairing diagnostic bands with mineral names). Meanwhile `GeologyMineralogyPage.tsx:635` explicitly warns *"Lithological naming remains INTERPRETED"*. Logging a CRISM scene/index in `GeologyMineralogyPage.tsx:154, 170` therefore records `OBSERVED` on curated text summaries.
- **Misleading CSS Badge Class in NASA Data Hub (`AUD-03c`):**
  - `frontend/src/pages/NASADataHubPage.tsx:363, 562, 585, 685` hardcodes `className="badge badge-observed"` for all `epTag` pills (including `SIMULATED`, `INTERPRETED`, `DERIVED`, `UNKNOWN`) and for Atlas `product_type` badges, instead of dynamic `badge-${epTag.toLowerCase()}` styling as done in `DigitalTwinPage.tsx:1037`. Additionally, `frontend/src/index.css:617-640` defines `.badge-observed`, `.badge-derived`, `.badge-heuristic`, `.badge-interpreted`, and `.badge-unknown`, but lacks `.badge-simulated`.

#### F04 — Mission Persistence and Migration
- **Status:** **PASS** (verified by inspection + unit tests `missionModel.test.ts`, `missionStorage.test.ts`, `missionLifecycle.test.ts`, `scienceGeologyDataHub.test.ts`).
- **Evidence:**
  - `MissionBundleV1` (`frontend/src/types/mission.ts`, `frontend/src/mission/missionModel.ts`) includes optional M0.4.3 science fields (`selectedGeologicalFeature`, `attachedDatasets`, `targetNotes`, `focusedDatasetId`).
  - `validateDatasetRef()` (`missionModel.ts:338-371`) validates `datasetId`, `title`, and canonical `epistemicClass` (`isValidEpistemicTag`), safely defaulting invalid `storageCategory` to `'UNKNOWN'`.
  - `validateMissionBundle()` (`missionModel.ts:622-676`) safely defaults missing M0.4.3 fields on legacy v1.0 drafts and filters invalid `savedObservations` / `attachedDatasets` entries individually without dropping valid draft state.
  - `missionReducer.ts:369-451` handles `ATTACH_DATASET`, `DETACH_DATASET`, `SET_TARGET_NOTE` (synchronizing `targetNotes`, active `selectedTarget.notes`, and matching `queuedTargets[].notes`), and `SET_FOCUSED_DATASET`.
  - `missionStorage.ts:6, 1-173` enforces `MAX_DRAFT_BYTES = 256 * 1024` (`262,144` bytes) and reports `malformed_json`, `unsupported_version`, `invalid_schema`, `id_mismatch`, and `storage_error` cleanly while `missionBootstrap.ts:113-121` sets `blockAutoPersist = true` so corrupt drafts are never silently overwritten.
  - **Storage Budget Headroom Check:** Live query of all **10 Core + 37 Atlas = 47** datasets serialized into `MissionBundleV1.attachedDatasets` measured **25,154 bytes (~24.6 KB)** — under **10%** of the `262,144`-byte draft ceiling.

#### F05 & F06 — Region Compatibility, Cross-Region Contamination & Science Target Workflow (`AUD-01`, HIGH; `AUD-04`, MEDIUM)
- **Confirmed Cross-Region Contamination (`AUD-01`, HIGH):**
  - **Files & Lines:**
    - `frontend/src/pages/ScienceExplorerPage.tsx:100-163` (`L104`, `L114`, `L124`, `L160`)
    - `frontend/src/pages/GeologyMineralogyPage.tsx:123-192` (`L127`, `L135`, `L143`, `L152`, `L168`, `L184`)
  - **Evidence:** Both pages warn visually when `mission.geographic.regionId !== 'reg-jezero'` that the targets (`jezero_western_delta_20m_science_targets.json` at ~18.4°N, 77.4°E), CRISM scenes (`FRT00005850` etc. at ~18.4°N, 77.4°E), and USGS SIM-3464 units belong exclusively to Jezero Crater (`reg-jezero`), and `ScienceExplorerPage.tsx:171, 610` disables `🧭 Route Directly` and `Plan Queued Sortie`. **However**, saving an observation, queuing a sortie waypoint, selecting a target, or logging a CRISM/SIM-3464 geological observation still passes `mission.geographic.regionId` (`reg-gale`, etc.) into `buildScienceTargetObservation()`, `featureToSortieWaypoint()`, `featureToMissionTargetRef()`, `buildGeologyObservation()`, `crismSceneToMissionRef()`, `crismIndexToMissionRef()`, and `geologyUnitToMissionRef()` (in contrast to `ScienceExplorerPage.tsx:133`, which hardcodes `regionId: 'reg-jezero'` only inside `selectGeologicalFeature`).
  - **Impact:** A user inspecting Gale Crater (`reg-gale`) can persist `MissionObservationRecord` and `MissionSortieWaypoint` objects labeled `regionId: "reg-gale"` containing Jezero Crater coordinates `(18.45946°N, 77.40831°E)` and Jezero CRISM/SIM-3464 datasets. Additionally, `GeologyMineralogyPage.tsx:163, 179` falls back to Jezero center coordinates `{ lat: 18.4446, lon: 77.4509 }` when logging any CRISM index or USGS stratigraphic unit observation without an active target, even while active region is non-Jezero.
- **Incomplete Region-Switch Isolation & Atlas Compatibility Gaps (`AUD-04`, MEDIUM):**
  - `missionReducer.ts:123-149` (`MISSION/SET_REGION`) clears `geographic.selectedLocation`, `science.selectedTarget`, and `science.selectedHazard` when leaving `reg-jezero`, **but retains** `science.selectedGeologicalFeature` and `science.focusedDatasetId`. Switching from Jezero to Gale leaves Jezero geological focus banners and Jezero-focused dataset state active.
  - `NASADataHubPage.tsx:529-657` (Atlas Registry view) omits regional compatibility labels (`Covers <region>` / `Outside active region`) shown in Core Dossiers (`L334-336`), and `atlasEntryToMissionRef()` (`scienceWorkflowHelpers.ts:149-150`) sets `supportsRegions: entry.spatial_coverage?.toLowerCase().includes('global') ? ['all'] : ['reg-jezero']`, making regional compatibility dependent on substring phrasing (`"global"`).
  - `regionCapabilities.ts:67-86` hardcodes `PLN-SRC-08` as `OBSERVED`, contradicting `/api/v1/atlas/catalogue` (`DERIVED`); Atlas `PLN-DRV-02` `processing_status` (`742 x 1002 cells`) still reflects stale M0.1 dimensions instead of the actual M0.3 `586 x 362` grid (`data/catalog/jezero_western_delta_20m_provenance.json`).
- **Science Target End-to-End Trace (`SCI-01-KODIAK` inside `reg-jezero`):**
  - Within `reg-jezero`, trace verification confirmed preservation across `ScienceExplorerPage → MissionContext → GeologyMineralogyPage → NASADataHubPage → EVARoutePlannerPage` for `target_id` (`SCI-01-KODIAK`), `coordinate` (`77.408313°E, 18.459456°N`), `coordinateRef` (`IAU_2015:49900`), `elevationM` (`-2514.4`), `primaryTheme`, `compositeScore`, `epistemicClass` (`INTERPRETED`), `sourceDataset` (`jezero_western_delta_20m_science_targets.json`), `provenance`, and synchronized `userNote`/`notes`.
  - Thematic geology links (`inferTargetGeologyThemes()` in `scienceWorkflowHelpers.ts:241-284` rendered in `ScienceExplorerPage.tsx:711-717`) are explicitly disclosed as *"Suggested thematic linkages (not field-verified contact boundaries)"*.

#### F07 — Synthetic and Illustrative Data Disclosures
- **Status:** **PASS** (with `product-10` region metadata caveat tracked under **AUD-02**).
- **Evidence:**
  - `GET /api/v1/terrain/cv/candidates` (`backend/app/api/routes/terrain.py:70-129` + live HTTP check) explicitly sets `epistemic_class: "HEURISTIC"`, `data_origin: "SYNTHETIC_DEMO_WINDOW"`, `is_synthetic_input: true`, `source_imagery: null`, and `disclosure: "HEURISTIC CV demonstration executed on a deterministic synthetic 100x100 reflectance and elevation patch; outputs are not detections on real HiRISE imagery."` `GeologyMineralogyPage.tsx:1033-1056` displays this banner prominently alongside `CV_SYNTHETIC_DEMO_DISCLOSURE`.
  - CRISM spectral chart (`GeologyMineralogyPage.tsx:627-636`) clearly labels the curve *"Schematic R/Rc Gaussian Dip (Reference λ Visualization Only — Not Measured I/F Cube)"* and notes that PDS ENVI cubes are not ingested.
  - Diurnal cycle chart (`GeologyMineralogyPage.tsx:905-911`, `/api/v1/environmental/diurnal-cycle`) labels itself `SIMULATED` / `"Two-harmonic planetary energy balance model"`.
  - `product-10` (`datasets.py:335-362`, `api/catalog.ts:266-289`) states `epistemicClass: "SIMULATED"`, `storageCategory: "MODEL_SIMULATED"`, and notes *"App uses parametric diurnal & climatology approximations"* (leaving only its `Jezero Regional Model` title/coverage vs `supports_regions=("all",)` conflict in **AUD-02**).

#### F08 — Frontend Behavior and Live Browser Verification (`AUD-06`, NOT VERIFIED)
- **Code Path Review (`PASS` / Minor Issues in `AUD-05`):**
  - Target selection vs mission commitment separation, overwrite confirmation (`pendingRouteOverwrite` in `ScienceExplorerPage.tsx:170-183` & `EVARoutePlannerPage.tsx:193-237`), EVA routing button gating outside Jezero (`ScienceExplorerPage.tsx:610`, `EVARoutePlannerPage.tsx:165-190`), and `MISSION/SET_TARGET_NOTE` synchronization are implemented in inspected components.
  - **Low UX Findings (`AUD-05`):**
    - `ScienceExplorerPage.tsx:66-98` puts `mission.science.selectedTarget?.targetId` in the `useEffect` dependency array (`L98`), causing redundant `fetchScienceTargets()` and `fetchScientificObjectives()` requests on every target click (**AUD-05b**).
    - `GeologyMineralogyPage.tsx:646-653, 830-835` `"Match to Candidate Science Targets →"` buttons navigate to `'science'` without setting `selectedGeologicalFeature.relatedTargetIds` for the viewed scene/unit (**AUD-05c**).
    - `formatMarsCoordinate()` (`digitalTwinHelpers.ts:76-79`) hardcodes `°N` and `°E` suffixes even for negative latitudes/longitudes (e.g., Gale Crater `-5.37000°N`) (**AUD-05d**).
- **Live Browser E2E Verification (`NOT VERIFIED`):**
  - Although local servers responded HTTP `200` on `http://127.0.0.1:8000/api/v1/health` and `http://localhost:5173/`, delegating live Chrome verification to the `browser` subagent (`ca71f236-3bbc-4e2d-b865-763c9c503b20`) failed immediately on `chrome_devtools` `list_pages` (`ENOENT: no such file or directory, open '.../Google/Chrome/DevToolsActivePort'`), and `playwright`, `chromium`, and `google-chrome` are not installed on `PATH`.
  - Per audit standards, all interactive browser scenarios (DOM interactions, `localStorage` reload persistence in Chrome, live console/network monitoring) remain **NOT VERIFIED**.

---

## 4. Prioritized Recommended Corrections

1. **[HIGH — AUD-01] Enforce true source region provenance on Jezero-only science/geology records:**
   - In `ScienceExplorerPage.tsx` (`L104`, `L114`, `L124`, `L160`) and `GeologyMineralogyPage.tsx` (`L127`, `L135`, `L143`, `L152`, `L168`, `L184`), tag Jezero-only targets, CRISM scenes/indices, and USGS SIM-3464 records with explicit `'reg-jezero'` (matching `ScienceExplorerPage.tsx:133`) rather than `mission.geographic.regionId`, or block committing Jezero-only observations/waypoints while a non-Jezero region is active (leaving only explicit region-switching CTA enabled). Also avoid silently falling back to `{ lat: 18.4446, lon: 77.4509 }` when logging unit/index records under non-Jezero context.
2. **[HIGH — AUD-02] Fix Atlas storage classification, `product-10` scope metadata, `product-02` cache status, and catalog alignment:**
   - Update `mapAtlasEntryToStorageCategory()` in `frontend/src/mission/scienceWorkflowHelpers.ts:83-102` to recognize `VERIFIED_LOCAL` `DRV` layers (`PLN-DRV-11..13` -> `'LOCAL_DERIVED'`) and `VERIFIED_REMOTE_WMS` / `VERIFIED_REMOTE_WMTS` entries (`PLN-DRV-01`, `PLN-SRC-02`, `PLN-SRC-03` -> `'REMOTE_CACHED_PROXY'`).
   - Reconcile `product-10` in `backend/app/catalog/datasets.py:335-362` & `frontend/src/api/catalog.ts:266-289`: either narrow `supports_regions` to `("reg-jezero",)` if framed as a Jezero Regional Model, or update title/coverage honestly to global MCD v6.1 parameterized by region latitude.
   - Correct `product-02` (`datasets.py:123, 127, 130`): there are 0 cached HiRISE tiles in `data/cache/tiles/` and no HiRISE basemap proxy in `atlas.py`, so categorize it accurately as `'STATIC_METADATA'` unless a verified WMTS/WMS proxy is implemented; align `product-05..09` and CRISM identifiers (`FRT000047A3` vs `frt00005850`) + `mars2020_places` traverse entry with `docs/data_sources.md`.
3. **[MEDIUM — AUD-03] Standardize epistemic enum tags and Data Hub badge styling:**
   - Emit canonical `"SIMULATED"` (or include `epistemic_class: "SIMULATED"` cleanly alongside `data_origin: "CLIMATE_MODELED"`) in `/api/v1/environmental/dust-climatology` (`backend/app/api/routes/environmental.py:184`) and review `OBSERVED` vs `INTERPRETED` for curated un-ingested CRISM lookup summaries.
   - Replace hardcoded `className="badge badge-observed"` in `frontend/src/pages/NASADataHubPage.tsx:363, 562, 585, 685` with `badge-${epTag.toLowerCase()}` and add `.badge-simulated` styling in `frontend/src/index.css`.
4. **[MEDIUM — AUD-04] Clear stale geological/dataset focus on region change & surface Atlas region compatibility:**
   - Clear `selectedGeologicalFeature` (when Jezero-scoped) and `focusedDatasetId` inside `MISSION/SET_REGION` (`missionReducer.ts:123-149`) when leaving `reg-jezero`.
   - Show regional compatibility badges on `NASADataHubPage` Atlas cards/details, and align `PLN-SRC-08` epistemic label in `regionCapabilities.ts:71` (`OBSERVED` -> `DERIVED` or vice versa) and `PLN-DRV-02` dimensions (`586 x 362`) in `atlas_catalog.py`.
5. **[LOW — AUD-05] Polish coordinate hemisphere labels, ScienceExplorer refetch dependencies, and Geology→Science hints:**
   - Update `formatMarsCoordinate()` (`digitalTwinHelpers.ts:76-79`) to use signed/N-S/E-W conventions properly (`-5.37° -> 5.37°S` or signed `°`).
   - Remove `mission.science.selectedTarget?.targetId` from the fetch `useEffect` dependency list in `ScienceExplorerPage.tsx:98`.
   - Wire `Match to Candidate Science Targets →` buttons in `GeologyMineralogyPage.tsx:646-653, 830-835` to populate unit/scene matching hints.
6. **[REQUIRED BEFORE FINAL SIGN-OFF — AUD-06] Complete Live Browser E2E Verification:**
   - Enable Chrome remote debugging (`chrome://inspect/#remote-debugging` -> `DevToolsActivePort`) or install Playwright/Chromium in a dev run and verify all F08 interactive workflows in a real browser after remediation.

---

## 5. Final Verdict Breakdown

| Criterion | Judgment |
|---|---|
| Scientific & CRS Integrity (F01, F07) | **CONDITIONAL PASS** — Core `IAU_2015:49900` / `ESRI:103885` math & synthetic CV/CRISM disclosures are solid; minor coordinate hemisphere label bug (`AUD-05`). |
| Provenance & Epistemic Accuracy (F02, F03) | **FAIL** — `AUD-02` (`UNKNOWN` Atlas ARD/WMS categories, `product-10` Jezero/global conflict, `product-02` nonexistent tile proxy claim, catalog drift) and `AUD-03` (`CLIMATE_MODELED`, uniform `badge-observed` class). |
| Persistence & Migration (F04) | **PASS** — Non-destructive validation, backward compatibility, and size bounds verified cleanly. |
| Regional Compatibility & Cross-Region Isolation (F05, F06) | **FAIL** — `AUD-01` (`reg-gale` misattribution onto Jezero targets/observations/waypoints) and `AUD-04` (stale region-switch geological/dataset focus). |
| Browser E2E Verification (F08) | **NOT VERIFIED** — No Chrome remote debugging port or Playwright binary available. |
| Automated Test & Build Gates (F09) | **PASS** — `ruff`, 286 `pytest`, `oxlint`, `tsc`, 38 `node --test`, `vite build`, `git diff --check` all passed with zero source changes made. |

**Overall Decision:** **REQUIRES CORRECTION**

