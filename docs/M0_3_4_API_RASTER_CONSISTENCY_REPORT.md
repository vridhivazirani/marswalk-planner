# MARSWALK — M0.3.4 API/Raster Consistency & Repository Integrity Report

**Milestone:** M0.3.4 — API/Raster Consistency and Repository Integrity Correction  
**Branch / HEAD:** `main` @ `dce6f69` (all changes remain uncommitted in the working tree)  
**Final Decision:** **`PASS`**

---

## 1. Executive Summary

M0.3.4 resolved all four outstanding defects identified in `docs/M0_3_3_INDEPENDENT_ACCEPTANCE_AUDIT.md`:

1. **11,148-Cell `/api/v1/hazards/inspect` Discrepancy Eliminated (`0` / `212,132` Disagreements):** Extracted coordinate-level hazard inspection into `backend/app/services/hazard_inspection.py` (`HazardInspectionService`) and integrated `jezero_western_delta_20m_hirise_hazard_obstacles.tif`, authoritative `hazard_hard_impassable.tif` fail-closed cross-checking, and complete restriction explanations while keeping `backend/app/api/routes/hazards.py` thin per `AGENTS.md` §4 (`api -> services -> domain -> core`). Full-grid evaluation across all `212,132` cells matches `jezero_western_delta_20m_hazard_hard_impassable.tif` with **0 disagreements** (`61,055` blocked, `151,077` passable), including row `0`, col `288` (`NATIVE_HIRISE_OBSTACLE`).
2. **Fail-Closed Missing-Evidence & Boundary Semantics Enforced:** Updated `compute_hazard_bundle()` (`backend/app/hazards/evaluator.py`) and `backend/app/hazards/uncertainty.py` so `-9999.0` or `NaN` in `boulder_score`, `sand_score`, or `crater_score` is never clipped to `0.0`, `source_id` checks strictly validate `{1, 2}` (so categorical `0` and NoData `255` never masquerade as valid sensors), missing authoritative inputs raise HTTP `503` (`AuthoritativeHazardInputMissingError`), and exact raster-edge coordinates fail closed as `OUT_OF_BOUNDS`.
3. **All 9 Upstream GeoTIFF `nodata=0.0` Collisions Corrected:** Regenerated the 20 m ARD product suite via `scripts/run_preprocessing.py --grid 20m`. Binary `uint8` masks (`hirise_hazard_obstacles.tif`, `hirise_coverage.tif`, `ctx_coverage.tif`) and categorical `source_id.tif` now declare `nodata=255.0` (preserving `0` unmasked under `masked=True`); continuous `float32` layers (`hirise_boulder_score.tif`, `boulder_hazard_score.tif`, `sand_hazard_score.tif`, `crater_hazard_score.tif`, `terrain_confidence.tif`) now declare `nodata=-9999.0`. Fixed `MultiResolutionTerrainInspector._query_regional_point` (`backend/app/terrain/multi_resolution.py`), which previously coerced `source_id == 0` / `None` to `1` (`CTX 20m`) via `or 1`.
4. **Repository Hygiene & Quality Gates Clean:** Stripped all 6 trailing EOF blank lines (`git diff --check` now exits `0`). Backend tests (`283 passed, 0 failed, 0 skipped`), `ruff check .`, `npm run lint` (`oxlint`), and `npm run build` (`tsc -b && vite build`) all exited `0`.

---

## 2. Root Cause & Remediation of the 11,148-Cell API/Raster Discrepancy

### 2.1 Root Cause

Before M0.3.4, `inspect_location_hazard()` in `backend/app/api/routes/hazards.py` evaluated single cells through `compute_hazard_bundle(...)` **without loading or passing `jezero_western_delta_20m_hirise_hazard_obstacles.tif`**. On all `11,148` HiRISE cells where 20 m resampled terrain had `slope < 25.0°` and `TRI < 8.0 m`, but native 1.0 m HiRISE DTM analysis detected micro-scarps, boulders ($\ge 0.50$), steep 1.0 m slopes ($\ge 25.0^\circ$), or local 1.0 m NoData pixels, `hazard_hard_impassable.tif` marked `1` (`NATIVE_HIRISE_OBSTACLE`) while `/api/v1/hazards/inspect` erroneously returned `is_passable: true`. In addition, the router only checked `SLOPE_GT_MAX`, `TRI_GT_MAX`, and `NO_DATA_UNKNOWN` when formatting explanations, and `HazardProfileDTO` omitted `forbid_resolution_uncertainty`.

### 2.2 Implemented Solution (`api -> services -> domain -> core`)

- **`backend/app/services/hazard_inspection.py` (new service):**
  - `HazardInspectionService.inspect_coordinate(lat, lon)` performs 1×1 windowed GeoTIFF reads across `elevation`, `slope_deg`, `tri_roughness_m`, `boulder_hazard_score`, `sand_hazard_score`, `crater_hazard_score`, `source_id`, `uncertainty_sigma_z`, `hirise_hazard_obstacles`, and authoritative `hazard_hard_impassable`.
  - Evaluates the cell through `compute_hazard_bundle(..., hirise_obstacle_mask=..., sigma_z=...)` using the identical validity definition as `HazardIntelligenceEngine.run_hazard_analysis()`, then fail-closed reconciles against `hazard_hard_impassable.tif`.
  - Raises `HazardRastersNotFoundError` (HTTP `404`) when base rasters are absent and `AuthoritativeHazardInputMissingError` (HTTP `503`) if any required authoritative hazard layer (such as `hirise_hazard_obstacles.tif`) is missing.
  - Emits explanations for every authoritative code (`NO_DATA_UNKNOWN`, `CTX_SLOPE_GT_MAX`, `SLOPE_GT_MAX`, `CTX_TRI_GT_MAX`, `TRI_GT_MAX`, `NATIVE_HIRISE_OBSTACLE`, `UNRESOLVED_RESOLUTION_HAZARD`) and exposes synchronized fields `hard_restriction_codes` and `hazard_classification` alongside backward-compatible keys.
- **`backend/app/hazards/evaluator.py` & `backend/app/hazards/pipeline.py` & `backend/app/hazards/uncertainty.py`:**
  - Enforced finite non-NoData checks on `slope`/`tri` and guarded CV scores (`boulder_score`, `sand_score`, `crater_score`) with `_safe_score()` so `-9999.0` or `NaN` evidence fails closed to `1.0` instead of being clipped to `0.0`.
  - Distinguished `hirise_obstacle_mask == 255` (`NO_DATA_UNKNOWN`, impassable) from native hits (`0 < mask < 255`, `NATIVE_HIRISE_OBSTACLE`) on HiRISE cells (`source_id == 2`).
  - Restricted `valid_src` checks in `evaluator.py`, `pipeline.py`, and `uncertainty.py` strictly to `{1, 2}` (`_valid_source_mask`), ensuring `0` (UNMAPPED) and `255` (NoData) both fail closed as `UNKNOWN`.
- **`backend/app/api/routes/hazards.py` & `frontend/src/api/hazards.ts`:**
  - Simplified `inspect_location_hazard()` to delegate to `HazardInspectionService(processed_dir=PROCESSED_DIR)`.
  - Added `forbid_resolution_uncertainty: bool = True` to `HazardProfileDTO`.
  - Added optional `hard_restriction_codes?: string[]` and `hazard_classification?: string` to `LocationHazardInspection` in `frontend/src/api/hazards.ts`.

---

## 3. Exhaustive Parity Verification Results

Verified in `backend/tests/integration/test_api_raster_parity.py` and directly against live FastAPI on port `8000`:

| Check Scope | Count / Sample | Result | Notes |
|---|---|---|---|
| **Full-Grid Fusion vs `hazard_hard_impassable.tif`** | `212,132 / 212,132` (`586 × 362`) | **`0` discrepancies** | `61,055` blocked, `151,077` passable (`11,148` native-1 m-only). |
| **Row `0`, Col `288` (`18.589359°N, 77.441042°E`)** | Exact pixel | **`is_passable=false`** | `hard_restriction_code: "NATIVE_HIRISE_OBSTACLE"`, `hazard_classification: "RESTRICTED"`. Verified via `TestClient` and live `127.0.0.1:8000`. |
| **Passable HiRISE Cells (`source_id=2`, `blocked=0`)** | 15 stratified samples | **PASS** | `is_passable=true`, `hard_restriction_code=null`, `hazard_classification="PASSABLE"`. |
| **Native-1 m-Only Blocked HiRISE (`slope<25, tri<8`)** | 15 stratified samples | **PASS** | `is_passable=false`, `NATIVE_HIRISE_OBSTACLE` in code and explanation. |
| **Macro Slope/TRI Blocked HiRISE (`slope>=25` or `tri>=8`)** | 15 stratified samples | **PASS** | `is_passable=false`, `SLOPE_GT_MAX` or `TRI_GT_MAX` present. |
| **CTX-Only Resolution Uncertainty (`source_id=1`)** | 15 stratified samples | **PASS** | `is_passable=false`, `UNRESOLVED_RESOLUTION_HAZARD` / `CTX_SLOPE_GT_MAX` / `CTX_TRI_GT_MAX`. |
| **Out-of-Bounds & Footprint Right/Bottom Edge** | Exact boundary + `(0.0, 0.0)` | **PASS** | `status="OUT_OF_BOUNDS"`, `is_passable=false`. |
| **Synthetic Fail-Closed Grid (`tmp_path`)** | 4 synthetic cases + missing mask | **PASS** | `source_id=0` -> `UNKNOWN_IMPASSABLE`; `boulder=-9999.0` -> `h_boulder=1.0` & `optical_imagery_reliability=0.0`; `hirise_obs=255` -> `NO_DATA_UNKNOWN`; missing `hirise_hazard_obstacles.tif` -> HTTP `503`. |

---

## 4. Upstream GeoTIFF NoData Corrections (`9 / 9` Resolved)

Regenerated via `scripts/run_preprocessing.py --grid 20m` (zero warnings) and verified with direct `rasterio.open(...).read(1, masked=True)` inspection and `backend/tests/unit/test_raster_nodata_semantics.py`:

| GeoTIFF (`data/processed/jezero_western_delta_20m_*.tif`) | Previous `nodata` | Fixed `dtype` / `nodata` | Observed `raw == 0` Pixels | Observed `masked=True` Count | Valid Range (Unmasked) | Producer Module (`Sole Owner`) |
|---|---|---|---|---|---|---|
| `hirise_hazard_obstacles.tif` | `0.0` (`uint8`) | **`uint8` / `255.0`** | `151,078` | **`0`** | `[0.0, 1.0]` | `NativeResolutionHazardPipeline` |
| `hirise_coverage.tif` | `0.0` (`uint8`) | **`uint8` / `255.0`** | `49,139` | **`0`** | `[0.0, 1.0]` | `PreprocessingPipeline` |
| `ctx_coverage.tif` | `0.0` (`uint8`) | **`uint8` / `255.0`** | `0` | **`0`** | `[1.0, 1.0]` | `PreprocessingPipeline` |
| `source_id.tif` | `0.0` (`uint8`) | **`uint8` / `255.0`** (`0`=Unknown) | `0` | **`0`** | `[1.0, 2.0]` | `PreprocessingPipeline` |
| `hirise_boulder_score.tif` | `0.0` (`float32`) | **`float32` / `-9999.0`** | `0` | **`49,139`** | `[0.00164, 1.0]` | `NativeResolutionHazardPipeline` |
| `boulder_hazard_score.tif` | `0.0` (`float32`) | **`float32` / `-9999.0`** | `0` | **`0`** | `[0.00552, 1.0]` | `TerrainIntelligenceEngine` |
| `sand_hazard_score.tif` | `0.0` (`float32`) | **`float32` / `-9999.0`** | `1,791` | **`0`** | `[0.0, 0.95916]` | `TerrainIntelligenceEngine` |
| `crater_hazard_score.tif` | `0.0` (`float32`) | **`float32` / `-9999.0`** | `0` | **`0`** | `[0.00022, 1.0]` | `TerrainIntelligenceEngine` |
| `terrain_confidence.tif` | `0.0` (`float32`) | **`float32` / `-9999.0`** | `0` | **`0`** | `[0.59500, 0.95000]` | `TerrainIntelligenceEngine` |

- **Categorical `source_id.tif` Safeguard:** Keeping `nodata=255` leaves `0` (`UNMAPPED / UNKNOWN`) unmasked under `masked=True` reads while reserving `255` for structural NoData. In `backend/app/terrain/multi_resolution.py#L172`, replaced `int(... or 1)` with explicit `1`/`2` validation so `source_id == 0` / missing data reports `"Unmapped / Unknown"` (`confidence_score=None` if missing) instead of coercing unknown terrain to `"CTX 20m (native)"` (`0.70`). Updated `backend/tests/unit/test_preprocessing.py#L97` (`assert s.nodata == 255`) and `docs/data_sources.md` accordingly.

---

## 5. Repository Hygiene & Working-Tree Inventory

### 5.1 Whitespace Fix (`git diff --check`)

Removed 6 trailing EOF blank lines in `backend/app/geospatial/grid.py`, `backend/app/geospatial/pipeline.py`, `backend/tests/unit/test_routing.py`, `backend/tests/unit/test_terrain.py`, `backend/tests/unit/test_twin.py`, and `docs/data_sources.md`. Re-running `git diff --check` exited **`0`** with zero output.

### 5.2 Working-Tree Classification (`54` non-ignored paths on `main` @ `dce6f69`, `0` staged)

No prior work was reset, stashed, committed, or pushed. Existing uncommitted changes remain cleanly categorized by milestone:

- **M0.3.4 (This Correction):** `backend/app/services/hazard_inspection.py` *(new)*, `backend/app/api/routes/hazards.py`, `backend/app/hazards/{evaluator,pipeline,uncertainty}.py`, `backend/app/geospatial/pipeline.py`, `backend/app/terrain/{engine,multi_resolution,native_hazards}.py`, `backend/tests/integration/test_api_raster_parity.py` *(new)*, `backend/tests/unit/{test_preprocessing,test_raster_nodata_semantics}.py`, `frontend/src/api/hazards.ts`, `docs/data_sources.md`, `docs/M0_3_4_API_RASTER_CONSISTENCY_REPORT.md` *(new)*, and regenerated `data/catalog/jezero_western_delta_20m_*.json`.
- **M0.3 / M0.3.2 / M0.3.3 (Uncertainty Model & Scientific Validity):** `backend/app/hazards/uncertainty.py`, `backend/app/hazards/config.py`, `backend/app/routing/{engine,models}.py`, `backend/app/api/routes/{costmap,routing,twin}.py`, `backend/app/costmap/{evaluator,pipeline}.py`, `frontend/src/api/{reports,routing}.ts`, `frontend/src/components/MultiObjectiveComparisonPanel.tsx`, `frontend/src/pages/{EVARoutePlannerPage,HazardAssessmentPage}.tsx`, `backend/tests/unit/test_uncertainty_propagation.py`, `docs/M0_3_2_SCIENTIFIC_VALIDITY_CORRECTION_REPORT.md`, `docs/M0_3_3_INDEPENDENT_ACCEPTANCE_AUDIT.md`.
- **M0.2 / M0.2.1 / M0.2.1.1 (Native 1 m Hazards, Routing, Geodesy):** `backend/app/terrain/{derivatives,native_hazards}.py`, `backend/app/geospatial/grid.py`, `backend/app/routing/{graph,search}.py`, `backend/app/services/route_comparison.py`, `backend/app/api/routes/mission.py`, `scripts/run_preprocessing.py`, `backend/tests/unit/{test_native_hazards,test_routing,test_terrain,test_twin}.py`, `backend/tests/integration/test_authoritative_hazard_pipeline.py`, `docs/route_comparison.md`, `docs/audits/`.
- **M0.1 (CORS Security & WebGL Globe):** `backend/app/core/config.py`, `backend/app/main.py`, `backend/tests/integration/test_cors_security.py`, `frontend/src/components/GlobalMarsGlobe3D.tsx`.

---

## 6. Verification Gate Results

All checks below ran **after all code, raster, and documentation edits (prior to creating this report)**:

| Check | Exact Command | Observed Output Summary | Exit Code |
|---|---|---|---|
| **Preprocessing Pipeline** | `backend/.venv/bin/python -W default scripts/run_preprocessing.py --grid 20m` | 5 stages completed cleanly, `0` warnings, `61,055` impassable cells (`28.78%`) | **`0`** |
| **Backend Pytest Suite** | `cd backend && .venv/bin/pytest -v` | **`283 passed` in `144.43s (0:02:24)`**, `0` failed, `0` skipped | **`0`** |
| **Backend Ruff Lint** | `cd backend && .venv/bin/ruff check .` | `All checks passed!` | **`0`** |
| **Frontend Oxlint** | `cd frontend && npm run lint` | `Found 0 warnings and 0 errors.` (`47` files, `116` rules, `478ms`) | **`0`** |
| **Frontend TypeScript + Build** | `cd frontend && npm run build` | `tsc -b && vite build` clean in `308ms` (`dist/` generated) | **`0`** |
| **Git Whitespace Check** | `git diff --check` | Clean (no output) | **`0`** |
| **Live Port `8000` Smoke Check** | `curl -s "http://127.0.0.1:8000/api/v1/hazards/inspect?lat=18.58935924182655&lon=77.44104218405448"` | `False NATIVE_HIRISE_OBSTACLE RESTRICTED` with native 1.0 m explanation | **`0`** |

---

## 7. Remaining Limitations & Readiness for M0.4

- Large raster outputs in `data/processed/` remain `.gitignore`-excluded per project data policy.
- Uncommitted M0.1–M0.3.4 changes remain grouped in the working tree awaiting project-owner commit organization before beginning M0.4.
- M0.3.4 objectives are complete; the codebase passes every architecture, scientific consistency, NoData semantic, lint, build, and parity check cleanly.

