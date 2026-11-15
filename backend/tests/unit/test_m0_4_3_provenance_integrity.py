"""Unit and API integrity tests for M0.4.3 Science, Geology & Data Hub provenance."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.catalog.atlas_catalog import ATLAS_CATALOGUE
from app.catalog.datasets import get_all_datasets, get_dataset_by_id
from app.core.epistemic import EpistemicClass
from app.main import app

client = TestClient(app)


def test_cv_candidates_disclose_synthetic_demo_origin():
    """GET /api/v1/terrain/cv/candidates must explicitly disclose its synthetic demo window."""
    response = client.get("/api/v1/terrain/cv/candidates?limit=5")
    assert response.status_code == 200
    payload = response.json()

    assert payload["epistemic_class"] == "HEURISTIC"
    assert payload["data_origin"] == "SYNTHETIC_DEMO_WINDOW"
    assert payload["is_synthetic_input"] is True
    assert payload["source_imagery"] is None
    assert "synthetic" in payload["disclosure"].lower()
    assert "hirise" in payload["disclosure"].lower()


def test_catalog_datasets_ingestion_and_provenance_honesty():
    """Verify catalog dossiers separate local raw files from metadata/simulated items."""
    response = client.get("/api/v1/catalog/datasets")
    assert response.status_code == 200
    records = {item["id"]: item for item in response.json()}

    assert len(records) == 10

    # Locally stored files in data/raw/
    for local_id in ("product-01", "product-03", "product-04", "product-06"):
        assert records[local_id]["isIngested"] is True
        assert records[local_id]["storageCategory"] == "LOCAL_RAW"

    # Corrected DOI for CTX Controlled Orthoimage Mosaic (docs/data_sources.md)
    assert records["product-04"]["doiOrUrn"] == "10.5066/P9GV1ND3"

    # Metadata/model dossiers must not falsely report local ingestion or nonexistent HiRISE proxy
    assert records["product-02"]["isIngested"] is False
    assert records["product-02"]["storageCategory"] == "STATIC_METADATA"
    assert records["product-02"]["supportsLayers"] == []

    for meta_id in ("product-05", "product-07", "product-08", "product-09"):
        assert records[meta_id]["isIngested"] is False
        assert records[meta_id]["storageCategory"] == "STATIC_METADATA"

    # Un-ingested CRISM metadata summaries carry INTERPRETED rather than OBSERVED
    assert records["product-07"]["epistemicClass"] == "INTERPRETED"

    # MCD v6.1 Jezero Regional Model must restrict supportsRegions to reg-jezero
    assert records["product-10"]["isIngested"] is False
    assert records["product-10"]["storageCategory"] == "MODEL_SIMULATED"
    assert records["product-10"]["epistemicClass"] == "SIMULATED"
    assert records["product-10"]["supportsRegions"] == ["reg-jezero"]

    #Verify product-06 global MOLA retains all-region compatibility
    assert records["product-06"]["supportsRegions"] == ["all"]

    # Verify helper lookup mirrors endpoint metadata
    assert get_dataset_by_id("product-04") is not None
    assert get_dataset_by_id("10.5066/P9GV1ND3") is not None
    assert len(get_all_datasets()) == 10


def test_science_and_geology_endpoints_preserve_epistemic_contracts():
    """Verify science targets, CRISM summaries, USGS SIM-3464, and SIM-3292 units."""
    targets_res = client.get("/api/v1/science/targets")
    assert targets_res.status_code == 200
    targets_body = targets_res.json()
    assert len(targets_body["features"]) >= 1
    assert targets_body["features"][0]["properties"]["epistemic_class"] == "INTERPRETED"

    scenes_res = client.get("/api/v1/atlas/geology/crism-scenes")
    assert scenes_res.status_code == 200
    assert len(scenes_res.json()["scenes"]) >= 1
    assert all(s["epistemic_class"] == "INTERPRETED" for s in scenes_res.json()["scenes"])

    indices_res = client.get("/api/v1/atlas/geology/crism-indices")
    assert indices_res.status_code == 200
    assert len(indices_res.json()["indices"]) >= 1
    assert all(i["epistemic_class"] == "INTERPRETED" for i in indices_res.json()["indices"])

    units_res = client.get("/api/v1/atlas/geology/units")
    assert units_res.status_code == 200
    assert all(u["epistemic_class"] == "INTERPRETED" for u in units_res.json()["units"])

    global_geo_res = client.get("/api/v1/atlas/global/geology")
    assert global_geo_res.status_code == 200
    assert len(global_geo_res.json()["units"]) >= 1


def test_m0_4_3_2_epistemic_enum_and_atlas_scope_contracts():
    """Verify dust climatology uses canonical EpistemicClass, PLN-DRV-02 dims, and Atlas scopes."""
    valid_epistemic = {member.value for member in EpistemicClass}

    dust_res = client.get("/api/v1/environmental/dust-climatology")
    assert dust_res.status_code == 200
    dust_body = dust_res.json()
    assert dust_body["epistemic_class"] == EpistemicClass.SIMULATED.value
    assert dust_body["epistemic_class"] in valid_epistemic
    assert dust_body["data_origin"] == "CLIMATE_MODELED"

    # Every dataset and Atlas entry must emit a canonical EpistemicClass
    ds_res = client.get("/api/v1/catalog/datasets")
    assert ds_res.status_code == 200
    for rec in ds_res.json():
        assert rec["epistemicClass"] in valid_epistemic

    atlas_res = client.get("/api/v1/atlas/catalogue?page_size=100")
    assert atlas_res.status_code == 200
    entries = atlas_res.json()["entries"]
    assert len(entries) == len(ATLAS_CATALOGUE)
    by_id = {e["canonical_id"]: e for e in entries}
    for entry in entries:
        assert entry["epistemic_class"] in valid_epistemic
        assert isinstance(entry["supports_regions"], list)
        assert len(entry["supports_regions"]) >= 1

    assert by_id["PLN-SRC-01"]["supports_regions"] == ["all"]
    assert by_id["PLN-DRV-02"]["supports_regions"] == ["reg-jezero"]
    assert "586 x 362 cells" in by_id["PLN-DRV-02"]["processing_resolution"]
    assert "742 x 1002" not in by_id["PLN-DRV-02"]["processing_resolution"]
    assert by_id["PLN-SRC-08"]["epistemic_class"] == "DERIVED"

    # Clarification 6: backwards compatibility keys preserved on Atlas & dust climatology endpoints
    for required_key in (
        "canonical_id",
        "name",
        "category",
        "product_type",
        "validation_status",
        "epistemic_class",
        "supports_regions",
    ):
        assert required_key in by_id["PLN-SRC-01"]
    assert "cycle_points" in dust_body
    assert len(dust_body["cycle_points"]) >= 1
    assert dust_body["storm_season_range_ls"] == [180.0, 330.0]

    # Clarification 2: Core catalog MOLA raw file & Perseverance raw traverse disk path
    mola = get_dataset_by_id("product-06")
    assert mola is not None
    assert mola.storage_category == "LOCAL_RAW"
    assert mola.is_ingested is True
    assert "data/raw/mola/megt90n000cb.img" in mola.availability_status

    meda = get_dataset_by_id("product-09")
    assert meda is not None
    assert meda.storage_category == "STATIC_METADATA"
    assert meda.is_ingested is False

    repo_root = Path(__file__).resolve().parents[3]
    assert (repo_root / "data" / "raw" / "perseverance" / "M20_traverse.json").is_file()
    assert (repo_root / "data" / "raw" / "perseverance" / "M20_waypoints.json").is_file()
    assert not (repo_root / "data" / "processed" / "mars2020_traverse").exists()


def test_m0_4_3_3_new_06_metadata_and_local_uri_reconciliation():
    """Verify NEW-06A/B/C/D metadata alignment and absence of broken file:/// URIs."""
    repo_root = Path(__file__).resolve().parents[3]

    ds_res = client.get("/api/v1/catalog/datasets")
    assert ds_res.status_code == 200
    datasets = {item["id"]: item for item in ds_res.json()}

    atlas_res = client.get("/api/v1/atlas/catalogue?page_size=100")
    assert atlas_res.status_code == 200
    atlas_by_id = {item["canonical_id"]: item for item in atlas_res.json()["entries"]}

    # 6A: MOLA local file resolution (4 pixels/degree, 14.818 km/pixel) matches megt90n000cb.lbl
    assert "4 pixels/degree" in datasets["product-06"]["resolution"]
    assert "14.818 km/pixel" in datasets["product-06"]["resolution"]
    assert "4 pixels/degree" in atlas_by_id["PLN-SRC-01"]["original_spatial_resolution"]
    assert "14.818 km/pixel" in atlas_by_id["PLN-SRC-01"]["original_spatial_resolution"]
    assert "720 x 1440" in atlas_by_id["PLN-SRC-01"]["processing_resolution"]

    # 6B: USGS SIM-3464 published 1:75,000 scale (not 1:5,000)
    assert "1:75,000" in datasets["product-08"]["resolution"]
    assert "1:5,000" not in datasets["product-08"]["resolution"]

    # 6C: Stereo photogrammetric DTMs are DERIVED across both catalogues; ortho/MOLA are OBSERVED
    assert datasets["product-01"]["epistemicClass"] == "DERIVED"
    assert datasets["product-03"]["epistemicClass"] == "DERIVED"
    assert datasets["product-05"]["epistemicClass"] == "DERIVED"
    assert datasets["product-02"]["epistemicClass"] == "OBSERVED"
    assert datasets["product-04"]["epistemicClass"] == "OBSERVED"
    assert datasets["product-06"]["epistemicClass"] == "OBSERVED"
    assert atlas_by_id["PLN-SRC-08"]["epistemic_class"] == datasets["product-01"]["epistemicClass"]
    assert atlas_by_id["PLN-SRC-06"]["epistemic_class"] == datasets["product-03"]["epistemicClass"]
    assert atlas_by_id["PLN-SRC-07"]["epistemic_class"] == datasets["product-05"]["epistemicClass"]

    # 6D: PLN-DRV-04 does not point to a nonexistent file:///data/processed/*.tif URI,
    # and every file:/// URI in ATLAS_CATALOGUE resolves to an existing file on disk.
    drv04 = atlas_by_id["PLN-DRV-04"]
    assert drv04["validation_status"] == "CATALOGUED"
    assert "jezero_western_delta_20m_aspect_deg.tif" not in drv04["doi_or_url"]
    for entry in ATLAS_CATALOGUE:
        if entry.doi_or_url.startswith("file:///"):
            rel_path = entry.doi_or_url[len("file:///") :]
            assert (repo_root / rel_path).is_file(), (
                f"{entry.canonical_id} points to missing local path: {entry.doi_or_url}"
            )


def test_m0_4_3_4_targeted_audit_remediation():
    """Verify AUD-03-A, AUD-06-A, and AUD-06-D remediation contracts."""
    from app.catalog.region_registry import get_all_regions

    # AUD-06-D: No fake file:///docs/ markdown URIs, and non-renderable
    # products have layer_id = None
    atlas_res = client.get("/api/v1/atlas/catalogue?page_size=100")
    assert atlas_res.status_code == 200
    atlas_by_id = {item["canonical_id"]: item for item in atlas_res.json()["entries"]}

    assert atlas_by_id["PLN-DRV-04"]["layer_id"] is None
    assert atlas_by_id["PLN-DRV-04"]["doi_or_url"] == "https://doi.org/10.1109/PROC.1981.11918"

    assert atlas_by_id["PLN-VEC-03"]["layer_id"] is None
    assert atlas_by_id["PLN-VEC-03"]["doi_or_url"] == "https://doi.org/10.3133/sim3464"

    assert atlas_by_id["PLN-SIM-01"]["layer_id"] is None
    assert atlas_by_id["PLN-SIM-01"]["doi_or_url"] == "http://www-mars.lmd.jussieu.fr/"

    assert atlas_by_id["PLN-SIM-02"]["layer_id"] is None
    assert atlas_by_id["PLN-SIM-02"]["doi_or_url"] == "https://github.com/vridhivazirani/marswalk-planner/tree/main/backend/app/routing"

    for entry in ATLAS_CATALOGUE:
        assert not entry.doi_or_url.startswith("file:///docs/"), (
            f"{entry.canonical_id} still has fake doc URI: {entry.doi_or_url}"
        )

    # AUD-06-A: Reconciled MOLA resolution in regional registry and scale tier
    profiles = get_all_regions()
    for profile in profiles:
        for ds in profile.available_datasets:
            assert "46.3 km/px" not in ds.resolution
            if ds.product_id == "PLN-SRC-01" and profile.id != "reg-jezero":
                assert ds.resolution == "14.818 km/px (4 ppd)"

    scale_tier_res = client.get("/api/v1/atlas/global/coverage?lat=18.4&lon=77.4")
    assert scale_tier_res.status_code == 200
    tiers = scale_tier_res.json()["available_tiers"]
    global_tier = next(t for t in tiers if t["scale_tier"] == "GLOBAL")
    assert "14.818 km/px local 4 ppd baseline" in global_tier["resolution"]

    # AUD-03-A: Emergency endpoint rejects out-of-bounds coordinates with HTTP 400
    out_of_bounds_req = {
        "start_lat": -4.6,  # Gale Crater coordinates
        "start_lon": 137.4,
        "dest_lat": 18.38,
        "dest_lon": 77.58,
    }
    sim_res = client.post("/api/v1/emergency/simulate", json=out_of_bounds_req)
    assert sim_res.status_code == 400
    assert "outside" in sim_res.json()["detail"].lower()

    abort_req = {
        "start_lat": 18.4446,
        "start_lon": 77.4509,
        "crew_lat": -4.6,  # Gale Crater coordinates
        "crew_lon": 137.4,
    }
    abort_res = client.post("/api/v1/emergency/abort-to-base", json=abort_req)
    assert abort_res.status_code == 400
    assert "outside" in abort_res.json()["detail"].lower()



