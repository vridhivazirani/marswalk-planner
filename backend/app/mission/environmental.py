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
                air_temperature_c=-22.0,
                ground_temperature_c=-10.0,
                solar_irradiance_w_per_m2=515.0,
                dust_optical_depth_tau=0.35,
                wind_speed_mps=4.2,
                wind_gust_mps=8.5,
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
