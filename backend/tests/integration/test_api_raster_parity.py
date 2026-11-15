"""Exhaustive API vs Authoritative GeoTIFF parity tests (M0.3.4).

Verifies:
1. Full 212,132-cell grid passability parity between authoritative
   `jezero_western_delta_20m_hazard_hard_impassable.tif` and the shared fusion/inspection inputs.
2. Live `/api/v1/hazards/inspect` endpoint parity across all terrain categories, including
   native-1 m-only blocked cells (specifically row 0, col 288 and wider sample).
3. Fail-closed behavior when authoritative inputs are missing, out-of-bounds, unknown
   (`source_id=0`), or contain missing CV scores (`-9999.0` / `NaN`).
"""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient

from app.api.routes import hazards as hazards_route
from app.geospatial.crs import MarsCoordinateSystem
from app.hazards.evaluator import compute_hazard_bundle
from app.hazards.uncertainty import STANDARD_NODATA_FLOAT
from app.main import app
from app.services.hazard_inspection import (
    AuthoritativeHazardInputMissingError,
    HazardInspectionService,
)

PROCESSED_DIR = Path(__file__).resolve().parents[3] / "data" / "processed"
client = TestClient(app)


def _cell_to_latlon(
    transform: rasterio.Affine, mars: MarsCoordinateSystem, row: int, col: int
) -> tuple[float, float]:
    px, py = rasterio.transform.xy(transform, int(row), int(col))
    lon, lat = mars.to_geographic(px, py)
    return float(lat), float(lon)


def test_full_grid_212132_cell_passability_parity() -> None:
    """Every single one of the 212,132 grid cells must match hazard_hard_impassable.tif."""
    p = PROCESSED_DIR
    with (
        rasterio.open(p / "jezero_western_delta_20m_slope_deg.tif") as s_src,
        rasterio.open(p / "jezero_western_delta_20m_tri_roughness_m.tif") as t_src,
        rasterio.open(p / "jezero_western_delta_20m_boulder_hazard_score.tif") as b_src,
        rasterio.open(p / "jezero_western_delta_20m_sand_hazard_score.tif") as sa_src,
        rasterio.open(p / "jezero_western_delta_20m_crater_hazard_score.tif") as c_src,
        rasterio.open(p / "jezero_western_delta_20m_source_id.tif") as sid_src,
        rasterio.open(p / "jezero_western_delta_20m_uncertainty_sigma_z.tif") as sig_src,
        rasterio.open(p / "jezero_western_delta_20m_hirise_hazard_obstacles.tif") as ho_src,
        rasterio.open(p / "jezero_western_delta_20m_hazard_hard_impassable.tif") as hi_src,
    ):
        slope = s_src.read(1)
        tri = t_src.read(1)
        boulder = b_src.read(1)
        sand = sa_src.read(1)
        crater = c_src.read(1)
        source_id = sid_src.read(1)
        sigma_z = sig_src.read(1)
        hirise_obs = ho_src.read(1)
        auth_imp = hi_src.read(1) > 0

    valid_mask = (slope != STANDARD_NODATA_FLOAT) & ~np.isnan(slope) & np.isin(source_id, (1, 2))
    bundle = compute_hazard_bundle(
        slope=slope,
        tri=tri,
        boulder_score=boulder,
        sand_score=sand,
        crater_score=crater,
        valid_mask=valid_mask,
        source_id=source_id,
        hirise_obstacle_mask=hirise_obs,
        sigma_z=sigma_z,
    )

    assert auth_imp.size == 212132
    assert int(np.count_nonzero(auth_imp)) == 61055
    assert np.array_equal(bundle.hard_impassable_mask, auth_imp)

    # Specifically confirm the 11,148 native-1m-only cells (including row 0, col 288)
    native_only = (source_id == 2) & (slope < 25.0) & (tri < 8.0) & (hirise_obs > 0)
    assert int(np.count_nonzero(native_only)) == 11148
    assert native_only[0, 288]
    assert bundle.hard_impassable_mask[0, 288]
    assert auth_imp[0, 288]
    assert "NATIVE_HIRISE_OBSTACLE" in str(bundle.restriction_codes[0, 288])


def test_api_inspect_matches_raster_across_all_categories() -> None:
    """Sampled live API /inspect queries must match hard_impassable & expose accurate reasons."""
    p = PROCESSED_DIR
    with (
        rasterio.open(p / "jezero_western_delta_20m_slope_deg.tif") as s_src,
        rasterio.open(p / "jezero_western_delta_20m_tri_roughness_m.tif") as t_src,
        rasterio.open(p / "jezero_western_delta_20m_source_id.tif") as sid_src,
        rasterio.open(p / "jezero_western_delta_20m_hirise_hazard_obstacles.tif") as ho_src,
        rasterio.open(p / "jezero_western_delta_20m_hazard_hard_impassable.tif") as hi_src,
    ):
        transform = s_src.transform
        bounds = s_src.bounds
        slope = s_src.read(1)
        tri = t_src.read(1)
        source_id = sid_src.read(1)
        hirise_obs = ho_src.read(1)
        auth_imp = hi_src.read(1) > 0

    mars = MarsCoordinateSystem()

    # Category 1: Passable HiRISE cells
    passable_hi = np.argwhere((source_id == 2) & (~auth_imp))
    # Category 2: Native-1m-only blocked HiRISE cells (incl. row 0, col 288)
    native_only_hi = np.argwhere(
        (source_id == 2) & auth_imp & (slope < 25.0) & (tri < 8.0) & (hirise_obs > 0)
    )
    # Category 3: Slope/TRI blocked HiRISE cells
    macro_hi = np.argwhere((source_id == 2) & auth_imp & ((slope >= 25.0) | (tri >= 8.0)))
    # Category 4: CTX-only unresolved resolution uncertainty cells
    ctx_cells = np.argwhere(source_id == 1)

    assert len(passable_hi) > 0
    assert len(native_only_hi) == 11148
    assert len(macro_hi) > 0
    assert len(ctx_cells) == 49139

    def _pick(arr: np.ndarray, k: int = 15) -> list[tuple[int, int]]:
        step = max(1, len(arr) // k)
        return [(int(r), int(c)) for r, c in arr[::step][:k]]

    # Exact verification of row 0, col 288
    lat_0, lon_0 = _cell_to_latlon(transform, mars, 0, 288)
    r0 = client.get(f"/api/v1/hazards/inspect?lat={lat_0}&lon={lon_0}")
    assert r0.status_code == 200
    d0 = r0.json()
    assert d0["is_passable"] is False
    assert d0["hard_restriction_code"] == "NATIVE_HIRISE_OBSTACLE"
    assert "NATIVE_HIRISE_OBSTACLE" in d0["hard_restriction_codes"]
    assert "Native 1.0 m HiRISE" in d0["explanation"]
    assert d0["hazard_classification"] == "RESTRICTED"

    # Category samples
    for row, col in _pick(passable_hi):
        lat, lon = _cell_to_latlon(transform, mars, row, col)
        data = client.get(f"/api/v1/hazards/inspect?lat={lat}&lon={lon}").json()
        assert data["is_passable"] is True
        assert data["hard_restriction_code"] is None
        assert data["hazard_classification"] == "PASSABLE"

    for row, col in _pick(native_only_hi):
        lat, lon = _cell_to_latlon(transform, mars, row, col)
        data = client.get(f"/api/v1/hazards/inspect?lat={lat}&lon={lon}").json()
        assert data["is_passable"] is False
        assert data["hard_restriction_code"] == "NATIVE_HIRISE_OBSTACLE"
        assert "Native 1.0 m HiRISE" in data["explanation"]

    for row, col in _pick(macro_hi):
        lat, lon = _cell_to_latlon(transform, mars, row, col)
        data = client.get(f"/api/v1/hazards/inspect?lat={lat}&lon={lon}").json()
        assert data["is_passable"] is False
        code = data["hard_restriction_code"] or ""
        assert "SLOPE_GT_MAX" in code or "TRI_GT_MAX" in code

    for row, col in _pick(ctx_cells):
        lat, lon = _cell_to_latlon(transform, mars, row, col)
        data = client.get(f"/api/v1/hazards/inspect?lat={lat}&lon={lon}").json()
        assert data["is_passable"] is False
        code = data["hard_restriction_code"] or ""
        assert (
            "UNRESOLVED_RESOLUTION_HAZARD" in code
            or "CTX_SLOPE_GT_MAX" in code
            or "CTX_TRI_GT_MAX" in code
        )

    # Category 6: Exact right/bottom footprint edge & out-of-bounds fail closed
    edge_lon, edge_lat = mars.to_geographic(bounds.right, bounds.bottom)
    edge_res = client.get(f"/api/v1/hazards/inspect?lat={edge_lat}&lon={edge_lon}").json()
    assert edge_res["status"] == "OUT_OF_BOUNDS"
    assert edge_res["is_passable"] is False


def test_unknown_cell_and_missing_inputs_fail_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Unknown cells (source_id=0), missing CV (-9999), and missing mask never turn passable."""
    # Create a tiny synthetic 2x2 processed GeoTIFF grid in tmp_path
    transform = rasterio.transform.from_origin(0.0, 40.0, 20.0, 20.0)
    crs = MarsCoordinateSystem().eqc_crs.to_wkt()

    def _write(name: str, arr: np.ndarray, dtype: str, nodata: float | int) -> None:
        with rasterio.open(
            tmp_path / f"testgrid_{name}.tif",
            "w",
            driver="GTiff",
            height=2,
            width=2,
            count=1,
            dtype=dtype,
            crs=crs,
            transform=transform,
            nodata=nodata,
        ) as dst:
            dst.write(arr.astype(dtype), 1)

    # Cell (0,0): valid HiRISE, slope=2, CV valid zero
    # Cell (0,1): unknown (source_id=0, elev=-9999)
    # Cell (1,0): HiRISE slope=2, boulder_score=-9999.0 (missing evidence must NOT turn 0.0)
    # Cell (1,1): HiRISE slope=2, hirise_hazard_obstacles=255 (NoData must fail closed)
    _write("elevation", np.array([[-2500.0, -9999.0], [-2500.0, -2500.0]]), "float32", -9999.0)
    _write("slope_deg", np.array([[2.0, -9999.0], [2.0, 2.0]]), "float32", -9999.0)
    _write("tri_roughness_m", np.array([[0.1, -9999.0], [0.1, 0.1]]), "float32", -9999.0)
    _write("boulder_hazard_score", np.array([[0.0, -9999.0], [-9999.0, 0.0]]), "float32", -9999.0)
    _write("sand_hazard_score", np.array([[0.0, -9999.0], [0.0, 0.0]]), "float32", -9999.0)
    _write("crater_hazard_score", np.array([[0.0, -9999.0], [0.0, 0.0]]), "float32", -9999.0)
    _write("source_id", np.array([[2, 0], [2, 2]]), "uint8", 255)
    _write("uncertainty_sigma_z", np.array([[0.2, -9999.0], [0.2, 0.2]]), "float32", -9999.0)
    _write("hirise_hazard_obstacles", np.array([[0, 1], [0, 255]]), "uint8", 255)
    _write("hazard_hard_impassable", np.array([[0, 1], [0, 1]]), "uint8", 255)

    service = HazardInspectionService(processed_dir=tmp_path, grid_name="testgrid")
    mars = MarsCoordinateSystem()

    # Cell (0,0): valid passable with real 0.0 boulder/sand/crater
    lat00, lon00 = _cell_to_latlon(transform, mars, 0, 0)
    res00 = service.inspect_coordinate(lat00, lon00)
    assert res00["is_passable"] is True
    assert res00["individual_hazards"]["boulder_hazard"] == 0.0

    # Cell (0,1): unknown source_id=0 -> must fail closed as UNKNOWN
    lat01, lon01 = _cell_to_latlon(transform, mars, 0, 1)
    res01 = service.inspect_coordinate(lat01, lon01)
    assert res01["is_passable"] is False
    assert "NO_DATA_UNKNOWN" in (res01["hard_restriction_code"] or "")
    assert res01["hazard_classification"] == "UNKNOWN_IMPASSABLE"

    # Cell (1,0): boulder_score=-9999.0 must NOT silently become 0.0
    lat10, lon10 = _cell_to_latlon(transform, mars, 1, 0)
    res10 = service.inspect_coordinate(lat10, lon10)
    assert res10["individual_hazards"]["boulder_hazard"] == 1.0
    assert res10["evidence_dimensions"]["optical_imagery_reliability"] == 0.0

    # Cell (1,1): hirise_hazard_obstacles=255 NoData must fail closed
    lat11, lon11 = _cell_to_latlon(transform, mars, 1, 1)
    res11 = service.inspect_coordinate(lat11, lon11)
    assert res11["is_passable"] is False
    assert "NO_DATA_UNKNOWN" in (res11["hard_restriction_code"] or "")

    # Missing hirise_hazard_obstacles.tif must raise explicit unavailability (HTTP 503 via API)
    obs_path = tmp_path / "testgrid_hirise_hazard_obstacles.tif"
    obs_backup = tmp_path / "backup_obs.tif"
    shutil.move(obs_path, obs_backup)
    with pytest.raises(AuthoritativeHazardInputMissingError):
        service.inspect_coordinate(lat00, lon00)

    # Also verify HTTP 503 mapping through API router
    missing_dir = tmp_path / "missing_only_elev"
    missing_dir.mkdir()
    shutil.copy(
        tmp_path / "testgrid_elevation.tif",
        missing_dir / "jezero_western_delta_20m_elevation.tif",
    )
    monkeypatch.setattr(hazards_route, "PROCESSED_DIR", missing_dir)
    resp = client.get(f"/api/v1/hazards/inspect?lat={lat00}&lon={lon00}")
    assert resp.status_code == 503
