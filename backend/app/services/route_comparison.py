"""Route comparison service for multi-objective planetary traversal trade-off analysis.

Enforces:
- Strict multi-objective evaluation (length, time, hazard, uncertainty, science, cost).
- Configurable mission preferences (relative importance of safety, science, and efficiency).
- Explicit rule: NEVER describe any single route as universally optimal.
  Explain what objective each route optimizes and detail the operational trade-offs.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from app.costmap.profiles import CostmapWeights
from app.routing.engine import RouteOptimizationEngine
from app.routing.models import RoutePlan


@dataclass(frozen=True)
class MissionPreferences:
    """Relative importance weights for evaluating trade-offs between competing mission objectives.

    Captures user priorities across safety, science, and traverse efficiency.
    """

    safety_importance: float = 0.40  # Weight for minimizing hazard and slope risk
    science_importance: float = 0.35  # Weight for maximizing sample and outcrop science yield
    efficiency_importance: float = (
        0.25  # Weight for minimizing distance and suit traversal duration
    )

    def __post_init__(self) -> None:
        weights = (self.safety_importance, self.science_importance, self.efficiency_importance)
        if any(w < 0.0 for w in weights):
            raise ValueError("Mission preference importance weights must be non-negative.")
        if sum(weights) <= 0.0:
            raise ValueError("Sum of mission preference weights must be strictly positive.")

    def normalized(self) -> MissionPreferences:
        """Return normalized weights summing to 1.0."""
        total = self.safety_importance + self.science_importance + self.efficiency_importance
        return MissionPreferences(
            safety_importance=self.safety_importance / total,
            science_importance=self.science_importance / total,
            efficiency_importance=self.efficiency_importance / total,
        )

    def to_costmap_weights(self) -> CostmapWeights:
        """Map high-level mission preferences into costmap component weights."""
        norm = self.normalized()
        # Terrain and hazard derive from safety and efficiency
        w_haz = norm.safety_importance * 0.70
        w_unc = norm.safety_importance * 0.30
        w_sci = norm.science_importance
        w_terr = norm.efficiency_importance
        return CostmapWeights(
            w_terrain=w_terr,
            w_hazard=w_haz,
            w_uncertainty=w_unc,
            w_science=w_sci,
        )

    def to_dict(self) -> dict[str, float]:
        """Convert preferences to dictionary."""
        return {
            "safety_importance": round(self.safety_importance, 3),
            "science_importance": round(self.science_importance, 3),
            "efficiency_importance": round(self.efficiency_importance, 3),
        }


@dataclass(frozen=True)
class RouteComparisonSummary:
    """Evaluated metrics and trade-off profile for a single route option."""

    route_id: str
    profile_name: str
    primary_optimization_objective: str
    key_trade_off: str
    length_km: float
    estimated_duration_min: float
    mean_hazard_exposure_pct: float
    mean_uncertainty_m: float
    accumulated_science_score: float
    mean_science_score: float
    accumulated_cost: float
    preference_utility_score: float  # [0.0, 1.0] higher means better alignment with preferences
    rank_under_preferences: int

    def to_dict(self) -> dict[str, Any]:
        """Convert summary to dictionary."""
        return asdict(self)


@dataclass(frozen=True)
class MultiObjectiveComparison:
    """Complete comparative analysis of multiple route options."""

    start: dict[str, float]
    destination: dict[str, float]
    preferences_applied: dict[str, float]
    routes: list[RouteComparisonSummary]
    trade_off_analysis: list[str]
    no_universal_optimal_notice: str

    def to_dict(self) -> dict[str, Any]:
        """Convert comparison to dictionary."""
        return {
            "start": self.start,
            "destination": self.destination,
            "preferences_applied": self.preferences_applied,
            "routes": [r.to_dict() for r in self.routes],
            "trade_off_analysis": self.trade_off_analysis,
            "no_universal_optimal_notice": self.no_universal_optimal_notice,
        }


class RouteComparisonService:
    """Compares safety-first, science-first, balanced, and custom routes."""

    UNIVERSAL_OPTIMAL_DISCLAIMER = (
        "OPERATIONAL MULTI-OBJECTIVE PRINCIPLE: No single route is universally optimal. "
        "Each trajectory represents a distinct Pareto-optimal trade-off between astronaut "
        "safety, scientific return potential, and consumables expenditure. The appropriate "
        "route depends on real-time flight rules, suit oxygen budgets, and mission priorities."
    )

    def __init__(self, engine: RouteOptimizationEngine | None = None) -> None:
        self.engine = engine or RouteOptimizationEngine()

    def compare_routes(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        preferences: MissionPreferences | None = None,
        algorithm: str = "astar",
        simplify: bool = True,
    ) -> tuple[MultiObjectiveComparison, dict[str, RoutePlan]]:
        """Compute the suite of routes, analyze multi-objective trade-offs, and rank options."""
        if preferences is None:
            preferences = MissionPreferences()

        pref_norm = preferences.normalized()

        # Compute the 3 core routes
        suite = self.engine.compute_suite(
            start_lat=start_lat,
            start_lon=start_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            algorithm=algorithm,
            simplify=simplify,
        )

        # Objective descriptions and trade-off summaries
        profile_meta = {
            "SAFETY_FIRST": {
                "objective": "Minimizes hazard, slope incline, and uncertainty.",
                "trade_off": "Smoother terrain, but longer duration and lower science.",
            },
            "SCIENCE_FIRST": {
                "objective": "Maximizes encounters with mineral outcrops and clays.",
                "trade_off": "Highest science return, but higher slope exposure and time.",
            },
            "BALANCED": {
                "objective": "Balances friction, hazard, uncertainty, and science.",
                "trade_off": "Compromise route with moderate time and solid science.",
            },
        }

        # Calculate preference utility scores across routes
        # Utility formula balances normalized safety (low hazard and traversal risk),
        # efficiency (short duration), and scientific return potential.
        raw_summaries: list[dict[str, Any]] = []

        costs = [p.metrics.accumulated_cost for p in suite.values()]
        durations = [p.metrics.estimated_duration_minutes for p in suite.values()]
        hazards = [p.metrics.mean_hazard_exposure for p in suite.values()]
        sciences = [p.metrics.accumulated_science_opportunity for p in suite.values()]

        min_cost, max_cost = min(costs), max(costs)
        min_dur, max_dur = min(durations), max(durations)
        min_haz, max_haz = min(hazards), max(hazards)
        min_sci, max_sci = min(sciences), max(sciences)

        span_cost = max(1.0, max_cost - min_cost)
        span_dur = max(0.1, max_dur - min_dur)
        span_haz = max(0.001, max_haz - min_haz)
        span_sci = max(0.01, max_sci - min_sci)

        for prof_key, plan in suite.items():
            m = plan.metrics
            meta = profile_meta.get(
                prof_key,
                {"objective": "Custom route.", "trade_off": "User-weighted parameters."},
            )

            # Invert duration (shorter is better) -> [0, 1]
            u_eff = 1.0 - ((m.estimated_duration_minutes - min_dur) / span_dur)
            # Invert cost/risk and hazard (lower risk is safer) -> [0, 1]
            u_risk = 1.0 - ((m.accumulated_cost - min_cost) / span_cost)
            u_haz = 1.0 - ((m.mean_hazard_exposure - min_haz) / span_haz)
            u_saf = 0.60 * u_risk + 0.40 * u_haz
            # Higher science is better -> [0, 1]
            u_sci = (m.accumulated_science_opportunity - min_sci) / span_sci

            utility = (
                pref_norm.safety_importance * u_saf
                + pref_norm.science_importance * u_sci
                + pref_norm.efficiency_importance * u_eff
            )

            raw_summaries.append(
                {
                    "route_id": plan.route_id,
                    "profile_name": prof_key,
                    "primary_optimization_objective": meta["objective"],
                    "key_trade_off": meta["trade_off"],
                    "length_km": round(m.total_distance_m / 1000.0, 3),
                    "estimated_duration_min": round(m.estimated_duration_minutes, 1),
                    "mean_hazard_exposure_pct": round(m.mean_hazard_exposure * 100.0, 2),
                    "mean_uncertainty_m": round(m.mean_uncertainty_exposure, 2),
                    "accumulated_science_score": round(m.accumulated_science_opportunity, 2),
                    "mean_science_score": round(m.mean_science_opportunity, 3),
                    "accumulated_cost": round(m.accumulated_cost, 2),
                    "preference_utility_score": round(utility, 3),
                    "raw_utility": utility,
                }
            )

        # Sort descending by preference utility
        raw_summaries.sort(key=lambda s: s["raw_utility"], reverse=True)

        summaries: list[RouteComparisonSummary] = []
        for rank, s in enumerate(raw_summaries, start=1):
            s_copy = dict(s)
            del s_copy["raw_utility"]
            summaries.append(
                RouteComparisonSummary(
                    rank_under_preferences=rank,
                    **s_copy,
                )
            )

        # Generate comparative trade-off commentary
        trade_offs: list[str] = []
        plan_saf = suite["SAFETY_FIRST"].metrics
        plan_sci = suite["SCIENCE_FIRST"].metrics
        plan_bal = suite["BALANCED"].metrics

        # Trade-off 1: Science vs Safety
        sci_gain_pct = (
            (plan_sci.accumulated_science_opportunity - plan_saf.accumulated_science_opportunity)
            / max(0.01, plan_saf.accumulated_science_opportunity)
        ) * 100.0
        dur_diff_min = plan_sci.estimated_duration_minutes - plan_saf.estimated_duration_minutes
        trade_offs.append(
            f"Science-First yields +{sci_gain_pct:.1f}% more science than Safety-First, "
            f"with a duration difference of {dur_diff_min:+.1f} minutes."
        )

        # Trade-off 2: Hazard exposure
        haz_diff_pct = (plan_sci.mean_hazard_exposure - plan_saf.mean_hazard_exposure) * 100.0
        trade_offs.append(
            f"Safety-First reduces mean hazard exposure by {abs(haz_diff_pct):.1f}% "
            f"relative to Science-First by avoiding steep slopes and rough boulder terrain."
        )

        # Trade-off 3: Balanced compromise
        dist_diff_m = plan_bal.total_distance_m - min(
            plan_saf.total_distance_m, plan_sci.total_distance_m
        )
        trade_offs.append(
            f"Balanced Profile achieves {plan_bal.accumulated_science_opportunity:.1f} science "
            f"return within {dist_diff_m:+.0f}m of the shortest traversal distance."
        )

        comparison = MultiObjectiveComparison(
            start={"lat": start_lat, "lon": start_lon},
            destination={"lat": dest_lat, "lon": dest_lon},
            preferences_applied=pref_norm.to_dict(),
            routes=summaries,
            trade_off_analysis=trade_offs,
            no_universal_optimal_notice=self.UNIVERSAL_OPTIMAL_DISCLAIMER,
        )

        return comparison, suite

    @staticmethod
    def get_example_scenarios() -> list[dict[str, Any]]:
        """Return curated representative Jezero Crater exploration scenarios."""
        return [
            {
                "scenario_id": "SCENARIO-01-DELTA-INFILTRATION",
                "title": "Delta Infiltration from Octavia E. Butler Landing to Hawksbill Gap",
                "description": (
                    "Traverse from the Mars 2020 landing site across crater floor regolith "
                    "to the base of the western delta front scarp."
                ),
                "start": {"lat": 18.4446, "lon": 77.4509, "name": "Octavia E. Butler Landing"},
                "destination": {
                    "lat": 18.4550,
                    "lon": 77.4050,
                    "name": "Hawksbill Gap Delta Front",
                },
                "suggested_preferences": {
                    "safety_importance": 0.35,
                    "science_importance": 0.40,
                    "efficiency_importance": 0.25,
                },
            },
            {
                "scenario_id": "SCENARIO-02-KODIAK-RECONNAISSANCE",
                "title": "Kodiak Butte Isolated Delta Remnant Reconnaissance",
                "description": (
                    "Approach Kodiak Butte to inspect layered topset-foreset-bottomset "
                    "stratigraphy and smectite clay beds."
                ),
                "start": {"lat": 18.4446, "lon": 77.4509, "name": "Octavia E. Butler Landing"},
                "destination": {"lat": 18.4595, "lon": 77.4083, "name": "Kodiak Butte Outcrop"},
                "suggested_preferences": {
                    "safety_importance": 0.30,
                    "science_importance": 0.50,
                    "efficiency_importance": 0.20,
                },
            },
            {
                "scenario_id": "SCENARIO-03-MARGINAL-CARBONATE-TRANSECT",
                "title": "Marginal Carbonate Unconformity Transect",
                "description": (
                    "Extended traverse to investigate ancient magnesium-carbonate deposits "
                    "along the inner western crater rim wall."
                ),
                "start": {"lat": 18.4550, "lon": 77.4050, "name": "Hawksbill Gap Delta Front"},
                "destination": {
                    "lat": 18.4544,
                    "lon": 77.3982,
                    "name": "Marginal Carbonate Contact",
                },
                "suggested_preferences": {
                    "safety_importance": 0.50,
                    "science_importance": 0.35,
                    "efficiency_importance": 0.15,
                },
            },
        ]
