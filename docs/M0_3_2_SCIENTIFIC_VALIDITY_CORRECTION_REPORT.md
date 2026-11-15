# MARSWALK M0.3.2 — SCIENTIFIC VALIDITY CORRECTION REPORT

**Project:** Marswalk Planner (Research & Educational Decision-Support Prototype — NOT NASA Software)  
**Branch / Baseline Commit:** `main` @ `dce6f69` (working-tree M0.3.2 corrections; uncommitted)  
**Audit Remediated:** M0.3.1 Scientific Validity Audit (`M031-F01` through `M031-F12`)  
**Decision:** **PASS — All Material Scientific, Mathematical, Raster-Semantic, Provenance, API, UI, and Testing Defects Corrected and Verified**

---

## 1. Executive Summary

Milestone M0.3.2 resolves all twelve scientific validity defects identified during the M0.3.1 independent audit without fabricating external calibration datasets, changing provisional physical precision constants silently, or altering the authoritative M0.2.1 hard-obstacle baseline (`61,055` blocked cells / `151,077` passable cells on the `586 × 362` `jezero_western_delta_20m` grid).

Key architectural and mathematical outcomes:
1. **Uncalibrated Heuristic Indices Clearly Separated from Probabilities:** Scalar `[0.0, 1.0]` reliability metrics (`data_reliability_index`, `detection_reliability_index`) are documented and displayed across backend catalogs, API payloads, and frontend views as uncalibrated ordinal indices rather than statistical probabilities.
2. **Hazard-Independent Evidence Reliability Model:** Replaced the discontinuous, severity-coupled detection heuristic with a smooth, hazard-invariant composite Evidence Reliability Index (`ERI = 0.50 * R_geom + 0.25 * R_opt + 0.25 * R_res`), preserving identical scoring across raster generation and single-point `/hazards/inspect` queries.
3. **Honest Sensor & Optical Provenance:** Explicitly records that 20 m optical computer-vision boulder/sand/crater heuristics consume the 6.0 m CTX orthomosaic (`JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`, DOI `10.5066/P9GV1ND3`, warped to 20 m) rather than native 0.25 m HiRISE imagery (`R_opt = 0.40` even inside the HiRISE DTM footprint), and removes hardcoded wrong source product IDs from dynamic hazard catalog generation.
4. **Provisional Nominal Precision Tiers:** Removes unverified `±0.20 m` / `±2.00 m` physical error-bar claims while retaining `0.20 m` (HiRISE nominal tier) and `2.00 m` (CTX nominal tier) strictly as provisional relative tiers (`PROVISIONAL_UNVERIFIED_NOMINAL_TIER`), listing unquantified error components explicitly.
5. **Strict NoData Semantics (`-9999.0` float32 / `255` uint8):** Eliminates `999.0` NoData leakage and `0.0` collision across uncertainty rasters, QC overlays, costmap normalization, API fallbacks, and frontend JS rendering.
6. **Arc-Length Weighted Route Propagation:** Replaces waypoint-count division (`sum / n_wp`) with trapezoidal arc-length integration, symmetric `0.5 * step_dist` boundary attribution, consistent CTX distance/fraction normalization, independent hazard vs resolution classification (including `LOWER_RESOLUTION_HAZARDOUS`), and `max` / `p95` precision reporting.

---

## 2. Finding-by-Finding Resolution Matrix

| Finding ID | Summary of M0.3.1 Defect | Corrective Action Implemented | Verification Status |
|---|---|---|---|
| **M031-F01** | Uncalibrated heuristic indices presented as calibrated confidence probabilities (`95%`, `88%`). | Relabeled across domain models (`hazards/uncertainty.py`), API (`hazards.py`, `twin.py`), catalogs, and UI (`HazardAssessmentPage.tsx`, `EVARoutePlannerPage.tsx`, `MultiObjectiveComparisonPanel.tsx`) as `[0–1]` uncalibrated ordinal indices (`data_reliability_index`, `detection_reliability_index`). Deprecated legacy `confidence` and removed `0.80` divergence. | **FIXED AND VERIFIED** |
| **M031-F02** | Discontinuous threshold jumps (`0.15`, `0.20`, `0.30`), hazard-severity coupling, and raster-vs-`/inspect` formula mismatch (`0.8000` vs `0.5500`, `0.7200` vs `0.5500`). | Replaced `compute_detection_confidence` with smooth, hazard-invariant `ERI = 0.50*R_geom + 0.25*R_opt + 0.25*R_res`; unified `build_cell_uncertainty_profile` to invoke `evaluate_uncertainty_bundle` directly. Tested exact equality between GeoTIFFs and `/hazards/inspect` (`test_12`, `test_13`). | **FIXED AND VERIFIED** |
| **M031-F03** | Legacy `999.0` NoData sentinel on `uncertainty_sigma_z.tif` leaking into downstream uncertainty products and `0.0` masking invalid NoData cells. | Switched `uncertainty_sigma_z.tif` and all M0.3 float32 products to `STANDARD_NODATA_FLOAT = -9999.0`; uint8 binary masks enforce `nodata=255`; valid zero `0.0` stays distinct from `-9999.0`; `normalize_uncertainty` maps `-9999.0`, `999.0`, and `NaN` to `1.0`; Dark Slate `(15,23,42)` and Magenta `(255,0,220)` reserved exclusively for NoData in QC PNGs (`test_11`, `test_15`). | **FIXED AND VERIFIED** |
| **M031-F04** | CTX optical CV provenance misrepresented as HiRISE optical / CTX 6 m DTM; hardcoded wrong HiRISE/CTX product IDs (`DTEEC_045994...`, `TRN_CTX_Jezero_20m`). | Fixed docstrings and `compute_optical_imagery_reliability` (`R_opt = 0.40` default for 20 m warped CTX ortho); read actual provenance dynamically from `{grid_name}_provenance.json` and record `JEZ_ctx_B_soc_008_orthoMosaic_6m.tif` (`10.5066/P9GV1ND3`) in both `terrain_intelligence.json` and `hazard_intelligence.json` (`test_14`). | **FIXED AND VERIFIED** |
| **M031-F05** | Unverified nominal vertical precision (`0.20 m` / `2.00 m`) presented as physical `±` calibrated 1σ error bars. | Labeled `PROVISIONAL_UNVERIFIED_NOMINAL_TIER` across API payloads, costmap notes, docs, reports, and UI cards; removed all `±` error-bar formatting (`±0.20 m`, `±{mean_uncertainty_m}`); enumerated unquantified vertical/resampling components in provenance & `/hazards/inspect`. | **FIXED AND VERIFIED** |
| **M031-F06** | `DERIVED` epistemic mislabeling for heuristic reliability layers, boulder heuristics, and normalized uncertainty cost. | Updated `hazard_intelligence.json`, `costmap_catalog.json`, `native_hazards_catalog.json`, `/api/v1/twin/layers`, and per-property `property_epistemic_classes` (`DERIVED` geometry vs `HEURISTIC` CV/reliability/nominal precision/costmap uncertainty vs `UNKNOWN` unmapped; `test_5`, `test_14`). | **FIXED AND VERIFIED** |
| **M031-F07** | `/api/v1/hazards/inspect` fabricated `2.0 m` sigma fallback when `source_id == 0`, diverged via `bundle.confidence = 0.80`, and passed unguarded missing inputs. | Guarded unmapped / `source_id == 0` cells (`STANDARD_NODATA_FLOAT` internally -> `null` JSON fields and `epistemic_class="UNKNOWN"`), aligned `confidence == data_reliability_index`, and exposed full `evidence_dimensions` and `property_epistemic_classes` (`test_8`, `test_13`, `test_17`). | **FIXED AND VERIFIED** |
| **M031-F08** | Route metrics used waypoint-count arithmetic mean (`sum / n_wp`), causing `simplify=True/False` bias and unequal spacing distortion. | Replaced all route path means in `RouteOptimizationEngine.compute_route` with trapezoidal arc-length integration weighted by Euclidean projected segment lengths (`test_16`). | **FIXED AND VERIFIED** |
| **M031-F09** | Asymmetric segment attribution on CTX↔HiRISE boundaries and inconsistent numerator/denominator between `resolution_uncertainty_distance_m` and `resolution_uncertainty_fraction`. | Implemented symmetric `0.5 * step_dist * (prev_flag + curr_flag)` boundary attribution and computed `res_unc_frac = res_unc_dist_m / total_distance_m` (verified exact ratio consistency in `test_16`). | **FIXED AND VERIFIED** |
| **M031-F10** | Missing upper-tail route risk exposure (`max` / `p95` precision tier) and coupled `terrain_characterization` collapsing `LOWER_RESOLUTION_UNCERTAIN` + hazardous slope into one label. | Added `max_uncertainty_m` and `p95_uncertainty_m`; separated independent `hazard_classification` (`LOW`/`MODERATE`/`ELEVATED`) and `observation_reliability_tier`; added `RouteTerrainCharacterization.LOWER_RESOLUTION_HAZARDOUS`; added route reliability & science-density details to `RouteComparisonService` (`test_16`, `test_17`). | **FIXED AND VERIFIED** |
| **M031-F11** | Frontend JS truthiness (`? ... : '95%'`), null-dereference `.toFixed()` hazards, `±` error bars, mismatched overlay legends, and evidence field-name mismatches. | Updated `hazards.ts`, `routing.ts`, `reports.ts`, `HazardAssessmentPage.tsx`, `EVARoutePlannerPage.tsx`, and `MultiObjectiveComparisonPanel.tsx` with explicit `!== null && !== undefined` checks, `'N/A (UNMAPPED)'`, legend-matched color labels, and live API `evidence_dimensions` keys. | **FIXED AND VERIFIED** |
| **M031-F12** | Pipeline PNGs without affine transforms emitted `NotGeoreferencedWarning`; tests previously asserted `0.00` for NoData and `0.90` severity-coupled detection score. | Added `rasterio.transform.from_origin(0, h, 1, 1)` to `_generate_qc_preview`, `_generate_source_id_qc`, `_generate_slope_qc`, `_generate_class_qc`, `_generate_confidence_qc`, `_generate_spatial_qc`; updated and expanded unit & integration suites to 17 tests in `test_uncertainty_propagation.py`. | **FIXED AND VERIFIED** |

---

## 3. Authoritative Raster & Catalog Verification Results

Following all backend code edits, `backend/.venv/bin/python -W default scripts/run_preprocessing.py --grid 20m` was executed cleanly across all 5 stages (0 warnings) and verified directly on disk:

- **Hard-Constraint Preservation (`jezero_western_delta_20m_hazard_hard_impassable.tif`):**
  - `dtype = uint8`, `nodata = 255.0`, unique pixel values `[0, 1]`
  - `61,055` blocked cells (`28.78%`), `151,077` passable cells (`586 × 362 = 212,132` total cells) — **exact match to M0.2.1 baseline**.
- **Float32 Uncertainty & Reliability Layers (`nodata = -9999.0`, `n_999 = 0`):**
  - `jezero_western_delta_20m_uncertainty_sigma_z.tif`: `nodata = -9999.0`, observed unique values `[0.2, 2.0]` (provisional nominal tiers), `0` legacy `999.0` pixels.
  - `jezero_western_delta_20m_hazard_data_confidence.tif`: `nodata = -9999.0`, observed unique values `[0.70, 0.95]`, `epistemic = HEURISTIC`.
  - `jezero_western_delta_20m_hazard_detection_confidence.tif`: `nodata = -9999.0`, observed unique values `[0.5375, 0.8125]`, `epistemic = HEURISTIC`.
  - `jezero_western_delta_20m_hazard_spatial_uncertainty_m.tif`: `nodata = -9999.0`, observed unique values `[0.2, 2.0]`, `status = PROVISIONAL_UNVERIFIED_NOMINAL_TIER`.
- **Binary Masks (`nodata = 255.0`):**
  - `jezero_western_delta_20m_hazard_resolution_uncertainty.tif`: unique values `[0, 1]`, `49,139` CTX-only cells flagged (`epistemic = DERIVED`).
  - `jezero_western_delta_20m_hazard_unknown_mask.tif`: unique value `[0]` on Jezero footprint (`epistemic = UNKNOWN`).

---

## 4. Observed Route & API Parity Checks

1. **Live API Single-Cell Query (`GET /api/v1/hazards/inspect?lat=18.4485&lon=77.4320`, HiRISE DTM Cell):**
   - `data_reliability_index = 0.95` (`HIGH`), `detection_reliability_index = 0.8125` (`MODERATE`)
   - `confidence = 0.95` (`legacy_confidence_deprecated = true` — `0.80` divergence eliminated)
   - `nominal_vertical_precision_m = 0.2`, `uncertainty_precision_status = "PROVISIONAL_UNVERIFIED_NOMINAL_TIER"`
   - `evidence_dimensions.terrain_derivative_reliability = 0.95`, `optical_imagery_reliability = 0.4`, `spatial_resolution_adequacy = 0.95`
   - `optical_imagery_source = "CTX Orthomosaic (6.0 m/px resampled to 20.0 m/px)"`
2. **Route Simplification Stability (`POST /api/v1/routing/plan`, `(18.4446, 77.4509) -> (18.4550, 77.4050)`, `BALANCED`):**
   - `simplify=True` (`147` waypoints, `3093.97 m`): `mean_hazard_exposure = 0.1388`, `mean_science_opportunity = 0.2292`, `mean_data_confidence = 0.95`, `mean_detection_confidence = 0.8125`, `max_uncertainty_m = 0.2`, `p95_uncertainty_m = 0.2`.
   - `simplify=False` (`137` waypoints, `2976.81 m`): `mean_hazard_exposure = 0.1384`, `mean_science_opportunity = 0.2299`, `mean_data_confidence = 0.95`, `mean_detection_confidence = 0.8125`.

---

## 5. Modified Files Inventory

### Backend Source & Tests
- `backend/app/geospatial/pipeline.py`
- `backend/app/terrain/engine.py`
- `backend/app/terrain/native_hazards.py`
- `backend/app/hazards/uncertainty.py`
- `backend/app/hazards/evaluator.py`
- `backend/app/hazards/pipeline.py`
- `backend/app/costmap/evaluator.py`
- `backend/app/costmap/pipeline.py`
- `backend/app/routing/models.py`
- `backend/app/routing/engine.py`
- `backend/app/services/route_comparison.py`
- `backend/app/api/routes/hazards.py`
- `backend/app/api/routes/costmap.py`
- `backend/app/api/routes/twin.py`
- `backend/tests/unit/test_uncertainty_propagation.py` (`17` tests total: updated existing + added M0.3.2 regression suite)
- `backend/tests/integration/test_authoritative_hazard_pipeline.py` (`test_10` aligned to `2.1.0 (M0.3.2 Scientific Validity Corrected)`)

### Frontend & Documentation
- `frontend/src/api/hazards.ts`
- `frontend/src/api/routing.ts`
- `frontend/src/api/reports.ts`
- `frontend/src/pages/HazardAssessmentPage.tsx`
- `frontend/src/pages/EVARoutePlannerPage.tsx`
- `frontend/src/components/MultiObjectiveComparisonPanel.tsx`
- `docs/data_sources.md`
- `docs/route_comparison.md`
- `docs/M0_3_2_SCIENTIFIC_VALIDITY_CORRECTION_REPORT.md`

---

## 6. Automated Verification Gate Results (Post-Final-Edit)

All required checks executed cleanly after the final code/test/doc edits:

| Check Command | Observed Result |
|---|---|
| `cd backend && .venv/bin/pytest -v` | **269 passed in 137.59s (0:02:17)** — 0 failed, 0 skipped |
| `cd backend && .venv/bin/ruff check .` | **All checks passed!** |
| `cd frontend && npm run lint` | **0 warnings and 0 errors** (`oxlint` on 47 files) |
| `cd frontend && npm run build` | **`tsc -b && vite build` succeeded cleanly in 315ms** |
| `backend/.venv/bin/python -W default scripts/run_preprocessing.py --grid 20m` | **All 5 stages succeeded, 0 warnings, 61,055 impassable cells preserved** |

**M0.3.2 Disposition:** Accepted as complete and ready for repository review (working tree uncommitted per instructions).

