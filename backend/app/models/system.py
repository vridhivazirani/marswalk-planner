"""Schemas for system-level endpoints."""

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response body of ``GET /api/v1/health``."""

    status: Literal["ok"]
    service: str
    version: str
    disclaimer: str
