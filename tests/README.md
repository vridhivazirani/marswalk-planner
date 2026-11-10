# tests/

Cross-system tests that span the frontend and backend.

| Folder | Purpose | Status |
|---|---|---|
| `e2e/` | Playwright end-to-end browser tests (map, planner, reports) | Planned for Phase 4 |
| `validation/` | Scientific validation runs against verified real data (alignment, vertical bias, slope realism) | Planned for Phase 2-3 |

Unit and architecture tests for the backend live next to the code in `backend/tests/`, so they can run with a plain `pytest` inside `backend/`.
