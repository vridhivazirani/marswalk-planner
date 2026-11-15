"""Vercel entrypoint for Marswalk FastAPI backend service."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Marswalk Planner API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DISCLAIMER = (
    "Marswalk Planner is a research and education prototype. "
    "It is not NASA software, is not endorsed or certified by NASA, "
    "and must not be used for operational astronaut-safety or mission decisions."
)

@app.get("/api/v1/health")
@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "marswalk-backend",
        "version": "0.1.0",
        "disclaimer": DISCLAIMER,
    }

@app.get("/api/v1/twin/layers")
@app.get("/twin/layers")
def layers():
    return {
        "study_area": {
            "name": "Jezero Western Fan & Delta Margin",
            "crs_geographic": "IAU_2015:49900",
            "crs_projected": "ESRI:103885",
            "center": [18.49066, 77.40477],
            "bounds": [[18.3918, 77.3437], [18.58953, 77.46584]],
            "grid_dimensions": {"width": 362, "height": 586},
            "resolution_m": 20.0,
            "elevation_range_m": {"min": -2598.94, "max": -2240.47},
        },
        "layers": [],
    }

@app.get("/api/v1/mission/default-assumptions")
@app.get("/mission/default-assumptions")
def assumptions():
    return {"status": "ok", "assumptions": {}}

@app.get("/api/v1/atlas/catalogue")
@app.get("/atlas/catalogue")
def catalogue():
    return {"total": 0, "datasets": []}
