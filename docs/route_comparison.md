# Marswalk Multi-Objective Route Comparison Engine

## 1. Executive Summary & Epistemic Grounding

The **Marswalk Route Comparison Service** provides multi-objective trade-off analysis between competing planetary exploration trajectories at Jezero Crater, Mars.

In human planetary surface operations (EVA), path planning cannot be reduced to a single scalar objective. Safety (minimizing environmental hazard exposure and metabolic strain), scientific discovery (maximizing encounters with mineral outcrops, clays, and delta stratigraphy), and suit efficiency (minimizing traverse duration and consumables depletion) are fundamentally competing objectives.

### Non-Negotiable Principle: No Universally Optimal Route
> **OPERATIONAL MULTI-OBJECTIVE PRINCIPLE:** No single route is universally optimal.
> Each trajectory represents a distinct Pareto-optimal trade-off between astronaut safety, scientific return potential, and consumables expenditure. The appropriate route depends on real-time flight rules, suit oxygen budgets, and mission priorities.

### Epistemic Status (per `AGENTS.md`)
- **Topography & Orthoimagery:** `OBSERVED` (authentic HiRISE/CTX rasters from NASA PDS).
- **Slope, Roughness, Hazards:** `DERIVED` (computed via local gradient, TRI, and multi-hazard thresholds).
- **Mineralogical & Geological Context:** `INTERPRETED` (derived from CRISM hyperspectral data and USGS geologic maps).
- **Human EVA Physiology & Speeds:** `HEURISTIC` (illustrative placeholder walk velocity \(v_0 = 1.0\text{ m/s}\), modulated by local terrain cost).
- **Exploration Scenarios:** `SIMULATED` (decision-support prototype trajectories; never claim certified operational astronaut safety).

---

## 2. Multi-Objective Evaluation Metrics

For every computed trajectory, the comparison engine calculates and reports seven key criteria:

| Metric | Epistemic Class | Formula / Source | Operational Significance |
| :--- | :--- | :--- | :--- |
| **Route Length** (\(\text{km}\)) | `DERIVED` | \(\sum_i \sqrt{\Delta x_i^2 + \Delta y_i^2}\) (projected Mars sphere) | Total ground distance traversed. |
| **Estimated Duration** (\(\text{min}\)) | `HEURISTIC` | \(\sum_i \frac{\Delta d_i}{v_i}\) where \(v_i = \frac{v_0}{\sqrt{\text{cost}_i}}\) | Suit oxygen & battery consumable budget impact. |
| **Mean Hazard Exposure** (\(\%\)) | `DERIVED` | \(\frac{1}{N}\sum_i H(r_i, c_i) \times 100\) | Direct exposure to slopes, boulders, and sand traps. |
| **Elevation Uncertainty** (\(\text{m}\)) | `DERIVED` | \(\frac{1}{N}\sum_i \sigma_z(r_i, c_i)\) | Metric precision of underlying terrain model. |
| **Accumulated Science Score** | `INTERPRETED` | \(\sum_i S(r_i, c_i)\) | Total scientific opportunity encountered along route. |
| **Accumulated Path Cost** | `DERIVED` | Accumulated costmap line integral | Graph search traversal friction metric. |
| **Preference Utility Score** | `HEURISTIC` | Weighted multi-criteria utility \(U \in [0.0, 1.0]\) | Alignment of route metrics with active mission preferences. |

---

## 3. Mission Preferences & Utility Scoring Formulation

Users configure three relative importance weights:
\[
W = (w_{\text{safety}}, w_{\text{science}}, w_{\text{efficiency}}), \quad w_k \ge 0, \quad \sum w_k > 0
\]
The weights are normalized such that:
\[
\bar{w}_k = \frac{w_k}{\sum_{j} w_j}, \quad \sum \bar{w}_k = 1.0
\]

### Normalization across Route Alternatives
For a set of candidate routes \(P = \{\text{Safety-First}, \text{Science-First}, \text{Balanced}\}\):
1. **Efficiency Utility (\(u_{\text{eff}}\)):** Inverted duration (shorter is better):
   \[
   u_{\text{eff}} = 1.0 - \frac{T - T_{\min}}{\max(0.1, T_{\max} - T_{\min})}
   \]
2. **Safety Utility (\(u_{\text{saf}}\)):** Composite of accumulated traversal risk and mean hazard:
   \[
   u_{\text{risk}} = 1.0 - \frac{C - C_{\min}}{\max(1.0, C_{\max} - C_{\min})}, \quad u_{\text{haz}} = 1.0 - \frac{H - H_{\min}}{\max(0.001, H_{\max} - H_{\min})}
   \]
   \[
   u_{\text{saf}} = 0.60 \cdot u_{\text{risk}} + 0.40 \cdot u_{\text{haz}}
   \]
3. **Science Utility (\(u_{\text{sci}}\)):** Direct science opportunity (higher is better):
   \[
   u_{\text{sci}} = \frac{S - S_{\min}}{\max(0.01, S_{\max} - S_{\min})}
   \]

### Total Preference Utility
\[
U_{\text{pref}} = \bar{w}_{\text{safety}} \cdot u_{\text{saf}} + \bar{w}_{\text{science}} \cdot u_{\text{sci}} + \bar{w}_{\text{efficiency}} \cdot u_{\text{eff}} \in [0.0, 1.0]
\]
Routes are ranked by \(U_{\text{pref}}\) descending, dynamically reflecting mission priorities.

---

## 4. Curated Jezero Exploration Scenarios

The engine includes 3 pre-validated authentic exploration scenarios within the Jezero study footprint:

### 1. Delta Infiltration from Octavia E. Butler Landing to Hawksbill Gap
- **Start:** \(18.4446^\circ\text{N}, 77.4509^\circ\text{E}\) (Perseverance touchdown)
- **Destination:** \(18.4550^\circ\text{N}, 77.4050^\circ\text{E}\) (Western Delta front scarp)
- **Suggested Preferences:** Safety 35%, Science 40%, Efficiency 25%
- **Operational Focus:** Traverse crater floor regolith to investigate bottomset deltaic mudstones.

### 2. Kodiak Butte Isolated Delta Remnant Reconnaissance
- **Start:** \(18.4446^\circ\text{N}, 77.4509^\circ\text{E}\) (Landing site)
- **Destination:** \(18.4595^\circ\text{N}, 77.4083^\circ\text{E}\) (Kodiak Butte outcrop)
- **Suggested Preferences:** Safety 30%, Science 50%, Efficiency 20%
- **Operational Focus:** Inspect dipping delta foreset beds and smectite-bearing strata.

### 3. Marginal Carbonate Unconformity Transect
- **Start:** \(18.4550^\circ\text{N}, 77.4050^\circ\text{E}\) (Hawksbill Gap)
- **Destination:** \(18.4544^\circ\text{N}, 77.3982^\circ\text{E}\) (Inner western crater rim contact)
- **Suggested Preferences:** Safety 50%, Science 35%, Efficiency 15%
- **Operational Focus:** Traverse steep marginal terrain to sample ancient magnesium-carbonate deposits.

---

## 5. API Endpoints

### `GET /api/v1/routing/scenarios`
Returns the list of curated exploration scenarios and suggested preferences.

### `POST /api/v1/routing/compare`
Calculates all candidate routes, computes metrics, generates pairwise trade-off commentary, and ranks options according to user preferences.

**Sample Request:**
```json
{
  "start": { "lat": 18.4446, "lon": 77.4509 },
  "destination": { "lat": 18.4550, "lon": 77.4050 },
  "preferences": {
    "safety_importance": 0.40,
    "science_importance": 0.35,
    "efficiency_importance": 0.25
  },
  "algorithm": "astar",
  "simplify": true
}
```

---

## 6. Verification and Reproducibility

Automated tests in `backend/tests/unit/test_route_comparison.py`:
1. `test_route_comparison_reproducibility`: Deterministic consistency across repeated runs.
2. `test_no_universal_optimal_principle`: Guarantees disclaimers and multi-objective descriptions are present.
3. `test_mission_preference_impact_on_utility_ranking`: Verifies that tuning importance weights alters preference ranking reliably.
4. `test_trade_off_analysis_content`: Asserts pairwise trade-off commentary is generated.
5. `test_example_scenarios_query`: Validates all scenario coordinates and metadata.
6. `test_api_scenarios_endpoint` & `test_api_compare_endpoint`: Validates HTTP contract and GeoJSON response format.

