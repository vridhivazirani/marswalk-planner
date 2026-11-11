"""Terrain Intelligence computation pipeline for Marswalk Planner.

Loads processed elevation & imagery, executes:
1. Slope & Aspect (Horn's algorithm)
2. Terrain Ruggedness Index (TRI)
3. Local Elevation Variation (LEV)
4. Boulder / Rock Candidate detection
5. Sand / Dune Candidate detection
6. Crater / Depression detection
7. Heuristic classification & confidence estimation
8. Exports processed GeoTIFFs, metadata, and colormapped QC PNGs.
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

from app.terrain.classifier import TERRAIN_CLASS_DETAILS, TERRAIN_CLASS_NAMES, classify_terrain
from app.terrain.derivatives import (
    compute_curvatures,
    compute_local_elevation_variation,
    compute_local_relief,
    compute_slope_aspect_horn,
    compute_surface_roughness,
    compute_terrain_ruggedness_index,
    compute_vector_ruggedness_measure,
)
from app.terrain.hazards_detector import (
    detect_boulder_candidates_advanced,
    detect_crater_depression_candidates,
    detect_sand_dune_candidates,
)

logger = logging.getLogger("marswalk.terrain")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    fmt = "[%(asctime)s] [%(levelname)s] %(message)s"
    handler.setFormatter(logging.Formatter(fmt, datefmt="%H:%M:%S"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

STANDARD_NODATA = -9999.0


@dataclass(frozen=True)
class TerrainLayerMetadata:
    layer_id: str
    name: str
    units: str
    min_val: float | None
    max_val: float | None
    mean_val: float | None
    method: str
    source_layer: str
    epistemic_class: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class TerrainIntelligenceEngine:
    """Computes explainable terrain intelligence metrics and hazard layers."""

    def __init__(self, data_root: Path | None = None) -> None:
        if data_root is None:
            self.data_root = Path(__file__).resolve().parents[3] / "data"
        else:
            self.data_root = Path(data_root)

        self.processed_dir = self.data_root / "processed"
        self.catalog_dir = self.data_root / "catalog"
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.catalog_dir.mkdir(parents=True, exist_ok=True)

    def run_terrain_analysis(self, grid_name: str = "jezero_western_delta_20m") -> dict[str, Path]:
        """Execute full terrain intelligence pipeline for specified ARD grid."""
        elev_path = self.processed_dir / f"{grid_name}_elevation.tif"
        ortho_path = self.processed_dir / f"{grid_name}_ortho_imagery.tif"
        src_id_path = self.processed_dir / f"{grid_name}_source_id.tif"

        if not elev_path.exists():
            raise FileNotFoundError(f"Processed elevation raster not found: {elev_path}")

        logger.info(f"Reading input elevation raster: {elev_path.name}")
        with rasterio.open(elev_path) as src:
            dem = src.read(1)
            meta = src.meta.copy()
            res_m = float(src.res[0])

        with rasterio.open(ortho_path) as src_o:
            imagery = src_o.read(1)

        with rasterio.open(src_id_path) as src_s:
            source_id = src_s.read(1)

        valid_mask = (dem != STANDARD_NODATA) & ~np.isnan(dem)
        created_files: dict[str, Path] = {}

        # -------------------------------------------------------------
        # 1. Slope and Aspect (Horn's Method)
        # -------------------------------------------------------------
        logger.info("Computing Horn's slope and aspect...")
        slope, aspect = compute_slope_aspect_horn(dem, res_m=res_m, nodata=STANDARD_NODATA)

        slope_path = self.processed_dir / f"{grid_name}_slope_deg.tif"
        self._write_tif(slope_path, slope, meta, "float32", STANDARD_NODATA)
        created_files["slope"] = slope_path

        # -------------------------------------------------------------
        # 2. Terrain Ruggedness Index (TRI)
        # -------------------------------------------------------------
        logger.info("Computing Terrain Ruggedness Index (TRI)...")
        tri = compute_terrain_ruggedness_index(dem, nodata=STANDARD_NODATA)

        tri_path = self.processed_dir / f"{grid_name}_tri_roughness_m.tif"
        self._write_tif(tri_path, tri, meta, "float32", STANDARD_NODATA)
        created_files["tri"] = tri_path

        # -------------------------------------------------------------
        # 3. Local Elevation Variation (LEV), Relief & Roughness
        # -------------------------------------------------------------
        logger.info("Computing LEV, Local Relief, Surface Roughness, and Curvatures...")
        lev = compute_local_elevation_variation(dem, size=5, nodata=STANDARD_NODATA)
        lev_path = self.processed_dir / f"{grid_name}_lev_variation_m.tif"
        self._write_tif(lev_path, lev, meta, "float32", STANDARD_NODATA)
        created_files["lev"] = lev_path

        relief = compute_local_relief(dem, size=5, nodata=STANDARD_NODATA)
        relief_path = self.processed_dir / f"{grid_name}_local_relief_m.tif"
        self._write_tif(relief_path, relief, meta, "float32", STANDARD_NODATA)
        created_files["relief"] = relief_path

        roughness = compute_surface_roughness(dem, size=5, nodata=STANDARD_NODATA)
        roughness_path = self.processed_dir / f"{grid_name}_surface_roughness_m.tif"
        self._write_tif(roughness_path, roughness, meta, "float32", STANDARD_NODATA)
        created_files["roughness"] = roughness_path

        prof_curv, plan_curv, mean_curv = compute_curvatures(
            dem, res_m=res_m, nodata=STANDARD_NODATA
        )
        prof_path = self.processed_dir / f"{grid_name}_profile_curvature.tif"
        self._write_tif(prof_path, prof_curv, meta, "float32", STANDARD_NODATA)
        created_files["profile_curvature"] = prof_path

        plan_path = self.processed_dir / f"{grid_name}_planform_curvature.tif"
        self._write_tif(plan_path, plan_curv, meta, "float32", STANDARD_NODATA)
        created_files["planform_curvature"] = plan_path

        vrm = compute_vector_ruggedness_measure(slope, aspect, size=5, nodata=STANDARD_NODATA)
        vrm_path = self.processed_dir / f"{grid_name}_vrm.tif"
        self._write_tif(vrm_path, vrm, meta, "float32", STANDARD_NODATA)
        created_files["vrm"] = vrm_path

        # -------------------------------------------------------------
        # 4. Computer Vision Hazard Candidates
        # -------------------------------------------------------------
        logger.info("Detecting Boulder/Rock, Sand/Dune, and Crater candidates...")
        boulder_score, _, bld_stats = detect_boulder_candidates_advanced(
            imagery=imagery,
            tri=tri,
            nodata_mask=valid_mask,
            sun_azimuth_deg=240.0,
            res_m=res_m,
        )
        sand_score, _ = detect_sand_dune_candidates(imagery, slope, tri, valid_mask)
        crater_score, _ = detect_crater_depression_candidates(lev, slope, valid_mask)

        boulder_path = self.processed_dir / f"{grid_name}_boulder_hazard_score.tif"
        self._write_tif(boulder_path, boulder_score, meta, "float32", 0.0)
        created_files["boulder_score"] = boulder_path

        sand_path = self.processed_dir / f"{grid_name}_sand_hazard_score.tif"
        self._write_tif(sand_path, sand_score, meta, "float32", 0.0)
        created_files["sand_score"] = sand_path

        crater_path = self.processed_dir / f"{grid_name}_crater_hazard_score.tif"
        self._write_tif(crater_path, crater_score, meta, "float32", 0.0)
        created_files["crater_score"] = crater_path

        # -------------------------------------------------------------
        # 5. Terrain Classification & Confidence Map
        # -------------------------------------------------------------
        logger.info("Classifying terrain units into 7 classes and computing confidence...")
        classes, confidence = classify_terrain(
            slope, tri, lev, boulder_score, sand_score, crater_score, valid_mask, source_id
        )

        class_path = self.processed_dir / f"{grid_name}_terrain_classes.tif"
        self._write_tif(class_path, classes, meta, "uint8", 0)
        created_files["classes"] = class_path

        conf_path = self.processed_dir / f"{grid_name}_terrain_confidence.tif"
        self._write_tif(conf_path, confidence, meta, "float32", 0.0)
        created_files["confidence"] = conf_path

        # -------------------------------------------------------------
        # 6. Generate Color-Coded QC Overlays
        # -------------------------------------------------------------
        logger.info("Generating Terrain Intelligence visual QC overlays...")
        qc_slope_path = self.processed_dir / f"{grid_name}_qc_slope.png"
        self._generate_slope_qc(slope, valid_mask, qc_slope_path)
        created_files["qc_slope"] = qc_slope_path

        qc_class_path = self.processed_dir / f"{grid_name}_qc_classes.png"
        self._generate_class_qc(classes, qc_class_path)
        created_files["qc_classes"] = qc_class_path

        # -------------------------------------------------------------
        # 7. Record Metadata Catalog Record
        # -------------------------------------------------------------
        catalog_path = self.catalog_dir / f"{grid_name}_terrain_intelligence.json"
        metadata = {
            "grid_name": grid_name,
            "processed_utc": datetime.now(UTC).isoformat(),
            "layers": [
                TerrainLayerMetadata(
                    "slope",
                    "Horn's Slope",
                    "degrees",
                    float(slope[valid_mask].min()),
                    float(slope[valid_mask].max()),
                    float(slope[valid_mask].mean()),
                    "Horn (1981) 3x3 convolution",
                    elev_path.name,
                    "DERIVED",
                ).to_dict(),
                TerrainLayerMetadata(
                    "tri",
                    "Terrain Ruggedness Index",
                    "metres",
                    float(tri[valid_mask].min()),
                    float(tri[valid_mask].max()),
                    float(tri[valid_mask].mean()),
                    "Riley et al. (1999) 3x3 RMS delta",
                    elev_path.name,
                    "DERIVED",
                ).to_dict(),
                TerrainLayerMetadata(
                    "relief",
                    "Local Relief",
                    "metres",
                    float(relief[valid_mask].min()),
                    float(relief[valid_mask].max()),
                    float(relief[valid_mask].mean()),
                    "Moving-window max-min elevation range (5x5 cells = 100m)",
                    elev_path.name,
                    "DERIVED",
                ).to_dict(),
                TerrainLayerMetadata(
                    "roughness",
                    "Surface Roughness",
                    "metres",
                    float(roughness[valid_mask].min()),
                    float(roughness[valid_mask].max()),
                    float(roughness[valid_mask].mean()),
                    "Moving-window elevation standard deviation (Shepard et al., 2001)",
                    elev_path.name,
                    "DERIVED",
                ).to_dict(),
                TerrainLayerMetadata(
                    "vrm",
                    "Vector Ruggedness Measure",
                    "index (0 to 1)",
                    float(vrm[valid_mask].min()),
                    float(vrm[valid_mask].max()),
                    float(vrm[valid_mask].mean()),
                    "Sappington et al. (2007) 3D normal vector dispersion",
                    elev_path.name,
                    "DERIVED",
                ).to_dict(),
                TerrainLayerMetadata(
                    "classification",
                    "7-Class Heuristic Terrain Classification",
                    "unit_id",
                    0.0,
                    6.0,
                    None,
                    "Explainable rule-based geomorphic classification",
                    "multisensor",
                    "HEURISTIC",
                ).to_dict(),
            ],
            "class_legend": TERRAIN_CLASS_NAMES,
            "class_details": TERRAIN_CLASS_DETAILS,
            "class_distribution": {
                name: int(np.count_nonzero(classes == code))
                for code, name in TERRAIN_CLASS_NAMES.items()
            },
            "boulder_candidate_stats": bld_stats,
        }
        catalog_path.write_text(json.dumps(metadata, indent=2))
        created_files["catalog"] = catalog_path

        logger.info("Terrain Intelligence processing complete.")
        return created_files

    @staticmethod
    def _write_tif(
        path: Path, data: np.ndarray, meta: dict[str, Any], dtype: str, nodata: float | int
    ) -> None:
        m = meta.copy()
        m.update(count=1, dtype=dtype, nodata=nodata, compress="deflate")
        with rasterio.open(path, "w", **m) as dst:
            dst.write(data, 1)

    @staticmethod
    def _generate_slope_qc(slope: np.ndarray, valid_mask: np.ndarray, out_path: Path) -> None:
        """Slope Colormap: Green (<10 deg) -> Yellow (10-20 deg) -> Purple (>25 deg cliff)."""
        h, w = slope.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)

        # Background NoData: Dark
        rgb[:] = 20

        # Normal slope 0-35 deg
        s_norm = np.clip(slope / 30.0, 0.0, 1.0)
        r = np.clip(s_norm * 2.0 * 255.0, 0, 255).astype(np.uint8)
        g = np.clip((1.0 - s_norm) * 255.0, 0, 255).astype(np.uint8)
        b = np.where(slope >= 25.0, 220, 30).astype(
            np.uint8
        )  # Purple highlight on impassable cliffs >25 deg

        rgb[0, valid_mask] = r[valid_mask]
        rgb[1, valid_mask] = g[valid_mask]
        rgb[2, valid_mask] = b[valid_mask]

        with rasterio.open(
            out_path, "w", driver="PNG", width=w, height=h, count=3, dtype="uint8"
        ) as dst:
            dst.write(rgb)

    @staticmethod
    def _generate_class_qc(classes: np.ndarray, out_path: Path) -> None:
        """Terrain Class Colormap for 7 classes:
        0: Unknown (Dark Charcoal)
        1: Smooth Terrain (Muted Silver)
        2: Rocky Terrain (Light Silver)
        3: Rough Terrain / Cliff (Aerospace White)
        4: Potential Loose Material (Medium Gray)
        5: Dune-Like Features (Dark Slate)
        6: Cratered Terrain (Deep Gray)
        """
        h, w = classes.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)

        palette = {
            0: (24, 24, 24),  # Unknown
            1: (163, 163, 163),  # Smooth
            2: (212, 212, 212),  # Rocky
            3: (245, 245, 245),  # Rough
            4: (115, 115, 115),  # Loose material
            5: (82, 82, 82),  # Dunes / TARs
            6: (56, 56, 56),  # Cratered
        }

        for c_id, (cr, cg, cb) in palette.items():
            mask = classes == c_id
            rgb[0, mask] = cr
            rgb[1, mask] = cg
            rgb[2, mask] = cb

        with rasterio.open(
            out_path, "w", driver="PNG", width=w, height=h, count=3, dtype="uint8"
        ) as dst:
            dst.write(rgb)
