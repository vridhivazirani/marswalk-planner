# AGENTS.md — Project rules for Marswalk Planner

These rules apply to **every contributor**, human or AI agent. Read this file before changing anything. If a request conflicts with these rules, stop and ask the project owner.

---

## 1. What this project is (and is not)

- Marswalk Planner is a **research and education decision-support prototype** for human EVA (extravehicular activity) route planning at Jezero Crater, Mars.
- It is **not NASA software**. It is **not certified, endorsed or validated** by NASA or any space agency. It must **never** claim operational astronaut safety.
- The disclaimer in `backend/app/core/disclaimer.py` (mirrored in `frontend/src/components/DisclaimerBanner.tsx`) must appear in the UI, in API metadata and in every generated report. Do not weaken it.

## 2. Scientific integrity rules (non-negotiable)

1. **Use only authentic planetary datasets** from official archives (NASA PDS, USGS Astrogeology, HiRISE/UA, etc.).
2. **Never fabricate observations.** No fake rasters, invented product IDs, made-up URLs, or "example" values that imitate NASA data. If data is missing, say so.
3. **Never invent dataset URLs.** Record a URL only after it has actually been retrieved from an official portal.
4. **No dataset is "suitable" until its metadata has been checked.** A dataset dossier in `docs/data_sources.md` with an ACCEPT decision is required before a product enters `data/raw/`.
5. **Preserve provenance.** Every file in `data/` has a catalog record (source product ID, retrieval URL, date, checksum, processing chain, software versions, parameters).
6. **Label every value with one epistemic class** (`backend/app/core/epistemic.py`): `OBSERVED`, `DERIVED`, `INTERPRETED`, `PREDICTED`, `HEURISTIC`, `SIMULATED`, `UNKNOWN`.
7. **Unknown terrain is never safe.** Missing elevation data means impassable by default. Low-resolution-only areas are penalised and flagged.
8. **Hard constraints and soft costs stay separate.** Hard constraints are binary masks with reason codes. Soft costs are positive weights. They are combined only inside the routing engine.
9. **Record uncertainty and coverage** for every derived layer.
10. **Human-EVA models are HEURISTIC and scenarios are SIMULATED.** Never fabricate real spacesuit specifications. Defaults are labelled "illustrative placeholder".

## 3. Mars geodesy rules

- **Canonical convention:** planetocentric latitude and **east-positive longitude in [−180, 180)**. Heights are metres relative to the Mars areoid (confirmed per product).
- **Geographic CRS:** `IAU_2015:49900` (Mars 2015 sphere, R = 3,396,190 m). The analysis CRS is a Jezero-centred equirectangular projection on the same sphere (ADR to be written in Phase 2).
- **Never use Earth Web Mercator (EPSG:3857) or Earth radii for analysis.** The web map may use a Mercator *display* projection on the Mars sphere. Distances, areas and slopes are always computed by the backend in the analysis CRS.
- Every ingested product must have its latitude type, longitude direction and range, and vertical reference checked and recorded.
- Never compute hazards on downsampled DTMs. Compute at native resolution, then aggregate conservatively (max / percentile).

## 4. Code organisation rules

### Backend layering (enforced by `backend/tests/architecture/test_layering.py`)
```text
api  →  services  →  domain packages (geospatial, terrain, hazards, costmap, routing, ...)  →  core
```
- `app/core` imports nothing else from `app`.
- Domain packages never import `app.api`, `app.services`, `app.main` or `fastapi`.
- API routers stay thin: validate input → call a service → return a Pydantic model.

### General
- Python ≥ 3.11, type hints everywhere, docstrings on public functions. Lint with `ruff`.
- TypeScript in strict mode. Lint with `oxlint`. No `any` without a comment explaining why.
- **No placeholder functionality that pretends to work.** Unimplemented modules contain only a docstring describing their responsibility and their planned phase. Do not return fake results.
- Add a dependency only when it is needed now. Explain why in the commit or the docs.
- Write important technical decisions as ADRs in `docs/adr/`.

## 5. Testing rules

- Every new function in `backend/app` gets a pytest test.
- Scientific algorithms are tested against **analytic synthetic surfaces generated in code** (planes, cones, spheres) and, for routing, against independent reference implementations.
- Synthetic test data lives only in `backend/tests/` and is clearly synthetic. It must never be stored in `data/`.
- All checks must pass before a change is considered done:
  - `cd backend && pytest && ruff check .`
  - `cd frontend && npm run lint && npm run build`

## 6. Data handling rules

- Large files are never committed. See `.gitignore` and `data/README.md`.
- `data/raw/` is immutable. To fix a problem, re-download the file; never edit it.
- Respect each dataset's licence and citation requirements, and record them in its dossier.
- Disk and RAM are limited (development machine: 8 GB RAM, ~50 GB free). Clip to the area of interest early and use windowed raster reads.

## 7. Workflow rules for AI agents

- Explain technical decisions in plain language. The project owner is a beginner.
- Follow `docs/implementation_roadmap.md` phase by phase. **Do not start a new phase without the owner's approval.**
- Do not build the dashboard, map or routing features before their phase.
- When unsure about a scientific fact, dataset property or URL, mark it **"to verify"** rather than guessing.
- Report check results honestly, including failures and warnings.

