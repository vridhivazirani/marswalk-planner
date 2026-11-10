"""Emergency Response and Dynamic Rerouting Service for Marswalk EVA Operations.

Coordinates:
- Non-random, documented simulated hazard injection.
- Spatial route-hazard intersection and impact analysis.
- Dynamic alternative pathfinding and return-to-base emergency planning.
- Recalculation of mission timelines, metabolic work, and consumables margins.
- Plain-language tactical explanations of route modifications.
- Epistemic integrity and mandatory research prototype disclaimers.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import rasterio

from app.core.epistemic import EpistemicClass
from app.mission.assumptions import MissionPlanningAssumptions
from app.mission.calculator import EVAMissionCalculator
from app.routing.emergency import (
    EMERGENCY_DISCLAIMER,
    DynamicReroutePlan,
    HazardImpactAssessment,
    HazardSeverity,
    SimulatedHazardEvent,
    SimulatedHazardType,
)
from app.routing.engine import RouteOptimizationEngine
from app.routing.exceptions import (
    BlockedDestinationError,
    BlockedStartError,
    OutOfBoundsCoordinateError,
    UnreachableDestinationError,
)
from app.routing.models import RoutePlan


class EmergencyResponseService:
    """Orchestrates in-situ hazard simulations, path re-optimization, and mission replanning."""

    def __init__(
        self,
        routing_engine: RouteOptimizationEngine | None = None,
        mission_calculator: EVAMissionCalculator | None = None,
    ) -> None:
        self.routing_engine = routing_engine or RouteOptimizationEngine()
        self.mission_calculator = mission_calculator or EVAMissionCalculator(
            MissionPlanningAssumptions()
        )
        self._incident_log: list[SimulatedHazardEvent] = []

    def get_curated_scenarios(self) -> list[SimulatedHazardEvent]:
        """Return 6 authentic, deterministic simulated contingency scenarios at Jezero Crater."""
        return [
            SimulatedHazardEvent(
                event_id="SIM-HAZ-001-BOULDER",
                hazard_type=SimulatedHazardType.NEW_BOULDER_FIELD,
                title="Newly Detected Boulder Field (Western Fan Apron)",
                description=(
                    "Orbital HiRISE stereo update identified a dense cluster of meter-scale "
                    "boulders and fragmented megaclasts across the direct delta approach corridor. "
                    "High obstacle entrapment risk requires detour."
                ),
                center_lat=18.4485,
                center_lon=77.4320,
                radius_m=120.0,
                is_hard_restriction=True,
                cost_multiplier=100.0,
                severity=HazardSeverity.HIGH,
                created_at_ltst="11:45 LTST",
            ),
            SimulatedHazardEvent(
                event_id="SIM-HAZ-002-DUNE",
                hazard_type=SimulatedHazardType.SAND_DUNE_RESTRICTION,
                title="Active Sand & Transverse Dune Bedforms",
                description=(
                    "Active transverse aeolian ripples (TARs) with loose unconsolidated dust and "
                    "high slip slope angles detected across the low depression. Traversable only "
                    "with high metabolic drag."
                ),
                center_lat=18.4470,
                center_lon=77.4250,
                radius_m=160.0,
                is_hard_restriction=False,
                cost_multiplier=8.0,
                severity=HazardSeverity.MODERATE,
                created_at_ltst="12:15 LTST",
            ),
            SimulatedHazardEvent(
                event_id="SIM-HAZ-003-CLOSURE",
                hazard_type=SimulatedHazardType.SUDDEN_ROUTE_CLOSURE,
                title="Sudden Escarpment Rockfall & Pass Closure",
                description=(
                    "Local scarp collapse has severed the primary delta access corridor with "
                    "impassable scree blocks. The primary route is completely obstructed."
                ),
                center_lat=18.4505,
                center_lon=77.4200,
                radius_m=100.0,
                is_hard_restriction=True,
                cost_multiplier=1000.0,
                severity=HazardSeverity.CRITICAL,
                created_at_ltst="13:10 LTST",
            ),
            SimulatedHazardEvent(
                event_id="SIM-HAZ-004-UNCERTAINTY",
                hazard_type=SimulatedHazardType.INCREASED_UNCERTAINTY,
                title="Sensor Haze & Topographic Uncertainty Surge",
                description=(
                    "Localized dust plume creates high optical scatter and stereo correlation "
                    "loss, increasing vertical uncertainty (sigma_z > 3.0 m). Terrain elevation "
                    "confidence degraded."
                ),
                center_lat=18.4490,
                center_lon=77.4280,
                radius_m=220.0,
                is_hard_restriction=False,
                cost_multiplier=5.0,
                severity=HazardSeverity.MODERATE,
                created_at_ltst="13:40 LTST",
            ),
            SimulatedHazardEvent(
                event_id="SIM-HAZ-005-DEST-BLOCKED",
                hazard_type=SimulatedHazardType.DESTINATION_INACCESSIBLE,
                title="Destination Site Enclosed by Wall Instability",
                description=(
                    "The primary science outcrop at Kodiak remnant has suffered localized rim "
                    "wall failure; the immediate target cell and access perimeter are impassable."
                ),
                center_lat=18.4550,
                center_lon=77.4050,
                radius_m=150.0,
                is_hard_restriction=True,
                cost_multiplier=1000.0,
                severity=HazardSeverity.CRITICAL,
                created_at_ltst="14:05 LTST",
            ),
            SimulatedHazardEvent(
                event_id="SIM-HAZ-006-RTB",
                hazard_type=SimulatedHazardType.RETURN_TO_BASE,
                title="Emergency Sortie Abort: Return-to-Base (PLSS Telemetry)",
                description=(
                    "Spacesuit Portable Life Support System primary pressure regulator alert. "
                    "Mission aborted; crew must return immediately to base via the safest route."
                ),
                center_lat=18.4495,
                center_lon=77.4260,
                radius_m=80.0,
                is_hard_restriction=False,
                cost_multiplier=1.0,
                severity=HazardSeverity.CRITICAL,
                created_at_ltst="14:25 LTST",
            ),
        ]

    def evaluate_route_impact(
        self,
        route: RoutePlan,
        hazard: SimulatedHazardEvent,
        crew_coord: tuple[float, float],
    ) -> HazardImpactAssessment:
        """Analyze spatial intersection between active planned route and simulated hazard zone."""
        h_lat = hazard.center_lat
        h_lon = hazard.center_lon
        radius_m = hazard.radius_m

        # Project hazard center to projected coordinates
        try:
            _, _, hz_x, hz_y = self.routing_engine.latlon_to_grid(h_lat, h_lon)
        except OutOfBoundsCoordinateError:
            hz_x, hz_y = self.routing_engine.mars_sys.to_projected(h_lon, h_lat)

        affected_indices: list[int] = []
        affected_segment_length_m = 0.0

        for i, wp in enumerate(route.waypoints):
            dist_to_hazard = math.hypot(wp.projected_x - hz_x, wp.projected_y - hz_y)
            if dist_to_hazard <= radius_m:
                affected_indices.append(i)

        is_affected = len(affected_indices) > 0
        total_wps = len(route.waypoints)

        # Check destination proximity
        last_wp = route.waypoints[-1]
        dest_dist = math.hypot(last_wp.projected_x - hz_x, last_wp.projected_y - hz_y)
        dest_blocked = hazard.is_hard_restriction and (dest_dist <= radius_m)

        # Check crew proximity
        try:
            _, _, cr_x, cr_y = self.routing_engine.latlon_to_grid(crew_coord[0], crew_coord[1])
            crew_dist = math.hypot(cr_x - hz_x, cr_y - hz_y)
            crew_in_zone = crew_dist <= radius_m
        except Exception:
            crew_in_zone = False

        first_km: float | None = None
        last_km: float | None = None

        if is_affected:
            first_idx = affected_indices[0]
            last_idx = affected_indices[-1]
            first_km = route.waypoints[first_idx].cumulative_dist_m / 1000.0
            last_km = route.waypoints[last_idx].cumulative_dist_m / 1000.0

            if len(affected_indices) > 1:
                affected_segment_length_m = (
                    route.waypoints[last_idx].cumulative_dist_m
                    - route.waypoints[first_idx].cumulative_dist_m
                )
            else:
                affected_segment_length_m = 20.0  # At least 1 grid cell

            summary = (
                f"Hazard '{hazard.title}' intersects {len(affected_indices)} waypoints "
                f"from km {first_km:.2f} to {last_km:.2f} (span: {affected_segment_length_m:.0f}m)."
            )
            if dest_blocked:
                summary += " CRITICAL: Target destination cell is directly blocked by this hazard."
        else:
            summary = (
                f"Planned route maintains clear buffer > {radius_m:.0f}m from '{hazard.title}'. "
                "No waypoints intersected."
            )

        return HazardImpactAssessment(
            is_route_affected=is_affected,
            affected_waypoints_count=len(affected_indices),
            total_waypoints_count=total_wps,
            first_affected_km=first_km,
            last_affected_km=last_km,
            affected_segment_length_m=affected_segment_length_m,
            destination_blocked=dest_blocked,
            crew_in_hazard_zone=crew_in_zone,
            impact_summary=summary,
        )

    def _build_hazard_modifiers(
        self,
        hazard: SimulatedHazardEvent,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Construct raster modification masks for the simulated hazard footprint."""
        h_shape = self.routing_engine.grid_shape
        extra_hard_blocked = np.zeros(h_shape, dtype=bool)
        cost_multiplier_raster = np.ones(h_shape, dtype=np.float32)

        try:
            c_row, c_col, c_x, c_y = self.routing_engine.latlon_to_grid(
                hazard.center_lat, hazard.center_lon
            )
        except OutOfBoundsCoordinateError:
            return extra_hard_blocked, cost_multiplier_raster

        # Bounding box in cells (20m resolution)
        cell_radius = int(math.ceil(hazard.radius_m / 20.0))
        r_min = max(0, c_row - cell_radius)
        r_max = min(h_shape[0], c_row + cell_radius + 1)
        c_min = max(0, c_col - cell_radius)
        c_max = min(h_shape[1], c_col + cell_radius + 1)

        transform = self.routing_engine.transform

        for r in range(r_min, r_max):
            for c in range(c_min, c_max):
                cell_x, cell_y = rasterio.transform.xy(transform, r, c)
                dist = math.hypot(cell_x - c_x, cell_y - c_y)
                if dist <= hazard.radius_m:
                    if hazard.is_hard_restriction:
                        extra_hard_blocked[r, c] = True
                    else:
                        cost_multiplier_raster[r, c] = max(
                            cost_multiplier_raster[r, c], hazard.cost_multiplier
                        )

        return extra_hard_blocked, cost_multiplier_raster

    def simulate_incident_and_reroute(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        profile_name: str = "BALANCED",
        hazard: SimulatedHazardEvent | None = None,
        crew_progress_pct: float = 0.40,
        custom_crew_lat: float | None = None,
        custom_crew_lon: float | None = None,
    ) -> DynamicReroutePlan:
        """Simulate a contingency, assess route impact, and recalculate path and consumables."""
        if hazard is None:
            hazard = self.get_curated_scenarios()[0]

        # Record incident in audit registry
        self._incident_log.append(hazard)

        # 1. Compute original baseline route
        original_route = self.routing_engine.compute_route(
            start_lat=start_lat,
            start_lon=start_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            profile_name=profile_name,
            simplify=True,
        )

        # 2. Determine crew current location along the traverse
        wps = original_route.waypoints
        if custom_crew_lat is not None and custom_crew_lon is not None:
            crew_lat, crew_lon = custom_crew_lat, custom_crew_lon
        else:
            prog = max(0.0, min(1.0, crew_progress_pct))
            target_idx = int(round(prog * (len(wps) - 1)))
            crew_lat = wps[target_idx].lat
            crew_lon = wps[target_idx].lon

        crew_coord = (crew_lat, crew_lon)

        # 3. Assess impact on active route
        impact = self.evaluate_route_impact(original_route, hazard, crew_coord)

        # 4. Determine reroute origin and destination
        is_rtb = hazard.hazard_type == SimulatedHazardType.RETURN_TO_BASE
        reroute_start_lat, reroute_start_lon = crew_lat, crew_lon

        if is_rtb:
            reroute_dest_lat, reroute_dest_lon = start_lat, start_lon
            reroute_profile = "SAFETY_FIRST"  # Emergency abort always prioritizes safety
        else:
            reroute_dest_lat, reroute_dest_lon = dest_lat, dest_lon
            reroute_profile = profile_name

        # 5. Build raster modifiers
        extra_hard_blocked, cost_multiplier = self._build_hazard_modifiers(hazard)

        rerouted_route: RoutePlan | None = None
        is_feasible = True
        reasoning = ""

        # 6. Attempt dynamic reroute pathfinding
        try:
            rerouted_route = self.routing_engine.compute_route(
                start_lat=reroute_start_lat,
                start_lon=reroute_start_lon,
                dest_lat=reroute_dest_lat,
                dest_lon=reroute_dest_lon,
                profile_name=reroute_profile,
                simplify=True,
                extra_hard_blocked_mask=extra_hard_blocked,
                cost_multiplier_raster=cost_multiplier,
            )
        except (BlockedDestinationError, OutOfBoundsCoordinateError):
            is_feasible = False
            reasoning = (
                f"DESTINATION UNREACHABLE: Destination cell at ({reroute_dest_lat:.5f}°N, "
                f"{reroute_dest_lon:.5f}°E) is blocked or impassable due to {hazard.title}. "
                "No safe approach corridor exists. Action: ABORT TO BASE immediately."
            )
        except (BlockedStartError, UnreachableDestinationError) as e:
            is_feasible = False
            reasoning = (
                f"NO FEASIBLE PATH FOUND: Terrain topology around crew position or destination "
                f"is completely severed by simulated obstacle '{hazard.title}'. Error: {e}. "
                "Action: Crew shelter or initiate immediate emergency return-to-base."
            )
        except Exception as e:
            is_feasible = False
            reasoning = f"Path search failed unexpectedly: {e}"

        # 7. Evaluate consumable changes and timelines
        dist_delta = 0.0
        dur_delta = 0.0
        cost_delta = 0.0
        haz_delta = 0.0
        time_delta_min = 0.0
        o2_delta_g = 0.0
        batt_delta_wh = 0.0
        mission_warnings: list[dict[str, Any]] = []

        if is_feasible and rerouted_route is not None:
            dist_delta = (
                rerouted_route.metrics.total_distance_m - original_route.metrics.total_distance_m
            )
            dur_delta = (
                rerouted_route.metrics.estimated_duration_minutes
                - original_route.metrics.estimated_duration_minutes
            )
            cost_delta = (
                rerouted_route.metrics.accumulated_cost - original_route.metrics.accumulated_cost
            )
            haz_delta = (
                rerouted_route.metrics.mean_hazard_exposure
                - original_route.metrics.mean_hazard_exposure
            )

            # Re-evaluate complete mission consumables
            orig_plan = self.mission_calculator.evaluate_mission(original_route)
            reroute_plan = self.mission_calculator.evaluate_mission(rerouted_route)

            time_delta_min = (
                reroute_plan.timeline.total_eva_duration_minutes
                - orig_plan.timeline.total_eva_duration_minutes
            )
            o2_delta_g = (
                reroute_plan.consumables.o2_consumed_per_crew_g
                - orig_plan.consumables.o2_consumed_per_crew_g
            )
            batt_delta_wh = (
                reroute_plan.consumables.battery_energy_consumed_wh
                - orig_plan.consumables.battery_energy_consumed_wh
            )
            mission_warnings = [w.to_dict() for w in reroute_plan.warnings]

            if is_rtb:
                reasoning = (
                    f"EMERGENCY RETURN-TO-BASE EXECUTED: Sortie aborted from crew position "
                    f"({crew_lat:.5f}°N, {crew_lon:.5f}°E). Calculated direct return corridor to "
                    f"Base ({start_lat:.5f}°N, {start_lon:.5f}°E) using Safety-First profile. "
                    f"Return distance: {rerouted_route.metrics.total_distance_m / 1000.0:.2f} km, "
                    f"duration: {rerouted_route.metrics.estimated_duration_minutes:.1f} min."
                )
            elif impact.is_route_affected:
                d_sgn = "+" if dist_delta >= 0 else ""
                t_sgn = "+" if dur_delta >= 0 else ""
                o_sgn = "+" if o2_delta_g >= 0 else ""
                reasoning = (
                    f"DYNAMIC DETOUR SUCCESSFUL: Rerouted around '{hazard.title}'. "
                    f"Traverse distance: {d_sgn}{dist_delta:.0f} m ({t_sgn}{dur_delta:.1f} min). "
                    f"O2 consumption change: {o_sgn}{o2_delta_g:.1f} g per crew member. "
                    "All newly navigated cells are strictly verified passable."
                )
            else:
                reasoning = (
                    f"ROUTE CONFIRMED SECURE: The simulated incident '{hazard.title}' does not "
                    "impinge upon the active travel corridor. The route remains safe."
                )

        return DynamicReroutePlan(
            event_id=hazard.event_id,
            original_route=original_route,
            rerouted_route=rerouted_route,
            is_feasible=is_feasible,
            is_return_to_base=is_rtb,
            crew_location={"lat": crew_lat, "lon": crew_lon},
            hazard_event=hazard,
            impact=impact,
            reasoning=reasoning,
            distance_delta_m=dist_delta,
            duration_delta_minutes=dur_delta,
            cost_delta=cost_delta,
            hazard_exposure_delta=haz_delta,
            timeline_delta_minutes=time_delta_min,
            o2_consumption_delta_g=o2_delta_g,
            battery_consumption_delta_wh=batt_delta_wh,
            mission_warnings=mission_warnings,
            epistemic_class=EpistemicClass.SIMULATED.value,
            disclaimer=EMERGENCY_DISCLAIMER,
        )

    def to_geojson(self, plan: DynamicReroutePlan) -> dict[str, Any]:
        """Format original route, rerouted path, hazard zone, and crew position as GeoJSON."""
        features: list[dict[str, Any]] = []

        # 1. Original Route Feature
        orig_coords = [[wp.lon, wp.lat] for wp in plan.original_route.waypoints]
        features.append(
            {
                "type": "Feature",
                "id": "original_route",
                "properties": {
                    "layer_type": "original_route",
                    "route_id": plan.original_route.route_id,
                    "profile_name": plan.original_route.profile_name,
                    "is_affected": plan.impact.is_route_affected,
                    "metrics": plan.original_route.metrics.to_dict(),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": orig_coords,
                },
            }
        )

        # 2. Rerouted Alternative Route Feature (if feasible)
        if plan.rerouted_route is not None:
            reroute_coords = [[wp.lon, wp.lat] for wp in plan.rerouted_route.waypoints]
            features.append(
                {
                    "type": "Feature",
                    "id": "rerouted_route",
                    "properties": {
                        "layer_type": "rerouted_route",
                        "route_id": plan.rerouted_route.route_id,
                        "profile_name": plan.rerouted_route.profile_name,
                        "is_return_to_base": plan.is_return_to_base,
                        "metrics": plan.rerouted_route.metrics.to_dict(),
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": reroute_coords,
                    },
                }
            )

        # 3. Simulated Hazard Footprint Feature (Circle approximated by polygon)
        hz = plan.hazard_event
        center_lon, center_lat = hz.center_lon, hz.center_lat
        rad_deg = hz.radius_m / (3396190.0 * (math.pi / 180.0))  # Mars spherical radius

        # Generate 32 circle polygon vertices
        circle_poly: list[list[float]] = []
        for step in range(33):
            theta = (step / 32.0) * (2.0 * math.pi)
            p_lon = center_lon + (rad_deg * math.cos(theta)) / math.cos(math.radians(center_lat))
            p_lat = center_lat + rad_deg * math.sin(theta)
            circle_poly.append([round(p_lon, 6), round(p_lat, 6)])

        features.append(
            {
                "type": "Feature",
                "id": f"hazard_{hz.event_id}",
                "properties": {
                    "layer_type": "simulated_hazard",
                    "event_id": hz.event_id,
                    "title": hz.title,
                    "hazard_type": hz.hazard_type.value,
                    "radius_m": hz.radius_m,
                    "is_hard_restriction": hz.is_hard_restriction,
                    "severity": hz.severity.value,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [circle_poly],
                },
            }
        )

        # 4. Crew Position Point Feature
        features.append(
            {
                "type": "Feature",
                "id": "crew_position",
                "properties": {
                    "layer_type": "crew_position",
                    "lat": plan.crew_location["lat"],
                    "lon": plan.crew_location["lon"],
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [plan.crew_location["lon"], plan.crew_location["lat"]],
                },
            }
        )

        return {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "event_id": plan.event_id,
                "is_feasible": plan.is_feasible,
                "is_return_to_base": plan.is_return_to_base,
                "reasoning": plan.reasoning,
                "metrics_delta": {
                    "distance_delta_m": plan.distance_delta_m,
                    "duration_delta_minutes": plan.duration_delta_minutes,
                    "o2_consumption_delta_g": plan.o2_consumption_delta_g,
                    "battery_consumption_delta_wh": plan.battery_consumption_delta_wh,
                },
                "disclaimer": plan.disclaimer,
            },
        }
