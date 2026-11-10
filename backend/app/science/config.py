"""Configuration and weighting parameters for the Scientific Opportunity Engine.

All scoring rules maintain epistemic classes and adhere to AGENTS.md:
- Mineral signatures are abiotic aqueous indicators; NEVER infer life.
- Rover observations record past telemetry; NEVER assume surrounding terrain is safe.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class ScienceProfile:
    """Configurable weights and thresholds for multi-criteria science opportunity scoring."""

    # Multi-criteria component weights (normalized dynamically to sum = 1.0)
    w_mineralogy: float = 0.30  # Spectral interest: smectite clays, carbonates, olivine
    w_diversity: float = 0.20  # Lithologic variety and geological contact zones
    w_layered: float = 0.15  # Layered sedimentary outcrops, foresets, and scarps
    w_delta: float = 0.15  # Sedimentary fan geomorphology and lacustrine context
    w_proximity: float = 0.10  # Proximity to documented Perseverance ground truth
    w_confidence: float = 0.10  # Data coverage and resolution confidence

    # Sub-weights for mineralogical evaluation
    w_clay: float = 0.45  # Smectite clays (aqueous habitability & organic preservation potential)
    w_carbonate: float = 0.35  # Marginal Mg-carbonates (ancient atmospheric & water chemistry)
    w_olivine: float = 0.20  # Igneous olivine-bearing cumulates (crater floor petrology)

    # Rover proximity decay parameter (metres)
    rover_decay_m: float = 500.0

    # Candidate target extraction parameters
    target_min_separation_m: float = 300.0
    max_candidate_targets: int = 12

    # Mandatory epistemic and safety warning texts
    disclaimer_life_inference: str = (
        "SCIENTIFIC INTEGRITY NOTICE: Mineral detections (smectite clays, carbonates, sulfates) "
        "indicate abiotic aqueous alteration and high organic preservation potential. They do NOT "
        "infer or confirm the existence of past or present extraterrestrial life."
    )
    disclaimer_rover_safety: str = (
        "SAFETY CAVEAT: Perseverance rover telemetry documents authentic robotic exploration "
        "history. Rover tracks do NOT prove terrain is safe for human extravehicular foot travel. "
        "All terrain hazards must be independently evaluated via the Hazard Intelligence Engine."
    )

    def to_dict(self) -> dict[str, Any]:
        """Serialize configuration to a JSON-compatible dictionary."""
        return asdict(self)
