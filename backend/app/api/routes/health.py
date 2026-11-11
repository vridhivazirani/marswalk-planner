"""System health endpoint."""

from pathlib import Path

from fastapi import APIRouter

from app import __version__
from app.catalog.atlas_catalog import ATLAS_CATALOGUE
from app.core.disclaimer import DISCLAIMER
from app.models.system import DiagnosticHealthResponse, HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, summary="Service liveness check")
def health() -> HealthResponse:
    """Report that the API process is running. Performs no scientific computation."""
    return HealthResponse(
        status="ok", service="marswalk-backend", version=__version__, disclaimer=DISCLAIMER
    )


@router.get(
    "/health/diagnostic",
    response_model=DiagnosticHealthResponse,
    summary="Comprehensive system & data lake diagnostic check",
)
def health_diagnostic() -> DiagnosticHealthResponse:
    """Perform real hardware and filesystem telemetry checks for initialization readiness."""
    data_dir = Path("data/raw")

    mola_path = data_dir / "mola" / "megt90n000cb.img"
    ctx_ortho = data_dir / "usgs_trn" / "JEZ_ctx_B_soc_008_orthoMosaic_6m.tif"
    ctx_dtm = data_dir / "usgs_trn" / "JEZ_ctx_B_soc_008_DTM_20m.tif"
    hirise_dtm = data_dir / "usgs_trn" / "HiRISE_DTM_Delta_Jezero_DL_1m.tif"
    traverse_json = data_dir / "perseverance" / "M20_traverse.json"

    data_lake_status = {
        "mola_global_elevation": {
            "available": mola_path.exists(),
            "path": str(mola_path),
            "size_bytes": mola_path.stat().st_size if mola_path.exists() else 0,
        },
        "ctx_regional_orthomosaic": {
            "available": ctx_ortho.exists(),
            "path": str(ctx_ortho),
            "size_bytes": ctx_ortho.stat().st_size if ctx_ortho.exists() else 0,
        },
        "ctx_regional_dtm": {
            "available": ctx_dtm.exists(),
            "path": str(ctx_dtm),
            "size_bytes": ctx_dtm.stat().st_size if ctx_dtm.exists() else 0,
        },
        "hirise_local_dtm": {
            "available": hirise_dtm.exists(),
            "path": str(hirise_dtm),
            "size_bytes": hirise_dtm.stat().st_size if hirise_dtm.exists() else 0,
        },
        "perseverance_traverse": {
            "available": traverse_json.exists(),
            "path": str(traverse_json),
            "size_bytes": traverse_json.stat().st_size if traverse_json.exists() else 0,
        },
    }

    # Geospatial engine capabilities
    try:
        import rasterio
        rasterio_ver = rasterio.__version__
        rasterio_ok = True
    except ImportError:
        rasterio_ver = "unavailable"
        rasterio_ok = False

    try:
        import pyproj
        pyproj_ver = pyproj.__version__
        pyproj_ok = True
    except ImportError:
        pyproj_ver = "unavailable"
        pyproj_ok = False

    geospatial_engine = {
        "rasterio": {"installed": rasterio_ok, "version": rasterio_ver},
        "pyproj": {"installed": pyproj_ok, "version": pyproj_ver},
        "geodesy_standard": "IAU_2015:49900",
        "vertical_datum": "Mars Gravitational Areoid (R_ref=3,396,000 m)",
    }

    # Catalogue summary
    catalogue_summary = {
        "total_verified_products": len(ATLAS_CATALOGUE),
        "epistemic_classes_supported": [
            "OBSERVED",
            "DERIVED",
            "INTERPRETED",
            "PREDICTED",
            "HEURISTIC",
            "SIMULATED",
            "UNKNOWN",
        ],
    }

    overall_status = "ok" if (mola_path.exists() and rasterio_ok and pyproj_ok) else "degraded"

    return DiagnosticHealthResponse(
        status=overall_status,
        service="marswalk-backend",
        version=__version__,
        geospatial_engine=geospatial_engine,
        data_lake=data_lake_status,
        catalogue=catalogue_summary,
        disclaimer=DISCLAIMER,
    )

