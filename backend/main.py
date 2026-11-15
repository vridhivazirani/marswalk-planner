"""Vercel entrypoint for Marswalk FastAPI backend service."""

import sys
import traceback
from pathlib import Path
from unittest.mock import MagicMock

# Ensure the backend directory is in sys.path
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Provide lightweight stubs for heavy C-geospatial binaries in serverless cloud environments
for mod_name in [
    "rasterio",
    "rasterio.windows",
    "rasterio.transform",
    "rasterio.enums",
    "rasterio.crs",
    "rasterio.errors",
    "pyproj",
]:
    try:
        __import__(mod_name)
    except ImportError:
        sys.modules[mod_name] = MagicMock()

try:
    from app.api.router import api_router
    from app.main import app
    # Mount api_router at /v1 if not already present, ensuring both /api/v1 and /v1 match on Vercel
    app.include_router(api_router, prefix="/v1")
except Exception as e:
    err_str = str(e)
    err_tb = traceback.format_exc()
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    app = FastAPI(title="Marswalk Backend Diagnostic Recovery")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"])
    async def catch_all(full_path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": "FastAPI initialization failed on serverless runtime",
                "exception": err_str,
                "traceback": err_tb.splitlines(),
                "path": full_path,
            },
        )

__all__ = ["app"]
