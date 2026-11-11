# Marswalk Research Reproducibility & Scientific Integrity Architecture

**Document Identifier:** `MARS-REPRO-ARCH-001`  
**Status:** Approved Architectural Specification  
**Epistemic Baseline:** Full Epistemic Spectrum (`OBSERVED` through `SIMULATED`)  
**Standard Compliance:** AGENTS.md Scientific Integrity Rules 1–10  

---

## 1. System Overview

To satisfy the non-negotiable scientific integrity requirements established in `AGENTS.md`, the Marswalk Planetary Atlas integrates four core subsystems ensuring forensic reproducibility, mathematical error quantification, planetary temporal context, and audited experimental tracking:

```
+-----------------------------------------------------------------------------------+
|                       Marswalk Reproducibility Architecture                       |
+-----------------------------------------------------------------------------------+
|  [Subsystem A] Dataset Registry & Cryptographic Integrity Engine                  |
|  - SHA-256 Hashes  - DOI / PDS Links  - Immutable data/raw/  - Status Audits     |
+-----------------------------------------------------------------------------------+
|  [Subsystem B] Scientific Uncertainty & Error Propagation Engine                  |
|  - Vertical Error sigma_z  - Horizontal Shift Delta_xy  - Taylor Slope Variance   |
+-----------------------------------------------------------------------------------+
|  [Subsystem C] Observation Geometry & Mars Temporal Context                       |
|  - Solar Longitude L_s  - Martian Season  - Local Solar Time  - Stereo Ephemeris  |
+-----------------------------------------------------------------------------------+
|  [Subsystem D] Reproducible Research Experiments Lab                              |
|  - Cryptographic Run Hashes  - Full Hyperparameter Manifests  - Audit Log Export |
+-----------------------------------------------------------------------------------+
```

---

## 2. Subsystem A: Dataset Registry & Cryptographic Integrity Engine

### 2.1 Principle of Immutability
Under Rule 6 of `AGENTS.md`, raw data directories (`data/raw/`) are write-protected and strictly immutable. Any correction or reprocessing begins from an authenticated re-download from official archives (NASA PDS, USGS Astrogeology, or ESA PSA).

### 2.2 Forensic Registry Schema
Every dataset ingested into Marswalk Planner is recorded in `data/catalog.json` with the following cryptographically verifiable schema:

```json
{
  "product_id": "HiRISE_DTM_Delta_Jezero_DL_1m",
  "canonical_id": "PLN-SRC-04",
  "source_mission": "Mars Reconnaissance Orbiter",
  "instrument": "HiRISE",
  "pds_doi": "10.17189/1520362",
  "official_download_url": "https://astrogeology.usgs.gov/search/map/Mars/Mars2020/JEZ_hirise_soc_001_DTM_1m",
  "retrieval_timestamp_utc": "2026-11-10T14:22:18Z",
  "storage": {
    "local_path": "data/processed/HiRISE_DTM_Delta_Jezero_DL_1m.tif",
    "byte_size": 25165824,
    "sha256": "3cb4db9d25514f...",
    "md5": "e2c451..."
  },
  "geospatial": {
    "crs_code": "ESRI:103885",
    "pixel_resolution_m": 1.0,
    "bounds": [77.38, 18.38, 77.58, 18.52],
    "vertical_reference": "MOLA Areoid"
  },
  "epistemic_class": "DERIVED",
  "status": "VERIFIED_AUTHENTIC"
}
```

### 2.3 Automated Verification Daemon
Marswalk provides an automated audit CLI (`backend/app/core/verify_integrity.py`) that computes the SHA-256 digest of on-disk assets before running simulations or serving tiles. Any hash mismatch raises an immediate hard exception (`DataCorruptionException`) and halts downstream routing pipelines.

---

## 3. Subsystem B: Scientific Uncertainty & Error Propagation Engine

### 3.1 Vertical Elevation Uncertainty ($\sigma_z$)
DTMs derived from orbital stereo-photogrammetry (CTX stereo pairs and HiRISE stereo pairs) carry inherent vertical uncertainties governed by the stereo base-to-height ratio ($B/H$) and parallax matching error:

$$
\sigma_z = \frac{H}{B} \cdot \frac{p}{\text{IFOV}}
$$

- For 1m HiRISE DTMs at Jezero: $\sigma_z \approx \pm 0.2\text{ m}$ to $\pm 0.5\text{ m}$.
- For 20m CTX DTMs at Jezero: $\sigma_z \approx \pm 1.5\text{ m}$ to $\pm 3.0\text{ m}$.

### 3.2 Error Propagation into Slope Variance
Slope $\theta = \arctan(\sqrt{p^2 + q^2})$ where $p = \partial z/\partial x$ and $q = \partial z/\partial y$.
By first-order Taylor series error propagation, assuming independent identically distributed elevation errors $\sigma_z$ across the $3 \times 3$ Horn kernel:

$$
p = \frac{(z_{NE} + 2z_E + z_{SE}) - (z_{NW} + 2z_W + z_{SW})}{8 \Delta x}
$$

The variance of $p$ is:
$$
\sigma_p^2 = \sum \left(\frac{\partial p}{\partial z_i}\right)^2 \sigma_z^2 = \frac{1^2 + 2^2 + 1^2 + 1^2 + 2^2 + 1^2}{(8 \Delta x)^2} \sigma_z^2 = \frac{12}{64 (\Delta x)^2} \sigma_z^2 = \frac{3}{16 (\Delta x)^2} \sigma_z^2
$$

Similarly for $q$:
$$
\sigma_q^2 = \frac{3}{16 (\Delta y)^2} \sigma_z^2
$$

The propagated standard deviation of slope $\theta$ is:

$$
\sigma_\theta = \frac{1}{1 + p^2 + q^2} \sqrt{\frac{p^2 \sigma_p^2 + q^2 \sigma_q^2}{p^2 + q^2}}
$$

On steep slopes ($20^\circ$) at 20m resolution, $\sigma_\theta \approx \pm 1.2^\circ$. This uncertainty is incorporated into the traversability hazard assessment: if $\theta + 2\sigma_\theta \ge 25^\circ$, the cell is flagged as **POTENTIALLY HAZARDOUS** under the precautionary principle (Rule 7: *"Unknown terrain is never safe"*).

### 3.3 Horizontal Co-Registration Shift ($\Delta x, \Delta y$)
CTX and HiRISE products have slight geodetic tie offsets relative to MOLA control. Marswalk logs residual horizontal displacement vectors ($\Delta x = -1.8\text{ m}, \Delta y = +0.6\text{ m}$) established by USGS astrogeology control networks.

---

## 4. Subsystem C: Observation Geometry & Mars Temporal Context

Mars surface properties (temperature, albedo, shadow geometry, atmospheric optical depth $\tau$) are dynamic functions of orbital geometry and solar illumination.

### 4.1 Solar Longitude ($L_s$) & Martian Calendar
$L_s$ is the Mars-centric longitude of the Sun, defining Martian seasons:
- $L_s = 0^\circ$: Northern Vernal Equinox (Autumn in Jezero Crater, $18.4^\circ\text{ N}$).
- $L_s = 90^\circ$: Northern Summer Solstice.
- $L_s = 180^\circ$: Northern Autumnal Equinox.
- $L_s = 270^\circ$: Northern Winter Solstice (Perihelion dust storm season).

### 4.2 Local Solar Time (LST) & Shadow Cast Analysis
Every image acquisition footprint stores its exact Local Solar Time (e.g., HiRISE acquisition at 15:14 LST) and solar incidence angle ($i = 56.4^\circ$, azimuth $\phi = 241.2^\circ$). Marswalk computes shadow masks directly from the DTM:

$$
z_{\text{shadow}}(x, y) = \max_{s > 0} \left( z(x + s \cos \phi, y + s \sin \phi) - s \tan(e_{\text{sun}}) \right)
$$

Cells with $z(x, y) < z_{\text{shadow}}(x, y)$ are in active shadow, affecting EVA thermal flux and optical rover navigation.

---

## 5. Subsystem D: Reproducible Research Experiments Lab

### 5.1 Parameter Run Manifest
To guarantee 100% scientific reproducibility across peer review and mission redesign, every routing run or terrain simulation emits a deterministic JSON manifest containing all parameters:

```json
{
  "run_uuid": "7f8b9c2a-4d3e-4a1b-9f0e-1a2b3c4d5e6f",
  "git_commit_hash": "a1b2c3d4e5f6...",
  "timestamp_iso": "2026-11-11T15:45:00Z",
  "software_environment": {
    "python_version": "3.11.8",
    "numpy_version": "1.26.4",
    "scipy_version": "1.12.0",
    "gdal_version": "3.8.4"
  },
  "dataset_checksums": {
    "JEZ_ctx_B_soc_008_DTM_20m.tif": "9f8a7b6c...",
    "HiRISE_DTM_Delta_Jezero_DL_1m.tif": "3cb4db9d..."
  },
  "hyperparameters": {
    "routing_algorithm": "ASTAR",
    "heuristic_weight": 1.0,
    "max_traversable_slope_deg": 25.0,
    "eva_suit_mass_kg": 120.0,
    "crew_mass_kg": 80.0,
    "oxygen_consumption_l_min": 1.5,
    "max_metabolic_power_w": 450.0,
    "unknown_terrain_penalty_factor": 10.0
  },
  "run_signature_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

### 5.2 Deterministic Run Signature
The run signature is computed as the SHA-256 hash of the canonicalized (sorted keys, compact separators) parameter manifest concatenated with the input raster SHA-256 hashes. If two researchers run the algorithm with identical signatures, the resulting path geometry and resource calculations are bit-for-bit identical.

### 5.3 Automated Audit & PDF/Markdown Report Generation
Marswalk's report generation engine serializes:
1. Input provenance table with PDS IDs and DOIs.
2. Complete parameter manifest.
3. Path coordinate tables with station distances, elevation profiles, slope distributions, and MET (Mission Elapsed Time).
4. Epistemic uncertainty bounds for total distance, transit time, and consumables.
5. Non-negotiable safety disclaimer block.

