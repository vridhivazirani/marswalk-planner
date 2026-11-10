# Marswalk Hazard Intelligence Engine

> [!IMPORTANT]
> **Prototype & Research Disclaimer**
> Marswalk Planner is an academic decision-support prototype. It is **not NASA software** and has **never been certified for astronaut operations**. Planetary hazard scores and thresholds are `HEURISTIC` prototype assumptions and do not represent verified operational EVA human physiology or spacesuit limits.

---

## 1. Architecture: Hard Restrictions vs. Soft Costs

In accordance with Marswalk Geodesy and Scientific Integrity Rules (Section 2, Rule 8), hard traversability restrictions and soft hazard costs are calculated separately and preserved independently:

1. **Hard Traversability Constraints (Binary Masks + Reason Codes)**:
   - Terrain where physical movement is strictly prohibited.
   - Assigned an explicit binary flag (`hard_impassable_mask = True`) and machine-readable reason codes:
     - `NO_DATA_UNKNOWN`: Unmapped / missing elevation data (Rule 7: *Unknown terrain is never safe by default*).
     - `SLOPE_GT_MAX`: Slope $\ge 25.0^\circ$ (exceeds default maximum climbing angle for pressurized rover/EVA suited locomotion).
     - `TRI_GT_MAX`: Terrain Ruggedness Index $\ge 8.0\text{ m}$ (meter-scale boulder field or chaotic terrain impassable to foot travel).
     - Multiple violations are concatenated (e.g., `SLOPE_GT_MAX+TRI_GT_MAX`).
   - Impassable cells automatically receive composite hazard score `1.0`.

2. **Soft Hazard Costs (Continuous Normalized Risk $[0.0, 1.0]$)**:
   - Graded terrain penalties used by pathfinding engines to evaluate traversability, energy expenditure, and mechanical risk.
   - Each layer is normalized independently to a documented $[0.0, 1.0]$ continuous interval.

---

## 2. Individual Hazard Layers & Normalization

All hazard metrics are normalized piecewise linearly between a safe threshold and a critical threshold:

$$\text{Hazard}(x) = \operatorname{clip}\left(\frac{x - x_{\text{safe}}}{x_{\text{critical}} - x_{\text{safe}}}, 0.0, 1.0\right)$$

| Hazard Factor | Physical Metric | Safe Bound ($x_{\text{safe}}$) | Critical Bound ($x_{\text{critical}}$) | Epistemic Class | Description |
|---|---|---|---|---|---|
| **Slope Hazard ($h_{\text{slope}}$)** | Horn's Slope (deg) | $8.0^\circ$ | $25.0^\circ$ | `DERIVED` | Gradient relative to local areoid normal. |
| **Roughness Hazard ($h_{\text{roughness}}$)** | Terrain Ruggedness Index (m) | $0.5\text{ m}$ | $6.0\text{ m}$ | `DERIVED` | Mean local absolute elevation difference across $3\times 3$ window. |
| **Boulder Hazard ($h_{\text{boulder}}$)** | High-frequency Texture + TRI | $0.0$ | $1.0$ | `DERIVED` | Localized boulder / obstacle risk score. |
| **Loose Sand Hazard ($h_{\text{sand}}$)** | Low-slope Smooth Low-albedo | $0.0$ | $1.0$ | `HEURISTIC` | Aeolian sand sheet and dune entrapment risk score. |
| **Crater Hazard ($h_{\text{crater}}$)** | Local Elevation Variation (LEV) | $0.0$ | $1.0$ | `HEURISTIC` | Depression depth and crater slope risk score. |
| **Unknown Data Hazard ($h_{\text{unknown}}$)** | Binary Validity Mask | Valid ($0.0$) | NoData ($1.0$) | `UNKNOWN` | Unmapped terrain (penalized with $1.0$ hazard). |

---

## 3. Composite Risk Evaluation & Epistemic Uncertainty

The overall soft hazard score is computed as a normalized weighted linear combination of individual factors:

$$\text{Hazard}_{\text{composite}} = \sum_{i} w_i \cdot h_i + w_{\text{unc}} \cdot p_{\text{unc}}$$

Where weights default to:
- Slope weight ($w_{\text{slope}}$): `0.35`
- Roughness weight ($w_{\text{roughness}}$): `0.20`
- Boulder weight ($w_{\text{boulder}}$): `0.15`
- Sand / Dune weight ($w_{\text{sand}}$): `0.15`
- Crater weight ($w_{\text{crater}}$): `0.10`
- Sensor Uncertainty weight ($w_{\text{uncertainty}}$): `0.05`

### Epistemic Resolution Penalty
- Cells sourced from HiRISE ($1\text{ m}$ native resolution) receive $0.0$ uncertainty penalty (Confidence: $0.95$).
- Cells sourced from CTX ($20\text{ m}$ native resolution) receive $+0.35$ uncertainty penalty (Confidence: $0.80$).
- Missing / NoData cells receive $1.0$ penalty (Confidence: $0.00$).

---

## 4. API Endpoints

The hazard engine exposes the following REST endpoints under `/api/v1/hazards`:

1. `GET /api/v1/hazards/profile`:
   Returns current configuration of weights, safe bounds, and hard thresholds.
2. `GET /api/v1/hazards/raster/overall.png`:
   Serves a high-contrast RGB heatmap of the Jezero Western Delta composite hazard layer (Green: low risk $\rightarrow$ Yellow $\rightarrow$ Red: high risk $\rightarrow$ Bright Magenta: Impassable).
3. `GET /api/v1/hazards/inspect?lat={lat}&lon={lon}`:
   Inspects an exact Mars coordinate point, returning:
   - Passability flag (`is_passable: true/false`).
   - Hard restriction reason code (e.g. `SLOPE_GT_MAX`, `NO_DATA_UNKNOWN`).
   - Composite risk percentage and individual hazard layer breakdown.
   - Sensor provenance (`HiRISE 1m` or `CTX 20m`) and epistemic confidence.
   - Plain-language scientific explanation of risk factors.

