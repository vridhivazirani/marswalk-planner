# Marswalk Planner — Explicit Assumptions Registry

> [!CAUTION]
> Marswalk Planner is a research and education decision-support prototype. It is not NASA software, has not been certified or endorsed by NASA, and must never claim operational astronaut safety.

In accordance with scientific integrity rules, this registry records all engineering assumptions, physical models, and data handling conventions. Assumptions must not remain hidden in code.

---

## 1. Geodetic & Coordinate Assumptions

| ID | Assumption | Value / Standard | Epistemic Class | Justification / Impact | Status |
|---|---|---|---|---|---|
| `ASSUMP-GEO-01` | Mars Spheroid / Datum | IAU 2015 Sphere ($R = 3,396,190\text{ m}$) | `DERIVED` / Standard | Matches standard IAU/PDS cartographic coordinate definitions (`IAU_2015:49900`). | **Active** |
| `ASSUMP-GEO-02` | Canonical Longitude Convention | East-positive, range $[-180^\circ, +180^\circ)$ | `HEURISTIC` / Standard | Standardized internally to prevent 180° / 360° wrapping bugs. Jezero Crater is centered at $\approx +77.5^\circ\text{ E}$. | **Active** |
| `ASSUMP-GEO-03` | Latitude Type | Planetocentric latitude | `DERIVED` / Standard | Standard IAU recommendation for Mars spherical systems. Diverges from planetographic by up to $0.3^\circ$ if unmanaged. | **Active** |
| `ASSUMP-GEO-04` | Vertical Reference | Mars Areoid (equipotential surface) | `DERIVED` / Standard | Matches MOLA elevation zero-datum. Products using radial distance must be converted. | **Active** |
| `ASSUMP-GEO-05` | Local Analysis Projection | Jezero Equirectangular (centered $\approx 18.4^\circ\text{ N}, 77.5^\circ\text{ E}$) | `DERIVED` | Equirectangular projection on Mars sphere has $<0.3\%$ scale distortion across the $45\text{ km}$ crater diameter. | **Active** |

---

## 2. Terrain & Traversability Assumptions

| ID | Assumption | Default Rule / Parameter | Epistemic Class | Justification / Impact | Status |
|---|---|---|---|---|---|
| `ASSUMP-TRAV-01` | **Unknown Terrain Safety Policy** | Missing elevation / data gaps are **impassable by default** | `HEURISTIC` | Rule: *Unknown terrain is never safe*. Routes cannot traverse unmapped voids without user override. | **Active** |
| `ASSUMP-TRAV-02` | Hard Slope Limit | Maximum passable slope = $25.0^\circ$ | `HEURISTIC` | Hard constraint. Angles steeper than $25^\circ$ trigger impassable masks with code `SLOPE_GT_MAX`. | **Active** (Configurable) |
| `ASSUMP-TRAV-03` | Conservative Slope Aggregation | Max or 95th percentile slope during downsampling | `DERIVED` | Averaging slopes across cells hides steep escarpments and dangerous drop-offs. | **Active** |
| `ASSUMP-TRAV-04` | Unobservable Small-Rock Hazard | Rocks $< 1.0\text{ m}$ cannot be resolved in orbital imagery | `HEURISTIC` | Sub-meter rock hazards must be estimated statistically via size-frequency distributions, never treated as absent. | **Active** |

---

## 3. Human EVA & Mission Physiology Assumptions

| ID | Assumption | Parameter / Model | Epistemic Class | Justification / Impact | Status |
|---|---|---|---|---|---|
| `ASSUMP-EVA-01` | Spacesuit Specifications | Illustrative placeholder suit profile | `SIMULATED` | We never fabricate proprietary NASA suit specs. Consumable rates are user-configurable placeholders. | **Active** |
| `ASSUMP-EVA-02` | Walking Speed Function | Anisotropic slope-dependent walking velocity | `HEURISTIC` | Based on terrestrial and lunar field analogues scaled to Mars gravity ($0.38\text{ g}$). Uphill and downhill costs differ. | **Active** |
| `ASSUMP-EVA-03` | Walk-Back Rule | Consumables remaining $\ge$ Return-to-Base cost $\times$ Safety Margin | `HEURISTIC` | Ensures astronauts can return safely from the Point of No Return (PNR) at any time. | **Active** |
| `ASSUMP-EVA-04` | Environmental Scenarios | Simulated dust storms, solar variations | `SIMULATED` | Extreme environmental impacts are treated as hypothetical simulations for stress-testing. | **Active** |

---

## 4. Software Architecture Assumptions

| ID | Assumption | Approach | Justification | Status |
|---|---|---|---|---|
| `ASSUMP-ARCH-01` | Separation of Science from Web | `backend/app/api` isolated from domain packages | Enforced by architecture tests. Core science must run standalone in headless scripts/notebooks. | **Active** |
| `ASSUMP-ARCH-02` | Display vs Analysis CRS | Web map displays Mercator tiles; backend computes distances in Mars metric CRS | MapLibre displays tiles natively; all scientific distances, areas, and routes are computed on the Mars sphere. | **Active** |

