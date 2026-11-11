"""Top-level API router that aggregates all versioned route modules."""

from fastapi import APIRouter

from app.api.routes import (
    atlas,
    catalog,
    costmap,
    emergency,
    environmental,
    hazards,
    health,
    mission,
    routing,
    science,
    terrain,
    twin,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["system"])
api_router.include_router(atlas.router)
api_router.include_router(catalog.router)
api_router.include_router(twin.router)
api_router.include_router(terrain.router)
api_router.include_router(hazards.router)
api_router.include_router(science.router)
api_router.include_router(costmap.router)
api_router.include_router(routing.router)
api_router.include_router(mission.router)
api_router.include_router(environmental.router)
api_router.include_router(emergency.router)
