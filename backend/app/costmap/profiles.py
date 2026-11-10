"""Mission profiles and weighting configurations for the Unified Cost Map Engine."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.costmap.exceptions import CostmapValidationError


class MissionProfileType(StrEnum):
    """Supported mission profile categories."""

    SAFETY_FIRST = "SAFETY_FIRST"
    SCIENCE_FIRST = "SCIENCE_FIRST"
    BALANCED = "BALANCED"
    CUSTOM = "CUSTOM"


@dataclass(frozen=True)
class CostmapWeights:
    """Weights for the four primary soft cost components."""

    w_terrain: float = 0.30  # Slope and roughness traversal difficulty
    w_hazard: float = 0.30  # Environmental hazards (boulders, sand, depressions)
    w_uncertainty: float = 0.15  # Epistemic sensor uncertainty
    w_science: float = 0.25  # Opportunity cost of missing high-value science targets

    def __post_init__(self) -> None:
        weights = (self.w_terrain, self.w_hazard, self.w_uncertainty, self.w_science)
        if any(w < 0.0 for w in weights):
            raise CostmapValidationError("All costmap weights must be non-negative.")
        if sum(weights) <= 0.0:
            raise CostmapValidationError("Sum of costmap weights must be strictly positive.")

    def normalized(self) -> CostmapWeights:
        """Return a new instance with weights normalized to sum to exactly 1.0."""
        total = self.w_terrain + self.w_hazard + self.w_uncertainty + self.w_science
        return CostmapWeights(
            w_terrain=self.w_terrain / total,
            w_hazard=self.w_hazard / total,
            w_uncertainty=self.w_uncertainty / total,
            w_science=self.w_science / total,
        )

    def to_dict(self) -> dict[str, float]:
        """Convert weights to dictionary."""
        return {
            "w_terrain": round(self.w_terrain, 4),
            "w_hazard": round(self.w_hazard, 4),
            "w_uncertainty": round(self.w_uncertainty, 4),
            "w_science": round(self.w_science, 4),
        }


@dataclass(frozen=True)
class MissionProfile:
    """A documented operational mission profile with defined weights and philosophy."""

    profile_type: MissionProfileType
    title: str
    description: str
    weights: CostmapWeights

    def to_dict(self) -> dict[str, Any]:
        """Convert profile to JSON dictionary."""
        return {
            "profile_type": self.profile_type.value,
            "title": self.title,
            "description": self.description,
            "weights": self.weights.to_dict(),
        }


# Standard pre-configured mission profiles
DEFAULT_PROFILES: dict[str, MissionProfile] = {
    MissionProfileType.SAFETY_FIRST.value: MissionProfile(
        profile_type=MissionProfileType.SAFETY_FIRST,
        title="Safety First",
        description=(
            "Prioritizes low environmental hazard, low sensor uncertainty, and gentle terrain. "
            "Science exploration is secondary to human safety."
        ),
        weights=CostmapWeights(
            w_hazard=0.50,
            w_terrain=0.30,
            w_uncertainty=0.15,
            w_science=0.05,
        ),
    ),
    MissionProfileType.SCIENCE_FIRST.value: MissionProfile(
        profile_type=MissionProfileType.SCIENCE_FIRST,
        title="Science First",
        description=(
            "Prioritizes scientific return by seeking high-value mineralogy and outcrops, "
            "while strictly obeying hard traversability limits."
        ),
        weights=CostmapWeights(
            w_science=0.55,
            w_hazard=0.20,
            w_terrain=0.15,
            w_uncertainty=0.10,
        ),
    ),
    MissionProfileType.BALANCED.value: MissionProfile(
        profile_type=MissionProfileType.BALANCED,
        title="Balanced",
        description=(
            "Balanced operational trade-off between traversal energy expenditure, "
            "environmental risk, and scientific yield."
        ),
        weights=CostmapWeights(
            w_terrain=0.30,
            w_hazard=0.30,
            w_science=0.25,
            w_uncertainty=0.15,
        ),
    ),
}
