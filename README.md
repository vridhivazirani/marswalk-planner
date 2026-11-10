# Marswalk Planner

**Planetary geospatial intelligence and human EVA mission-planning decision-support prototype for Jezero Crater, Mars.**

> ⚠️ **Disclaimer:** Marswalk Planner is a research and education prototype. It is not NASA software, is not endorsed or certified by NASA, and must not be used for operational astronaut-safety or mission decisions.

**Current status:** Phase 0 (foundations). The project skeleton, the backend health API and a minimal frontend shell exist. **No planetary data has been ingested yet**, and there is no map, terrain analysis or route planning so far. See [docs/implementation_roadmap.md](docs/implementation_roadmap.md).

---

## Repository layout

```text
marswalk-planner/
├── AGENTS.md              project rules (read first)
├── README.md              this file
├── backend/               Python 3.12 + FastAPI backend and science library
│   ├── app/               modular package (api, core, geospatial, terrain, hazards, ...)
│   ├── tests/             pytest unit + architecture tests
│   ├── pyproject.toml     dependencies (only essentials for now)
│   └── requirements.lock  exact tested versions
├── frontend/              React 19 + TypeScript + Vite
├── data/                  local data lake (raw / interim / processed / sample / catalog / manifests)
├── docs/                  architecture, data sources, assumptions, roadmap, ADRs
├── tests/                 cross-system tests (Playwright e2e, scientific validation) — later phases
└── scripts/               helper scripts (environment check)
```

## Prerequisites

| Tool | Tested version | Check with |
|---|---|---|
| Python | 3.12.4 (≥ 3.11 required) | `python3 --version` |
| Node.js | 26.0.0 | `node --version` |
| npm | 11.12.1 | `npm --version` |
| git | any recent | `git --version` |

No system GDAL installation is needed at this stage. The `rasterio` and `pyproj` wheels bundle GDAL 3.12 and PROJ 9.8, including the IAU Mars coordinate systems.

## Setup (first time)

### 1. Backend (Python virtual environment)

```bash
cd backend
python3 -m venv .venv                 # create the virtual environment
source .venv/bin/activate             # activate it (your prompt shows "(.venv)")
python -m pip install --upgrade pip
pip install -e ".[dev]"               # install the backend + dev tools
# For exact reproduction of the tested versions instead:
# pip install -r requirements.lock && pip install -e . --no-deps
```

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. Verify the environment

```bash
# from the repository root
backend/.venv/bin/python scripts/check_environment.py
```

## Running the app

Use **two terminals**.

**Terminal 1 — backend (http://127.0.0.1:8000):**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
- Health check: http://127.0.0.1:8000/api/v1/health
- Interactive API docs: http://127.0.0.1:8000/docs

**Terminal 2 — frontend (http://localhost:5173):**
```bash
cd frontend
npm run dev
```
The Vite dev server forwards `/api/*` requests to the backend, so the page shows "Connected to marswalk-backend" when both are running.

## Checks

```bash
# Backend
cd backend && source .venv/bin/activate
pytest            # unit + architecture tests
ruff check .      # lint

# Frontend
cd frontend
npm run lint      # oxlint
npm run build     # TypeScript type-check + production build
```

## Documentation

- [AGENTS.md](AGENTS.md): project rules (scientific integrity, Mars geodesy, layering, testing)
- [docs/architecture.md](docs/architecture.md): system architecture
- [docs/data_sources.md](docs/data_sources.md): candidate datasets and verification status
- [docs/assumptions.md](docs/assumptions.md): explicit assumptions and their status
- [docs/implementation_roadmap.md](docs/implementation_roadmap.md): phased plan

## Data credits

Data credits and citations will be listed here, and in each dataset dossier, once products have been verified and ingested.

