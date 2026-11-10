"""Executable ingestion script for Marswalk Planner approved datasets.

Usage (from repository root):
    backend/.venv/bin/python scripts/acquire_datasets.py [--tier 1|2|all] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.geospatial.downloader import PlanetaryDownloader
from app.geospatial.validator import validate_geojson, validate_raster

logger = logging.getLogger("marswalk.acquire")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%H:%M:%S"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


DATASET_CATALOG = [
    # Tier 1: USGS TRN Jezero Crater CTX DTM Mosaic (20m)
    {
        "tier": 1,
        "product_id": "10.5066/P906QQT8",
        "name": "USGS Mars 2020 TRN CTX DTM Mosaic (20m)",
        "url": "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
        "dest_rel_path": "usgs_trn/JEZ_ctx_B_soc_008_DTM_20m.tif",
        "expected_size": 9662387,  # ~9.6 MB
        "type": "raster",
    },
    # Tier 1: USGS TRN Jezero Crater CTX Orthomosaic (6m)
    {
        "tier": 1,
        "product_id": "10.5066/P9GV1ND3",
        "name": "USGS Mars 2020 TRN CTX Orthomosaic (6m)",
        "url": "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif",
        "dest_rel_path": "usgs_trn/JEZ_ctx_B_soc_008_orthoMosaic_6m.tif",
        "expected_size": 36269402,  # ~36.2 MB
        "type": "raster",
    },
    # Tier 1: USGS TRN HiRISE DTM Western Delta tile (1m post spacing)
    {
        "tier": 1,
        "product_id": "10.5066/P9REJ9JN",
        "name": "USGS Mars 2020 TRN HiRISE DTM Western Delta (1m)",
        "url": "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/DTM_MOLAtopography_DeltaGeoid_Jezero_DL_Edited_affine_1m_Eqc_latTs0_lon0.tif",
        "dest_rel_path": "usgs_trn/HiRISE_DTM_Delta_Jezero_DL_1m.tif",
        "expected_size": 114658582,  # ~114.6 MB
        "type": "raster",
    },
    # Tier 2: NASA Mars 2020 Perseverance Rover Waypoints (Ground-Truth In-Situ)
    {
        "tier": 2,
        "product_id": "mars2020_places_waypoints",
        "name": "Perseverance Rover In-Situ Waypoints (MMGIS)",
        "url": "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json",
        "dest_rel_path": "perseverance/M20_waypoints.json",
        "expected_size": None,  # Dynamically updated by NASA
        "type": "geojson",
    },
    # Tier 2: NASA Mars 2020 Perseverance Rover Full Traverse Path
    {
        "tier": 2,
        "product_id": "mars2020_places_traverse",
        "name": "Perseverance Rover In-Situ Traverse Path (MMGIS)",
        "url": "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json",
        "dest_rel_path": "perseverance/M20_traverse.json",
        "expected_size": None,  # Dynamically updated by NASA
        "type": "geojson",
    },
]


def acquire_all(tier: int | None = None, dry_run: bool = False) -> None:
    data_root = Path(__file__).resolve().parents[1] / "data"
    downloader = PlanetaryDownloader(data_root=data_root)

    print("\n" + "=" * 75)
    print("  MARSWALK PLANNER — PLANETARY DATA INGESTION ENGINE")
    print("=" * 75)

    selected = [
        item for item in DATASET_CATALOG if tier is None or item["tier"] == tier or tier == 0
    ]

    print(f"Target catalog items queued: {len(selected)}")
    if dry_run:
        print("DRY-RUN mode enabled. No files will be fetched.\n")
        for item in selected:
            print(f" - [Tier {item['tier']}] {item['name']} -> {item['dest_rel_path']}")
        return

    results = []

    for item in selected:
        print(f"\n---> Ingesting: {item['name']}")
        print(f"     Source URL: {item['url']}")
        print(f"     Target Path: data/raw/{item['dest_rel_path']}")

        entry = downloader.download_file(
            url=item["url"],
            dest_rel_path=item["dest_rel_path"],
            product_id=item["product_id"],
            expected_size=item.get("expected_size"),
        )

        val_report = None
        if entry.status in ("SUCCESS", "ALREADY_EXISTS_VERIFIED"):
            full_path = data_root / "raw" / item["dest_rel_path"]
            if item["type"] == "raster":
                val_report = validate_raster(full_path)
            elif item["type"] == "geojson":
                val_report = validate_geojson(full_path)

        results.append((item, entry, val_report))

    # Summary table
    print("\n" + "=" * 75)
    print("  INGESTION & INTEGRITY SUMMARY REPORT")
    print("=" * 75)

    total_downloaded = 0
    success_count = 0
    failure_count = 0

    for item, entry, val in results:
        status_label = entry.status
        size_mb = entry.byte_size / 1e6
        total_downloaded += entry.byte_size

        if entry.status in ("SUCCESS", "ALREADY_EXISTS_VERIFIED") and (val is None or val.is_valid):
            success_count += 1
            mark = "PASS"
        else:
            failure_count += 1
            mark = "FAIL"

        print(f"\n[{mark}] {item['name']}")
        print(f"       Status: {status_label} ({size_mb:.2f} MB)")
        print(f"       SHA-256: {entry.sha256[:16]}...{entry.sha256[-8:]}" if entry.sha256 else "       SHA-256: N/A")

        if val and val.is_valid:
            if hasattr(val, "width"):
                print(f"       Dimensions: {val.width} x {val.height} | Bands: {val.count} | Res: {val.resolution}")
                print(f"       CRS: {val.crs}")
                if val.min_value is not None and val.max_value is not None:
                    print(f"       Elevation / Value Range: {val.min_value:.2f} to {val.max_value:.2f}")
            elif hasattr(val, "feature_count"):
                print(f"       Features: {val.feature_count} | Geometry: {val.geometry_types}")
                print(f"       Bounding Box: {val.bounding_box}")
        elif val and not val.is_valid:
            print(f"       Validation Error: {val.error}")

    print("\n" + "-" * 75)
    print(f"Summary: {success_count} succeeded, {failure_count} failed.")
    print(f"Total Dataset Footprint: {total_downloaded / 1e6:.2f} MB")
    print("Manifest: data/manifests/download_manifest.jsonl updated.")
    print("=" * 75 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Acquire approved authentic planetary datasets for Marswalk Planner.")
    parser.add_argument("--tier", type=int, choices=[1, 2], default=1, help="Acquisition tier (1=Topography/Ortho, 2=Rover Tracks)")
    parser.add_argument("--dry-run", action="store_true", help="Print datasets to fetch without downloading")
    args = parser.parse_args()

    acquire_all(tier=args.tier, dry_run=args.dry_run)

