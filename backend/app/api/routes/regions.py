"""REST API router for Mars Planetary Exploration Atlas — Multi-Region Registry."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.catalog.region_registry import (
    RegionMetadata,
    find_region_by_coordinates,
    get_all_regions,
    get_region_by_id,
)

router = APIRouter(prefix="/regions", tags=["regions"])


class RegionSummaryDTO(BaseModel):
    """Summary record for a priority region."""

    id: str
    name: str
    canonical_feature_name: str
    physiographic_province: str
    formation_period: str
    center: list[float]
    has_local_digital_twin: bool
    missions_count: int
    datasets_count: int


class RegionsListResponse(BaseModel):
    """Response containing all registered Martian exploration regions."""

    total_regions: int
    regions: list[RegionSummaryDTO]


@router.get(
    "",
    response_model=RegionsListResponse,
    summary="List all priority Martian exploration regions",
)
def list_regions() -> RegionsListResponse:
    """Retrieve summary metadata for all 12 priority Martian exploration regions."""
    all_regs = get_all_regions()
    summaries = [
        RegionSummaryDTO(
            id=r.id,
            name=r.name,
            canonical_feature_name=r.canonical_feature_name,
            physiographic_province=r.physiographic_province,
            formation_period=r.formation_period,
            center=r.center,
            has_local_digital_twin=r.has_local_digital_twin,
            missions_count=len(r.missions),
            datasets_count=len(r.available_datasets),
        )
        for r in all_regs
    ]
    return RegionsListResponse(total_regions=len(summaries), regions=summaries)


@router.get(
    "/{region_id}",
    response_model=RegionMetadata,
    summary="Get full scientific metadata dossier for a region",
)
def get_region_dossier(region_id: str) -> RegionMetadata:
    """Retrieve comprehensive scientific metadata, bounding box, missions, and datasets."""
    region = get_region_by_id(region_id)
    if not region:
        valid_ids = [r.id for r in get_all_regions()]
        raise HTTPException(
            status_code=404,
            detail=f"Region '{region_id}' not found in registry. Valid regions: {valid_ids}",
        )
    return region


@router.get(
    "/lookup/coordinates",
    response_model=RegionMetadata | None,
    summary="Find region enclosing given lat/lon",
)
def lookup_region_by_coords(
    lat: float = Query(
        ..., ge=-90.0, le=90.0, description="Planetocentric latitude in degrees [-90, 90]"
    ),
    lon: float = Query(
        ..., ge=-180.0, le=180.0, description="East-positive longitude in degrees [-180, 180]"
    ),
) -> Any:
    """Find a priority Martian region enclosing the specified coordinates, or null."""
    match = find_region_by_coordinates(lat, lon)
    if not match:
        return {
            "region": None,
            "message": f"Coordinates ({lat}, {lon}) are outside the 12 priority study regions.",
        }
    return match
