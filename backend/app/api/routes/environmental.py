"""FastAPI router for Mars Environmental Scenario Assessment Engine."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.epistemic import EpistemicClass
from app.mission.environmental import (
    DataOriginCategory,
    EnvironmentalScenarioInput,
    EnvironmentalWeights,
    PlanetaryEnvironmentPhysics,
)
from app.services.environmental_assessment import EnvironmentalAssessmentService

router = APIRouter(prefix="/environmental", tags=["environmental-scenarios"])


class WeightsInput(BaseModel):
    """Configurable weights for environmental suitability components."""

    w_thermal: float = Field(0.30, ge=0.0)
    w_solar: float = Field(0.25, ge=0.0)
    w_dust: float = Field(0.25, ge=0.0)
    w_wind: float = Field(0.20, ge=0.0)


class ScenarioPayload(BaseModel):
    """Input payload representing an operational environmental scenario."""

    scenario_id: str = Field(..., description="Unique scenario identifier")
    title: str = Field(..., description="Short descriptive title")
    description: str = Field(..., description="Operational scenario summary")
    data_origin: str = Field(
        "USER_SCENARIO",
        description="'HISTORICAL_OBSERVED', 'CLIMATE_MODELED', or 'USER_SCENARIO'",
    )
    air_temperature_c: float = Field(..., description="Air temperature in deg C")
    ground_temperature_c: float = Field(..., description="Ground temperature in deg C")
    solar_irradiance_w_per_m2: float = Field(..., ge=0.0, description="Solar flux in W/m2")
    dust_optical_depth_tau: float = Field(..., ge=0.0, description="Optical depth tau")
    wind_speed_mps: float = Field(..., ge=0.0, description="Wind speed in m/s")
    wind_gust_mps: float = Field(..., ge=0.0, description="Peak gust speed in m/s")
    operational_window_start_ltst: str = Field("11:00", description="Start LTST")
    operational_window_end_ltst: str = Field("15:00", description="End LTST")
    operational_window_hours: float = Field(4.0, gt=0.0, description="Duration in hours")
    season_solar_longitude_ls_deg: float | None = Field(180.0, description="Season Ls deg")
    source_reference: str = Field("User scenario", description="Reference dataset")
    source_time_period: str = Field("Hypothetical", description="Observation timeframe")


class AssessScenarioRequest(BaseModel):
    """Request payload to assess a single environmental scenario."""

    scenario: ScenarioPayload
    weights: WeightsInput | None = None


class CompareScenariosRequest(BaseModel):
    """Request payload to evaluate and rank multiple environmental scenarios."""

    scenarios: list[ScenarioPayload]
    weights: WeightsInput | None = None


def _to_scenario_input(payload: ScenarioPayload) -> EnvironmentalScenarioInput:
    try:
        origin = DataOriginCategory(payload.data_origin)
    except ValueError:
        origin = DataOriginCategory.USER_SCENARIO

    return EnvironmentalScenarioInput(
        scenario_id=payload.scenario_id,
        title=payload.title,
        description=payload.description,
        data_origin=origin,
        air_temperature_c=payload.air_temperature_c,
        ground_temperature_c=payload.ground_temperature_c,
        solar_irradiance_w_per_m2=payload.solar_irradiance_w_per_m2,
        dust_optical_depth_tau=payload.dust_optical_depth_tau,
        wind_speed_mps=payload.wind_speed_mps,
        wind_gust_mps=payload.wind_gust_mps,
        operational_window_start_ltst=payload.operational_window_start_ltst,
        operational_window_end_ltst=payload.operational_window_end_ltst,
        operational_window_hours=payload.operational_window_hours,
        season_solar_longitude_ls_deg=payload.season_solar_longitude_ls_deg,
        source_reference=payload.source_reference,
        source_time_period=payload.source_time_period,
        epistemic_class=(
            EpistemicClass.OBSERVED
            if origin == DataOriginCategory.HISTORICAL_OBSERVED
            else EpistemicClass.SIMULATED
        ),
    )


def _to_weights(w_in: WeightsInput | None) -> EnvironmentalWeights | None:
    if w_in is None:
        return None
    return EnvironmentalWeights(
        w_thermal=w_in.w_thermal,
        w_solar=w_in.w_solar,
        w_dust=w_in.w_dust,
        w_wind=w_in.w_wind,
    )


@router.get("/sources", summary="Get authentic Mars environmental dataset provenance dossiers")
def get_sources_dossier() -> dict[str, Any]:
    """Retrieve official documentation and archive metadata for MEDA and MCD datasets."""
    service = EnvironmentalAssessmentService()
    return service.get_data_sources_dossier()


@router.get("/scenarios", summary="Get curated Jezero environmental reference scenarios")
def get_curated_scenarios() -> dict[str, Any]:
    """Retrieve pre-configured authentic and modeled Jezero exploration scenarios."""
    service = EnvironmentalAssessmentService()
    return {"scenarios": service.get_curated_scenarios()}


@router.post("/assess", summary="Assess environmental suitability for an EVA scenario")
def assess_scenario_endpoint(req: AssessScenarioRequest) -> dict[str, Any]:
    """Calculate environmental suitability score, component decomposition, and alerts."""
    service = EnvironmentalAssessmentService()
    try:
        scenario = _to_scenario_input(req.scenario)
        weights = _to_weights(req.weights)
        report = service.assess_scenario(scenario, weights)
        return report.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/compare", summary="Compare and rank multiple environmental scenarios")
def compare_scenarios_endpoint(req: CompareScenariosRequest) -> dict[str, Any]:
    """Evaluate multiple scenarios side-by-side and return ranked by suitability."""
    if not req.scenarios:
        raise HTTPException(status_code=400, detail="At least one scenario must be provided.")
    service = EnvironmentalAssessmentService()
    try:
        scenarios = [_to_scenario_input(s) for s in req.scenarios]
        weights = _to_weights(req.weights)
        reports = service.compare_scenarios(scenarios, weights)
        return {"comparisons": [r.to_dict() for r in reports]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/diurnal-cycle", summary="Get 24-hour diurnal temperature and solar curve")
def get_diurnal_cycle_endpoint(
    latitude_deg: float = 18.45,
    season_ls_deg: float = 180.0,
    thermal_inertia_tiu: float = 320.0,
    dust_tau: float = 0.40,
) -> dict[str, Any]:
    """Compute harmonic diurnal surface & air temperature curve and solar irradiance."""
    profiles = PlanetaryEnvironmentPhysics.compute_diurnal_cycle(
        latitude_deg=latitude_deg,
        season_ls_deg=season_ls_deg,
        thermal_inertia_tiu=thermal_inertia_tiu,
        dust_tau=dust_tau,
    )
    return {
        "latitude_deg": latitude_deg,
        "season_ls_deg": season_ls_deg,
        "thermal_inertia_tiu": thermal_inertia_tiu,
        "dust_tau": dust_tau,
        "profiles": [p.to_dict() for p in profiles],
        "epistemic_class": "SIMULATED",
    }


@router.get("/dust-climatology", summary="Get seasonal dust optical depth (tau) curve")
def get_dust_climatology_endpoint() -> dict[str, Any]:
    """Retrieve seasonal dust optical depth variation across full Martian year (0-360 Ls)."""
    points = PlanetaryEnvironmentPhysics.compute_dust_climatology()
    return {
        "cycle_points": [p.to_dict() for p in points],
        "storm_season_range_ls": [180.0, 330.0],
        "epistemic_class": "CLIMATE_MODELED",
    }


@router.get("/thermal-inertia", summary="Classify terrain trafficability from thermal inertia")
def get_thermal_inertia_endpoint(
    tiu: float = 320.0,
    albedo: float = 0.22,
) -> dict[str, Any]:
    """Evaluate surface material and EVA bearing capacity from thermal inertia."""
    summary = PlanetaryEnvironmentPhysics.classify_thermal_inertia(
        thermal_inertia_tiu=tiu,
        albedo=albedo,
    )
    return summary.to_dict()

