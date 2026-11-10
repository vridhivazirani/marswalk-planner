"""Execution pipeline for Marswalk Hazard Intelligence layers.

Generates:
1. Normalized individual hazard rasters (slope, roughness, boulder, sand, crater, unknown).
2. Hard impassable constraint mask with restriction codes.
3. Composite overall risk heatmap GeoTIFF & colormapped QC preview.
4. Hazard metadata catalog record in data/catalog/.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio

from app.hazards.config import HazardProfile
from app.hazards.evaluator import HazardBundle, compute_hazard_bundle

logger = logging.getLogger("marswalk.hazards")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    fmt = "[%(asctime)s] [%(levelname)s] %(message)s"
    handler.setFormatter(logging.Formatter(fmt, datefmt="%H:%M:%S"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

STANDARD_NODATA = -9999.0


class HazardIntelligenceEngine:
    """Manages computation and export of hazard layers and hard constraints."""

    def __init__(self, data_root: Path | None = None) -> None:
        if data_root is None:
            self.data_root = Path(__file__).resolve().parents[3] / "data"
        else:
            self.data_root = Path(data_root)

        self.processed_dir = self.data_root / "processed"
        self.catalog_dir = self.data_root / "catalog"
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.catalog_dir.mkdir(parents=True, exist_ok=True)

    def run_hazard_analysis(
        self,
        grid_name: str = "jezero_western_delta_20m",
        profile: HazardProfile | None = None,
    ) -> tuple[HazardBundle, dict[str, Path]]:
        """Compute all hazard layers and export GeoTIFFs, metadata, and QC images."""
        if profile is None:
            profile = HazardProfile()

        logger.info("Executing Hazard Analysis for grid %s...", grid_name)

        # Ingest required terrain & hazard inputs
        slope_path = self.processed_dir / f"{grid_name}_slope_deg.tif"
        tri_path = self.processed_dir / f"{grid_name}_tri_roughness_m.tif"
        boulder_path = self.processed_dir / f"{grid_name}_boulder_hazard_score.tif"
        sand_path = self.processed_dir / f"{grid_name}_sand_hazard_score.tif"
        crater_path = self.processed_dir / f"{grid_name}_crater_hazard_score.tif"
        src_id_path = self.processed_dir / f"{grid_name}_source_id.tif"

        with rasterio.open(slope_path) as s_src:
            slope = s_src.read(1)
            meta = s_src.meta.copy()

        with rasterio.open(tri_path) as t_src:
            tri = t_src.read(1)

        with rasterio.open(boulder_path) as b_src:
            boulder_score = b_src.read(1)

        with rasterio.open(sand_path) as sa_src:
            sand_score = sa_src.read(1)

        with rasterio.open(crater_path) as c_src:
            crater_score = c_src.read(1)

        with rasterio.open(src_id_path) as sid_src:
            source_id = sid_src.read(1)

        valid_mask = (slope != STANDARD_NODATA) & ~np.isnan(slope)

        # Compute complete hazard bundle
        bundle = compute_hazard_bundle(
            slope=slope,
            tri=tri,
            boulder_score=boulder_score,
            sand_score=sand_score,
            crater_score=crater_score,
            valid_mask=valid_mask,
            source_id=source_id,
            profile=profile,
        )

        created_files: dict[str, Path] = {}

        # -------------------------------------------------------------
        # 1. Export Hard Impassable Constraint Mask (uint8)
        # -------------------------------------------------------------
        impassable_path = self.processed_dir / f"{grid_name}_hazard_hard_impassable.tif"
        self._write_tif(
            impassable_path,
            bundle.hard_impassable_mask.astype(np.uint8),
            meta,
            "uint8",
            0,
        )
        created_files["hard_impassable"] = impassable_path

        # -------------------------------------------------------------
        # 2. Export Composite Overall Hazard Layer (float32, 0.0 - 1.0)
        # -------------------------------------------------------------
        overall_path = self.processed_dir / f"{grid_name}_hazard_overall_score.tif"
        self._write_tif(overall_path, bundle.overall_hazard, meta, "float32", 1.0)
        created_files["overall_hazard"] = overall_path

        # -------------------------------------------------------------
        # 3. Export Visual Overall Hazard Heatmap (QC PNG)
        # -------------------------------------------------------------
        qc_overall_path = self.processed_dir / f"{grid_name}_qc_overall_hazard.png"
        self._generate_hazard_qc(
            bundle.overall_hazard,
            bundle.hard_impassable_mask,
            qc_overall_path,
        )
        created_files["qc_overall"] = qc_overall_path

        # -------------------------------------------------------------
        # 4. Catalog Provenance & Configuration
        # -------------------------------------------------------------
        impassable_count = int(np.count_nonzero(bundle.hard_impassable_mask))
        total_cells = bundle.overall_hazard.size
        catalog_path = self.catalog_dir / f"{grid_name}_hazard_intelligence.json"

        valid_overall = bundle.overall_hazard[~bundle.hard_impassable_mask]
        metadata = {
            "grid_name": grid_name,
            "processed_utc": datetime.now(UTC).isoformat(),
            "profile": profile.to_dict(),
            "statistics": {
                "total_cells": total_cells,
                "hard_impassable_cells": impassable_count,
                "impassable_percentage": float(impassable_count / total_cells * 100.0),
                "mean_overall_hazard": float(valid_overall.mean()),
                "max_overall_hazard": float(bundle.overall_hazard.max()),
                "min_overall_hazard": float(valid_overall.min()),
            },
            "layers": [
                {
                    "id": "h_slope",
                    "name": "Slope Hazard",
                    "range": [0.0, 1.0],
                    "epistemic": "DERIVED",
                },
                {
                    "id": "h_roughness",
                    "name": "Roughness Hazard",
                    "range": [0.0, 1.0],
                    "epistemic": "DERIVED",
                },
                {
                    "id": "h_boulder",
                    "name": "Boulder Hazard",
                    "range": [0.0, 1.0],
                    "epistemic": "DERIVED",
                },
                {
                    "id": "h_sand",
                    "name": "Loose Sand Hazard",
                    "range": [0.0, 1.0],
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "h_crater",
                    "name": "Crater Hazard",
                    "range": [0.0, 1.0],
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "overall_hazard",
                    "name": "Composite Hazard",
                    "range": [0.0, 1.0],
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "hard_impassable",
                    "name": "Hard Impassable Mask",
                    "type": "bool",
                    "epistemic": "HEURISTIC",
                },
            ],
        }
        catalog_path.write_text(json.dumps(metadata, indent=2))
        created_files["catalog"] = catalog_path

        logger.info(
            "Hazard analysis complete. Impassable cells: %d (%.2f%%)",
            impassable_count,
            impassable_count / total_cells * 100.0,
        )
        return bundle, created_files

    @staticmethod
    def _write_tif(
        path: Path,
        data: np.ndarray,
        meta: dict[str, Any],
        dtype: str,
        nodata: float | int,
    ) -> None:
        m = meta.copy()
        m.update(count=1, dtype=dtype, nodata=nodata, compress="deflate")
        with rasterio.open(path, "w", **m) as dst:
            dst.write(data, 1)

    @staticmethod
    def _generate_hazard_qc(overall: np.ndarray, impassable: np.ndarray, out_path: Path) -> None:
        """Render heatmap: Green (low risk) -> Red (high risk) -> Magenta (Impassable)."""
        h, w = overall.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)

        # Smooth green-to-red gradient for passable terrain
        r = np.clip(overall * 2.0 * 255.0, 0, 255).astype(np.uint8)
        g = np.clip((1.0 - overall) * 2.0 * 255.0, 0, 255).astype(np.uint8)
        b = np.full((h, w), 20, dtype=np.uint8)

        # Impassable hard constraints: Bright Magenta (255, 0, 220)
        r[impassable] = 255
        g[impassable] = 0
        b[impassable] = 220

        rgb[0] = r
        rgb[1] = g
        rgb[2] = b

        with rasterio.open(
            out_path, "w", driver="PNG", width=w, height=h, count=3, dtype="uint8"
        ) as dst:
            dst.write(rgb)
