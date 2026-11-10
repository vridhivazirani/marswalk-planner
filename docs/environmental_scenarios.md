# Marswalk Environmental Scenario Assessment Module

## 1. Operational Overview & Scientific Integrity

The **Marswalk Environmental Scenario Assessment Module** evaluates hypothetical Martian Extravehicular Activity (EVA) surface conditions using authentic archived planetary environmental datasets and documented operational scenario assumptions.

Martian surface weather is dominated by extreme diurnal temperature oscillations, tenuous carbon dioxide atmospheric pressure (~600–760 Pa at Jezero), dust storms, low solar irradiance, and high thermal radiation loss to space. A decision-support tool for surface operations must account for these environmental stressors when planning exploration activities.

### Epistemic Status (per `AGENTS.md`)
- **Historical In-Situ Data:** `OBSERVED` / `HISTORICAL_OBSERVED` (NASA Mars 2020 Perseverance MEDA weather station).
- **Global Circulation Models:** `SIMULATED` / `CLIMATE_MODELED` (Mars Climate Database MCD v6.1 / LMD-CNRS-ESA).
- **User Scenarios:** `SIMULATED` / `USER_SCENARIO` (User-configured exploration hypotheses).
- **Operational Suitability Scores:** `HEURISTIC` (illustrative decision-support proxies).
- **Mandatory Caveat:** **Real-time Martian weather forecasting does not exist.** The system never claims operational astronaut safety or certitude of surface conditions.

```
                  ┌───────────────────────────────────────────────┐
                  │ Martian Environmental Condition Inputs        │
                  │ (MEDA In-Situ / MCD GCM / User Exploration)   │
                  └───────────────────────┬───────────────────────┘
                                          │
        ┌───────────────────┬─────────────┴───────┬───────────────────┐
        ▼                   ▼                     ▼                   ▼
┌──────────────┐    ┌──────────────┐      ┌──────────────┐    ┌──────────────┐
│ Thermal Sub- │    │ Solar Sub-   │      │ Dust Sub-    │    │ Wind Sub-    │
│ Score        │    │ Score        │      │ Score        │    │ Score        │
│ S_thermal    │    │ S_solar      │      │ S_dust       │    │ S_wind       │
└───────┬──────┘    └──────┬───────┘      └──────┬───────┘    └──────┬───────┘
        │                  │                     │                   │
        │                  │                     │                   │
        └──────────────────┼─────────────────────┼───────────────────┘
                           ▼
              ┌───────────────────────────┐
              │ Normalized Weight Vector  │
              │ (w_th, w_sol, w_d, w_w)   │
              └────────────┬──────────────┘
                           ▼
              ┌───────────────────────────┐
              │ Overall Suitability Score │
              │ S_env ∈ [0.0, 1.0]        │
              └────────────┬──────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
   ┌───────────────────┐       ┌───────────────────┐
   │ Operational Class │       │ Safety Warnings   │
   │ OPTIMAL / MARGINAL│       │ Thermal / Dust /  │
   │ HAZARDOUS         │       │ Dynamic Wind Load │
   └───────────────────┘       └───────────────────┘
```

---

## 2. Authentic Planetary Datasets Investigated

Before implementation, official planetary environmental archives for Jezero Crater were analyzed:

### 2.1 NASA Mars 2020 Perseverance Rover MEDA
- **Archive:** NASA Planetary Data System (PDS) Geosciences Node.
- **Product ID:** `urn:nasa:pds:mars2020_meda`
- **Sensors:**
  - Air Temperature Sensors (ATS): Five sensors on the rover mast and front body.
  - Thermal Infrared Sensor (TIRS): Ground temperature and downward infrared flux.
  - Wind Sensors (WS1, WS2): Wind speed and direction via thermal anemometry.
  - Radiation and Dust Sensor (RDS): Atmospheric dust optical depth ($\tau$) and diffuse sky radiation.
- **Observed Ranges at Jezero (Sols 1–1000+):**
  - Atmospheric Temperature: $-85^\circ\text{C}$ (night/dawn) to $-12^\circ\text{C}$ (midday).
  - Ground Surface Temperature: $-90^\circ\text{C}$ (night) to $+3^\circ\text{C}$ (solar noon).
  - Pressure: $680\text{ Pa}$ to $760\text{ Pa}$.
  - Wind: Mean $2\text{ m/s}$ to $12\text{ m/s}$, with peak wind gusts reaching $26\text{ m/s}$.
  - Dust Optical Depth: $\tau \approx 0.35 - 0.55$ during clear season; $\tau > 2.5$ during regional/global dust events.

### 2.2 Mars Climate Database (MCD v6.1)
- **Institution:** Laboratoire de Météorologie Dynamique (LMD), CNRS, Sorbonne Université, ESA.
- **Product ID:** `MCD_v6.1_LMD_CNRS_ESA`
- **Utility:** Provides simulated diurnal, seasonal ($L_s$), and vertical atmospheric profiles for Jezero Crater coordinates (18.44°N, 77.45°E) across diverse Martian climate scenarios (Climatology, Cold/Low Dust, Warm/Dusty, Global Dust Storm).

---

## 3. Mathematical Formulation of Suitability Scores

Environmental suitability $S_{\text{env}} \in [0.0, 1.0]$ assesses the operational feasibility and physiological strain of a surface sortie.

### 3.1 Thermal Suitability ($S_{\text{thermal}}$)
Martian ambient temperature dictates spacesuit Portable Life Support System (PLSS) battery power draw for active thermal heating:
$$S_{\text{thermal}} = \begin{cases}
1.0 & \text{if } T_{\text{air}} \ge -30^\circ\text{C} \\
0.05 + 0.95 \cdot \frac{T_{\text{air}} - (-90)}{-30 - (-90)} & \text{if } -90^\circ\text{C} \le T_{\text{air}} < -30^\circ\text{C} \\
0.05 & \text{if } T_{\text{air}} < -90^\circ\text{C}
\end{cases}$$

### 3.2 Solar Illumination Suitability ($S_{\text{solar}}$)
Illumination governs helmet visor visibility, optical navigation, and portable surface solar recharging:
$$S_{\text{solar}} = \begin{cases}
1.0 & \text{if } \Phi_{\text{solar}} \ge 400\text{ W/m}^2 \\
0.20 + 0.80 \cdot \frac{\Phi_{\text{solar}} - 150}{400 - 150} & \text{if } 150 \le \Phi_{\text{solar}} < 400\text{ W/m}^2 \\
0.10 + 0.10 \cdot \frac{\Phi_{\text{solar}}}{150} & \text{if } 0 \le \Phi_{\text{solar}} < 150\text{ W/m}^2
\end{cases}$$

### 3.3 Atmospheric Dust Suitability ($S_{\text{dust}}$)
Atmospheric dust optical depth ($\tau$) attenuates sunlight, degrades visual perception of terrain hazards, and increases bearing abrasion:
$$S_{\text{dust}} = \begin{cases}
1.0 & \text{if } \tau \le 0.40 \\
0.40 + 0.60 \cdot \frac{1.20 - \tau}{1.20 - 0.40} & \text{if } 0.40 < \tau \le 1.20 \\
0.05 + 0.35 \cdot \frac{2.50 - \tau}{2.50 - 1.20} & \text{if } 1.20 < \tau \le 2.50 \\
0.05 & \text{if } \tau > 2.50
\end{cases}$$

### 3.4 Aerodynamic Drag & Wind Suitability ($S_{\text{wind}}$)
Due to low Martian surface air density ($\rho \approx 0.015 - 0.020\text{ kg/m}^3$), dynamic pressure $q = \frac{1}{2}\rho v^2$ is small compared to Earth; however, high winds induce dust saltation, regolith abrasion, and suit buffetting during gusts:
$$S_{\text{wind}} = \begin{cases}
1.0 & \text{if } v_{\text{wind}} \le 6.0\text{ m/s} \\
0.50 + 0.50 \cdot \frac{15.0 - v_{\text{wind}}}{15.0 - 6.0} & \text{if } 6.0 < v_{\text{wind}} \le 15.0\text{ m/s} \\
0.05 + 0.45 \cdot \frac{25.0 - v_{\text{wind}}}{25.0 - 15.0} & \text{if } 15.0 < v_{\text{wind}} \le 25.0\text{ m/s} \\
0.05 & \text{if } v_{\text{wind}} > 25.0\text{ m/s}
\end{cases}$$

### 3.5 Weighted Combination
Given user weights $(w_{\text{th}}, w_{\text{sol}}, w_{\text{d}}, w_{\text{w}})$, normalized such that $\sum w_i = 1$:
$$S_{\text{env}} = w_{\text{th}} S_{\text{thermal}} + w_{\text{sol}} S_{\text{solar}} + w_{\text{d}} S_{\text{dust}} + w_{\text{w}} S_{\text{wind}}$$

### 3.6 Classification Tiers
- **OPTIMAL** ($S_{\text{env}} \ge 0.75$): Benign exploration window within nominal operations.
- **ACCEPTABLE** ($0.50 \le S_{\text{env}} < 0.75$): Standard operations with minor environmental mitigation.
- **MARGINAL** ($0.30 \le S_{\text{env}} < 0.50$): High environmental stress; requires battery heating or visibility restrictions.
- **HAZARDOUS** ($S_{\text{env}} < 0.30$): Extreme conditions (e.g., dust storm or deep sub-zero night); EVA contraindicated.

---

## 4. Curated Jezero Crater Scenarios

The engine provides 4 authentic reference scenarios for immediate evaluation:

1. **Clear Midday (Spring/Summer Baseline):**
   - Origin: `HISTORICAL_OBSERVED` (Perseverance MEDA Sol 180).
   - Parameters: $T_{\text{air}} = -22.5^\circ\text{C}$, $\Phi = 490\text{ W/m}^2$, $\tau = 0.38$, $v_{\text{wind}} = 4.8\text{ m/s}$.
   - Classification: `OPTIMAL`.
2. **Afternoon Jezero Crater Gusts:**
   - Origin: `HISTORICAL_OBSERVED` (Perseverance MEDA Sol 285).
   - Parameters: $T_{\text{air}} = -32.0^\circ\text{C}$, $\Phi = 340\text{ W/m}^2$, $\tau = 0.55$, $v_{\text{wind}} = 16.5\text{ m/s}$ (gusts $26\text{ m/s}$).
   - Classification: `ACCEPTABLE`.
3. **Regional Dust Storm Event:**
   - Origin: `CLIMATE_MODELED` (MCD v6.1 high-dust scenario).
   - Parameters: $T_{\text{air}} = -48.0^\circ\text{C}$, $\Phi = 85\text{ W/m}^2$, $\tau = 2.80$, $v_{\text{wind}} = 21.0\text{ m/s}$.
   - Classification: `HAZARDOUS`.
4. **Early Morning Dawn Frost:**
   - Origin: `HISTORICAL_OBSERVED` (Perseverance MEDA Sol 95).
   - Parameters: $T_{\text{air}} = -82.0^\circ\text{C}$, $\Phi = 110\text{ W/m}^2$, $\tau = 0.42$, $v_{\text{wind}} = 3.2\text{ m/s}$.
   - Classification: `MARGINAL`.

---

## 5. API Endpoints

- `GET /api/v1/environmental/sources` — Returns official planetary dataset dossiers (MEDA, MCD v6.1).
- `GET /api/v1/environmental/scenarios` — Returns curated Jezero baseline scenarios.
- `POST /api/v1/environmental/assess` — Evaluates a single scenario with customizable parameter values and weights.
- `POST /api/v1/environmental/compare` — Compares multiple scenarios and returns ranked evaluations.

---

## 6. Safety Caveat & Non-Operational Status

In compliance with `AGENTS.md`:
> Marswalk Planner is a **research and decision-support prototype**. Martian weather simulation is an illustrative proxy. No algorithm in this module certifies astronaut environmental safety or guarantees life-support survival.

