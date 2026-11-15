"""Vercel entrypoint re-exporting the FastAPI application from app.main."""

import sys
import traceback
from pathlib import Path

# Ensure the backend directory is in sys.path
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from app.main import app
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
