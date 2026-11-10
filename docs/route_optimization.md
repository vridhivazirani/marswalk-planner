# Marswalk Route Optimization Engine

> [!IMPORTANT]
> **Planetary Safety & Epistemic Boundaries**
> - **Simulation Only**: All planned routes and walking durations are heuristic research models. They are **not NASA operational plans** and must **never claim certified astronaut safety**.
> - **Zero-Tolerance Constraint Rule**: No valid route may cross a hard-blocked or unknown cell (`restricted_cells_crossed == 0` and `unknown_cells_crossed == 0`).
> - **Coordinate Reference System**: Traversal routes are computed in the Jezero projected analysis frame (`ESRI:103885`) and delivered as GeoJSON LineStrings in the canonical planetocentric IAU 2015 Mars Sphere (`IAU_2015:49900`).

---

## 1. Graph Formulation & Physical Movement

Route planning operates over an 8-connected grid graph corresponding to the $20.0\text{ m}$ analysis grid:

### A. Physical Step Distances
- **Cardinal Movements** (North, South, East, West):
  $$\Delta s = 20.0\text{ m}$$
- **Diagonal Movements** (NE, NW, SE, SW):
  $$\Delta s = 20.0 \cdot \sqrt{2} \approx 28.2843\text{ m}$$

### B. Cost-Weighted Transition Edges
The transition cost between cell $u$ and adjacent neighbor $v$ is proportional to physical step distance and average traversal resistance:

$$\text{EdgeCost}(u, v) = \Delta s(u, v) \cdot \frac{C(u) + C(v)}{2}$$

Where $C(u) \in [1.0, 10.0]$ is the unified cost multiplier. Because all passable cells have $C \ge 1.0$, edge costs are strictly positive ($\ge 20.0$), guaranteeing convergence.

### C. Diagonal Corner-Cutting Prevention
Diagonal transitions between cell $(r, c)$ and $(r + dr, c + dc)$ across an obstacle vertex are strictly forbidden unless **both** orthogonal adjacent cells $(r + dr, c)$ and $(r, c + dc)$ are passable:

$$\text{PassableDiagonal}((r, c) \rightarrow (r + dr, c + dc)) \iff \text{Passable}(r + dr, c) \land \text{Passable}(r, c + dc)$$

This ensures that routes never clip or squeeze through touching impassable obstacle corners.

---

## 2. Path Search Algorithms & Admissible Heuristic

The engine implements both **A\*** and **Dijkstra** graph search:

### A. Admissible Octile Distance Heuristic for A\*
To guarantee that A\* is mathematically optimal, the heuristic $h(u, \text{goal})$ must be an admissible lower bound ($h(u) \le \text{true remaining cost}$) and consistent (monotone).

On an 8-connected grid where cardinal steps cost $\ge d \cdot C_{\min}$ and diagonal steps cost $\ge d \sqrt{2} \cdot C_{\min}$ (with $C_{\min} = 1.0$ and $d = 20.0\text{ m}$), the optimal admissible heuristic is the **Octile Distance**:

$$\Delta r = |r_u - r_{\text{goal}}|, \quad \Delta c = |c_u - c_{\text{goal}}|$$

$$h(u, \text{goal}) = d \cdot \left[ (\sqrt{2} - 1) \min(\Delta r, \Delta c) + \max(\Delta r, \Delta c) \right] \cdot C_{\min}$$

Because $h(u, \text{goal}) \le \text{shortest physical path} \cdot C_{\min}$, A\* is guaranteed to find the exact minimal cost solution while expanding significantly fewer nodes than Dijkstra.

### B. Dijkstra Uniform-Cost Search
Dijkstra executes with $h(u, \text{goal}) = 0.0$. In testing, A\* and Dijkstra produce the **exact same optimal accumulated cost**, proving mathematical compatibility.

---

## 3. Constraint-Safe Route Simplification

Raw grid paths follow 8-directional jagged steps. The route simplifier uses line-of-sight ray-marching to shortcut intermediate waypoints into direct straight-line legs:

1. Tests straight line-of-sight between non-adjacent waypoints using sub-pixel sampling ($0.25\text{ px}$).
2. If any cell along the direct line is blocked, the shortcut is rejected.
3. If all sampled cells are completely passable, the intermediate waypoints are pulled into a straight segment.

This reduces waypoint count and distance without ever crossing an obstacle or violating traversability constraints.

---

## 4. Multi-Profile Comparative Route Generation

The engine computes three comparative route variants between any start and destination:

| Route Variant | Optimization Profile | Strategy |
|---|---|---|
| **Route A: Lowest Risk** | `SAFETY_FIRST` | Minimizes slope incline, environmental hazards, and sensor uncertainty. Detours around moderate slopes. |
| **Route B: Science Priority** | `SCIENCE_FIRST` | Prioritizes visiting high-value astrobiological units (smectite clays, carbonates, delta outcrops) while strictly respecting hard constraints. |
| **Route C: Balanced Path** | `BALANCED` | Multi-objective compromise balancing mechanical friction, risk, and scientific yield. |

---

## 5. Performance Metrics Evaluated per Route

Every generated route calculates:
- **Total Physical Distance ($m$)**: Geodesic length along the Mars sphere.
- **Accumulated Path Cost**: Integral of edge cost multipliers.
- **Estimated Traversal Duration ($\text{min}$)**: Evaluated using nominal human walking speed ($v_0 = 1.0\text{ m/s}$), modulated by terrain difficulty: $v(c) = v_0 / \sqrt{C(c)}$.
- **Mean Hazard Exposure**: Average environmental hazard along the path ($0.0 - 1.0$).
- **Mean Uncertainty Exposure**: Average topographic vertical uncertainty ($\sigma_z$, metres).
- **Accumulated Science Opportunity**: Total scientific interest encountered.
- **Restricted / Unknown Cells Crossed**: Strictly verified to be **0** for all valid routes.

---

## 6. REST API Endpoints

- `POST /api/v1/routing/plan`: Computes a single optimal route:
  ```json
  {
    "start": {"lat": 18.4446, "lon": 77.4509},
    "destination": {"lat": 18.4550, "lon": 77.4050},
    "profile": "BALANCED",
    "algorithm": "astar",
    "simplify": true
  }
  ```
- `POST /api/v1/routing/suite`: Computes comparative routes for Safety-First, Science-First, and Balanced profiles simultaneously, returning a GeoJSON FeatureCollection with side-by-side metric comparisons.

