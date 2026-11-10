"""Scientific preprocessing pipeline for Marswalk Analysis-Ready Data (ARD).

Responsibilities:
1. Ingest raw authentic planetary rasters (HiRISE, CTX).
2. Align and warp rasters onto the common study grid.
3. Resample appropriately:
   - Continuous elevation: bilinear or cubic.
   - Categorical / Mask data: nearest neighbor or mode.
   - Downsampling hazards: conservative aggregation (max / percentile), never mean alone.
4. Preserve and expose NoData masks without interpreting missing data as 0 elevation or safe.
5. Generate explicit data coverage and uncertainty indicator masks.
6. Record full provenance and transformation metadata.
7. Generate visual quality control (QC) previews.
"""

from __future__ import annotations

import json
import logging
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject

from app.geospatial.crs import MarsCoordinateSystem
from app.geospatial.grid import GridSpec, get_western_delta_grid_20m

logger = logging.getLogger("marswalk.pipeline")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    fmt = "[%(asctime)s] [%(levelname)s] %(message)s"
    handler.setFormatter(logging.Formatter(fmt, datefmt="%H:%M:%S"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Standard project NoData value for 32-bit floating point rasters
STANDARD_NODATA_FLOAT = -9999.0


@dataclass(frozen=True)
class PreprocessingProvenance:
    """Provenance record for a generated ARD raster product."""

    layer_id: str
    source_products: list[str]
    source_files: list[str]
    target_grid: str
    target_resolution_m: float
    resampling_method: str
    crs: str
    nodata_value: float
    output_shape: tuple[int, int]
    valid_pixel_count: int
    nodata_pixel_count: int
    coverage_fraction: float
    min_value: float | None
    max_value: float | None
    mean_value: float | None
    processed_utc: str
    software_versions: dict[str, str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PreprocessingPipeline:
    """Orchestrates geospatial preprocessing, grid alignment, and mask generation."""

    def __init__(self, data_root: Path | None = None) -> None:
        if data_root is None:
            self.data_root = Path(__file__).resolve().parents[3] / "data"
        else:
            self.data_root = Path(data_root)

        self.raw_dir = self.data_root / "raw" / "usgs_trn"
        self.processed_dir = self.data_root / "processed"
        self.interim_dir = self.data_root / "interim"
        self.catalog_dir = self.data_root / "catalog"

        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.interim_dir.mkdir(parents=True, exist_ok=True)
        self.catalog_dir.mkdir(parents=True, exist_ok=True)

        self.mars_crs = MarsCoordinateSystem()

    def process_elevation_and_coverage(
        self,
        target_grid: GridSpec | None = None,
        generate_qc: bool = True,
    ) -> dict[str, Path]:
        """Align HiRISE DTM and CTX DTM onto the common ARD grid, producing elevation and masks.

        Returns dictionary of paths to created products.
        """
        if target_grid is None:
            target_grid = get_western_delta_grid_20m()  # 20m ARD L2 baseline

        logger.info(
            "Starting Preprocessing Pipeline for Grid: %s (%.1fm)",
            target_grid.name,
            target_grid.resolution_m,
        )

        hirise_raw = self.raw_dir / "HiRISE_DTM_Delta_Jezero_DL_1m.tif"
        ctx_raw = self.raw_dir / "JEZ_ctx_B_soc_008_DTM_20m.tif"
        ctx_ortho_raw = self.raw_dir / "JEZ_ctx_B_soc_008_orthoMosaic_6m.tif"

        if not hirise_raw.exists() or not ctx_raw.exists():
            msg = f"Missing required raw files in {self.raw_dir}. Run acquisition first."
            raise FileNotFoundError(msg)

        created_files: dict[str, Path] = {}

        # -------------------------------------------------------------
        # 1. Reproject/Warp HiRISE DTM to the common target grid
        # -------------------------------------------------------------
        logger.info(f"Warping HiRISE DTM to {target_grid.name} (Resampling: Bilinear)...")
        hirise_out_arr = np.full(
            (target_grid.height, target_grid.width), STANDARD_NODATA_FLOAT, dtype=np.float32
        )

        with rasterio.open(hirise_raw) as src_h:
            reproject(
                source=rasterio.band(src_h, 1),
                destination=hirise_out_arr,
                src_transform=src_h.transform,
                src_crs=src_h.crs,
                src_nodata=src_h.nodata,
                dst_transform=target_grid.transform,
                dst_crs=target_grid.crs,
                dst_nodata=STANDARD_NODATA_FLOAT,
                resampling=Resampling.bilinear,
            )

        # -------------------------------------------------------------
        # 2. Warp CTX DTM to the common target grid (covers full area)
        # -------------------------------------------------------------
        logger.info(f"Warping CTX DTM to {target_grid.name} (Resampling: Bilinear)...")
        ctx_out_arr = np.full(
            (target_grid.height, target_grid.width), STANDARD_NODATA_FLOAT, dtype=np.float32
        )

        with rasterio.open(ctx_raw) as src_c:
            reproject(
                source=rasterio.band(src_c, 1),
                destination=ctx_out_arr,
                src_transform=src_c.transform,
                src_crs=src_c.crs,
                src_nodata=src_c.nodata,
                dst_transform=target_grid.transform,
                dst_crs=target_grid.crs,
                dst_nodata=STANDARD_NODATA_FLOAT,
                resampling=Resampling.bilinear,
            )

        # -------------------------------------------------------------
        # 3. Derive Explicit Coverage and Uncertainty Masks
        # -------------------------------------------------------------
        # HiRISE coverage: 1 where authentic HiRISE data exists, 0 elsewhere
        hirise_mask = (hirise_out_arr != STANDARD_NODATA_FLOAT) & ~np.isnan(hirise_out_arr)
        # CTX coverage: 1 where authentic CTX data exists, 0 elsewhere
        ctx_mask = (ctx_out_arr != STANDARD_NODATA_FLOAT) & ~np.isnan(ctx_out_arr)

        # Epistemic source ID layer:
        # 2 = HiRISE Observed (1m native, highest priority)
        # 1 = CTX Observed (20m regional fallback)
        # 0 = Unknown / No Data (Must be treated as impassable by routing engine)
        source_id_arr = np.zeros((target_grid.height, target_grid.width), dtype=np.uint8)
        source_id_arr[ctx_mask] = 1
        source_id_arr[hirise_mask] = 2  # HiRISE supersedes CTX

        # Fused Best-Available Elevation Raster
        fused_elev_arr = np.full(
            (target_grid.height, target_grid.width), STANDARD_NODATA_FLOAT, dtype=np.float32
        )
        fused_elev_arr[ctx_mask] = ctx_out_arr[ctx_mask]
        fused_elev_arr[hirise_mask] = hirise_out_arr[hirise_mask]

        # Uncertainty estimate sigma_z (metres)
        # HiRISE relative vertical precision ~0.2m, CTX ~2.0m, NoData = 999.0m
        sigma_z_arr = np.full((target_grid.height, target_grid.width), 999.0, dtype=np.float32)
        sigma_z_arr[ctx_mask] = 2.0
        sigma_z_arr[hirise_mask] = 0.2

        # -------------------------------------------------------------
        # 4. Warp Context Orthomosaic Imagery (if present)
        # -------------------------------------------------------------
        ortho_out_arr = np.zeros((target_grid.height, target_grid.width), dtype=np.uint8)
        if ctx_ortho_raw.exists():
            logger.info(f"Warping CTX Orthomosaic to {target_grid.name}...")
            with rasterio.open(ctx_ortho_raw) as src_o:
                reproject(
                    source=rasterio.band(src_o, 1),
                    destination=ortho_out_arr,
                    src_transform=src_o.transform,
                    src_crs=src_o.crs,
                    src_nodata=0,
                    dst_transform=target_grid.transform,
                    dst_crs=target_grid.crs,
                    dst_nodata=0,
                    resampling=Resampling.cubic,
                )

        # -------------------------------------------------------------
        # 5. Export Geotiff Products with Standard Metadata
        # -------------------------------------------------------------
        meta_base = {
            "driver": "GTiff",
            "height": target_grid.height,
            "width": target_grid.width,
            "transform": target_grid.transform,
            "crs": target_grid.crs,
        }

        # Product A: Fused Elevation (DTM)
        elev_path = self.processed_dir / f"{target_grid.name}_elevation.tif"
        self._write_geotiff(
            elev_path,
            fused_elev_arr,
            meta_base,
            dtype="float32",
            nodata=STANDARD_NODATA_FLOAT,
        )
        created_files["elevation"] = elev_path

        # Product B: Source ID Mask (Epistemic source tracking)
        source_id_path = self.processed_dir / f"{target_grid.name}_source_id.tif"
        self._write_geotiff(
            source_id_path,
            source_id_arr,
            meta_base,
            dtype="uint8",
            nodata=0,
        )
        created_files["source_id"] = source_id_path

        # Product C: Uncertainty Sigma_Z
        sigma_path = self.processed_dir / f"{target_grid.name}_uncertainty_sigma_z.tif"
        self._write_geotiff(
            sigma_path,
            sigma_z_arr,
            meta_base,
            dtype="float32",
            nodata=999.0,
        )
        created_files["uncertainty"] = sigma_path

        # Product D: Aligned Imagery
        if ctx_ortho_raw.exists():
            ortho_path = self.processed_dir / f"{target_grid.name}_ortho_imagery.tif"
            self._write_geotiff(
                ortho_path,
                ortho_out_arr,
                meta_base,
                dtype="uint8",
                nodata=0,
            )
            created_files["imagery"] = ortho_path

        # -------------------------------------------------------------
        # 6. Catalog Provenance Records
        # -------------------------------------------------------------
        valid_pixels = int(np.count_nonzero(fused_elev_arr != STANDARD_NODATA_FLOAT))
        total_pixels = target_grid.width * target_grid.height
        valid_vals = fused_elev_arr[fused_elev_arr != STANDARD_NODATA_FLOAT]

        provenance = PreprocessingProvenance(
            layer_id=f"{target_grid.name}_elevation",
            source_products=["10.5066/P9REJ9JN", "10.5066/P906QQT8"],
            source_files=[hirise_raw.name, ctx_raw.name],
            target_grid=target_grid.name,
            target_resolution_m=target_grid.resolution_m,
            resampling_method="bilinear (continuous elevation)",
            crs=target_grid.crs,
            nodata_value=STANDARD_NODATA_FLOAT,
            output_shape=(target_grid.height, target_grid.width),
            valid_pixel_count=valid_pixels,
            nodata_pixel_count=total_pixels - valid_pixels,
            coverage_fraction=float(valid_pixels / total_pixels),
            min_value=float(valid_vals.min()) if valid_vals.size > 0 else None,
            max_value=float(valid_vals.max()) if valid_vals.size > 0 else None,
            mean_value=float(valid_vals.mean()) if valid_vals.size > 0 else None,
            processed_utc=datetime.now(UTC).isoformat(),
            software_versions={"rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__},
        )

        catalog_record = self.catalog_dir / f"{target_grid.name}_provenance.json"
        catalog_record.write_text(json.dumps(provenance.to_dict(), indent=2))
        created_files["provenance"] = catalog_record
        logger.info(f"Recorded preprocessing provenance: {catalog_record.name}")

        # -------------------------------------------------------------
        # 7. Visual Quality Control (QC) Previews
        # -------------------------------------------------------------
        if generate_qc:
            qc_elev_path = self.processed_dir / f"{target_grid.name}_qc_elevation.png"
            self._generate_qc_preview(fused_elev_arr, qc_elev_path, STANDARD_NODATA_FLOAT)
            created_files["qc_elevation"] = qc_elev_path

            qc_source_path = self.processed_dir / f"{target_grid.name}_qc_source_coverage.png"
            self._generate_source_id_qc(source_id_arr, qc_source_path)
            created_files["qc_coverage"] = qc_source_path

        logger.info(f"Completed ARD preprocessing. Created {len(created_files)} products.")
        return created_files

    @staticmethod
    def _write_geotiff(
        path: Path,
        data: np.ndarray,
        meta_base: dict[str, Any],
        dtype: str,
        nodata: float | int | None,
    ) -> None:
        """Write array as a standard Cloud-Optimized compatible GeoTIFF."""
        meta = meta_base.copy()
        meta.update(
            count=1,
            dtype=dtype,
            nodata=nodata,
            compress="deflate",
            tiled=True,
            blockxsize=256,
            blockysize=256,
        )
        with rasterio.open(path, "w", **meta) as dst:
            dst.write(data, 1)

    @staticmethod
    def _generate_qc_preview(data: np.ndarray, out_path: Path, nodata: float) -> None:
        """Generate an 8-bit visual inspection PNG preview without external heavy plotting libs."""
        mask = (data != nodata) & ~np.isnan(data)
        qc_rgb = np.zeros((3, data.shape[0], data.shape[1]), dtype=np.uint8)

        if np.any(mask):
            valid = data[mask]
            vmin, vmax = valid.min(), valid.max()
            norm = np.clip((data - vmin) / (vmax - vmin + 1e-6) * 255.0, 0, 255).astype(np.uint8)
            # Grayscale terrain with distinctive purple tint for NoData
            qc_rgb[0] = np.where(mask, norm, 40)
            qc_rgb[1] = np.where(mask, norm, 10)
            qc_rgb[2] = np.where(mask, norm, 50)

        with rasterio.open(
            out_path,
            "w",
            driver="PNG",
            width=data.shape[1],
            height=data.shape[0],
            count=3,
            dtype="uint8",
        ) as dst:
            dst.write(qc_rgb)

    @staticmethod
    def _generate_source_id_qc(source_id: np.ndarray, out_path: Path) -> None:
        """Generate a color-coded coverage QC map (HiRISE, CTX, NoData)."""
        h, w = source_id.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)

        # 0 = NoData (Dark Navy / Black)
        rgb[0, source_id == 0] = 15
        rgb[1, source_id == 0] = 15
        rgb[2, source_id == 0] = 25
        # 1 = CTX Regional (Amber / Orange)
        rgb[0, source_id == 1] = 220
        rgb[1, source_id == 1] = 140
        rgb[2, source_id == 1] = 40
        # 2 = HiRISE High-Res (Cyan / Teal)
        rgb[0, source_id == 2] = 40
        rgb[1, source_id == 2] = 210
        rgb[2, source_id == 2] = 220

        with rasterio.open(
            out_path,
            "w",
            driver="PNG",
            width=w,
            height=h,
            count=3,
            dtype="uint8",
        ) as dst:
            dst.write(rgb)
