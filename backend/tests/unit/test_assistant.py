"""Unit tests for Marswalk AI Research Assistant & Explain Map endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_assistant_crism_mineralogy_query() -> None:
    """Test grounded QA regarding CRISM spectral signatures and smectites."""
    response = client.post(
        "/api/v1/assistant/query",
        json={"query": "What CRISM minerals and clays are detected in Jezero Crater?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["epistemic_class"] == "OBSERVED"
    assert "CRISM" in data["answer"]
    assert "smectite" in data["answer"].lower() or "mineral" in data["answer"].lower()
    assert len(data["citations"]) >= 1
    assert data["citations"][0]["authority"] == "NASA PDS Geosciences Node"
    assert len(data["suggested_followups"]) >= 1
    assert "disclaimer" in data


def test_assistant_geology_stratigraphy_query() -> None:
    """Test grounded QA on USGS SIM-3464 stratigraphy."""
    response = client.post(
        "/api/v1/assistant/query",
        json={"query": "Explain the geologic formations and rock units in Jezero"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["epistemic_class"] == "INTERPRETED"
    assert "USGS SIM-3464" in data["answer"]
    assert "Western Delta Layered Unit" in data["answer"]
    assert data["citations"][0]["product_id"] == "PLN-INT-02"


def test_assistant_region_query() -> None:
    """Test query about other planetary regions like Gale Crater."""
    response = client.post(
        "/api/v1/assistant/query",
        json={"query": "Tell me about Gale Crater region"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "Gale Crater" in data["answer"]
    assert "Curiosity" in data["answer"] or "elevation" in data["answer"].lower()
    assert len(data["citations"]) >= 1


def test_assistant_environmental_query() -> None:
    """Test query on diurnal temperature and dust tau."""
    response = client.post(
        "/api/v1/assistant/query",
        json={"query": "What is the diurnal temperature swing and dust opacity?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["epistemic_class"] == "SIMULATED"
    assert "Diurnal Temperature" in data["answer"]
    assert "-82°C" in data["answer"]
    assert data["citations"][0]["product_id"] == "PLN-SRC-07"


def test_assistant_biophysics_query() -> None:
    """Test query on Pandolf biophysics and EVA consumable reserves."""
    response = client.post(
        "/api/v1/assistant/query",
        json={"query": "How is metabolic power and oxygen consumable calculated for EVA?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["epistemic_class"] == "HEURISTIC"
    assert "Pandolf" in data["answer"]
    assert "395 W" in data["answer"]


def test_explain_map_viewport() -> None:
    """Test explain map endpoint for current viewport coordinates."""
    response = client.post(
        "/api/v1/assistant/explain-map",
        json={
            "lat": 18.4485,
            "lon": 77.4320,
            "region_id": "reg-jezero",
            "active_layers": ["CTX_MOSAIC", "CRISM_BD2210"],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["region_id"] == "reg-jezero"
    assert "Western Delta Layered Unit" in data["geological_unit"]
    assert "smectite" in data["geological_interpretation"].lower()
    assert "CRISM_BD2210" in data["scientific_summary"]
    assert data["epistemic_class"] == "INTERPRETED"
    assert "disclaimer" in data
