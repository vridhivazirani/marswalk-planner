"""Native-resolution terrain hazard detection and conservative ARD aggregation.

Implements M0.2-SCI / MW-SCI-01:
1. Detects terrain hazards (steep slopes, boulders, scarps, and obstacles) directly
   at native 1.0 m resolution on authentic HiRISE Digital Terrain Models.
2. Performs windowed streaming processing with convolutional halos to prevent memory
   exhaustion and seam artifacts across 11,703 x 7,237 raster tiles.
3. Performs conservative aggregation (any-hit maximum and high-percentile pooling)
   into the target 20.0 m ARD routing grid so micro-scale hazards are never smoothed away.
4. Preserves strict NoData safety: unknown or missing data is never marked safe.
"""

from __future__ import annotations

import json
import logging
import math
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

try:
    import rasterio
    from rasterio.windows import Window
except (ImportError, Exception):
    rasterio = None  # type: ignore[assignment]
    Window = None  # type: ignore[assignment]
from scipy import ndimage

from app.geospatial.grid import get_western_delta_grid_20m
from app.terrain.derivatives import compute_slope_aspect_horn, compute_terrain_ruggedness_index

logger = logging.getLogger("marswalk.native_hazards")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    fmt = "[%(asctime)s] [%(levelname)s] %(message)s"
    handler.setFormatter(logging.Formatter(fmt, datefmt="%H:%M:%S"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

STANDARD_NODATA_FLOAT = -9999.0
HIRISE_RAW_NODATA = -32768.0


@dataclass(frozen=True)
class NativeHazardMetrics:
    """Container for native 1.0 m hazard arrays computed over a terrain patch."""

    slope_deg: np.ndarray
    tri_roughness_m: np.ndarray
    boulder_score: np.ndarray
    scarp_score: np.ndarray
    obstacle_mask: np.ndarray
    valid_mask: np.ndarray


@dataclass(frozen=True)
class Aggregated20mHazards:
    """Conservatively aggregated 20.0 m ARD hazard products."""

    grid_name: str
    shape: tuple[int, int]
    boulder_hazard_score: np.ndarray
    scarp_hazard_score: np.ndarray
    slope_deg_max: np.ndarray
    slope_deg_p95: np.ndarray
    surface_roughness_max: np.ndarray
    hard_impassable: np.ndarray
    unknown_mask: np.ndarray
    provenance: dict[str, Any]


def compute_native_hazards_patch(
    dem: np.ndarray,
    res_m: float = 1.0,
    nodata: float = HIRISE_RAW_NODATA,
    slope_threshold_deg: float = 25.0,
    scarp_slope_deg: float = 20.0,
) -> NativeHazardMetrics:
    """Compute terrain hazard metrics at native resolution on a DEM patch.

    Algorithms:
      1. Slope (Horn 1981): 3x3 convolution with dx=res_m, dy=res_m.
      2. Micro-roughness (TRI): Mean absolute difference to 8 neighbors.
      3. Boulder candidates: Morphological white top-hat filter (scale 2m–4m)
         isolating localized rock pinnacles above background regolith.
      4. Scarp / steep break: Local slope > scarp_slope_deg combined with local elevation drop.
      5. Hard obstacle mask: Any cell where slope >= slope_threshold_deg OR
         boulder_score >= 0.50 OR scarp_score >= 0.50 OR invalid/nodata.
    """
    valid_mask = (dem != nodata) & ~np.isnan(dem) & (dem != STANDARD_NODATA_FLOAT)
    if not np.any(valid_mask):
        empty_f = np.full_like(dem, 0.0, dtype=np.float32)
        empty_b = np.ones_like(dem, dtype=bool)  # All impassable
        return NativeHazardMetrics(
            slope_deg=empty_f,
            tri_roughness_m=empty_f,
            boulder_score=empty_f,
            scarp_score=empty_f,
            obstacle_mask=empty_b,
            valid_mask=valid_mask,
        )

    # Clean dem for continuous convolution
    if np.all(valid_mask):
        dem_clean = dem.astype(np.float32)
    else:
        indices = ndimage.distance_transform_edt(
            ~valid_mask, return_distances=False, return_indices=True
        )
        dem_clean = dem[tuple(indices)].astype(np.float32)

    # 1. Native Slope
    slope_deg, _ = compute_slope_aspect_horn(
        dem_clean, res_m=res_m, nodata=STANDARD_NODATA_FLOAT
    )
    slope_deg = np.where(valid_mask, slope_deg, 0.0).astype(np.float32)

    # 2. Native Micro-Roughness (TRI)
    tri = compute_terrain_ruggedness_index(dem_clean, nodata=STANDARD_NODATA_FLOAT)
    tri = np.where(valid_mask, tri, 0.0).astype(np.float32)

    # 3. Morphological Boulder Candidate Detection on Elevation
    # Structuring element: ~3m diameter disk (radius = 1.5 pixels at 1m resolution)
    radius_px = max(1, int(round(1.5 / max(0.25, res_m))))
    y, x = np.ogrid[-radius_px : radius_px + 1, -radius_px : radius_px + 1]
    struct_disk = (x * x + y * y <= radius_px * radius_px).astype(bool)

    white_th = ndimage.white_tophat(dem_clean, structure=struct_disk)
    # Normalize peak height: 0.5m - 2.5m rock height range
    norm_peaks = np.clip(white_th / 2.0, 0.0, 1.0)
    norm_tri = np.clip(tri / 2.0, 0.0, 1.0)
    boulder_score = (0.65 * norm_peaks + 0.35 * norm_tri) * valid_mask.astype(np.float32)

    # 4. Scarp / Steep Break Detection
    # Sharp break in slope (> 20 deg) or local vertical step
    norm_slope_break = np.clip((slope_deg - scarp_slope_deg) / 15.0, 0.0, 1.0)
    scarp_score = norm_slope_break * valid_mask.astype(np.float32)

    # 5. Native Obstacle Mask (Space suit & rover safety)
    obstacle_mask = (
        (slope_deg >= slope_threshold_deg)
        | (boulder_score >= 0.50)
        | (scarp_score >= 0.50)
        | (~valid_mask)
    )

    return NativeHazardMetrics(
        slope_deg=slope_deg,
        tri_roughness_m=tri,
        boulder_score=boulder_score,
        scarp_score=scarp_score,
        obstacle_mask=obstacle_mask,
        valid_mask=valid_mask,
    )


def aggregate_native_patch_to_20m(
    native: NativeHazardMetrics,
    target_shape: tuple[int, int] = (586, 362),
    scale_factor: int = 20,
) -> Aggregated20mHazards:
    """Conservatively aggregate full-frame native 1m hazard metrics into the 20m grid.

    Aggregation Rules (AGENTS.md §3 compliance):
      - hard_impassable: Any-hit logical OR. If ANY native cell in the 20m footprint
        is an obstacle or unknown, the 20m cell is marked impassable.
      - boulder_hazard_score: Conservative Maximum.
      - scarp_hazard_score: Conservative Maximum.
      - slope_deg_max: Conservative Maximum.
      - slope_deg_p95: 95th Percentile slope inside the cell.
      - surface_roughness_max: Conservative Maximum.
      - unknown_mask: True if any native cell inside the 20m cell was NoData.
    """
    target_h, target_w = target_shape
    native_h, native_w = native.slope_deg.shape

    boulder_20m = np.zeros(target_shape, dtype=np.float32)
    scarp_20m = np.zeros(target_shape, dtype=np.float32)
    slope_max_20m = np.zeros(target_shape, dtype=np.float32)
    slope_p95_20m = np.zeros(target_shape, dtype=np.float32)
    roughness_20m = np.zeros(target_shape, dtype=np.float32)
    hard_impassable = np.zeros(target_shape, dtype=bool)
    unknown_mask = np.zeros(target_shape, dtype=bool)

    for r in range(target_h):
        r0 = r * scale_factor
        r1 = min(native_h, (r + 1) * scale_factor)
        if r0 >= native_h:
            hard_impassable[r, :] = True
            unknown_mask[r, :] = True
            continue

        for c in range(target_w):
            c0 = c * scale_factor
            c1 = min(native_w, (c + 1) * scale_factor)
            if c0 >= native_w:
                hard_impassable[r, c] = True
                unknown_mask[r, c] = True
                continue

            # Sub-window slices
            sub_valid = native.valid_mask[r0:r1, c0:c1]
            if not np.any(sub_valid):
                # Completely unknown
                hard_impassable[r, c] = True
                unknown_mask[r, c] = True
                boulder_20m[r, c] = 0.0
                scarp_20m[r, c] = 0.0
                slope_max_20m[r, c] = 0.0
                slope_p95_20m[r, c] = 0.0
                roughness_20m[r, c] = 0.0
                continue

            # Any-hit unknown propagation: partial coverage is treated cautiously
            if not np.all(sub_valid):
                unknown_mask[r, c] = True

            # Any-hit obstacle mask: if any native pixel is impassable, 20m cell is impassable
            sub_obs = native.obstacle_mask[r0:r1, c0:c1]
            hard_impassable[r, c] = bool(np.any(sub_obs))

            # Conservative maximums
            boulder_20m[r, c] = float(np.max(native.boulder_score[r0:r1, c0:c1]))
            scarp_20m[r, c] = float(np.max(native.scarp_score[r0:r1, c0:c1]))
            sub_slopes = native.slope_deg[r0:r1, c0:c1][sub_valid]
            slope_max_20m[r, c] = float(np.max(sub_slopes))
            slope_p95_20m[r, c] = float(np.percentile(sub_slopes, 95))
            roughness_20m[r, c] = float(np.max(native.tri_roughness_m[r0:r1, c0:c1]))

    provenance = {
        "aggregation_scale": scale_factor,
        "method_obstacle": "any_hit_logical_or",
        "method_boulder": "conservative_maximum",
        "method_scarp": "conservative_maximum",
        "method_slope": "conservative_max_and_percentile_95",
        "method_roughness": "conservative_maximum",
        "method_unknown": "explicit_any_nodata_propagation",
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "epistemic_class": "DERIVED",
    }

    return Aggregated20mHazards(
        grid_name="jezero_western_delta_20m",
        shape=target_shape,
        boulder_hazard_score=boulder_20m,
        scarp_hazard_score=scarp_20m,
        slope_deg_max=slope_max_20m,
        slope_deg_p95=slope_p95_20m,
        surface_roughness_max=roughness_20m,
        hard_impassable=hard_impassable,
        unknown_mask=unknown_mask,
        provenance=provenance,
    )


class NativeResolutionHazardPipeline:
    """Orchestrates memory-efficient windowed processing of native 1.0 m DTM into 20 m ARD."""

    def __init__(self, data_root: Path | None = None) -> None:
        if data_root is None:
            self.data_root = Path(__file__).resolve().parents[3] / "data"
        else:
            self.data_root = Path(data_root)

        self.raw_dir = self.data_root / "raw" / "usgs_trn"
        self.processed_dir = self.data_root / "processed"
        self.catalog_dir = self.data_root / "catalog"

        self.hirise_path = self.raw_dir / "HiRISE_DTM_Delta_Jezero_DL_1m.tif"
        self.target_grid = get_western_delta_grid_20m()

    def process_and_export(
        self,
        strip_rows_20m: int = 50,  # 50 rows in 20m grid = 1000 rows in 1m grid
        halo_px: int = 4,
    ) -> dict[str, Path]:
        """Execute windowed native hazard processing and write 20m ARD GeoTIFFs."""
        if not self.hirise_path.exists():
            raise FileNotFoundError(f"Authentic HiRISE DTM not found at: {self.hirise_path}")

        logger.info(
            "Executing Native-Resolution Hazard Pipeline on %s", self.hirise_path.name
        )

        with rasterio.open(self.hirise_path) as src:
            src_w = src.width
            src_h = src.height
            src_nodata = src.nodata if src.nodata is not None else HIRISE_RAW_NODATA

        target_h = self.target_grid.height
        target_w = self.target_grid.width
        scale = 20

        # Pre-allocate output 20m rasters
        out_boulder = np.zeros((target_h, target_w), dtype=np.float32)
        out_scarp = np.zeros((target_h, target_w), dtype=np.float32)
        out_slope_max = np.zeros((target_h, target_w), dtype=np.float32)
        out_slope_p95 = np.zeros((target_h, target_w), dtype=np.float32)
        out_roughness = np.zeros((target_h, target_w), dtype=np.float32)
        out_impassable = np.zeros((target_h, target_w), dtype=np.uint8)

        total_strips = math.ceil(target_h / strip_rows_20m)
        logger.info(
            "Processing %d row strips (Strip size: %d 20m rows = %d 1m rows, Halo: %d px)",
            total_strips,
            strip_rows_20m,
            strip_rows_20m * scale,
            halo_px,
        )

        with rasterio.open(self.hirise_path) as src:
            for s_idx in range(total_strips):
                r20_start = s_idx * strip_rows_20m
                r20_end = min(target_h, (s_idx + 1) * strip_rows_20m)
                n_rows_20m = r20_end - r20_start

                # Native 1m row boundaries
                r1_start = r20_start * scale
                r1_end = min(src_h, r20_end * scale)

                # Expanded window with convolutional halo
                win_r0 = max(0, r1_start - halo_px)
                win_r1 = min(src_h, r1_end + halo_px)
                top_halo = r1_start - win_r0
                bottom_halo = win_r1 - r1_end

                read_window = Window(
                    col_off=0, row_off=win_r0, width=src_w, height=win_r1 - win_r0
                )
                dem_tile = src.read(1, window=read_window)

                # Compute native hazards on padded tile
                metrics_padded = compute_native_hazards_patch(
                    dem_tile,
                    res_m=1.0,
                    nodata=src_nodata,
                )

                # Trim halo to prevent edge seam artifacts
                valid_r_end = (
                    metrics_padded.slope_deg.shape[0] - bottom_halo if bottom_halo > 0 else None
                )
                trim_slice = slice(top_halo, valid_r_end)

                metrics_trimmed = NativeHazardMetrics(
                    slope_deg=metrics_padded.slope_deg[trim_slice, :],
                    tri_roughness_m=metrics_padded.tri_roughness_m[trim_slice, :],
                    boulder_score=metrics_padded.boulder_score[trim_slice, :],
                    scarp_score=metrics_padded.scarp_score[trim_slice, :],
                    obstacle_mask=metrics_padded.obstacle_mask[trim_slice, :],
                    valid_mask=metrics_padded.valid_mask[trim_slice, :],
                )

                # Aggregate this strip into 20m grid
                agg_strip = aggregate_native_patch_to_20m(
                    metrics_trimmed,
                    target_shape=(n_rows_20m, target_w),
                    scale_factor=scale,
                )

                # Assign into full raster
                out_boulder[r20_start:r20_end, :] = agg_strip.boulder_hazard_score
                out_scarp[r20_start:r20_end, :] = agg_strip.scarp_hazard_score
                out_slope_max[r20_start:r20_end, :] = agg_strip.slope_deg_max
                out_slope_p95[r20_start:r20_end, :] = agg_strip.slope_deg_p95
                out_roughness[r20_start:r20_end, :] = agg_strip.surface_roughness_max
                out_impassable[r20_start:r20_end, :] = agg_strip.hard_impassable.astype(np.uint8)

        # Consume authoritative HiRISE coverage product (owned by GeospatialPipeline)
        hirise_cov_path = self.processed_dir / f"{self.target_grid.name}_hirise_coverage.tif"
        if hirise_cov_path.exists():
            with rasterio.open(hirise_cov_path) as cov_src:
                authoritative_hirise_cov = cov_src.read(1)
                # Mask out any spurious gradient detections outside authoritative observed coverage
                unobserved = (authoritative_hirise_cov == 0) | (authoritative_hirise_cov == 255)
                out_boulder[unobserved] = STANDARD_NODATA_FLOAT
                out_scarp[unobserved] = 0.0
                out_slope_max[unobserved] = 0.0
                out_slope_p95[unobserved] = 0.0
                out_roughness[unobserved] = 0.0
                out_impassable[unobserved] = 1

        # Write output GeoTIFFs (Strict Single-Product Ownership per AGENTS.md §3 & M0.2.1.1)
        meta_20m = {
            "driver": "GTiff",
            "height": target_h,
            "width": target_w,
            "transform": self.target_grid.transform,
            "crs": self.target_grid.crs,
            "count": 1,
        }

        created_files: dict[str, Path] = {}

        # 1. Native HiRISE Obstacle Detection Mask (nodata=255 preserves valid 0=passable)
        obs_name = f"{self.target_grid.name}_hirise_hazard_obstacles.tif"
        hirise_obs_path = self.processed_dir / obs_name
        self._write_tif(hirise_obs_path, out_impassable, meta_20m, "uint8", 255)
        created_files["hirise_hazard_obstacles"] = hirise_obs_path

        # 2. Native HiRISE Boulder Candidate Score (Distinct Product, nodata=-9999.0)
        hirise_bld_path = self.processed_dir / f"{self.target_grid.name}_hirise_boulder_score.tif"
        self._write_tif(
            hirise_bld_path, out_boulder, meta_20m, "float32", STANDARD_NODATA_FLOAT
        )
        created_files["hirise_boulder_score"] = hirise_bld_path

        # 3. Native HiRISE Conservative Slope (Distinct Product)
        hirise_slope_path = self.processed_dir / f"{self.target_grid.name}_hirise_slope_deg.tif"
        self._write_tif(
            hirise_slope_path, out_slope_p95, meta_20m, "float32", STANDARD_NODATA_FLOAT
        )
        created_files["hirise_slope_deg"] = hirise_slope_path

        # 4. Native HiRISE Surface Roughness (Distinct Products)
        hirise_surf_rough_path = (
            self.processed_dir / f"{self.target_grid.name}_hirise_surface_roughness_m.tif"
        )
        self._write_tif(
            hirise_surf_rough_path, out_roughness, meta_20m, "float32", STANDARD_NODATA_FLOAT
        )
        created_files["hirise_surface_roughness"] = hirise_surf_rough_path

        hirise_rough_path = self.processed_dir / f"{self.target_grid.name}_hirise_roughness_m.tif"
        self._write_tif(
            hirise_rough_path, out_roughness, meta_20m, "float32", STANDARD_NODATA_FLOAT
        )
        created_files["hirise_roughness_m"] = hirise_rough_path

        # NOTE: NativeResolutionHazardPipeline does NOT write:
        # - hirise_coverage.tif (authoritatively owned by GeospatialPipeline)
        # - slope_deg.tif, boulder_hazard_score.tif, surface_roughness_m.tif
        #   (authoritatively owned by TerrainIntelligenceEngine)
        # - hazard_hard_impassable.tif (authoritatively owned by HazardIntelligenceEngine)

        # Record Provenance Catalog Entry
        catalog_path = self.catalog_dir / f"{self.target_grid.name}_native_hazards_catalog.json"
        provenance = {
            "pipeline": "NativeResolutionHazardPipeline",
            "version": "2.1.0 (Distinct Native Products & Single Ownership)",
            "source_product": "HiRISE_DTM_Delta_Jezero_DL_1m.tif",
            "source_resolution_m": 1.0,
            "target_resolution_m": 20.0,
            "aggregation_scale": 20,
            "created_products": [
                f"{self.target_grid.name}_hirise_hazard_obstacles.tif",
                f"{self.target_grid.name}_hirise_boulder_score.tif",
                f"{self.target_grid.name}_hirise_slope_deg.tif",
                f"{self.target_grid.name}_hirise_surface_roughness_m.tif",
                f"{self.target_grid.name}_hirise_roughness_m.tif",
            ],
            "consumed_products": [
                f"{self.target_grid.name}_hirise_coverage.tif",
            ],
            "methods": {
                "boulder_detection": "Morphological White Top-Hat (2m-4m filter) on native 1m DTM",
                "slope_calculation": "Horn 1981 at 1.0m resolution",
                "obstacle_aggregation": "Any-hit logical OR across 20x20 cell window",
                "boulder_aggregation": "Conservative maximum",
                "slope_aggregation": "95th percentile conservative pooling",
                "nodata_policy": "Explicit unknown propagation (impassable by default)",
            },
            "governance_compliance": "AGENTS.md Section 3 (Rule 5)",
            "epistemic_class": "DERIVED",
            "property_epistemic_classes": {
                "hirise_slope_deg": "DERIVED",
                "hirise_surface_roughness_m": "DERIVED",
                "hirise_boulder_score": "HEURISTIC",
                "hirise_hazard_obstacles": "HEURISTIC",
            },
            "processed_utc": datetime.now(UTC).isoformat(),
            "target_grid": self.target_grid.name,
            "dimensions": {"height": target_h, "width": target_w},
        }
        with open(catalog_path, "w", encoding="utf-8") as f:
            json.dump(provenance, f, indent=2)

        created_files["catalog"] = catalog_path
        logger.info("Successfully completed native-resolution hazard processing.")
        return created_files

    def _write_tif(
        self,
        path: Path,
        data: np.ndarray,
        meta_base: dict[str, Any],
        dtype: str,
        nodata: float,
    ) -> None:
        meta = meta_base.copy()
        meta.update(dtype=dtype, nodata=nodata)
        with rasterio.open(path, "w", **meta) as dst:
            dst.write(data.astype(dtype), 1)
