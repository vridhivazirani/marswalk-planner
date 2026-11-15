"""Vercel entrypoint for Marswalk FastAPI backend service."""

import sys
from pathlib import Path

# Ensure the backend directory is in sys.path
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.api.router import api_router  # noqa: E402
from app.main import create_app  # noqa: E402

# Define handler function 'app' at the module's top level for Vercel Python runtime
app = create_app()

# Also mount with /v1 prefix so both /api/v1 and stripped /v1 match seamlessly
app.include_router(api_router, prefix="/v1")

__all__ = ["app"]
