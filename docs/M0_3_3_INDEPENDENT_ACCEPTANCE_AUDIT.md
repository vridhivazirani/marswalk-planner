# MARSWALK — M0.3.3 INDEPENDENT SCIENTIFIC ACCEPTANCE AUDIT

**Audit Date:** 2026-11-13  
**Project:** Marswalk Planner (Research & Educational Decision-Support Prototype — NOT NASA Software)  
**Scope:** Independent Read-Only Verification of M0.3.2 Corrections Against Original M0.3.1 Findings (`M031-F01`–`M031-F12`), GeoTIFF Semantics, API/Raster Parity, ERI Calibration Bounds, Route Metric Invariance, Provenance/Epistemic Integrity, Frontend Rendering, and Repo Hygiene  
**Audit Method:** Direct inspection of source files, GeoTIFF/PNG files via `rasterio`/`numpy`, catalog JSONs, live FastAPI HTTP queries (`http://127.0.0.1:8000`), `git diff` inspection, test suite execution (`pytest`, `ruff`, `oxlint`, `tsc -b`, `vite build`, `git diff --check`), and attempted Chrome DevTools browser inspection. No application code, rasters, catalogs, or configs were modified during this audit.

---

## Executive Disposition: **CONDITIONAL PASS**

All **12** original M0.3.1 scientific validity findings (`M031-F01` through `M031-F12`) have been substantiated as fixed in the underlying Python domain/pipeline modules, processed GeoTIFFs, catalog metadata, FastAPI payloads, and frontend TypeScript/React code. The M0.2.1 authoritative hard-obstacle baseline (**61,055** blocked / **151,077** passable cells out of **212,132** grid cells) is preserved intact, float32 NoData is standardized to **`-9999.0`** with zero legacy `999.0` sentinel leakage, `pytest` passes **269/269** tests (`ruff`, `oxlint`, and `vite build` exit `0`).

However, an unconditional `PASS` is withheld and issued as a **CONDITIONAL PASS** due to four verified conditions documented below:
1. **Unverified Live Browser DOM Execution:** Automated Chrome DevTools verification could not connect (`DevToolsActivePort` missing / remote debugging inactive). Frontend fixes were verified in source code, strict TypeScript build, `oxlint`, and live backend HTTP JSON/PNG responses, leaving live interactive browser DOM smoke-testing open.
2. **`M0_3_2` Report Renumbering & Overstatement:** `docs/M0_3_2_SCIENTIFIC_VALIDITY_CORRECTION_REPORT.md` renumbered/permuted multiple `M031-F01`–`F12` finding IDs relative to the verbatim M0.3.1 audit table and did not surface an inherited `/hazards/inspect` passability parity gap.
3. **Inherited `/api/v1/hazards/inspect` Native-Obstacle Parity Gap:** While all M0.3 uncertainty fields match the processed rasters verbatim, `inspect_location_hazard` (`backend/app/api/routes/hazards.py`) invokes `compute_hazard_bundle(...)` without passing `jezero_western_delta_20m_hirise_hazard_obstacles.tif`. Consequently, **11,148** native-1m-only blocked cells (e.g., row `0`, col `288`) report `is_passable=True` in `/hazards/inspect` even though `jezero_western_delta_20m_hazard_hard_impassable.tif` encodes `1`.
4. **Repository Hygiene & Remaining Non-M0.3 Upstream `nodata=0.0` Rasters:** `git diff --check` fails (`exit 2`, 6 trailing EOF blank lines), 38 tracked files and 7 untracked paths mix uncommitted M0.1/M0.2/M0.2.1/M0.3/M0.3.2 work, and 9 pre-existing non-M0.3 GeoTIFFs still declare `nodata=0.0`.

---

## 1. Original M0.3.1 Findings Verification Matrix (`M031-F01`–`M031-F12`)

Every ID below follows the **exact verbatim numbering** from the M0.3.1 Scientific Validity Audit. Renumbering errors inside `docs/M0_3_2_SCIENTIFIC_VALIDITY_CORRECTION_REPORT.md` are explicitly flagged.

| Original M0.3.1 ID | Original M0.3.1 Defect (Verbatim Scope) | M0.3.2 Report Mapping Error | Current Implementation & Exact Location | Independent Verification Method & Test Evidence | Remaining Limitation | Independent Status |
|---|---|---|---|---|---|---|
| **M031-F01** *(CRITICAL)* | False resolution provenance: `heur_conf=0.85` assigned on HiRISE (`source_id==2`), falsely implying 0.25 m HiRISE optical CV detection when CV scores consume 20 m warped CTX ortho. | Mislabelled as **F04** in M0.3.2 report (`F01` in M0.3.2 report was rewritten to describe uncalibrated constants). | `compute_optical_imagery_reliability` (`backend/app/hazards/uncertainty.py#L153-L188`) defaults `R_opt = 0.40` across all mapped cells (including `source_id==2`) unless explicit native `imagery_source_id == 2` is supplied. Pipeline & terrain catalogs document `JEZ_ctx_B_soc_008_orthoMosaic_6m.tif` (`10.5066/P9GV1ND3`). | Direct inspection of `uncertainty.py#L153-L188`, `hazard_intelligence.json#L183-L190`, `terrain_intelligence.json#L4-L17`; live API `/hazards/inspect` returned `optical_imagery_reliability: 0.4` & `"CTX Orthomosaic (6.0 m/px resampled to 20.0 m/px)"`; `test_14_optical_cv_provenance_and_epistemic_labels` (`PASSED`). | Heuristic index `0.40` (and `0.85` placeholder if future HiRISE ORI supplied) remains expert-assigned ordinal weight, not empirically calibrated precision/recall. | **FIXED AND VERIFIED** |
| **M031-F02** *(CRITICAL)* | Discontinuous severity-coupled detection formula (`0.15`/`0.20`/`0.30` threshold jumps at `1e-4` & steepness dependency) and GeoTIFF vs `/hazards/inspect` formula mismatch (`0.8000` vs `0.5500`). | Kept as **F02**. | Replaced with hazard-invariant `ERI = 0.50*R_geom + 0.25*R_opt + 0.25*R_res` in `compute_detection_confidence` (`backend/app/hazards/uncertainty.py#L225-L283`); `build_cell_uncertainty_profile` (`uncertainty.py#L371-L505`) delegates directly to `evaluate_uncertainty_bundle`. | Analytic sweep across `boulder=[0.0, 0.2999, 0.3001, 0.8999, 1.0]` and `slope=[0.0..40.0]` yielded invariant `0.8125`; live raster vs `/inspect` parity verified on HiRISE `(4, 262)` (`0.8125 == 0.8125`) and CTX `(0, 50)` (`0.5375 == 0.5375`); `test_12`, `test_13` (`PASSED`). | Non-uncertainty `/hazards/inspect` call omits `hirise_obstacle_mask` (see §3 finding on `11,148` cells); `R_geom`/`R_opt`/`R_res` weights are unweighted empirical judgment. | **FIXED AND VERIFIED** *(uncertainty parity)* |
| **M031-F03** *(CRITICAL)* | `999.0` NoData leakage on `uncertainty_sigma_z.tif` / `hazard_spatial_uncertainty_m.tif` and `0.0` NoData collision on confidence TIFs. | Kept as **F03**. | `STANDARD_NODATA_FLOAT = -9999.0` enforced in `PreprocessingPipeline.process_elevation_and_coverage` (`geospatial/pipeline.py#L191-L258`), `uncertainty.py#L30,L122-L356`, `hazards/evaluator.py`, `hazards/pipeline.py#L135-L199` (`nodata=255` for uint8 masks; `-9999.0` for float32); `normalize_uncertainty` (`costmap/evaluator.py#L49-L72`) maps `-9999.0`, `999.0`, `NaN` to `1.0`. | Rasterio scan across all M0.3 float32 GeoTIFFs confirmed `nodata=-9999.0`, `n_999=0`, and uint8 binary masks have `nodata=255.0`; costmap verification confirmed `NaN`, `-9999.0`, and `999.0` map to `1.0` (`cost=4.60`); `test_11`, `test_15` (`PASSED`). | 9 upstream non-M0.3 rasters (e.g., `hirise_hazard_obstacles.tif`, `source_id.tif`, CV hazard score TIFs) still have `nodata=0.0` metadata and must not be read in masked mode. | **FIXED AND VERIFIED** *(M0.3 & binary constraint masks)* |
| **M031-F04** *(HIGH)* | Frontend JS truthiness (`? ... : '95%'` / `'88%'`) rendering valid `0.0` confidence or `null` unmapped values as optimistic `95%`/`88%`. | Moved into **F11** in M0.3.2 report. | Explicit `val !== null && val !== undefined` guards and `'N/A (UNMAPPED)'` / `'N/A'` fallbacks in `HazardAssessmentPage.tsx#L279-L350`, `EVARoutePlannerPage.tsx#L314-L370`, `MultiObjectiveComparisonPanel.tsx#L291-L311`, `reports.ts#L54`. | Source read + `oxlint` (`0` errors) + `tsc -b && vite build` (`exit 0`). Synthetic `(0,0)` zero-evidence cell returns `0.0`, `(0,1)` unmapped returns `null`. | Live Chrome DevTools DOM execution failed (`DevToolsActivePort ENOENT`), so interactive UI behavior on `0.0`/`null` was not verified in a running browser. | **FIXED IN SOURCE — LIVE BROWSER UNVERIFIED** |
| **M031-F05** *(HIGH)* | Unsubstantiated `0.20 m` / `2.00 m` vertical precision displayed as physical `±` calibrated 1σ error bars. | Kept as **F05**. | Marked `PROVISIONAL_UNVERIFIED_NOMINAL_TIER` in `geospatial/pipeline.py`, `uncertainty.py#L31-L32`, `hazard_intelligence.json`, `provenance.json#L63-L75`, `costmap_catalog.json`, API responses, `HazardAssessmentPage.tsx`, `EVARoutePlannerPage.tsx`, `reports.ts`. Unquantified error sources listed explicitly. | Codebase-wide `grep -rnE "±0\.|±2\.|±\{"` across `backend/app`, `frontend/src`, `docs/data_sources.md`, `docs/route_comparison.md` returned **0 matches**; live `/inspect` & `provenance.json` checked. | Values `0.20 m` and `2.00 m` remain unverified nominal relative tiers without Mars areoid or 1 m→20 m resampling error budgets. | **FIXED AND VERIFIED** |
| **M031-F06** *(HIGH)* | Uncalibrated implementation constants named `*_confidence` / rendered as `%` + `bundle.confidence = 0.80` divergence from `0.70` CTX `data_confidence`. | Split across **F01** and **F07** in M0.3.2 report. | Relabeled as uncalibrated `[0–1]` ordinal indices (`data_reliability_index`, `detection_reliability_index`, `mean_data_reliability_index`, `mean_detection_reliability_index`) in `uncertainty.py`, `hazards.py`, `models.py`, catalogs, docs, and UI. Legacy `confidence` equals `data_reliability_index` with `legacy_confidence_deprecated: True` (no `0.80` divergence). | Direct read of `hazards.py#L223-L240`, `hazards/evaluator.py#L190-L220`, live `/inspect` (`data_reliability_index=0.95`, `confidence=0.95`, `legacy_confidence_deprecated=True`); UI shows `[0–1]` and `"Uncalibrated"`. | Legacy JSON keys (`data_confidence`, `confidence`) retained for backward compatibility; scalar indices remain expert-assigned heuristics. | **FIXED AND VERIFIED** |
| **M031-F07** *(HIGH)* | Epistemic collapse (`DERIVED`/`INTERPRETED` single tags), tagging `h_boulder`, confidence layers, `spatial_uncertainty_m`, and `c_uncertainty` incorrectly as `DERIVED`. | Moved to **F06** in M0.3.2 report. | Added `property_epistemic_classes` in `uncertainty.py` & `/inspect`; updated `hazard_intelligence.json`, `costmap_catalog.json`, `native_hazards_catalog.json`, and `/api/v1/twin/layers` (`twin.py#L160-L202`): geometry `DERIVED`, CV/reliability/nominal precision/uncertainty cost `HEURISTIC`, `resolution_uncertainty` `DERIVED`, unmapped `UNKNOWN`. | Direct inspection of all 4 JSON catalogs, live `/api/v1/twin/layers`, live `/hazards/inspect`, and `test_14` (`PASSED`). | `overall_score` and `hard_impassable` combine `DERIVED` geometry with `HEURISTIC` CV/thresholds, so they are conservatively tagged `HEURISTIC` at summary level. | **FIXED AND VERIFIED** |
| **M031-F08** *(HIGH)* | Hardcoded fake/stale product IDs (`DTEEC_045994_1985_045282_1985_A01`, `TRN_CTX_Jezero_20m`) in `hazards/pipeline.py` and omission of `10.5066/P9GV1ND3`. | Moved into **F04** in M0.3.2 report. | `HazardIntelligenceEngine` (`hazards/pipeline.py#L246-L255, L366-L391`) dynamically reads `jezero_western_delta_20m_provenance.json` & `native_hazards_catalog.json` and records all 3 USGS/PDS DOIs (`10.5066/P9REJ9JN`, `10.5066/P906QQT8`, `10.5066/P9GV1ND3`). | Codebase grep for `DTEEC_045994` and `TRN_CTX_Jezero` returned **0 matches**; `provenance.json` and `hazard_intelligence.json` verified directly on disk; `test_14` (`PASSED`). | `cv_optical_imagery_input` metadata inside `hazards/pipeline.py#L370-L380` still hardcodes the `JEZ_ctx_B_soc_008_orthoMosaic_6m.tif` filename/DOI rather than reading it from `terrain_intelligence.json`. | **FIXED AND VERIFIED** |
| **M031-F09** *(MEDIUM)* | Unweighted `n_wp` waypoint averaging causing simplification bias + asymmetric boundary attribution & `resolution_uncertainty_distance_m` / `fraction` mismatch. | Split across **F08** & **F09** in M0.3.2 report. | Trapezoidal arc-length integration and symmetric `0.5 * step_dist` boundary attribution in `RouteOptimizationEngine.compute_route` (`routing/engine.py#L255-L435`); `res_unc_frac = min(1.0, res_unc_dist_m / cum_dist)`. | 2x duplicated waypoints check produced `0.000000` delta across all means; synthetic mixed HiRISE↔CTX route verified `res_unc_dist / total_distance == res_unc_frac` to 6 decimals; `test_16` (`PASSED`). | Route `simplify=True` can alter geometric path (LOS chords across slightly different cells), causing tiny geometric delta (`Δmean_haz=0.000417` on real route); not a metric-weighting bug. | **FIXED AND VERIFIED** |
| **M031-F10** *(MEDIUM)* | Mutually exclusive `terrain_characterization` dropping `OBSERVED_HAZARDOUS` + absent upper-tail `max`/`p95` precision & route comparison reliability synthesis. | Kept as **F10**. | Separated `hazard_classification` (`LOW`/`MODERATE`/`ELEVATED`) and `observation_reliability_tier`, added `LOWER_RESOLUTION_HAZARDOUS` (`routing/engine.py#L437-L465`), added `max_uncertainty_m` & `p95_uncertainty_m` (`models.py`), and exposed them in `RouteComparisonService` (`services/route_comparison.py`). | Verified on synthetic CTX-only hazardous route (`terrain_characterization=LOWER_RESOLUTION_HAZARDOUS`, `hazard_classification=ELEVATED`, `max=2.0`, `p95=2.0`) and live `/api/v1/routing/compare`; `test_16`, `test_17` (`PASSED`). | Mean hazard thresholds (`0.20`, `0.40`) for `LOW`/`MODERATE`/`ELEVATED` are prototype heuristic cutoffs. | **FIXED AND VERIFIED** |
| **M031-F11** *(MEDIUM)* | `_generate_confidence_qc` painted median `0.4770` CTX pixels in NoData Dark Slate `<0.5` and legend text mismatched colors (`Green`/`Orange`). | Merged with UI fixes into **F11** in M0.3.2 report. | `_generate_confidence_qc` (`hazards/pipeline.py#L449-L512`) reserves Dark Slate `(15, 23, 42)` strictly for `is_nodata`, bands `[0,0.45)` Crimson, `[0.45,0.70)` Amber, `[0.70,0.90)` Sky Teal, `[0.90,1.0]` Cyan; `_generate_spatial_qc` reserves Magenta `(255,0,220)` for NoData; matched in `HazardAssessmentPage.tsx#L209-L214`. | On-disk QC PNG inspection verified `qc_detection_confidence.png` paints 162,993 HiRISE cells Sky Teal `(56,189,248)` & 49,139 CTX cells Amber `(245,158,11)`, and `qc_data_confidence.png` paints Cyan `(34,211,238)` & Sky Teal `(56,189,248)`; `test_15` (`PASSED`). | `twin.py#L167` layer description still loosely reads `"Sky/Amber = CTX 20m tier (0.70)"` for `data_confidence` (actual `0.70` falls in Sky Teal `[0.70, 0.90)`). | **FIXED AND VERIFIED** |
| **M031-F12** *(LOW)* | CTX DTM `"6m resampled to 20m"` docstring error, `/inspect` `sigma_val=2.0` fallback on `source_id=0`, and optimistic `0.95`/`0.85` defaults on `RouteMetrics`/`PathWaypoint`. | Replaced in M0.3.2 report **F12** with `NotGeoreferencedWarning` fix. | Verified actual fixes present: `uncertainty.py#L138` says `"CTX 20m native regional stereo DTM"`, grep confirms zero `"6m resampled"` hits; `hazards.py#L143-L147` sets `sigma_val = STANDARD_NODATA_FLOAT` when `source_id == 0`; `models.py#L29-L65` defaults `None`/`"UNKNOWN"`. Plus `from_origin(0, h, 1, 1)` added to QC PNGs (`NotGeoreferencedWarning` fixed). | Direct inspection of `uncertainty.py#L138`, `hazards.py#L143-L147`, `models.py#L29-L65`; synthetic unmapped `(0,1)`/`(0,2)` `/inspect` returned `null` metrics & `UNKNOWN`; grep returned zero `"6m resampled"`; PNG transforms verified non-identity (`transform_is_identity=False`). | `M0_3_2` report omitted documenting the actual M031-F12 fixes under F12. | **FIXED AND VERIFIED** |

---

## 2. GeoTIFF NoData Metadata & Raster Semantics Audit (`data/processed/jezero_western_delta_20m_*.tif`)

All authoritative grid rasters share shape `(586, 362)` (`212,132` total cells), CRS `ESRI:103885`, and `20.0 m × 20.0 m` pixels (`transform=(20.0, 0.0, 4584524.3513494255, 0.0, -20.0, 1101888.646211346)`).

### 2.1 M0.3, Authoritative Hazard, Elevation & Costmap Rasters

| Raster Product | `dtype` | `nodata` Metadata | Observed Min / Max (Valid) | Valid Zero Count | Raw NoData Pixel Count | Masked Count (`masked=True`) | `999.0` Count | Assessment |
|---|---:|---:|---|---:|---:|---:|---:|---|
| `elevation.tif` | `float32` | `-9999.0` | `-2598.9443` / `-2240.4668` | `0` | `0` | `0` | `0` | **CLEAN** |
| `uncertainty_sigma_z.tif` | `float32` | `-9999.0` | `0.2` / `2.0` | `0` | `0` | `0` | `0` | **CLEAN** |
| `hazard_data_confidence.tif` | `float32` | `-9999.0` | `0.7` / `0.95` | `0` | `0` | `0` | `0` | **CLEAN** |
| `hazard_detection_confidence.tif` | `float32` | `-9999.0` | `0.5375` / `0.8125` | `0` | `0` | `0` | `0` | **CLEAN** |
| `hazard_spatial_uncertainty_m.tif` | `float32` | `-9999.0` | `0.2` / `2.0` | `0` | `0` | `0` | `0` | **CLEAN** |
| `hazard_overall_score.tif` | `float32` | `-9999.0` | `0.083698` / `1.0` | `0` | `0` | `0` | `0` | **CLEAN** |
| `hazard_hard_impassable.tif` | `uint8` | `255.0` | `0` / `1` (`61,055` ones) | `151,077` | `0` | `0` | N/A | **CLEAN** (`0` distinct from `255`) |
| `hazard_resolution_uncertainty.tif` | `uint8` | `255.0` | `0` / `1` (`49,139` ones) | `162,993` | `0` | `0` | N/A | **CLEAN** |
| `hazard_unknown_mask.tif` | `uint8` | `255.0` | `0` / `0` | `212,132` | `0` | `0` | N/A | **CLEAN** |
| `costmap_balanced.tif` | `float32` | `1000000.0` | `2.910852` / `6.962966` | `0` | `61,055` | `61,055` | `0` | **CLEAN** (`1e6` == blocked/NoData) |
| `costmap_safety-first.tif` | `float32` | `1000000.0` | `2.910852` / `6.962966` | `0` | `61,055` | `61,055` | `0` | **CLEAN** |
| `costmap_science-first.tif` | `float32` | `1000000.0` | `2.910852` / `6.962966` | `0` | `61,055` | `61,055` | `0` | **CLEAN** |
| `costmap_custom.tif` | `float32` | `1000000.0` | `2.638893` / `7.474032` | `0` | `61,055` | `61,055` | `0` | **CLEAN** |

### 2.2 Residual Non-M0.3 Upstream Rasters Still Carrying `nodata=0.0`

Independent inspection confirmed 9 upstream GeoTIFFs generated by `PreprocessingPipeline`, `TerrainIntelligenceEngine`, and `NativeResolutionHazardPipeline` still declare `nodata=0.0`, which causes `rasterio.open(...).read(1, masked=True)` to mask valid zero-valued pixels:

- `hirise_hazard_obstacles.tif` (`uint8`, `nodata=0.0`, `masked=151,078`)
- `hirise_boulder_score.tif` (`float32`, `nodata=0.0`, `masked=49,139`)
- `boulder_hazard_score.tif`, `crater_hazard_score.tif`, `terrain_confidence.tif` (`float32`, `nodata=0.0`)
- `sand_hazard_score.tif` (`float32`, `nodata=0.0`, `raw_nodata=1,791`, `masked=1,791`)
- `hirise_coverage.tif` (`uint8`, `nodata=0.0`, `raw_nodata=49,139`), `ctx_coverage.tif` (`uint8`, `nodata=0.0`), `source_id.tif` (`uint8`, `nodata=0.0`)

**Reader Audit:** Direct inspection of `HazardIntelligenceEngine.run_hazard_analysis` (`hazards/pipeline.py#L69-L111`), `CostmapEngine.evaluate_costmap` (`costmap/pipeline.py#L84-L99`), and `RouteOptimizationEngine._ensure_data_loaded` (`routing/engine.py#L79-L133`) confirms all runtime consumers currently call unmasked `src.read(1)` (never `masked=True`) and derive coverage from `elevation != -9999.0` and `source_id > 0`. Thus valid zero hazard/obstacle cells are not silently dropped today, **but any future reader enabling `masked=True` on these 9 upstream files would break**.

### 2.3 Routing Fail-Closed Blocking Verification

Direct checks on `compute_unified_costmap` (`costmap/evaluator.py#L99-L129`), `GridGraph` (`routing/graph.py`), and `RouteOptimizationEngine`:
- Missing coverage (`data_coverage_mask=False`) forces `unknown_mask=True`, `hard_blocked_mask=True`, `combined_cost=np.inf`.
- `normalize_uncertainty` maps `np.nan`, `-9999.0`, and `999.0` equally to `c_uncertainty = 1.0` (verified `combined_cost = 4.60` vs baseline).
- Raw `np.nan` in `hazard_score` yields `np.nan` in `combined_cost`; `GridGraph` explicitly rejects `NaN` (`"Cost raster contains unhandled NaN values."`), `-inf` (`"Cost raster contains negative infinity."`), and sub-admissible `< 1.0` costs (`"Traversable cost values must be >= 1.0..."`) with `ValueError`.
- Under the active authoritative mask (`forbid_resolution_uncertainty=True`), `np.count_nonzero(eng._res_unc & ~eng._hard_imp) == 0`: **zero** CTX-only cells remain passable in routing.

---

## 3. Raster-to-API Parity & Edge-Case Verification

| Test Case | GeoTIFF Values on Disk | Live `/api/v1/hazards/inspect` Payload | Match? |
|---|---|---|---|
| **Real HiRISE cell `(4, 262)`** (`18.4485°N` region check) | `data=0.9500`, `det=0.8125`, `sigma=0.20`, `hard_impassable=0` | `data_reliability_index=0.95`, `detection_reliability_index=0.8125`, `confidence=0.95`, `nominal_vertical_precision_m=0.2`, `is_passable=True`, `epistemic_class="HEURISTIC"` | **Exact Uncertainty & Passability Match** |
| **Real CTX-only cell `(0, 50)`** | `data=0.7000`, `det=0.5375`, `sigma=2.00`, `hard_impassable=1` | `data_reliability_index=0.7`, `detection_reliability_index=0.5375`, `confidence=0.7`, `nominal_vertical_precision_m=2.0`, `is_passable=False`, `hard_restriction_code="UNRESOLVED_RESOLUTION_HAZARD"`, `epistemic_class="HEURISTIC"` | **Exact Uncertainty & Passability Match** |
| **Synthetic valid zero-evidence cell `(0, 0)`** (`source_id=2`, `slope=-9999.0`, `boulder=-9999.0`) | N/A | `elevation_m=-2500.0`, `data_reliability_index=0.95`, `detection_reliability_index=0.0`, `nominal_vertical_precision_m=0.2`, `confidence=0.95`, `epistemic_class="HEURISTIC"` | **Valid Zero Preserved** |
| **Synthetic unmapped cells `(0, 1)` & `(0, 2)`** (`elev=-9999` / `source_id=0`) | N/A | `elevation_m=None`, `data_reliability_index=None`, `detection_reliability_index=None`, `nominal_vertical_precision_m=None`, `confidence=None`, `is_passable=False`, `hard_restriction_code="NO_DATA_UNKNOWN"`, `epistemic_class="UNKNOWN"` | **Explicit Unmapped / Null Preserved** |
| **Out-of-bounds `(20.0, 80.0)`** (live HTTP GET) | Outside study bounds | `status="OUT_OF_BOUNDS"`, `is_passable=False`, `reason_code="OUT_OF_STUDY_AREA"` | **Explicit Guard** |
| **Real Native-1m HiRISE-only Blocked Cell `(0, 288)`** (`hirise_hazard_obstacles=1`, `20m slope < 25°`, `20m TRI < 8m`, `11,148` cells total) | `hard_impassable=1` | `is_passable=True`, `hard_restriction_code=None` (uncertainty fields match HiRISE) | **PASSABILITY PARITY DEFECT (Pre-existing M0.2 omission in `hazards.py`)** |

**Edge-case & prior check notes:**
1. **`/hazards/inspect` passability defect (`hazards.py#L96-L167`):** `inspect_location_hazard` calls `compute_hazard_bundle(...)` without loading `jezero_western_delta_20m_hirise_hazard_obstacles.tif`, disagreeing with `hazard_hard_impassable.tif` on `11,148` native-1m-only blocked cells. Also, if a synthetic cell has valid elevation (`is_valid=True`) alongside `-9999.0` slope, `h_slope` clips to `0.0` (though `ERI` drops appropriately to `0.3375`); on actual Jezero rasters `slope_deg.tif` has `0` NoData cells.
2. **Earlier Step 9659 Script Error Root Cause:** Confirmed that the earlier failed live-API verification script (Step 9659) failed solely with Python `SyntaxError: unexpected character after line continuation character` (`exit 1`) caused by backslash-escaped `\"` quotes inside a Python f-string inside single-quoted `bash -c '...'`. The clean rerun (Step 9661, `exit 0`) uncovered the `evidence_dimensions.terrain_derivative_reliability_index` vs `terrain_derivative_reliability` UI key mismatch, which was patched prior to M0.3.3.

---

## 4. ERI Formula Bounds, Continuity & Calibration Disclosure

In `backend/app/hazards/uncertainty.py#L129-L283`:
$$\text{ERI} = 0.50 \, R_{\text{geom}} + 0.25 \, R_{\text{opt}} + 0.25 \, R_{\text{res}}$$

- **Dimension Weights & Values:**
  - $R_{\text{geom}} \in \{0.0, 0.70, 0.95\}$ (`compute_terrain_derivative_reliability`, weights **0.50**): `0.95` for HiRISE 1 m DTM with valid finite `slope`/`tri`, `0.70` for CTX 20 m DTM with valid finite `slope`/`tri`, `0.0` when geometry derivatives are `-9999.0`/`NaN`.
  - $R_{\text{opt}} \in \{0.0, 0.40, 0.85\}$ (`compute_optical_imagery_reliability`, weight **0.25**): defaults to `0.40` (warped 6 m→20 m CTX orthomosaic) even over HiRISE DTM; `0.85` only when explicit `imagery_source_id == 2`; `0.0` when CV optical evidence is `-9999.0`/`NaN`.
  - $R_{\text{res}} \in \{0.35, 0.95\}$ (`compute_spatial_resolution_adequacy`, weight **0.25**): `0.95` for HiRISE 1 m native obstacle aggregation; `0.35` for CTX 20 m only.
- **Verified Edge & Continuity Outputs (`evaluate_uncertainty_bundle`):**
  - HiRISE 1 m DTM + 20 m CTX ortho + valid CV: `0.50(0.95) + 0.25(0.40) + 0.25(0.95) = 0.8125`.
  - CTX 20 m DTM + 20 m CTX ortho + valid CV: `0.50(0.70) + 0.25(0.40) + 0.25(0.35) = 0.5375`.
  - Valid mapped HiRISE missing geometry derivatives (`slope=-9999` or `tri=NaN`): `0.3375`; valid mapped HiRISE missing optical CV (`boulder=NaN`): `0.7125`; valid mapped missing both geometry & optical: `0.0`; unmapped (`source_id=0` or `~valid_mask`): `-9999.0`.
  - Hazard-severity invariance sweep across `boulder ∈ [0.0, 1.0]`, `slope ∈ [0°, 40°]`: constant `0.8125` with zero threshold jumps.
- **Mandatory Scientific Calibration Caveat:** All weights (`0.50`, `0.25`, `0.25`) and ordinal tier constants (`0.95`, `0.85`, `0.70`, `0.40`, `0.35`) remain **uncalibrated expert-assigned ordinal indices**, not empirical detection probabilities ($P(\text{TP}|\text{hazard})$) or statistical confidence intervals. Future empirical calibration would require ground-truth rover traverses / HiRISE 0.25 m ortho validation datasets (`HiRISE ORI`, Perseverance Navcam/Hazcam rock counts) to replace heuristic tiers with confusion-matrix / ROC curves.

---

## 5. Route Metric Arc-Length Integration & Mixed-Sensor Invariance

Verified directly in `RouteOptimizationEngine.compute_route` (`backend/app/routing/engine.py#L250-L435`):

1. **Real HiRISE Traverse (`(18.4446, 77.4509) → (18.4550, 77.4050)`, `BALANCED`):**
   - Original unsimplified (`n_wp=137`, `dist=2976.81 m`): `mean_haz=0.138415`, `mean_unc=0.2000`, `data=0.9500`, `det=0.8125`, `max=0.20`, `p95=0.20`.
   - 2x Duplicate-waypoint control (`n_wp=274`, `dist=2976.81 m`): exact match (`|Δ| = 0.000000` across all metrics).
   - `simplify=True` (LOS + densified, `n_wp=147`, `dist=3093.97 m`): `mean_haz=0.138832` (`|Δ|=0.000417` solely from geometric LOS chord shift), `mean_unc=0.2000`, `data=0.9500`, `det=0.8125`.
2. **Synthetic Mixed HiRISE (`cols 0..5`) ↔ CTX (`cols 6..11`) Permissive Traverse:**
   - Unsimplified (`n_wp=12`, `dist=236.5685 m`): `res_unc_dist_m = 118.2843 m`, `res_unc_frac = 0.500000`, `res_dist / dist = 0.500000`, `mean_unc = 1.100000 m`, `max_unc = 2.00`, `p95_unc = 2.00`, `data = 0.825000`, `det = 0.675000`, `char = LOWER_RESOLUTION_UNCERTAIN`, `haz_cls = LOW`, `obs_tier = MIXED_OR_CTX_20M_COVERAGE`.
   - Simplified (`n_wp=13`, `dist=248.2843 m`): `res_unc_dist_m = 118.2843 m`, `res_unc_frac = 0.476407`, `res_dist / dist = 0.476407`, `mean_haz = 0.206387`, `char = LOWER_RESOLUTION_UNCERTAIN`, `haz_cls = MODERATE`, `obs_tier = MIXED_OR_CTX_20M_COVERAGE`.
   - Symmetric `0.5 * step_dist * (prev_flag + curr_flag)` boundary attribution and ratio `resolution_uncertainty_distance_m / total_distance_m == resolution_uncertainty_fraction` hold exactly. *(Also verified in `test_16` and `test_17` of `test_uncertainty_propagation.py`, including `LOWER_RESOLUTION_HAZARDOUS` when CTX route crosses `ELEVATED` hazards).*

---

## 6. Provenance, Catalog & Epistemic Classification Audit

All processed catalogs in `data/catalog/` and live `/api/v1/twin/layers` were inspected:

- **Authentic DOIs Recorded:**
  - `jezero_western_delta_20m_provenance.json`: `["10.5066/P9REJ9JN", "10.5066/P906QQT8", "10.5066/P9GV1ND3"]` (`HiRISE_DTM_Delta_Jezero_DL_1m.tif`, `JEZ_ctx_B_soc_008_DTM_20m.tif`, `JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`), with `uncertainty_metadata.sigma_z_status = "PROVISIONAL_UNVERIFIED_NOMINAL_TIER"`, `epistemic_class = "HEURISTIC"`, `nodata_sentinel = -9999.0`, and 4 explicit `unquantified_components`.
  - `jezero_western_delta_20m_hazard_intelligence.json`: dynamically mirrors `upstream_source_products` and records `cv_optical_imagery_input` (`JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`, DOI `10.5066/P9GV1ND3`, `6.0 m → 20.0 m`). Zero fake IDs (`DTEEC_045994...`, `TRN_CTX_Jezero_20m` confirmed absent via grep).
  - `jezero_western_delta_20m_terrain_intelligence.json`: explicitly records `cv_optical_imagery_input` (`JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`, `10.5066/P9GV1ND3`, `HEURISTIC`), continuous derivatives as `DERIVED`, classification & boulder stats as `HEURISTIC`.
  - `jezero_western_delta_20m_costmap_catalog.json`: `c_terrain` `DERIVED`; `c_hazard`, `c_uncertainty` (`PROVISIONAL_UNVERIFIED_NOMINAL_TIER`), `combined_cost` `HEURISTIC`; `c_science_opportunity` `INTERPRETED`.
  - `jezero_western_delta_20m_native_hazards_catalog.json`: separates `hirise_slope_deg` & `hirise_surface_roughness_m` (`DERIVED`) from `hirise_boulder_score` & `hirise_hazard_obstacles` (`HEURISTIC`).
- **Live `/api/v1/twin/layers` Epistemic Classes:** `data_confidence`, `detection_confidence`, `spatial_uncertainty`, and `overall_hazard` all emit `HEURISTIC`; `resolution_uncertainty` emits `DERIVED`.

---

## 7. Frontend UI Verification (Source Audit, Build/Lint, QC Imagery & Browser Limitation)

- **Attempted Live Browser Check (`browser` subagent `221d08bb-e596-48ba-a98e-75015c99e57f`):** **BLOCKED** — `mcp_chrome_devtools_list_pages` could not connect because `/Users/vridhivazirani/Library/Application Support/Google/Chrome/DevToolsActivePort` does not exist (Chrome remote debugging inactive). No live rendered browser DOM or DevTools console trace could be observed.
- **Static TSX/TypeScript + Build + Live API Verification Performed Instead:**
  - `frontend/src/pages/HazardAssessmentPage.tsx` (`#L167-L350`), `EVARoutePlannerPage.tsx` (`#L311-L380`), `MultiObjectiveComparisonPanel.tsx` (`#L273-L365`), `api/hazards.ts`, `api/routing.ts`, and `api/reports.ts`:
    - Reliability indices render `[0–1]` decimal strings (`dataRel.toFixed(3)`, `detRel.toFixed(3)`) with `"Uncalibrated"` caption (never `%` probability).
    - Nominal precision renders `${nomPrec.toFixed(2)} m nominal` and `"Unverified relative tier (not ±1σ)"` (never `±`).
    - Explicit nullish guards (`!== null && !== undefined` returning `'N/A (UNMAPPED)'` or `'N/A'`), preventing JS falsy collapse on `0.0`.
    - Consumes live API `evidence_dimensions` keys (`terrain_derivative_reliability`, `optical_imagery_reliability`, `spatial_resolution_adequacy`).
    - Overlay legend strings (`Cyan (≥0.90) | Sky Teal (0.70-0.90) | Amber (0.45-0.70) | Crimson (<0.45) | Dark Slate = Unmapped NoData` and `Steel Blue = 0.20 m (HiRISE) | Orange = 2.00 m (CTX) | Magenta = NoData`) match actual pixel RGB values read directly from `data/processed/jezero_western_delta_20m_qc_*.png`:
      - `qc_data_confidence.png`: `(34,211,238)` [162,993], `(56,189,248)` [49,139]
      - `qc_detection_confidence.png`: `(56,189,248)` [162,993], `(245,158,11)` [49,139]
      - `qc_spatial_uncertainty.png`: `(56,189,248)` [162,993], `(249,115,22)` [49,139]
      - `qc_resolution_uncertainty.png`: `(15,23,42)` [162,993], `(245,158,11)` [49,139]
  - Minor discrepancy noted: `twin.py#L167` still describes `data_confidence` CTX `0.70` as `"Sky/Amber"` rather than `"Sky Teal"`.

---

## 8. Quality Gates & Git Diff / Working-Tree Audit

### 8.1 Re-Executed Quality Gates

| Check | Exact Command | Observed Output Summary | Exit Code |
|---|---|---|---|
| **Backend Pytest Suite** | `cd backend && .venv/bin/pytest -v` | **`269 passed` in 122.63s (`0:02:02`)**, `0` failed, `0` skipped (`pytest 9.2.0`; `pytest-cov` not installed in `.venv`) | **`0`** |
| **Backend Ruff Lint** | `cd backend && .venv/bin/ruff check .` | `All checks passed!` | **`0`** |
| **Frontend Oxlint** | `cd frontend && npm run lint` | `Found 0 warnings and 0 errors.` (`357ms`, `47 files`, `116 rules`) | **`0`** |
| **Frontend TypeScript + Build** | `cd frontend && npm run build` | `tsc -b && vite build` succeeded cleanly in `313ms` | **`0`** |
| **Git Whitespace Check** | `git diff --check` | Failed on 6 trailing EOF blank lines (`grid.py:180`, `pipeline.py:481`, `test_routing.py:323`, `test_terrain.py:194`, `test_twin.py:152`, `docs/data_sources.md:290`) | **`2`** |

### 8.2 Working-Tree `git diff` Scope & Hygiene Audit

`git status --short` reveals **38 modified tracked files** (`+2,291 / -166` lines) and **7 untracked files/directories**:
- **Pre-M0.3.2 / Cross-Milestone Dirty Files Intermixed in Working Tree:** `backend/app/core/config.py`, `backend/app/main.py`, `frontend/src/components/GlobalMarsGlobe3D.tsx`, `backend/tests/integration/test_cors_security.py` (M0.1 CORS/WebGL fixes); `backend/app/api/routes/mission.py`, `backend/app/api/routes/routing.py`, `backend/app/routing/search.py`, `backend/app/routing/graph.py`, `backend/app/geospatial/grid.py`, `backend/app/terrain/derivatives.py`, `backend/app/terrain/native_hazards.py`, `backend/tests/unit/test_{routing,terrain,twin}.py`, `backend/tests/unit/test_native_hazards.py`, `backend/tests/integration/test_authoritative_hazard_pipeline.py`, `scripts/run_preprocessing.py`, `docs/audits/` (M0.2 / M0.2.1 work).
- Because prior milestones remain uncommitted on top of commit `dce6f69`, M0.3.2 cannot be cleanly reviewed in git isolation without separating or committing baseline milestones first.

---

## 9. Remaining Limitations & Recommended Next Actions (Before M0.4 / Commit)

1. **Human Chrome Live UI Verification:** Open `http://localhost:5173` in Chrome (or enable `chrome://inspect/#remote-debugging`), smoke-test Hazard Assessment overlay toggles + out-of-bounds/unmapped inspect + EVA Route Planner comparison, and confirm zero browser console/network errors.
2. **Patch `/hazards/inspect` Native-1m Parity (`hazards.py`):** Load `jezero_western_delta_20m_hirise_hazard_obstacles.tif` (or read `hazard_hard_impassable.tif` directly) in `/api/v1/hazards/inspect` so all `11,148` native-1m-only blocked cells accurately report `is_passable: false` and `NATIVE_HIRISE_OBSTACLE`.
3. **Remediate `git diff --check` & Milestone Commit Hygiene:** Strip the 6 trailing EOF blank lines, correct the `M031-F01`–`F12` numbering table & `twin.py#L167` `"Sky Teal"` description if desired, and separate/stage commits cleanly.
4. **Track Upstream Non-M0.3 `nodata=0.0` Remediation:** Schedule conversion of the 9 upstream raster headers/sentinels (`nodata=255` for uint8 coverage/source/obstacle masks; `-9999.0` for float32 CV scores) so `masked=True` reads can never drop valid zeros.

