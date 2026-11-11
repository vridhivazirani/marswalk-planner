"""Mission planning service integrating route optimization with human EVA operational models.

Coordinates:
- Optimal route generation (Safety-First, Science-First, Balanced).
- Operational timeline calculation (outbound, return, science, rest, reserve).
- Consumables budgeting (oxygen, battery energy, metabolic load).
- Feasibility constraints and multi-profile comparative mission assessment.
"""

from __future__ import annotations

from typing import Any

from app.core.disclaimer import DISCLAIMER
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

    def plan_multi_destination_mission(
        self,
        origin_lat: float,
        origin_lon: float,
        waypoint_coords: list[tuple[float, float]],
        profile_name: str = "BALANCED",
        return_to_origin: bool = True,
        science_duration_per_stop_min: float = 15.0,
        assumptions: MissionPlanningAssumptions | None = None,
        algorithm: str = "astar",
        simplify: bool = True,
    ) -> dict[str, Any]:
        """Compute sequential multi-destination traversal with legs, PNR, and RTB paths."""
        if not waypoint_coords:
            raise ValueError(
                "At least one target waypoint is required for multi-destination planning."
            )

        cfg = assumptions or self.calculator.assumptions
        legs: list[dict[str, Any]] = []
        emergency_returns: list[dict[str, Any]] = []

        curr_lat, curr_lon = origin_lat, origin_lon
        total_dist_m = 0.0
        total_walk_time_sec = 0.0
        total_metabolic_wh = 0.0
        cumulative_o2_g = 0.0
        cumulative_batt_wh = 0.0
        pnr_index: int | None = None

        all_stops = list(waypoint_coords)
        if return_to_origin:
            all_stops.append((origin_lat, origin_lon))

        for leg_idx, (next_lat, next_lon) in enumerate(all_stops):
            is_final_rtb = return_to_origin and (leg_idx == len(all_stops) - 1)
            route_plan = self.routing_engine.compute_route(
                start_lat=curr_lat,
                start_lon=curr_lon,
                dest_lat=next_lat,
                dest_lon=next_lon,
                profile_name=profile_name,
                algorithm=algorithm,
                simplify=simplify,
            )

            # Evaluate leg with 1 science stop (if not final RTB leg)
            num_stops = 0 if is_final_rtb else 1
            leg_summary = self.calculator.evaluate_mission(
                route_plan=route_plan,
                science_stops_count=num_stops,
                is_round_trip=False,
                custom_assumptions=cfg,
            )

            leg_dist = route_plan.metrics.total_distance_m
            total_dist_m += leg_dist
            leg_walk_sec = leg_summary.timeline.outbound_traversal_minutes * 60.0
            total_walk_time_sec += leg_walk_sec
            leg_o2 = leg_summary.consumables.o2_consumed_per_crew_g
            leg_batt = leg_summary.consumables.battery_energy_consumed_wh
            leg_kcal = leg_summary.consumables.metabolic_energy_expended_kcal
            total_metabolic_wh += leg_kcal * 1.16222  # 1 kcal ≈ 1.16222 Wh
            cumulative_o2_g += leg_o2
            cumulative_batt_wh += leg_batt

            # Compute direct emergency RTB from this target back to origin
            if not is_final_rtb:
                try:
                    rtb_plan = self.routing_engine.compute_route(
                        start_lat=next_lat,
                        start_lon=next_lon,
                        dest_lat=origin_lat,
                        dest_lon=origin_lon,
                        profile_name="SAFETY_FIRST",
                        algorithm="astar",
                        simplify=True,
                    )
                    rtb_summary = self.calculator.evaluate_mission(
                        route_plan=rtb_plan,
                        science_stops_count=0,
                        is_round_trip=False,
                        custom_assumptions=cfg,
                    )
                    rtb_o2 = rtb_summary.consumables.o2_consumed_per_crew_g
                    rtb_batt = rtb_summary.consumables.battery_energy_consumed_wh
                    # Check if return exceeds usable reserves (enforce 20% reserve threshold)
                    o2_remaining_after_rtb = (
                        cfg.equipment.total_usable_o2_capacity_g
                        - cumulative_o2_g
                        - rtb_o2
                    )
                    batt_remaining_after_rtb = (
                        cfg.equipment.total_battery_capacity_wh
                        - cumulative_batt_wh
                        - rtb_batt
                    )

                    o2_reserve_limit = cfg.equipment.total_usable_o2_capacity_g * 0.20
                    batt_reserve_limit = cfg.equipment.total_battery_capacity_wh * 0.20

                    if (
                        pnr_index is None
                        and (
                            o2_remaining_after_rtb < o2_reserve_limit
                            or batt_remaining_after_rtb < batt_reserve_limit
                        )
                    ):
                        pnr_index = leg_idx

                    emergency_returns.append({
                        "from_waypoint_index": leg_idx,
                        "rtb_distance_m": round(rtb_plan.metrics.total_distance_m, 1),
                        "rtb_duration_minutes": round(
                            rtb_summary.timeline.outbound_traversal_minutes, 1
                        ),
                        "rtb_o2_required_g": round(rtb_o2, 1),
                        "rtb_battery_required_wh": round(rtb_batt, 1),
                        "safe_reserve_margin_o2": o2_remaining_after_rtb >= o2_reserve_limit,
                        "safe_reserve_margin_battery": (
                            batt_remaining_after_rtb >= batt_reserve_limit
                        ),
                        "rtb_route": rtb_plan.to_geojson_feature(),
                    })
                except Exception:
                    # Non-fatal if RTB cannot be resolved
                    pass

            legs.append({
                "leg_index": leg_idx,
                "label": (
                    "Return to Habitat Base"
                    if is_final_rtb
                    else f"Sortie Leg {leg_idx + 1}"
                ),
                "from_coord": {"lat": curr_lat, "lon": curr_lon},
                "to_coord": {"lat": next_lat, "lon": next_lon},
                "distance_m": round(leg_dist, 1),
                "walking_time_minutes": round(
                    leg_summary.timeline.outbound_traversal_minutes, 1
                ),
                "metabolic_energy_wh": round(leg_kcal * 1.16222, 1),
                "o2_consumed_g": round(leg_o2, 1),
                "battery_consumed_wh": round(leg_batt, 1),
                "is_return_leg": is_final_rtb,
                "route_feature": route_plan.to_geojson_feature(),
            })

            curr_lat, curr_lon = next_lat, next_lon

        num_science_stops = len(waypoint_coords)
        total_science_time_min = num_science_stops * science_duration_per_stop_min
        total_walk_time_min = total_walk_time_sec / 60.0

        # Rest stop interval calculation
        interval_min = cfg.timeline.rest_stop_interval_minutes
        num_rests = int(total_walk_time_min // interval_min)
        total_rest_time_min = num_rests * cfg.timeline.rest_stop_duration_minutes

        total_elapsed_min = total_walk_time_min + total_science_time_min + total_rest_time_min
        total_elapsed_hours = total_elapsed_min / 60.0

        feasibility = "FEASIBLE"
        warnings: list[str] = []

        if total_elapsed_hours > cfg.equipment.max_recommended_eva_duration_hours:
            feasibility = "VIOLATION"
            warnings.append(
                f"Planned sortie ({total_elapsed_hours:.1f}h) exceeds maximum EVA limit "
                f"({cfg.equipment.max_recommended_eva_duration_hours:.1f}h)."
            )

        if cumulative_o2_g > cfg.equipment.total_usable_o2_capacity_g * 0.80:
            feasibility = "MARGINAL" if feasibility != "VIOLATION" else "VIOLATION"
            warnings.append(
                "Consumable alert: Projected O2 consumption exceeds 80% capacity limit."
            )

        if cumulative_batt_wh > cfg.equipment.total_battery_capacity_wh * 0.80:
            feasibility = "MARGINAL" if feasibility != "VIOLATION" else "VIOLATION"
            warnings.append(
                "Consumable alert: Projected battery consumption exceeds 80% capacity limit."
            )

        rem_o2_pct = max(
            0.0,
            (1.0 - cumulative_o2_g / cfg.equipment.total_usable_o2_capacity_g) * 100.0,
        )
        rem_batt_pct = max(
            0.0,
            (1.0 - cumulative_batt_wh / cfg.equipment.total_battery_capacity_wh) * 100.0,
        )

        return {
            "origin": {"lat": origin_lat, "lon": origin_lon},
            "profile_name": profile_name,
            "waypoint_count": len(waypoint_coords),
            "return_to_origin": return_to_origin,
            "total_distance_m": round(total_dist_m, 1),
            "total_duration_hours": round(total_elapsed_hours, 2),
            "total_walk_time_minutes": round(total_walk_time_min, 1),
            "total_science_time_minutes": round(total_science_time_min, 1),
            "total_rest_time_minutes": round(total_rest_time_min, 1),
            "total_metabolic_energy_kwh": round(total_metabolic_wh / 1000.0, 3),
            "total_o2_consumed_g": round(cumulative_o2_g, 1),
            "total_battery_consumed_wh": round(cumulative_batt_wh, 1),
            "remaining_o2_reserve_pct": round(rem_o2_pct, 1),
            "remaining_battery_reserve_pct": round(rem_batt_pct, 1),
            "point_of_no_return_leg": pnr_index,
            "feasibility_status": feasibility,
            "flight_warnings": warnings,
            "legs": legs,
            "emergency_return_paths": emergency_returns,
            "epistemic_class": "HEURISTIC",
            "disclaimer": DISCLAIMER,
        }
