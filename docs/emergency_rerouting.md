# Marswalk Emergency Response and Dynamic Rerouting Engine

## 1. Operational Overview & Epistemic Grounding

The **Marswalk Emergency Response and Dynamic Rerouting Engine** provides in-situ contingency simulation, spatial hazard intersection analysis, dynamic obstacle avoidance, and emergency return-to-base (RTB) flight replanning for hypothetical extravehicular activities (EVAs) traversing Jezero Crater, Mars.

Surface exploration operations on Mars face unforeseen physical hazards: newly resolved boulder fields, moving aeolian sand ripples, cliff-scarp rockfalls, sensor dust degradation, and spacesuit life-support anomalies. When an active traversal corridor is severed or compromised, an autonomous or decision-support system must immediately:
1. Detect which portion of the active route is affected.
2. Invalidate impassable terrain or apply traversal resistance penalties.
3. Compute a verified, constraint-satisfying alternative corridor from the crew's current position.
4. Recalculate operational walking durations, rest pauses, contingency buffers, and spacesuit consumable draws ($O_2$ and battery watt-hours).
5. Generate human-readable tactical explanations of why the path changed and the trade-offs incurred.

### Epistemic Status (per `AGENTS.md`)
- **Topography & Terrain Baselines:** `OBSERVED` (HiRISE/CTX DTMs) & `DERIVED` (slopes, TRI, hazard masks).
- **Hazard Incident Injections:** `SIMULATED` (documented, non-random synthetic contingencies).
- **Rerouted Path Calculations:** `DERIVED` from graph search algorithms (A* / Dijkstra).
- **Consumable & Timeline Replanning:** `SIMULATED` / `HEURISTIC` (illustrative engineering models).
- **Mandatory Caveat:** **Marswalk Planner is not an operational flight system.** This engine is an illustrative research prototype and does not certify astronaut safety or mission survival.

```
                  ┌───────────────────────────────────────────────┐
                  │ Active Planned Route (Start, Dest, Profile)   │
                  └───────────────────────┬───────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  │ Injected Contingency (Curated or Custom)      │
                  │ - Center (lat, lon), Radius (m), Type         │
                  │ - Hard Barrier vs. Soft Multiplier            │
                  └───────────────────────┬───────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  │ Spatial Intersection & Impact Evaluation      │
                  │ - Checks waypoints within hazard footprint    │
                  │ - Evaluates destination & crew proximity      │
                  └───────────────────────┬───────────────────────┘
                                          │
             ┌────────────────────────────┴────────────────────────────┐
             ▼                                                         ▼
   [Route Not Affected]                                       [Route Affected / Abort]
   Buffer preserved > radius                                  Reroute from Crew Position
             │                                                         │
             ▼                                                         ▼
   Original Path Confirmed                             ┌───────────────────────────────┐
                                                       │ Costmap Modification:         │
                                                       │ - Extra hard barrier mask     │
                                                       │ - Traversal drag multipliers  │
                                                       └───────────────┬───────────────┘
                                                                       │
                                                       ┌───────────────┴───────────────┐
                                                       │ Graph Pathfinding:            │
                                                       │ - Normal: Crew -> Destination │
                                                       │ - RTB: Crew -> Base Camp      │
                                                       └───────────────┬───────────────┘
                                                                       │
                                                       ┌───────────────┴───────────────┐
                                                       │ Mission Consumables Replanning│
                                                       │ - Recalculate duration & O2   │
                                                       │ - Compare original vs reroute │
                                                       └───────────────┬───────────────┘
                                                                       │
                                                       ┌───────────────┴───────────────┐
                                                       │ Tactical Intelligence Summary │
                                                       │ - Plain-language explanation  │
                                                       │ - Feasibility & safety alerts │
                                                       └───────────────────────────────┘
```

---

## 2. Six Supported Contingency Scenarios

The engine provides 6 authentic, deterministic contingency scenarios situated in the Jezero Western Delta:

### Scenario 1: Newly Detected Boulder Field (`NEW_BOULDER_FIELD`)
- **Location:** Western Fan Apron ($18.4485^\circ\text{N}, 77.4320^\circ\text{E}$), Radius: $120\text{ m}$.
- **Mechanism:** HiRISE stereo update reveals a meter-scale block field with severe obstacle entrapment risk.
- **Handling:** Affected cells marked as hard impassable (`extra_hard_blocked = True`). Path circumvents the cluster through lower-roughness terrain.

### Scenario 2: Active Sand / Dune Bedform Restriction (`SAND_DUNE_RESTRICTION`)
- **Location:** South Delta Channel Depression ($18.4470^\circ\text{N}, 77.4250^\circ\text{E}$), Radius: $160\text{ m}$.
- **Mechanism:** Active transverse aeolian ripples (TARs) with loose regolith and high slip slope angles.
- **Handling:** Soft cost penalty ($8.0\times$ traversal resistance). The router detours unless avoiding it incurs excessive climbing.

### Scenario 3: Sudden Escarpment Rockfall & Pass Closure (`SUDDEN_ROUTE_CLOSURE`)
- **Location:** Narrow Delta Access Pass ($18.4505^\circ\text{N}, 77.4200^\circ\text{E}$), Radius: $100\text{ m}$.
- **Mechanism:** Severe scarp collapse deposits impassable scree blocks across the direct path corridor.
- **Handling:** Hard impassable barrier. Reroutes crew through an alternate northern saddle.

### Scenario 4: Sensor Drift & Topographic Uncertainty Surge (`INCREASED_UNCERTAINTY`)
- **Location:** Delta Ridge Crest ($18.4490^\circ\text{N}, 77.4280^\circ\text{E}$), Radius: $220\text{ m}$.
- **Mechanism:** Localized atmospheric dust plume degrades optical stereo correlation ($\sigma_z > 3.0\text{ m}$).
- **Handling:** Cost multiplier ($5.0\times$). Reroutes along high-confidence, well-surveyed bedrock surfaces.

### Scenario 5: Destination Inaccessible (`DESTINATION_INACCESSIBLE`)
- **Location:** Kodiak Remnant Outcrop Target ($18.4550^\circ\text{N}, 77.4050^\circ\text{E}$), Radius: $150\text{ m}$.
- **Mechanism:** Structural failure along the perimeter scarp blocks the target science outcrop.
- **Handling:** Flags destination as impassable. `is_feasible = False`, `rerouted_route = None`. Emits diagnostic reasoning instructing crew to abort mission.

### Scenario 6: Emergency Return-to-Base Sortie Abort (`RETURN_TO_BASE`)
- **Location:** Mid-traverse position along delta traverse ($18.4495^\circ\text{N}, 77.4260^\circ\text{E}$).
- **Mechanism:** Spacesuit PLSS primary pressure regulator anomaly; mission aborted.
- **Handling:** Re-targets route to Base Camp ($18.4446^\circ\text{N}, 77.4509^\circ\text{E}$) using the ultra-conservative `SAFETY_FIRST` profile.

---

## 3. Mathematical & Algorithmic Formulation

### 3.1 Spatial Intersection Detection
Given an active route $\mathcal{W} = \{w_0, w_1, \dots, w_N\}$ where each waypoint has projected coordinates $(x_i, y_i)$, and a simulated hazard centered at $(x_h, y_h)$ with radius $R$:
$$\mathcal{I}_{\text{affected}} = \{i \mid \sqrt{(x_i - x_h)^2 + (y_i - y_h)^2} \le R\}$$
- If $|\mathcal{I}_{\text{affected}}| > 0$: The route is flagged as compromised.
- Segment length: $L_{\text{affected}} = d(w_{\max(\mathcal{I})}) - d(w_{\min(\mathcal{I})})$.
- Destination check: If $d_{\text{dest}} \le R$ and the hazard is a hard restriction, destination is unreachable.

### 3.2 In-Situ Costmap Modification
For all grid cells $(r, c)$ whose geographic position falls within Euclidean distance $R$ of the incident:
$$\begin{aligned}
\text{If hard restriction:} & \quad \mathcal{M}_{\text{hard\_blocked}}[r, c] = \text{True} \\
\text{If soft penalty:} & \quad \mathcal{C}_{\text{effective}}[r, c] = \mathcal{C}[r, c] \cdot \max(1.0, \mu_{\text{cost}})
\end{aligned}$$

### 3.3 Dynamic Origin & Abort Rerouting
- **Sortie Continuance:** Origin is set to crew's current position $(lat_{\text{crew}}, lon_{\text{crew}})$, and destination remains $(lat_{\text{dest}}, lon_{\text{dest}})$.
- **Return-to-Base Abort:** Origin is set to $(lat_{\text{crew}}, lon_{\text{crew}})$, and destination is redirected to Base Camp $(lat_{\text{base}}, lon_{\text{base}})$.

### 3.4 Consumables & Timeline Recalculation
Traverse duration $\Delta T_{\text{walk}}$ is evaluated based on terrain slope and cost-adjusted walking speed:
$$v(r, c) = \frac{v_0}{\sqrt{\mathcal{C}_{\text{effective}}[r, c]}}$$
Oxygen consumption proxy and battery draw are re-evaluated via `EVAMissionCalculator`:
$$\Delta O_2 = O_{2,\text{rerouted}} - O_{2,\text{original}}, \quad \Delta E_{\text{batt}} = E_{\text{rerouted}} - E_{\text{original}}$$

---

## 4. API Endpoints

- `GET /api/v1/emergency/scenarios` — Lists all 6 curated contingency scenarios.
- `POST /api/v1/emergency/simulate` — Ingests route parameters, crew progress (0.0 to 1.0), and hazard payload. Returns comparison metrics, reroute plan, reasoning, and GeoJSON.
- `POST /api/v1/emergency/abort-to-base` — Quick-trigger endpoint to calculate immediate return-to-base from current crew coordinates.

---

## 5. Non-Operational Prototype Disclaimer

In strict accordance with `AGENTS.md`:
> Marswalk Planner is a **research and decision-support prototype**. Martian hazard simulation and emergency rerouting algorithms are illustrative models. They do NOT certify, guarantee, or validate operational astronaut safety, life-support survival, or space agency flight rules.

