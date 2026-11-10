# Marswalk Unified Cost Map Engine

> [!IMPORTANT]
> **Core Planetary Principles**
> 1. **Separation of Hard Constraints and Soft Costs**: Hard traversability prohibitions are strictly binary with explicit reason codes (`SLOPE_GT_MAX`, `TRI_GT_MAX`, `NO_DATA_UNKNOWN`). Soft costs are continuous normalized penalties combined into a routing friction multiplier ($1.0$ to $10.0$).
> 2. **Unknown Terrain is Never Safe**: Missing data / NoData pixels are strictly impassable by default ($C = \infty$), never zero-cost or assumed safe.
> 3. **Mathematical Reproducibility**: All cost calculations are deterministic, grid-validated, and bitwise reproducible.

---

## 1. Mathematical Formulation

Let $c = (r, c)$ represent a spatial cell on the canonical Jezero Western Delta 20m grid (`ESRI:103885`).

### 1. Hard Traversability Constraints $H(c) \in \{0, 1\}$
Hard constraints define terrain where extravehicular locomotion is physically prohibited:

$$H(c) = H_{\text{slope}}(c) \lor H_{\text{roughness}}(c) \lor H_{\text{unknown}}(c)$$

Where:
- $H_{\text{slope}}(c) = 1$ if $\text{slope}(c) \ge 25.0^\circ$ (Code: `SLOPE_GT_MAX`)
- $H_{\text{roughness}}(c) = 1$ if $\text{TRI}(c) \ge 8.0\text{ m}$ (Code: `TRI_GT_MAX`)
- $H_{\text{unknown}}(c) = 1$ if $\text{valid}(c) = \text{False}$ (Code: `NO_DATA_UNKNOWN`)

If $H(c) = 1$, the combined routing cost is strictly infinite:

$$C(c) = \infty$$

### 2. Normalized Soft Cost Components $C_k(c) \in [0.0, 1.0]$
For all passable cells ($H(c) = 0$), soft terms represent continuous resistance or risk:

- **Terrain Difficulty ($C_{\text{terrain}}$)**:
  Measures mechanical and energetic resistance from slope incline and surface roughness:
  $$C_{\text{terrain}}(c) = 0.60 \cdot \operatorname{clip}\left(\frac{\text{slope}(c)}{25.0}, 0, 1\right) + 0.40 \cdot \operatorname{clip}\left(\frac{\text{TRI}(c)}{6.0}, 0, 1\right)$$

- **Environmental Hazard ($C_{\text{hazard}}$)**:
  Normalized hazard score evaluated by the Hazard Intelligence Engine (boulders, sand entrapment, depressions):
  $$C_{\text{hazard}}(c) = h_{\text{overall}}(c) \in [0.0, 1.0]$$

- **Topographic Uncertainty ($C_{\text{uncertainty}}$)**:
  Vertical elevation uncertainty penalty ($\sigma_z$ from $0.20\text{ m}$ to $2.00\text{ m}$):
  $$C_{\text{uncertainty}}(c) = \operatorname{clip}\left(\frac{\sigma_z(c) - 0.20}{1.80}, 0, 1\right)$$

- **Science Opportunity Penalty ($C_{\text{science}}$)**:
  In pathfinding, travel through scientifically barren areas incurs an opportunity cost:
  $$C_{\text{science}}(c) = 1.0 - S_{\text{opp}}(c)$$
  *(High science opportunity directly reduces the opportunity cost penalty)*.

### 3. Unified Cost Multiplier $C_{\text{soft}}(c) \in [1.0, 10.0]$
Soft components are weighted and mapped to a standard operational cost multiplier scale:

$$C_{\text{soft}}(c) = 1.0 + 9.0 \cdot \left[ w_{\text{terrain}} C_{\text{terrain}}(c) + w_{\text{hazard}} C_{\text{hazard}}(c) + w_{\text{uncertainty}} C_{\text{uncertainty}}(c) + w_{\text{science}} C_{\text{science}}(c) \right]$$

Subject to the normalization constraint:

$$\sum_{k} w_k = 1.0 \quad (w_k \ge 0)$$

- **$C = 1.0$**: Ideal optimal terrain (flat planar surface, zero hazard, 1m HiRISE confidence, peak science return).
- **$C = 10.0$**: Maximum passable friction and difficulty.
- **$C = \infty$**: Blocked cells (represented with sentinel $10^6$ in exported GeoTIFFs).

---

## 2. Mission Profiles

The engine provides three pre-configured operational profiles:

| Profile | Philosophy | $w_{\text{terrain}}$ | $w_{\text{hazard}}$ | $w_{\text{uncertainty}}$ | $w_{\text{science}}$ | Mean Cost (Jezero Delta) |
|---|---|---|---|---|---|---|
| **A. SAFETY FIRST** | Minimizes hazard, sensor uncertainty, and slope. Human safety strictly overrides scientific return. | `0.30` | `0.50` | `0.15` | `0.05` | **3.028** |
| **B. SCIENCE FIRST** | Maximizes scientific target return while strictly obeying hard traversability limits. | `0.15` | `0.20` | `0.10` | `0.55` | **5.869** |
| **C. BALANCED** | Balanced operational trade-off between traversal energy, environmental risk, and science. | `0.30` | `0.30` | `0.15` | `0.25` | **4.171** |

*(Custom profiles can be configured interactively via UI sliders or the API)*.

---

## 3. Strict Spatial Grid Compatibility Validation

Before computing cost maps, [`app/costmap/grid.py`](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/app/costmap/grid.py) strictly validates that all input rasters match the reference grid specification:

- Coordinate Reference System: `ESRI:103885`
- Grid Dimensions: $(586, 362)$ pixels
- Spatial Resolution: $(20.0\text{ m}, 20.0\text{ m})$
- Bounding Extents: $[4584524.35, 1090168.65, 4591764.35, 1101888.65]\text{ m}$

If any raster has mismatched dimensions, bounds, resolution, or CRS, a `GridMismatchError` is raised with detailed diagnostics.

---

## 4. REST API Endpoints

- `GET /api/v1/costmap/profiles`: Returns all pre-configured profiles and default weights.
- `POST /api/v1/costmap/evaluate`: Evaluates cost map with user-provided weights and returns summary statistics (`mean_passable_cost`, `blocked_percentage`, `p90`).
- `GET /api/v1/costmap/raster/{profile_name}.png`: Streams high-contrast PNG heatmap:
  - Passable terrain: Emerald Green ($1.0$) $\rightarrow$ Yellow ($4.5$) $\rightarrow$ Red ($9.0+$)
  - Hard blocked cells: Bright Magenta ($255, 0, 220$)
  - Unknown / NoData: Pitch Black ($15, 15, 18$).
- `GET /api/v1/costmap/inspect?lat={lat}&lon={lon}&profile={profile}`: Inspects individual cost terms, blocked status, and plain-language explanation at any Mars coordinate.

