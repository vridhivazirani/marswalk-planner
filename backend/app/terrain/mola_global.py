"""Global Mars elevation sampling and multi-scale topography engine.

Integrates authentic NASA PDS MGS MOLA global altimetry (4 pixels/degree MEGDR)
with high-resolution Jezero CTX 20m and HiRISE 1m DTMs for seamless multi-scale elevation queries.

All elevations are referenced to the Mars Gravitational Areoid (MOLA GMM-2B equipotential
datum, mean equatorial radius R_ref = 3,396,000 m).
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

# Robust project data root discovery
PROJECT_DATA_ROOT = Path(__file__).resolve().parents[3] / "data"
if not PROJECT_DATA_ROOT.exists():
    PROJECT_DATA_ROOT = Path("data")

# Path to authentic MOLA 4 ppd binary grid
MOLA_GRID_PATH = PROJECT_DATA_ROOT / "raw/mola/megt90n000cb.img"
CTX_20M_PATH = PROJECT_DATA_ROOT / "raw/usgs_trn/JEZ_ctx_B_soc_008_DTM_20m.tif"
HIRISE_1M_PATH = PROJECT_DATA_ROOT / "raw/usgs_trn/HiRISE_DTM_Delta_Jezero_DL_1m.tif"

# In-memory cached MOLA grid
_MOLA_GRID: np.ndarray | None = None

# Jezero Study Footprints
HIRISE_BOUNDS = ((18.39209, 77.34370), (18.58953, 77.46579))
CTX_BOUNDS = ((18.21103, 77.16047), (18.72119, 77.69898))


def get_mola_grid() -> np.ndarray:
    """Load or retrieve the cached MOLA 4 ppd global elevation grid."""
    global _MOLA_GRID
    if _MOLA_GRID is not None:
        return _MOLA_GRID

    if not MOLA_GRID_PATH.exists():
        # Fallback to empty array if file not found
        return np.zeros((720, 1440), dtype=np.int16)

    # Read Big-Endian 16-bit signed integers (720 rows x 1440 cols)
    _MOLA_GRID = np.fromfile(MOLA_GRID_PATH, dtype=">i2").reshape((720, 1440))
    return _MOLA_GRID


def sample_mola_elevation(lat: float, lon: float, interpolate: bool = True) -> float:
    """Sample MOLA elevation in metres relative to Mars areoid at (lat, lon).

    Parameters
    ----------
    lat : float
        Planetocentric latitude in [-90.0, 90.0].
    lon : float
        East-positive longitude in [-180.0, 180.0] or [0.0, 360.0].
    interpolate : bool
        If True, applies bilinear interpolation across the 4 grid cells.
    """
    grid = get_mola_grid()
    clamped_lat = max(-90.0, min(90.0, float(lat)))
    lon_360 = float(lon) % 360.0

    # 4 pixels per degree: row goes from 90 (row 0) to -90 (row 720)
    # col goes from 0 (col 0) to 360 (col 1440)
    row_f = (90.0 - clamped_lat) * 4.0 - 0.5
    col_f = lon_360 * 4.0 - 0.5

    if not interpolate:
        r = int(np.clip(round(row_f), 0, 719))
        c = int(np.clip(round(col_f), 0, 1439))
        return float(grid[r, c])

    r0 = int(np.floor(row_f))
    r1 = r0 + 1
    c0 = int(np.floor(col_f))
    c1 = c0 + 1

    dr = row_f - r0
    dc = col_f - c0

    # Clamp rows to poles
    r0 = max(0, min(719, r0))
    r1 = max(0, min(719, r1))

    # Wrap columns circularly around 360 deg
    c0 = c0 % 1440
    c1 = c1 % 1440

    v00 = float(grid[r0, c0])
    v01 = float(grid[r0, c1])
    v10 = float(grid[r1, c0])
    v11 = float(grid[r1, c1])

    # Bilinear interpolation
    val = (1.0 - dr) * ((1.0 - dc) * v00 + dc * v01) + dr * ((1.0 - dc) * v10 + dc * v11)
    return float(val)


def _sample_rasterio_dtm(path: Path, lat: float, lon: float) -> float | None:
    """Sample a local GeoTIFF DTM in ESRI:103885 projection if within bounds."""
    if not path.exists():
        return None

    try:
        import rasterio
        from pyproj import Transformer

        with rasterio.open(path) as src:
            # Transform planetocentric lat/lon to raster CRS
            transformer = Transformer.from_crs("IAU_2015:49900", src.crs, always_xy=True)
            x, y = transformer.transform(lon, lat)

            # Check bounding box
            in_x = src.bounds.left <= x <= src.bounds.right
            in_y = src.bounds.bottom <= y <= src.bounds.top
            if not (in_x and in_y):
                return None

            # Sample row, col
            row, col = src.index(x, y)
            if 0 <= row < src.height and 0 <= col < src.width:
                window = rasterio.windows.Window(col, row, 1, 1)
                data = src.read(1, window=window)
                val = float(data[0, 0])
                if val != src.nodata and not np.isnan(val) and val > -30000:
                    return val
    except Exception:
        pass
    return None


def sample_multiscale_elevation(lat: float, lon: float) -> dict[str, Any]:
    """Sample multi-scale elevation selecting the highest-resolution authentic layer available.

    Hierarchy:
    1. HiRISE 1m DTM (Local scale, delta fan)
    2. CTX 20m DTM (Regional scale, Jezero crater basin)
    3. MOLA MEGDR 4ppd (Global scale, planetary baseline)
    """
    clamped_lat = max(-90.0, min(90.0, float(lat)))
    # Canonical east-positive lon in [-180, 180)
    canonical_lon = float(lon) % 360.0
    if canonical_lon >= 180.0:
        canonical_lon -= 360.0

    # 1. Check Local HiRISE footprint
    if (
        HIRISE_BOUNDS[0][0] <= clamped_lat <= HIRISE_BOUNDS[1][0]
        and HIRISE_BOUNDS[0][1] <= canonical_lon <= HIRISE_BOUNDS[1][1]
    ):
        local_val = _sample_rasterio_dtm(HIRISE_1M_PATH, clamped_lat, canonical_lon)
        if local_val is not None:
            return {
                "lat": round(clamped_lat, 6),
                "lon": round(canonical_lon, 6),
                "elevation_m": round(local_val, 2),
                "scale_tier": "LOCAL",
                "resolution_m": 1.0,
                "epistemic_class": "DERIVED",
                "vertical_datum": "Mars Gravitational Areoid (MOLA Datum, R_ref = 3,396,000 m)",
                "source_product": "MRO HiRISE Western Delta DTM Mosaic (USGS TRN)",
                "canonical_id": "PLN-SRC-08",
                "coverage_disclosure": (
                    "High-resolution 1.0m photogrammetric DTM coverage "
                    "active over Jezero Western Delta."
                ),
            }

    # 2. Check Regional CTX footprint
    if (
        CTX_BOUNDS[0][0] <= clamped_lat <= CTX_BOUNDS[1][0]
        and CTX_BOUNDS[0][1] <= canonical_lon <= CTX_BOUNDS[1][1]
    ):
        ctx_val = _sample_rasterio_dtm(CTX_20M_PATH, clamped_lat, canonical_lon)
        if ctx_val is not None:
            return {
                "lat": round(clamped_lat, 6),
                "lon": round(canonical_lon, 6),
                "elevation_m": round(ctx_val, 2),
                "scale_tier": "REGIONAL",
                "resolution_m": 20.0,
                "epistemic_class": "DERIVED",
                "vertical_datum": "Mars Gravitational Areoid (MOLA Datum, R_ref = 3,396,000 m)",
                "source_product": "MRO CTX Regional DTM Mosaic (USGS TRN)",
                "canonical_id": "PLN-SRC-06",
                "coverage_disclosure": (
                    "Regional 20m photogrammetric DTM coverage active over Jezero Crater basin."
                ),
            }

    # 3. Fallback to Global MOLA MEGDR
    mola_val = sample_mola_elevation(clamped_lat, canonical_lon, interpolate=True)
    return {
        "lat": round(clamped_lat, 6),
        "lon": round(canonical_lon, 6),
        "elevation_m": round(mola_val, 1),
        "scale_tier": "GLOBAL",
        "resolution_m": 14800.0,  # ~14.8 km post spacing at equator (4 pixels/deg)
        "epistemic_class": "OBSERVED",
        "vertical_datum": (
            "Mars Gravitational Areoid (GMM-2B equipotential surface, R_ref = 3,396,000 m)"
        ),
        "source_product": "MGS MOLA MEGDR 4ppd Global Altimetry (NASA GSFC / PDS)",
        "canonical_id": "PLN-SRC-01",
        "coverage_disclosure": (
            "Global planetary altimetry coverage. Post spacing (~15 km) is insufficient for "
            "EVA micro-hazard avoidance."
        ),
    }


def get_global_mola_texture_bytes(texture_type: str = "shaded_relief") -> bytes:
    """Return PNG bytes for global equirectangular Mars texture (shaded relief, color, or blend).

    Equirectangular projection with [-180, 180] longitude mapped across [0, 1440] columns
    and [+90, -90] latitude mapped across [0, 720] rows, matching Three.js spherical UV mapping.
    """
    clean_type = texture_type.lower().strip()
    proc_dir = PROJECT_DATA_ROOT / "processed"
    proc_dir.mkdir(parents=True, exist_ok=True)

    cache_file = proc_dir / f"global_mola_{clean_type}.png"
    if cache_file.exists():
        with open(cache_file, "rb") as f:
            return f.read()

    # Load MOLA grid and roll columns by +720 so -180E is at col 0, 0E at col 720
    grid = get_mola_grid().astype(np.float32)
    grid_rolled = np.roll(grid, 720, axis=1)

    # 1. Analytical Hillshade
    lats = np.linspace(90, -90, 720) * np.pi / 180.0
    cos_lats = np.maximum(np.cos(lats)[:, None], 0.01)
    dy = (np.pi * 3396190.0) / (180.0 * 4.0)
    dx = dy * cos_lats

    dz_dy = (grid_rolled[:-2, :] - grid_rolled[2:, :]) / (2.0 * dy)
    dz_dy = np.pad(dz_dy, ((1, 1), (0, 0)), mode="edge")
    dz_dx = (np.roll(grid_rolled, -1, axis=1) - np.roll(grid_rolled, 1, axis=1)) / (2.0 * dx)

    slope = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
    aspect = np.arctan2(dz_dy, -dz_dx)
    az_rad = 315.0 * np.pi / 180.0
    alt_rad = 45.0 * np.pi / 180.0

    shaded = np.sin(alt_rad) * np.cos(slope) + np.cos(alt_rad) * np.sin(slope) * np.cos(
        az_rad - aspect
    )
    shaded = np.clip(shaded, 0, 1)
    hs_uint8 = (shaded * 255).astype(np.uint8)

    if clean_type in ("shaded_relief", "hillshade", "bw"):
        img = Image.fromarray(hs_uint8, mode="L")
        img.save(cache_file, format="PNG")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    # 2. Hypsometric Elevation Colors
    elev_pts = np.array([-8000, -4500, -2000, 0, 2500, 6000, 11000, 21287], dtype=np.float32)
    colors = np.array(
        [
            [25, 35, 110],  # Deep basin (Hellas)
            [20, 140, 180],  # Northern lowlands
            [40, 180, 140],  # Transition lowlands
            [100, 175, 70],  # Datum 0m
            [210, 165, 55],  # Cratered highlands
            [195, 85, 35],  # Uplands
            [160, 50, 45],  # Volcanic shields
            [245, 240, 250],  # Olympus peak
        ],
        dtype=np.float32,
    )

    rgb = np.zeros((720, 1440, 3), dtype=np.float32)
    for i in range(3):
        rgb[:, :, i] = np.interp(grid_rolled, elev_pts, colors[:, i])

    if clean_type in ("color_elevation", "elevation", "color"):
        img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), mode="RGB")
        img.save(cache_file, format="PNG")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    # 3. Blend (Hillshade x Color)
    blend = rgb * (0.35 + 0.65 * (hs_uint8.astype(np.float32) / 255.0)[:, :, None])
    img = Image.fromarray(np.clip(blend, 0, 255).astype(np.uint8), mode="RGB")
    img.save(cache_file, format="PNG")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
