"""FastAPI router for Planetary Dataset Catalog."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.catalog.datasets import get_all_datasets, get_dataset_by_id

router = APIRouter(prefix="/catalog", tags=["planetary-catalog"])


@router.get("/datasets", summary="Get all authentic archived planetary dataset dossiers")
def list_datasets() -> list[dict[str, Any]]:
    """Return verified planetary data products from NASA PDS, USGS, ESA, and LMD."""
    return [d.to_dict() for d in get_all_datasets()]


@router.get("/datasets/{product_id}", summary="Get specific planetary dataset dossier")
def get_dataset(product_id: str) -> dict[str, Any]:
    """Retrieve detailed dataset dossier by product ID or DOI."""
    ds = get_dataset_by_id(product_id)
    if ds is None:
        raise HTTPException(
            status_code=404,
            detail=f"Planetary dataset product '{product_id}' not found in catalog.",
        )
    return ds.to_dict()
