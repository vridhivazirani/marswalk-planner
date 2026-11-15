"""Robust data lake directory resolution across local, CI, and serverless environments."""

from __future__ import annotations

from pathlib import Path


def get_data_dir(subdir: str = "") -> Path:
    """Resolve data directory by checking backend/data first (serverless), then repo root data."""
    # 1. Inside backend/data (Vercel serverless where root is backend/)
    backend_data = Path(__file__).resolve().parents[2] / "data"
    if subdir:
        backend_sub = backend_data / subdir
        if backend_sub.exists():
            return backend_sub
    elif backend_data.exists():
        return backend_data

    # 2. Repo root data (local development or tests)
    repo_data = Path(__file__).resolve().parents[3] / "data"
    if subdir:
        repo_sub = repo_data / subdir
        if repo_sub.exists():
            return repo_sub
    elif repo_data.exists():
        return repo_data

    # 3. Relative to working directory
    cwd_data = Path("data")
    if subdir:
        cwd_sub = cwd_data / subdir
        if cwd_sub.exists():
            return cwd_sub
    elif cwd_data.exists():
        return cwd_data

    return repo_data / subdir if subdir else repo_data


PROCESSED_DIR = get_data_dir("processed")
CATALOG_DIR = get_data_dir("catalog")
RAW_DIR = get_data_dir("raw")
