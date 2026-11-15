# MARSWALK — M0.4.2.1 Explorer + Digital Twin Integration Acceptance Audit

**Audit Milestone:** M0.4.2.1 (Independent Acceptance Audit of M0.4.2)  
**Target Branch / Baseline:** `main` @ `dce6f6985ed150eebf9374912116befc9eb2319c`  
**Audit Date:** 2026-11-13  
**Audit Mode:** Read-only code, API, test, and environment audit (no source files modified; no M0.4.3 changes started)  
**Acceptance Verdict:** **REQUIRES CORRECTION** (authorize targeted `M0.4.2.2` remediation + live browser E2E re-verification before starting `M0.4.3`)

> **Prototype Disclaimer:** Marswalk Planner is a research and education decision-support prototype for human EVA route planning at Jezero Crater, Mars. It is not NASA software, is not certified or endorsed by NASA or any space agency, and makes no claims regarding operational astronaut safety or extraterrestrial life.

---

## 1. Executive Summary & Audit Verdict

M0.4.2 successfully built several important architectural foundations between Mars Explorer and the Jezero Scientific Digital Twin:
- A 12-region capability matrix ([regionCapabilities.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/regionCapabilities.ts)) restricting high-resolution Digital Twin and EVA routing to `reg-jezero`.
- Fail-closed inspection summarization ([digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts)) preserving backend `epistemic_class`, uncalibrated ordinal reliability indices, `PROVISIONAL_UNVERIFIED_NOMINAL_TIER` vertical precision labels, `OUT_OF_BOUNDS`, and `UNRESOLVED_RESOLUTION_HAZARD` flags.
- Synthetic CV test-patch disclosure ([GeologyMineralogyPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/GeologyMineralogyPage.tsx#L688-L692)).
- All static checks, unit tests, production build, backend scientific/parity tests (`283` pytest cases), and live backend HTTP checks passed cleanly.

However, independent audit inspection uncovered **1 High severity defect** that corrupts persisted mission drafts upon reload, **4 Medium severity integration/provenance gaps**, **1 Low severity boundary detail**, and an **unverified interactive browser E2E blocker** (`DevToolsActivePort` `ENOENT`). Under acceptance standards, M0.4.2 cannot receive unconditional approval until the draft-corrupting observation defect and integration/provenance issues are corrected and browser verification is completed.

| Finding ID | Severity | Title | Primary Location |
|---|---|---|---|
| `F01` | **HIGH** | `'CUSTOM'` observation category passes UI submit, then invalidates the entire `MissionBundleV1` draft on reload | [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L728-L742), [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L63), [mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts#L78) |
| `F02` | **MEDIUM** | Observation records conflate user notes with backend telemetry, strip structured `regionId`/`sourceDataset`, and default unknown context to `'INTERPRETED'` | [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L276-L328), [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L266-L286) |
| `F03` | **MEDIUM** | Queued targets drop epistemic/elevation/score metadata, `ScienceExplorerPage` uses a disconnected local queue, and direct destination routes skip overwrite safeguard | [mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts#L86-L91), [ScienceExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/ScienceExplorerPage.tsx#L34), [MissionContext.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx#L349-L406), [EVARoutePlannerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/EVARoutePlannerPage.tsx#L81-L157) |
| `F04` | **MEDIUM** | Incomplete persisted cleanup on region switch, non-monochrome legacy Jezero CTA inside non-Jezero dossier, `DEFAULT_DIGITAL_TWIN_LAYERS` mismatch (`7` vs `16`), and `GlobalMarsGlobe3D` pointer-move API storm | [missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts#L112-L125), [RegionalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/RegionalMarsMap.tsx#L946-L964), [GlobalMarsGlobe3D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsGlobe3D.tsx#L691-L693) |
| `F05` | **MEDIUM** | Live interactive Browser E2E scenarios (`1–8`) are `NOT VERIFIED` due to unavailable Chrome DevTools MCP (`ENOENT`) and no installed Playwright/Puppeteer/Selenium driver | Chrome DevTools MCP / Local Environment |
| `F06` | **LOW** | `+180°` boundary wrapping inconsistencies (`<= 180` vs `[-180, 180)`) and null `layersMeta` bounds check returning `true` | [GlobalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsMap.tsx#L196-L216), [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L84), [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L147) |

---

## 2. Git Baseline & Repository Protection Check

Inspected prior to running tests or writing this report:
- **Branch:** `main`
- **HEAD commit:** `dce6f6985ed150eebf9374912116befc9eb2319c`
- **Staged changes:** `0` (`git diff --cached --stat` empty)
- **Unstaged modified files relative to HEAD:** `49` files (`3,869 insertions(+), 782 deletions(-)` across M0.1–M0.4.2), plus untracked M0.3.x and M0.4.x modules, tests, and reports.
- **Backend preservation verified:** `git diff --stat backend/` shows only the 26 backend files from M0.1–M0.3.4 plus M0.3.x untracked backend files (`uncertainty.py`, `hazard_inspection.py`, `native_hazards.py`, and integration/unit test suites). M0.4.2 made zero changes to backend scientific algorithms, raster products, catalogs, or backend API contracts.
- **No destructive Git commands run:** Did not reset, clean, stash, commit, or push.

---

## 3. Region Capability & Layer Compatibility Audit

Inspected [regionCapabilities.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/regionCapabilities.ts), live `GET /api/v1/regions`, `GET /api/v1/regions/reg-jezero`, `GET /api/v1/twin/layers`, [MissionContext.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx#L250-L270), [missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts#L112-L125), [MapExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/MapExplorerPage.tsx#L550-L635), [RegionalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/RegionalMarsMap.tsx#L755-L995), and [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L88-L310).

### 3.1 12-Region Capability Matrix

All 12 region IDs served by `/api/v1/regions` match [regionCapabilities.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/regionCapabilities.ts) 1:1. Only `reg-jezero` is authorized for local Digital Twin, multi-resolution terrain/hazard inspection, science target selection, and EVA routing:

| Region ID | Display Name | Capability Tier | Digital Twin | Multi-Res / Hazards / Targets / EVA | Primary Evidence / Datasets |
|---|---|---|---|---|---|
| `reg-jezero` | Jezero Crater (Western Basin & River Delta) | `LOCAL_DIGITAL_TWIN` | **Yes (`digital-twin`)** | **Yes** | `PLN-SRC-08` HiRISE 1.0 m (`OBSERVED`), `PLN-SRC-06` CTX 20 m (`DERIVED`), `PLN-SRC-05` CTX 6 m Ortho (`OBSERVED`), `PLN-INT-02` USGS SIM-3464 (`INTERPRETED`) |
| `reg-gale` | Gale Crater (Mount Sharp & Aeolis Palus) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`), `PLN-INT-01` USGS 1:100k (`INTERPRETED`) |
| `reg-valles-marineris` | Valles Marineris (Chasma Canyon System) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA (`OBSERVED`), `PLN-SRC-03` THEMIS Day IR 231 m/px (`OBSERVED`) |
| `reg-olympus-mons` | Olympus Mons (Shield Volcano & Caldera) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |
| `reg-tharsis` | Tharsis Volcanic Region (Tharsis Rise & Montes) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |
| `reg-hellas` | Hellas Planitia (Giant Impact Basin) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |
| `reg-utopia` | Utopia Planitia (Northern Lowlands & Tianwen-1) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |
| `reg-elysium` | Elysium Planitia (Young Volcanic Plains & InSight) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |
| `reg-arcadia` | Arcadia Planitia (Glacier-Rich Plains & Human Architecture) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |
| `reg-gusev` | Gusev Crater (Columbia Hills & MER Spirit) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |
| `reg-north-polar` | North Polar Region (Planum Boreum & Polar Troughs) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |
| `reg-south-polar` | South Polar Region (Planum Australe & SPRC) | `REGIONAL_ORBITAL_CONTEXT` | No (`null`) | No | `PLN-SRC-01` MOLA 46.3 km/px (`OBSERVED`) |

Unrecognized IDs fall back in `getRegionCapabilityProfile()` to `UNKNOWN_REGION` with all local flags `false` (fail-closed).

### 3.2 Digital Twin 16-Layer Inventory & Region-Switch Findings

Live `GET /api/v1/twin/layers` serves `16` Jezero Western Fan & Delta layers:
`ortho_imagery` (`OBSERVED`), `elevation_colormap` (`DERIVED`), `hillshade` (`DERIVED`), `multidirectional_hillshade` (`DERIVED`), `elevation_contours` (`DERIVED`), `slope_overlay` (`DERIVED`), `terrain_classes` (`HEURISTIC`), `source_coverage` (`DERIVED`), `data_confidence` (`HEURISTIC`), `detection_confidence` (`HEURISTIC`), `spatial_uncertainty` (`HEURISTIC`), `resolution_uncertainty` (`DERIVED`), `overall_hazard` (`HEURISTIC`), `science_opportunity` (`INTERPRETED`), `unified_costmap` (`HEURISTIC`), `perseverance_traverse` (`OBSERVED`).

**Audit Findings on Layer Compatibility & Region Switching:**
1. **`DigitalTwinPage` Runtime Guard Works (`DigitalTwinPage.tsx:253-310`):** When `activeRegionId !== 'reg-jezero'`, `DigitalTwinPage` short-circuits before mounting `MarsMap2D`, `MarsMap3D`, hazard readouts, or ranked science target controls, rendering an honest `"Local Digital Twin Unavailable for ..."` card. `MissionContext.setActiveRegion()` (`MissionContext.tsx:257-266`) clears runtime inspection state (`selectedHazard`, `selectedCost`, `selectedTerrain`, `selectedScience`, `selectedTargetFeature`) and increments `inspectionSeqRef`.
2. **Legacy Cyan CTA in Non-Jezero Dossier (`F04`, [RegionalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/RegionalMarsMap.tsx#L946-L964)):** Inside the non-Jezero dossier hero banner, right alongside the M0.4.2 capability card, a legacy cyan (`#22d3ee`) button `"OPEN JEZERO DIGITAL TWIN (16 LAYERS)"` remains wired to `handleSelectRegion('reg-jezero')` — it switches the active region back to Jezero inside the Regional Map without opening `'digital-twin'` and contradicts the intentional `"Switch Mission to Jezero & Open Digital Twin →"` action.
3. **Persisted Bundle Retains Stale Jezero Metadata on Region Switch (`F04`, [missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts#L112-L125)):** `MISSION/SET_REGION` only mutates `geographic.regionId` and `updatedAt`. It leaves `geographic.terrainResolution` (`'20m ARD / 1m HiRISE'`) and any existing `science.selectedTarget` / `science.selectedHazard` untouched inside persisted `MissionBundleV1`.
4. **Default Layer Map Coverage Gap (`F04`, [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L36-L44)):** `DEFAULT_DIGITAL_TWIN_LAYERS` defines `7` keys (`elevation_colormap`, `slope_overlay`, `terrain_classes`, `overall_hazard`, `science_opportunity`, `unified_costmap`, `resolution_uncertainty`) while `/api/v1/twin/layers` serves `16` layers.
5. **3D Globe Pointer-Move Inspection Storm (`F04`, [GlobalMarsGlobe3D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsGlobe3D.tsx#L691-L693)):** `GlobalMarsGlobe3D` calls `onSelectCoordinates(coords)` on every `handlePointerMove` over the globe mesh. In [MapExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/MapExplorerPage.tsx#L601), `onSelectCoordinates` is `actions.inspectCoordinates`, which fires 4 parallel inspection HTTP calls per mouse-move event whenever `reg-jezero` is selected.

---

## 4. Scientific Target Integrity Trace (`SCI-01-KODIAK`)

Traced end-to-end from backend catalog/API to Digital Twin UI, `MissionContext`, `localStorage`, and `EVARoutePlannerPage`:

| Stage | Observed Behavior / Data | Verification |
|---|---|---|
| **1. Source Catalog & API** | `data/catalog/jezero_western_delta_20m_science_targets.json` & `GET /api/v1/science/targets` (`12` targets): `SCI-01-KODIAK` ("Kodiak Isolated Delta Remnant Butte"), coordinates `[77.408313, 18.459456, -2514.4]` (`IAU_2015:49900`), `primary_science_theme: "Delta Architecture & Stratigraphy"`, `composite_score: 0.4854`, `epistemic_class: "INTERPRETED"`. | Verified via live API + file inspection |
| **2. Selection in Digital Twin** | Selecting `SCI-01-KODIAK` invokes `actions.selectTargetFeature()` → `featureToMissionTargetRef()` ([digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L248-L261)), preserving `targetId`, `name`, normalized `{ lat: 18.459456, lon: 77.408313 }`, `elevationM: -2514.4`, `primaryTheme`, `compositeScore`, and `epistemicClass: 'INTERPRETED'`. Parallel inspection populates `selectedHazard` (`-2514.39 m`, `HEURISTIC`, `HiRISE (1m)`), `selectedCost` (`4.97x BALANCED`), `selectedTerrain`, and `selectedScience` (`48.5% INTERPRETED`). | Verified in source & live API |
| **3. Queueing (`F03` Provenance Drop)** | Clicking `"Queue Science Target"` calls `featureToSortieWaypoint()` ([digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L263-L274)), converting `CandidateTargetFeature` into `MissionSortieWaypoint` (`{ id, lat, lon, name }`). Because `MissionSortieWaypoint` ([mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts#L86-L91)) and `validateWaypoint()` ([missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L252-L264)) drop all other fields, **epistemic class, elevation, primary theme, and composite score are stripped** upon queueing. | Verified (`F03`) |
| **4. Destination Handoff & Overwrite Safeguard** | In [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L140-L188), `"Set as Destination"` checks `isInsideBounds()` and calls `checkCoordinateOverwrite('destination', mission.eva.destination, coord)` so replacing default `18.4550°N, 77.4050°E` opens an explicit inline confirmation prompt. **Gap (`F03`):** Clicking `"Use SCI-01-KODIAK ... as Dest →"` inside [EVARoutePlannerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/EVARoutePlannerPage.tsx#L152) or `"🧭 Route Directly"` in [ScienceExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/ScienceExplorerPage.tsx#L400) (`actions.selectTargetForRouting()` at [MissionContext.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx#L349-L362)) overwrites Destination immediately with **no overwrite safeguard**. | Partial (`DigitalTwinPage` guarded; other entry points unguarded) |
| **5. `ScienceExplorerPage` Disconnection (`F03`)** | [ScienceExplorerPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/ScienceExplorerPage.tsx#L34) holds a separate local `useState` `queuedWaypoints` uncoupled from `mission.science.queuedTargets`, and `sendWaypointsToEVAPlanner()` ([MissionContext.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/context/MissionContext.tsx#L397-L406)) navigates to `'simulation'` instead of `'route-planner'`. Also `EVARoutePlannerPage.tsx:81-96` leaves `"Plan Route"` buttons clickable even when `!regionCaps.supportsEvaRouting`. | Verified (`F03`) |
| **6. Persistence & Reload** | `queuedTargets` and `selectedTarget` persist inside `MissionBundleV1` (`marswalk.mission.v1`) via `MissionContext` `useEffect` and restore cleanly through `initializeMissionBootstrap()` — **unless** a `'CUSTOM'` observation was saved in the same bundle (`F01`), which invalidates the entire draft on reload. | Verified via unit tests + code trace (`F01` blocker) |
| **7. Synthetic CV Disclosure** | `/api/v1/terrain/cv/candidates` is consumed only in [GeologyMineralogyPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/GeologyMineralogyPage.tsx#L674-L696) (not `DigitalTwinPage`), displaying `SIMULATED DEMO WINDOW` and `CV_SYNTHETIC_DEMO_DISCLOSURE` stating the detections come from an illustrative `100×100` synthetic test patch and are not observed HiRISE detections. | Verified in source |

---

## 5. Observation Integrity Audit

Inspected [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L203-L233,L726-L778,L990-L1044), [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L276-L328), [missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L63,L266-L286,L431-L434), and [missionReducer.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionReducer.ts#L315-L343):

| Criterion | Finding | Status |
|---|---|---|
| **Non-fabrication** | Telemetry appended by `buildObservationFromInspection()` uses live backend `selectedHazard` / `selectedTarget` fields when present and never fabricates elevations or hazard percentages when `null` or `OUT_OF_BOUNDS`. | **PASS** |
| **Category schema alignment (`F01`)** | `DigitalTwinPage.tsx:741` exposes `<option value="CUSTOM">CUSTOM</option>`, which `DigitalTwinPage.tsx:728` casts via `as MissionObservationRecord['category']`. However, [mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts#L78) and `VALID_OBS_CATEGORIES` ([missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L63)) allow only `'TERRAIN' | 'HAZARD' | 'SCIENCE' | 'GEOLOGY'`. Saving a `'CUSTOM'` observation passes in-memory state updates, gets written to `localStorage`, and **causes `validateObservation()` (`L266-L286`) / `validateMissionBundle()` (`L431-L434`) to reject the entire saved draft (`reason: 'invalid_science'`) on page refresh**. | **FAIL (`F01` HIGH)** |
| **User note vs backend-derived separation (`F02`)** | `buildObservationFromInspection()` (`L288-L327`) concatenates user-entered `params.note` and backend telemetry (`Elev: ... \| Source: ... \| Passability: ...`) into a single `summary` string (`summaryParts.join(' — ')`). `MissionObservationRecord` has no separate `userNote`, `derivedSummary`, `regionId`, or `sourceDataset` fields, and `validateObservation()` strips extra properties on load. | **FAIL (`F02` MEDIUM)** |
| **Honest handling of missing/unknown source (`F02`)** | When both `params.target` and `params.hazard` are `null`, `buildObservationFromInspection()` (`L308-L316`) assigns `epistemicClass: 'INTERPRETED'` instead of `'UNKNOWN'`. Only `OUT_OF_BOUNDS` hazards map to `'UNKNOWN'`. | **FAIL (`F02` MEDIUM)** |
| **Stable IDs & non-deletion on target removal** | Observation IDs (`obs-...`) are independent of `queuedTargets`; removing a queued target (`MISSION/REMOVE_QUEUED_TARGET`) leaves `savedObservations` intact. | **PASS** |

---

## 6. Coordinate System & Geodesy Correctness Audit

Inspected [crs.py](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/app/geospatial/crs.py), [GlobalMarsGlobe3D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsGlobe3D.tsx#L27-L65,L684-L694,L734-L747), [GlobalMarsMap.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/GlobalMarsMap.tsx#L196-L277), [MarsMap2D.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/components/MarsMap2D.tsx#L421-L509), [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L34-L78), and live backend transforms:

| Component / Endpoint | CRS & Sphere Radius | Longitude Range / Order | Verification Result |
|---|---|---|---|
| **Backend CRS (`crs.py`)** | `IAU_2015:49900` (`R = 3,396,190.0 m`) ↔ `ESRI:103885` (`always_xy=True`) | `(lon, lat)` internal transformer order; `[-180, 180)` normalization `((lon + 180) % 360) - 180` | **PASS** — `KODIAK` `(77.408313, 18.459456)` → `(4588354.339, 1094178.671)` m |
| **Digital Twin Bounds (`twin/layers`)** | `IAU_2015:49900` / `ESRI:103885` (`586 × 362`, `20.0 m`) | Bounds `[[18.3918, 77.3437], [18.58953, 77.46584]]` (Lat/Lon); Center `[18.49066, 77.40477]` | **PASS** |
| **Region Basin (`regions/reg-jezero`)** | Planetocentric / East-Lon | Bounds `lat [18.211, 18.7212], lon [77.1605, 77.6992]` (~31.93 × 30.24 km); Center `[18.4485, 77.432]` | **PASS** — Distinct wider regional box vs narrower 20m Digital Twin study box |
| **`GlobalMarsMap.tsx` (`F06`)** | Leaflet `EPSG:4326` custom Mars grid | `jezeroBounds` `[[18.39180, 77.34370], [18.58953, 77.46584]]` matches live 20m `study_area.bounds`; however manual wrap `if (lon > 180) lon -= 360` (`L196-L198,L214-L216`) leaves `+180.0` instead of canonical `[-180, 180)`. | **MINOR (`F06`)** |
| **`GlobalMarsGlobe3D.tsx`** | Three.js Mars sphere | `latLonToVector3` / `vector3ToLatLon` uses `[-90, 90]` & `[-180, 180)` East-positive (`if (lon >= 180.0) lon -= 360.0`) | **PASS** (`vec↔lat/lon` math consistent; `onSelectCoordinates` on hover is `F04`) |
| **`digitalTwinHelpers.ts` & `missionModel.ts` (`F06`)** | `IAU_2015:49900` | `normalizeEastLon()` wraps strictly to `[-180, 180)` (`-0` normalized to `0`). `isValidCoordinate()` (`missionModel.ts:84`) still accepts `lon <= 180`. `isInsideBounds()` (`digitalTwinHelpers.ts:62`) returns `true` when `bounds` is `null`/`undefined`. | **MINOR (`F06`)** |
| **Science GeoJSON vs Inspection APIs** | GeoJSON `[lon, lat, elev]` → Frontend `{ lat, lon }` → Query `?lat=...&lon=...` | `SCI-01-KODIAK` `[77.408313, 18.459456, -2514.4]` matches `/hazards/inspect` `-2514.395 m` and `/science/inspect` `0.4854` | **PASS** |

---

## 7. M0.3.4 Scientific Integrity Audit (Preservation Confirmation)

Independently checked [hazard_inspection.py](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/app/services/hazard_inspection.py), [evaluator.py](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/app/hazards/evaluator.py), [test_api_raster_parity.py](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/tests/integration/test_api_raster_parity.py), [test_authoritative_hazard_pipeline.py](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/tests/integration/test_authoritative_hazard_pipeline.py), catalog JSON provenance, live API responses, and [digitalTwinHelpers.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/digitalTwinHelpers.ts#L113-L246):

1. **Authoritative Raster & API Parity:** Full `212,132`-cell grid (`586 × 362`) matches `jezero_western_delta_20m_hazard_hard_impassable.tif` (`61,055` blocked, `151,077` passable), preserving all `11,148` native-1m-only blocked cells (including `row=0, col=288` with `NATIVE_HIRISE_OBSTACLE`) and `49,139` CTX-only cells. Verified by `test_full_grid_212132_cell_passability_parity` and `test_api_inspect_matches_raster_across_all_categories`.
2. **Fail-Closed Unknown / NoData / Missing Inputs:**
   - Live `/api/v1/hazards/inspect?lat=10.0&lon=70.0` returned `status: "OUT_OF_BOUNDS"`, `elevation_m: None`, `is_passable: False`, `epistemic_class: None`, `nominal_vertical_precision_m: None`.
   - Frontend `summarizeHazardInspection()` displays `OUT OF BOUNDS — UNMAPPED (IMPASSABLE BY DEFAULT)`, sets `epistemicClass = 'UNKNOWN'`, and disables EVA placement (`canPlaceEvaPoint = false`).
   - Synthetic missing-score (`-9999.0`), `source_id=0`, and missing authoritative TIFF (`HTTP 503`) guards remain verified in `test_unknown_cell_and_missing_inputs_fail_closed`.
3. **CTX vs HiRISE Resolution Distinction & `UNRESOLVED_RESOLUTION_HAZARD`:**
   - Live query at `SCI-01-KODIAK` (`18.459456, 77.408313`): `resolution_class: "NATIVE_HIRISE_1M"`, `epistemic_source: "HiRISE (1m)"`, `data_reliability_index: 0.95 (HIGH)`, `detection_reliability_index: 0.8125 (MODERATE)`, `nominal_vertical_precision_m: 0.2`.
   - Live query at CTX-only corner `(18.40, 77.35)`: `is_passable: False`, `hard_restriction_codes: ["UNRESOLVED_RESOLUTION_HAZARD"]`, `resolution_class: "REGIONAL_CTX_20M"`, `epistemic_source: "CTX (20m)"`, `data_reliability_index: 0.7`, `detection_reliability_index: 0.5375`, `nominal_vertical_precision_m: 2.0`.
4. **Epistemic Tagging, Uncalibrated Reliability & Precision Disclaimers:**
   - `property_epistemic_classes` cleanly separates `source_elevation: DERIVED`, `terrain_derivatives: DERIVED`, `cv_hazard_heuristics: HEURISTIC`, `passability_classification: HEURISTIC`, `reliability_indices: HEURISTIC`, `nominal_vertical_precision_tier: HEURISTIC`, and `resolution_uncertainty: DERIVED`.
   - `data_reliability_index` / `detection_reliability_index` remain explicitly labeled `"uncalibrated ordinal index"` in `summarizeHazardInspection()` (`L221-L228`) and `"PROVISIONAL_UNVERIFIED_NOMINAL_TIER"` (`L229-L232`).
   - Optical CV provenance in [jezero_western_delta_20m_hazard_intelligence.json](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/data/catalog/jezero_western_delta_20m_hazard_intelligence.json#L183-L190) still accurately discloses 20m-resampled `JEZ_ctx_B_soc_008_orthoMosaic_6m.tif` (`10.5066/P9GV1ND3`).

---

## 8. Browser Verification Results & Tooling Probe

### 8.1 Environment Probe
Checked alternative browser automation capabilities prior to marking browser scenarios unverified:
- **Chrome DevTools MCP (`chrome_devtools:list_pages` via `M0.4.2.1 E2E Browser Verifier` subagent `26324494-cdde-4907-b0d6-326c7aacdd17`):** Failed with `ENOENT: no such file or directory, open '/Users/vridhivazirani/Library/Application Support/Google/Chrome/DevToolsActivePort'`.
- **Node packages (`frontend`):** `playwright`, `@playwright/test`, `puppeteer`, `selenium-webdriver` → all `NOT INSTALLED`.
- **Python modules (`backend/.venv`):** `playwright`, `selenium`, `pyppeteer` → all `False`.
- **CLI binaries:** `playwright`, `google-chrome`, `chromium`, `chromedriver` → not found (`/System/Cryptexes/App/usr/bin/safaridriver` exists on macOS without remote-automation session enabled).

### 8.2 Browser E2E Scenarios (`1–8`)

Live HTTP endpoints responded cleanly, **but HTTP checks are NOT E2E browser tests**. Because no interactive browser driver was available in this environment, all 8 mounted UI scenarios are recorded honestly as **`NOT VERIFIED`**:

| Scenario | Description | Status | Reason |
|---|---|---|---|
| **Scenario 1** | Explorer Regional Map: select `reg-gale`, inspect orbital context banner & disabled local Twin controls | **NOT VERIFIED** | Chrome DevTools MCP `DevToolsActivePort` `ENOENT`; no Playwright/Puppeteer/Selenium installed |
| **Scenario 2** | Navigate to `Digital Twin` while `reg-gale` active (`/?page=digital-twin&region=reg-gale`); verify non-Jezero guard | **NOT VERIFIED** | Same environment blocker (note static code audit confirms guard exists at `DigitalTwinPage.tsx:253-310`) |
| **Scenario 3** | Switch to `reg-jezero` & enter Digital Twin; verify 16 layers, study bounds, 2D/3D render, science targets | **NOT VERIFIED** | Same environment blocker |
| **Scenario 4** | Inspect `SCI-01-KODIAK`, verify `INTERPRETED` badge & queue update (`Queue Science Target`) | **NOT VERIFIED** | Same environment blocker |
| **Scenario 5** | Quick Coordinate Lookup `(10.0, 70.0)` out-of-bounds → verify `OUT OF BOUNDS` & blocked EVA placement | **NOT VERIFIED** | Same environment blocker (live API OOB response verified via HTTP; DOM rendering unverified) |
| **Scenario 6** | Inspect `(18.4595, 77.4083)`, save `TERRAIN` observation & test `CUSTOM` observation `localStorage` persistence across reload | **NOT VERIFIED** | Same environment blocker (**Static audit found `F01`: `'CUSTOM'` corrupts reload validation!**) |
| **Scenario 7** | Click `Set as Destination` for `SCI-01-KODIAK`, confirm overwrite prompt, verify `EVA Route Planner` carry-over | **NOT VERIFIED** | Same environment blocker |
| **Scenario 8** | Runtime console errors, uncaught page errors, failed network requests (`>= 400`), broken assets | **NOT VERIFIED** | Same environment blocker (static audit identified high-frequency `pointermove` API requests in `F04`) |

---

## 9. Fresh Regression & Build Verification Suite

Executed fresh on `2026-11-13` with zero skipped tests and zero warnings:

| Check | Command | Exit Code | Observed Output Summary |
|---|---|---|---|
| Frontend Lint | `cd frontend && npm run lint` | `0` | `oxlint`: `0 warnings and 0 errors` (`63 files`, `116 rules`) |
| Test Typecheck | `cd frontend && npx tsc -p tsconfig.test.json --noEmit` | `0` | Clean (no type errors in `src/` + `tests/`) |
| Frontend Unit & Integration Tests | `cd frontend && npm test` | `0` | `29 passed, 0 failed, 0 skipped` (`367.59 ms`) |
| Production Typecheck & Build | `cd frontend && npm run build` | `0` | `tsc -b && vite build` passed (`built in 318 ms`) |
| Backend Test Suite | `cd backend && .venv/bin/pytest -q` | `0` | `283 passed` in `138.67s` (`0 failed, 0 skipped`) |
| Backend Linter | `cd backend && .venv/bin/ruff check .` | `0` | `All checks passed!` |
| Patch Hygiene | `git diff --check` | `0` | Clean (no whitespace/conflict marker issues) |

---

## 10. Remediation Requirements (`M0.4.2.2`) Before Authorizing `M0.4.3`

Before moving to `M0.4.3`, complete a narrowly scoped `M0.4.2.2` corrective pass and run live browser E2E verification:

1. **[F01 — HIGH] Reconcile `MissionObservationRecord['category']` across UI, TypeScript, and validation:**
   - Either add `'CUSTOM'` to `MissionObservationRecord['category']` ([mission.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/types/mission.ts#L78)) and `VALID_OBS_CATEGORIES` ([missionModel.ts](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/mission/missionModel.ts#L63)), **or** remove `'CUSTOM'` from [DigitalTwinPage.tsx](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/frontend/src/pages/DigitalTwinPage.tsx#L741) and eliminate the unsafe `as` cast at `L728`. Add a regression unit test verifying round-trip save + `loadMissionDraftResult()` reload across every UI-selectable category.
2. **[F02 — MEDIUM] Separate user notes from backend telemetry & fix unknown-source epistemic class:**
   - Store structured `userNote`, `derivedSummary`, `regionId`, and `sourceDataset` (or structured metadata fields preserved by `validateObservation`) separately from machine-derived inspection telemetry.
   - Map uninspected/no-source observations (`!params.target && !params.hazard`) in `buildObservationFromInspection()` to `'UNKNOWN'` rather than `'INTERPRETED'`.
3. **[F03 — MEDIUM] Unify science queueing, preserve target provenance, and extend overwrite safeguard:**
   - Preserve `elevationM`, `primaryTheme`, `compositeScore`, and `epistemicClass` on queued targets (rather than dropping to `{ id, lat, lon, name }`), migrate `ScienceExplorerPage`'s local `queuedWaypoints` into shared `MissionContext`, fix `sendWaypointsToEVAPlanner()` target page (`'route-planner'` vs `'simulation'`), apply the overwrite safeguard to `selectTargetForRouting()` and `EVARoutePlannerPage` queued-target destination buttons, and disable EVA planning execution buttons cleanly when `!regionCaps.supportsEvaRouting`.
4. **[F04 — MEDIUM] Tighten region-switch state cleanup, legacy UI button, and 3D globe hover fetches:**
   - In `MISSION/SET_REGION`, update `geographic.terrainResolution` to match the selected region's primary resolution and clear persisted Jezero-specific `science.selectedTarget` / `science.selectedHazard` when switching away from `reg-jezero`.
   - Remove or unify the stale cyan `"OPEN JEZERO DIGITAL TWIN (16 LAYERS)"` button at `RegionalMarsMap.tsx:946-964`.
   - Avoid firing `inspectCoordinates()` on mouse `pointermove` in `GlobalMarsGlobe3D.tsx:691-693` (only pass `onSelectCoordinates` on explicit click/sample if intended, or separate hover preview from API inspection).
5. **[F06 — LOW] Minor coordinate/bounds hardening:**
   - Consistently normalize longitudes into canonical `[-180, 180)` in `GlobalMarsMap.tsx` and `missionModel.ts:isValidCoordinate()`, and fail closed in `DigitalTwinPage.tsx:147` if `layersMeta?.study_area?.bounds` is not yet loaded.
6. **[F05 — Browser E2E Re-Verification]:**
   - Enable Google Chrome remote debugging (`chrome://inspect/#remote-debugging`, confirming `DevToolsActivePort` exists) and execute all 8 browser E2E scenarios before starting `M0.4.3`.

