"""Geological unit definitions, CRISM spectral signatures, and epistemic classifications.

Based on USGS SIM 3464 (Sun & Stack 2020) and CRISM targeted observations
(Goudge et al. 2015, Viviano-Beck et al. 2014, Tarnas et al. 2019).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.epistemic import EpistemicClass


@dataclass(frozen=True)
class GeologicUnit:
    """Lithologic or geomorphic unit mapped in the Jezero study area."""

    unit_id: int
    name: str
    code: str
    description: str
    primary_mineralogy: str
    epistemic_class: str
    base_science_value: float  # [0.0, 1.0]


# Published geological units present in the Jezero Western Fan study area:
GEOLOGIC_UNITS: dict[int, GeologicUnit] = {
    1: GeologicUnit(
        unit_id=1,
        name="Crater Floor Fractured / Olivine-Bearing Unit",
        code="cf-f",
        description="Low-elevation fractured igneous floor (Séítah and Máaz formations).",
        primary_mineralogy="Olivine, pyroxene (magmatic cumulate / basaltic lava)",
        epistemic_class=EpistemicClass.INTERPRETED.value,
        base_science_value=0.55,
    ),
    2: GeologicUnit(
        unit_id=2,
        name="Delta Bottomset Mudstones",
        code="d-bs",
        description="Fine-grained distal lacustrine sediments with high preservation potential.",
        primary_mineralogy="Fe/Mg smectite clay (nontronite / saponite)",
        epistemic_class=EpistemicClass.INTERPRETED.value,
        base_science_value=0.90,
    ),
    3: GeologicUnit(
        unit_id=3,
        name="Delta Front & Dipping Foresets",
        code="d-fs",
        description="Steep erosional delta scarp exposing truncated dipping sandstone beds.",
        primary_mineralogy="Mixed phyllosilicates and detrital basaltic sandstones",
        epistemic_class=EpistemicClass.INTERPRETED.value,
        base_science_value=0.85,
    ),
    4: GeologicUnit(
        unit_id=4,
        name="Delta Topset Channel Network",
        code="d-ts",
        description="Coarse-grained fluvial conglomerates and distributary river channels.",
        primary_mineralogy="Fluvial lithic sandstones and boulder conglomerates",
        epistemic_class=EpistemicClass.INTERPRETED.value,
        base_science_value=0.75,
    ),
    5: GeologicUnit(
        unit_id=5,
        name="Marginal Carbonate & Unconformity Unit",
        code="m-carb",
        description="Carbonate bathtub ring and basement contact along western crater wall.",
        primary_mineralogy="Mg-carbonates (magnesite / dolomite) and hydrous silica",
        epistemic_class=EpistemicClass.INTERPRETED.value,
        base_science_value=0.95,
    ),
    6: GeologicUnit(
        unit_id=6,
        name="Kodiak Isolated Delta Remnant Butte",
        code="kodiak",
        description="Erosional mesa exhibiting topset, foreset, and bottomset architecture.",
        primary_mineralogy="Layered smectites, sandstones, and fluvial gravels",
        epistemic_class=EpistemicClass.INTERPRETED.value,
        base_science_value=0.98,
    ),
    7: GeologicUnit(
        unit_id=7,
        name="Jezero Crater Rim & Noachian Basement",
        code="rim-basement",
        description="Pre-impact crustal bedrock and impact breccia cliffs.",
        primary_mineralogy="Anorthositic / pyroxene-rich ancient crustal breccia",
        epistemic_class=EpistemicClass.INTERPRETED.value,
        base_science_value=0.65,
    ),
}
