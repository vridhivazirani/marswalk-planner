# Marswalk EVA Mission Planning Engine

## 1. Operational Overview & Epistemic Grounding

The **Marswalk EVA Mission Planning Engine** estimates the operational, physiological, and consumable requirements for hypothetical human extravehicular activities (EVAs) traversing Jezero Crater, Mars.

Human surface exploration on Mars involves strict operational envelopes. Unlike robotic rovers, human planetary traverses are constrained by suit consumable capacities (oxygen, battery power), metabolic heat dissipation, crew muscle fatigue, and surface return-to-base deadlines.

### Epistemic Status (per `AGENTS.md`)
- **Topography & Terrain Metrics:** `OBSERVED` (HiRISE/CTX DTMs) & `DERIVED` (slopes, TRI).
- **Human Physiological & EVA Models:** `HEURISTIC` (illustrative engineering placeholders).
- **Exploration Missions & Consumables:** `SIMULATED` (hypothetical scenario calculations; never claim certified astronaut safety).
- **Certified Spacesuit Specifications:** **None are fabricated.** All parameters are explicitly labeled as unvalidated research prototypes.

```
                    ┌─────────────────────────┐
                    │ Planned Traversal Route │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌──────────────────┐            ┌──────────────────┐
       │ Outbound Trek    │            │ Return Trek      │
       │ (Elevation Profile)           │ (Inverted Slopes)│
       └─────────┬────────┘            └─────────┬────────┘
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │ Total Traversal Time  │
                     └───────────┬───────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
┌──────────────┐          ┌──────────────┐          ┌───────────────────┐
│Science Stops │          │ Rest Pauses  │          │Contingency Reserve│
│(15 min/stop) │          │ (10 min/45m) │          │(25% traversal)    │
└──────┬───────┘          └──────┬───────┘          └─────────┬─────────┘
       │                         │                            │
       └─────────────────────────┼────────────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   Total EVA Duration    │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌──────────────────┐            ┌──────────────────┐
       │ Oxygen Budget    │            │ Battery & Energy │
       │ (Grams Consumed) │            │ (Watt-Hours Draw)│
       └──────────────────┘            └──────────────────┘
```

---

## 2. Mathematical & Operational Formulations

### 2.1 Slope-Modulated Walking Speed on Mars
On Mars (\(g = 3.72\text{ m/s}^2\)), traversing unconsolidated regolith on hills alters walking speed:
- **Level terrain:** Baseline speed \(v_0 = 1.0\text{ m/s}\).
- **Uphill segments (\(\theta \ge 0^\circ\)):** Monotonic deceleration:
  \[
  v_{\text{walk}} = v_0 \cdot \exp(-0.035 \cdot \theta)
  \]
- **Gentle downhill (\(-15^\circ \le \theta < 0^\circ\)):** Slight acceleration (\(v = v_0 \cdot 1.05\)).
- **Steep downhill (\(\theta < -15^\circ\)):** Controlled deceleration for braking and slip avoidance (\(v = v_0 \cdot 0.85\)).
- **Bounded range:** \(v \in [0.20, 1.60]\text{ m/s}\).

### 2.2 Return Journey Inversion
When `is_round_trip` is enabled (standard flight rule: crew must return to lander/habitat):
- The trajectory waypoints are traversed in reverse order (\(N \to 0\)).
- Elevation differences are inverted:
  \[
  \Delta z_{\text{return}} = -\Delta z_{\text{outbound}}
  \]
- Uphill ascents become downhill descents and vice versa.
- A cumulative fatigue deceleration factor (\(k_{\text{fatigue}} = 1.05\)) is applied to the return leg.

### 2.3 Timeline Decomposition
Traversal time is strictly distinguished from total EVA duration:
\[
T_{\text{walk}} = T_{\text{outbound}} + T_{\text{return}}
\]
1. **Planned Science Stops:**
   \[
   T_{\text{science}} = N_{\text{stops}} \cdot \tau_{\text{science}} \quad (\text{default } 15\text{ min/stop})
   \]
2. **Scheduled Rest Pauses:**
   To dissipate metabolic heat and prevent muscle exhaustion, rest is mandated every 45 min of walking:
   \[
   N_{\text{rest}} = \lfloor T_{\text{walk}} / 45\text{ min} \rfloor, \quad T_{\text{rest}} = N_{\text{rest}} \cdot 10\text{ min}
   \]
3. **Contingency Reserve Allowance:**
   Mandatory 25% safety reserve buffer on travel time:
   \[
   T_{\text{reserve}} = T_{\text{walk}} \cdot 0.25
   \]
4. **Total Simulated EVA Duration:**
   \[
   T_{\text{total\_EVA}} = T_{\text{walk}} + T_{\text{science}} + T_{\text{rest}} + T_{\text{reserve}}
   \]

---

## 3. Consumables & Physiological Budgeting

### 3.1 Metabolic Power & Energy Expenditure
- Basal resting power in suit: \(P_{\text{base}} = 120\text{ W}\).
- Level walking power: \(P_{\text{walk0}} = 280\text{ W}\).
- Slope work adjustment: \(P_{\text{step}} = P_{\text{walk0}} + \theta \cdot 14.0\text{ W/deg}\) (for \(\theta \ge 0\)).
- Science stop station power: \(P_{\text{science}} = 180\text{ W}\).
- Total metabolic energy expended (kilocalories):
  \[
  E_{\text{met, kcal}} = \frac{\sum_j P_j \cdot \Delta t_j \text{ (Joules)}}{4184}
  \]

### 3.2 Oxygen Consumption Proxy
Total oxygen consumed per crew member depends on both basal metabolic duration and physical work:
\[
\text{O}_2 \text{ (grams)} = r_{\text{base}} \cdot T_{\text{EVA, hours}} + r_{\text{work}} \cdot E_{\text{metabolic, Wh}}
\]
- \(r_{\text{base}} = 40.0\text{ g/hr}\) (illustrative placeholder).
- \(r_{\text{work}} = 0.16\text{ g/Wh}\).
- Total crew consumption (2-crew buddy system) \(= 2 \times \text{O}_2\).
- Usable suit capacity: \(1200\text{ g}\).
- Remaining margin: \(\frac{1200 - \text{O}_2}{1200} \times 100\%\).

### 3.3 Battery Life Support Energy
- Base life-support power draw: \(P_{\text{life\_support}} = 85\text{ W}\) (ventilation, telemetry, avionics, scrubbing).
- Electrical energy drawn: \(E_{\text{battery}} = 85\text{ W} \cdot T_{\text{EVA, hours}}\).
- Suit battery capacity: \(1800\text{ Wh}\).
- Remaining margin: \(\frac{1800 - E_{\text{battery}}}{1800} \times 100\%\).

---

## 4. Feasibility Rules & Alert Classifications

| Severity | Constraint Code | Trigger Condition | Remediation Guidance |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | `EVA_DURATION_EXCEEDED` | \(T_{\text{EVA}} > 8.0\text{ hours}\) | Shorten distance or deploy robotic precursor. |
| **CRITICAL** | `O2_DEPLETION_PROJECTED` | Remaining \(\text{O}_2 \le 0\text{ g}\) | Mission cannot be flown with current suit O2. Abort. |
| **CRITICAL** | `BATTERY_DEPLETION_PROJECTED` | Remaining Battery \(\le 0\text{ Wh}\) | Power failure before ingress. Abort trek. |
| **WARNING** | `EVA_DURATION_NEAR_LIMIT` | \(T_{\text{EVA}} > 6.8\text{ hours}\) (85% limit) | Strict timekeeping at sampling sites. |
| **WARNING** | `O2_MARGIN_BELOW_RULE` | Remaining \(\text{O}_2 < 20\%\) | Reduce science stops or select faster route. |
| **WARNING** | `BATTERY_MARGIN_LOW` | Remaining Battery \(< 20\%\) | Plan recharge station or expedite return trek. |
| **CAUTION** | `STEEP_SLOPE_FATIGUE` | Peak slope \(\theta_{\max} > 20^\circ\) | Maintain three points of contact on scarp. |
| **ADVISORY** | `LOW_CONTINGENCY_BUFFER` | Reserve buffer \(< 15\text{ min}\) | Allocate higher contingency fraction. |

---

## 5. API Reference

### `GET /api/v1/mission/default-assumptions`
Retrieves baseline placeholder assumptions for crew, suit, and timeline.

### `POST /api/v1/mission/plan`
Computes optimal route and evaluates operational timeline, consumables, and feasibility.

**Sample Request:**
```json
{
  "start": { "lat": 18.4446, "lon": 77.4509 },
  "destination": { "lat": 18.4550, "lon": 77.4050 },
  "profile": "BALANCED",
  "science_stops_count": 2,
  "is_round_trip": true,
  "algorithm": "astar",
  "simplify": true
}
```

### `POST /api/v1/mission/compare`
Calculates side-by-side mission feasibility for Safety-First, Science-First, and Balanced routes.

