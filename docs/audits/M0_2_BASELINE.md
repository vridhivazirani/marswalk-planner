# MARSWALK PLANNER — MILESTONE 0.2 BASELINE AUDIT REPORT

**Date:** 2026-11-12T23:42:00+05:30  
**Repository:** `vridhivazirani/marswalk-planner`  
**Git Branch:** `main`  
**Audited Commit:** `dce6f69` (HEAD -> main, origin/main)  
**Working Tree State:**  
- Unstaged modification: `data/catalog/jezero_western_delta_20m_costmap_catalog.json` (timestamp difference from previous execution; preserved).
- All code files clean.

---

## 1. RASTER ASSETS BASELINE

### Raw Datasets (`data/raw/usgs_trn/`)
1. **HiRISE DTM (`HiRISE_DTM_Delta_Jezero_DL_1m.tif`):**
   - Native Resolution: 1.0 m / pixel ($dx = 1.0, dy = 1.0$)
   - Array Dimensions: 11,703 rows $\times$ 7,237 columns
   - Projected CRS: `ESRI:103885` (`Mars_2000_Equirectangular_clon0`)
   - Affine Transform: `[1.0, 0.0, 4584524.3513494255, 0.0, -1.0, 1101888.646211346]`
   - Projected Bounding Box:
     - Left ($x_{\min}$): 4,584,524.3513494255 m
     - Right ($x_{\max}$): 4,591,761.3513494255 m
     - Bottom ($y_{\min}$): 1,090,185.6462113460 m
     - Top ($y_{\max}$): 1,101,888.6462113460 m
   - NoData Value: `-32768.0`
   - Vertical Reference: Mars Areoid (MOLA radius 3,396,190.0 m)

2. **CTX DTM (`JEZ_ctx_B_soc_008_DTM_20m.tif`):**
   - Native Resolution: 20.0 m / pixel
   - Array Dimensions: 1,512 rows $\times$ 1,596 columns
   - Projected CRS: `ESRI:103885`
   - NoData Value: `-3.4028226550889045e+38`

3. **CTX Orthomosaic (`JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`):**
   - Native Resolution: 6.0 m / pixel
   - Array Dimensions: 5,040 rows $\times$ 5,322 columns
   - Projected CRS: `ESRI:103885`
   - NoData Value: `0.0`

### Processed Datasets (`data/processed/`)
- All 20m ARD layers (`jezero_western_delta_20m_*.tif`):
  - Target Dimensions: 586 rows $\times$ 362 columns
  - Target Resolution: 20.0 m / pixel
  - Projected CRS: `ESRI:103885`
  - Affine Transform: `[20.0, 0.0, 4584524.3513494255, 0.0, -20.0, 1101888.646211346]`
  - Projected Bounds:
    - Left: 4,584,524.3513494255 m (identical to HiRISE left)
    - Top: 1,101,888.6462113460 m (identical to HiRISE top)
    - Right: 4,591,764.3513494255 m ($362 \times 20\text{ m}$)
    - Bottom: 1,090,168.6462113460 m ($586 \times 20\text{ m}$)
  - Alignment: Exact 1:20 integer grid relationship sharing the top-left origin.

---

## 2. EXISTING TEST SUITE BASELINE

### Backend Test Execution
- Command: `cd backend && .venv/bin/pytest --tb=short`
- Collected Tests: 214
- Passed Tests: 214 (100% pass rate)
- Failed Tests: 0
- Skipped: 0
- Xfailed: 0
- Execution Time: 37.75s
- Exit Code: 0

### Backend Linter Execution
- Command: `cd backend && .venv/bin/ruff check .`
- Result: "All checks passed!"
- Exit Code: 0

### Frontend Linter Execution
- Command: `cd frontend && npm run lint` (`oxlint`)
- Found: 0 warnings, 0 errors in 47 files
- Exit Code: 0

### Frontend Production Build
- Command: `cd frontend && npm run build` (`tsc -b && vite build`)
- Result: Completed in 496ms, zero TypeScript or build errors.
- Exit Code: 0

---

## 3. AUDITED ARCHITECTURAL BASELINE

1. **Preprocessing Pipeline (`backend/app/geospatial/pipeline.py`):**
   - Currently downsamples HiRISE 1m DTM to 20m via `Resampling.bilinear` before hazard calculations.
   - Identified violation: `MW-SCI-01`.
2. **Hazard Detection (`backend/app/terrain/hazards_detector.py`):**
   - High-fidelity algorithms (morphological white/black top-hat with directional shadow pairing) are present.
   - Currently executed on resampled 20m elevation, losing small boulders (< 5m) and sharp scarps.
3. **Routing Search & Graph (`backend/app/routing/`):**
   - `search.py` silently defaults unsupported algorithms to Dijkstra.
   - `graph.py` lacks defensive assertions against sub-unit (< 1.0) or NaN costs.
   - Identified defects: `MW-ROUT-01`, `MW-GRAPH-01`.
4. **API Endpoints (`backend/app/api/routes/`):**
   - `routing.py`: `algorithm: str` allows invalid algorithm names without 422 validation (`MW-API-01`).
   - `twin.py`: Hardcoded study area bounds instead of reading dynamic raster bounds (`MW-API-01`).
5. **CORS Configuration (`backend/app/main.py`):**
   - Wildcard `allow_origins=["*"]` with `allow_credentials=True` (`MW-SEC-01`).
6. **Terrain Derivatives (`backend/app/terrain/derivatives.py`):**
   - Horn slope assumes isotropic pixels (`res_m`), lacking support for separate `dx_m` and `dy_m` (`MW-DATA-01`).
7. **Frontend WebGL Globe (`frontend/src/components/GlobalMarsGlobe3D.tsx`):**
   - Unmount lifecycle leaks geometries, materials, and textures (`MW-RSK-01`).

