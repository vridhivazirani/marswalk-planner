# Marswalk Planetary Atlas — API Contract Specification

**Document Identifier:** `MARS-ATLAS-API-001`  
**Status:** Approved Technical Architecture Contract  
**Protocol:** RESTful HTTPS / JSON & Binary Streaming  
**Mars Coordinate System:**  
- Geographic Endpoints: `IAU_2015:49900` (Planetocentric Latitude $[-90^\circ, +90^\circ]$, East-Positive Longitude $[-180^\circ, +180^\circ)$)  
- Projected Endpoints: `IAU_2015:49910` / `ESRI:103885` (Equirectangular Mars Sphere $R = 3,396,190\text{ m}$, Coordinates in Metres Easting/Northing)  
**Vertical Reference:** Gravitational MOLA Areoid ($R_{\text{ref}} = 3,396,000\text{ m}$)  

---

## 1. Architectural Principles

1. **Separation of Concerns:** Binary geospatial streams (GeoTIFFs, PNG overlays, tile rasters) are decoupled from metadata and vector query endpoints.
2. **Epistemic Labeling:** Every metadata response and feature collection includes an explicit `epistemic_class` field conforming to `backend/app/core/epistemic.py`.
3. **Mandatory Disclaimer:** Every API payload includes the mandatory Marswalk educational/research disclaimer block.
4. **Coordinate Transparency:** All geographic coordinates explicitly define latitude type (`planetocentric`), longitude direction (`east_positive`), and angular unit (`degrees`).

---

## 2. API Endpoint Matrix

| Method | Path | Purpose | Epistemic Class | Primary Return Format |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/atlas/catalogue` | Searchable index of all registered products | `OBSERVED` / `DERIVED` | `application/json` |
| `GET` | `/atlas/maps/{map_id}` | Detailed product dossier and metadata | `OBSERVED` / `DERIVED` | `application/json` |
| `GET` | `/atlas/global/basemaps` | Global planetary reference basemap layers | `OBSERVED` / `DERIVED` | `application/json` |
| `GET` | `/atlas/global/features` | USGS IAU Mars nomenclature gazetteer | `OBSERVED` | `application/geo+json` |
| `GET` | `/atlas/global/landing-sites` | Historical Mars landing sites and status | `OBSERVED` | `application/geo+json` |
| `GET` | `/atlas/regional/jezero/footprints` | Authentic HiRISE/CTX image footprints | `OBSERVED` | `application/geo+json` |
| `GET` | `/atlas/geology/units` | Jezero crater stratigraphic unit polygons | `INTERPRETED` | `application/geo+json` |
| `GET` | `/atlas/geology/crism-indices` | CRISM spectral absorption indices | `DERIVED` | `application/json` |
| `GET` | `/atlas/environment/surface-properties` | TES thermal inertia, albedo, and dust | `DERIVED` | `application/json` |
| `POST`| `/twin/vector/contours` | Dynamic elevation contours (Marching squares)| `DERIVED` | `application/geo+json` |
| `POST`| `/terrain/transect` | Geodesic elevation cross-section profile | `DERIVED` | `application/json` |

---

## 3. Detailed Endpoint Specifications

### 3.1 `GET /atlas/catalogue`
Returns the complete list of 35 verified planetary products. Supports filtering by category, product type, spatial resolution, and geographic bounding box.

#### Query Parameters
- `category` (optional, string): Filter by category (`global`, `regional`, `local`, `geology`, `mineralogy`, `environment`, `rover`, `mission`).
- `product_type` (optional, string): Filter by type (`SRC`, `DRV`, `VEC`, `INT`, `SIM`).
- `min_resolution_m` (optional, float): Minimum pixel scale in metres.
- `max_resolution_m` (optional, float): Maximum pixel scale in metres.
- `bbox` (optional, string): Comma-separated `min_lon,min_lat,max_lon,max_lat` in `IAU_2015:49900`.
- `verification_status` (optional, string): Default `VERIFIED` (`ALL`, `VERIFIED`, `UNVERIFIED`).

#### Response Schema (`200 OK`)
```json
{
  "total": 35,
  "filtered_count": 35,
  "crs": "IAU_2015:49900",
  "disclaimer": "Marswalk Planner is a research and educational prototype. Not certified for mission operations.",
  "items": [
    {
      "id": "PLN-SRC-01",
      "slug": "mola-megdr-128",
      "title": "MOLA 128 ppd Global Topography (MEGDR)",
      "category": "global",
      "product_type": "SRC",
      "instrument": "MOLA",
      "mission": "Mars Global Surveyor",
      "resolution_m": 463.0,
      "coverage": "Global (-180 to 180 E, -90 to 90 N)",
      "crs": "IAU_2015:49900",
      "vertical_datum": "MOLA Gravitational Areoid",
      "epistemic_class": "OBSERVED",
      "storage_format": "GeoTIFF",
      "verification_status": "VERIFIED",
      "data_url": "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/megt90n000cb.img"
    }
  ]
}
```

---

### 3.2 `GET /atlas/maps/{map_id}`
Retrieves complete scientific metadata, provenance audit logs, and streaming URL for a specific map.

#### Path Parameters
- `map_id` (required, string): Canonical identifier (e.g. `PLN-SRC-04` or slug `hirise-dtm-delta`).

#### Response Schema (`200 OK`)
```json
{
  "id": "PLN-SRC-04",
  "product_id": "HiRISE_DTM_Delta_Jezero_DL_1m",
  "source_dataset_id": "DTEEC_049906_1990_050618_1990_A01",
  "name": "HiRISE Jezero Western Delta DTM (1m)",
  "instrument": "HiRISE",
  "spacecraft": "Mars Reconnaissance Orbiter",
  "resolution_m": 1.0,
  "crs": "ESRI:103885 (Equirectangular Mars)",
  "geodesy": {
    "datum": "IAU_2015",
    "semi_major_axis_m": 3396190.0,
    "semi_minor_axis_m": 3396190.0,
    "vertical_reference": "MOLA Areoid (Areoid Undulation N ~ -830m)"
  },
  "spatial_extent": {
    "west_deg": 77.38,
    "east_deg": 77.58,
    "south_deg": 18.38,
    "north_deg": 18.52
  },
  "provenance": {
    "retrieval_portal": "USGS Astrogeology TRN Archive",
    "sha256": "3cb4db9d25514f...",
    "original_format": "GeoTIFF (Float32)",
    "local_path": "data/processed/HiRISE_DTM_Delta_Jezero_DL_1m.tif"
  },
  "epistemic_class": "DERIVED",
  "disclaimer": "Marswalk Planner research prototype disclaimer."
}
```

#### Error Responses
- `404 Not Found`: Map identifier not recognized.
- `422 Unprocessable Entity`: Malformed map identifier syntax.

---

### 3.3 `GET /atlas/global/features`
Retrieves named planetary features from the USGS IAU Gazetteer of Planetary Nomenclature for interactive map exploration.

#### Query Parameters
- `feature_type` (optional, string): Filter by feature type (`Crater`, `Fossa`, `Planum`, `Vallis`, `Mons`).
- `min_diameter_km` (optional, float): Minimum feature diameter in kilometres.

#### Response Schema (`200 OK`, `GeoJSON FeatureCollection`)
```json
{
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": { "name": "urn:ogc:def:crs:IAU_2015:49900" }
  },
  "epistemic_class": "OBSERVED",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [77.456, 18.38]
      },
      "properties": {
        "feature_id": "IAU-FEAT-2849",
        "name": "Jezero",
        "type": "Crater",
        "diameter_km": 49.0,
        "approval_date": "2007-05-01",
        "origin": "Named after Jezero, Bosnia and Herzegovina"
      }
    }
  ]
}
```

---

### 3.4 `GET /atlas/geology/units`
Returns vector polygons of the Jezero Crater USGS Scientific Investigations Map (SIM 3464, Sun & Stack 2020) with full stratigraphy and lithologic descriptions.

#### Response Schema (`200 OK`, `GeoJSON FeatureCollection`)
```json
{
  "type": "FeatureCollection",
  "epistemic_class": "INTERPRETED",
  "properties": {
    "publication": "USGS SIM 3464",
    "authors": "Sun & Stack (2020)",
    "scale": "1:5000"
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[77.42, 18.42], [77.45, 18.42], [77.45, 18.45], [77.42, 18.45], [77.42, 18.42]]]
      },
      "properties": {
        "unit_id": "f_delta_blocky",
        "unit_name": "Blocky Delta Deposit",
        "stratigraphic_age": "Noachian / Early Hesperian",
        "lithology": "Coarse sandstones and conglomerates with carbonate cements",
        "rover_traversability_rating": "MODERATE",
        "color_hex": "#8B6508"
      }
    }
  ]
}
```

---

### 3.5 `POST /twin/vector/contours`
Generates vector elevation contours dynamically on the fly from the active Jezero DTM using the topologically disambiguated marching squares algorithm.

#### Request Body Schema
```json
{
  "interval_m": 10.0,
  "min_elevation_m": -2700.0,
  "max_elevation_m": -2200.0,
  "bbox": [77.40, 18.40, 77.50, 18.50],
  "simplify_tolerance_m": 4.0
}
```

#### Response Schema (`200 OK`, `GeoJSON FeatureCollection`)
```json
{
  "type": "FeatureCollection",
  "crs": "IAU_2015:49900",
  "epistemic_class": "DERIVED",
  "properties": {
    "interval_m": 10.0,
    "feature_count": 84,
    "computation_time_ms": 42.1
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[77.412, 18.415], [77.413, 18.416], [77.415, 18.418]]
      },
      "properties": {
        "elevation_m": -2450.0,
        "is_index_contour": true
      }
    }
  ]
}
```

---

### 3.6 `POST /terrain/transect`
Computes an authentic geodesic elevation profile between two planetary coordinates across the Jezero Western Delta.

#### Request Body Schema
```json
{
  "start": { "lat": 18.420, "lon": 77.410 },
  "end": { "lat": 18.460, "lon": 77.480 },
  "samples": 200,
  "source_layer": "CTX_20m"
}
```

#### Response Schema (`200 OK`)
```json
{
  "crs": "IAU_2015:49900",
  "geodesic_distance_m": 7731.4,
  "3d_path_length_m": 7748.2,
  "min_elevation_m": -2562.3,
  "max_elevation_m": -2210.8,
  "elevation_gain_m": 351.5,
  "elevation_loss_m": 0.0,
  "max_slope_deg": 28.4,
  "mean_slope_deg": 5.8,
  "epistemic_class": "DERIVED",
  "profile": [
    {
      "distance_m": 0.0,
      "lat": 18.420000,
      "lon": 77.410000,
      "elevation_m": -2562.3,
      "slope_deg": 3.2
    },
    {
      "distance_m": 38.85,
      "lat": 18.420201,
      "lon": 77.410352,
      "elevation_m": -2560.1,
      "slope_deg": 3.9
    }
  ]
}
```

