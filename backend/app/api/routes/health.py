"""System health endpoint."""

from fastapi import APIRouter

from app import __version__
from app.core.disclaimer import DISCLAIMER
from app.models.system import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, summary="Service liveness check")
def health() -> HealthResponse:
    """Report that the API process is running. Performs no scientific computation."""
    return HealthResponse(
        status="ok", service="marswalk-backend", version=__version__, disclaimer=DISCLAIMER
    )
