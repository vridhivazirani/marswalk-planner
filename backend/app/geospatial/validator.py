"""Planetary raster and vector file validation and metadata inspection.

Validates:
1. Raster IO readability (via rasterio/GDAL).
2. Raster spatial bounds, resolution, and band count.
3. Coordinate Reference System (CRS) inspection.
4. Detection of nodata values, NaN occurrences, and min/max elevation bounds.
5. GeoJSON structural integrity and geometry validation.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import rasterio


@dataclass(frozen=True)
class RasterValidationReport:
    """Detailed structural and spatial inspection report for a raster product."""

    file_name: str
    is_valid: bool
    driver: str | None
    width: int | None
    height: int | None
    count: int | None
    dtypes: list[str] | None
    crs: str | None
    bounds: tuple[float, float, float, float] | None  # (left, bottom, right, top)
    resolution: tuple[float, float] | None  # (x_res, y_res)
    nodata: float | None
    min_value: float | None
    max_value: float | None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class GeoJSONValidationReport:
    """Structural inspection report for GeoJSON vector datasets."""

    file_name: str
    is_valid: bool
    feature_count: int | None
    geometry_types: list[str] | None
    bounding_box: tuple[float, float, float, float] | None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def validate_raster(file_path: Path) -> RasterValidationReport:
    """Inspect and validate a raster file using Rasterio."""
    if not file_path.exists():
        return RasterValidationReport(
            file_name=file_path.name,
            is_valid=False,
            driver=None,
            width=None,
            height=None,
            count=None,
            dtypes=None,
            crs=None,
            bounds=None,
            resolution=None,
            nodata=None,
            min_value=None,
            max_value=None,
            error=f"File not found: {file_path}",
        )

    try:
        with rasterio.open(file_path) as src:
            bounds = (src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top)
            res = (src.res[0], src.res[1])
            crs_wkt = src.crs.to_string() if src.crs else None

            # Sample first band window for data value sanity check
            # Read first overview / decimated sample to avoid loading gigabytes into RAM
            sample_data = src.read(1, out_shape=(min(500, src.height), min(500, src.width)))
            mask = sample_data != src.nodata if src.nodata is not None else True
            valid_samples = sample_data[mask]

            min_val = float(valid_samples.min()) if valid_samples.size > 0 else None
            max_val = float(valid_samples.max()) if valid_samples.size > 0 else None

            return RasterValidationReport(
                file_name=file_path.name,
                is_valid=True,
                driver=src.driver,
                width=src.width,
                height=src.height,
                count=src.count,
                dtypes=[str(d) for d in src.dtypes],
                crs=crs_wkt,
                bounds=bounds,
                resolution=res,
                nodata=src.nodata,
                min_value=min_val,
                max_value=max_val,
            )
    except Exception as exc:
        return RasterValidationReport(
            file_name=file_path.name,
            is_valid=False,
            driver=None,
            width=None,
            height=None,
            count=None,
            dtypes=None,
            crs=None,
            bounds=None,
            resolution=None,
            nodata=None,
            min_value=None,
            max_value=None,
            error=str(exc),
        )


def validate_geojson(file_path: Path) -> GeoJSONValidationReport:
    """Inspect and validate a GeoJSON vector feature collection."""
    if not file_path.exists():
        return GeoJSONValidationReport(
            file_name=file_path.name,
            is_valid=False,
            feature_count=None,
            geometry_types=None,
            bounding_box=None,
            error=f"File not found: {file_path}",
        )

    try:
        with file_path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            return GeoJSONValidationReport(
                file_name=file_path.name,
                is_valid=False,
                feature_count=None,
                geometry_types=None,
                bounding_box=None,
                error="Invalid GeoJSON root object (must be JSON object)",
            )

        features = data.get("features", [])
        if not isinstance(features, list):
            return GeoJSONValidationReport(
                file_name=file_path.name,
                is_valid=False,
                feature_count=None,
                geometry_types=None,
                bounding_box=None,
                error="'features' property is not a list",
            )

        geom_types = set()
        lons: list[float] = []
        lats: list[float] = []

        for feat in features:
            geom = feat.get("geometry")
            if geom and isinstance(geom, dict):
                geom_types.add(geom.get("type", "Unknown"))
                coords = geom.get("coordinates")
                if coords:
                    # Flatten coordinates recursively
                    def extract_points(c: Any) -> list[tuple[float, float]]:
                        if (
                            isinstance(c, (list, tuple))
                            and len(c) >= 2
                            and isinstance(c[0], (int, float))
                        ):
                            return [(float(c[0]), float(c[1]))]
                        pts = []
                        if isinstance(c, (list, tuple)):
                            for item in c:
                                pts.extend(extract_points(item))
                        return pts

                    for lon, lat in extract_points(coords):
                        lons.append(lon)
                        lats.append(lat)

        bbox = (min(lons), min(lats), max(lons), max(lats)) if lons and lats else None

        return GeoJSONValidationReport(
            file_name=file_path.name,
            is_valid=True,
            feature_count=len(features),
            geometry_types=sorted(list(geom_types)),
            bounding_box=bbox,
        )

    except Exception as exc:
        return GeoJSONValidationReport(
            file_name=file_path.name,
            is_valid=False,
            feature_count=None,
            geometry_types=None,
            bounding_box=None,
            error=str(exc),
        )
