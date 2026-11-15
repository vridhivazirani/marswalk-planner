"""FastAPI router for the Marswalk Route Optimization Engine."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.routing.engine import RouteOptimizationEngine
from app.routing.exceptions import (
    BlockedDestinationError,
    BlockedStartError,
    OutOfBoundsCoordinateError,
    UnreachableDestinationError,
)
from app.services.route_comparison import MissionPreferences, RouteComparisonService

router = APIRouter(prefix="/routing", tags=["route-planning"])


class LatLonPoint(BaseModel):
    """Geographic point on the Mars sphere."""

    lat: float = Field(..., description="Planetocentric latitude in degrees")
    lon: float = Field(..., description="East-positive longitude in degrees")


class RouteRequest(BaseModel):
    """Route calculation request between two Mars coordinates."""

    start: LatLonPoint
    destination: LatLonPoint
    waypoints: list[LatLonPoint] = Field(
        default_factory=list, description="Optional intermediate sortie waypoints"
    )
    profile: str = Field("BALANCED", description="SAFETY_FIRST, SCIENCE_FIRST, or BALANCED")
    algorithm: Literal["astar", "dijkstra"] = Field(
        "astar", description="'astar' or 'dijkstra'"
    )
    simplify: bool = Field(True, description="Enable obstacle-safe route simplification")


class RouteSuiteRequest(BaseModel):
    """Request for comparative multi-profile routes (Safety, Science, Balanced)."""

    start: LatLonPoint
    destination: LatLonPoint
    waypoints: list[LatLonPoint] = Field(
        default_factory=list, description="Optional intermediate sortie waypoints"
    )
    algorithm: Literal["astar", "dijkstra"] = Field(
        "astar", description="'astar' or 'dijkstra'"
    )
    simplify: bool = Field(True, description="Enable obstacle-safe route simplification")


class PreferencesInput(BaseModel):
    """Configurable mission importance preferences."""

    safety_importance: float = Field(0.40, ge=0.0, description="Relative priority for safety")
    science_importance: float = Field(0.35, ge=0.0, description="Relative priority for science")
    efficiency_importance: float = Field(0.25, ge=0.0, description="Relative priority for speed")


class RouteCompareRequest(BaseModel):
    """Request for multi-objective comparison with custom mission preferences."""

    start: LatLonPoint
    destination: LatLonPoint
    waypoints: list[LatLonPoint] = Field(
        default_factory=list, description="Optional intermediate sortie waypoints"
    )
    preferences: PreferencesInput | None = Field(default=None)
    algorithm: Literal["astar", "dijkstra"] = Field(
        "astar", description="'astar' or 'dijkstra'"
    )
    simplify: bool = Field(True, description="Enable obstacle-safe route simplification")


@router.post("/plan", summary="Compute optimal traversable route between two Mars points")
def plan_route(req: RouteRequest) -> dict[str, Any]:
    """Calculate single optimal route adhering to hard constraints and chosen profile."""
    engine = RouteOptimizationEngine()
    try:
        if req.waypoints:
            stops = [(req.start.lat, req.start.lon)]
            stops.extend((wp.lat, wp.lon) for wp in req.waypoints)
            stops.append((req.destination.lat, req.destination.lon))
            plan = engine.compute_multi_stop_route(
                stops=stops,
                profile_name=req.profile,
                algorithm=req.algorithm,
                simplify=req.simplify,
            )
        else:
            plan = engine.compute_route(
                start_lat=req.start.lat,
                start_lon=req.start.lon,
                dest_lat=req.destination.lat,
                dest_lon=req.destination.lon,
                profile_name=req.profile,
                algorithm=req.algorithm,
                simplify=req.simplify,
            )
        return plan.to_geojson_feature()
    except (
        BlockedStartError,
        BlockedDestinationError,
        OutOfBoundsCoordinateError,
        ValueError,
    ) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except UnreachableDestinationError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.post("/suite", summary="Compute comparative multi-profile route suite")
def plan_route_suite(req: RouteSuiteRequest) -> dict[str, Any]:
    """Calculate all 3 routes (Safety-First, Science-First, Balanced) for trade-off analysis."""
    engine = RouteOptimizationEngine()
    try:
        wp_coords = [(wp.lat, wp.lon) for wp in req.waypoints] if req.waypoints else None
        suite = engine.compute_suite(
            start_lat=req.start.lat,
            start_lon=req.start.lon,
            dest_lat=req.destination.lat,
            dest_lon=req.destination.lon,
            algorithm=req.algorithm,
            simplify=req.simplify,
            waypoints=wp_coords,
        )
        return {
            "type": "FeatureCollection",
            "name": "marswalk_comparative_routes",
            "features": [plan.to_geojson_feature() for plan in suite.values()],
            "comparison": {name: plan.metrics.to_dict() for name, plan in suite.items()},
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


@router.get("/scenarios", summary="Get curated Jezero exploration reference scenarios")
def get_exploration_scenarios() -> dict[str, Any]:
    """Retrieve pre-validated real Jezero crater EVA exploration scenarios."""
    return {"scenarios": RouteComparisonService.get_example_scenarios()}


@router.post("/compare", summary="Multi-objective comparative evaluation of routes")
def compare_routes_endpoint(req: RouteCompareRequest) -> dict[str, Any]:
    """Calculate all route alternatives and perform multi-objective trade-off analysis."""
    service = RouteComparisonService()
    try:
        prefs = None
        if req.preferences is not None:
            prefs = MissionPreferences(
                safety_importance=req.preferences.safety_importance,
                science_importance=req.preferences.science_importance,
                efficiency_importance=req.preferences.efficiency_importance,
            )

        wp_coords = [(wp.lat, wp.lon) for wp in req.waypoints] if req.waypoints else None
        comparison, suite = service.compare_routes(
            start_lat=req.start.lat,
            start_lon=req.start.lon,
            dest_lat=req.destination.lat,
            dest_lon=req.destination.lon,
            preferences=prefs,
            algorithm=req.algorithm,
            simplify=req.simplify,
            waypoints=wp_coords,
        )

        return {
            "type": "FeatureCollection",
            "name": "marswalk_multi_objective_routes",
            "features": [plan.to_geojson_feature() for plan in suite.values()],
            "comparison": comparison.to_dict(),
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
