"""Integration tests verifying CORS security hardening (M0.2-SEC / MW-SEC-01).

Verifies:
1. Allowed local origins receive Access-Control-Allow-Origin matching their origin.
2. Allowed configured production origins receive proper CORS headers.
3. Untrusted external origins DO NOT receive Access-Control-Allow-Origin header.
4. Credentialed preflight (OPTIONS) requests succeed only for allowed origins.
5. Missing Origin header does not cause CORS errors.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


def test_cors_allowed_local_origin():
    """Local development frontend (http://localhost:5173) must receive CORS approval."""
    app = create_app()
    client = TestClient(app)

    response = client.get(
        "/api/v1/health",
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_untrusted_origin_rejected():
    """An untrusted origin (e.g. malicious site) must NOT be reflected in CORS headers."""
    app = create_app()
    client = TestClient(app)

    response = client.get(
        "/api/v1/health",
        headers={"Origin": "http://evil-mars-impostor.com"},
    )
    assert response.status_code == 200
    # Crucial security assertion: untrusted origin must NOT be echoed!
    assert "access-control-allow-origin" not in response.headers


def test_cors_configured_production_origin(monkeypatch):
    """Configuring MARSWALK_CORS_ORIGINS via environment allows specified production domain."""
    get_settings.cache_clear()
    monkeypatch.setenv("MARSWALK_CORS_ORIGINS", "https://marswalk.nasa.gov,https://mission.esa.int")

    app = create_app()
    client = TestClient(app)

    response = client.get(
        "/api/v1/health",
        headers={"Origin": "https://marswalk.nasa.gov"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://marswalk.nasa.gov"
    assert response.headers.get("access-control-allow-credentials") == "true"

    # Other origin configured
    resp2 = client.get(
        "/api/v1/health",
        headers={"Origin": "https://mission.esa.int"},
    )
    assert resp2.headers.get("access-control-allow-origin") == "https://mission.esa.int"

    # Non-whitelisted origin rejected
    resp3 = client.get(
        "/api/v1/health",
        headers={"Origin": "https://unauthorized-rover.org"},
    )
    assert "access-control-allow-origin" not in resp3.headers

    get_settings.cache_clear()


def test_cors_preflight_request():
    """Preflight OPTIONS request from allowed origin returns status 200 and allowed methods."""
    app = create_app()
    client = TestClient(app)

    response = client.options(
        "/api/v1/routing/plan",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "POST" in response.headers.get("access-control-allow-methods", "")


def test_cors_preflight_untrusted_rejected():
    """Preflight OPTIONS request from untrusted origin does NOT receive allow headers."""
    app = create_app()
    client = TestClient(app)

    response = client.options(
        "/api/v1/routing/plan",
        headers={
            "Origin": "http://phishing-eva.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in response.headers


def test_request_missing_origin_header():
    """Requests without an Origin header (e.g. curl, python scripts) must succeed normally."""
    app = create_app()
    client = TestClient(app)

    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
