"""Tests for the epistemic classification vocabulary."""

from app.core.epistemic import EpistemicClass


def test_required_classes_exist() -> None:
    expected = {
        "OBSERVED",
        "DERIVED",
        "INTERPRETED",
        "PREDICTED",
        "HEURISTIC",
        "SIMULATED",
        "UNKNOWN",
    }
    assert {c.value for c in EpistemicClass} == expected


def test_values_serialise_as_plain_strings() -> None:
    assert EpistemicClass.UNKNOWN == "UNKNOWN"
