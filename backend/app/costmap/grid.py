"""Grid specification and spatial compatibility validation for raster layers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.costmap.exceptions import GridMismatchError


@dataclass(frozen=True)
class RasterGridSpec:
    """Standardized geometric metadata for a raster grid."""

    crs: str
    shape: tuple[int, int]  # (height, width)
    bounds: tuple[float, float, float, float]  # (left, bottom, right, top)
    resolution: tuple[float, float]  # (dx, dy)

    @classmethod
    def from_rasterio(cls, src: Any) -> RasterGridSpec:  # noqa: ANN401
        """Extract grid specification from an open rasterio dataset."""
        crs_str = src.crs.to_string() if src.crs else "UNKNOWN"
        b = src.bounds
        return cls(
            crs=crs_str,
            shape=(src.height, src.width),
            bounds=(b.left, b.bottom, b.right, b.top),
            resolution=(src.res[0], src.res[1]),
        )


def validate_grid_compatibility(
    reference: RasterGridSpec,
    candidate: RasterGridSpec,
    candidate_name: str,
    tolerance: float = 1e-2,
) -> None:
    """Validate that candidate raster matches reference CRS, dimensions, resolution, and bounds.

    Raises:
        GridMismatchError: if any geometric attribute differs beyond tolerance.
    """
    if reference.crs != candidate.crs:
        raise GridMismatchError(
            f"Raster '{candidate_name}' CRS mismatch: expected {reference.crs}, "
            f"got {candidate.crs}."
        )

    if reference.shape != candidate.shape:
        raise GridMismatchError(
            f"Raster '{candidate_name}' shape mismatch: expected {reference.shape}, "
            f"got {candidate.shape}."
        )

    dx_diff = abs(reference.resolution[0] - candidate.resolution[0])
    dy_diff = abs(reference.resolution[1] - candidate.resolution[1])
    if dx_diff > tolerance or dy_diff > tolerance:
        raise GridMismatchError(
            f"Raster '{candidate_name}' resolution mismatch: expected {reference.resolution}, "
            f"got {candidate.resolution} (diff=({dx_diff:.4f}, {dy_diff:.4f}))."
        )

    for b_ref, b_cand, side in zip(
        reference.bounds, candidate.bounds, ["left", "bottom", "right", "top"], strict=True
    ):
        diff = abs(b_ref - b_cand)
        if diff > tolerance:
            raise GridMismatchError(
                f"Raster '{candidate_name}' bounds mismatch on {side}: expected {b_ref:.2f}, "
                f"got {b_cand:.2f} (diff={diff:.4f}m)."
            )
