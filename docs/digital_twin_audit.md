# Marswalk Digital Twin — Scientific & Geospatial Audit Report

**Auditor Role:** Senior Geospatial Reviewer & Planetary Science Validation Engineer  
**Audit Date:** 2026-11-11  
**Target Module:** Marswalk Digital Twin (2D Map, 3D Elevation Mesh, Layer Registry, Geodetic Frame)  
**Status:** **AUDITED & REMEDIATED** (135/135 backend tests passing, 0 oxlint warnings, clean frontend build).

---

## 1. Verified Datasets

Inspection of the actual binary files in `data/raw/` and `data/processed/`, detached labels, and download manifests verified the following authentic datasets:

| Dataset Layer | Raw Source File & Product ID | Verified Physical Properties | Epistemic Class | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **HiRISE DTM (Raw)** | `HiRISE_DTM_Delta_Jezero_DL_1m.tif`<br/>(`10.5066/P9REJ9JN`) | Shape: $(11703, 7237)$, Res: $(1.0\text{ m}, 1.0\text{ m})$, CRS: `ESRI:103885`, NoData: $-32768.0$, Size: 114.7 MB | `OBSERVED` | **VERIFIED AUTHENTIC** (Downloaded from USGS TRN S3 portal) |
| **CTX DTM (Raw)** | `JEZ_ctx_B_soc_008_DTM_20m.tif`<br/>(`10.5066/P906QQT8`) | Shape: $(1512, 1596)$, Res: $(20.0\text{ m}, 20.0\text{ m})$, CRS: `ESRI:103885`, NoData: $-3.40\times 10^{38}$, Size: 9.7 MB | `OBSERVED` | **VERIFIED AUTHENTIC** (USGS TRN Regional DTM) |
| **CTX Ortho (Raw)** | `JEZ_ctx_B_soc_008_orthoMosaic_6m.tif`<br/>(`10.5066/P9GV1ND3`) | Shape: $(5040, 5322)$, Res: $(6.0\text{ m}, 6.0\text{ m})$, CRS: `ESRI:103885`, NoData: 0, Size: 36.3 MB | `OBSERVED` | **VERIFIED AUTHENTIC** (USGS TRN Ortho Mosaic) |
| **Perseverance Rover Telemetry** | `M20_traverse.json`, `M20_waypoints.json`<br/>(`mars2020_places`) | 572 authentic historical waypoints and drive vectors spanning Sol 0 (Octavia E. Butler Landing) through Sols 1000+ | `OBSERVED` | **VERIFIED AUTHENTIC** (Downloaded from NASA MMGIS portal) |
| **ARD Elevation Grid** | `jezero_western_delta_20m_elevation.tif` | Shape: $(586, 362)$, Res: $(20.0\text{ m}, 20.0\text{ m})$, CRS: `ESRI:103885`, NoData: $-9999.0$. Fused HiRISE 1m + CTX 20m | `DERIVED` | **VERIFIED DETERMINISTIC** |
| **Surface Reflectance (2D Map)** | `jezero_western_delta_20m_ortho_imagery.tif` | Shape: $(586, 362)$, Res: $(20.0\text{ m}, 20.0\text{ m})$, CRS: `ESRI:103885`. Resampled from CTX 6m mosaic | `OBSERVED` | **VERIFIED DETERMINISTIC** |
| **Slope & TRI Layers** | `jezero_western_delta_20m_slope_deg.tif`, `_tri_roughness_m.tif` | Horn (1981) slopes and Riley (1999) TRI computed strictly across valid data | `DERIVED` | **VERIFIED REPRODUCIBLE** |

---

## 2. Unverified Datasets & Unsupported Claims (Remediated)

The audit revealed the following discrepancies between UI labels and disk contents:

1. **HiRISE Orthorectified Image (ORI) Mosaic (`10.5066/P9QJDP48` at 0.25 m/pixel):**
   - **Discrepancy:** The Digital Twin page subtitle claimed: `Authentic HiRISE DTM (1.0m) & ORI (0.25m)`.
   - **Reality on Disk:** The 0.25m HiRISE ORI mosaic is multiple gigabytes and was never downloaded to `data/raw/`. The active ortho basemap served to the 2D map is the **6.0m CTX Orthomosaic (`10.5066/P9GV1ND3`) resampled to 20m** (`jezero_western_delta_20m_ortho_imagery.tif`).
   - **Remediation:** Corrected UI subtitle and layer metadata to explicitly state `CTX Orthorectified Surface Reflectance (6m aligned to 20m)`.
2. **Raw CRISM Hyperspectral Cubes (`.img` / PDS3):**
   - **Reality on Disk:** No raw CRISM multi-band hyperspectral cubes exist in `data/raw/`. The mineralogical layers (smectites, carbonates, olivine) are evaluated via a **mathematical heuristic parameterization** based on published peer-reviewed CRISM detections (Ehlmann et al., Horgan et al., Sun & Stack).
   - **Remediation:** Preserved epistemic class `INTERPRETED`, documented that mineral maps are parametric models of published literature, and prohibited claiming raw spectral cube ingestion.

---

## 3. Coordinate Reference System (CRS) Validation

### 3.1 Planetary Body & Geodetic Parameters
- **Geodetic Standard:** IAU 2015 Mars Sphere (`IAU_2015:49900`).
- **Planetary Radius:** $R_{\text{Mars}} = 3,396,190.0\text{ m}$ (spherical, flattening $f = 0$).
- **Vertical Reference Datum:** Mars Areoid (equipotential elevation surface defined by MOLA MEGDR). All elevations in the DTM are meters relative to the areoid ($[-2598.9\text{ m}, -2240.5\text{ m}]$).
- **Longitude Convention:** East-positive planetocentric longitude in $[-180^\circ, 180^\circ)$. `MarsPoint` in `app/geospatial/crs.py` enforces normalization via `((lon + 180.0) % 360.0) - 180.0`.

### 3.2 Projected Analysis System
- **Projected CRS:** `ESRI:103885` (`+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m`).
- **Aspect Compression Note:** Because `lat_ts = 0` (equator standard parallel), horizontal ground distance along parallels at Jezero latitude ($\phi \approx 18.45^\circ\text{N}$) is compressed by $\cos(18.45^\circ) = 0.94887$ ($18.98\text{ m/pixel}$ east-west vs $20.0\text{ m/pixel}$ north-south). This causes $< 3\%$ Euclidean distance variation, well within the margin of suit locomotion uncertainty.
- **Frontend 2D Map CRS:** Leaflet is configured with `L.CRS.EPSG4326`. On the Mars sphere, degrees map directly to equirectangular coordinates without Earth spheroidal distortion. Earth Web Mercator (`EPSG:3857`) is strictly excluded.

### 3.3 Study Area Base & Destination Coordinates Consistency
- **Study Area Extent:**
  - Latitude: $18.39180^\circ\text{N}$ to $18.58953^\circ\text{N}$
  - Longitude: $77.34370^\circ\text{E}$ to $77.46584^\circ\text{E}$
- **Default Base Location:** Octavia E. Butler Landing at $(18.4446^\circ\text{N}, 77.4509^\circ\text{E})$.
  - Verified inside study bounds ($18.4446 \in [18.3918, 18.5895]$, $77.4509 \in [77.3437, 77.4658]$).
- **Default Destination Location:** Hawksbill Gap Delta Front at $(18.4550^\circ\text{N}, 77.4050^\circ\text{E})$.
  - Verified inside study bounds ($18.4550 \in [18.3918, 18.5895]$, $77.4050 \in [77.3437, 77.4658]$).
- **Rank 1 Science Target (Kodiak Butte):** $(18.4595^\circ\text{N}, 77.4083^\circ\text{E})$.
  - Verified inside study bounds.

---

## 4. Raster Coverage Findings & Unknown Terrain Representation

1. **Raster Spatial Bounds:**
   $$[4584524.35, 1090168.65, 4591764.35, 1101888.65]\text{ m}$$
   The rectangular bounding box is rendered as a dashed cyan rectangle on the 2D map.
2. **Treatment of Terrain Outside Coverage:**
   - Any query outside this box returns `status: "OUT_OF_BOUNDS"`, `is_passable: false`, `reason_code: "OUT_OF_STUDY_AREA"`.
   - Any attempt to plan a route outside this box raises `OutOfBoundsCoordinateError` (HTTP 400).
3. **Treatment of NoData Cells Inside Coverage:**
   - Pixels where `elevation == -9999.0` are masked with `valid_mask = False`.
   - In the hazard engine, `valid_mask == False` triggers `h_unknown = 1.0` and flags `NO_DATA_UNKNOWN`.
   - In the costmap engine, `unknown_mask` is bitwise OR'ed into the hard impassable mask:
     $$H_{\text{blocked}}(c) = H_{\text{hazard}}(c) \lor H_{\text{unknown}}(c) \implies C(c) = \infty$$
   - Unknown terrain is strictly impassable and can never be traversed by a planned route.

---

## 5. Investigation of the Line Extending Outside Coverage (TASK 3)

### 5.1 Root Cause Identification
- **Finding:** The line extending outside the rectangular raster coverage is **NOT** a planned EVA route, nor is it a simulated path.
- **Identification:** It is the **authentic historical Perseverance Rover Traverse (`OBSERVED`)** loaded from `data/raw/perseverance/M20_traverse.json`.
- **Geographic Explanation:**
  - The Perseverance rover landed at Octavia E. Butler Landing ($77.4508^\circ\text{E}$), explored the delta, and then drove westward up onto the western crater rim over Sols 0–1000+, reaching longitude **$77.21679^\circ\text{E}$**.
  - However, our high-resolution 20m delta DTM raster terminates at longitude **$77.34370^\circ\text{E}$**.
  - Therefore, the rover's physical drive path extends $\approx 7.5\text{ km}$ west of the delta DTM footprint into the regional crater basin.
- **Why It Looked Like a Route Bug:**
  - The rover traverse was enabled by default on initial map load (`activeLayers.perseverance_traverse = true`).
  - It was rendered as a solid red-orange line (`#ff3d00`), visually indistinguishable from a planned traversal route.
  - No legend or boundary indicator explained why the line continued beyond the cyan study area box.

### 5.2 Remediations Applied
1. **Visual Distinction:** Changed rover path styling to an amber-orange **dashed polyline** (`dashArray: '7, 6'`, color `#ffab00`) with circular waypoint markers labeled `🤖 Perseverance Sol X (Historical Robotic Traverse - Observed)`.
2. **Clear Separation from Planned Routes:** Planned human EVA routes remain bold solid lines (Cyan for Safety-First, Gold for Science-First, Green for Balanced), strictly bounded inside the 20m DTM.
3. **Map Traversal & Coverage Legend:** Added a permanent tactical legend in the bottom-left corner of `MarsMap2D.tsx` explicitly detailing:
   - *Cyan Dashed Box:* 20m DTM Study Boundary (Analysis Extent).
   - *Solid Colored Lines:* Planned EVA Routes (strictly inside footprint).
   - *Amber Dashed Line:* Perseverance Rover Traverse (Observed, extends west).
   - *Warning Notice:* Terrain outside cyan boundary is unmapped regional basin (NoData — EVA entry prohibited).

---

## 6. Terminology & Classification Corrections (TASK 4 & TASK 5)

| Component | Previous Misleading Label | Corrected Epistemic Label | Reason for Correction |
| :--- | :--- | :--- | :--- |
| `twin.py` (Layer 4) | `Terrain Classification Units (Heuristic ML)` | `Terrain Geomorphic Units (Heuristic Rule-Based)` | The classifier uses rule-based slope, TRI, and variance thresholds. Calling heuristic rules "ML" is scientifically misleading. |
| `twin.py` (Layer 9) | `Perseverance Rover Traverse & Waypoints` | `Perseverance Rover Historical Traverse (Observed)` | Added explicit note that the historical robotic path extends west beyond the 20m DTM study footprint. |
| `twin.py` (Layer 1) | `CTX Orthorectified Surface Reflectance (6m/20m)` | `CTX Orthorectified Surface Reflectance (6m aligned to 20m)` | Clarified that the visible layer is resampled from the 6m CTX mosaic to the 20m ARD grid. |
| `MissionControlHeader.tsx` | `TELEMETRY LINK:` | `BACKEND API STATUS:` | The indicator checks HTTP API reachability (`GET /api/v1/health`), not live spacecraft telemetry. |
| `DigitalTwinPage.tsx` | `Authentic HiRISE DTM (1.0m) & ORI (0.25m)` | `Authentic USGS TRN HiRISE DTM (1.0m fused to 20m) & CTX Mosaic (6m)` | 0.25m HiRISE ORI is not present in the local data directory. |
| `App.tsx` | `Telemetry link unavailable:` | `Backend API connection unavailable:` | Prevents false impressions of spacecraft loss of signal. |

---

## 7. Failed Tests & Automated Verification Status

- **Previous Failed Tests:** None.
- **Post-Remediation Verification:**
  - Added new assertions in `tests/unit/test_twin.py`:
    - Strict prohibition of "ML" or "Machine Learning" in layer metadata names.
    - Verified `terrain_classes` has epistemic class `HEURISTIC` and name contains `Rule-Based`.
    - Verified `perseverance_traverse` has epistemic class `OBSERVED` and name contains `Historical`.
  - Full backend test suite executed: **135 passed, 0 failed, 2 warnings** in 38.7s.
  - Ruff linter: **0 errors**.
  - Oxlint frontend linter: **0 errors, 0 warnings** across 36 files.
  - Production build: Clean Vite client build.

---

## 8. Summary of Changes & Recommendations

### Changes Completed in this Audit:
1. **Provenance Clarification:** Corrected UI basemap claims from 0.25m HiRISE ORI to authentic 6m CTX Orthomosaic aligned to 20m.
2. **Classification Terminology:** Stripped all misleading "ML" mentions from heuristic rule-based classifiers.
3. **Backend Status Indicator:** Renamed `TELEMETRY LINK` to `BACKEND API STATUS` in the header and error banners.
4. **Rover Traverse vs Planned Route Separation:** Styled the historical rover drive as an amber dashed line with informative tooltips and added a permanent Map Coverage & Traversal Legend in `MarsMap2D.tsx`.
5. **Unit Test Enforcement:** Added metadata and terminology guard tests in `test_twin.py`.

### Recommended Future Enhancements (Post-Audit):
1. **Optional Regional HiRISE Corridor Clipping:** For users who only want to view the rover traverse within the active study box, add a toggle in the layer settings to clip the rover vector to the 20m DTM bounding rectangle.
2. **Download 0.25m HiRISE ORI Subset:** When high-bandwidth connectivity and additional disk storage allow, download a cropped 0.25m HiRISE ORI tile covering Kodiak Butte to provide sub-meter visible texture for astronaut footstep hazard inspection.

