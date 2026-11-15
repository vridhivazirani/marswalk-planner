# MARSWALK — M0.4.4 ARCHITECTURE INSPECTION REPORT
## Science-Aware EVA Route Planning & Multi-Objective Comparison

**Milestone:** M0.4.4  
**Date:** November 15, 2026  
**Auditor:** Antigravity (Senior Geospatial Systems & Data Architect)  
**Branch:** `main` | **Baseline Commit:** `dce6f6985ed150eebf9374912116befc9eb2319c`  
**Working Tree Status:** 68 modified/untracked files from M0.1–M0.4.3.4 (preserved intact)  
**Status:** **INSPECTION COMPLETE — READY FOR PLAN REVIEW**  

---

## 1. Executive Summary

Milestone M0.4.4 expands Marswalk's human mission planning capabilities to deliver its core scientific differentiator: **Science-Aware Human EVA Route Planning & Multi-Objective Comparison**. 

In accordance with Phase 0 directives, a comprehensive, non-destructive architecture inspection was conducted across the backend routing engine, costmap pipelines, hazard models, science opportunity services, emergency routing, and frontend mission state workflows.

### Key Inspection Findings:
1. **Existing Routing Stack is Mathematically Authoritative but Single-Leg:**  
   The core pathfinding engine (`RouteOptimizationEngine` in `backend/app/routing/engine.py`) provides rigorous 8-directional kinematic A* and Dijkstra graph search over 20m Jezero ARD elevation, slope, TRI roughness, and unified hard impassable rasters. However, `engine.compute_route()` and `engine.compute_suite()` strictly accept only a single `(start_lat, start_lon)` and `(dest_lat, dest_lon)`. No multi-stop waypoint chaining currently exists in the core routing engine or `/api/v1/routing/*` endpoints.
2. **Multi-Destination Service Already Exists in Mission Planning:**  
   `MissionPlanningService` (`backend/app/services/mission_planning.py:103–180`) already implements sequential multi-destination leg chaining (`origin -> wp1 -> wp2 -> ... -> origin`) and computes direct emergency Return-to-Base (RTB) paths. This service can be cleanly adapted and mirrored in `RouteOptimizationEngine` to produce unified multi-stop `RoutePlan` objects without creating a redundant routing algorithm.
3. **Frontend Science Targets are Separated from the Route Graph:**  
   While `ScienceExplorerPage` allows selecting 10 curated Jezero science targets (`data/catalog/jezero_western_delta_20m_science_targets.json`) and adding them to `mission.science.queuedTargets`, `EVARoutePlannerPage` and `MultiObjectiveComparisonPanel` only pass `startPoint` (base camp) and `destPoint` (destination) to `/api/v1/routing/plan`, `/suite`, and `/compare`. Queued science targets are displayed as standalone metadata cards rather than active route waypoints.
4. **Comparison Interface Lacks Route Selection & Persistence:**  
   `MultiObjectiveComparisonPanel` displays comparative utility rankings and trade-off commentary, but has no mechanism to commit a chosen route into `mission.eva.selectedComparisonRouteId` or persist the decision rationale in `MissionBundleV1`.
5. **Carried-Forward Safeguards are Fully Mapped:**  
   - **Item A (Emergency Service Direct Validation):** `latlon_to_grid()` validates spatial boundaries, but does not explicitly verify finite real numbers upfront (`math.isnan` or `math.isinf` can cause unpredictable exceptions before bounds evaluation).
   - **Item B (Atlas Reference Semantics):** All entries in `ATLAS_CATALOGUE` were audited; catalogued entries with methodology DOIs (`Horn 1981`, `USGS SIM-3464`, `LMD MCD`) have `layer_id = None` and do not masquerade as local GeoTIFFs.

---

## 2. Answers to the 14 Required Inspection Questions

### Q01: What routing functionality already exists?
- **Backend:**
  - `GridGraph` (`backend/app/routing/graph.py`): 8-directional kinematic adjacency grid on 20m Jezero cells. Edge weights incorporate Euclidean/diagonal distance ($20\text{ m}$ / $28.28\text{ m}$) multiplied by average combined cost.
  - `find_path()` (`backend/app/routing/search.py`): Bidirectional / monotonic A* and Dijkstra implementations with Euclidean heuristic in projected coordinates (`ESRI:103885`).
  - `compute_unified_costmap()` (`backend/app/costmap/evaluator.py`): Weighted combination of slope, TRI, overall hazard, elevation uncertainty ($\sigma_z$), and science opportunity, bounded by `hard_impassable_mask`.
  - `RouteOptimizationEngine` (`backend/app/routing/engine.py`): Generates single-leg `RoutePlan` and 3-profile `compute_suite()` (`SAFETY_FIRST`, `SCIENCE_FIRST`, `BALANCED`). Computes arc-length weighted trapezoidal metrics.
  - `RouteComparisonService` (`backend/app/services/route_comparison.py`): Multi-objective ranking under user preferences (`safety_importance`, `science_importance`, `efficiency_importance`).
- **Frontend:**
  - `EVARoutePlannerPage.tsx`: Single-profile and 3-profile route calculation, profile selection, custom weight sliders, and carried context inspection.
  - `MultiObjectiveComparisonPanel.tsx`: Comparative route cards, utility ranking, and trade-off synthesis commentary.

### Q02: Can the current backend calculate routes through multiple waypoints, or only start-to-destination routes?
- **Currently:** Only start-to-destination routes. `engine.compute_route()` takes `start_lat, start_lon, dest_lat, dest_lon`.
- **Existing Precedent:** `MissionPlanningService.plan_multi_destination_mission()` in `backend/app/services/mission_planning.py:103–180` iterates through intermediate tuples `[(wp.lat, wp.lon), ...]`, calling `compute_route()` for each leg. However, it outputs separate mission legs and consumables rather than a single connected `RoutePlan` with unified waypoints and GeoJSON LineString.

### Q03: How are routes currently represented in API responses?
- **Single Route (`/api/v1/routing/plan`):** GeoJSON Feature with LineString geometry `[lon, lat, elev]` and properties including `route_id`, `profile_name`, `metrics`, `crs` (`IAU_2015:49900`), and `disclaimer` (`backend/app/routing/models.py:140–161`).
- **Suite (`/api/v1/routing/suite`):** GeoJSON FeatureCollection containing 3 features (`SAFETY_FIRST`, `SCIENCE_FIRST`, `BALANCED`) and a `comparison` dictionary mapping profile names to `RouteMetricsDTO`.
- **Comparison (`/api/v1/routing/compare`):** GeoJSON FeatureCollection containing 3 features and a `comparison` object of type `MultiObjectiveComparisonDTO` (`backend/app/services/route_comparison.py:106–125`).

### Q04: Which route metrics are genuinely calculated?
The following metrics are derived via authentic numerical integration along the raster cells (`backend/app/routing/engine.py:250–390`):
- `total_distance_m`: Sum of Euclidean step distances across projected coordinates ($\sum \Delta s$).
- `accumulated_cost`: Cumulative traversal cost along the raster path ($\sum \Delta s \cdot \bar{c}$).
- `mean_hazard_exposure`: Arc-length weighted trapezoidal average of overall hazard score ($[0, 1]$).
- `mean_uncertainty_exposure`, `max_uncertainty_m`, `p95_uncertainty_m`: Vertical precision ($\sigma_z$) in metres derived from HiRISE/CTX stereo photogrammetry.
- `mean_data_confidence` & `mean_detection_confidence`: Derived reliability indices ($[0, 1]$).
- `resolution_uncertainty_distance_m` & `fraction`: Exact distance and percentage traversing regional CTX 20m cells vs native HiRISE 1m cells.
- `unknown_terrain_distance_m` & `fraction`: Distance traversing unmapped or NoData cells.
- `restricted_cells_crossed`: Count of cells violating slope or obstacle thresholds.
- `accumulated_science_opportunity` & `mean_science_opportunity`: Integral of the multi-criteria science opportunity raster ($[0, 1]$).

### Q05: Which metrics are heuristic or simulated?
- `estimated_duration_minutes`: **HEURISTIC** — assumes baseline human walking speed $v_0 = 1.0\text{ m/s}$ ($3.6\text{ km/h}$) scaled inversely by terrain cost ($\Delta t = \Delta s / (v_0 / \sqrt{\bar{c}})$).
- `preference_utility_score`: **HEURISTIC** — normalized linear combination of inverted duration, inverted risk, and science density under user preference weights.
- `terrain_characterization` & `hazard_classification`: **HEURISTIC** — rule-based categorical classifications (`OBSERVED_WELL_CHARACTERIZED`, `LOWER_RESOLUTION_HAZARDOUS`, etc.).
- `consumables` (in `mission_planning.py`): **SIMULATED** — metabolic rate ($Wh$, $kcal$), $O_2$ consumption ($g/min$), battery draw ($W$), and Point of No Return (PNR).

### Q06: How are scientific targets currently represented?
- **Catalog Representation:** GeoJSON FeatureCollection in `data/catalog/jezero_western_delta_20m_science_targets.json` (10 targets, e.g. `SCI-01-KODIAK`, `SCI-02-DELTA-SCARP`). Features contain point geometry `[lon, lat, elev]`, primary science theme, breakdown scores (mineralogy, diversity, layered features, rover proximity), epistemic class (`INTERPRETED`), scientific rationale, and life inference disclaimers.
- **Mission Context Representation:** `MissionSortieWaypoint` in `frontend/src/types/mission.ts:137–151`, preserving `id`, `name`, `lat`, `lon`, `elevationM`, `primaryTheme`, `compositeScore`, `epistemicClass`, `sourceDataset`, `provenance`, and user `notes`.

### Q07: Can selected targets be reliably connected to their original source records?
- **Yes:** Each candidate target has a permanent canonical identifier (`target_id: "SCI-01-KODIAK"`, etc.) that maps directly to `jezero_western_delta_20m_science_targets.json`.
- In `frontend/src/mission/scienceWorkflowHelpers.ts:150–205`, `buildScienceTargetObservation()` and `buildTargetGeologyHandoffRef()` retain the exact `targetId`, source dataset (`"USGS SIM-3464 / Mars 2020 Perseverance"`), and epistemic classification (`INTERPRETED`).

### Q08: How are target coordinates validated?
- **Geodetically:** `isCanonicalCoordinate()` verifies planetocentric latitude $[-90, 90]$ and east-positive longitude normalized to $[-180, 180)$.
- **Regionally:** `isTargetCompatibleWithRegion()` in `frontend/src/mission/regionCapabilities.ts:576–605` checks:
  1. Active region capability (`caps.supportsEvaRouting`).
  2. Source region matching (`target.regionId === activeRegionId` or `'all'`).
  3. Spatial study bounds containment (`caps.studyBounds: [[18.38, 77.30], [18.60, 77.60]]`).
- **Engine-Level:** `RouteOptimizationEngine.latlon_to_grid()` projects coordinates to `ESRI:103885` and raises `OutOfBoundsCoordinateError` if outside raster raster extent.

### Q09: How are base camps, destinations, and waypoints persisted?
- **In State:** In `MissionBundleV1.eva` (`frontend/src/types/mission.ts:181–189`):
  - `baseCamp: MarsCoordinate | null`
  - `destination: MarsCoordinate | null`
  - `waypoints: MissionSortieWaypoint[]`
  - `routeProfile: RouteProfileId`
  - `customWeights: CostmapWeightsDTO`
  - `selectedComparisonRouteId: string | null`
  - `activeRouteIds: string[]`
- **In Storage:** Serialized as JSON in browser `localStorage` under `marswalk_mission_draft_{missionId}` via `saveMissionDraft()` in `frontend/src/mission/missionStorage.ts`.

### Q10: What happens to queued targets and EVA coordinates when the active region changes?
- When switching away from `reg-jezero` to an orbital region (e.g. `reg-gale`), `MISSION/SET_REGION` in `missionReducer.ts:127–168`:
  - Retains `mission.science.queuedTargets` and `mission.eva.waypoints` as **historical records**.
  - `evaluateEvaConfigCompatibility()` detects that `reg-gale` does not support EVA routing and sets `compatible: false`.
  - All routing buttons and simulation controls are disabled.
  - Returning to `reg-jezero` immediately restores full compatibility and re-enables sortie planning.

### Q11: How does the current comparison interface calculate and display scores?
- `RouteComparisonService.compare_routes()` (`backend/app/services/route_comparison.py:183–225`):
  - Normalizes duration, traversal risk, hazard exposure, and science opportunity across the 3 profile alternatives into $[0, 1]$.
  - Computes `preference_utility_score = w_saf * u_saf + w_sci * u_sci + w_eff * u_eff`.
  - Sorts routes by utility descending, assigning `rank_under_preferences` (Rank #1, #2, #3).
  - Generates comparative trade-off sentences explaining duration differences and science yield gains.

### Q12: Which features are currently Jezero-only?
1. 1m HiRISE DTM (`PLN-SRC-08`) and 20m CTX ARD Elevation (`PLN-DRV-02`).
2. High-resolution Digital Twin map canvas (`DigitalTwinPage.tsx`).
3. Slope gradient, TRI roughness, and VRM rasters (`PLN-DRV-03`, `07`, `08`).
4. Unified hard impassable mask (`PLN-DRV-11`) and boulder/sand hazard rasters (`PLN-DRV-12`, `13`).
5. A* and Dijkstra kinematic route planning (`/api/v1/routing/*`).
6. Multi-objective Pareto route comparison (`/api/v1/routing/compare`).
7. In-situ emergency rerouting and dynamic return-to-base aborts (`/api/v1/emergency/*`).

### Q13: Which tests already cover these workflows?
- **Backend:**
  - `backend/tests/unit/test_routing.py`: Tests single-leg A*, Dijkstra, route simplification, impassable obstacle avoidance, and out-of-bounds coordinate rejection.
  - `backend/tests/unit/test_m0_4_3_provenance_integrity.py`: Tests out-of-bounds HTTP 400 rejection for emergency endpoints, MOLA resolution reconciliation, and Atlas catalog integrity.
  - `backend/tests/unit/test_atlas_catalog.py`: Validates metadata completeness for all 37 catalog entries.
- **Frontend:**
  - `frontend/tests/scienceGeologyDataHub.test.ts`: 46 tests covering target selection, observation logging, reducer bounds validation, region gating, and M0.4.3.4 remediation.
  - `frontend/tests/explorerDigitalTwinIntegration.test.ts`: Covers coordinate normalization, study bounds checks, and storage draft lifecycle.

### Q14: What must be extended rather than duplicated?
1. **Extend `RouteOptimizationEngine`:** Add a native multi-waypoint path chaining method `compute_multi_stop_route()` that reuses `GridGraph`, `find_path()`, and `simplify_path()` to link sequential stops and generate a unified `RoutePlan`.
2. **Extend `backend/app/api/routes/routing.py`:** Add optional `waypoints: list[LatLonPoint] = Field(default_factory=list)` to `RouteRequest`, `RouteSuiteRequest`, and `RouteCompareRequest`.
3. **Extend `frontend/src/api/routing.ts`:** Update `planRoute()`, `planRouteSuite()`, and `compareRoutes()` to accept optional `waypoints: LatLon[]`.
4. **Extend `MultiObjectiveComparisonPanel.tsx`:** Display visited science targets and add a `"Select Route for Mission"` button that dispatches a new reducer action.
5. **Extend `MissionBundleV1.eva`:** Add an optional `selectedRouteDecision` object capturing the committed route choice, visited target IDs, metrics snapshot, and timestamp, with automatic staleness detection when coordinates or waypoints change.

---

## 3. Carried-Forward Verification Findings

### Item A — Emergency Service Direct Validation
- **Inspection:** In `backend/app/services/emergency_response.py:310–315`, `self.routing_engine.latlon_to_grid(crew_lat, crew_lon)` is called.
- **Deficiency Identified:** `latlon_to_grid()` relies on `Transformer.transform()`. Passing `math.nan`, `math.inf`, or `None` directly to `simulate_incident_and_reroute()` without going through FastAPI Pydantic validators can trigger `TypeError` or floating-point anomalies rather than a clean, predictable `ValueError`.
- **Correction Required in M0.4.4:** In `RouteOptimizationEngine.latlon_to_grid()`, explicitly assert that `lat` and `lon` are finite real numbers (`math.isfinite(lat) and math.isfinite(lon)`), raising `ValueError` otherwise.

### Item B — Atlas Catalogue Reference Semantics
- **Inspection:** All 37 catalog entries in `backend/app/catalog/atlas_catalog.py` were inspected.
- **Finding:** All entries with methodology DOIs (`PLN-DRV-04`, `PLN-VEC-03`, `PLN-SIM-01`, `PLN-SIM-02`) have `layer_id = None` and `validation_status = ValidationStatus.CATALOGUED`. `MapExplorerPage.tsx` strictly checks `entry.layer_id` before rendering layer toggles. No phantom layers or fake GeoTIFFs remain.

---

## 4. Minimal Staged Implementation Plan for M0.4.4

```
Stage 1: Backend Multi-Stop Routing & Metric Enrichment
  ├── 1.1 Add finite real number check to RouteOptimizationEngine.latlon_to_grid()
  ├── 1.2 Implement compute_multi_stop_route() and multi-stop compute_suite() in engine.py
  ├── 1.3 Add optional waypoints to routing API routes (/plan, /suite, /compare)
  └── 1.4 Add visited science targets metadata to RouteMetrics and RouteComparisonSummary

Stage 2: Frontend API & Multi-Stop Waypoint Integration
  ├── 2.1 Update frontend/src/api/routing.ts with optional waypoints parameter
  ├── 2.2 Wire queuedTargets from MissionContext into EVARoutePlannerPage calculation calls
  └── 2.3 Provide waypoint reordering and removal controls in EVARoutePlannerPage

Stage 3: Science-Aware Multi-Objective Comparison
  ├── 3.1 Display visited scientific targets and themes inside each comparison route card
  ├── 3.2 Distinguish traversal cost from scientific return in MultiObjectiveComparisonPanel
  └── 3.3 Add "Commit Route to Mission" action and dispatch

Stage 4: Mission Route Decision Persistence & Staleness Tracking
  ├── 4.1 Extend MissionEvaContext in mission.ts with selectedRouteDecision
  ├── 4.2 Add MISSION/SELECT_ROUTE reducer action
  ├── 4.3 Invalidate or mark decision as stale when baseCamp, destination, waypoints, or region change
  └── 4.4 Verify backward-compatible migration in missionStorage.ts and missionModel.ts

Stage 5: Verification & Automated Test Suite
  ├── 5.1 Add backend unit tests in tests/unit/test_routing.py (multi-stop, invalid/non-finite coords, staleness)
  ├── 5.2 Add frontend integration tests in tests/scienceGeologyDataHub.test.ts
  └── 5.3 Full regression run (npm test, oxlint, tsc, vite build, pytest, ruff)
```

---

## 5. Explicit List of Files Expected to Change

### Backend
- `backend/app/routing/engine.py` (Add finite coordinate validation and multi-stop route chaining)
- `backend/app/routing/models.py` (Add visited targets and scientific target count to `RouteMetrics`)
- `backend/app/services/route_comparison.py` (Support waypoints in `compare_routes()` and record visited targets)
- `backend/app/api/routes/routing.py` (Accept optional `waypoints` in Pydantic request models)
- `backend/tests/unit/test_routing.py` (Add multi-stop and direct-service validation tests)

### Frontend
- `frontend/src/api/routing.ts` (Update API client functions with optional waypoints)
- `frontend/src/types/mission.ts` (Add `MissionRouteDecision` and update `MissionEvaContext`)
- `frontend/src/mission/missionModel.ts` (Ensure default bundle and validation include route decision)
- `frontend/src/mission/missionReducer.ts` (Add `MISSION/SELECT_ROUTE` and staleness invalidation)
- `frontend/src/mission/missionStorage.ts` (Preserve route decision during load/save/migration)
- `frontend/src/pages/EVARoutePlannerPage.tsx` (Wire queued targets into route calculation & allow reordering)
- `frontend/src/components/MultiObjectiveComparisonPanel.tsx` (Display visited targets and route commit button)
- `frontend/tests/scienceGeologyDataHub.test.ts` (Add M0.4.4 targeted tests)

---

## 6. Stop Condition & Architectural Review

No architectural limitations prevent the safe, robust execution of M0.4.4 as scoped. The existing `GridGraph`, A* search, and `MissionPlanningService` provide proven mathematical baselines.

**Phase 0 is complete. No application source files were modified during this inspection.** Implementation will proceed through Stages 1–5 upon user review and approval.

