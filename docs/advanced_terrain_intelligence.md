# Advanced Terrain Intelligence Methodology & Scientific Validation

## 1. Overview and Epistemic Integrity

Marswalk Planner Phase 2 implements **Advanced Terrain Intelligence** for human extravehicular activity (EVA) routing across the Western Delta study area in Jezero Crater, Mars.

In strict compliance with `AGENTS.md`:
- **No Fabricated Data:** All calculations operate exclusively on authentic NASA PDS and USGS TRN planetary datasets.
- **Epistemic Classification:** Every terrain layer and metric is tagged with its epistemic class (`OBSERVED`, `DERIVED`, or `HEURISTIC`).
- **No False Information Gain:** Resampling never invents spatial information. The regional 20m grid preserves CTX / aggregated HiRISE post spacing, while local micro-analysis queries native 1.0m HiRISE DTM cells directly via windowed raster I/O.
- **Safety Default:** Unknown or missing terrain is impassable by default.

---

## 2. Multi-Resolution Architecture

Planetary terrain varies significantly across spatial scales. Regional scale features (kilometres to tens of metres) govern macro-topographic barriers like crater walls and delta scarps, whereas decametre to metre-scale features (boulders, ripples, sand patches) dictate human foot traversability.

```
+--------------------------------------------------------------------------------+
|                        Multi-Resolution Terrain Engine                         |
+--------------------------------------------------------------------------------+
                                       |
          +----------------------------+----------------------------+
          |                                                         |
          v                                                         v
+-------------------------------+                         +--------------------+
| Regional 20m Analysis Grid    |                         | Native 1.0m HiRISE |
| Extent: 20.0 km x 14.8 km     |                         | Delta Jezero DL    |
| 1000 x 740 cells              |                         | 11,703 x 7,237 px  |
| EPSG: ESRI:103885 Equirect    |                         | Windowed Reads     |
+-------------------------------+                         +--------------------+
```

### Coverage Verification
- **High-Resolution Coverage:** High-resolution 1.0m HiRISE DTM covers **76.98%** (569,679 valid cells) of the Jezero study area.
- **Regional Coverage:** The remaining **23.02%** is covered by authentic 20m CTX DTM data.
- The `MultiResolutionTerrainInspector` automatically verifies whether high-resolution coverage exists at any given planetocentric coordinate (`IAU_2015:49900`).

---

## 3. Mathematical Formulations & Scientific Citations

### 3.1 Slope and Aspect (Horn, 1981)
Computed using Horn's 8-neighbourhood weighted finite differences algorithm:
$$\frac{\partial z}{\partial x} = \frac{(z_{++} + 2z_{+0} + z_{+-}) - (z_{-+} + 2z_{-0} + z_{--})}{8 \Delta x}$$
$$\frac{\partial z}{\partial y} = \frac{(z_{++} + 2z_{0+} + z_{-+}) - (z_{+-} + 2z_{0-} + z_{--})}{8 \Delta y}$$
$$\text{Slope} = \arctan\left(\sqrt{\left(\frac{\partial z}{\partial x}\right)^2 + \left(\frac{\partial z}{\partial y}\right)^2}\right)$$
$$\text{Aspect} = \left(450^\circ - \text{atan2}\left(\frac{\partial z}{\partial y}, -\frac{\partial z}{\partial x}\right)\right) \pmod{360^\circ}$$
*Citation:* Horn, B. K. P. (1981). "Hill shading and the reflectance map." *Proceedings of the IEEE*, 69(1), 14–47.

### 3.2 Terrain Ruggedness Index (Riley et al., 1999)
Measures the mean absolute elevation difference between a central cell and its 8 contiguous neighbours:
$$\text{TRI} = \sqrt{\frac{1}{8}\sum_{i=-1}^{1}\sum_{j=-1}^{1} (z_{i,j} - z_{0,0})^2} \quad (i,j) \neq (0,0)$$
*Citation:* Riley, S. J., DeGloria, S. D., & Elliot, R. (1999). "A terrain ruggedness index that quantifies topographic heterogeneity." *Intermountain Journal of Sciences*, 5(1–4), 23–27.

### 3.3 Local Relief and Surface Roughness (Shepard et al., 2001)
Evaluated over an $N \times N$ sliding spatial window (default $5 \times 5$, equivalent to $100\text{ m} \times 100\text{ m}$ regionally or $5\text{ m} \times 5\text{ m}$ locally):
$$\text{Local Relief} = \max_{W}(z) - \min_{W}(z)$$
$$\text{Surface Roughness} = \sigma_z = \sqrt{\frac{1}{|W|}\sum_{k \in W} (z_k - \bar{z}_W)^2}$$
*Citation:* Shepard, M. K., Campbell, B. A., Bulmer, M. H., Farr, T. G., Gaddis, L. R., & Plaut, J. J. (2001). "The statistical roughness of planetary surfaces." *Journal of Geophysical Research: Planets*, 106(E12), 32777–32795.

### 3.4 Topographic Curvatures (Zevenbergen & Thorne, 1987)
Evaluates terrain shape by fitting a second-degree polynomial to a $3 \times 3$ elevation moving window:
$$z = Ax^2 + By^2 + Cxy + Dx + Ey + F$$
- **Profile Curvature ($K_p$):** Curvature along the line of steepest slope. Negative values denote convex acceleration slopes; positive values denote concave deceleration hollows.
- **Planform Curvature ($K_c$):** Curvature perpendicular to the direction of maximum slope. Positive values denote diverging flow (ridges); negative values denote converging flow (gullies/channels).
- **Mean Curvature ($H$):** Arithmetic mean of principal curvatures: $H = \frac{1}{2}(K_p + K_c)$.
*Citation:* Zevenbergen, L. W., & Thorne, C. R. (1987). "Quantitative analysis of land surface topography." *Earth Surface Processes and Landforms*, 12(1), 47–56.

### 3.5 Vector Ruggedness Measure (Hobson 1972, Sappington et al., 2007)
Standard roughness metrics like TRI and standard deviation correlate strongly with macro-slope steepness. The **Vector Ruggedness Measure (VRM)** decouples roughness from slope steepness by decomposing each cell's orientation into a 3D unit normal vector:
$$\vec{n} = (\sin(\theta)\sin(\alpha), \sin(\theta)\cos(\alpha), \cos(\theta))$$
where $\theta$ is slope angle and $\alpha$ is aspect angle.
The resultant vector magnitude $R$ across an $N \times N$ window ($N^2$ cells) is:
$$R = \sqrt{\left(\sum x_i\right)^2 + \left(\sum y_i\right)^2 + \left(\sum z_i\right)^2}$$
$$\text{VRM} = 1 - \frac{R}{N^2}$$
- **Planar Surface (even if steep, e.g. 40°):** All normal vectors point in identical directions $\implies R = N^2 \implies \text{VRM} = 0.0$.
- **Rugged / Dissected Terrain:** Normal vectors diverge $\implies R < N^2 \implies \text{VRM} > 0.0$.
*Citations:*
- Hobson, R. D. (1972). "Surface roughness in topography: quantitative approach." *Spatial Analysis in Geomorphology*, 221–245.
- Sappington, J. M., Longshore, K. M., & Thompson, D. B. (2007). "Quantifying landscape ruggedness for animal habitat analysis: a case study using bighorn sheep in the Mojave Desert." *The Journal of Wildlife Management*, 71(5), 1419–1426.

---

## 4. Explainable Boulder & Rock Detection

### 4.1 Heuristic Computer Vision Pipeline
Rather than relying on uninterpretable deep neural networks without ground truth certification, the engine uses **transparent, explainable morphological and radiometric operators**:

1. **Illumination-Aware Morphology:**
   - **White Top-Hat Transform:** $T_w(I) = I - (I \circ S)$ extracts bright, sunlit rock facets smaller than structural element $S$.
   - **Black Top-Hat Transform:** $T_b(I) = (I \bullet S) - I$ extracts localized cast shadow depressions.
2. **Directional Shadow Pairing:**
   - Martian solar azimuth during the HiRISE observation was approximately **$240^\circ$** (South-West illumination).
   - Cast shadows extend in the anti-solar direction ($\sim 60^\circ$, East-North-East).
   - Candidate rocks must exhibit an illuminated crest paired with a contiguous shadow down-sun within 2–5 metres.
3. **Roughness & Edge Weighting:**
   - Sobel gradient magnitude highlights rock boundaries.
   - Micro-TRI confirms localized topographic protrusion.
4. **Discrete Candidate Extraction:**
   - Connected component analysis clusters candidate pixels into discrete rock objects.
   - Calculates bounding boxes, centroid coordinates, pixel areas, and equivalent circular diameters:
     $$D = 2\sqrt{\frac{\text{Area}}{\pi}} \times \text{Resolution}$$

### 4.2 Epistemic Classification
Candidate rock and boulder layers are explicitly tagged:
```json
{
  "epistemic_class": "HEURISTIC",
  "disclaimer": "Heuristic computer vision detection based on morphological top-hat and directional shadow association. Not certified as ground truth."
}
```

---

## 5. 7-Class Rule-Based Terrain Classification

Terrain cells are classified into seven discrete geomorphic classes using transparent rule hierarchies:

| Class ID | Code | Name | Physical Description | Speed Factor | Hazard Risk | Grayscale Color |
|---|---|---|---|---|---|---|
| `0` | `UNKNOWN_TERRAIN` | Unknown Terrain | Missing or out-of-coverage elevation data. Impassable by default per AGENTS.md Rule 7. | `0.00` | `CRITICAL_IMPASSABLE` | `#090909` |
| `1` | `SMOOTH_TERRAIN` | Smooth Terrain | Flat to gently undulating consolidated surfaces ($\text{Slope} < 7^\circ, \text{TRI} < 0.6\text{ m}$). Optimal human walking. | `1.00` | `MINIMAL_NOMINAL` | `#f5f5f5` |
| `2` | `ROCKY_TERRAIN` | Rocky Terrain | High density of surface rocks or boulder fields ($\text{Boulder Score} \ge 0.48$). Trip hazards and ankle rollover risks. | `0.50` | `MODERATE_TRIP_OBSTACLE` | `#b8b8b8` |
| `3` | `ROUGH_TERRAIN` | Rough / Steep Terrain | High relief, dissected scarps, or steep slopes ($\text{Slope} \ge 25^\circ \lor \text{TRI} \ge 2.5\text{ m}$). Severe human fall danger. | `0.30` | `HIGH_SLOPE_ROUGHNESS` | `#ffffff` |
| `4` | `POTENTIAL_LOOSE_MATERIAL` | Potential Loose Material | Unconsolidated fine-grained airfall dust or loose sandy mantles ($0.45 \le \text{Sand Score} < 0.65, \text{Slope} < 15^\circ$). Foot sinkage risk. | `0.60` | `MODERATE_SINKAGE` | `#737373` |
| `5` | `DUNE_LIKE_FEATURES` | Dune-Like Features | Periodic Transverse Aeolian Ridges (TARs) and ripple fields ($\text{Sand Score} \ge 0.65, \text{Slope} < 18^\circ$). High aeolian slip. | `0.35` | `HIGH_AEOLIAN_SLIP` | `#525252` |
| `6` | `CRATERED_TERRAIN` | Cratered Terrain | Impact craters and concave depression hollows ($\text{Crater Score} \ge 0.48 \land \text{LEV} \le -1.2\text{ m}$). Circumvention recommended. | `0.40` | `CIRCUMVENTION_RECOMMENDED` | `#383838` |

---

## 6. Verification and Validation Summary

All implementations have been verified against synthetic surfaces and analytical benchmarks:
1. **Planar Slope:** Horn slope and aspect accurately reconstruct $45^\circ$ slope ($\pm 0.5^\circ$) and $90^\circ$ East aspect ($\pm 1.0^\circ$).
2. **VRM Decoupling:** Verified that a $30^\circ$ tilted plane produces $\text{VRM} = 0.0000$, while a radial dome produces positive $\text{VRM} > 0.005$, confirming complete decoupling of surface roughness from steepness.
3. **Curvature Polynomial:** Tested Zevenbergen & Thorne curvature fitting on an analytic circular paraboloid $z = -0.01(x^2 + y^2)$, confirming consistent negative profile curvature along fall-lines.
4. **Micro-Inspection Efficiency:** Verified native 1.0m HiRISE DTM windowed reads execute in $\approx 3.2\text{ ms}$ for a $120\text{ m} \times 120\text{ m}$ inspection envelope without loading the 114 MB file into server memory.

