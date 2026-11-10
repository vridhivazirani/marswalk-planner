"""Candidate scientific targets data structures, serialization, and GeoJSON export.

Includes mandatory epistemic class labeling, non-inference of life warnings,
and human EVA safety caveats for every target location.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class CandidateTarget:
    """A ranked scientific opportunity target within the Jezero study footprint."""

    target_id: str
    name: str
    rank: int
    lat: float  # Planetocentric East-Positive degrees
    lon: float  # Planetocentric East-Positive degrees
    elevation_m: float
    composite_opportunity_score: float  # [0.0, 1.0]
    primary_science_theme: str

    # Component opportunity breakdown [0.0, 1.0]
    mineralogical_interest: float
    geological_diversity: float
    layered_features: float
    delta_context: float
    rover_proximity: float
    confidence: float

    epistemic_class: str
    scientific_rationale: str
    safety_caveat: str
    life_inference_warning: str

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON dictionary."""
        return asdict(self)

    def to_geojson_feature(self) -> dict[str, Any]:
        """Convert to GeoJSON Point Feature."""
        return {
            "type": "Feature",
            "id": self.target_id,
            "geometry": {
                "type": "Point",
                "coordinates": [round(self.lon, 6), round(self.lat, 6), round(self.elevation_m, 1)],
            },
            "properties": {
                "target_id": self.target_id,
                "name": self.name,
                "rank": self.rank,
                "composite_score": round(self.composite_opportunity_score, 4),
                "primary_science_theme": self.primary_science_theme,
                "breakdown": {
                    "mineralogy": round(self.mineralogical_interest, 3),
                    "diversity": round(self.geological_diversity, 3),
                    "layered_features": round(self.layered_features, 3),
                    "delta_context": round(self.delta_context, 3),
                    "rover_proximity": round(self.rover_proximity, 3),
                    "confidence": round(self.confidence, 3),
                },
                "epistemic_class": self.epistemic_class,
                "rationale": self.scientific_rationale,
                "safety_caveat": self.safety_caveat,
                "life_inference_warning": self.life_inference_warning,
            },
        }
