# Marswalk Terrain Intelligence — Methodology & Limitations

> [!CAUTION]
> Marswalk Planner is a research and education decision-support prototype. It is not NASA software, has not been certified or endorsed by NASA, and must never claim operational astronaut safety.

This document details the scientific algorithms, computer vision methods, heuristic classification rules, and physical limitations of the **Marswalk Terrain Intelligence Engine**.

---

## 1. Feasibility Assessment of Supervised Machine Learning

### Question: Is a deep supervised segmentation model (e.g. U-Net / SegNet) scientifically justifiable at this stage?
**Scientific Assessment:** **NO, deep supervised segmentation is not scientifically justified without verified ground-truth labels.**

### Justification:
1. **Lack of Verified Ground-Truth Labels:** No certified pixel-level terrain classification dataset exists for human EVA traversability at Jezero Crater. Training a high-capacity convolutional neural network on arbitrary visual proxies or synthetic labels introduces severe domain shift and overconfidence.
2. **Explainability & Astronaut Safety Decision Support:** Human EVA planning requires traceable, inspectable reasoning. If a path is blocked, the astronaut or mission planner must see the physical cause (e.g. `SLOPE_GT_25_DEG` or `BOULDER_ROUGHNESS_EXCEEDED`), rather than an uninterpretable softmax probability output from an opaque neural network.
3. **Epistemic Integrity:** Under `AGENTS.md`, we never fabricate training annotations or pretend an experimental model has operational fidelity. Heuristic models are explicitly assigned the `HEURISTIC` epistemic class.

---

## 2. Terrain Metrics & Computer Vision Algorithms

### 2.1 Slope & Aspect (Horn's Method)
- **Algorithm:** Horn (1981) $3 \times 3$ finite-difference convolution.
- **Formulas:**
  $$\frac{\partial z}{\partial x} = \frac{(c + 2f + i) - (a + 2d + g)}{8 \cdot \Delta x}, \quad \frac{\partial z}{\partial y} = \frac{(g + 2h + i) - (a + 2b + c)}{8 \cdot \Delta y}$$
  $$\theta = \arctan\left(\sqrt{\left(\frac{\partial z}{\partial x}\right)^2 + \left(\frac{\partial z}{\partial y}\right)^2}\right)$$
- **Role:** Primary traversability metric. Cells with $\theta \ge 25^\circ$ trigger hard impassable safety constraints (`STEEP_SCARP_CLIFF`).

### 2.2 Terrain Ruggedness Index (TRI)
- **Algorithm:** Riley et al. (1999) root-mean-square topographic deviation.
- **Formula:**
  $$\text{TRI} = \sqrt{\frac{1}{8} \sum_{k=1}^8 (z_k - z_0)^2}$$
- **Role:** Quantifies high-frequency micro-roughness in metres.

### 2.3 Local Elevation Variation (LEV)
- **Algorithm:** Topographic relief filter ($5 \times 5$ window):
  $$\text{LEV} = z - \bar{z}_{\text{local}}$$
- **Role:** Differentiates local positive ridges/knolls from negative crater bowls and canyon incisions.

### 2.4 Computer Vision Hazard Detectors
- **Boulder Fields / Rock Outcrops:**
  Combines localized radiometric standard deviation (capturing high-contrast rock faces and cast shadows) with high TRI:
  $$\text{Score}_{\text{boulder}} = 0.6 \cdot \bar{\sigma}_{\text{tex}} + 0.4 \cdot \overline{\text{TRI}}$$
- **Sand Dunes & Transverse Aeolian Ridges (TARs):**
  Identifies uniform, low-roughness surfaces on low to moderate slopes ($\theta < 18^\circ$):
  $$\text{Score}_{\text{sand}} = 0.4 \cdot \text{Smoothness} + 0.35 \cdot (1 - \overline{\text{TRI}}) + 0.25 \cdot (1 - \bar{\theta})$$
- **Crater Depressions:**
  Combines negative LEV with inward-facing rim slopes.

---

## 3. Terrain Classification Legend & Statistics (Western Delta)

| Class ID | Terrain Unit Name | Criteria / Rules | Epistemic Class | Pixel Count ($20\text{m}$) | Area ($\text{km}^2$) |
|---|---|---|---|---|---|
| `0` | **UNKNOWN / NO DATA** | Missing elevation or unmapped raster void | `UNKNOWN` | 0 | 0.00 |
| `1` | **SMOOTH REGOLITH** | Low slope ($\theta < 15^\circ$), low roughness, uniform surface | `HEURISTIC` | 73,622 | 29.45 |
| `2` | **SAND RIPPLES & DUNES** | High sand score ($\ge 0.60$), low TRI, slope $< 15^\circ$ | `HEURISTIC` | 81,403 | 32.56 |
| `3` | **BOULDER FIELD / ROCK** | High rock score ($\ge 0.50$) or $\text{TRI} \ge 2.0\text{ m}$ | `HEURISTIC` | 56,468 | 22.59 |
| `4` | **STEEP SCARP / CLIFF** | Slope $\theta \ge 25.0^\circ$ (Hard Impassable Constraint) | `DERIVED` | 638 | 0.26 |
| `5` | **CRATER / DEPRESSION** | Local Elevation Variation $\le -1.5\text{ m}$ & rim slope | `HEURISTIC` | 1 | $<0.01$ |

---

## 4. Known Physical & Operational Limitations

1. **Sub-Meter Boulder Unobservability:**
   Orbital imagery at $25\text{ cm}$ or $6\text{ m}$ cannot resolve rocks $<1.0\text{ m}$ in diameter. These small tripping hazards must be estimated statistically using power-law size-frequency distributions.
2. **Shadowing Artefacts:**
   Steep northwest-facing crater walls in deep shadow exhibit reduced radiometric texture, which can slightly depress optical boulder scores while topographic slope and TRI remain accurate.
3. **Resolution Sensitivity:**
   At $20\text{ m}$ resolution, steep scarps are smoothed over cell widths. The $1\text{ m}$ HiRISE DTM should always be referenced for fine corridor planning.

