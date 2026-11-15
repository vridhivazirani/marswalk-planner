# Marswalk Planner — M0.4.2.2 Integration Corrections Report

**Milestone:** M0.4.2.2 — Explorer + Digital Twin Integration Corrections  
**Branch:** `main`  
**Baseline HEAD:** `dce6f6985ed150eebf9374912116befc9eb2319c`  
**Reference Audit:** [M0_4_2_1_EXPLORER_DIGITAL_TWIN_ACCEPTANCE_AUDIT.md](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/docs/M0_4_2_1_EXPLORER_DIGITAL_TWIN_ACCEPTANCE_AUDIT.md)  
**Verdict:** **CONDITIONAL PASS** (all targeted F01–F04 and F06 code corrections, unit/integration tests, frontend build/lint, and backend pytest/ruff checks pass; live Chrome DevTools browser E2E checks remain `NOT VERIFIED` due to host Chrome remote-debugging `DevToolsActivePort` `ENOENT`)

---

## 1. Repository Protection & Scope Boundaries

- Prior uncommitted M0.1–M0.4.2.1 work on `main` was preserved in place; no `git reset`, `git clean`, `git restore`, `git stash`, `git commit`, or `git push` commands were executed.
- No authoritative raster datasets, scientific catalogs, CRS definitions (`IAU_2015:49900`), or backend scientific/API contracts were modified during M0.4.2.2.
- M0.4.3 work was not started.

---

## 2. Finding-by-Finding Remediation Summary

| Audit ID | Severity | Defect Addressed | Files Modified | Verification |
| :--- | :--- | :--- | :--- | :--- |
| **F01** | HIGH | Reconcile `'CUSTOM'` observation category across UI, types, validator, and reducer; remove unsafe type cast; skip invalid individual observations on reload without losing valid drafts | `types/mission.ts`, `mission/missionModel.ts`, `mission/missionReducer.ts`, `pages/DigitalTwinPage.tsx` | Automated test `F01 & F02` passes |
| **F02** | MEDIUM | Separate `userNote` from `derivedSummary`, preserve provenance (`regionId`, `sourceDataset`, `provenance`, `targetId`, `hazardClassification`, `resolutionClass`), and default uninspected points (`target === null && hazard === null`) to `'UNKNOWN'` | `types/mission.ts`, `mission/missionModel.ts`, `mission/digitalTwinHelpers.ts`, `pages/DigitalTwinPage.tsx` | Automated test `F01 & F02` passes |
| **F03** | MEDIUM | Connect `ScienceExplorerPage` directly to shared `MissionContext`; change `sendWaypointsToEVAPlanner` target page from `'simulation'` to `'route-planner'`; preserve full waypoint metadata; enforce consistent destination overwrite confirmation and `!regionCaps.supportsEvaRouting` button disabling | `types/mission.ts`, `mission/missionModel.ts`, `mission/digitalTwinHelpers.ts`, `mission/missionReducer.ts`, `context/useMission.ts`, `context/MissionContext.tsx`, `pages/ScienceExplorerPage.tsx`, `pages/EVARoutePlannerPage.tsx` | Automated test `F03 & F04` passes |
| **F04** | MEDIUM | Clear incompatible Jezero `selectedLocation`, `selectedTarget`, `selectedHazard` and update `terrainResolution` when switching away from `reg-jezero`; align `DEFAULT_DIGITAL_TWIN_LAYERS` with all 16 backend layer IDs (`ortho_imagery` and `perseverance_traverse` active); remove misleading Jezero CTA from non-Jezero dossiers; move globe coordinate selection from hover (`pointermove`) to deliberate clicks | `mission/missionModel.ts`, `mission/missionReducer.ts`, `context/MissionContext.tsx`, `components/RegionalMarsMap.tsx`, `components/GlobalMarsGlobe3D.tsx` | Automated test `F03 & F04` passes |
| **F06** | LOW | Canonicalize East longitude to `[-180, 180)` across helpers, URL deep links, draft persistence, reducer, and map components; fail closed (`false`) in `isInsideBounds()` and `requestApplyEvaCoordinate` when study bounds/metadata are absent | `mission/missionModel.ts`, `mission/digitalTwinHelpers.ts`, `mission/missionReducer.ts`, `mission/missionStorage.ts`, `mission/missionBootstrap.ts`, `navigation/routes.ts`, `components/GlobalMarsMap.tsx`, `components/GlobalMarsGlobe3D.tsx`, `pages/DigitalTwinPage.tsx` | Automated tests `F06` and `navigationRouter.test.ts` pass |

---

## 3. Detailed Implementation Changes

### F01 — `'CUSTOM'` Observation Category & Partial-Draft Recovery
- Exported `MissionObservationCategory = 'TERRAIN' | 'HAZARD' | 'SCIENCE' | 'GEOLOGY' | 'CUSTOM'` in [types/mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts).
- Exported `VALID_OBS_CATEGORIES`, `isValidObservationCategory`, and `validateObservation` in [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts).
- Updated `validateMissionBundle()` so malformed elements inside `science.savedObservations` are skipped individually while preserving valid observations and an otherwise valid `MissionBundleV1` draft (non-array values still fail schema validation).
- Updated `MISSION/UPSERT_OBSERVATION` in [missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts) to validate observations via `validateObservation()`.
- Updated the observation category `<select>` in [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx) to render directly from `VALID_OBS_CATEGORIES` using the `isValidObservationCategory()` guard instead of an unsafe `as` type cast.

### F02 — Observation Provenance & Honest Epistemic Assignment
- Added additive optional structured fields on `MissionObservationRecord` (`userNote`, `derivedSummary`, `regionId`, `sourceDataset`, `provenance`, `targetId`, `hazardClassification`, `resolutionClass`) in [types/mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts), preserving backward compatibility with existing persisted `summary` strings.
- Updated `buildObservationFromInspection()` in [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts) to separate `userNote` from `derivedSummary`, populate `regionId`, `sourceDataset`, `provenance`, `targetId`, `hazardClassification`, and `resolutionClass`, and assign `epistemicClass = 'UNKNOWN'` whenever neither a target nor hazard inspection exists.
- Updated `validateObservation()` in [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts) and observation list rendering in [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx) to persist and display separated summary, note, region, and dataset fields.

### F03 — Science Explorer → Shared MissionContext → EVA Route Planner Handoff
- Extended `MissionScienceTargetRef` and `MissionSortieWaypoint` in [types/mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts) with optional provenance fields (`regionId`, `coordinateRef`, `elevationM`, `primaryTheme`, `compositeScore`, `epistemicClass`, `sourceDataset`, `provenance`, `notes`).
- Updated `featureToMissionTargetRef()` and `featureToSortieWaypoint()` in [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts), `validateScienceTargetRef()` and `validateWaypoint()` in [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts), and `clearQueuedTargets` / `sendWaypointsToEVAPlanner` in [useMission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/useMission.ts) and [MissionContext.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx).
- Fixed `sendWaypointsToEVAPlanner` in [MissionContext.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx) to navigate to `'route-planner'` (replacing `'simulation'`) while preserving full waypoint metadata.
- Refactored [ScienceExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/ScienceExplorerPage.tsx) to read and mutate `mission.science.queuedTargets` via `useMission()`, display an honest non-Jezero notice with region-switch recovery when `!regionCaps.supportsEvaRouting`, and prompt with `checkCoordinateOverwrite()` before `"🧭 Route Directly"` overwrites the active EVA destination.
- Updated [EVARoutePlannerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/EVARoutePlannerPage.tsx) to display carried waypoint/target metadata (`elevationM`, `primaryTheme`, `compositeScore`, `epistemicClass`, `sourceDataset`), enforce `checkCoordinateOverwrite()` before setting destination from queued targets or sortie waypoints, and disable `"Plan ... Route"` and `"Plan Comparative Suite (3 Profiles)"` when `!regionCaps.supportsEvaRouting`.

### F04 — Region Isolation, 16-Layer Alignment, Misleading CTA Removal & Globe Hover Noise
- Updated `DEFAULT_DIGITAL_TWIN_LAYERS` in [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts) to match all 16 authoritative `/api/v1/twin/layers` IDs, keeping only `ortho_imagery: true` and `perseverance_traverse: true` active on initialization.
- Updated `MISSION/SET_REGION` in [missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts) to update `geographic.terrainResolution` via `getRegionCapabilityProfile()` and clear incompatible Jezero `geographic.selectedLocation`, `science.selectedTarget`, and `science.selectedHazard` when switching to non-twin regions while preserving `savedObservations`, `queuedTargets`, and unrelated mission settings.
- Removed the misleading cyan `"OPEN JEZERO DIGITAL TWIN (16 LAYERS)"` button from non-Jezero regional dossiers in [RegionalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/RegionalMarsMap.tsx).
- Removed `onSelectCoordinates(coords)` from `handlePointerMove` in [GlobalMarsGlobe3D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsGlobe3D.tsx) so hovering no longer triggers inspection API calls; moved intentional `onSelectCoordinates` emission into `handleGlobeClick`.

### F06 — Canonical East Longitude Normalization `[-180, 180)` & Fail-Closed Study Bounds
- Exported `normalizeEastLon`, `normalizeCoordinate`, `isCanonicalCoordinate`, and `normalizeMissionBundleCoordinates` in [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts) using exact fast-path normalization inside `[-180, 180)` to avoid floating-point drift on canonical inputs.
- Applied longitude normalization across `missionStorage.ts` ([missionStorage.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionStorage.ts)), `routes.ts` (`parseUrlCoordinate`, `buildMissionUrl`, `normalizeUrlEastLon` in [routes.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/navigation/routes.ts)), `missionBootstrap.ts` ([missionBootstrap.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionBootstrap.ts)), `missionReducer.ts`, `GlobalMarsMap.tsx` ([GlobalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsMap.tsx)), and `GlobalMarsGlobe3D.tsx`. (`parseMissionUrl()` retains its strict 3-key `{ page, region, missionId }` contract.)
- Updated `isInsideBounds()` in [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts) and `requestApplyEvaCoordinate()` in [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx) to fail closed (`false`) whenever `study_area.bounds` or `layersMeta` is absent.

---

## 4. Verification Results

### Automated Checks (Executed After Final Edit)
- **Frontend lint (`cd frontend && npm run lint` / `oxlint`):** **PASSED** — `0 warnings and 0 errors` across `63 files`.
- **Frontend test typecheck (`cd frontend && npx tsc -p tsconfig.test.json --noEmit`):** **PASSED** — exit code `0`.
- **Frontend unit & integration tests (`cd frontend && npm test`):** **PASSED** — `33` passed, `0` failed, `0` skipped (`tests/*.test.ts`), including newly added M0.4.2.2 regression tests in [explorerDigitalTwinIntegration.test.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/tests/explorerDigitalTwinIntegration.test.ts) and [navigationRouter.test.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/tests/navigationRouter.test.ts).
- **Frontend production build (`cd frontend && npm run build` / `tsc -b && vite build`):** **PASSED** — clean TypeScript build and Vite bundle (`dist/` built in `346ms`).
- **Backend pytest (`cd backend && .venv/bin/pytest -q`):** **PASSED** — `283 passed in 151.04s (0:02:31)`, `0` failed, `0` skipped.
- **Backend lint (`cd backend && .venv/bin/ruff check .`):** **PASSED** — `All checks passed!`.
- **Whitespace / patch hygiene (`git diff --check`):** **PASSED** — exit code `0`.

### Live Browser E2E Verification (`http://127.0.0.1:5173`)
- **Status:** **`NOT VERIFIED`**
- **Blocked Cause:** The dedicated `browser` verifier subagent attempted `mcp_chrome_devtools_list_pages` against running local dev servers (`uvicorn` on `:8000`, `vite` on `:5173`) and failed immediately with:
  ```text
  Cause: ENOENT: no such file or directory, open '/Users/vridhivazirani/Library/Application Support/Google/Chrome/DevToolsActivePort'
  ```
- Accordingly, all interactive browser scenarios (live `CUSTOM` save/reload in Chrome, 3D globe hover network inspection, non-Jezero Regional Dossier UI checks, and live Science Explorer → EVA Planner overwrite modal clicks) remain **`NOT VERIFIED`** in a live Chrome session until Chrome remote debugging (`chrome://inspect/#remote-debugging`) is enabled on the host.

---

## 5. Remaining Risks & Next Recommendation

- Because Chrome DevTools MCP could not attach to a host Chrome instance, UI click/render behaviors verified by TypeScript, Vite bundling, and reducer/model/storage tests still require a quick manual or Chrome-DevTools browser pass once `DevToolsActivePort` is available.
- **Ready for:** Host browser E2E smoke pass if desired, or proceeding to **M0.4.3** only upon explicit project owner approval.

