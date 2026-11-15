"""FastAPI router for the Marswalk Unified Cost Map Engine.

Serves pre-configured mission profiles, evaluates custom interactive weights,
streams cost map heatmaps, and provides point-level cost inspection.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.costmap.evaluator import compute_unified_costmap
from app.costmap.profiles import DEFAULT_PROFILES, CostmapWeights, MissionProfileType

router = APIRouter(prefix="/costmap", tags=["cost-map"])

PROCESSED_DIR = Path(__file__).resolve().parents[4] / "data" / "processed"


class CustomWeightsRequest(BaseModel):
    """Interactive custom weights submitted by the user."""

    w_terrain: float = Field(0.30, ge=0.0, description="Terrain difficulty weight")
    w_hazard: float = Field(0.30, ge=0.0, description="Hazard weight")
    w_uncertainty: float = Field(0.15, ge=0.0, description="Topographic uncertainty weight")
    w_science: float = Field(0.25, ge=0.0, description="Science opportunity weight")


@router.get("/profiles", summary="Get standard pre-configured mission profiles")
def get_mission_profiles() -> dict[str, Any]:
    """Return SAFETY_FIRST, SCIENCE_FIRST, and BALANCED profiles and default weights."""
    return {
        "profiles": {k: p.to_dict() for k, p in DEFAULT_PROFILES.items()},
        "active_default": MissionProfileType.BALANCED.value,
    }


@router.post("/evaluate", summary="Evaluate cost map with interactive custom weights")
def evaluate_custom_costmap(req: CustomWeightsRequest) -> dict[str, Any]:
    """Dynamically evaluate cost map statistics with user-configured weights."""
    from app.costmap.pipeline import CostmapEngine

    weights = CostmapWeights(
        w_terrain=req.w_terrain,
        w_hazard=req.w_hazard,
        w_uncertainty=req.w_uncertainty,
        w_science=req.w_science,
    )
    engine = CostmapEngine()
    bundle, _ = engine.evaluate_costmap(weights=weights, profile_name="custom")
    return {
        "status": "SUCCESS",
        "profile": "CUSTOM",
        "weights_applied": bundle.weights.to_dict(),
        "statistics": bundle.statistics,
    }


CACHE_HEADERS = {"Cache-Control": "public, max-age=86400, stale-while-revalidate=3600"}


@router.get("/raster/{profile_name}.png", summary="Serve cost map heatmap PNG for a profile")
def get_costmap_raster_png(profile_name: str) -> FileResponse:
    """Stream high-contrast PNG heatmap for the requested profile."""
    slug = profile_name.lower().replace("_", "-")
    target = PROCESSED_DIR / f"jezero_western_delta_20m_qc_costmap_{slug}.png"
    if not target.exists():
        # Fallback to balanced if not found
        target = PROCESSED_DIR / "jezero_western_delta_20m_qc_costmap_balanced.png"
    if not target.exists():
        raise HTTPException(status_code=404, detail="Cost map heatmap not found")
    return FileResponse(target, media_type="image/png", headers=CACHE_HEADERS)


@router.get("/inspect", summary="Explain unified cost and terms for a specific coordinate")
def inspect_location_cost(
    lat: float = Query(..., description="Planetocentric latitude in degrees"),
    lon: float = Query(..., description="East-positive longitude in degrees"),
    profile: str = Query("BALANCED", description="Mission profile to apply"),
) -> dict[str, Any]:
    """Inspect all soft cost factors, hard restrictions, and final cost at a coordinate."""
    from app.terrain.provider import TerrainDataProvider

    provider = TerrainDataProvider.get_instance(processed_dir=PROCESSED_DIR)
    sample = provider.sample_point(lat=lat, lon=lon)
    if sample["status"] != "AVAILABLE":
        reasons_list = sample.get(
            "reasons", ["Location is outside the Jezero Western Delta study footprint."]
        )
        return {
            "coordinate": {"lat": lat, "lon": lon},
            "status": sample.get("status", "DATA_UNAVAILABLE"),
            "is_blocked": True,
            "reason_code": sample.get("hard_restriction_code") or "DATA_UNAVAILABLE",
            "explanation": " ".join(reasons_list),
            "epistemic_class": sample.get("epistemic_class", "UNKNOWN"),
        }

    elev_val = float(sample["elevation_m"])
    slope_val = float(sample["slope_deg"])
    tri_val = float(sample["tri_roughness_m"])
    haz_val = float(sample["hazard_score"])
    imp_val = bool(sample["hard_constraint_triggered"])
    unc = sample["uncertainty"]
    sigma_val = float(unc["sigma_z_m"]) if unc.get("sigma_z_m") is not None else -9999.0
    sci_val = float(sample["science_opportunity"])

    # Select weights
    prof_key = profile.upper()
    if prof_key in DEFAULT_PROFILES:
        weights = DEFAULT_PROFILES[prof_key].weights
    else:
        weights = DEFAULT_PROFILES[MissionProfileType.BALANCED.value].weights

    is_elev_valid = np.isfinite(elev_val) and elev_val > -9000.0
    sigma_clean = (
        sigma_val
        if (np.isfinite(sigma_val) and sigma_val > -9000.0 and abs(sigma_val - 999.0) > 1e-3)
        else -9999.0
    )

    # Single cell evaluation
    bundle = compute_unified_costmap(
        slope=np.array([[slope_val]]),
        tri=np.array([[tri_val]]),
        hazard_score=np.array([[haz_val]]),
        sigma_z=np.array([[sigma_clean]]),
        science_opportunity=np.array([[sci_val]]),
        data_coverage_mask=np.array([[is_elev_valid]]),
        hard_impassable_mask=np.array([[imp_val]]),
        weights=weights,
    )

    is_blocked = bool(bundle.hard_blocked_mask[0, 0])
    cost_val = float(bundle.combined_cost[0, 0])

    reasons: list[str] = []
    if is_blocked:
        if not is_elev_valid:
            reasons.append("Location is unmapped/NoData (strictly forbidden).")
        if slope_val >= 25.0:
            reasons.append(f"Slope {slope_val:.1f}° exceeds maximum safe traversability limit 25°.")
        if tri_val >= 8.0:
            reasons.append(f"Surface roughness {tri_val:.2f}m exceeds maximum obstacle limit 8m.")
    else:
        reasons.append(
            f"Passable terrain under {prof_key} profile. Cost multiplier {cost_val:.2f} "
            f"(scale 1.0 - 10.0). Primary soft factors: terrain difficulty "
            f"({float(bundle.c_terrain[0, 0]):.2f}), hazard ({float(bundle.c_hazard[0, 0]):.2f}), "
            f"science opportunity ({float(bundle.c_science_opportunity[0, 0]):.2f})."
        )

    return {
        "coordinate": {"lat": lat, "lon": lon},
        "elevation_m": elev_val if is_elev_valid else None,
        "is_blocked": is_blocked,
        "combined_cost": None if np.isinf(cost_val) else cost_val,
        "cost_multiplier_scale": "1.0 to 10.0",
        "individual_components": {
            "c_terrain_difficulty": float(bundle.c_terrain[0, 0]),
            "c_environmental_hazard": float(bundle.c_hazard[0, 0]),
            "c_topographic_uncertainty": float(bundle.c_uncertainty[0, 0]),
            "c_science_opportunity": float(bundle.c_science_opportunity[0, 0]),
        },
        "weights_applied": bundle.weights.to_dict(),
        "mission_profile": prof_key,
        "explanation": " ".join(reasons),
    }
