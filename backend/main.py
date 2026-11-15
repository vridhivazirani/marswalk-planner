"""Vercel entrypoint for Marswalk FastAPI backend service."""

import sys
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
    except Exception:
        sys.modules[mod_name] = MagicMock()

from app.api.router import api_router  # noqa: E402
from app.main import create_app  # noqa: E402

# Top-level assignment required by Vercel Python runtime AST analyzer
app = create_app()

# Mount with /v1 prefix so both /api/v1 and stripped /v1 match seamlessly
app.include_router(api_router, prefix="/v1")

__all__ = ["app"]
