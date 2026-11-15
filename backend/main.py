"""Vercel entrypoint for Marswalk FastAPI backend service."""

import os
import sys
import traceback
from pathlib import Path
from unittest.mock import MagicMock

# Ensure the backend directory is in sys.path
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# On Vercel serverless containers, unconditionally stub out C-geospatial binaries
# to prevent glibc/dynamic-linker failures when libgdal.so or libproj.so are absent.
if os.environ.get("VERCEL") or not sys.platform.startswith("darwin"):
    for mod_name in [
        "rasterio",
        "rasterio.windows",
        "rasterio.transform",
        "rasterio.enums",
        "rasterio.crs",
        "rasterio.errors",
        "pyproj",
    ]:
        sys.modules[mod_name] = MagicMock()

try:
    from app.api.router import api_router  # noqa: E402
    from app.main import create_app  # noqa: E402

    # Primary application instance for Vercel
    app = create_app()

    # Mount with /v1 prefix so both /api/v1 and stripped /v1 match seamlessly
    app.include_router(api_router, prefix="/v1")
except Exception as e:
    err_str = str(e)
    err_tb = traceback.format_exc()
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    app = FastAPI(title="Marswalk Error Diagnostic")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"])
    async def catch_all(full_path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": "FastAPI initialization failed on Vercel",
                "exception": err_str,
                "traceback": err_tb.splitlines(),
                "path": full_path,
            },
        )

__all__ = ["app"]
