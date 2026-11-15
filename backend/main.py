"""Vercel entrypoint for Marswalk FastAPI backend service."""

import json
import sys
import traceback
from pathlib import Path
from typing import Any

# Ensure the backend directory is in sys.path
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Handle environments (such as AWS Lambda on Amazon Linux 2023) where system libexpat.so.1
# is missing from the minimal runtime image, causing C-rasterio binary import failure.
try:
    import rasterio  # noqa: F401
except (ImportError, Exception):
    from unittest.mock import MagicMock

    for mod_name in [
        "rasterio",
        "rasterio.windows",
        "rasterio.transform",
        "rasterio.enums",
        "rasterio.crs",
        "rasterio.errors",
        "rasterio.coords",
    ]:
        sys.modules.setdefault(mod_name, MagicMock())

_real_app: Any = None
_init_error: tuple[str, str] | None = None


def _get_app():
    global _real_app, _init_error
    if _real_app is None and _init_error is None:
        try:
            from app.api.router import api_router
            from app.main import create_app

            real = create_app()
            # Mount with /v1 prefix so both /api/v1 and stripped /v1 match seamlessly
            real.include_router(api_router, prefix="/v1")
            _real_app = real
        except Exception as e:
            _init_error = (str(e), traceback.format_exc())
    return _real_app


async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    """ASGI entrypoint handler function for Vercel Python runtime."""
    real = _get_app()
    if real is None and _init_error is not None:
        err_msg, err_tb = _init_error
        payload = json.dumps(
            {
                "status": "error",
                "message": "Marswalk backend initialization error on Vercel",
                "exception": err_msg,
                "traceback": err_tb.splitlines(),
            }
        ).encode("utf-8")
        if scope.get("type") == "http":
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(payload)).encode("utf-8")),
                        (b"access-control-allow-origin", b"*"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": payload})
            return
    if real is not None:
        await real(scope, receive, send)


__all__ = ["app"]
