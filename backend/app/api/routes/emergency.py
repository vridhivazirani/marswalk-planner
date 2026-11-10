"""FastAPI router for Marswalk Emergency Response and Dynamic Rerouting Engine."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.routing.emergency import (
    HazardSeverity,
    SimulatedHazardEvent,
    SimulatedHazardType,
)
from app.services.emergency_response import EmergencyResponseService

router = APIRouter(prefix="/emergency", tags=["emergency-response"])
_service = EmergencyResponseService()


class SimulatedHazardPayload(BaseModel):
    """Payload representing a simulated surface hazard event."""

    event_id: str = Field(..., description="Unique event identifier")
    hazard_type: str = Field(
        ...,
        description="Hazard type (e.g. NEW_BOULDER_FIELD, SAND_DUNE_RESTRICTION, etc.)",
    )
    title: str = Field(..., description="Short descriptive title")
    description: str = Field(..., description="Operational incident description")
    center_lat: float = Field(..., description="Planetocentric latitude in degrees")
    center_lon: float = Field(..., description="East-positive longitude in degrees")
    radius_m: float = Field(..., gt=0.0, description="Spatial impact radius in meters")
    is_hard_restriction: bool = Field(
        True, description="True if terrain is impassable; False if soft penalty"
    )
    cost_multiplier: float = Field(
        10.0, ge=1.0, description="Cost multiplier for traversable soft hazard"
    )
    severity: str = Field("HIGH", description="Severity tier (CRITICAL, HIGH, MODERATE)")


class EmergencySimulationRequest(BaseModel):
    """Request payload to simulate a hazard and dynamically reroute an active sortie."""

    start_lat: float = Field(18.4446, description="Sortie starting base latitude")
    start_lon: float = Field(77.4509, description="Sortie starting base longitude")
    dest_lat: float = Field(18.4550, description="Target destination latitude")
    dest_lon: float = Field(77.4050, description="Target destination longitude")
    profile_name: str = Field("BALANCED", description="Active routing profile name")
    crew_progress_pct: float = Field(
        0.40, ge=0.0, le=1.0, description="Crew distance progress along route (0.0 to 1.0)"
    )
    custom_crew_lat: float | None = Field(None, description="Explicit crew current latitude")
    custom_crew_lon: float | None = Field(None, description="Explicit crew current longitude")
    scenario_id: str | None = Field(
        None, description="Predefined scenario ID (e.g. SIM-HAZ-001-BOULDER)"
    )
    custom_hazard: SimulatedHazardPayload | None = Field(
        None, description="Custom user-configured hazard"
    )


class EmergencyAbortRequest(BaseModel):
    """Request payload for an immediate sortie abort and return-to-base emergency."""

    start_lat: float = Field(18.4446, description="Base camp latitude to return to")
    start_lon: float = Field(77.4509, description="Base camp longitude to return to")
    crew_lat: float = Field(..., description="Current crew position latitude")
    crew_lon: float = Field(..., description="Current crew position longitude")


@router.get("/scenarios")
def get_curated_scenarios() -> list[dict[str, Any]]:
    """Return the 6 authentic curated emergency contingency scenarios at Jezero Crater."""
    scenarios = _service.get_curated_scenarios()
    return [s.to_dict() for s in scenarios]


@router.post("/simulate")
def simulate_incident(req: EmergencySimulationRequest) -> dict[str, Any]:
    """Simulate a hazard event, evaluate route impact, and dynamically recalculate path."""
    # Determine the hazard to inject
    selected_hazard: SimulatedHazardEvent | None = None
    curated = _service.get_curated_scenarios()

    if req.custom_hazard is not None:
        try:
            h_type = SimulatedHazardType(req.custom_hazard.hazard_type)
        except ValueError:
            h_type = SimulatedHazardType.NEW_BOULDER_FIELD

        try:
            h_sev = HazardSeverity(req.custom_hazard.severity)
        except ValueError:
            h_sev = HazardSeverity.HIGH

        selected_hazard = SimulatedHazardEvent(
            event_id=req.custom_hazard.event_id,
            hazard_type=h_type,
            title=req.custom_hazard.title,
            description=req.custom_hazard.description,
            center_lat=req.custom_hazard.center_lat,
            center_lon=req.custom_hazard.center_lon,
            radius_m=req.custom_hazard.radius_m,
            is_hard_restriction=req.custom_hazard.is_hard_restriction,
            cost_multiplier=req.custom_hazard.cost_multiplier,
            severity=h_sev,
        )
    elif req.scenario_id:
        for s in curated:
            if s.event_id == req.scenario_id:
                selected_hazard = s
                break
        if selected_hazard is None:
            raise HTTPException(
                status_code=404,
                detail=f"Curated emergency scenario '{req.scenario_id}' not found.",
            )
    else:
        selected_hazard = curated[0]

    try:
        plan = _service.simulate_incident_and_reroute(
            start_lat=req.start_lat,
            start_lon=req.start_lon,
            dest_lat=req.dest_lat,
            dest_lon=req.dest_lon,
            profile_name=req.profile_name,
            hazard=selected_hazard,
            crew_progress_pct=req.crew_progress_pct,
            custom_crew_lat=req.custom_crew_lat,
            custom_crew_lon=req.custom_crew_lon,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Emergency dynamic rerouting simulation failed: {e}"
        ) from e

    geojson_data = _service.to_geojson(plan)
    response_data = plan.to_dict()
    response_data["geojson"] = geojson_data
    return response_data


@router.post("/abort-to-base")
def abort_to_base(req: EmergencyAbortRequest) -> dict[str, Any]:
    """Execute immediate emergency return-to-base from current crew coordinates."""
    rtb_hazard = SimulatedHazardEvent(
        event_id="EMERGENCY-ABORT-DIRECT",
        hazard_type=SimulatedHazardType.RETURN_TO_BASE,
        title="Immediate Emergency Return-to-Base Abort",
        description="Crew aborted sortie at current position; returning directly to base.",
        center_lat=req.crew_lat,
        center_lon=req.crew_lon,
        radius_m=10.0,
        is_hard_restriction=False,
        cost_multiplier=1.0,
        severity=HazardSeverity.CRITICAL,
    )

    try:
        plan = _service.simulate_incident_and_reroute(
            start_lat=req.start_lat,
            start_lon=req.start_lon,
            dest_lat=req.start_lat,  # Destination is base
            dest_lon=req.start_lon,
            profile_name="SAFETY_FIRST",
            hazard=rtb_hazard,
            custom_crew_lat=req.crew_lat,
            custom_crew_lon=req.crew_lon,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Emergency abort planning failed: {e}") from e

    geojson_data = _service.to_geojson(plan)
    response_data = plan.to_dict()
    response_data["geojson"] = geojson_data
    return response_data

