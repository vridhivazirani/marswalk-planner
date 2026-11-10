"""FastAPI application entry point.

Run locally (from the ``backend/`` directory, with the virtual environment active):

    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.router import api_router
from app.core.config import get_settings
from app.core.disclaimer import DISCLAIMER


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()
    app = FastAPI(
        title="Marswalk Planner API",
        version=__version__,
        description=(
            "Mars geospatial analysis and EVA route-planning research prototype "
            f"for Jezero Crater.\n\n**{DISCLAIMER}**"
        ),
        debug=settings.debug,
    )
    # Enable CORS for local development and mission control frontend integration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
