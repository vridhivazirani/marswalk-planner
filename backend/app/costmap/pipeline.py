"""Unified Cost Map pipeline for the Jezero Western Fan study area.

Validates that all input rasters share the identical grid specification (CRS,
shape, resolution, bounding extent), evaluates normalized multi-criteria cost terms,
enforces hard constraints, and generates high-contrast QC heatmaps and catalog records.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio

from app.costmap.evaluator import CostmapBundle, compute_unified_costmap
from app.costmap.grid import RasterGridSpec, validate_grid_compatibility
from app.costmap.profiles import DEFAULT_PROFILES, CostmapWeights, MissionProfileType

logger = logging.getLogger(__name__)


class CostmapEngine:
    """Orchestrates grid validation, multi-criteria cost evaluation, and raster export."""

    def __init__(
        self,
        processed_dir: Path | None = None,
        catalog_dir: Path | None = None,
    ) -> None:
        base = Path(__file__).resolve().parents[3]
        self.processed_dir = processed_dir or (base / "data" / "processed")
        self.catalog_dir = catalog_dir or (base / "data" / "catalog")

        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.catalog_dir.mkdir(parents=True, exist_ok=True)

    def evaluate_costmap(
        self,
        grid_name: str = "jezero_western_delta_20m",
        weights: CostmapWeights | None = None,
        profile_name: str = MissionProfileType.BALANCED.value,
    ) -> tuple[CostmapBundle, dict[str, Path]]:
        """Validate input grids and evaluate the unified cost map."""
        if weights is None:
            if profile_name in DEFAULT_PROFILES:
                weights = DEFAULT_PROFILES[profile_name].weights
            else:
                weights = DEFAULT_PROFILES[MissionProfileType.BALANCED.value].weights

        logger.info(
            "Executing Unified Cost Map evaluation for %s [Profile: %s]",
            grid_name,
            profile_name,
        )

        required_layers = {
            "elevation": self.processed_dir / f"{grid_name}_elevation.tif",
            "slope": self.processed_dir / f"{grid_name}_slope_deg.tif",
            "tri": self.processed_dir / f"{grid_name}_tri_roughness_m.tif",
            "hazard_score": self.processed_dir / f"{grid_name}_hazard_overall_score.tif",
            "hard_impassable": self.processed_dir / f"{grid_name}_hazard_hard_impassable.tif",
            "sigma_z": self.processed_dir / f"{grid_name}_uncertainty_sigma_z.tif",
            "science_opportunity": self.processed_dir / f"{grid_name}_science_opportunity.tif",
            "source_id": self.processed_dir / f"{grid_name}_source_id.tif",
        }

        # Check file existence
        for name, path in required_layers.items():
            if not path.exists():
                raise FileNotFoundError(f"Missing required costmap input layer '{name}': {path}")

        # -------------------------------------------------------------
        # 1. Validate that all rasters use the exact same grid
        # -------------------------------------------------------------
        grids: dict[str, RasterGridSpec] = {}
        raster_data: dict[str, np.ndarray] = {}
        ref_spec: RasterGridSpec | None = None
        export_meta: dict[str, Any] | None = None

        for name, path in required_layers.items():
            with rasterio.open(path) as src:
                spec = RasterGridSpec.from_rasterio(src)
                grids[name] = spec
                raster_data[name] = src.read(1)
                if ref_spec is None:
                    ref_spec = spec
                    export_meta = src.meta.copy()
                else:
                    validate_grid_compatibility(ref_spec, spec, name)

        assert export_meta is not None

        # Build data coverage mask: valid elevation (not NoData -9999.0)
        elev = raster_data["elevation"]
        data_coverage_mask = elev != -9999.0

        # Hard impassable mask from hazard engine (uint8 == 1)
        hard_impassable_mask = raster_data["hard_impassable"] > 0

        # -------------------------------------------------------------
        # 2. Evaluate Unified Cost Map Bundle
        # -------------------------------------------------------------
        bundle = compute_unified_costmap(
            slope=raster_data["slope"],
            tri=raster_data["tri"],
            hazard_score=raster_data["hazard_score"],
            sigma_z=raster_data["sigma_z"],
            science_opportunity=raster_data["science_opportunity"],
            data_coverage_mask=data_coverage_mask,
            hard_impassable_mask=hard_impassable_mask,
            weights=weights,
        )

        created_files: dict[str, Path] = {}
        profile_slug = profile_name.lower().replace("_", "-")

        # -------------------------------------------------------------
        # 3. Export Cost Map GeoTIFF
        # -------------------------------------------------------------
        tif_path = self.processed_dir / f"{grid_name}_costmap_{profile_slug}.tif"
        # Export with sentinel value 1e6 for blocked/infinite cells to ensure GIS compatibility
        export_cost = np.where(bundle.hard_blocked_mask, 1e6, bundle.combined_cost)
        self._write_tif(tif_path, export_cost.astype(np.float32), export_meta, "float32", 1e6)
        created_files["costmap_tif"] = tif_path

        # -------------------------------------------------------------
        # 4. Export Visual Heatmap QC PNG
        # -------------------------------------------------------------
        qc_path = self.processed_dir / f"{grid_name}_qc_costmap_{profile_slug}.png"
        self._generate_costmap_qc(bundle, qc_path)
        created_files["qc_png"] = qc_path

        # -------------------------------------------------------------
        # 5. Export Catalog Metadata
        # -------------------------------------------------------------
        catalog_path = self.catalog_dir / f"{grid_name}_costmap_catalog.json"
        metadata = {
            "grid_name": grid_name,
            "processed_utc": datetime.now(UTC).isoformat(),
            "active_profile": profile_name,
            "weights_applied": bundle.weights.to_dict(),
            "statistics": bundle.statistics,
            "preconfigured_profiles": {k: p.to_dict() for k, p in DEFAULT_PROFILES.items()},
            "layers": [
                {
                    "id": "c_terrain",
                    "name": "Normalized Terrain Difficulty",
                    "range": [0.0, 1.0],
                    "epistemic": "DERIVED",
                },
                {
                    "id": "c_hazard",
                    "name": "Normalized Environmental Hazard",
                    "range": [0.0, 1.0],
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "c_uncertainty",
                    "name": "Normalized Topographic Uncertainty",
                    "range": [0.0, 1.0],
                    "epistemic": "DERIVED",
                },
                {
                    "id": "c_science_opportunity",
                    "name": "Science Opportunity (Discount)",
                    "range": [0.0, 1.0],
                    "epistemic": "INTERPRETED",
                },
                {
                    "id": "combined_cost",
                    "name": "Unified Routing Cost Multiplier",
                    "range": [1.0, 10.0],
                    "blocked_value": "inf",
                    "epistemic": "HEURISTIC",
                },
            ],
        }
        catalog_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        created_files["catalog"] = catalog_path

        logger.info(
            "Unified Cost Map complete for %s. Mean passable cost: %s",
            profile_name,
            bundle.statistics.get("mean_passable_cost", "N/A"),
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
    def _generate_costmap_qc(bundle: CostmapBundle, out_path: Path) -> None:
        """Render costmap heatmap:

        - Passable terrain: Emerald Green (1.0) -> Yellow (4.5) -> Red/Orange (9.0+).
        - Hard blocked cells: Bright Magenta (255, 0, 220).
        - Unknown / NoData cells: Pitch Black (15, 15, 18).
        """
        cost = bundle.combined_cost
        h, w = cost.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)

        # Normalize passable cost [1.0, 10.0] into [0.0, 1.0]
        norm = np.clip((cost - 1.0) / 9.0, 0.0, 1.0)

        # Smooth gradient for passable terrain
        r = np.clip(norm * 2.0 * 255.0, 0, 255).astype(np.uint8)
        g = np.clip((1.0 - norm) * 2.0 * 255.0, 0, 255).astype(np.uint8)
        b = np.full((h, w), 30, dtype=np.uint8)

        # Hard blocked cells: Bright Magenta
        r[bundle.hard_blocked_mask] = 255
        g[bundle.hard_blocked_mask] = 0
        b[bundle.hard_blocked_mask] = 220

        # Unknown / NoData cells: Pitch Black
        r[bundle.unknown_mask] = 15
        g[bundle.unknown_mask] = 15
        b[bundle.unknown_mask] = 18

        rgb[0] = r
        rgb[1] = g
        rgb[2] = b

        with rasterio.open(
            out_path,
            "w",
            driver="PNG",
            width=w,
            height=h,
            count=3,
            dtype="uint8",
            transform=rasterio.transform.from_origin(0, h, 1, 1),
        ) as dst:
            dst.write(rgb)
