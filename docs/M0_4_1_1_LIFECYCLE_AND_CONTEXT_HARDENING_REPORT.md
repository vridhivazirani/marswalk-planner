# MARSWALK — M0.4.1.1 LIFECYCLE & CONTEXT HARDENING REPORT
## React Lifecycle, Geographic Context & Navigation Hardening

**Milestone:** M0.4.1.1 (Corrective Hardening Prior to M0.4.2)  
**Branch:** `main`  
**HEAD Commit:** `dce6f6985ed150eebf9374912116befc9eb2319c`  
**Final Verdict:** **CONDITIONAL PASS**

---

## 1. Root Cause of Render-Time Persistence

In M0.4.1, `bootstrapMissionState()` in `frontend/src/context/MissionContext.tsx` executed `saveMissionDraft(bundle, storage, null)` inside React's `useState(() => bootstrapMissionState())` lazy initializer.

### Why this was defective
- Under React 19 `<StrictMode>` (`frontend/src/main.tsx`), React intentionally invokes `useState` lazy initializers twice during development renders to expose impure initializers.
- On empty `localStorage`, the first discarded render invocation wrote a freshly generated `MissionBundleV1` into `marswalk:mission:draft:v1`, causing the second retained render invocation to observe `'restored'` instead of `'missing'`.
- Performing `localStorage.setItem` inside render/state initialization also bypassed effect lifecycle control and obscured premature writes.

---

## 2. Corrected Lifecycle & Hydration Behavior

Created a pure bootstrap module `frontend/src/mission/missionBootstrap.ts` exporting `initializeMissionBootstrap(...)`:

1. **Zero Render-Time Writes:** `initializeMissionBootstrap()` only reads URL params (`parseMissionUrl`) and existing storage (`loadMissionDraftResult`), computes URL overrides (`?page=`, `?region=`), and returns `{ bundle, persistence, blockAutoPersist, initialSerialized, canonicalUrl }`. Zero `setItem`, `removeItem`, or `window.history` calls occur during `useState` initialization.
2. **Canonical Hydration Deduplication:** When a valid existing draft is restored without URL overrides, `initialSerialized` is set to `JSON.stringify(bundle)` so the post-mount `useEffect` passes `previousSerialized` to `saveMissionDraft(...)` and receives `skippedUnchanged: true` (**zero storage write**, even if the stored file had pretty-printed whitespace).
3. **Controlled Post-Mount Effect Persistence:**
   - When storage started empty (`missing` without `?mission=` mismatch), `initialSerialized` is `null` and `blockAutoPersist` is `false`, so the post-mount `useEffect` persists the new default draft once after render (ensuring the canonicalized `?mission=<id>` URL survives immediate refresh). Under `<StrictMode>`, the second mount effect pass receives `skippedUnchanged: true`.
   - Genuine user mutations (`MISSION/UPDATE_METADATA`, `MISSION/SET_REGION`, `MISSION/UPDATE_CUSTOM_WEIGHT`, etc.) clear `blockAutoPersistRef.current` via `dispatch` and trigger incremental persistence.
4. **Non-Clobber Preserved:** `malformed_json`, `unsupported_version`, `invalid_schema`, `id_mismatch`, and `storage_error` set `blockAutoPersist = true`, preventing both initial mount and passive `SET_PAGE` / `popstate` actions from overwriting recoverable or incompatible drafts. Storage exceptions continue to be caught inside `missionStorage.ts` and surfaced cleanly via `persistence.storageError`.

---

## 3. Region State Ownership Before & After

### Before M0.4.1.1 (Competing Owners)
1. `MissionContext.tsx`: Held `mission.geographic.regionId` and updated `?region=` via `setActiveRegion()`.
2. `MapExplorerPage.tsx`: Held separate local `const [selectedRegionId, setSelectedRegionId] = useState<string>('reg-jezero')`, ignoring `mission.geographic.regionId` and updating only local state on globe/map jumps (`onEnterRegion`, `onEnterJezero`).
3. `RegionalMarsMap.tsx`: Held separate local `const [selectedRegionId, setSelectedRegionId] = useState<string>(initialRegionId)` with render-phase `prevInitialId` sync and local `<select>` changes (`handleSelectRegion`) + raw `setSelectedRegionId('reg-jezero')` button that never updated `MissionContext`, `NavigationSidebar`, or URL `?region=`.

### After M0.4.1.1 (Single Authoritative Owner)
- **`MissionContext` (`mission.geographic.regionId`) is the sole owner when running in the application:**
  - `App.tsx` passes `selectedRegionId={activeRegionId}` and `onSelectRegion={actions.setActiveRegion}` to `<MapExplorerPage />`.
  - `MapExplorerPage.tsx` removes local `selectedRegionId` `useState` completely and routes `onEnterJezero` / `onEnterRegion` / `<RegionalMarsMap />` directly through `onSelectRegion`.
  - `RegionalMarsMap.tsx` accepts controlled `selectedRegionId` and `onSelectRegion` props, removes the render-phase `prevInitialId` state mutation hack, derives dossier loading/error state purely from `{ regionId, data }`, routes the `OPEN JEZERO DIGITAL TWIN` button through `handleSelectRegion('reg-jezero')`, and re-initializes/cleans up Leaflet cleanly when switching between non-Jezero regional dossiers and `'reg-jezero'`'s 16-layer local Digital Twin. *(Uncontrolled `uncontrolledRegionId` fallback remains inside `RegionalMarsMap` only when rendered standalone without `onSelectRegion`.)*
- **Non-Mission Local State Documented:**
  - `MapExplorerPage.tsx` retains local `explorerTab` view-tab state and catalogue filter/sort/pagination state (`searchQuery`, `selectedCategory`, `viewMode`, `page`, etc.) as temporary UI view controls rather than persistent mission state (aligned with M0.4.1 scope boundary before M0.4.2).
  - `RegionalMarsMap.tsx` retains local regional dossier fetch cache (`dossierRecord`), map cursor coordinates, transect UI points, and sol range slider as view-local inspection state; only `'reg-jezero'` mounts local Digital Twin GIS layers while all 12 region IDs load their regional scientific dossier & dataset list without falsely assuming high-resolution local twins exist everywhere.

---

## 4. `missionRef` Synchronization Investigation

Inspected every read/write of `missionRef` in `frontend/src/context/MissionContext.tsx`:

- **Persistence (`useEffect` on `[mission]`):** Does NOT use `missionRef`; reads committed `mission` directly from the effect closure. Zero staleness risk.
- **Asynchronous callbacks (`inspectCoordinates`, `handlePopState`):** Run asynchronously after React commits (so post-commit `useEffect` has synced `missionRef.current`). Additionally added `inspectionSeqRef` sequence guard in `inspectCoordinates` so out-of-order concurrent location inspections cannot overwrite newer results with older responses.
- **Weight Composition (`updateCustomWeight`):** Previously dispatched full-object `MISSION/SET_CUSTOM_WEIGHTS` built from `missionRef.current.eva.customWeights`, creating a theoretical loss if two weight updates executed synchronously in one event tick before commit. Added atomic `MISSION/UPDATE_CUSTOM_WEIGHT` to `missionReducer.ts` so sequential weight updates compose inside React's reducer queue without dropping prior keys.
- **Post-render `useEffect` sync retained for `missionRef`:** Keeps `oxlint` `react/refs` (`0 warnings / 0 errors`) clean without unnecessary ref complexity. Note remains that calling `setActiveRegion` and `setActivePage` synchronously back-to-back in a single event tick before commit would read pre-commit `regionId` during `pushState` (no UI handler does this).

---

## 5. Regression Coverage Added & Results

Created `frontend/tests/missionLifecycle.test.ts` (5 new tests) alongside the 18 existing tests (`23` total in `frontend/tests/`):

- `initializeMissionBootstrap performs zero storage writes during init or StrictMode double-init`
- `initial draft restoration avoids premature/redundant writes even with pretty-printed JSON, then persists on user mutation`
- `invalid, unsupported, and mismatched drafts set blockAutoPersist and remain untouched`
- `region changes update shared bundle for all 12 regions, sync canonical URL, and restore via browser history popstate`
- `sequential custom weight updates compose atomically without stale weight loss`

---

## 6. Browser Verification Status

- Frontend (`http://127.0.0.1:5173`, `task-6402`) and backend (`http://127.0.0.1:8000`, `task-6400`) dev servers remain running.
- Browser automation capabilities reassessed via `browser` subagent (`83674ede-e384-4d8f-a0d2-3136d138da0a`) and binary checks (`google-chrome`, `chromium`, `playwright` absent; Python `playwright`/`selenium` `False`):
  - Exact error verbatim from `browser`:
    `Could not connect to Chrome. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.`
    `Cause: Could not find DevToolsActivePort for chrome at /Users/vridhivazirani/Library/Application Support/Google/Chrome/DevToolsActivePort` (`ENOENT`).
- Live mounted browser verification of M0.4.1 Scenarios **A–G** remains **NOT VERIFIED** in this environment.

---

## 7. Quality Gate & Git Preservation Results

| Check | Command | Exit Code | Observed Result |
|---|---|---|---|
| Frontend Lint | `cd frontend && npm run lint` | `0` | `oxlint`: `Found 0 warnings and 0 errors.` (`60` files) |
| Test Typecheck | `cd frontend && npx tsc -p tsconfig.test.json --noEmit` | `0` | Passed |
| Frontend Tests | `cd frontend && npm test` | `0` | `23` passed, `0` failed, `0` skipped |
| Production Build | `cd frontend && npm run build` | `0` | `tsc -b && vite build`: built cleanly in `304ms` |
| Backend Tests | `cd backend && .venv/bin/pytest -q` | `0` | `283 passed in 141.29s (0:02:21)` |
| Backend Lint | `cd backend && .venv/bin/ruff check .` | `0` | `All checks passed!` |
| Diff Hygiene | `git diff --check` | `0` | Clean |

- **Git Preservation:** Branch `main` (`dce6f6985ed150eebf9374912116befc9eb2319c`), zero staged files (`git diff --stat --cached` empty), backend/catalog/science/M0.3.4 artifacts completely untouched, zero commits/pushes/resets performed.

---

## 8. Remaining Limitations & Final Verdict

- **Remaining Limitations:**
  1. Live Chrome DevTools E2E browser verification (`Scenarios A–G`) and DOM-mounted React component tests remain **NOT VERIFIED** without Chrome remote debugging or Playwright/jsdom.
  2. Multi-mission management / switching persistently across independent saved missions remains out of scope for M0.4.1 (single `marswalk:mission:draft:v1` key).
- **Verdict:** **CONDITIONAL PASS** — All architectural hardening fixes (`missionBootstrap.ts` pure initialization, unified Explorer/RegionalMarsMap region ownership under `MissionContext`, atomic weight reduction, out-of-order inspection sequencing, and `23/23` + `283/283` automated gates) are complete and verified cleanly; full **PASS** awaits live Chrome verification once `chrome://inspect/#remote-debugging` (`DevToolsActivePort`) is enabled.

