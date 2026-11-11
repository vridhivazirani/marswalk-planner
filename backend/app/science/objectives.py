"""Seven core scientific research objectives for human Mars exploration.

Adheres strictly to AGENTS.md rules:
- Mineral and sedimentary detections are abiotic aqueous indicators.
- Non-inference of extraterrestrial life.
- Authentic data provenance (CRISM, HiRISE, CTX, USGS SIM-3464).
"""

from __future__ import annotations

from pydantic import BaseModel

from app.core.disclaimer import DISCLAIMER


class ScientificObjective(BaseModel):
    """A structured scientific research objective for planetary surface investigation."""

    id: str
    number: int
    title: str
    description: str
    scientific_hypothesis: str
    diagnostic_spectral_indices: list[str]
    supporting_instruments: list[str]
    target_geological_units: list[str]
    candidate_target_ids: list[str]
    primary_investigation_methods: list[str]
    epistemic_class: str = "INTERPRETED"
    disclaimer: str = DISCLAIMER


SCIENTIFIC_OBJECTIVES: list[ScientificObjective] = [
    ScientificObjective(
        id="obj-water",
        number=1,
        title="Investigate evidence of ancient water",
        description=(
            "Trace morphological and geochemical records of open-channel paleofluvial flow, "
            "deltaic deposition, and standing surface water in the Jezero paleolake basin."
        ),
        scientific_hypothesis=(
            "Sustained fluvial transport through the Neretva Vallis breach fed a perennial "
            "lacustrine body inside Jezero Crater during the Late Noachian to Early "
            "Hesperian epochs."
        ),
        diagnostic_spectral_indices=["BD1900", "BD2210", "SINDEX2"],
        supporting_instruments=[
            "MRO CRISM",
            "MRO HiRISE",
            "MRO CTX",
            "M20 Mastcam-Z",
            "M20 SuperCam",
        ],
        target_geological_units=[
            "Western Delta Layered Unit (Nld)",
            "Delta Capping Unit (Hdc)",
        ],
        candidate_target_ids=["SCI-01-KODIAK", "SCI-02-HAWKSBILL", "SCI-07-NERETVA-APEX"],
        primary_investigation_methods=[
            "High-resolution scarp stratigraphy profiling",
            "Grain size distribution and pebble imbrication analysis",
            "Contact mapping between alluvial fan and lake floor",
        ],
    ),
    ScientificObjective(
        id="obj-clays",
        number=2,
        title="Identify clay-bearing geological formations",
        description=(
            "Locate and characterize phyllosilicate-rich sedimentary formations containing "
            "Fe/Mg and Al-smectite clays formed by neutral-to-alkaline aqueous alteration."
        ),
        scientific_hypothesis=(
            "Phyllosilicate-bearing strata at the bottom of the delta represent low-energy "
            "suspension settling in a quiescent lake, preserving detrital and authigenic clays."
        ),
        diagnostic_spectral_indices=["BD2210", "D2300", "BD1900"],
        supporting_instruments=["MRO CRISM", "M20 SuperCam (LIBS & VISIR)", "M20 PIXL"],
        target_geological_units=["Western Delta Layered Unit (Nld)"],
        candidate_target_ids=["SCI-02-HAWKSBILL", "SCI-05-THREE-FORKS", "SCI-08-ENCHANTED-LAKE"],
        primary_investigation_methods=[
            "Infrared reflectance spectroscopy for 2.21 µm and 2.30 µm absorption bands",
            "Outcrop scratch and micro-textural tactile abrasion inspection",
            "Core sample extraction for organic-geochemical cache",
        ],
    ),
    ScientificObjective(
        id="obj-lake-deposits",
        number=3,
        title="Investigate ancient lake deposits",
        description=(
            "Analyze distal lacustrine bottomset mudstones, laminated siltstones, and quiet-water "
            "sediments that accumulated on the floor of the Jezero paleolake."
        ),
        scientific_hypothesis=(
            "Fine-grained distal bottomset beds provide the highest fidelity record of lake water "
            "depth variations, pH conditions, and sedimentation rates over millennia."
        ),
        diagnostic_spectral_indices=["BD2210", "BD1900"],
        supporting_instruments=["MRO HiRISE", "M20 SHERLOC", "M20 PIXL", "M20 Mastcam-Z"],
        target_geological_units=[
            "Western Delta Layered Unit (Nld)",
            "Crater Floor Fractured Unit (Nff)",
        ],
        candidate_target_ids=["SCI-05-THREE-FORKS", "SCI-08-ENCHANTED-LAKE"],
        primary_investigation_methods=[
            "Millimeter-scale lamina thickness measurement",
            "Deep ultraviolet fluorescence mapping of organic preservation zones",
            "Micro-XRF (PIXL) elemental ratio profiling (Fe/Mn, Ca/Mg)",
        ],
    ),
    ScientificObjective(
        id="obj-sedimentary",
        number=4,
        title="Examine sedimentary structures",
        description=(
            "Document sedimentary bedforms including topset, foreset, and bottomset geometries, "
            "cross-stratification, channel scours, and ripple marks."
        ),
        scientific_hypothesis=(
            "Foreset dip angles and cross-bed geometries quantify the flow velocity, "
            "sediment discharge, and water depth of the Gilbert-type delta during deposition."
        ),
        diagnostic_spectral_indices=["BD2210", "HCPINDEX"],
        supporting_instruments=["MRO HiRISE 1m DTM", "M20 Mastcam-Z Stereo", "M20 SuperCam RMI"],
        target_geological_units=[
            "Western Delta Layered Unit (Nld)",
            "Delta Capping Unit (Hdc)",
        ],
        candidate_target_ids=["SCI-01-KODIAK", "SCI-04-BELVA-CRATER"],
        primary_investigation_methods=[
            "Stereo photogrammetric dip and strike measurements of foreset beds",
            "Unconformity mapping and sequence stratigraphy boundary tracing",
            "Paleocurrent vector estimation from cross-bedding orientations",
        ],
    ),
    ScientificObjective(
        id="obj-volcanic",
        number=5,
        title="Investigate volcanic terrain",
        description=(
            "Characterize the igneous cumulate and lava flow units flooring Jezero Crater, "
            "establishing absolute radiometric calibration and planetary crustal evolution."
        ),
        scientific_hypothesis=(
            "The crater floor unit (Séítah and Máaz formations) represents differentiated volcanic "
            "or impact-melt cumulates containing coarse olivine and pyroxene crystals."
        ),
        diagnostic_spectral_indices=["OLINDEX3", "HCPINDEX", "LCPINDEX"],
        supporting_instruments=["MRO CRISM", "M20 PIXL", "M20 SuperCam LIBS", "M20 RIMFAX GPR"],
        target_geological_units=["Crater Floor Fractured Unit (Nff)"],
        candidate_target_ids=["SCI-06-SEITAH-CONTACT", "SCI-03-CARBONATE-UNCONF"],
        primary_investigation_methods=[
            "GPR (RIMFAX) sounding of subsurface volcanic contact dipping",
            "Petrographic microscopic crystal fabric and olivine cumulate textural analysis",
            "Geochemical elemental profiling of cumulate pyroxene/olivine ratios",
        ],
    ),
    ScientificObjective(
        id="obj-rock-formations",
        number=6,
        title="Identify scientifically interesting rock formations",
        description=(
            "Examine exotic boulders, impact ejecta breccias, and anomalous rock units excavated "
            "from deep Noachian basement and regional impact events."
        ),
        scientific_hypothesis=(
            "High-energy boulder conglomerates and impact ejecta blocks expose crustal rocks "
            "transported from tens of kilometers outside the crater during deluge events."
        ),
        diagnostic_spectral_indices=["HCPINDEX", "BD2210", "SINDEX2"],
        supporting_instruments=["MRO HiRISE", "M20 Mastcam-Z", "M20 SuperCam"],
        target_geological_units=[
            "Delta Capping Unit (Hdc)",
            "Jezero Crater Rim & Basement (Ncr)",
        ],
        candidate_target_ids=["SCI-04-BELVA-CRATER", "SCI-10-WESTERN-RIM-WALL"],
        primary_investigation_methods=[
            "Clast provenance and lithology cataloging",
            "Impact breccia shock metamorphism inspection",
            "Matrix vs. clast geochemical differentiation",
        ],
    ),
    ScientificObjective(
        id="obj-biosignatures",
        number=7,
        title="Investigate possible biosignature-relevant environments",
        description=(
            "Explore habitable paleo-environments with high biosignature preservation potential, "
            "focusing on fine-grained clay mudstones and silica-carbonate mineralization."
        ),
        scientific_hypothesis=(
            "Alkaline lacustrine conditions coupled with rapid clay flocculation provided optimal "
            "taphonomic windows for entombal preservation of prebiotic compounds."
        ),
        diagnostic_spectral_indices=["BD2210", "D2300", "BD1900", "SINDEX2"],
        supporting_instruments=[
            "MRO CRISM",
            "M20 SHERLOC Deep-UV",
            "M20 PIXL",
            "M20 SuperCam",
        ],
        target_geological_units=["Western Delta Layered Unit (Nld)"],
        candidate_target_ids=["SCI-02-HAWKSBILL", "SCI-05-THREE-FORKS", "SCI-08-ENCHANTED-LAKE"],
        primary_investigation_methods=[
            "Deep-UV Raman spectroscopy for aromatic organic macromolecular detection",
            "Spatial co-localization mapping of micro-textures and carbon/sulfur/phosphorus",
            "Cryogenic sample hermetic encapsulation and contamination blank monitoring",
        ],
    ),
]


def get_all_objectives() -> list[ScientificObjective]:
    """Return the list of all 7 scientific exploration objectives."""
    return SCIENTIFIC_OBJECTIVES


def get_objective_by_id(objective_id: str) -> ScientificObjective | None:
    """Find a specific objective by its ID."""
    for obj in SCIENTIFIC_OBJECTIVES:
        if obj.id == objective_id:
            return obj
    return None
