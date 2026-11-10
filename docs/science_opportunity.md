# Marswalk Scientific Opportunity Engine

> [!IMPORTANT]
> **Scientific Integrity & Safety Disclaimers**
> 1. **Non-Inference of Life**: Mineral signatures (smectite clays, carbonates, hydrated sulfates) indicate abiotic aqueous geochemical processes and high organic preservation potential. They **do not confirm or infer past or present extraterrestrial life**.
> 2. **Robotic Ground Truth vs. Human Foot Safety**: Documented NASA Perseverance rover waypoints demonstrate historic robotic exploration. Rover tracks and robotic wheel mobility **do not imply that surrounding terrain is passable or safe for human extravehicular foot travel**. All hazards must be evaluated separately via the Hazard Intelligence Engine.

---

## 1. Overview & Objectives

The **Marswalk Scientific Opportunity Engine** evaluates multi-criteria exploration value across the Jezero Western Fan and Delta study region ($18.39^\circ\text{–}18.59^\circ\text{ N}$, $77.34^\circ\text{–}77.47^\circ\text{ E}$).

It identifies, quantifies, and ranks candidate scientific exploration targets by combining:
- **CRISM targeted hyperspectral observations** (`FRT000047A3`, Viviano-Beck et al. 2014, Goudge et al. 2015, Tarnas et al. 2019).
- **USGS Geologic Mapping** (SIM 3464, Sun & Stack 2020).
- **High-resolution topography and slope derivatives** (USGS TRN HiRISE 1m DTM & CTX 20m DTM).
- **In-situ NASA Perseverance rover telemetry** (M20 PLACES waypoints and traverse).

---

## 2. The Six Opportunity Layers

All individual layers are normalized to a documented $[0.0, 1.0]$ continuous scale:

| Opportunity Layer | Primary Data Source | Physical / Geological Basis | Epistemic Class |
|---|---|---|---|
| **1. Mineralogical Interest ($s_{\text{mineralogy}}$)** | CRISM MTRDR (`FRT000047A3`) | Absorption band parameters: Fe/Mg smectite clay (`BD1900`/`BD2300`), marginal Mg-carbonates (`BD2300`/`BD2500`), and crater floor olivine (`OLINDEX3`). | `DERIVED` |
| **2. Geological Diversity ($s_{\text{diversity}}$)** | USGS SIM 3464 & Topography | Spatial gradient across lithological boundaries (e.g. igneous floor meeting lacustrine delta mudstones, or delta topset contacting basement). | `INTERPRETED` |
| **3. Layered Stratigraphy ($s_{\text{layered}}$)** | HiRISE / CTX DTM Slopes | Exposed sedimentary bedding and cross-strata on scarps ($8^\circ \le \text{slope} \le 24^\circ$) at delta scarp and remnant butte elevations. | `DERIVED` |
| **4. Delta Geomorphology ($s_{\text{delta}}$)** | USGS DTM & Geomorphology | Sedimentary fan deposit envelope ($-2580\text{ m} \le z \le -2350\text{ m}$) radiating from the Neretva Vallis delta breach. | `INTERPRETED` |
| **5. Rover Proximity ($s_{\text{proximity}}$)** | NASA Perseverance Telemetry | Exponential distance decay ($\exp(-d / d_{\text{decay}})$) from 351 documented in-situ rover observation waypoints. | `OBSERVED` |
| **6. Data Confidence ($s_{\text{confidence}}$)** | Provenance Mask | Native spatial resolution: HiRISE 1m DTM ($1.0$), CTX 20m DTM ($0.75$), unmapped NoData ($0.0$). | `DERIVED` |

---

## 3. Multi-Criteria Opportunity Formulation

The composite opportunity score $S_{\text{opp}}$ is computed as a weighted linear combination:

$$S_{\text{opp}} = \sum_{k} w_k \cdot s_k$$

Default configurable weights (in [`ScienceProfile`](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/backend/app/science/config.py)):
- Mineralogical Interest ($w_{\text{mineralogy}}$): `0.30`
- Geological Diversity ($w_{\text{diversity}}$): `0.20`
- Layered Stratigraphy ($w_{\text{layered}}$): `0.15`
- Delta Context ($w_{\text{delta}}$): `0.15`
- Rover Proximity ($w_{\text{proximity}}$): `0.10`
- Data Confidence ($w_{\text{confidence}}$): `0.10`

---

## 4. Ranked Candidate Target Locations

Local maxima peaks in $S_{\text{opp}}$ with minimum spatial separation of $300\text{ m}$ are automatically extracted and cataloged in [`data/catalog/jezero_western_delta_20m_science_targets.json`](file:///Users/vridhivazirani/marswalk-planner/marswalk-planner/data/catalog/jezero_western_delta_20m_science_targets.json):

1. **`SCI-01-KODIAK`** ($18.459^\circ\text{ N}, 77.408^\circ\text{ E}$, $-2514.4\text{ m}$):
   Isolated erosional delta remnant butte displaying complete topset, dipping foreset, and bottomset cross-bedding strata with clay-bearing facies.
2. **`SCI-02-HAWKSBILL`** ($18.503^\circ\text{ N}, 77.353^\circ\text{ E}$, $-2468.1\text{ m}$):
   Hawksbill Gap Delta Front Scarp exposing finely layered lacustrine mudstone and clay formations.
3. **`SCI-03-CARBONATE-UNCONF`** ($18.454^\circ\text{ N}, 77.398^\circ\text{ E}$, $-2506.7\text{ m}$):
   Marginal Carbonate Unconformity contact recording ancient paleolake precipitation and alkaline water chemistry.
4. **`SCI-04-BELVA-CRATER`** ($18.441^\circ\text{ N}, 77.409^\circ\text{ E}$, $-2522.0\text{ m}$):
   Impact excavation into delta strata exposing vertical cross-sections of ancient fluvial conglomerate channels.
5. **`SCI-05-THREE-FORKS`** ($18.513^\circ\text{ N}, 77.352^\circ\text{ E}$, $-2455.3\text{ m}$):
   Distal bottomset mudstones with maximal organic matter preservation potential.
6. **`SCI-06-SEITAH-CONTACT`** ($18.435^\circ\text{ N}, 77.412^\circ\text{ E}$, $-2535.1\text{ m}$):
   Séítah Formation olivine-rich igneous cumulate contact zone for igneous petrology.

---

## 5. REST API Endpoints

- `GET /api/v1/science/profile`: Returns configurable opportunity weights, thresholds, and disclaimer notices.
- `GET /api/v1/science/raster/opportunity.png`: Serves high-contrast RGB heatmap (Deep Indigo $\rightarrow$ Teal $\rightarrow$ Amber $\rightarrow$ Bright Gold).
- `GET /api/v1/science/targets`: Serves GeoJSON FeatureCollection of ranked candidate targets.
- `GET /api/v1/science/inspect?lat={lat}&lon={lon}`: Explains the multi-criteria score and geological breakdown at any Mars coordinate.

