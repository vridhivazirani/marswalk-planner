import assert from 'node:assert/strict'
import test from 'node:test'
import { initializeMissionBootstrap } from '../src/mission/missionBootstrap.ts'
import { ROUTE_PROFILE_WEIGHTS, createDefaultMissionBundle } from '../src/mission/missionModel.ts'
import { missionReducer } from '../src/mission/missionReducer.ts'
import {
  DRAFT_STORAGE_KEY,
  type StorageLike,
  loadMissionDraftResult,
  saveMissionDraft,
} from '../src/mission/missionStorage.ts'
import {
  DEFAULT_PAGE_ID,
  KNOWN_REGION_IDS,
  buildMissionUrl,
  parseMissionUrl,
} from '../src/navigation/routes.ts'

class CountingStorage implements StorageLike {
  private readonly store = new Map<string, string>()
  public getCalls = 0
  public setCalls = 0
  public removeCalls = 0

  getItem(key: string): string | null {
    this.getCalls += 1
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.removeCalls += 1
    this.store.delete(key)
  }

  seedRaw(raw: string): void {
    this.store.set(DRAFT_STORAGE_KEY, raw)
  }
}

test('initializeMissionBootstrap performs zero storage writes during init or StrictMode double-init', () => {
  const storage = new CountingStorage()

  // Simulate React StrictMode invoking the useState initializer twice on empty storage
  const render1 = initializeMissionBootstrap({ search: '', hash: '', storage })
  const render2 = initializeMissionBootstrap({ search: '', hash: '', storage })

  assert.equal(storage.setCalls, 0)
  assert.equal(storage.removeCalls, 0)
  assert.equal(render1.blockAutoPersist, false)
  assert.equal(render2.blockAutoPersist, false)
  assert.equal(render2.initialSerialized, null)

  // Post-mount effect persists once, and StrictMode effect re-run skips duplicate identical write
  const firstEffectSave = saveMissionDraft(render2.bundle, storage, render2.initialSerialized)
  assert.equal(firstEffectSave.ok, true)
  assert.equal(firstEffectSave.skippedUnchanged, false)
  assert.equal(storage.setCalls, 1)

  const strictModeSecondEffectSave = saveMissionDraft(
    render2.bundle,
    storage,
    firstEffectSave.serialized ?? null,
  )
  assert.equal(strictModeSecondEffectSave.ok, true)
  assert.equal(strictModeSecondEffectSave.skippedUnchanged, true)
  assert.equal(storage.setCalls, 1)
})

test('initial draft restoration avoids premature/redundant writes even with pretty-printed JSON, then persists on user mutation', () => {
  const storage = new CountingStorage()
  const existing = createDefaultMissionBundle({
    missionId: 'msn-existing-42',
    regionId: 'reg-gale',
    activePage: 'map-explorer',
    nowIso: '2026-11-13T03:00:00.000Z',
  })
  // Store pretty-printed JSON to verify canonical comparison prevents spurious rewrite on mount
  storage.seedRaw(JSON.stringify(existing, null, 2))

  const boot = initializeMissionBootstrap({
    search: '?page=map-explorer&region=reg-gale&mission=msn-existing-42',
    storage,
  })
  assert.equal(storage.setCalls, 0)
  assert.equal(boot.persistence.loadStatus, 'restored')
  assert.equal(boot.bundle.missionId, 'msn-existing-42')
  assert.equal(boot.bundle.geographic.regionId, 'reg-gale')

  // Mount persistence effect skips rewrite because restored state matches stored bundle
  const mountSave = saveMissionDraft(boot.bundle, storage, boot.initialSerialized)
  assert.equal(mountSave.skippedUnchanged, true)
  assert.equal(storage.setCalls, 0)

  // Genuine user mutation updates state and triggers persistence
  const mutated = missionReducer(boot.bundle, {
    type: 'MISSION/UPDATE_METADATA',
    payload: { name: 'Gale Rim Field Recon' },
    nowIso: '2026-11-13T03:05:00.000Z',
  })
  const mutationSave = saveMissionDraft(mutated, storage, boot.initialSerialized)
  assert.equal(mutationSave.ok, true)
  assert.equal(mutationSave.skippedUnchanged, false)
  assert.equal(storage.setCalls, 1)

  const reloaded = loadMissionDraftResult(storage, 'msn-existing-42')
  assert.equal(reloaded.status, 'restored')
  assert.equal(reloaded.bundle?.name, 'Gale Rim Field Recon')
})

test('invalid, unsupported, and mismatched drafts set blockAutoPersist and remain untouched', () => {
  const cases: Array<{ label: string; raw: string; search?: string; expectedStatus: string }> = [
    { label: 'malformed JSON', raw: '{corrupt-draft', expectedStatus: 'malformed_json' },
    {
      label: 'unsupported version',
      raw: JSON.stringify({ schemaVersion: '9.9', missionId: 'msn-future' }),
      expectedStatus: 'unsupported_version',
    },
    {
      label: 'structurally invalid draft',
      raw: JSON.stringify({ schemaVersion: '1.0', missionId: '' }),
      expectedStatus: 'invalid_schema',
    },
    {
      label: 'mission ID mismatch',
      raw: JSON.stringify(createDefaultMissionBundle({ missionId: 'msn-user-draft' })),
      search: '?page=overview&mission=nonexistent-999',
      expectedStatus: 'id_mismatch',
    },
  ]

  for (const c of cases) {
    const storage = new CountingStorage()
    storage.seedRaw(c.raw)
    const boot1 = initializeMissionBootstrap({ search: c.search ?? '', storage })
    const boot2 = initializeMissionBootstrap({ search: c.search ?? '', storage })

    assert.equal(boot1.blockAutoPersist, true, `${c.label} should block auto-persist`)
    assert.equal(boot2.blockAutoPersist, true, `${c.label} StrictMode pass should block`)
    assert.equal(boot2.persistence.loadStatus, c.expectedStatus)
    assert.equal(storage.setCalls, 0)
    assert.equal(storage.getItem(DRAFT_STORAGE_KEY), c.raw)
  }
})

test('region changes update shared bundle for all 12 regions, sync canonical URL, and restore via browser history popstate', () => {
  const storage = new CountingStorage()
  const boot = initializeMissionBootstrap({ search: '?page=map-explorer&region=reg-jezero', storage })
  let current = boot.bundle
  let lastSaved = boot.initialSerialized

  const initialSave = saveMissionDraft(current, storage, lastSaved)
  lastSaved = initialSave.serialized ?? null

  // Switch across every canonical region, verifying shared state and canonical URL stay aligned
  for (const regionId of KNOWN_REGION_IDS) {
    if (regionId === current.geographic.regionId) continue
    current = missionReducer(current, {
      type: 'MISSION/SET_REGION',
      payload: { regionId },
    })
    assert.equal(current.geographic.regionId, regionId)

    const url = buildMissionUrl({
      page: current.app.activePage,
      region: current.geographic.regionId,
      missionId: current.missionId,
    })
    const parsed = parseMissionUrl(url.replace(/^\/\?/, '?'))
    assert.equal(parsed.region, regionId)
    assert.equal(parsed.page, 'map-explorer')
    assert.equal(parsed.missionId, current.missionId)
  }

  // Navigate to Mars Science page while on last region, then simulate Back/Forward popstate to prior URL
  const targetRegion = 'reg-gale'
  current = missionReducer(current, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: targetRegion },
  })
  current = missionReducer(current, {
    type: 'MISSION/SET_PAGE',
    payload: { page: 'science' },
  })
  const savedAfterNav = saveMissionDraft(current, storage, lastSaved)
  assert.equal(savedAfterNav.ok, true)

  const backHistoryUrl = buildMissionUrl({
    page: 'map-explorer',
    region: 'reg-jezero',
    missionId: current.missionId,
  })
  const parsedPop = parseMissionUrl(backHistoryUrl.replace(/^\/\?/, '?'))
  if (parsedPop.region && parsedPop.region !== current.geographic.regionId) {
    current = missionReducer(current, {
      type: 'MISSION/SET_REGION',
      payload: { regionId: parsedPop.region },
    })
  }
  current = missionReducer(current, {
    type: 'MISSION/SET_PAGE',
    payload: { page: parsedPop.page ?? DEFAULT_PAGE_ID },
  })

  assert.equal(current.app.activePage, 'map-explorer')
  assert.equal(current.geographic.regionId, 'reg-jezero')
})

test('sequential custom weight updates compose atomically without stale weight loss', () => {
  const initial = createDefaultMissionBundle({ missionId: 'msn-weights' })
  assert.deepEqual(initial.eva.customWeights, ROUTE_PROFILE_WEIGHTS.BALANCED)

  // Rapid updates across two keys compose inside missionReducer queue without overwriting each other
  const afterTerrain = missionReducer(initial, {
    type: 'MISSION/UPDATE_CUSTOM_WEIGHT',
    payload: { key: 'w_terrain', value: 0.4 },
    nowIso: '2026-11-13T03:10:00.000Z',
  })
  const afterHazard = missionReducer(afterTerrain, {
    type: 'MISSION/UPDATE_CUSTOM_WEIGHT',
    payload: { key: 'w_hazard', value: 0.45 },
    nowIso: '2026-11-13T03:10:01.000Z',
  })

  assert.equal(afterHazard.eva.routeProfile, 'CUSTOM')
  assert.equal(afterHazard.eva.customWeights.w_terrain, 0.4)
  assert.equal(afterHazard.eva.customWeights.w_hazard, 0.45)
  assert.equal(afterHazard.eva.customWeights.w_uncertainty, ROUTE_PROFILE_WEIGHTS.BALANCED.w_uncertainty)
})

