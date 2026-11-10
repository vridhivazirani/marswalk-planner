"""Calculation engine for human EVA mission operational requirements and consumables."""

from __future__ import annotations

import math

from app.mission.assumptions import (
    CrewAssumptions,
    EquipmentAssumptions,
    MissionPlanningAssumptions,
    OperationalTimelineAssumptions,
)
from app.mission.models import (
    ConsumablesBudget,
    EVATimeline,
    MissionFeasibilityWarning,
    MissionPlanSummary,
    WarningSeverity,
)
from app.routing.models import PathWaypoint, RoutePlan


class EVAMissionCalculator:
    """Calculates operational timelines, consumables budgets, and feasibility for Mars EVA."""

    def __init__(self, assumptions: MissionPlanningAssumptions | None = None) -> None:
        self.assumptions = assumptions or MissionPlanningAssumptions()

    def evaluate_mission(
        self,
        route_plan: RoutePlan,
        science_stops_count: int = 2,
        is_round_trip: bool = True,
        custom_assumptions: MissionPlanningAssumptions | None = None,
    ) -> MissionPlanSummary:
        """Evaluate timeline, consumables expenditure, and flight feasibility for a route."""
        cfg = custom_assumptions or self.assumptions
        crew_cfg = cfg.crew
        equip_cfg = cfg.equipment
        time_cfg = cfg.timeline

        waypoints = route_plan.waypoints
        if not waypoints:
            raise ValueError("Route plan contains no waypoints.")

        # 1. Outbound traversal simulation
        outbound_time_sec, outbound_met_wh, max_slope_deg, avg_slope_deg = self._simulate_traversal(
            waypoints=waypoints,
            crew=crew_cfg,
            time_cfg=time_cfg,
            is_return=False,
        )

        # 2. Return traversal simulation (reverse waypoints with inverted slopes)
        if is_round_trip:
            return_time_sec, return_met_wh, ret_max_slope, ret_avg_slope = self._simulate_traversal(
                waypoints=waypoints,
                crew=crew_cfg,
                time_cfg=time_cfg,
                is_return=True,
            )
            max_slope_deg = max(max_slope_deg, ret_max_slope)
            avg_slope_deg = (avg_slope_deg + ret_avg_slope) / 2.0
        else:
            return_time_sec = 0.0
            return_met_wh = 0.0

        outbound_min = outbound_time_sec / 60.0
        return_min = return_time_sec / 60.0
        total_walking_min = outbound_min + return_min

        # 3. Science stops duration and metabolic work
        science_min = science_stops_count * time_cfg.science_stop_duration_minutes
        # Stationary science work: 180 Watts (sample collection, drilling, photography)
        science_power_w = 180.0
        science_met_wh = science_power_w * (science_min / 60.0)

        # 4. Rest stops calculation
        # Rest pause scheduled every N minutes of continuous walking
        rest_stops_count = int(total_walking_min // time_cfg.rest_stop_interval_minutes)
        rest_min = rest_stops_count * time_cfg.rest_stop_duration_minutes
        # Resting in suit: basal metabolic power
        rest_met_wh = crew_cfg.base_metabolic_rate_w * (rest_min / 60.0)

        # 5. Contingency reserve time allowance
        reserve_min = total_walking_min * time_cfg.contingency_reserve_time_fraction
        # Contingency reserve assumed at nominal walking metabolic rate
        reserve_met_wh = crew_cfg.nominal_walking_power_w * (reserve_min / 60.0)

        # 6. Total EVA Duration
        total_eva_min = total_walking_min + science_min + rest_min + reserve_min
        total_eva_hours = total_eva_min / 60.0

        timeline = EVATimeline(
            outbound_traversal_minutes=outbound_min,
            return_traversal_minutes=return_min,
            total_walking_minutes=total_walking_min,
            planned_science_minutes=science_min,
            science_stops_count=science_stops_count,
            rest_pauses_minutes=rest_min,
            rest_stops_count=rest_stops_count,
            contingency_reserve_minutes=reserve_min,
            total_eva_duration_minutes=total_eva_min,
            total_eva_duration_hours=total_eva_hours,
        )

        # 7. Consumables Budget (Oxygen and Battery Energy)
        # Total metabolic work per astronaut (Watt-hours)
        total_metabolic_wh = (
            outbound_met_wh + return_met_wh + science_met_wh + rest_met_wh + reserve_met_wh
        )
        total_metabolic_joules = total_metabolic_wh * 3600.0
        metabolic_kcal = total_metabolic_joules / 4184.0
        avg_metabolic_power_w = total_metabolic_wh / max(0.01, total_eva_hours)

        # Oxygen consumed (grams per crew member)
        # O2 = (base_rate_g_hr * hours) + (rate_per_wh * metabolic_wh)
        o2_consumed_per_crew_g = (
            crew_cfg.o2_consumption_rate_g_per_hour_base * total_eva_hours
            + crew_cfg.o2_consumption_rate_g_per_wh * total_metabolic_wh
        )
        total_o2_consumed_all_g = o2_consumed_per_crew_g * crew_cfg.nominal_crew_count
        o2_capacity_g = equip_cfg.total_usable_o2_capacity_g
        o2_remaining_g = o2_capacity_g - o2_consumed_per_crew_g
        o2_margin_pct = (o2_remaining_g / o2_capacity_g) * 100.0

        # Battery energy consumed (Watt-hours per suit life support system)
        battery_energy_consumed_wh = equip_cfg.base_life_support_power_w * total_eva_hours
        battery_capacity_wh = equip_cfg.total_battery_capacity_wh
        battery_remaining_wh = battery_capacity_wh - battery_energy_consumed_wh
        battery_margin_pct = (battery_remaining_wh / battery_capacity_wh) * 100.0

        consumables = ConsumablesBudget(
            o2_consumed_per_crew_g=o2_consumed_per_crew_g,
            total_o2_consumed_all_crew_g=total_o2_consumed_all_g,
            o2_capacity_per_suit_g=o2_capacity_g,
            o2_remaining_per_suit_g=o2_remaining_g,
            o2_margin_pct=o2_margin_pct,
            battery_energy_consumed_wh=battery_energy_consumed_wh,
            battery_capacity_wh=battery_capacity_wh,
            battery_remaining_wh=battery_remaining_wh,
            battery_margin_pct=battery_margin_pct,
            metabolic_energy_expended_kcal=metabolic_kcal,
            average_metabolic_power_w=avg_metabolic_power_w,
        )

        # 8. Feasibility Analysis and Operational Warnings
        warnings = self._evaluate_warnings(
            timeline=timeline,
            consumables=consumables,
            max_slope_deg=max_slope_deg,
            equip_cfg=equip_cfg,
        )

        # Mission is feasible if no CRITICAL warnings are present
        is_feasible = not any(w.severity == WarningSeverity.CRITICAL for w in warnings)

        start_wp = waypoints[0]
        dest_wp = waypoints[-1]
        one_way_km = route_plan.metrics.total_distance_m / 1000.0
        round_trip_km = one_way_km * 2.0 if is_round_trip else one_way_km

        return MissionPlanSummary(
            mission_id=f"EVA-PLAN-{route_plan.route_id}",
            title=f"EVA Traversal Mission: {route_plan.profile_name}",
            start_location={
                "lat": start_wp.lat,
                "lon": start_wp.lon,
                "name": "Start Coordinate",
            },
            destination_location={
                "lat": dest_wp.lat,
                "lon": dest_wp.lon,
                "name": "Destination Coordinate",
            },
            selected_route_profile=route_plan.profile_name,
            one_way_distance_km=one_way_km,
            round_trip_distance_km=round_trip_km,
            timeline=timeline,
            consumables=consumables,
            warnings=warnings,
            is_feasible=is_feasible,
            assumptions_used=cfg.to_dict(),
        )

    def _simulate_traversal(
        self,
        waypoints: list[PathWaypoint],
        crew: CrewAssumptions,
        time_cfg: OperationalTimelineAssumptions,
        is_return: bool,
    ) -> tuple[float, float, float, float]:
        """Simulate traversal time (seconds) and metabolic energy expenditure (Watt-hours)."""
        wps = list(reversed(waypoints)) if is_return else waypoints
        fatigue_mult = time_cfg.return_journey_fatigue_multiplier if is_return else 1.0

        total_time_sec = 0.0
        total_met_joules = 0.0
        slopes: list[float] = []

        v0 = time_cfg.nominal_walking_speed_mps / fatigue_mult

        for i in range(1, len(wps)):
            p1 = wps[i - 1]
            p2 = wps[i]

            dx = p2.projected_x - p1.projected_x
            dy = p2.projected_y - p1.projected_y
            step_dist = math.hypot(dx, dy)
            if step_dist < 1e-4:
                continue

            # Elevation change (sign depends on direction)
            dz = p2.elevation_m - p1.elevation_m
            slope_rad = math.atan2(dz, step_dist)
            slope_deg = math.degrees(slope_rad)
            slopes.append(abs(slope_deg))

            # Walking speed adjustment on Mars regolith based on slope
            # Uphill slows down monotonically: v = v0 * exp(-0.035 * max(0, slope))
            # Steep downhill (> 15 deg) slows down for braking/stability
            if slope_deg >= 0:
                speed = v0 * math.exp(-0.035 * slope_deg)
            elif slope_deg < -15.0:
                speed = v0 * 0.85
            else:
                speed = v0 * 1.05  # Slight gentle downhill acceleration

            speed = max(0.20, min(1.60, speed))
            step_time_sec = step_dist / speed

            # Metabolic power during step (Watts)
            # Base walk power + slope work factor
            if slope_deg >= 0:
                p_met = crew.nominal_walking_power_w + (
                    slope_deg * crew.slope_power_factor_w_per_deg
                )
            else:
                p_met = max(
                    crew.base_metabolic_rate_w,
                    crew.nominal_walking_power_w + (slope_deg * 4.0),
                )

            total_time_sec += step_time_sec
            total_met_joules += p_met * step_time_sec

        total_met_wh = total_met_joules / 3600.0
        max_slope = max(slopes) if slopes else 0.0
        avg_slope = (sum(slopes) / len(slopes)) if slopes else 0.0

        return total_time_sec, total_met_wh, max_slope, avg_slope

    def _evaluate_warnings(
        self,
        timeline: EVATimeline,
        consumables: ConsumablesBudget,
        max_slope_deg: float,
        equip_cfg: EquipmentAssumptions,
    ) -> list[MissionFeasibilityWarning]:
        """Detect operational constraints and generate safety/feasibility warnings."""
        warnings: list[MissionFeasibilityWarning] = []

        # 1. Total EVA Duration checks
        max_hrs = equip_cfg.max_recommended_eva_duration_hours
        if timeline.total_eva_duration_hours > max_hrs:
            warnings.append(
                MissionFeasibilityWarning(
                    severity=WarningSeverity.CRITICAL,
                    code="EVA_DURATION_EXCEEDED",
                    message=(
                        f"Simulated EVA duration ({timeline.total_eva_duration_hours:.1f}h) "
                        f"exceeds flight rule limit of {max_hrs:.1f} hours."
                    ),
                    remediation=(
                        "Shorten destination distance, reduce science stop counts, "
                        "or deploy an uncrewed robotic precursor."
                    ),
                )
            )
        elif timeline.total_eva_duration_hours > (max_hrs * 0.85):
            warnings.append(
                MissionFeasibilityWarning(
                    severity=WarningSeverity.WARNING,
                    code="EVA_DURATION_NEAR_LIMIT",
                    message=(
                        f"Simulated EVA duration ({timeline.total_eva_duration_hours:.1f}h) "
                        f"approaches 85% of flight rule limit ({max_hrs:.1f}h)."
                    ),
                    remediation="Maintain strict timekeeping at sampling sites.",
                )
            )

        # 2. Oxygen Consumable checks
        min_o2_frac = equip_cfg.min_o2_reserve_fraction * 100.0
        if consumables.o2_remaining_per_suit_g <= 0.0:
            warnings.append(
                MissionFeasibilityWarning(
                    severity=WarningSeverity.CRITICAL,
                    code="O2_DEPLETION_PROJECTED",
                    message=(
                        f"Oxygen deficit! Required O2 ({consumables.o2_consumed_per_crew_g:.0f}g) "
                        f"exceeds suit capacity ({consumables.o2_capacity_per_suit_g:.0f}g)."
                    ),
                    remediation="Mission cannot be flown with current suit O2. Reduce duration.",
                )
            )
        elif consumables.o2_margin_pct < min_o2_frac:
            warnings.append(
                MissionFeasibilityWarning(
                    severity=WarningSeverity.WARNING,
                    code="O2_MARGIN_BELOW_RULE",
                    message=(
                        f"Oxygen reserve margin ({consumables.o2_margin_pct:.1f}%) is below "
                        f"the mandatory {min_o2_frac:.0f}% safety threshold."
                    ),
                    remediation="Reduce sampling duration or select a faster route profile.",
                )
            )

        # 3. Battery Energy checks
        min_bat_frac = equip_cfg.min_battery_reserve_fraction * 100.0
        if consumables.battery_remaining_wh <= 0.0:
            warnings.append(
                MissionFeasibilityWarning(
                    severity=WarningSeverity.CRITICAL,
                    code="BATTERY_DEPLETION_PROJECTED",
                    message=(
                        f"Battery deficit! Energy ({consumables.battery_energy_consumed_wh:.0f}Wh) "
                        f"exceeds capacity ({consumables.battery_capacity_wh:.0f}Wh)."
                    ),
                    remediation="Life support power failure before ingress. Abort trek.",
                )
            )
        elif consumables.battery_margin_pct < min_bat_frac:
            warnings.append(
                MissionFeasibilityWarning(
                    severity=WarningSeverity.WARNING,
                    code="BATTERY_MARGIN_LOW",
                    message=(
                        f"Battery reserve margin ({consumables.battery_margin_pct:.1f}%) is below "
                        f"the mandatory {min_bat_frac:.0f}% reserve rule."
                    ),
                    remediation="Plan auxiliary recharge or expedite return traverse.",
                )
            )

        # 4. Terrain & Slope fatigue checks
        if max_slope_deg > 20.0:
            warnings.append(
                MissionFeasibilityWarning(
                    severity=WarningSeverity.CAUTION,
                    code="STEEP_SLOPE_FATIGUE",
                    message=(
                        f"Encountered steep slope sections reaching {max_slope_deg:.1f}°. "
                        "Incurs elevated metabolic exertion and regolith slip risk."
                    ),
                    remediation="Maintain three points of contact on steep scarp approaches.",
                )
            )

        # 5. Contingency buffer checks
        if timeline.contingency_reserve_minutes < 15.0:
            warnings.append(
                MissionFeasibilityWarning(
                    severity=WarningSeverity.ADVISORY,
                    code="LOW_CONTINGENCY_BUFFER",
                    message=(
                        f"Contingency ({timeline.contingency_reserve_minutes:.0f} min) is minimal. "
                        "Leaves little buffer for surface navigation anomalies."
                    ),
                    remediation="Allocate higher contingency reserve fraction in flight planning.",
                )
            )

        return warnings
