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
    # Explicit CORS configuration for local development and authorized mission control origins.
    # Disallow wildcard origins when allow_credentials=True (resolves MW-SEC-01).
    allowed_origins = [orig for orig in settings.allowed_cors_origins if orig != "*"]
    if not allowed_origins and settings.environment == "development":
        allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=r"^https://.*\.vercel\.app$",
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)
    # Also mount with "/v1" for cloud proxies or serverless platforms that strip the "/api" prefix
    if settings.api_prefix != "/v1":
        app.include_router(api_router, prefix="/v1")
    return app


app = create_app()
