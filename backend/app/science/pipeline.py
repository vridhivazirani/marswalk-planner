"""Geospatial processing pipeline for the Marswalk Scientific Opportunity Engine.

Loads processed Jezero Western Delta rasters, parses authentic Perseverance rover
telemetry, evaluates the multi-criteria opportunity bundle, extracts ranked candidate targets,
and generates catalog records and high-contrast QC heatmaps.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from pyproj import Transformer

from app.geospatial.crs import MARS_EQUIRECTANGULAR_CRS_URN, MARS_GEOGRAPHIC_CRS_URN
from app.science.config import ScienceProfile
from app.science.evaluator import (
    ScienceBundle,
    compute_science_opportunity_bundle,
    extract_candidate_targets,
)
from app.science.targets import CandidateTarget

logger = logging.getLogger(__name__)


class ScienceOpportunityEngine:
    """Orchestrates scientific opportunity layer evaluation, raster export, and target ranking."""

    def __init__(
        self,
        processed_dir: Path | None = None,
        raw_dir: Path | None = None,
        catalog_dir: Path | None = None,
    ) -> None:
        base = Path(__file__).resolve().parents[3]
        self.processed_dir = processed_dir or (base / "data" / "processed")
        self.raw_dir = raw_dir or (base / "data" / "raw")
        self.catalog_dir = catalog_dir or (base / "data" / "catalog")

        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.catalog_dir.mkdir(parents=True, exist_ok=True)

    def run_pipeline(
        self,
        grid_name: str = "jezero_western_delta_20m",
        profile: ScienceProfile | None = None,
    ) -> tuple[ScienceBundle, list[CandidateTarget], dict[str, Path]]:
        """Execute full science opportunity pipeline on the Jezero study grid."""
        if profile is None:
            profile = ScienceProfile()

        logger.info("Starting Scientific Opportunity Pipeline for %s", grid_name)

        elev_path = self.processed_dir / f"{grid_name}_elevation.tif"
        slope_path = self.processed_dir / f"{grid_name}_slope_deg.tif"
        source_path = self.processed_dir / f"{grid_name}_source_id.tif"
        waypoints_path = self.raw_dir / "perseverance" / "M20_waypoints.json"

        if not elev_path.exists():
            raise FileNotFoundError(f"Missing elevation raster: {elev_path}")
        if not slope_path.exists():
            raise FileNotFoundError(f"Missing slope raster: {slope_path}")
        if not source_path.exists():
            raise FileNotFoundError(f"Missing source_id raster: {source_path}")

        # Read elevation & metadata
        with rasterio.open(elev_path) as src:
            elevation = src.read(1)
            meta = src.meta.copy()
            bounds = src.bounds
            transform = src.transform
            h, w = src.shape

        valid_mask = elevation != -9999.0

        with rasterio.open(slope_path) as s_src:
            slope = s_src.read(1)

        with rasterio.open(source_path) as sid_src:
            source_id = sid_src.read(1)

        # Build coordinate grids
        cols, rows = np.meshgrid(np.arange(w), np.arange(h))
        xs, ys = rasterio.transform.xy(transform, rows, cols)
        x_coords = np.array(xs).reshape((h, w))
        y_coords = np.array(ys).reshape((h, w))

        # Project (x, y) to (lon, lat) on Mars sphere
        trans_inv = Transformer.from_crs(
            MARS_EQUIRECTANGULAR_CRS_URN, MARS_GEOGRAPHIC_CRS_URN, always_xy=True
        )
        lons, lats = trans_inv.transform(x_coords, y_coords)
        lon_grid = np.array(lons).reshape((h, w))
        lat_grid = np.array(lats).reshape((h, w))

        # Parse authentic rover waypoints
        rover_xy: list[tuple[float, float]] = []
        if waypoints_path.exists():
            trans_fwd = Transformer.from_crs(
                MARS_GEOGRAPHIC_CRS_URN, MARS_EQUIRECTANGULAR_CRS_URN, always_xy=True
            )
            with open(waypoints_path, encoding="utf-8") as f:
                wp_data = json.load(f)
            for feat in wp_data.get("features", []):
                coords = feat.get("geometry", {}).get("coordinates", [])
                if len(coords) >= 2:
                    wlon, wlat = coords[0], coords[1]
                    wx, wy = trans_fwd.transform(wlon, wlat)
                    if bounds.left <= wx <= bounds.right and bounds.bottom <= wy <= bounds.top:
                        rover_xy.append((wx, wy))
            logger.info("Loaded %d Perseverance waypoints inside study grid", len(rover_xy))

        # -------------------------------------------------------------
        # Evaluate Opportunity Bundle
        # -------------------------------------------------------------
        bundle = compute_science_opportunity_bundle(
            elevation=elevation,
            slope=slope,
            source_id=source_id,
            valid_mask=valid_mask,
            lat_grid=lat_grid,
            lon_grid=lon_grid,
            x_coords=x_coords,
            y_coords=y_coords,
            rover_waypoints_xy=rover_xy,
            profile=profile,
        )

        # Extract Ranked Candidate Targets
        targets = extract_candidate_targets(
            bundle=bundle,
            lat_grid=lat_grid,
            lon_grid=lon_grid,
            elevation=elevation,
            x_coords=x_coords,
            y_coords=y_coords,
            pixel_size_m=20.0,
        )

        created_files: dict[str, Path] = {}

        # -------------------------------------------------------------
        # 1. Export Opportunity Raster GeoTIFF (float32, [0.0, 1.0])
        # -------------------------------------------------------------
        opp_path = self.processed_dir / f"{grid_name}_science_opportunity.tif"
        self._write_tif(opp_path, bundle.composite_opportunity, meta, "float32", 0.0)
        created_files["opportunity_tif"] = opp_path

        # -------------------------------------------------------------
        # 2. Export Visual Heatmap QC PNG
        # -------------------------------------------------------------
        qc_path = self.processed_dir / f"{grid_name}_qc_science_opportunity.png"
        self._generate_science_qc(bundle.composite_opportunity, valid_mask, qc_path)
        created_files["qc_png"] = qc_path

        # -------------------------------------------------------------
        # 3. Export Candidate Targets GeoJSON & JSON
        # -------------------------------------------------------------
        targets_geojson = {
            "type": "FeatureCollection",
            "name": f"{grid_name}_ranked_science_targets",
            "crs": {"type": "name", "properties": {"name": MARS_GEOGRAPHIC_CRS_URN}},
            "features": [t.to_geojson_feature() for t in targets],
        }
        targets_path = self.catalog_dir / f"{grid_name}_science_targets.json"
        targets_path.write_text(json.dumps(targets_geojson, indent=2), encoding="utf-8")
        created_files["targets_json"] = targets_path

        # -------------------------------------------------------------
        # 4. Catalog Provenance & Metadata
        # -------------------------------------------------------------
        valid_opp = bundle.composite_opportunity[valid_mask]
        catalog_path = self.catalog_dir / f"{grid_name}_science_intelligence.json"
        metadata = {
            "grid_name": grid_name,
            "processed_utc": datetime.now(UTC).isoformat(),
            "profile": profile.to_dict(),
            "target_count": len(targets),
            "statistics": {
                "mean_opportunity": float(valid_opp.mean()),
                "max_opportunity": float(valid_opp.max()),
                "min_opportunity": float(valid_opp.min()),
                "p90_opportunity": float(np.percentile(valid_opp, 90)),
            },
            "layers": [
                {
                    "id": "s_mineralogy",
                    "name": "CRISM Mineralogical Interest",
                    "epistemic": "DERIVED",
                },
                {
                    "id": "s_diversity",
                    "name": "Geological Diversity & Contacts",
                    "epistemic": "INTERPRETED",
                },
                {
                    "id": "s_layered",
                    "name": "Layered Sedimentary Outcrops",
                    "epistemic": "DERIVED",
                },
                {
                    "id": "s_delta",
                    "name": "Delta System & Sedimentary Context",
                    "epistemic": "INTERPRETED",
                },
                {
                    "id": "s_proximity",
                    "name": "Perseverance Observation Proximity",
                    "epistemic": "OBSERVED",
                },
                {
                    "id": "s_confidence",
                    "name": "Sensor Resolution & Coverage Confidence",
                    "epistemic": "DERIVED",
                },
            ],
            "disclaimers": {
                "life_inference": profile.disclaimer_life_inference,
                "rover_safety": profile.disclaimer_rover_safety,
            },
        }
        catalog_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        created_files["catalog"] = catalog_path

        logger.info(
            "Scientific Opportunity Pipeline complete. Extracted %d ranked targets.",
            len(targets),
        )
        return bundle, targets, created_files

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
    def _generate_science_qc(
        opportunity: np.ndarray,
        valid_mask: np.ndarray,
        out_path: Path,
    ) -> None:
        """Render high-contrast scientific opportunity colormap.

        Color ramp: Deep Blue/Indigo (0.0) -> Cyan/Teal (0.35) -> Amber (0.65) -> Bright Gold (1.0).
        NoData pixels are rendered pitch black.
        """
        h, w = opportunity.shape
        rgb = np.zeros((3, h, w), dtype=np.uint8)

        # Continuous color gradient for valid pixels
        norm = np.clip(opportunity, 0.0, 1.0)

        # Red channel: low at 0.0, ramps up across mid/high values
        r = np.clip((norm - 0.25) * (255.0 / 0.75), 0, 255).astype(np.uint8)
        # Green channel: peaks at mid-to-high values
        g = np.clip(np.sin(norm * np.pi) * 230.0 + (norm**2) * 25.0, 0, 255).astype(np.uint8)
        # Blue channel: prominent at low values, drops off as gold takes over
        b = np.clip((1.0 - norm) * 220.0, 0, 255).astype(np.uint8)

        r[~valid_mask] = 12
        g[~valid_mask] = 12
        b[~valid_mask] = 14

        rgb[0] = r
        rgb[1] = g
        rgb[2] = b

        with rasterio.open(
            out_path, "w", driver="PNG", width=w, height=h, count=3, dtype="uint8"
        ) as dst:
            dst.write(rgb)
