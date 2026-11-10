# Marswalk Planner — backend

Python/FastAPI backend and science library. See the root [README](../README.md) for setup, and [AGENTS.md](../AGENTS.md) for project rules.

```text
app/
  main.py        FastAPI application factory
  api/           HTTP routers (the only layer that knows about HTTP)
  core/          config, disclaimer, epistemic classes (imports nothing else from app)
  models/        Pydantic schemas
  services/      orchestration between API and domain packages
  catalog/       provenance + dataset catalog            (Phase 1-2)
  ingestion/     authentic data acquisition + validation (Phase 1-2)
  geospatial/    Mars CRS, ARD grid, raster IO           (Phase 2; environment check now)
  terrain/       slope, roughness, ...                   (Phase 3)
  hazards/       hazard layers + reason codes            (Phase 3)
  uncertainty/   coverage + confidence                   (Phase 3)
  costmap/       hard constraints + soft costs           (Phase 5)
  routing/       A*, Dijkstra, multi-objective           (Phase 5, 9)
  science/       CRISM, geology, opportunity maps        (Phase 7)
  mission/       missions, EVA, scenarios, emergency     (Phase 5, 9)
tests/
  unit/          fast tests of individual functions
  architecture/  checks that enforce the layering rules
```

Packages marked with a phase only contain a docstring that describes their responsibility. They are intentionally empty until that phase starts.

