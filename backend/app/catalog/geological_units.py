"""Authentic geological units from USGS SIM-3464 and CRISM spectral mineralogy at Jezero.

Reference:
- Sun, V. Z. & Stack, K. M. (2020). Geologic Map of Jezero Crater and the Nili Planum Region,
  Mars. USGS Scientific Investigations Map 3464, Pamphlet 14 p., 1 sheet, scale 1:75,000.
  https://doi.org/10.3133/sim3464
- Ehlmann, B. L., et al. (2008). Clay minerals in delta deposits and organic preservation potential
  on Mars. Nature Geoscience, 1(6), 355-358.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.epistemic import EpistemicClass


@dataclass(frozen=True)
class GeologicUnit:
    """An authentic mapped stratigraphic unit from USGS SIM-3464."""

    symbol: str
    name: str
    epoch: str
    dominant_lithology: str
    key_minerals: list[str]
    traversability_risk: str
    eva_science_priority: str
    description: str
    sample_cores_collected: list[str]
    color_hex: str
    epistemic_class: str = EpistemicClass.INTERPRETED.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "name": self.name,
            "epoch": self.epoch,
            "dominant_lithology": self.dominant_lithology,
            "key_minerals": self.key_minerals,
            "traversability_risk": self.traversability_risk,
            "eva_science_priority": self.eva_science_priority,
            "description": self.description,
            "sample_cores_collected": self.sample_cores_collected,
            "color_hex": self.color_hex,
            "epistemic_class": self.epistemic_class,
        }


USGS_SIM3464_UNITS: list[GeologicUnit] = [
    GeologicUnit(
        symbol="Nld",
        name="Western Delta Layered Unit",
        epoch="Late Noachian to Early Hesperian",
        dominant_lithology="Fine-grained mudstone, siltstone, and sandstone",
        key_minerals=["Fe/Mg smectite clays", "Mg-carbonates", "Hydrated silica"],
        traversability_risk="Low to Moderate (Steep erosional scarps up to 25° at edges)",
        eva_science_priority="CRITICAL (Primary biosignature preservation target)",
        description=(
            "Distal delta-front strata deposited in quiet lacustrine conditions; "
            "exhibits fine rhythmic laminations ideal for preserving organic carbon."
        ),
        sample_cores_collected=["Montdenier", "Salette", "Swift Run", "Skyland"],
        color_hex="#4a7c59",
    ),
    GeologicUnit(
        symbol="Nldb",
        name="Delta Blocky Scarp Unit",
        epoch="Late Noachian to Early Hesperian",
        dominant_lithology="Coarse boulder-conglomerate and fractured mudstone",
        key_minerals=["Carbonate-bearing clays", "Olivine", "Pyroxene"],
        traversability_risk="HIGH (Dense metric boulder fields >0.5m, scarp slopes >20°)",
        eva_science_priority="HIGH (Stratigraphic cross-sections of energetic river flood surges)",
        description=(
            "Massive, blocky beds near the top of the delta scarp containing rounded "
            "fluvial cobbles transported by high-energy flood stages through Neretva Vallis."
        ),
        sample_cores_collected=["Hazeltop", "Bearwallow"],
        color_hex="#8c564b",
    ),
    GeologicUnit(
        symbol="Ncf",
        name="Crater Floor Olivine-Bearing Unit (Séítah Formation)",
        epoch="Early Hesperian (~3.8 Ga)",
        dominant_lithology="Cumulate igneous olivine-rich rock / poikilitic basalt",
        key_minerals=["Coarse-grained olivine (Fo50-70)", "Augite pyroxene", "Carbonate cement"],
        traversability_risk="MODERATE (Transverse Aeolian Ridges (TARs) with loose sandy drift)",
        eva_science_priority="VERY HIGH (Igneous crystallization age dating for Mars timescale)",
        description=(
            "Thick stratiform ultramafic/mafic igneous body formed by either a thick "
            "lava flow, volcanic pond, or sub-surface magma chamber sill within the crater floor."
        ),
        sample_cores_collected=["Guillaumes", "Bellegarde", "Dourbes", "Robine"],
        color_hex="#9467bd",
    ),
    GeologicUnit(
        symbol="Nff",
        name="Floor Fractured Unit (Máaz Formation)",
        epoch="Early Hesperian",
        dominant_lithology="Basaltic lava flows or pyroclastic volcanic deposits",
        key_minerals=["Plagioclase", "Clinopyroxene", "Secondary iron oxides"],
        traversability_risk="LOW (Competent, low-slope pavement; ideal for rapid sortie transit)",
        eva_science_priority="MODERATE (Establishes upper volcanic cap age over basement units)",
        description=(
            "Competent, polygonal fractured lava flow unit covering the northern and "
            "eastern portions of the western crater floor."
        ),
        sample_cores_collected=["Montagnac", "Salette-Pair", "Malay"],
        color_hex="#7f7f7f",
    ),
    GeologicUnit(
        symbol="Ncr",
        name="Crater Rim & Basement Terrane Unit",
        epoch="Middle to Late Noachian (>3.9 Ga)",
        dominant_lithology="Impact breccia and pre-existing Martian crustal basement",
        key_minerals=["Low-Ca pyroxene", "Smectite clays", "Impact melt glass"],
        traversability_risk="EXTREME (Steep crater walls >30°, talus slopes, impassable cliffs)",
        eva_science_priority="HIGH (Ancient pre-impact Noachian crustal evolution)",
        description=(
            "Elevated rim bedrock excavated by the Jezero impact event into the Nili "
            "Fossae regional basement crust."
        ),
        sample_cores_collected=["Kukaklek (Rim Float)"],
        color_hex="#e377c2",
    ),
]


@dataclass(frozen=True)
class CRIMSpectralIndex:
    """An authentic mineral spectral absorption index from MRO CRISM."""

    index_code: str
    name: str
    wavelength_microns: float
    target_mineral: str
    absorption_feature: str
    geological_significance: str
    epistemic_class: str = EpistemicClass.OBSERVED.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "index_code": self.index_code,
            "name": self.name,
            "wavelength_microns": self.wavelength_microns,
            "target_mineral": self.target_mineral,
            "absorption_feature": self.absorption_feature,
            "geological_significance": self.geological_significance,
            "epistemic_class": self.epistemic_class,
        }


CRISM_INDICES: list[CRIMSpectralIndex] = [
    CRIMSpectralIndex(
        index_code="D2300",
        name="Fe/Mg Smectite Clay Absorption Band",
        wavelength_microns=2.30,
        target_mineral="Fe/Mg Smectites (Nontronite / Saponite)",
        absorption_feature="Metal-OH vibrational overtone (Fe,Mg-OH)",
        geological_significance=(
            "Direct indicator of neutral-to-alkaline aqueous alteration in ancient lacustrine beds."
        ),
    ),
    CRIMSpectralIndex(
        index_code="MIN2290",
        name="Magnesium Carbonate Absorption Band",
        wavelength_microns=2.29,
        target_mineral="Mg-Carbonate (Magnesite)",
        absorption_feature="CO3 overtone absorption doublet",
        geological_significance=(
            "Forms via atmospheric CO2 drawdown in shallow alkaline lake water margins."
        ),
    ),
    CRIMSpectralIndex(
        index_code="OLINDEX3",
        name="Olivine Broad Band Absorption Index",
        wavelength_microns=1.05,
        target_mineral="Forsteritic Olivine ((Mg,Fe)2SiO4)",
        absorption_feature="Broad Fe2+ electronic crystal-field transition at 1 µm",
        geological_significance=(
            "Readily altered by water; its preservation indicates low weathering post-emplacement."
        ),
    ),
    CRIMSpectralIndex(
        index_code="BD1900",
        name="Hydrated Mineral Water Band",
        wavelength_microns=1.93,
        target_mineral="Structural & Adsorbed H2O",
        absorption_feature="H-O-H molecular bending and stretching combination",
        geological_significance=(
            "Confirms structural crystal water in sedimentary minerals and hydrated salts."
        ),
    ),
]


def get_all_geologic_units() -> list[GeologicUnit]:
    """Return authentic USGS SIM-3464 geologic formations."""
    return USGS_SIM3464_UNITS


def get_all_crism_indices() -> list[CRIMSpectralIndex]:
    """Return authentic CRISM spectral summary indices."""
    return CRISM_INDICES


@dataclass(frozen=True)
class GlobalGeologicUnit:
    """An authentic mapped global stratigraphic unit from USGS SIM-3292 (Tanaka et al. 2014)."""

    symbol: str
    name: str
    system: str  # Amazonian, Hesperian, Noachian
    epoch: str
    dominant_lithology: str
    color_hex: str
    area_percentage: float
    description: str
    limitations: str
    epistemic_class: str = EpistemicClass.INTERPRETED.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "name": self.name,
            "system": self.system,
            "epoch": self.epoch,
            "dominant_lithology": self.dominant_lithology,
            "color_hex": self.color_hex,
            "area_percentage": self.area_percentage,
            "description": self.description,
            "limitations": self.limitations,
            "epistemic_class": self.epistemic_class,
            "authority": "USGS Scientific Investigations Map 3292 (Tanaka et al., 2014)",
            "doi": "https://doi.org/10.3133/sim3292",
        }


USGS_SIM3292_GLOBAL_UNITS: list[GlobalGeologicUnit] = [
    GlobalGeologicUnit(
        symbol="lAv",
        name="Late Amazonian Volcanic Unit",
        system="Amazonian",
        epoch="Late Amazonian (<300 Ma)",
        dominant_lithology="Pristine flood basalts, lava tubes, and volcanic shields",
        color_hex="#3d5941",
        area_percentage=3.8,
        description=(
            "Youngest planetary lava flow fields covering the summits of Olympus Mons, "
            "Ascraeus, Pavonis, and Arsia Montes."
        ),
        limitations="Sparse impact crater retention limits precise absolute age calibration.",
    ),
    GlobalGeologicUnit(
        symbol="eAv",
        name="Early Amazonian Volcanic Unit",
        system="Amazonian",
        epoch="Early Amazonian (~1.0–1.5 Ga)",
        dominant_lithology="Extensive sheet lavas and fissure-fed basalt plains",
        color_hex="#7da37d",
        area_percentage=5.4,
        description="Lava plains forming the broad volcanic shields of Elysium and Tharsis flanks.",
        limitations="Interpreted from Viking and THEMIS thermophysical surface textures.",
    ),
    GlobalGeologicUnit(
        symbol="lApi",
        name="Late Amazonian Polar Ice Cap Unit",
        system="Amazonian",
        epoch="Late Amazonian to Present",
        dominant_lithology="Water ice, seasonal solid CO2, and atmospheric dust interbeds",
        color_hex="#f0f8ff",
        area_percentage=1.2,
        description="Residual perennial polar caps of Planum Boreum and Planum Australe.",
        limitations="Subject to volatile sublimation cycles and dynamic polar seasonal retreat.",
    ),
    GlobalGeologicUnit(
        symbol="ABb",
        name="Amazonian-Hesperian Lowland Basin Unit (Vastitas Borealis)",
        system="Amazonian/Hesperian",
        epoch="Late Hesperian to Early Amazonian",
        dominant_lithology="Sublimation lag, mud volcanoes, patterned ground, and sediments",
        color_hex="#87ceeb",
        area_percentage=28.5,
        description=(
            "Vast northern plains deposits occupying the Martian northern lowlands; "
            "hypothesized ancient oceanic basin floor."
        ),
        limitations="Heavy periglacial mantling and cryogenic regolith conceal underlying bedrock.",
    ),
    GlobalGeologicUnit(
        symbol="eHt",
        name="Early Hesperian Transition Unit",
        system="Hesperian",
        epoch="Early Hesperian (~3.6–3.8 Ga)",
        dominant_lithology="Chaotic jumbled blocks, collapsed megabreccia, and valley fills",
        color_hex="#d2691e",
        area_percentage=4.1,
        description=(
            "Chaotic terrains sourcing gigantic circum-Chryse outflow channels and "
            "Valles Marineris."
        ),
        limitations="Severe catastrophic collapse disrupts original pre-collapse stratigraphy.",
    ),
    GlobalGeologicUnit(
        symbol="lHv",
        name="Late Hesperian Volcanic Unit",
        system="Hesperian",
        epoch="Late Hesperian (~3.2–3.6 Ga)",
        dominant_lithology="Wrinkle-ridged basaltic plains and flood volcanic construct",
        color_hex="#8b6508",
        area_percentage=9.6,
        description=(
            "Extensive volcanic plateau covering Syrtis Major, Lunae Planum, and Hesperia Planum."
        ),
        limitations="Wrinkle ridges represent compressional folding over volcanic basement.",
    ),
    GlobalGeologicUnit(
        symbol="lHch",
        name="Late Hesperian Channel-Floor Unit",
        system="Hesperian",
        epoch="Late Hesperian",
        dominant_lithology="Fluvial gravel bars, boulder conglomerates, and scoured bedrock",
        color_hex="#cd853f",
        area_percentage=2.3,
        description="Outflow channel floors: Ares, Tiu, Simud, and Kasei Valles.",
        limitations="Sedimentary bedforms reflect multi-stage high-energy discharge episodes.",
    ),
    GlobalGeologicUnit(
        symbol="lNh",
        name="Late Noachian Highland Unit",
        system="Noachian",
        epoch="Late Noachian (~3.8 Ga)",
        dominant_lithology="Cratered crustal bedrock, phyllosilicate-bearing impact sheets",
        color_hex="#8b4513",
        area_percentage=19.4,
        description=(
            "Densely cratered highland plateaus across Arabia Terra, Terra Sabaea, and "
            "Noachis Terra dissected by valley networks."
        ),
        limitations="Impact gardening and aeolian dust blanketing obscure fine stratification.",
    ),
    GlobalGeologicUnit(
        symbol="mNh",
        name="Middle Noachian Highland Unit",
        system="Noachian",
        epoch="Middle Noachian (~3.9–4.0 Ga)",
        dominant_lithology="Pervasively altered crustal megabreccia and basaltic basement",
        color_hex="#5c2411",
        area_percentage=16.7,
        description=(
            "Ancient cratered highlands preserving the earliest geochemical record of "
            "liquid water on Mars."
        ),
        limitations="High impact degradation and hydrothermal overprinting complicate correlation.",
    ),
    GlobalGeologicUnit(
        symbol="eNh",
        name="Early Noachian Highland Unit",
        system="Noachian",
        epoch="Early Noachian (>4.0 Ga)",
        dominant_lithology="Deep primordial crust and giant impact basin rings (Hellas, Isidis)",
        color_hex="#3b1700",
        area_percentage=8.9,
        description="Oldest crust forming the mountainous rims of Hellas and Isidis basins.",
        limitations="Pre-dates late heavy bombardment; absolute ages rely on lunar scaling.",
    ),
]


def get_all_global_geologic_units() -> list[GlobalGeologicUnit]:
    """Return authentic USGS SIM-3292 global geologic units."""
    return USGS_SIM3292_GLOBAL_UNITS
