"""Configuration and parameters for the Marswalk Hazard Intelligence Engine.

All scoring thresholds and weights are configurable engineering assumptions
labeled as HEURISTIC prototype defaults.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class HazardProfile:
    """Configurable scoring weights, physical thresholds, and hard constraints.

    Disclaimer: These thresholds are research and education prototype assumptions.
    They are NOT certified NASA operational astronaut safety limits.
    """

    # --- Hard Constraints (Binary Impassable Restrictions) ---
    max_slope_deg: float = 25.0
    """Slopes at or above this threshold trigger hard restriction code 'SLOPE_GT_MAX'."""

    max_tri_m: float = 8.0
    """Terrain Ruggedness Index at or above this threshold triggers 'TRI_GT_MAX'."""

    forbid_unknown: bool = True
    """Missing or unmapped elevation data is strictly impassable ('NO_DATA_UNKNOWN')."""

    # --- Soft Hazard Normalization Bounds (Normalized to 0.0 -> 1.0) ---
    slope_safe_deg: float = 8.0
    """Slopes below this angle have 0.0 slope hazard penalty."""

    slope_critical_deg: float = 25.0
    """Slopes reaching this angle scale to 1.0 hazard penalty."""

    tri_safe_m: float = 0.5
    """Micro-roughness below this value has 0.0 roughness hazard penalty."""

    tri_critical_m: float = 6.0
    """Roughness reaching this value scales to 1.0 roughness hazard penalty."""

    # --- Composite Overall Soft Hazard Weights (Sum to 1.0) ---
    w_slope: float = 0.35
    """Weight of normalized slope hazard."""

    w_roughness: float = 0.20
    """Weight of normalized topographic roughness (TRI)."""

    w_boulder: float = 0.15
    """Weight of optical boulder / rock candidate density."""

    w_sand: float = 0.15
    """Weight of loose sand / dune energy expenditure penalty."""

    w_crater: float = 0.10
    """Weight of crater rim / depression steepness."""

    w_uncertainty: float = 0.05
    """Weight of data uncertainty / low-confidence observation penalty."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
