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

try:
    import rasterio
except (ImportError, Exception):
    rasterio = None  # type: ignore[assignment]

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

        sigma_z_path = self.processed_dir / f"{grid_name}_uncertainty_sigma_z.tif"
        if sigma_z_path.exists():
            with rasterio.open(sigma_z_path) as sz_src:
                sigma_z = sz_src.read(1)
        else:
            sigma_z = np.where(
                source_id == 2,
                0.2,
                np.where(source_id == 1, 2.0, STANDARD_NODATA),
            ).astype(np.float32)

        # Ingest or trigger native HiRISE hazard detections
        hirise_obs_path = self.processed_dir / f"{grid_name}_hirise_hazard_obstacles.tif"
        if not hirise_obs_path.exists():
            from app.terrain.native_hazards import NativeResolutionHazardPipeline

            logger.info(
                "Native HiRISE hazard product missing; invoking NativeResolutionHazardPipeline"
            )
            native_pipe = NativeResolutionHazardPipeline(data_root=self.data_root)
            native_pipe.process_and_export()

        with rasterio.open(hirise_obs_path) as ho_src:
            hirise_obs = ho_src.read(1)

        valid_mask = (
            (slope != STANDARD_NODATA)
            & ~np.isnan(slope)
            & ((source_id == 1) | (source_id == 2))
        )

        # Compute complete authoritative hazard bundle
        bundle = compute_hazard_bundle(
            slope=slope,
            tri=tri,
            boulder_score=boulder_score,
            sand_score=sand_score,
            crater_score=crater_score,
            valid_mask=valid_mask,
            source_id=source_id,
            profile=profile,
            hirise_obstacle_mask=hirise_obs,
            sigma_z=sigma_z,
        )

        created_files: dict[str, Path] = {}

        # -------------------------------------------------------------
        # 1. Export Authoritative Hard Impassable Constraint Mask (uint8)
        # nodata=255 ensures valid 0 (passable) is never masked as missing data
        # -------------------------------------------------------------
        impassable_path = self.processed_dir / f"{grid_name}_hazard_hard_impassable.tif"
        self._write_tif(
            impassable_path,
            bundle.hard_impassable_mask.astype(np.uint8),
            meta,
            "uint8",
            255,
        )
        created_files["hard_impassable"] = impassable_path

        # -------------------------------------------------------------
        # 2. Export Resolution Uncertainty Mask (uint8: 1 where CTX only)
        # nodata=255 ensures valid 0 (HiRISE resolved) is distinct from missing
        # -------------------------------------------------------------
        res_unc_path = self.processed_dir / f"{grid_name}_hazard_resolution_uncertainty.tif"
        if bundle.resolution_uncertainty_mask is not None:
            res_unc_arr = bundle.resolution_uncertainty_mask.astype(np.uint8)
        else:
            res_unc_arr = (source_id == 1).astype(np.uint8)
        self._write_tif(res_unc_path, res_unc_arr, meta, "uint8", 255)
        created_files["resolution_uncertainty"] = res_unc_path

        # -------------------------------------------------------------
        # 3. Export Unknown / NoData Mask (uint8: 1 where unmapped)
        # nodata=255 ensures valid 0 (known data) is distinct from missing
        # -------------------------------------------------------------
        unknown_path = self.processed_dir / f"{grid_name}_hazard_unknown_mask.tif"
        unknown_arr = (~valid_mask | ~((source_id == 1) | (source_id == 2))).astype(np.uint8)
        self._write_tif(unknown_path, unknown_arr, meta, "uint8", 255)
        created_files["unknown_mask"] = unknown_path

        # -------------------------------------------------------------
        # 4. Export Composite Overall Hazard Layer (float32, 0.0 - 1.0)
        # nodata=STANDARD_NODATA ensures 1.0 (extreme hazard) is not NoData
        # -------------------------------------------------------------
        overall_path = self.processed_dir / f"{grid_name}_hazard_overall_score.tif"
        self._write_tif(overall_path, bundle.overall_hazard, meta, "float32", STANDARD_NODATA)
        created_files["overall_hazard"] = overall_path

        # -------------------------------------------------------------
        # 5. Export M0.3 Dedicated Multi-Dimensional Uncertainty Products
        # -------------------------------------------------------------
        # 5a. Data Confidence (float32, 0.0 to 1.0)
        if bundle.data_confidence is not None:
            data_conf_path = self.processed_dir / f"{grid_name}_hazard_data_confidence.tif"
            self._write_tif(
                data_conf_path, bundle.data_confidence, meta, "float32", STANDARD_NODATA
            )
            created_files["data_confidence"] = data_conf_path

        # 5b. Detection Confidence (float32, 0.0 to 1.0)
        if bundle.detection_confidence is not None:
            det_conf_path = self.processed_dir / f"{grid_name}_hazard_detection_confidence.tif"
            self._write_tif(
                det_conf_path, bundle.detection_confidence, meta, "float32", STANDARD_NODATA
            )
            created_files["detection_confidence"] = det_conf_path

        # 5c. Spatial Uncertainty in meters (float32)
        if bundle.spatial_uncertainty_m is not None:
            spat_unc_path = self.processed_dir / f"{grid_name}_hazard_spatial_uncertainty_m.tif"
            self._write_tif(
                spat_unc_path, bundle.spatial_uncertainty_m, meta, "float32", STANDARD_NODATA
            )
            created_files["spatial_uncertainty"] = spat_unc_path

        # -------------------------------------------------------------
        # 6. Export Visual Heatmaps & QC Previews (PNG)
        # -------------------------------------------------------------
        qc_overall_path = self.processed_dir / f"{grid_name}_qc_overall_hazard.png"
        self._generate_hazard_qc(
            bundle.overall_hazard,
            bundle.hard_impassable_mask,
            qc_overall_path,
        )
        created_files["qc_overall"] = qc_overall_path

        unknown_bool = ~valid_mask | (source_id == 0)

        if bundle.data_confidence is not None:
            qc_data_conf_path = self.processed_dir / f"{grid_name}_qc_data_confidence.png"
            self._generate_confidence_qc(bundle.data_confidence, qc_data_conf_path, unknown_bool)
            created_files["qc_data_confidence"] = qc_data_conf_path

        if bundle.detection_confidence is not None:
            qc_det_conf_path = self.processed_dir / f"{grid_name}_qc_detection_confidence.png"
            self._generate_confidence_qc(
                bundle.detection_confidence, qc_det_conf_path, unknown_bool
            )
            created_files["qc_detection_confidence"] = qc_det_conf_path

        if bundle.spatial_uncertainty_m is not None:
            qc_spat_unc_path = self.processed_dir / f"{grid_name}_qc_spatial_uncertainty.png"
            self._generate_spatial_qc(bundle.spatial_uncertainty_m, qc_spat_unc_path, unknown_bool)
            created_files["qc_spatial_uncertainty"] = qc_spat_unc_path

        qc_res_unc_path = self.processed_dir / f"{grid_name}_qc_resolution_uncertainty.png"
        self._generate_binary_qc(res_unc_arr, qc_res_unc_path, (245, 158, 11))
        created_files["qc_resolution_uncertainty"] = qc_res_unc_path

        # -------------------------------------------------------------
        # 7. Catalog Provenance & Configuration (Derived from Upstream Catalogs)
        # -------------------------------------------------------------
        impassable_count = int(np.count_nonzero(bundle.hard_impassable_mask))
        total_cells = bundle.overall_hazard.size
        hirise_count = int(np.count_nonzero(source_id == 2))
        ctx_count = int(np.count_nonzero(source_id == 1))
        unknown_count = int(np.count_nonzero(source_id == 0))
        native_obs_count = int(np.count_nonzero(hirise_obs > 0))
        catalog_path = self.catalog_dir / f"{grid_name}_hazard_intelligence.json"

        upstream_prov_path = self.catalog_dir / f"{grid_name}_provenance.json"
        upstream_prov: dict[str, Any] = {}
        if upstream_prov_path.exists():
            upstream_prov = json.loads(upstream_prov_path.read_text(encoding="utf-8"))

        native_cat_path = self.catalog_dir / f"{grid_name}_native_hazards_catalog.json"
        native_cat: dict[str, Any] = {}
        if native_cat_path.exists():
            native_cat = json.loads(native_cat_path.read_text(encoding="utf-8"))

        valid_overall = bundle.overall_hazard[~bundle.hard_impassable_mask]
        metadata = {
            "grid_name": grid_name,
            "pipeline_version": "2.1.0 (M0.3.2 Scientific Validity Corrected)",
            "processed_utc": datetime.now(UTC).isoformat(),
            "profile": profile.to_dict(),
            "nodata_conventions": {
                "float32_continuous_layers": STANDARD_NODATA,
                "uint8_binary_masks": 255,
            },
            "fusion_policy": {
                "case_a": "HiRISE observed (source_id=2): Native 1m hazard detections apply",
                "case_b": (
                    "CTX observed (source_id=1): Lower-res coverage with unresolved "
                    "high-res hazard uncertainty"
                ),
                "case_c": "No coverage (source_id=0): Impassable by default (NO_DATA_UNKNOWN)",
                "case_d": "Conflicting information: Conservative obstacle preservation",
            },
            "statistics": {
                "total_cells": total_cells,
                "hard_impassable_cells": impassable_count,
                "impassable_percentage": float(impassable_count / total_cells * 100.0),
                "hirise_observed_cells": hirise_count,
                "ctx_observed_cells": ctx_count,
                "unresolved_uncertainty_cells": ctx_count,
                "unknown_cells": unknown_count,
                "native_obstacle_cells": native_obs_count,
                "mean_overall_hazard": (
                    float(valid_overall.mean()) if valid_overall.size > 0 else 1.0
                ),
                "max_overall_hazard": float(bundle.overall_hazard.max()),
                "min_overall_hazard": (
                    float(valid_overall.min()) if valid_overall.size > 0 else 1.0
                ),
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
                    "name": "Boulder Candidate Heuristic (20m CTX Ortho + TRI)",
                    "range": [0.0, 1.0],
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "h_sand",
                    "name": "Loose Sand Heuristic (20m CTX Ortho)",
                    "range": [0.0, 1.0],
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "h_crater",
                    "name": "Crater Depression Heuristic",
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
                    "nodata": 255,
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "data_confidence",
                    "name": "Data Source Reliability Index (Uncalibrated Ordinal)",
                    "range": [0.0, 1.0],
                    "nodata": STANDARD_NODATA,
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "detection_confidence",
                    "name": "Evidence Reliability Index (Uncalibrated Ordinal)",
                    "range": [0.0, 1.0],
                    "nodata": STANDARD_NODATA,
                    "epistemic": "HEURISTIC",
                },
                {
                    "id": "spatial_uncertainty",
                    "name": "Provisional Nominal Vertical Precision Tier (Unverified Proxy)",
                    "units": "meters",
                    "nodata": STANDARD_NODATA,
                    "epistemic": "HEURISTIC",
                    "status": "PROVISIONAL_UNVERIFIED_NOMINAL_TIER",
                },
                {
                    "id": "resolution_uncertainty",
                    "name": "Resolution Uncertainty Mask",
                    "type": "bool",
                    "nodata": 255,
                    "epistemic": "DERIVED",
                },
            ],
            "provenance": {
                "upstream_source_products": upstream_prov.get("source_products", "UNAVAILABLE"),
                "upstream_source_files": upstream_prov.get("source_files", "UNAVAILABLE"),
                "upstream_source_details": upstream_prov.get("source_details", "UNAVAILABLE"),
                "cv_optical_imagery_input": {
                    "processed_raster": f"{grid_name}_ortho_imagery.tif",
                    "source_file": "JEZ_ctx_B_soc_008_orthoMosaic_6m.tif",
                    "product_doi": "10.5066/P9GV1ND3",
                    "native_resolution_m": 6.0,
                    "processing_resolution_m": 20.0,
                    "note": (
                        "All 20m CV boulder, sand, and crater heuristic scores consume "
                        "20m-resampled CTX orthomosaic imagery, not 0.25m HiRISE ORI."
                    ),
                },
                "native_hirise_hazards_source": native_cat.get("source_product", "UNAVAILABLE"),
                "native_hirise_resolution_m": native_cat.get(
                    "source_resolution_m", "UNAVAILABLE"
                ),
                "geographic_crs": "IAU_2015:49900",
                "projected_crs": upstream_prov.get("crs", "ESRI:103885"),
                "software_versions": upstream_prov.get(
                    "software_versions",
                    {"rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__},
                ),
            },
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

    @staticmethod
    def _generate_confidence_qc(
        conf: np.ndarray,
        out_path: Path,
        unknown_mask: np.ndarray | None = None,
    ) -> None:
        """Render reliability overlay separating NoData from valid [0.0, 1.0] tiers.

        Color palette (legend-matched):
          - NoData / Unmapped (~valid or -9999.0): Dark Slate (15, 23, 42)
          - Valid Very Low / Zero [0.0, 0.45): Crimson (220, 38, 38)
          - Low-Moderate [0.45, 0.70): Amber (245, 158, 11)
          - Moderate-High [0.70, 0.90): Sky Teal (56, 189, 248)
          - High [0.90, 1.0]: Cyan (34, 211, 238)
        """
        h, w = conf.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)

        # Reserve Dark Slate (15, 23, 42) exclusively for NoData / Unmapped
        is_nodata = (conf == STANDARD_NODATA) | ~np.isfinite(conf)
        if unknown_mask is not None:
            is_nodata = is_nodata | unknown_mask

        valid = ~is_nodata

        # Default NoData background: Dark Slate (15, 23, 42)
        rgb[0] = 15
        rgb[1] = 23
        rgb[2] = 42

        # Valid Zero / Very Low [0.0, 0.45): Crimson (220, 38, 38)
        very_low = valid & (conf < 0.45)
        rgb[0, very_low] = 220
        rgb[1, very_low] = 38
        rgb[2, very_low] = 38

        # Low-Moderate [0.45, 0.70): Amber (245, 158, 11)
        low_mod = valid & (conf >= 0.45) & (conf < 0.70)
        rgb[0, low_mod] = 245
        rgb[1, low_mod] = 158
        rgb[2, low_mod] = 11

        # Moderate-High [0.70, 0.90): Sky Teal (56, 189, 248)
        mod_high = valid & (conf >= 0.70) & (conf < 0.90)
        rgb[0, mod_high] = 56
        rgb[1, mod_high] = 189
        rgb[2, mod_high] = 248

        # High >= 0.90: Cyan (34, 211, 238)
        high_mask = valid & (conf >= 0.90)
        rgb[0, high_mask] = 34
        rgb[1, high_mask] = 211
        rgb[2, high_mask] = 238

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

    @staticmethod
    def _generate_spatial_qc(
        spat_unc: np.ndarray,
        out_path: Path,
        unknown_mask: np.ndarray | None = None,
    ) -> None:
        """Render nominal vertical precision tier:

        - Sub-metre HiRISE nominal tier (<= 1.0 m): Steel Blue (56, 189, 248)
        - Regional CTX nominal tier (> 1.0 m): Orange (249, 115, 22)
        - Unknown / NoData (-9999.0 or unknown_mask): Bright Magenta (255, 0, 220)
        """
        h, w = spat_unc.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)

        is_nodata = (spat_unc == STANDARD_NODATA) | (spat_unc == 999.0) | ~np.isfinite(spat_unc)
        if unknown_mask is not None:
            is_nodata = is_nodata | unknown_mask
        valid = ~is_nodata

        # Baseline valid: Steel Blue (56, 189, 248)
        rgb[0] = 56
        rgb[1] = 189
        rgb[2] = 248

        # Regional CTX nominal tier: Orange (249, 115, 22)
        ctx_mask = valid & (spat_unc > 1.0)
        rgb[0, ctx_mask] = 249
        rgb[1, ctx_mask] = 115
        rgb[2, ctx_mask] = 22

        # Unknown / NoData: Bright Magenta (255, 0, 220)
        rgb[0, is_nodata] = 255
        rgb[1, is_nodata] = 0
        rgb[2, is_nodata] = 220

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

    @staticmethod
    def _generate_binary_qc(
        mask: np.ndarray,
        out_path: Path,
        active_rgb: tuple[int, int, int],
    ) -> None:
        """Render binary mask QC: Dark Background vs Active Accent Color."""
        h, w = mask.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)
        # Background: dark slate
        rgb[0] = 15
        rgb[1] = 23
        rgb[2] = 42

        active = mask > 0
        rgb[0, active] = active_rgb[0]
        rgb[1, active] = active_rgb[1]
        rgb[2, active] = active_rgb[2]

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
