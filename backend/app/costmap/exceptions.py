"""Custom exceptions for the Marswalk Unified Cost Map Engine."""

from __future__ import annotations


class CostmapError(Exception):
    """Base exception for costmap domain errors."""


class GridMismatchError(CostmapError):
    """Raised when input rasters differ in CRS, shape, resolution, or bounding extent."""


class CostmapValidationError(CostmapError):
    """Raised when input cost values, weights, or dimensions fail validation."""
