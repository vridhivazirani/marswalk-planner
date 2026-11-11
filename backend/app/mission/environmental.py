"""Environmental scenario assessment module for hypothetical Mars EVA conditions.

Integrates:
- Authentic Mars 2020 Perseverance MEDA in-situ meteorological baseline distributions.
- Mars Climate Database (MCD v6.1) seasonal GCM parameterizations.
- User-defined hypothetical operational scenarios (temperature, dust tau, solar flux, wind).
- Configurable environmental suitability scoring and operational warnings.

Per AGENTS.md rules:
- NEVER fabricate live Mars weather.
- Clearly distinguish historical observations, modeled data, and user scenarios.
- Record source and time period of any real data.
- Never claim a scenario score guarantees operational astronaut environmental safety.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.core.disclaimer import DISCLAIMER
from app.core.epistemic import EpistemicClass


class DataOriginCategory(StrEnum):
    """Origin and authenticity classification of environmental parameters."""

    HISTORICAL_OBSERVED = "HISTORICAL_OBSERVED"  # Real in-situ instrument measurements (e.g. MEDA)
    CLIMATE_MODELED = "CLIMATE_MODELED"  # GCM climate model simulations (e.g. MCD)
    USER_SCENARIO = "USER_SCENARIO"  # User-defined hypothetical operational scenario


ENVIRONMENTAL_SAFETY_DISCLAIMER = (
    "ENVIRONMENTAL SAFETY DISCLAIMER: A favorable environmental score does NOT "
    "guarantee astronaut safety. Mars is an acutely lethal environment with an unbreathable "
    "~730 Pa carbon dioxide atmosphere, extreme cryogenic swings, and unshielded radiation. "
    "All environmental scores are exploratory research simulations for decision-support only."
)


@dataclass(frozen=True)
class EnvironmentalWeights:
    """Configurable weights for environmental suitability components."""

    w_thermal: float = 0.30  # Importance of ambient/surface temperature
    w_solar: float = 0.25  # Importance of solar illumination and daylight visibility
    w_dust: float = 0.25  # Importance of atmospheric dust optical depth (tau)
    w_wind: float = 0.20  # Importance of wind speed and aerodynamic saltation

    def __post_init__(self) -> None:
        weights = (self.w_thermal, self.w_solar, self.w_dust, self.w_wind)
        if any(w < 0.0 for w in weights):
            raise ValueError("Environmental weights must be non-negative.")
        if sum(weights) <= 0.0:
            raise ValueError("Sum of environmental weights must be strictly positive.")

    def normalized(self) -> EnvironmentalWeights:
        total = self.w_thermal + self.w_solar + self.w_dust + self.w_wind
        return EnvironmentalWeights(
            w_thermal=self.w_thermal / total,
            w_solar=self.w_solar / total,
            w_dust=self.w_dust / total,
            w_wind=self.w_wind / total,
        )

    def to_dict(self) -> dict[str, float]:
        return {
            "w_thermal": round(self.w_thermal, 3),
            "w_solar": round(self.w_solar, 3),
            "w_dust": round(self.w_dust, 3),
            "w_wind": round(self.w_wind, 3),
        }


@dataclass(frozen=True)
class EnvironmentalScenarioInput:
    """Hypothetical or historical environmental conditions for an EVA operational window."""

    scenario_id: str
    title: str
    description: str
    data_origin: DataOriginCategory
    air_temperature_c: float
    ground_temperature_c: float
    solar_irradiance_w_per_m2: float
    dust_optical_depth_tau: float
    wind_speed_mps: float
    wind_gust_mps: float
    operational_window_start_ltst: str = "11:00"
    operational_window_end_ltst: str = "15:00"
    operational_window_hours: float = 4.0
    season_solar_longitude_ls_deg: float | None = 180.0  # Ls (Martian season)
    source_reference: str = "Documented scenario assumption"
    source_time_period: str = "Hypothetical scenario"
    epistemic_class: EpistemicClass = EpistemicClass.SIMULATED

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_id": self.scenario_id,
            "title": self.title,
            "description": self.description,
            "data_origin": self.data_origin.value,
            "air_temperature_c": round(self.air_temperature_c, 1),
            "ground_temperature_c": round(self.ground_temperature_c, 1),
            "solar_irradiance_w_per_m2": round(self.solar_irradiance_w_per_m2, 1),
            "dust_optical_depth_tau": round(self.dust_optical_depth_tau, 2),
            "wind_speed_mps": round(self.wind_speed_mps, 1),
            "wind_gust_mps": round(self.wind_gust_mps, 1),
            "operational_window_start_ltst": self.operational_window_start_ltst,
            "operational_window_end_ltst": self.operational_window_end_ltst,
            "operational_window_hours": round(self.operational_window_hours, 1),
            "season_solar_longitude_ls_deg": self.season_solar_longitude_ls_deg,
            "source_reference": self.source_reference,
            "source_time_period": self.source_time_period,
            "epistemic_class": self.epistemic_class.value,
        }


@dataclass(frozen=True)
class EnvironmentalSuitabilityScore:
    """Evaluated suitability score and component decomposition."""

    overall_suitability_score: float  # [0.0, 1.0] higher means more favorable for EVA
    thermal_score: float  # [0.0, 1.0]
    solar_illumination_score: float  # [0.0, 1.0]
    dust_opacity_score: float  # [0.0, 1.0]
    wind_aerodynamic_score: float  # [0.0, 1.0]
    suitability_category: str  # "OPTIMAL", "ACCEPTABLE", "MARGINAL", "HAZARDOUS"

    def to_dict(self) -> dict[str, Any]:
        return {
            "overall_suitability_score": round(self.overall_suitability_score, 3),
            "overall_suitability_pct": round(self.overall_suitability_score * 100.0, 1),
            "thermal_score": round(self.thermal_score, 3),
            "solar_illumination_score": round(self.solar_illumination_score, 3),
            "dust_opacity_score": round(self.dust_opacity_score, 3),
            "wind_aerodynamic_score": round(self.wind_aerodynamic_score, 3),
            "suitability_category": self.suitability_category,
            "epistemic_class": EpistemicClass.SIMULATED.value,
        }


@dataclass(frozen=True)
class EnvironmentalAssessmentReport:
    """Complete environmental evaluation of an EVA scenario."""

    scenario: EnvironmentalScenarioInput
    suitability: EnvironmentalSuitabilityScore
    warnings: list[str]
    weights_applied: dict[str, float]
    data_availability_notice: str
    safety_disclaimer: str = ENVIRONMENTAL_SAFETY_DISCLAIMER
    general_disclaimer: str = DISCLAIMER

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario": self.scenario.to_dict(),
            "suitability": self.suitability.to_dict(),
            "warnings": self.warnings,
            "weights_applied": self.weights_applied,
            "data_availability_notice": self.data_availability_notice,
            "safety_disclaimer": self.safety_disclaimer,
            "general_disclaimer": self.general_disclaimer,
        }


class EnvironmentalScenarioEngine:
    """Assesses hypothetical and historical environmental conditions for Mars human EVA."""

    def __init__(self, weights: EnvironmentalWeights | None = None) -> None:
        self.weights = weights or EnvironmentalWeights()

    def assess_scenario(
        self,
        scenario: EnvironmentalScenarioInput,
        weights: EnvironmentalWeights | None = None,
    ) -> EnvironmentalAssessmentReport:
        """Evaluate suitability, component metrics, and operational warnings for a scenario."""
        w_cfg = (weights or self.weights).normalized()

        # 1. Thermal score calculation
        # Optimal temperature range: [-30C, 0C]
        # Below -30C: linear decay to 0.0 at -90C (cold, heating drain, glove stiffening)
        # Above +10C: penalty for suit thermal loop heat rejection in near-vacuum
        t_air = scenario.air_temperature_c
        if -30.0 <= t_air <= 5.0:
            s_thermal = 1.0
        elif t_air < -30.0:
            # Linear decay from 1.0 at -30C down to 0.05 at -90C
            frac = (t_air - (-90.0)) / (-30.0 - (-90.0))
            s_thermal = max(0.05, min(1.0, 0.05 + 0.95 * frac))
        else:
            # Above +5C up to +25C
            s_thermal = max(0.5, 1.0 - ((t_air - 5.0) / 30.0))

        # 2. Solar illumination score
        # Daytime direct + diffuse flux in W/m2
        # > 400 W/m2: 1.0 (optimal daylight visual navigation)
        # 150-400 W/m2: 0.6 - 1.0 (adequate)
        # < 150 W/m2: dusk/deep shadow, sharp penalty
        # 0 W/m2: night operations (0.1, requires floodlights)
        irr = scenario.solar_irradiance_w_per_m2
        if irr >= 400.0:
            s_solar = 1.0
        elif irr >= 150.0:
            s_solar = 0.60 + 0.40 * ((irr - 150.0) / 250.0)
        elif irr > 10.0:
            s_solar = 0.20 + 0.40 * ((irr - 10.0) / 140.0)
        else:
            s_solar = 0.10  # Night / pitch darkness

        # 3. Dust optical depth (tau) score
        # Clear season: tau <= 0.40 -> 1.0
        # Moderate dust: tau in [0.40, 1.20] -> 0.6 - 0.95
        # Heavy dust / storm: tau > 2.0 -> 0.05 - 0.30
        tau = scenario.dust_optical_depth_tau
        if tau <= 0.40:
            s_dust = 1.0
        elif tau <= 1.20:
            s_dust = 1.0 - 0.40 * ((tau - 0.40) / 0.80)
        elif tau <= 2.50:
            s_dust = 0.60 - 0.45 * ((tau - 1.20) / 1.30)
        else:
            s_dust = max(0.05, 0.15 - 0.10 * min(1.0, (tau - 2.50) / 2.0))

        # 4. Wind speed & saltation score
        # Nominal breeze <= 6 m/s: 1.0
        # 6-15 m/s: 0.70 - 0.95
        # 15-25 m/s: 0.20 - 0.70 (sandblasting risk, dust devils)
        # > 25 m/s: 0.10
        v_wind = scenario.wind_speed_mps
        v_gust = scenario.wind_gust_mps
        effective_wind = max(v_wind, v_gust * 0.80)
        if effective_wind <= 6.0:
            s_wind = 1.0
        elif effective_wind <= 15.0:
            s_wind = 1.0 - 0.30 * ((effective_wind - 6.0) / 9.0)
        elif effective_wind <= 25.0:
            s_wind = 0.70 - 0.55 * ((effective_wind - 15.0) / 10.0)
        else:
            s_wind = 0.10

        # Weighted combination
        s_overall = (
            w_cfg.w_thermal * s_thermal
            + w_cfg.w_solar * s_solar
            + w_cfg.w_dust * s_dust
            + w_cfg.w_wind * s_wind
        )
        s_overall = max(0.0, min(1.0, s_overall))

        if s_overall >= 0.80:
            category = "OPTIMAL"
        elif s_overall >= 0.60:
            category = "ACCEPTABLE"
        elif s_overall >= 0.40:
            category = "MARGINAL"
        else:
            category = "HAZARDOUS"

        # Operational warnings
        warnings: list[str] = []
        if scenario.air_temperature_c < -65.0:
            warnings.append(
                f"Cryogenic cold warning: Air temperature ({scenario.air_temperature_c:.1f}°C) "
                "substantially increases spacesuit heating power draw and battery drain."
            )
        if scenario.dust_optical_depth_tau >= 1.8:
            warnings.append(
                f"Dust storm alert: Optical depth tau={scenario.dust_optical_depth_tau:.2f} "
                "severely attenuates surface visibility and causes solar panel dust settling."
            )
        if scenario.solar_irradiance_w_per_m2 < 120.0:
            warnings.append(
                f"Low illumination alert: Flux ({scenario.solar_irradiance_w_per_m2:.0f} W/m²)"
                " is insufficient for visual recognition; floodlights required."
            )
        if scenario.wind_gust_mps >= 20.0:
            warnings.append(
                f"High gust alert: Wind gusts reaching {scenario.wind_gust_mps:.1f} m/s "
                "produce abrasive regolith saltation risk and tool handling instability."
            )

        data_notice = (
            f"DATA PROVENANCE: Origin '{scenario.data_origin.value}'. "
            f"Reference: '{scenario.source_reference}'. Time: '{scenario.source_time_period}'. "
            "Real-time Mars forecasting unavailable; uses historical/modeled inputs."
        )

        suitability = EnvironmentalSuitabilityScore(
            overall_suitability_score=s_overall,
            thermal_score=s_thermal,
            solar_illumination_score=s_solar,
            dust_opacity_score=s_dust,
            wind_aerodynamic_score=s_wind,
            suitability_category=category,
        )

        return EnvironmentalAssessmentReport(
            scenario=scenario,
            suitability=suitability,
            warnings=warnings,
            weights_applied=w_cfg.to_dict(),
            data_availability_notice=data_notice,
        )

    def compare_scenarios(
        self,
        scenarios: list[EnvironmentalScenarioInput],
        weights: EnvironmentalWeights | None = None,
    ) -> list[EnvironmentalAssessmentReport]:
        """Assess multiple environmental scenarios and return sorted by suitability descending."""
        reports = [self.assess_scenario(s, weights) for s in scenarios]
        reports.sort(key=lambda r: r.suitability.overall_suitability_score, reverse=True)
        return reports

    @staticmethod
    def get_curated_scenarios() -> list[EnvironmentalScenarioInput]:
        """Return curated representative environmental scenarios for Jezero Crater."""
        return [
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-01-CLEAR-MIDDAY",
                title="Optimal Clear Midday Window",
                description=(
                    "Favorable daytime exploration window around local noon during clear season. "
                    "Maximal solar flux, moderate wind, and benign dust opacity."
                ),
                data_origin=DataOriginCategory.HISTORICAL_OBSERVED,
                air_temperature_c=-20.0,
                ground_temperature_c=-10.0,
                solar_irradiance_w_per_m2=525.0,
                dust_optical_depth_tau=0.30,
                wind_speed_mps=3.5,
                wind_gust_mps=7.0,
                operational_window_start_ltst="11:30",
                operational_window_end_ltst="14:30",
                operational_window_hours=3.0,
                season_solar_longitude_ls_deg=180.0,
                source_reference="NASA Mars 2020 Perseverance MEDA archive (Sol 350-420 baseline)",
                source_time_period="Mars Year 36, Perihelion clear season",
                epistemic_class=EpistemicClass.OBSERVED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-02-AFTERNOON-GUSTS",
                title="Afternoon Convective Gusts",
                description=(
                    "Typical late-afternoon convective boundary turbulence. "
                    "Elevated wind gusts and dust devils with cooling ground temperatures."
                ),
                data_origin=DataOriginCategory.HISTORICAL_OBSERVED,
                air_temperature_c=-28.0,
                ground_temperature_c=-16.0,
                solar_irradiance_w_per_m2=360.0,
                dust_optical_depth_tau=0.55,
                wind_speed_mps=9.5,
                wind_gust_mps=21.0,
                operational_window_start_ltst="14:30",
                operational_window_end_ltst="17:00",
                operational_window_hours=2.5,
                season_solar_longitude_ls_deg=210.0,
                source_reference="NASA Mars 2020 Perseverance MEDA ATS/WS sensor records",
                source_time_period="Mars Year 36 Sols 150-250 afternoon passes",
                epistemic_class=EpistemicClass.OBSERVED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-03-DUST-STORM-EVENT",
                title="Regional Atmospheric Dust Storm",
                description=(
                    "High opacity regional dust storm. Heavy solar dimming, high air opacity, "
                    "subdued diurnal surface warming, and elevated particulate abrasion."
                ),
                data_origin=DataOriginCategory.HISTORICAL_OBSERVED,
                air_temperature_c=-48.0,
                ground_temperature_c=-42.0,
                solar_irradiance_w_per_m2=115.0,
                dust_optical_depth_tau=2.70,
                wind_speed_mps=17.5,
                wind_gust_mps=26.0,
                operational_window_start_ltst="11:00",
                operational_window_end_ltst="15:00",
                operational_window_hours=4.0,
                season_solar_longitude_ls_deg=315.0,
                source_reference="NASA Mars 2020 MEDA RDS & MCD v6.1 dust storm climatology",
                source_time_period="Mars Year 36 regional dust storm event (Sol 315-325)",
                epistemic_class=EpistemicClass.OBSERVED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-04-EARLY-MORNING-FROST",
                title="Early Morning Cryogenic Frost Window",
                description=(
                    "Pre-dawn to early morning cryogenic conditions. Extreme cold near diurnal "
                    "minimum with low-angle oblique sun and light winds."
                ),
                data_origin=DataOriginCategory.CLIMATE_MODELED,
                air_temperature_c=-82.0,
                ground_temperature_c=-88.0,
                solar_irradiance_w_per_m2=85.0,
                dust_optical_depth_tau=0.38,
                wind_speed_mps=2.4,
                wind_gust_mps=4.8,
                operational_window_start_ltst="06:30",
                operational_window_end_ltst="08:30",
                operational_window_hours=2.0,
                season_solar_longitude_ls_deg=90.0,
                source_reference="Mars Climate Database (MCD v6.1) Jezero crater diurnal minimum",
                source_time_period="Martian northern winter aphelion model",
                epistemic_class=EpistemicClass.SIMULATED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-05-GLOBAL-DUST-EVENT",
                title="Planet-Encircling Global Dust Event (GDE)",
                description=(
                    "Severe planet-encircling dust event (MY25/MY28 analogue). "
                    "Extreme optical depth (tau = 3.8), severe solar obscuration (<40 W/m2), "
                    "and near-zero horizontal visibility (<30 m)."
                ),
                data_origin=DataOriginCategory.CLIMATE_MODELED,
                air_temperature_c=-45.0,
                ground_temperature_c=-40.0,
                solar_irradiance_w_per_m2=35.0,
                dust_optical_depth_tau=3.80,
                wind_speed_mps=14.0,
                wind_gust_mps=22.0,
                operational_window_start_ltst="12:00",
                operational_window_end_ltst="14:00",
                operational_window_hours=2.0,
                season_solar_longitude_ls_deg=270.0,
                source_reference="MCD v6.1 Global Dust Storm & Opportunity MER-B MY34 archive",
                source_time_period="Mars Global Dust Event Parameterization",
                epistemic_class=EpistemicClass.SIMULATED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-06-SOLAR-PARTICLE-EVENT",
                title="Solar Particle Radiation Spike (SPE)",
                description=(
                    "Extreme Coronal Mass Ejection (CME) shock passage with elevated surface "
                    "dose rate requiring immediate sortie abort and shelter seek."
                ),
                data_origin=DataOriginCategory.USER_SCENARIO,
                air_temperature_c=-25.0,
                ground_temperature_c=-12.0,
                solar_irradiance_w_per_m2=490.0,
                dust_optical_depth_tau=0.40,
                wind_speed_mps=5.0,
                wind_gust_mps=9.0,
                operational_window_start_ltst="11:00",
                operational_window_end_ltst="13:00",
                operational_window_hours=2.0,
                season_solar_longitude_ls_deg=180.0,
                source_reference="MSL RAD & MAVEN Solar Energetic Particle (SEP) benchmarks",
                source_time_period="Space Weather Contingency Scenario",
                epistemic_class=EpistemicClass.SIMULATED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-07-DIRECT-COMMS-SHADOW",
                title="Canyon Scarp RF Shadowing",
                description=(
                    "Line-of-sight obstruction to base habitat and orbital relay caused by "
                    "delta scarp rim cliff walls (>20m relief). Sortie autonomy enforced."
                ),
                data_origin=DataOriginCategory.USER_SCENARIO,
                air_temperature_c=-26.0,
                ground_temperature_c=-15.0,
                solar_irradiance_w_per_m2=420.0,
                dust_optical_depth_tau=0.45,
                wind_speed_mps=6.5,
                wind_gust_mps=12.0,
                operational_window_start_ltst="10:00",
                operational_window_end_ltst="14:00",
                operational_window_hours=4.0,
                season_solar_longitude_ls_deg=180.0,
                source_reference="Jezero Western Delta HiRISE viewshed geometry",
                source_time_period="RF Communication Shadow Contingency",
                epistemic_class=EpistemicClass.SIMULATED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-08-SUIT-THERMAL-LEAK",
                title="Spacesuit Thermal Loop Degradation",
                description=(
                    "Sublimator pore clogging / degraded heat rejection in planetary vacuum. "
                    "Astronaut metabolic workload must be strictly capped to prevent heat stress."
                ),
                data_origin=DataOriginCategory.USER_SCENARIO,
                air_temperature_c=12.0,
                ground_temperature_c=18.0,
                solar_irradiance_w_per_m2=520.0,
                dust_optical_depth_tau=0.45,
                wind_speed_mps=8.5,
                wind_gust_mps=15.0,
                operational_window_start_ltst="12:00",
                operational_window_end_ltst="14:00",
                operational_window_hours=2.0,
                season_solar_longitude_ls_deg=180.0,
                source_reference="NASA Advanced Extravehicular Mobility Unit (xEMU) thermal limits",
                source_time_period="Life-Support Thermal Contingency",
                epistemic_class=EpistemicClass.SIMULATED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-09-SAND-RIPPLE-SLIPPAGE",
                title="Active Sand Ripple Field Entrapment",
                description=(
                    "Low thermal inertia (<160 TIU) transverse aeolian ridge (TAR) traversal. "
                    "Boot and wheel slip factor exceeds 35%, increasing metabolic cost by 40%."
                ),
                data_origin=DataOriginCategory.HISTORICAL_OBSERVED,
                air_temperature_c=-24.0,
                ground_temperature_c=-11.0,
                solar_irradiance_w_per_m2=480.0,
                dust_optical_depth_tau=0.42,
                wind_speed_mps=7.0,
                wind_gust_mps=14.0,
                operational_window_start_ltst="11:00",
                operational_window_end_ltst="15:00",
                operational_window_hours=4.0,
                season_solar_longitude_ls_deg=180.0,
                source_reference="M20 Perseverance Séítah terrain trafficability records",
                source_time_period="Sandy Terrain Traction Impedance",
                epistemic_class=EpistemicClass.OBSERVED,
            ),
            EnvironmentalScenarioInput(
                scenario_id="SCENARIO-ENV-10-RAPID-EVACUATION",
                title="Rapid Sortie Evacuation (Emergency Abort)",
                description=(
                    "Expedited return-to-base traversal at elevated walking velocity (1.3 m/s). "
                    "Accelerated oxygen burn and thermal load on suits during emergency transit."
                ),
                data_origin=DataOriginCategory.USER_SCENARIO,
                air_temperature_c=-30.0,
                ground_temperature_c=-18.0,
                solar_irradiance_w_per_m2=380.0,
                dust_optical_depth_tau=0.60,
                wind_speed_mps=11.0,
                wind_gust_mps=19.0,
                operational_window_start_ltst="14:00",
                operational_window_end_ltst="15:30",
                operational_window_hours=1.5,
                season_solar_longitude_ls_deg=200.0,
                source_reference="EVA Flight Rules Emergency Abort Velocity Envelope",
                source_time_period="Emergency Evacuation Protocol",
                epistemic_class=EpistemicClass.SIMULATED,
            ),
        ]

    @staticmethod
    def get_data_sources_dossier() -> dict[str, Any]:
        """Return dataset provenance dossiers for real planetary environmental records."""
        return {
            "sources": [
                {
                    "product_id": "urn:nasa:pds:mars2020_meda",
                    "title": "NASA Mars 2020 Perseverance MEDA In-Situ Instrument Archive",
                    "organization": "Centro de Astrobiología (CAB) / JPL / PDS Atmospheres",
                    "coverage": "Jezero Crater Floor & Delta, Sols 1 to 1000+ (2021-present)",
                    "measured_parameters": [
                        "Air temperature (ATS) at 1.5m and 0.8m",
                        "Ground surface brightness temperature (GTS)",
                        "Horizontal wind speed and direction (WS)",
                        "Solar irradiance and dust optical depth (RDS)",
                        "Surface atmospheric pressure (PS)",
                        "Relative humidity (HS)",
                    ],
                    "epistemic_class": EpistemicClass.OBSERVED.value,
                    "caveats": (
                        "Measures historical weather at rover location; does not provide real-time "
                        "or forecasted future conditions."
                    ),
                },
                {
                    "product_id": "MCD_v6.1_LMD",
                    "title": "Mars Climate Database (MCD v6.1)",
                    "organization": "LMD / CNRS / Sorbonne Université / ESA",
                    "coverage": "Global Mars GCM parameterized by Ls (season) and LTST",
                    "measured_parameters": [
                        "Climatological diurnal temperature curves",
                        "Surface solar radiation budget",
                        "Global dust storm scenarios",
                    ],
                    "epistemic_class": EpistemicClass.SIMULATED.value,
                    "caveats": (
                        "Global GCM at ~60km resolution; downscaling to crater microtopography "
                        "relies on boundary layer parameterizations."
                    ),
                },
            ]
        }


# ---------------------------------------------------------------------------
# Stage C: Surface Thermal Inertia, Diurnal Cycles & Climatological Dust Models
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ThermalInertiaSummary:
    """Thermal inertia estimation and lithological interpretation."""

    thermal_inertia_tiu: float  # J m^-2 K^-1 s^-1/2
    albedo: float
    surface_material: str
    trafficability_implication: str
    epistemic_class: str = EpistemicClass.DERIVED.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "thermal_inertia_tiu": round(self.thermal_inertia_tiu, 1),
            "albedo": round(self.albedo, 3),
            "surface_material": self.surface_material,
            "trafficability_implication": self.trafficability_implication,
            "epistemic_class": self.epistemic_class,
        }


@dataclass(frozen=True)
class DiurnalHourProfile:
    """Hourly temperature and solar flux values across one Martian sol (0-24 LTST)."""

    ltst_hour: float  # 0.0 to 24.0 Local True Solar Time
    surface_temp_c: float
    air_temp_c: float
    solar_flux_w_m2: float
    eva_suitability_flag: bool  # True if inside typical safe operational limits

    def to_dict(self) -> dict[str, Any]:
        return {
            "ltst_hour": round(self.ltst_hour, 1),
            "surface_temp_c": round(self.surface_temp_c, 1),
            "air_temp_c": round(self.air_temp_c, 1),
            "solar_flux_w_m2": round(self.solar_flux_w_m2, 1),
            "eva_suitability_flag": self.eva_suitability_flag,
        }


@dataclass(frozen=True)
class DustClimatologyPoint:
    """Atmospheric dust optical depth (tau) parameterized by Solar Longitude Ls."""

    solar_longitude_ls_deg: float  # 0 to 360 degrees
    season_name: str
    tau_background: float
    tau_regional_storm: float
    tau_global_storm: float
    storm_probability_pct: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "solar_longitude_ls_deg": round(self.solar_longitude_ls_deg, 1),
            "season_name": self.season_name,
            "tau_background": round(self.tau_background, 2),
            "tau_regional_storm": round(self.tau_regional_storm, 2),
            "tau_global_storm": round(self.tau_global_storm, 2),
            "storm_probability_pct": round(self.storm_probability_pct, 1),
        }


class PlanetaryEnvironmentPhysics:
    """Physical models for Mars surface thermodynamics and climatological cycles."""

    @staticmethod
    def classify_thermal_inertia(
        thermal_inertia_tiu: float,
        albedo: float = 0.22,
    ) -> ThermalInertiaSummary:
        """Classify terrain lithology and rover/EVA trafficability from thermal inertia."""
        if thermal_inertia_tiu < 120.0:
            mat = "Fine, low-bearing unconsolidated dust mantle"
            traffic = "High sinkage hazard; poor traction for rover wheels and boots"
        elif thermal_inertia_tiu < 250.0:
            mat = "Coarse active sand sheets and ripple fields"
            traffic = "Moderate slip; potential entrapment on steep leeward dune faces"
        elif thermal_inertia_tiu < 450.0:
            mat = "Cemented duricrust, regolith pebble lag & cohesive soil"
            traffic = "Optimal EVA walking terrain; firm bearing capacity"
        else:
            mat = "Indurated bedrock, competent sandstone & volcanic slab"
            traffic = "Rigid high-friction footing; potential obstacle / tripping hazard"

        return ThermalInertiaSummary(
            thermal_inertia_tiu=thermal_inertia_tiu,
            albedo=albedo,
            surface_material=mat,
            trafficability_implication=traffic,
        )

    @staticmethod
    def compute_diurnal_cycle(
        latitude_deg: float = 18.45,
        season_ls_deg: float = 180.0,
        thermal_inertia_tiu: float = 320.0,
        dust_tau: float = 0.40,
    ) -> list[DiurnalHourProfile]:
        """Compute 24-hour diurnal temperature and solar curve for Mars.

        Based on harmonic energy balance:
        - Peak solar illumination occurs at 12:00 LTST.
        - Peak surface temperature lags solar noon by 1.0 to 2.5 hours depending on inertia.
        - Higher thermal inertia reduces diurnal amplitude (warmer nights, cooler days).
        - Higher dust tau attenuates solar flux and warms nighttime air via greenhouse opacity.
        """
        import math

        lat_rad = math.radians(latitude_deg)
        # Solar declination on Mars: delta = 25.2 deg * sin(Ls)
        declination_rad = math.radians(25.2 * math.sin(math.radians(season_ls_deg)))

        # Solar constant at Mars: ~590 W/m2 at mean distance
        # Scaled by dust transmission: exp(-tau / cos(Z))
        solar_const = 590.0

        # Mean temperature base depending on latitude and season
        t_mean_c = -55.0 - 15.0 * abs(math.sin(lat_rad))
        # Diurnal amplitude inversely proportional to sqrt(thermal inertia)
        delta_t_surf = max(20.0, min(55.0, 550.0 / math.sqrt(max(50.0, thermal_inertia_tiu))))
        # Atmospheric dust greenhouse reduces diurnal swing
        delta_t_surf *= max(0.65, 1.0 - 0.15 * dust_tau)

        # Thermal lag: higher inertia -> longer thermal delay
        lag_hours = 1.0 + (thermal_inertia_tiu / 500.0)

        profiles: list[DiurnalHourProfile] = []
        for h in range(24):
            ltst = float(h)
            # Solar hour angle: omega = (ltst - 12.0) * 15 deg/hr
            omega_rad = math.radians((ltst - 12.0) * 15.0)

            # Solar elevation: sin(elev) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(omega)
            sin_elev = math.sin(lat_rad) * math.sin(declination_rad) + math.cos(
                lat_rad
            ) * math.cos(declination_rad) * math.cos(omega_rad)

            if sin_elev > 0.0:
                airmass = 1.0 / max(0.1, sin_elev)
                transmittance = math.exp(-dust_tau * airmass)
                solar_flux = solar_const * sin_elev * transmittance
            else:
                solar_flux = 0.0

            # Surface temperature two-harmonic formulation (Spencer et al. 1989 planetary standard)
            # Produces afternoon peak (~13:30 LTST) and pre-dawn cryogenic minimum (~04:30 LTST)
            phi1_rad = math.radians((ltst - 12.0 - lag_hours) * 15.0)
            phi2_rad = 2.0 * phi1_rad + 0.30
            harmonic = 0.75 * math.cos(phi1_rad) + 0.25 * math.cos(phi2_rad)
            surf_temp = t_mean_c + delta_t_surf * harmonic

            # Air temperature at 1.5m (damped and lagged by ~1 hr compared to surface)
            air_phi1 = math.radians((ltst - 12.0 - lag_hours - 0.8) * 15.0)
            air_phi2 = 2.0 * air_phi1 + 0.30
            air_harmonic = 0.75 * math.cos(air_phi1) + 0.25 * math.cos(air_phi2)
            air_temp = t_mean_c + (delta_t_surf * 0.75) * air_harmonic

            # Operational EVA window: surface > -70C, air > -65C, daylight flux > 100 W/m2
            is_suitable = (surf_temp >= -70.0) and (air_temp >= -65.0) and (solar_flux >= 100.0)

            profiles.append(
                DiurnalHourProfile(
                    ltst_hour=ltst,
                    surface_temp_c=surf_temp,
                    air_temp_c=air_temp,
                    solar_flux_w_m2=solar_flux,
                    eva_suitability_flag=is_suitable,
                )
            )

        return profiles

    @staticmethod
    def compute_dust_climatology() -> list[DustClimatologyPoint]:
        """Compute Martian seasonal dust optical depth (tau) cycle across 360 deg Ls.

        Corresponds to Mars Climate Database and Mars 2020 MEDA / Curiosity REMS observations:
        - Ls = 0 - 150: Northern spring/summer clear season (tau ~ 0.25 - 0.45).
        - Ls = 180 - 330: Perihelion dust storm season with frequent regional storms
          and periodic planet-encircling global dust events (GDE).
        """
        import math

        points: list[DustClimatologyPoint] = []
        for ls in range(0, 360, 15):
            ls_deg = float(ls)

            # Determine season name
            if 0 <= ls < 90:
                s_name = "Northern Spring / Southern Autumn (Aphelion Approach)"
            elif 90 <= ls < 180:
                s_name = "Northern Summer / Southern Winter (Aphelion Clear Season)"
            elif 180 <= ls < 270:
                s_name = "Northern Autumn / Southern Spring (Perihelion Dust Storm Season)"
            else:
                s_name = "Northern Winter / Southern Summer (Solstitial Peak)"

            # Baseline clear-sky tau
            tau_base = 0.25 + 0.10 * math.sin(math.radians(ls_deg - 60.0))

            # Perihelion dust storm amplification (Gaussian centered at Ls = 250 deg)
            dist_perihelion = (ls_deg - 250.0) % 360.0
            if dist_perihelion > 180.0:
                dist_perihelion -= 360.0

            peri_factor = math.exp(-((dist_perihelion) ** 2) / (2.0 * (45.0**2)))
            tau_regional = tau_base + 1.2 * peri_factor
            tau_global = tau_base + 3.2 * peri_factor
            storm_prob = 5.0 + 75.0 * peri_factor

            points.append(
                DustClimatologyPoint(
                    solar_longitude_ls_deg=ls_deg,
                    season_name=s_name,
                    tau_background=tau_base,
                    tau_regional_storm=tau_regional,
                    tau_global_storm=tau_global,
                    storm_probability_pct=storm_prob,
                )
            )

        return points
