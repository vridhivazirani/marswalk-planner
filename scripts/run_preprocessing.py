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

from app.costmap.pipeline import CostmapEngine
from app.geospatial.grid import get_western_delta_grid_1m, get_western_delta_grid_20m
from app.geospatial.pipeline import PreprocessingPipeline
from app.hazards.pipeline import HazardIntelligenceEngine
from app.terrain.engine import TerrainIntelligenceEngine
from app.terrain.native_hazards import NativeResolutionHazardPipeline


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
    print("  MARSWALK PLANNER — AUTHORITATIVE GEOSPATIAL PIPELINE")
    print(f"  Target Grid: {grid.name} | Resolution: {grid.resolution_m} m/pixel")
    print("=" * 75)

    print("\n[STAGE 1/5] Ingesting and Warping Elevation Coverage...")
    created_products = pipeline.process_elevation_and_coverage(target_grid=grid, generate_qc=True)

    if args.grid == "20m":
        print("\n[STAGE 2/5] Continuous 20m Terrain Derivatives & Feature Extraction...")
        terrain_engine = TerrainIntelligenceEngine(data_root=data_root)
        terrain_products = terrain_engine.run_terrain_analysis(grid_name=grid.name)
        created_products.update(terrain_products)

        print("\n[STAGE 3/5] Native 1.0m HiRISE Hazard Detection & Conservative Aggregation...")
        native_hazard_pipe = NativeResolutionHazardPipeline(data_root=data_root)
        hirise_products = native_hazard_pipe.process_and_export()
        created_products.update(hirise_products)

        print("\n[STAGE 4/5] Authoritative Multi-Source Hazard Fusion & Constraint Synthesis...")
        hazard_engine = HazardIntelligenceEngine(data_root=data_root)
        _, hazard_products = hazard_engine.run_hazard_analysis(grid_name=grid.name)
        created_products.update(hazard_products)

        print("\n[STAGE 5/5] Multi-Profile Unified Costmap Generation...")
        costmap_engine = CostmapEngine(
            processed_dir=data_root / "processed",
            catalog_dir=data_root / "catalog",
        )
        for profile in ["balanced", "safety-first", "science-first"]:
            _, costmap_products = costmap_engine.evaluate_costmap(
                grid_name=grid.name, profile_name=profile
            )
            created_products.update(costmap_products)

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

