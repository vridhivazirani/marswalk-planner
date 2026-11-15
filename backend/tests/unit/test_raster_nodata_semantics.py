"""Regression tests for M0.3.4 upstream GeoTIFF NoData semantics.

Verifies:
1. All 9 previously affected upstream GeoTIFFs no longer collide NoData with valid 0 / 0.0.
2. Reading uint8 masks (nodata=255) and float32 scores (nodata=-9999.0) with rasterio
   `masked=True` preserves every valid zero observation while masking only true NoData.
3. Categorical `source_id=0` (UNMAPPED/UNKNOWN) remains distinguishable from valid
   sources (`1=CTX`, `2=HiRISE`) and is never converted to `1` (CTX) by consumers.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import rasterio

from app.geospatial.crs import MarsCoordinateSystem
from app.terrain.multi_resolution import MultiResolutionTerrainInspector

PROCESSED_DIR = Path(__file__).resolve().parents[3] / "data" / "processed"


@pytest.mark.parametrize(
    ("filename", "expected_dtype", "expected_nodata"),
    [
        ("jezero_western_delta_20m_hirise_hazard_obstacles.tif", "uint8", 255.0),
        ("jezero_western_delta_20m_hirise_coverage.tif", "uint8", 255.0),
        ("jezero_western_delta_20m_ctx_coverage.tif", "uint8", 255.0),
        ("jezero_western_delta_20m_source_id.tif", "uint8", 255.0),
        ("jezero_western_delta_20m_hirise_boulder_score.tif", "float32", -9999.0),
        ("jezero_western_delta_20m_boulder_hazard_score.tif", "float32", -9999.0),
        ("jezero_western_delta_20m_sand_hazard_score.tif", "float32", -9999.0),
        ("jezero_western_delta_20m_crater_hazard_score.tif", "float32", -9999.0),
        ("jezero_western_delta_20m_terrain_confidence.tif", "float32", -9999.0),
    ],
)
def test_upstream_geotiff_nodata_headers_and_unmasked_valid_zeros(
    filename: str, expected_dtype: str, expected_nodata: float
) -> None:
    """Every valid zero pixel in the 9 upstream GeoTIFFs must survive masked=True reads."""
    path = PROCESSED_DIR / filename
    assert path.exists(), f"Missing processed GeoTIFF: {path}"

    with rasterio.open(path) as src:
        assert src.dtypes[0] == expected_dtype
        assert src.nodata == expected_nodata

        raw = src.read(1)
        masked = src.read(1, masked=True)
        mask_arr = np.ma.getmaskarray(masked)

        # Any valid zero in raw must NOT be masked as NoData
        valid_zeros = raw == 0
        assert not np.any(mask_arr[valid_zeros]), f"{filename} masked valid zeros under masked=True"

        # Masked pixels must equal exact nodata sentinel occurrences
        assert np.array_equal(mask_arr, raw == expected_nodata)


def test_synthetic_uint8_and_float32_zero_vs_nodata_distinction(tmp_path: Path) -> None:
    """Valid zeros (0 / 0.0), valid ones, and NoData (255 / -9999.0) remain distinguishable."""
    transform = rasterio.transform.from_origin(0.0, 60.0, 20.0, 20.0)
    crs = MarsCoordinateSystem().eqc_crs.to_wkt()

    # 1. Uint8 coverage / obstacle mask: 0=valid False/passable, 1=valid True/blocked, 255=NoData
    u8_path = tmp_path / "mask.tif"
    u8_data = np.array([[0, 1, 255]], dtype=np.uint8)
    with rasterio.open(
        u8_path,
        "w",
        driver="GTiff",
        height=1,
        width=3,
        count=1,
        dtype="uint8",
        crs=crs,
        transform=transform,
        nodata=255,
    ) as dst:
        dst.write(u8_data, 1)

    with rasterio.open(u8_path) as src:
        m = src.read(1, masked=True)
        assert not m.mask[0, 0] and m[0, 0] == 0
        assert not m.mask[0, 1] and m[0, 1] == 1
        assert m.mask[0, 2]

    # 2. Float32 score: 0.0=valid min hazard, 0.5=valid moderate hazard, -9999.0=NoData
    f32_path = tmp_path / "score.tif"
    f32_data = np.array([[0.0, 0.5, -9999.0]], dtype=np.float32)
    with rasterio.open(
        f32_path,
        "w",
        driver="GTiff",
        height=1,
        width=3,
        count=1,
        dtype="float32",
        crs=crs,
        transform=transform,
        nodata=-9999.0,
    ) as dst:
        dst.write(f32_data, 1)

    with rasterio.open(f32_path) as src:
        mf = src.read(1, masked=True)
        assert not mf.mask[0, 0] and mf[0, 0] == 0.0
        assert not mf.mask[0, 1] and mf[0, 1] == 0.5
        assert mf.mask[0, 2]


def test_categorical_source_id_zero_not_mistaken_for_ctx(tmp_path: Path) -> None:
    """MultiResolutionTerrainInspector must never coerce unknown source_id=0 into CTX=1."""
    transform = rasterio.transform.from_origin(0.0, 40.0, 20.0, 20.0)
    crs = MarsCoordinateSystem().eqc_crs.to_wkt()
    proc = tmp_path / "processed"
    proc.mkdir()

    def _w(suffix: str, arr: np.ndarray, dtype: str, nodata: float | int) -> None:
        with rasterio.open(
            proc / f"jezero_western_delta_20m_{suffix}.tif",
            "w",
            driver="GTiff",
            height=1,
            width=3,
            count=1,
            dtype=dtype,
            crs=crs,
            transform=transform,
            nodata=nodata,
        ) as dst:
            dst.write(arr.astype(dtype), 1)

    _w("elevation", np.array([[-2500.0, -2500.0, -2500.0]]), "float32", -9999.0)
    _w("slope_deg", np.array([[5.0, 5.0, 5.0]]), "float32", -9999.0)
    _w("tri_roughness_m", np.array([[0.2, 0.2, 0.2]]), "float32", -9999.0)
    _w("terrain_classes", np.array([[0, 1, 1]]), "uint8", 0)
    _w("terrain_confidence", np.array([[0.0, 0.70, 0.95]]), "float32", -9999.0)
    _w("source_id", np.array([[0, 1, 2]]), "uint8", 255)

    inspector = MultiResolutionTerrainInspector(data_root=tmp_path)
    mars = MarsCoordinateSystem()

    def _query(col: int) -> dict[str, object]:
        px, py = rasterio.transform.xy(transform, 0, col)
        lon, lat = mars.to_geographic(px, py)
        return inspector._query_regional_point(lat=lat, lon=lon, px=px, py=py)

    q_unk = _query(0)
    q_ctx = _query(1)
    q_hir = _query(2)

    assert q_unk["source_product"] == "Unmapped / Unknown"
    assert q_unk["confidence_score"] == 0.0
    assert q_ctx["source_product"] == "CTX 20m (native)"
    assert q_hir["source_product"] == "HiRISE 1m (fused)"
