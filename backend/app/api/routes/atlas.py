"""FastAPI router for the Mars Planetary Exploration Atlas catalogue and map layer registry."""

from __future__ import annotations

import hashlib
import math
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.catalog.atlas_catalog import (
    CATEGORY_METADATA,
    AtlasCategory,
    get_all_atlas_entries,
    get_atlas_entry_by_id,
    search_atlas_entries,
)
from app.catalog.geological_units import (
    get_all_crism_indices,
    get_all_crism_scenes,
    get_all_geologic_units,
    get_all_global_geologic_units,
)
from app.catalog.planetary_features import (
    get_all_landing_sites,
    get_all_planetary_features,
    get_jezero_regional_footprints,
    search_planetary_features,
)
from app.catalog.regional_catalog import (
    get_all_regional_layers,
    get_jezero_crism_observations,
    get_jezero_geology,
    get_perseverance_sample_records,
    get_regional_categories,
    get_regional_study_area,
)
from app.terrain.mola_global import (
    get_global_mola_texture_bytes,
    sample_multiscale_elevation,
)
from app.terrain.regional_jezero import (
    compare_regional_layers,
    generate_elevation_profile,
    query_rover_traverse,
    query_rover_waypoints,
)

router = APIRouter(prefix="/atlas", tags=["planetary-atlas"])

TILE_CACHE_DIR = Path(__file__).resolve().parents[4] / "data" / "cache" / "tiles"
TILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

GLOBAL_BASEMAPS = [
    {
        "id": "mola_color_topography",
        "name": "MOLA Colorized Planetary Topography",
        "service_type": "WMTS",
        "wmts_tile_url": (
            "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m"
            "/1.0.0//default/default028mm/{z}/{y}/{x}.jpg"
        ),
        "proxy_tile_url": "/api/v1/atlas/tiles/wmts/mola_color_topography/{z}/{y}/{x}.jpg",
        "resolution": "463 m/pixel",
        "crs": "IAU_2015:49900 (Equatorial Mars Sphere)",
        "epistemic_class": "DERIVED",
        "description": (
            "Authentic NASA Mars Trek MOLA colorized elevation blended with shaded relief."
        ),
        "is_default": True,
    },
    {
        "id": "mola_shaded_relief",
        "name": "MOLA Shaded Relief (B&W Aerospace Monochrome)",
        "service_type": "WMS",
        "wms_url": (
            "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map"
        ),
        "proxy_wms_url": "/api/v1/atlas/tiles/wms/mola_shaded_relief",
        "wms_layers": "MOLA_bw",
        "format": "image/jpeg",
        "resolution": "463 m/pixel (128 px/deg)",
        "crs": "IAU_2015:49900 (Mars Plate Carrée)",
        "epistemic_class": "DERIVED",
        "description": (
            "USGS Astrogeology analytical shaded relief basemap derived from MOLA altimetry."
        ),
        "is_default": False,
    },
    {
        "id": "themis_day_ir",
        "name": "THEMIS Daytime Infrared Controlled Mosaic",
        "service_type": "WMS",
        "wms_url": (
            "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map"
        ),
        "wms_layers": "THEMIS_controlled",
        "format": "image/jpeg",
        "resolution": "100 m/pixel",
        "crs": "IAU_2015:49900",
        "epistemic_class": "OBSERVED",
        "description": (
            "Mars Odyssey THEMIS Band 9 (12.57 µm) daytime radiance highlighting surface bedrock."
        ),
        "is_default": False,
    },
    {
        "id": "themis_night_ir",
        "name": "THEMIS Nighttime Thermal Infrared Radiance",
        "service_type": "WMS",
        "wms_url": (
            "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map"
        ),
        "wms_layers": "THEMIS_night",
        "format": "image/jpeg",
        "resolution": "100 m/pixel",
        "crs": "IAU_2015:49900",
        "epistemic_class": "OBSERVED",
        "description": (
            "Thermal contrast map where warm nocturnal bedrock stands out from cold fine dust "
            "(brightness temperature in K; not derived thermal inertia units)."
        ),
        "is_default": False,
    },
    {
        "id": "viking_mdim21_bw",
        "name": "Viking Orbiter MDIM 2.1 Grayscale Mosaic (USGS)",
        "service_type": "WMS",
        "wms_url": (
            "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map"
        ),
        "wms_layers": "MDIM21",
        "format": "image/jpeg",
        "resolution": "232 m/pixel",
        "crs": "IAU_2015:49900",
        "epistemic_class": "OBSERVED",
        "description": (
            "USGS Astrogeology controlled global black-and-white visual mosaic from "
            "Viking Orbiter cameras."
        ),
        "is_default": False,
    },
    {
        "id": "viking_mdim21",
        "name": "Viking Orbiter MDIM 2.1 Visual Color Mosaic",
        "service_type": "WMTS",
        "wmts_tile_url": (
            "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m"
            "/1.0.0//default/default028mm/{z}/{y}/{x}.jpg"
        ),
        "proxy_tile_url": "/api/v1/atlas/tiles/wmts/viking_mdim21/{z}/{y}/{x}.jpg",
        "resolution": "232 m/pixel",
        "crs": "IAU_2015:49900",
        "epistemic_class": "OBSERVED",
        "description": (
            "Controlled true-color planetary surface albedo mosaic from Viking Orbiter cameras."
        ),
        "is_default": False,
    },
    {
        "id": "mola_themis_blend",
        "name": "MOLA Altimetry & THEMIS Day IR Blend",
        "service_type": "WMS",
        "wms_url": (
            "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map"
        ),
        "wms_layers": "MOLA_THEMIS_blend",
        "format": "image/jpeg",
        "resolution": "100 m/pixel",
        "crs": "IAU_2015:49900",
        "epistemic_class": "DERIVED",
        "description": (
            "High-fidelity fusion of MOLA elevation shading with THEMIS thermophysical textures."
        ),
        "is_default": False,
    },
]

NAVIGATION_TARGETS = [
    {
        "id": "nav-jezero-delta",
        "name": "Jezero Crater Western Delta (Marswalk Local Site)",
        "lat": 18.4485,
        "lon": 77.4320,
        "recommended_zoom": 13,
        "scale_tier": "LOCAL",
        "bounds": [[18.39180, 77.34370], [18.58953, 77.46584]],
        "description": (
            "Primary Marswalk research area: authentic 1m HiRISE DTM and 6m CTX mosaic coverage."
        ),
    },
    {
        "id": "nav-jezero-crater",
        "name": "Jezero Crater Regional Floor & Rim",
        "lat": 18.4446,
        "lon": 77.4509,
        "recommended_zoom": 9,
        "scale_tier": "REGIONAL",
        "bounds": [[18.15, 77.15], [18.70, 77.75]],
        "description": "Complete 49 km impact crater basin and ancient inflow breach canyons.",
    },
    {
        "id": "nav-olympus-mons",
        "name": "Olympus Mons (Volcanic Summit)",
        "lat": 18.65,
        "lon": -133.80,
        "recommended_zoom": 6,
        "scale_tier": "GLOBAL",
        "bounds": [[13.0, -140.0], [24.0, -127.0]],
        "description": "Solar system's largest shield volcano, rising 21.3 km above MOLA areoid.",
    },
    {
        "id": "nav-valles-marineris",
        "name": "Valles Marineris (Melas Chasma)",
        "lat": -9.80,
        "lon": -76.50,
        "recommended_zoom": 6,
        "scale_tier": "GLOBAL",
        "bounds": [[-16.0, -85.0], [-5.0, -68.0]],
        "description": "Central deepest abyss of the Martian canyon system.",
    },
    {
        "id": "nav-gale-crater",
        "name": "Gale Crater (Mount Sharp / Curiosity)",
        "lat": -5.37,
        "lon": 137.44,
        "recommended_zoom": 9,
        "scale_tier": "REGIONAL",
        "bounds": [[-6.5, 136.0], [-4.2, 138.8]],
        "description": "5 km central sedimentary mound explored by the MSL Curiosity rover.",
    },
    {
        "id": "nav-hellas-basin",
        "name": "Hellas Planitia (Deepest Lowland Basin)",
        "lat": -42.40,
        "lon": 70.50,
        "recommended_zoom": 4,
        "scale_tier": "GLOBAL",
        "bounds": [[-55.0, 55.0], [-30.0, 85.0]],
        "description": "Vast 2,300 km impact basin reaching -7.15 km below areoid datum.",
    },
]


@router.get("/global/basemaps", summary="Get verified global Mars basemaps")
@router.get("/global/layers", summary="Discover all global map layers")
def get_global_basemaps() -> dict[str, Any]:
    """Return available authentic global planetary basemaps (MOLA, THEMIS, Viking, Geology)."""
    return {
        "basemaps": GLOBAL_BASEMAPS,
        "layers": GLOBAL_BASEMAPS,
        "count": len(GLOBAL_BASEMAPS),
        "crs": "IAU_2015:49900",
        "authority": "USGS Astrogeology & NASA Trek Planetary Tile Services",
    }


@router.get("/tiles/wmts/{layer_id}/{z}/{y}/{x}.jpg", summary="High-speed cached WMTS tile proxy")
def get_cached_wmts_tile(layer_id: str, z: int, y: int, x: int) -> Response:
    """Stream cached planetary tile with local disk cache and immutable HTTP caching headers."""
    layer = next((b for b in GLOBAL_BASEMAPS if b["id"] == layer_id), None)
    if not layer or "wmts_tile_url" not in layer:
        raise HTTPException(status_code=404, detail=f"WMTS layer '{layer_id}' not found.")

    cache_file = TILE_CACHE_DIR / f"{layer_id}_{z}_{y}_{x}.jpg"
    if cache_file.exists():
        return FileResponse(
            cache_file,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )

    upstream_url = (
        layer["wmts_tile_url"]
        .replace("{z}", str(z))
        .replace("{y}", str(y))
        .replace("{x}", str(x))
    )
    try:
        req = urllib.request.Request(upstream_url, headers={"User-Agent": "Marswalk/1.0"})
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            data = resp.read()
        cache_file.write_bytes(data)
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream tile unavailable: {e}") from e


@router.get("/tiles/wms/{layer_id}", summary="High-speed cached WMS tile proxy")
def get_cached_wms_tile(layer_id: str, request: Request) -> Response:
    """Stream cached WMS tile from USGS with local disk cache and deterministic bbox hashing."""
    layer = next((b for b in GLOBAL_BASEMAPS if b["id"] == layer_id), None)
    if not layer or "wms_url" not in layer:
        raise HTTPException(status_code=404, detail=f"WMS layer '{layer_id}' not found.")

    query = request.url.query
    cache_key = hashlib.md5(f"{layer_id}_{query}".encode()).hexdigest()
    cache_file = TILE_CACHE_DIR / f"wms_{layer_id}_{cache_key}.jpg"

    if cache_file.exists():
        return FileResponse(
            cache_file,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )

    sep = "&" if "?" in layer["wms_url"] else "?"
    upstream_url = f"{layer['wms_url']}{sep}{query}"
    try:
        req = urllib.request.Request(upstream_url, headers={"User-Agent": "Marswalk/1.0"})
        with urllib.request.urlopen(req, timeout=12.0) as resp:
            data = resp.read()
        cache_file.write_bytes(data)
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream WMS unavailable: {e}") from e


@router.get(
    "/global/texture/{texture_type}.png",
    summary="Get global equirectangular Mars texture for 3D globe draping",
)
def get_global_texture(texture_type: str) -> Response:
    """Return authentic MOLA-derived equirectangular texture (shaded relief, color, or blend)."""
    try:
        data = get_global_mola_texture_bytes(texture_type)
        return Response(content=data, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate texture: {e}") from e


@router.get("/global/layers/{layer_id}", summary="Get global map layer metadata")
def get_global_layer_by_id(layer_id: str) -> dict[str, Any]:
    """Return detailed metadata for a specific global layer."""
    layer = next((b for b in GLOBAL_BASEMAPS if b["id"] == layer_id), None)
    if not layer:
        raise HTTPException(status_code=404, detail=f"Global layer '{layer_id}' not found.")
    return layer


@router.get("/global/features", summary="Get authentic IAU planetary features")
def get_planetary_features(
    search: str | None = Query(None, description="Search features by name or keyword"),
    feature_type: str | None = Query(None, description="Filter by feature type"),
    limit: int = Query(50, ge=1, le=100, description="Max results to return"),
) -> dict[str, Any]:
    """Return major named craters, canyons, volcanoes, and basins from IAU nomenclature."""
    if search or feature_type:
        features = search_planetary_features(search=search, feature_type=feature_type, limit=limit)
    else:
        features = get_all_planetary_features()[:limit]

    return {
        "features": [f.to_dict() for f in features],
        "count": len(features),
        "total_available": len(get_all_planetary_features()),
        "authority": "IAU Working Group for Planetary System Nomenclature (WGPSN)",
    }


@router.get("/global/geology", summary="Get authentic USGS SIM-3292 global geological units")
def get_global_geology() -> dict[str, Any]:
    """Return authentic global stratigraphic units from USGS SIM-3292 (Tanaka et al. 2014)."""
    units = get_all_global_geologic_units()
    return {
        "authority": "USGS Scientific Investigations Map 3292 (Tanaka et al., 2014)",
        "scale": "1:20,000,000",
        "epistemic_class": "INTERPRETED",
        "count": len(units),
        "units": [u.to_dict() for u in units],
    }


@router.get("/global/elevation-sample", summary="Sample multi-scale Mars elevation")
def get_global_elevation_sample(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Planetocentric latitude in [-90, 90]"),
    lon: float = Query(..., description="East-positive longitude in [-180, 180) or [0, 360)"),
) -> dict[str, Any]:
    """Return multi-scale elevation in metres relative to the Mars Gravitational Areoid."""
    return sample_multiscale_elevation(lat=lat, lon=lon)


@router.get("/global/coverage", summary="Inspect multi-scale layer coverage at coordinates")
def get_layer_coverage(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Planetocentric latitude"),
    lon: float = Query(..., description="East-positive longitude"),
) -> dict[str, Any]:
    """Return which multi-scale layers (Global, Regional, Local) cover the coordinates."""
    # Canonicalize lon to [-180, 180)
    c_lon = float(lon) % 360.0
    if c_lon >= 180.0:
        c_lon -= 360.0

    in_hirise = (18.39209 <= lat <= 18.58953) and (77.34370 <= c_lon <= 77.46579)
    in_ctx = (18.21103 <= lat <= 18.72119) and (77.16047 <= c_lon <= 77.69898)

    tiers = []
    if in_hirise:
        tiers.append(
            {
                "scale_tier": "LOCAL",
                "name": "HiRISE 1m Local DTM & Orthorectified Imagery",
                "resolution": "1.0 m/pixel",
                "source": "USGS Astrogeology Mars 2020 TRN Mosaic",
                "epistemic_class": "DERIVED",
            }
        )
    if in_ctx:
        tiers.append(
            {
                "scale_tier": "REGIONAL",
                "name": "CTX 20m Regional DTM & 6m Context Orthomosaic",
                "resolution": "20.0 m/pixel (DTM) / 6.0 m/pixel (Ortho)",
                "source": "USGS Astrogeology Context Camera Mosaic",
                "epistemic_class": "DERIVED",
            }
        )
    tiers.append(
        {
            "scale_tier": "GLOBAL",
            "name": "MOLA 463m Topography & Viking MDIM 2.1 Imagery",
            "resolution": "463 m/pixel (MOLA) / 232 m/pixel (Viking)",
            "source": "NASA PDS Geosciences & USGS Astrogeology",
            "epistemic_class": "OBSERVED / DERIVED",
        }
    )

    return {
        "lat": lat,
        "lon": c_lon,
        "active_tier": tiers[0]["scale_tier"],
        "available_tiers": tiers,
        "jezero_focus_available": in_ctx or in_hirise,
    }


@router.get("/global/landing-sites", summary="Get historical Mars surface mission landing sites")
def get_landing_sites() -> dict[str, Any]:
    """Return verified landing coordinates, elevations, and mission statuses for Mars craft."""
    sites = get_all_landing_sites()
    return {
        "landing_sites": [s.to_dict() for s in sites],
        "count": len(sites),
        "datum": "Mars Areoid (MOLA)",
    }


@router.get("/global/navigation-targets", summary="Get key planetary navigation targets")
def get_navigation_targets() -> dict[str, Any]:
    """Return bounding boxes and zoom targets for seamless navigation to Jezero Crater."""
    return {
        "targets": NAVIGATION_TARGETS,
        "count": len(NAVIGATION_TARGETS),
    }


@router.get("/regional/jezero/footprints", summary="Get authentic Jezero regional footprints")
def get_jezero_footprints() -> dict[str, Any]:
    """Return coverage footprints for HiRISE 1m DTM, CTX 20m DTM, and geological landmarks."""
    return get_jezero_regional_footprints()


@router.get("/geology/units", summary="Get authentic USGS SIM-3464 geologic formations")
def get_geology_units() -> dict[str, Any]:
    """Return mapped stratigraphic units, epochs, key minerals, and drill sample cores."""
    units = get_all_geologic_units()
    return {
        "units": [u.to_dict() for u in units],
        "count": len(units),
        "authority": "USGS Scientific Investigations Map 3464 (Sun & Stack 2020)",
        "scale": "1:75,000",
    }


@router.get("/geology/crism-indices", summary="Get authentic CRISM spectral mineralogy indices")
def get_crism_indices() -> dict[str, Any]:
    """Return CRISM spectral absorption indices (Fe/Mg clays, carbonates, and olivine)."""
    indices = get_all_crism_indices()
    return {
        "indices": [idx.to_dict() for idx in indices],
        "count": len(indices),
        "instrument": "Mars Reconnaissance Orbiter (MRO) CRISM",
    }


@router.get("/geology/crism-scenes", summary="Get authentic CRISM targeted scenes at Jezero")
def get_crism_scenes() -> dict[str, Any]:
    """Return authentic MRO CRISM targeted hyperspectral scenes (FRT, HRL)."""
    scenes = get_all_crism_scenes()
    return {
        "scenes": [s.to_dict() for s in scenes],
        "count": len(scenes),
        "instrument": "MRO Compact Reconnaissance Imaging Spectrometer (CRISM)",
        "authority": "NASA Planetary Data System (PDS) Geosciences Node",
    }


@router.get("/environment/surface-properties", summary="Get authentic thermophysical properties")
def get_surface_properties() -> dict[str, Any]:
    """Return thermophysical properties: thermal inertia, albedo, and dust cover."""
    return {
        "study_area": "Jezero Crater Region (18.4°N, 77.4°E)",
        "thermal_inertia": {
            "value_tiu": 320.0,
            "units": "J m^-2 K^-1 s^-1/2 (TIU)",
            "source": "MGS TES & Mars Odyssey THEMIS (Putzig et al., 2005)",
            "interpretation": "Moderately indurated duricrust, pebble-lag, and bedrock exposures",
            "epistemic_class": "DERIVED",
        },
        "bolometric_albedo": {
            "value": 0.215,
            "units": "dimensionless [0, 1]",
            "source": "MGS TES Solar Band Albedo (Christensen et al., 2001)",
            "interpretation": "Intermediate albedo: dark basaltic sand intermixed with light dust",
            "epistemic_class": "DERIVED",
        },
        "dust_cover_index": {
            "dci_score": 0.962,
            "classification": "Low Dust Accumulation (Active wind scour and aeolian stripping)",
            "source": "Ruff & Christensen (2002) TES Dust Cover Index",
            "epistemic_class": "DERIVED",
        },
        "diurnal_temperature_model": {
            "solar_longitude_deg": 180.0,
            "min_night_temp_k": 185.0,
            "max_day_temp_k": 268.0,
            "mean_temp_k": 218.0,
            "epistemic_class": "SIMULATED",
            "disclaimer": "Thermophysical 1D model placeholder; not live in-situ meteorology.",
        },
    }


@router.get(
    "/catalogue",
    summary="Get complete Mars Planetary Atlas catalogue with filtering, sorting and pagination",
)
def get_atlas_catalogue(
    query: str | None = Query(
        None, description="Free-text search query across title, mission, product id, tags"
    ),
    category: str | None = Query(None, description="Filter by one of the 11 Atlas categories"),
    epistemic_class: str | None = Query(
        None,
        description="Filter by epistemic class (e.g. OBSERVED, DERIVED, INTERPRETED)",
    ),
    product_type: str | None = Query(
        None, description="Filter by product type: SRC, DRV, VEC, INT, SIM"
    ),
    validation_status: str | None = Query(None, description="Filter by validation status"),
    status: str | None = Query(
        None, description="Filter by processing status (e.g. Ingested, Catalogued)"
    ),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    sort_by: str = Query(
        "id",
        description="Sort by: id, canonical_id, name, resolution, category, epistemic_class",
    ),
    sort_order: str = Query("asc", description="Sort order: asc or desc"),
) -> dict[str, Any]:
    """Retrieve catalogued planetary maps organized into 11 official atlas categories."""
    filtered_entries = search_atlas_entries(
        query=query,
        category=category,
        epistemic_class=epistemic_class,
        product_type=product_type,
        validation_status=validation_status,
        status=status,
    )
    all_entries = get_all_atlas_entries()

    # Calculate live category counts across all entries
    category_counts: dict[str, int] = {}
    for entry in all_entries:
        cat_key = entry.category.value
        category_counts[cat_key] = category_counts.get(cat_key, 0) + 1

    categories_summary = [
        {
            "id": cat.value,
            "title": CATEGORY_METADATA[cat]["title"],
            "description": CATEGORY_METADATA[cat]["description"],
            "icon": CATEGORY_METADATA[cat]["icon"],
            "count": category_counts.get(cat.value, 0),
        }
        for cat in AtlasCategory
    ]

    # Sorting
    reverse = sort_order.lower() == "desc"
    if sort_by == "name":
        filtered_entries.sort(key=lambda x: x.name.lower(), reverse=reverse)
    elif sort_by in ("canonical_id", "product_id"):
        filtered_entries.sort(key=lambda x: x.canonical_id.lower(), reverse=reverse)
    elif sort_by == "category":
        filtered_entries.sort(key=lambda x: x.category.value, reverse=reverse)
    elif sort_by == "epistemic_class":
        filtered_entries.sort(key=lambda x: x.epistemic_class, reverse=reverse)
    elif sort_by == "product_type":
        filtered_entries.sort(key=lambda x: x.product_type.value, reverse=reverse)
    elif sort_by in ("resolution", "original_spatial_resolution"):
        filtered_entries.sort(key=lambda x: x.original_spatial_resolution.lower(), reverse=reverse)
    else:
        filtered_entries.sort(key=lambda x: x.id.lower(), reverse=reverse)

    # Pagination
    total_matching = len(filtered_entries)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_slice = filtered_entries[start_idx:end_idx]
    total_pages = math.ceil(total_matching / page_size) if total_matching > 0 else 1

    return {
        "total_count": len(all_entries),
        "filtered_count": total_matching,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "entries": [e.to_dict() for e in paginated_slice],
        "categories": categories_summary,
        "active_filters": {
            "query": query,
            "category": category,
            "epistemic_class": epistemic_class,
            "product_type": product_type,
            "validation_status": validation_status,
            "status": status,
            "sort_by": sort_by,
            "sort_order": sort_order,
            "page": page,
            "page_size": page_size,
        },
        "disclaimer": (
            "Marswalk Planner is a research and educational decision-support prototype. "
            "Not certified for mission operations or astronaut life support."
        ),
    }


@router.get("/categories", summary="Get all 11 Atlas categories and descriptive metadata")
def get_atlas_categories() -> dict[str, Any]:
    """Return list of all 11 planetary atlas categories with descriptive metadata and counts."""
    all_entries = get_all_atlas_entries()
    category_counts: dict[str, int] = {}
    for entry in all_entries:
        cat_key = entry.category.value
        category_counts[cat_key] = category_counts.get(cat_key, 0) + 1

    return {
        "categories": [
            {
                "id": cat.value,
                "title": CATEGORY_METADATA[cat]["title"],
                "description": CATEGORY_METADATA[cat]["description"],
                "icon": CATEGORY_METADATA[cat]["icon"],
                "count": category_counts.get(cat.value, 0),
            }
            for cat in AtlasCategory
        ],
        "total_categories": len(AtlasCategory),
    }


@router.get("/maps/{map_id}", summary="Get detailed dossier for an individual planetary map")
def get_map_details(map_id: str) -> dict[str, Any]:
    """Return complete geodetic metadata, processing parameters, and citations for a map entry."""
    entry = get_atlas_entry_by_id(map_id)
    if entry is None:
        raise HTTPException(
            status_code=404, detail=f"Planetary map entry '{map_id}' not found in atlas"
        )
    return entry.to_dict()


# -----------------------------------------------------------------------------
# REGIONAL JEZERO CRATER ATLAS ENDPOINTS (MILESTONE 2.2)
# -----------------------------------------------------------------------------


class ElevationProfileRequest(BaseModel):
    """Payload for topographic elevation cross-section transect query."""

    start_lat: float = Field(
        ..., ge=-90.0, le=90.0, description="Start latitude in planetocentric deg"
    )
    start_lon: float = Field(..., description="Start east-positive longitude in deg")
    end_lat: float = Field(..., ge=-90.0, le=90.0, description="End latitude in planetocentric deg")
    end_lon: float = Field(..., description="End east-positive longitude in deg")
    num_points: int = Field(
        100, ge=2, le=500, description="Number of sample points along the transect"
    )


@router.get(
    "/regional/jezero/study-area",
    summary="Get Jezero Crater regional study area bounds and parameters",
)
def get_jezero_study_area() -> dict[str, Any]:
    """Return authentic regional bounds, dimensions, datum, and primary scientific facies."""
    return get_regional_study_area()


@router.get(
    "/regional/jezero/categories",
    summary="Get 8 standardized regional layer categories with counts",
)
def get_jezero_regional_categories() -> dict[str, Any]:
    """Return the 8 standardized regional categories with product counts."""
    categories = get_regional_categories()
    layers = get_all_regional_layers()
    counts: dict[str, int] = {}
    for layer in layers:
        cat_id = layer["category"]
        counts[cat_id] = counts.get(cat_id, 0) + 1

    return {
        "categories": [
            {
                "id": cat["id"],
                "name": cat["name"],
                "description": cat["description"],
                "icon": cat["icon"],
                "count": counts.get(cat["id"], 0),
            }
            for cat in categories
        ],
        "total_categories": len(categories),
        "total_layers": len(layers),
    }


@router.get(
    "/regional/jezero/layers",
    summary="Get all available regional layers across the 8 categories",
)
def get_jezero_regional_layers(
    category: str | None = Query(None, description="Optional category filter"),
) -> dict[str, Any]:
    """Return all available regional layers with footprints and epistemic classes."""
    layers = get_all_regional_layers()
    if category and category.lower() != "all":
        layers = [layer for layer in layers if layer["category"].lower() == category.lower()]

    return {
        "study_area": "reg-jezero-crater",
        "count": len(layers),
        "layers": layers,
    }


@router.get(
    "/regional/jezero/geology",
    summary="Get authentic USGS SIM-3464 geological units and formations",
)
def get_jezero_regional_geology() -> dict[str, Any]:
    """Return peer-reviewed geological units from Sun & Stack (2020) with boundaries."""
    units = get_jezero_geology()
    return {
        "authority": "USGS Scientific Investigations Map 3464 (Sun & Stack, 2020)",
        "scale": "1:75,000",
        "epistemic_class": "INTERPRETED",
        "count": len(units),
        "units": [u.to_dict() for u in units],
    }


@router.get(
    "/regional/jezero/geology/{unit_symbol}",
    summary="Get individual USGS SIM-3464 geological unit by symbol",
)
def get_jezero_geology_unit(unit_symbol: str) -> dict[str, Any]:
    """Return specific stratigraphic unit details, lithology, and core samples.

    Accepts canonical USGS SIM-3464 symbols (e.g. NHjf1, NHjf2, Cf-f-1, Cf-fr, cr, fl)
    or legacy alias codes (e.g. Nld, Nldb, Ncf, Nff, Ncr, Nch).
    """
    sym_clean = unit_symbol.strip().lower()
    units = get_jezero_geology()
    for u in units:
        if (
            u.symbol.lower() == sym_clean
            or u.official_sim3464_symbol.lower() == sym_clean
            or any(a.lower() == sym_clean for a in u.alias_symbols)
        ):
            return u.to_dict()
    raise HTTPException(status_code=404, detail=f"Geological unit '{unit_symbol}' not found")


@router.get(
    "/regional/jezero/crism",
    summary="Get authentic MRO CRISM targeted observations and spectral indices",
)
def get_jezero_crism_data() -> dict[str, Any]:
    """Return authentic CRISM targeted observation footprints and spectral parameters."""
    obs = get_jezero_crism_observations()
    indices = get_all_crism_indices()
    return {
        "instrument": "MRO Compact Reconnaissance Imaging Spectrometer for Mars (CRISM)",
        "observations_count": len(obs),
        "observations": [o.to_dict() for o in obs],
        "spectral_indices": [i.to_dict() for i in indices],
        "epistemic_class": "OBSERVED",
        "notes": (
            "Spectral parameters identify key aqueous absorption bands. Abiotic alteration "
            "does not infer or confirm past extraterrestrial biology."
        ),
    }


@router.get(
    "/regional/jezero/rover/traverse",
    summary="Get authentic sol-filtered Perseverance rover traverse",
)
def get_jezero_rover_traverse(
    sol_min: int = Query(0, ge=0, description="Minimum sol number"),
    sol_max: int = Query(9999, ge=0, description="Maximum sol number"),
    limit: int = Query(500, ge=1, le=2000, description="Maximum number of segments to return"),
) -> dict[str, Any]:
    """Return sol-filtered GeoJSON FeatureCollection of historical rover traverse."""
    return query_rover_traverse(sol_min=sol_min, sol_max=sol_max, limit=limit)


@router.get(
    "/regional/jezero/rover/waypoints",
    summary="Get authentic sol-filtered Perseverance rover waypoints",
)
def get_jezero_rover_waypoints(
    sol_min: int = Query(0, ge=0, description="Minimum sol number"),
    sol_max: int = Query(9999, ge=0, description="Maximum sol number"),
    limit: int = Query(200, ge=1, le=1000, description="Maximum number of waypoints to return"),
) -> dict[str, Any]:
    """Return sol-filtered GeoJSON FeatureCollection of rover localization waypoints."""
    return query_rover_waypoints(sol_min=sol_min, sol_max=sol_max, limit=limit)


@router.get(
    "/regional/jezero/rover/samples",
    summary="Get authentic Perseverance sample cores and Three Forks depot records",
)
def get_jezero_rover_samples() -> dict[str, Any]:
    """Return authentic sample core records, rock lithologies, and cache locations."""
    samples = get_perseverance_sample_records()
    return {
        "mission": "Mars 2020 Perseverance Rover",
        "count": len(samples),
        "samples": [s.to_dict() for s in samples],
        "depot_name": "Three Forks Sample Depot",
        "epistemic_class": "INTERPRETED",
    }


@router.get(
    "/regional/jezero/elevation-sample",
    summary="Sample multi-scale elevation within Jezero regional context",
)
def get_jezero_elevation_sample(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Planetocentric latitude in degrees"),
    lon: float = Query(..., description="East-positive longitude in degrees"),
) -> dict[str, Any]:
    """Sample authentic elevation with dynamic resolution and coverage tier disclosures."""
    return sample_multiscale_elevation(lat, lon)


@router.post(
    "/regional/jezero/elevation-profile",
    summary="Generate topographic elevation cross-section profile along linear transect",
)
def post_elevation_profile(req: ElevationProfileRequest) -> dict[str, Any]:
    """Compute elevation transect cross-section, slopes, ascent, descent, and relief."""
    return generate_elevation_profile(
        start_lat=req.start_lat,
        start_lon=req.start_lon,
        end_lat=req.end_lat,
        end_lon=req.end_lon,
        num_points=req.num_points,
    )


@router.get(
    "/regional/jezero/compare",
    summary="Evaluate comparison feasibility and spatial overlap between two layers",
)
def get_layer_comparison(
    layer_a: str = Query(..., description="Identifier of first layer"),
    layer_b: str = Query(..., description="Identifier of second layer"),
) -> dict[str, Any]:
    """Validate spatial overlap, resolution ratio, and comparison feasibility."""
    res = compare_regional_layers(layer_a, layer_b)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res
