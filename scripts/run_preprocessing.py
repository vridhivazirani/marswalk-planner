"""Executable command-line runner for Marswalk Geospatial Preprocessing Pipeline.

Usage:
    backend/.venv/bin/python scripts/run_preprocessing.py [--grid 20m|1m]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.geospatial.grid import get_western_delta_grid_1m, get_western_delta_grid_20m
from app.geospatial.pipeline import PreprocessingPipeline


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Marswalk Geospatial Preprocessing Pipeline.")
    parser.add_argument(
        "--grid",
        choices=["20m", "1m"],
        default="20m",
        help="Target ARD grid tier to generate (20m=L2 baseline, 1m=L0 high-res corridor)",
    )
    args = parser.parse_args()

    data_root = Path(__file__).resolve().parents[1] / "data"
    pipeline = PreprocessingPipeline(data_root=data_root)

    grid = get_western_delta_grid_20m() if args.grid == "20m" else get_western_delta_grid_1m()

    print("\n" + "=" * 75)
    print("  MARSWALK PLANNER — GEOSPATIAL PREPROCESSING PIPELINE")
    print(f"  Target Grid: {grid.name} | Resolution: {grid.resolution_m} m/pixel")
    print("=" * 75)

    created_products = pipeline.process_elevation_and_coverage(target_grid=grid, generate_qc=True)

    print("\n" + "=" * 75)
    print("  PREPROCESSING PIPELINE OUTPUT PRODUCTS")
    print("=" * 75)
    for key, path in created_products.items():
        size_mb = path.stat().st_size / 1e6
        print(f" - [{key.upper()}]: {path.name} ({size_mb:.2f} MB)")
    print("=" * 75 + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

