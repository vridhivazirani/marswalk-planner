"""Epistemic classification: *how do we know this value?*

Every layer, vector feature and analytical result in Marswalk Planner must carry
exactly one :class:`EpistemicClass`. See ``docs/architecture.md`` section 0.1.
"""

from enum import StrEnum


class EpistemicClass(StrEnum):
    """Origin and reliability category of a piece of information."""

    OBSERVED = "OBSERVED"
    """Direct instrument measurement or archived mission product, meaning unchanged."""

    DERIVED = "DERIVED"
    """Computed from observed data by a deterministic, documented algorithm."""

    INTERPRETED = "INTERPRETED"
    """Expert human interpretation from published literature (e.g. geologic maps)."""

    PREDICTED = "PREDICTED"
    """Output of a statistical or machine-learning model; must carry uncertainty."""

    HEURISTIC = "HEURISTIC"
    """Engineering assumption or rule of thumb chosen by this project."""

    SIMULATED = "SIMULATED"
    """Hypothetical scenario input that was never observed."""

    UNKNOWN = "UNKNOWN"
    """No data, or data of insufficient quality. Never to be treated as safe."""
