"""FastAPI router for Mars Human EVA Mission Planning Engine."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.mission.assumptions import (
    CrewAssumptions,
    EquipmentAssumptions,
    MissionPlanningAssumptions,
    OperationalTimelineAssumptions,
)
from app.routing.exceptions import (
    BlockedDestinationError,
    BlockedStartError,
    OutOfBoundsCoordinateError,
    UnreachableDestinationError,
)
from app.services.mission_planning import MissionPlanningService

router = APIRouter(prefix="/mission", tags=["mission-planning"])


class LatLonPoint(BaseModel):
    """Geographic point on the Mars sphere."""

    lat: float = Field(..., description="Planetocentric latitude in degrees")
    lon: float = Field(..., description="East-positive longitude in degrees")


class CrewAssumptionsInput(BaseModel):
    """Configurable physiological inputs."""

    nominal_crew_count: int = Field(2, ge=1)
    body_mass_kg: float = Field(75.0, gt=0)
    suit_mass_kg: float = Field(50.0, gt=0)
    nominal_walking_power_w: float = Field(280.0, gt=0)


class EquipmentAssumptionsInput(BaseModel):
    """Configurable life-support equipment inputs."""

    total_usable_o2_capacity_g: float = Field(1200.0, gt=0)
    total_battery_capacity_wh: float = Field(1800.0, gt=0)
    max_recommended_eva_duration_hours: float = Field(8.0, gt=0)


class TimelineAssumptionsInput(BaseModel):
    """Configurable timeline and scheduling inputs."""

    nominal_walking_speed_mps: float = Field(1.0, gt=0)
    science_stop_duration_minutes: float = Field(15.0, ge=0)
    rest_stop_interval_minutes: float = Field(45.0, gt=0)
    contingency_reserve_time_fraction: float = Field(0.25, ge=0)


class MissionPlanRequest(BaseModel):
    """Request payload for Mars EVA mission operational estimation."""

    start: LatLonPoint
    destination: LatLonPoint
    profile: str = Field("BALANCED", description="SAFETY_FIRST, SCIENCE_FIRST, or BALANCED")
    science_stops_count: int = Field(2, ge=0)
    is_round_trip: bool = Field(True, description="Whether EVA requires returning to origin")
    crew_assumptions: CrewAssumptionsInput | None = None
    equipment_assumptions: EquipmentAssumptionsInput | None = None
    timeline_assumptions: TimelineAssumptionsInput | None = None
    algorithm: str = Field("astar", description="'astar' or 'dijkstra'")
    simplify: bool = Field(True, description="Enable obstacle-safe simplification")


class MissionCompareRequest(BaseModel):
    """Request payload for comparing EVA mission profiles side-by-side."""

    start: LatLonPoint
    destination: LatLonPoint
    science_stops_count: int = Field(2, ge=0)
    is_round_trip: bool = Field(True, description="Whether EVA requires returning to origin")
    crew_assumptions: CrewAssumptionsInput | None = None
    equipment_assumptions: EquipmentAssumptionsInput | None = None
    timeline_assumptions: TimelineAssumptionsInput | None = None
    algorithm: str = Field("astar", description="'astar' or 'dijkstra'")
    simplify: bool = Field(True, description="Enable obstacle-safe simplification")


def _build_assumptions(
    crew_in: CrewAssumptionsInput | None,
    equip_in: EquipmentAssumptionsInput | None,
    time_in: TimelineAssumptionsInput | None,
) -> MissionPlanningAssumptions:
    crew = (
        CrewAssumptions(
            nominal_crew_count=crew_in.nominal_crew_count,
            body_mass_kg=crew_in.body_mass_kg,
            suit_mass_kg=crew_in.suit_mass_kg,
            nominal_walking_power_w=crew_in.nominal_walking_power_w,
        )
        if crew_in
        else CrewAssumptions()
    )

    equip = (
        EquipmentAssumptions(
            total_usable_o2_capacity_g=equip_in.total_usable_o2_capacity_g,
            total_battery_capacity_wh=equip_in.total_battery_capacity_wh,
            max_recommended_eva_duration_hours=equip_in.max_recommended_eva_duration_hours,
        )
        if equip_in
        else EquipmentAssumptions()
    )

    timeline = (
        OperationalTimelineAssumptions(
            nominal_walking_speed_mps=time_in.nominal_walking_speed_mps,
            science_stop_duration_minutes=time_in.science_stop_duration_minutes,
            rest_stop_interval_minutes=time_in.rest_stop_interval_minutes,
            contingency_reserve_time_fraction=time_in.contingency_reserve_time_fraction,
        )
        if time_in
        else OperationalTimelineAssumptions()
    )

    return MissionPlanningAssumptions(crew=crew, equipment=equip, timeline=timeline)


@router.get("/default-assumptions", summary="Get documented placeholder EVA assumptions")
def get_default_assumptions() -> dict[str, Any]:
    """Retrieve full baseline physiological, equipment, and timeline assumptions."""
    return MissionPlanningAssumptions().to_dict()


@router.post("/plan", summary="Generate comprehensive human Mars EVA mission plan")
def plan_mission_endpoint(req: MissionPlanRequest) -> dict[str, Any]:
    """Estimate operational timelines, oxygen and energy budgets, and feasibility warnings."""
    service = MissionPlanningService()
    assumptions = _build_assumptions(
        req.crew_assumptions,
        req.equipment_assumptions,
        req.timeline_assumptions,
    )

    try:
        summary, route_plan = service.plan_mission(
            start_lat=req.start.lat,
            start_lon=req.start.lon,
            dest_lat=req.destination.lat,
            dest_lon=req.destination.lon,
            profile_name=req.profile,
            science_stops_count=req.science_stops_count,
            is_round_trip=req.is_round_trip,
            assumptions=assumptions,
            algorithm=req.algorithm,
            simplify=req.simplify,
        )
        return {
            "mission": summary.to_dict(),
            "route_feature": route_plan.to_geojson_feature(),
        }
    except (
        BlockedStartError,
        BlockedDestinationError,
        OutOfBoundsCoordinateError,
        ValueError,
    ) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except UnreachableDestinationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.post("/compare", summary="Compare EVA mission feasibility across profiles")
def compare_mission_profiles_endpoint(req: MissionCompareRequest) -> dict[str, Any]:
    """Evaluate EVA duration and consumables across Safety, Science, and Balanced routes."""
    service = MissionPlanningService()
    assumptions = _build_assumptions(
        req.crew_assumptions,
        req.equipment_assumptions,
        req.timeline_assumptions,
    )

    try:
        comparison = service.compare_mission_profiles(
            start_lat=req.start.lat,
            start_lon=req.start.lon,
            dest_lat=req.destination.lat,
            dest_lon=req.destination.lon,
            science_stops_count=req.science_stops_count,
            is_round_trip=req.is_round_trip,
            assumptions=assumptions,
            algorithm=req.algorithm,
            simplify=req.simplify,
        )
        return {"profiles": comparison}
    except (
        BlockedStartError,
        BlockedDestinationError,
        OutOfBoundsCoordinateError,
        ValueError,
    ) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except UnreachableDestinationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
