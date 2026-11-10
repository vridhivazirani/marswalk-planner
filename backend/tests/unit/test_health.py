"""Tests for the health endpoint."""

from fastapi.testclient import TestClient

from app.core.disclaimer import DISCLAIMER
from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "marswalk-backend"


def test_health_includes_disclaimer() -> None:
    body = client.get("/api/v1/health").json()
    assert body["disclaimer"] == DISCLAIMER
    assert "not" in DISCLAIMER.lower() and "certified" in DISCLAIMER.lower()


def test_openapi_schema_is_served() -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/v1/health" in response.json()["paths"]
