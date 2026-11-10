"""Custom exceptions for the Marswalk Route Optimization Engine."""

from __future__ import annotations


class RoutingError(Exception):
    """Base exception for route planning and pathfinding errors."""


class BlockedStartError(RoutingError):
    """Raised when the requested route start cell is in impassable or unknown terrain."""


class BlockedDestinationError(RoutingError):
    """Raised when the requested route destination cell is in impassable or unknown terrain."""


class OutOfBoundsCoordinateError(RoutingError):
    """Raised when start or destination coordinates fall outside the study area grid."""


class UnreachableDestinationError(RoutingError):
    """Raised when no valid path exists between start and destination without crossing obstacles."""
