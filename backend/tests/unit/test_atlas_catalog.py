"""Unit and API tests for the Mars Planetary Exploration Atlas catalogue (Phase 1).

Verifies:
1. All 11 planetary map categories are properly defined and populated.
2. Every catalogued entry contains required geodetic, resolution, and provenance metadata.
3. Epistemic classifications strictly conform to approved classes.
4. Atlas catalogue endpoints (/catalogue, /categories, /maps/{id}) function with correct filtering.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.catalog.atlas_catalog import (
    ATLAS_CATALOGUE,
    CATEGORY_METADATA,
    AtlasCategory,
    get_all_atlas_entries,
    get_entries_by_category,
    search_atlas_entries,
)
from app.core.epistemic import EpistemicClass
from app.main import app

client = TestClient(app)


def test_atlas_11_categories_defined():
    """Verify all 11 mandated planetary map categories are registered with metadata."""
    assert len(AtlasCategory) == 11
    assert len(CATEGORY_METADATA) == 11

    required_categories = {
        "global_mars",
        "regional_mars",
        "high_res_local",
        "elevation_topography",
        "terrain_analysis",
        "geological",
        "mineralogical",
        "surface_properties",
        "hazards",
        "rover_exploration",
        "mission_planning",
    }
    registered_categories = {cat.value for cat in AtlasCategory}
    assert registered_categories == required_categories


def test_every_category_has_entries():
    """Verify each of the 11 categories contains authentic catalogued map products."""
    all_entries = get_all_atlas_entries()
    assert len(all_entries) >= 20

    for cat in AtlasCategory:
        entries = get_entries_by_category(cat)
        assert len(entries) >= 1, f"Category '{cat.value}' has no catalogued entries"


def test_entry_required_metadata_completeness():
    """Verify every entry has complete geodetic, resolution, instrument, and epistemic metadata."""
    valid_epistemic = {e.value for e in EpistemicClass}

    for entry in ATLAS_CATALOGUE:
        assert entry.id.startswith("atlas-"), f"Entry ID {entry.id} invalid format"
        assert len(entry.name) > 5
        assert len(entry.instrument_mission) > 2
        assert len(entry.resolution) > 2
        assert len(entry.coverage) > 5
        assert len(entry.coverage_bounds) == 2
        assert len(entry.crs) > 2
        assert len(entry.native_crs) > 2
        assert len(entry.processing_crs) > 2
        assert len(entry.display_crs) > 2
        assert len(entry.vertical_datum) > 1
        assert len(entry.source) > 3
        assert len(entry.processing_status) > 3
        assert len(entry.observation_date) > 2
        assert entry.epistemic_class in valid_epistemic
        assert len(entry.description) > 15
        assert len(entry.caveats_limitations) > 10
        assert len(entry.doi_or_url) > 5


def test_atlas_search_and_filters():
    """Verify search by keyword, category, and epistemic class."""
    # Free text search
    mola_results = search_atlas_entries(query="MOLA")
    assert len(mola_results) >= 2
    assert all(
        "mola" in e.name.lower() or "mola" in e.instrument_mission.lower() for e in mola_results
    )

    # Category filter
    geol_results = search_atlas_entries(category="geological")
    assert len(geol_results) >= 1
    assert all(e.category == AtlasCategory.GEOLOGICAL for e in geol_results)

    # Epistemic filter
    observed_results = search_atlas_entries(epistemic_class="OBSERVED")
    assert len(observed_results) >= 5
    assert all(e.epistemic_class == "OBSERVED" for e in observed_results)


def test_api_atlas_catalogue_endpoint():
    """Verify GET /api/v1/atlas/catalogue returns expected response structure."""
    res = client.get("/api/v1/atlas/catalogue")
    assert res.status_code == 200
    data = res.json()

    assert "total_count" in data
    assert "filtered_count" in data
    assert "entries" in data
    assert "categories" in data
    assert data["total_count"] == len(ATLAS_CATALOGUE)
    assert len(data["categories"]) == 11

    # Verify query filter param
    res_filtered = client.get("/api/v1/atlas/catalogue?category=hazards")
    assert res_filtered.status_code == 200
    data_filtered = res_filtered.json()
    assert data_filtered["filtered_count"] >= 3
    assert all(e["category"] == "hazards" for e in data_filtered["entries"])


def test_api_atlas_categories_endpoint():
    """Verify GET /api/v1/atlas/categories lists 11 categories with metadata."""
    res = client.get("/api/v1/atlas/categories")
    assert res.status_code == 200
    data = res.json()

    assert data["total_categories"] == 11
    assert len(data["categories"]) == 11
    sample = data["categories"][0]
    assert "id" in sample
    assert "title" in sample
    assert "description" in sample
    assert "count" in sample


def test_api_atlas_map_detail_endpoint():
    """Verify GET /api/v1/atlas/maps/{map_id} returns detail or 404."""
    # Valid entry
    res = client.get("/api/v1/atlas/maps/atlas-global-01")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "atlas-global-01"
    assert "MOLA" in data["name"]
    assert data["epistemic_class"] == "OBSERVED"

    # Non-existent entry
    res_missing = client.get("/api/v1/atlas/maps/non-existent-product-id")
    assert res_missing.status_code == 404


def test_api_global_basemaps_endpoint():
    """Verify GET /api/v1/atlas/global/basemaps returns authentic planetary WMS/WMTS configs."""
    res = client.get("/api/v1/atlas/global/basemaps")
    assert res.status_code == 200
    data = res.json()
    assert "basemaps" in data
    assert data["count"] >= 5
    assert "IAU_2015:49900" in data["crs"]
    mola_bw = next((b for b in data["basemaps"] if b["id"] == "mola_shaded_relief"), None)
    assert mola_bw is not None
    assert "planetarymaps.usgs.gov" in mola_bw["wms_url"]


def test_api_global_features_endpoint():
    """Verify GET /api/v1/atlas/global/features returns authentic IAU planetary features."""
    res = client.get("/api/v1/atlas/global/features")
    assert res.status_code == 200
    data = res.json()
    assert "features" in data
    assert data["count"] >= 10
    olympus = next((f for f in data["features"] if f["name"] == "Olympus Mons"), None)
    assert olympus is not None
    assert olympus["elevation_areoid_m"] > 20000
    assert "Mons" in olympus["feature_type"]

    # Verify search for key features requested in Milestone 3.0
    for query in ["Tharsis", "Arcadia", "Elysium", "North Polar", "South Polar"]:
        res_search = client.get(f"/api/v1/atlas/global/features?search={query}")
        assert res_search.status_code == 200
        search_data = res_search.json()
        assert len(search_data["features"]) >= 1, f"Search failed for {query}"


def test_api_global_textures_endpoint():
    """Verify GET /api/v1/atlas/global/texture/{type}.png returns valid PNG images for 3D globe."""
    for tex_type in ["shaded_relief", "color_elevation", "blend"]:
        res = client.get(f"/api/v1/atlas/global/texture/{tex_type}.png")
        assert res.status_code == 200
        assert res.headers["content-type"] == "image/png"
        assert len(res.content) > 10000  # Valid PNG data


def test_api_global_landing_sites_endpoint():
    """Verify GET /api/v1/atlas/global/landing-sites returns historical Mars surface craft."""
    res = client.get("/api/v1/atlas/global/landing-sites")
    assert res.status_code == 200
    data = res.json()
    assert "landing_sites" in data
    assert data["count"] >= 10
    perseverance = next(
        (s for s in data["landing_sites"] if "Perseverance" in s["craft_name"]), None
    )
    assert perseverance is not None
    assert "Active" in perseverance["status"]
    assert "Jezero" in perseverance["target_region"]


def test_api_global_navigation_targets_endpoint():
    """Verify GET /api/v1/atlas/global/navigation-targets returns bounding boxes for navigation."""
    res = client.get("/api/v1/atlas/global/navigation-targets")
    assert res.status_code == 200
    data = res.json()
    assert "targets" in data
    jezero = next((t for t in data["targets"] if t["id"] == "nav-jezero-delta"), None)
    assert jezero is not None
    assert "bounds" in jezero
    assert "lat" in jezero
    assert "lon" in jezero


def test_api_jezero_regional_footprints_endpoint():
    """Verify GET /api/v1/atlas/regional/jezero/footprints returns footprints & geology."""
    res = client.get("/api/v1/atlas/regional/jezero/footprints")
    assert res.status_code == 200
    data = res.json()
    assert "layers" in data
    assert "hirise_1m" in data["layers"]
    assert "ctx_20m" in data["layers"]
    assert "analysis_grid" in data["layers"]

    hirise = data["layers"]["hirise_1m"]
    assert hirise["resolution"] == "1.0 m/pixel"
    assert hirise["epistemic_class"] == "DERIVED"  # Photogrammetrically derived DTM

    ctx = data["layers"]["ctx_20m"]
    assert ctx["resolution"] == "20.0 m/pixel"
    assert ctx["bounds"][0][0] < hirise["bounds"][0][0]  # CTX extends further south

    assert "geological_context" in data
    assert len(data["geological_context"]) >= 5
    delta = next((g for g in data["geological_context"] if "Delta" in g["name"]), None)
    assert delta is not None


def test_api_geology_units_endpoint():
    """Verify GET /api/v1/atlas/geology/units returns authentic USGS SIM-3464 units."""
    res = client.get("/api/v1/atlas/geology/units")
    assert res.status_code == 200
    data = res.json()
    assert "units" in data
    assert data["count"] >= 5
    nld = next((u for u in data["units"] if u["symbol"] == "Nld"), None)
    assert nld is not None
    assert "Montdenier" in nld["sample_cores_collected"]
    assert "smectite" in " ".join(nld["key_minerals"]).lower()


def test_api_crism_indices_endpoint():
    """Verify GET /api/v1/atlas/geology/crism-indices returns authentic absorption bands."""
    res = client.get("/api/v1/atlas/geology/crism-indices")
    assert res.status_code == 200
    data = res.json()
    assert "indices" in data
    assert data["count"] >= 4
    d2300 = next((idx for idx in data["indices"] if idx["index_code"] == "D2300"), None)
    assert d2300 is not None
    assert d2300["wavelength_microns"] == 2.30


def test_api_surface_properties_endpoint():
    """Verify GET /api/v1/atlas/environment/surface-properties returns thermal inertia & albedo."""
    res = client.get("/api/v1/atlas/environment/surface-properties")
    assert res.status_code == 200
    data = res.json()
    assert "thermal_inertia" in data
    assert data["thermal_inertia"]["value_tiu"] == 320.0
    assert "bolometric_albedo" in data
    assert data["bolometric_albedo"]["value"] == 0.215
    assert "dust_cover_index" in data
    assert data["dust_cover_index"]["dci_score"] > 0.9
    assert data["diurnal_temperature_model"]["epistemic_class"] == "SIMULATED"


def test_milestone_1_metadata_field_completeness():
    """Verify all Milestone 1 mandated fields are present across every product."""
    res = client.get("/api/v1/atlas/catalogue?page_size=100")
    assert res.status_code == 200
    data = res.json()
    entries = data["entries"]
    assert len(entries) >= 35

    required_fields = [
        "id",
        "canonical_id",
        "name",
        "description",
        "category",
        "product_type",
        "epistemic_class",
        "mission_instrument",
        "source_organisation",
        "product_identifier",
        "doi_or_url",
        "original_spatial_resolution",
        "processing_resolution",
        "spatial_coverage",
        "crs",
        "native_crs",
        "processing_crs",
        "display_crs",
        "vertical_datum",
        "processing_history",
        "licence_attribution",
        "validation_status",
        "known_limitations",
    ]

    valid_product_types = {"SRC", "DRV", "VEC", "INT", "SIM"}
    for e in entries:
        for rf in required_fields:
            assert rf in e, f"Field '{rf}' missing from product {e.get('id')}"
            assert e[rf] is not None, f"Field '{rf}' is None in product {e['id']}"
        assert e["product_type"] in valid_product_types


def test_milestone_1_pagination_and_sorting():
    """Verify pagination and sorting parameters for GET /api/v1/atlas/catalogue."""
    # Page size 5
    res = client.get("/api/v1/atlas/catalogue?page=1&page_size=5&sort_by=name&sort_order=asc")
    assert res.status_code == 200
    data = res.json()
    assert data["page"] == 1
    assert data["page_size"] == 5
    assert len(data["entries"]) == 5
    assert data["total_pages"] >= 7
    names = [e["name"].lower() for e in data["entries"]]
    assert names == sorted(names)

    # Descending sort
    res_desc = client.get("/api/v1/atlas/catalogue?page=1&page_size=5&sort_by=name&sort_order=desc")
    assert res_desc.status_code == 200
    data_desc = res_desc.json()
    names_desc = [e["name"].lower() for e in data_desc["entries"]]
    assert names_desc == sorted(names_desc, reverse=True)


def test_milestone_1_product_type_filtering():
    """Verify filtering by product type: SRC, DRV, VEC, INT, SIM."""
    for pt in ["SRC", "DRV", "VEC", "INT", "SIM"]:
        res = client.get(f"/api/v1/atlas/catalogue?product_type={pt}&page_size=100")
        assert res.status_code == 200
        data = res.json()
        assert data["filtered_count"] >= 1
        assert all(e["product_type"] == pt for e in data["entries"])


def test_milestone_1_dual_id_lookup():
    """Verify GET /api/v1/atlas/maps/{map_id} works for both legacy atlas-* and canonical PLN-*."""
    # Legacy ID
    res1 = client.get("/api/v1/atlas/maps/atlas-global-01")
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["canonical_id"] == "PLN-SRC-01"

    # Canonical ID
    res2 = client.get("/api/v1/atlas/maps/PLN-SRC-01")
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["id"] == "atlas-global-01"
    assert d1["id"] == d2["id"]


def test_milestone_1_categories_product_counts():
    """Verify all 11 categories report realistic, non-zero counts summing to total products."""
    res = client.get("/api/v1/atlas/categories")
    assert res.status_code == 200
    data = res.json()
    assert data["total_categories"] == 11
    cats = data["categories"]
    assert len(cats) == 11
    total_sum = sum(c["count"] for c in cats)
    assert total_sum >= 35
    for c in cats:
        assert c["count"] >= 1, f"Category '{c['id']}' has 0 products"


def test_geodetic_crs_separation_and_vertical_datum():
    """Verify native, processing, and display CRS are separated and vertical datums are correct."""
    elevation_ids = {
        "PLN-SRC-01",  # MOLA MEGDR
        "PLN-SRC-06",  # CTX 20m DTM
        "PLN-SRC-07",  # HRSC DEM
        "PLN-SRC-08",  # HiRISE TRN DTM
        "PLN-DRV-02",  # Western Delta Elevation
        "PLN-VEC-01",  # 50m Contours
        "PLN-VEC-02",  # 10m Contours
        "PLN-VEC-04",  # Perseverance Traverse (includes z)
    }

    for entry in ATLAS_CATALOGUE:
        assert entry.native_crs, f"Entry {entry.id} missing native_crs"
        assert entry.processing_crs, f"Entry {entry.id} missing processing_crs"
        assert entry.display_crs, f"Entry {entry.id} missing display_crs"

        if entry.canonical_id in elevation_ids:
            assert "Areoid" in entry.vertical_datum, (
                f"Topographic product {entry.canonical_id} must reference Mars Areoid"
            )
        else:
            assert entry.vertical_datum == "NOT_APPLICABLE", (
                f"Non-topographic product {entry.canonical_id} must have "
                f"vertical_datum=NOT_APPLICABLE, got '{entry.vertical_datum}'"
            )


def test_api_global_layers_endpoints():
    """Verify GET /api/v1/atlas/global/layers and /global/layers/{layer_id}."""
    res = client.get("/api/v1/atlas/global/layers")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] >= 6
    assert "layers" in data
    assert any(layer["id"] == "viking_mdim21_bw" for layer in data["layers"])

    # Valid layer detail
    res_layer = client.get("/api/v1/atlas/global/layers/mola_shaded_relief")
    assert res_layer.status_code == 200
    assert res_layer.json()["wms_layers"] == "MOLA_bw"

    # Missing layer detail
    res_missing = client.get("/api/v1/atlas/global/layers/non_existent_layer")
    assert res_missing.status_code == 404


def test_api_global_features_search_and_filter():
    """Verify search and type filtering on GET /api/v1/atlas/global/features."""
    # Search by keyword
    res = client.get("/api/v1/atlas/global/features?search=olympus")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] >= 1
    assert "Olympus" in data["features"][0]["name"]

    # Filter by type
    res_type = client.get("/api/v1/atlas/global/features?feature_type=volcano")
    assert res_type.status_code == 200
    data_type = res_type.json()
    assert data_type["count"] >= 4
    assert all("Mons" in f["feature_type"] for f in data_type["features"])


def test_api_global_geology_endpoint():
    """Verify GET /api/v1/atlas/global/geology returns authentic USGS SIM-3292 units."""
    res = client.get("/api/v1/atlas/global/geology")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] >= 8
    assert data["epistemic_class"] == "INTERPRETED"
    assert "units" in data
    symbols = {u["symbol"] for u in data["units"]}
    assert "lAv" in symbols  # Late Amazonian volcanic
    assert "ABb" in symbols  # Vastitas Borealis


def test_api_global_elevation_sample_endpoint():
    """Verify GET /api/v1/atlas/global/elevation-sample returns authentic multi-scale readings."""
    # Global landmark (Olympus Mons)
    res_glo = client.get("/api/v1/atlas/global/elevation-sample?lat=18.65&lon=-133.80")
    assert res_glo.status_code == 200
    d_glo = res_glo.json()
    assert d_glo["scale_tier"] == "GLOBAL"
    assert d_glo["elevation_m"] > 19000.0

    # Local landmark (Jezero Delta 1m DTM)
    res_loc = client.get("/api/v1/atlas/global/elevation-sample?lat=18.4485&lon=77.4320")
    assert res_loc.status_code == 200
    d_loc = res_loc.json()
    assert d_loc["scale_tier"] == "LOCAL"
    assert d_loc["resolution_m"] == 1.0


def test_api_global_coverage_endpoint():
    """Verify GET /api/v1/atlas/global/coverage reports scale tier availability."""
    # Inside Jezero
    res_jez = client.get("/api/v1/atlas/global/coverage?lat=18.4485&lon=77.4320")
    assert res_jez.status_code == 200
    d_jez = res_jez.json()
    assert d_jez["active_tier"] == "LOCAL"
    assert d_jez["jezero_focus_available"] is True
    assert len(d_jez["available_tiers"]) == 3

    # Outside Jezero (e.g. Gale Crater)
    res_gale = client.get("/api/v1/atlas/global/coverage?lat=-5.37&lon=137.44")
    assert res_gale.status_code == 200
    d_gale = res_gale.json()
    assert d_gale["active_tier"] == "GLOBAL"
    assert d_gale["jezero_focus_available"] is False
