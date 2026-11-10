"""Mission planning service integrating route optimization with human EVA operational models.

Coordinates:
- Optimal route generation (Safety-First, Science-First, Balanced).
- Operational timeline calculation (outbound, return, science, rest, reserve).
- Consumables budgeting (oxygen, battery energy, metabolic load).
- Feasibility constraints and multi-profile comparative mission assessment.
"""

from __future__ import annotations

from typing import Any

from app.mission.assumptions import MissionPlanningAssumptions
from app.mission.calculator import EVAMissionCalculator
from app.mission.models import MissionPlanSummary
from app.routing.engine import RouteOptimizationEngine
from app.routing.models import RoutePlan


class MissionPlanningService:
    """Service orchestrating human EVA operational planning at Jezero Crater."""

    def __init__(
        self,
        routing_engine: RouteOptimizationEngine | None = None,
        calculator: EVAMissionCalculator | None = None,
    ) -> None:
        self.routing_engine = routing_engine or RouteOptimizationEngine()
        self.calculator = calculator or EVAMissionCalculator()

    def plan_mission(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        profile_name: str = "BALANCED",
        science_stops_count: int = 2,
        is_round_trip: bool = True,
        assumptions: MissionPlanningAssumptions | None = None,
        algorithm: str = "astar",
        simplify: bool = True,
    ) -> tuple[MissionPlanSummary, RoutePlan]:
        """Compute optimal route and evaluate EVA mission feasibility and consumables."""
        route_plan = self.routing_engine.compute_route(
            start_lat=start_lat,
            start_lon=start_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            profile_name=profile_name,
            algorithm=algorithm,
            simplify=simplify,
        )

        mission_summary = self.calculator.evaluate_mission(
            route_plan=route_plan,
            science_stops_count=science_stops_count,
            is_round_trip=is_round_trip,
            custom_assumptions=assumptions,
        )

        return mission_summary, route_plan

    def compare_mission_profiles(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        science_stops_count: int = 2,
        is_round_trip: bool = True,
        assumptions: MissionPlanningAssumptions | None = None,
        algorithm: str = "astar",
        simplify: bool = True,
    ) -> dict[str, dict[str, Any]]:
        """Compute all three route profiles and return side-by-side EVA mission plans."""
        suite = self.routing_engine.compute_suite(
            start_lat=start_lat,
            start_lon=start_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            algorithm=algorithm,
            simplify=simplify,
        )

        result: dict[str, dict[str, Any]] = {}
        for profile_name, route_plan in suite.items():
            summary = self.calculator.evaluate_mission(
                route_plan=route_plan,
                science_stops_count=science_stops_count,
                is_round_trip=is_round_trip,
                custom_assumptions=assumptions,
            )
            result[profile_name] = {
                "mission_summary": summary.to_dict(),
                "route_feature": route_plan.to_geojson_feature(),
            }

        return result
