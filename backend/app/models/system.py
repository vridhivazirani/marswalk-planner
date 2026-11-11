"""Schemas for system-level endpoints."""

from typing import Any, Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response body of ``GET /api/v1/health``."""

    status: Literal["ok"]
    service: str
    version: str
    disclaimer: str


class DiagnosticHealthResponse(BaseModel):
    """Response body of ``GET /api/v1/health/diagnostic`` providing authentic telemetry."""

    status: Literal["ok", "degraded"]
    service: str
    version: str
    geospatial_engine: dict[str, Any]
    data_lake: dict[str, Any]
    catalogue: dict[str, Any]
    disclaimer: str

