import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultMissionBundle } from '../src/mission/missionModel.ts'
import { missionReducer } from '../src/mission/missionReducer.ts'
import { loadMissionDraftResult, saveMissionDraft, type StorageLike } from '../src/mission/missionStorage.ts'
import {
  DEFAULT_PAGE_ID,
  DEFAULT_REGION_ID,
  EXPERIENCE_ROUTES,
  KNOWN_REGION_IDS,
  buildMissionUrl,
  getPageTitle,
  getRegionBadgeLabel,
  parseMissionUrl,
  parseUrlCoordinate,
  resolvePageId,
  resolveRegionId,
} from '../src/navigation/routes.ts'

test('EXPERIENCE_ROUTES covers all 14 pages and KNOWN_REGION_IDS covers all 12 Mars regions', () => {
  assert.equal(EXPERIENCE_ROUTES.length, 14)
  assert.equal(KNOWN_REGION_IDS.length, 12)
  assert.equal(getPageTitle('route-planner'), 'EVA Route Optimization Planner')
  assert.equal(getRegionBadgeLabel('reg-jezero'), 'JEZERO CRATER • MARS')
  assert.equal(getRegionBadgeLabel('reg-gale'), 'GALE CRATER • MARS')
})

test('parseMissionUrl handles valid query params, aliases, legacy hash, and safe invalid fallbacks', () => {
  // Full valid deep link
  const valid = parseMissionUrl('?page=route-planner&region=reg-gale&mission=msn-abc123')
  assert.deepEqual(valid, {
    page: 'route-planner',
    region: 'reg-gale',
    missionId: 'msn-abc123',
  })

  // Alias support (?page=explorer -> map-explorer)
  const alias = parseMissionUrl('?page=explorer&region=reg-jezero')
  assert.equal(alias.page, 'map-explorer')
  assert.equal(alias.region, 'reg-jezero')
  assert.equal(alias.missionId, null)

  // Legacy hash fallback (#hazards)
  const legacyHash = parseMissionUrl('', '#hazards')
  assert.equal(legacyHash.page, 'hazards')

  // Invalid page and region safely resolve to null (never crash or accept arbitrary strings)
  const invalid = parseMissionUrl('?page=__bogus__&region=atlantis&mission=%20%20')
  assert.deepEqual(invalid, {
    page: null,
    region: null,
    missionId: null,
  })
  assert.equal(resolvePageId('bogus') ?? DEFAULT_PAGE_ID, 'overview')
  assert.equal(resolveRegionId('atlantis') ?? DEFAULT_REGION_ID, 'reg-jezero')
})

test('buildMissionUrl formats canonical deep-link URLs deterministically', () => {
  const url = buildMissionUrl({
    page: 'science',
    region: 'reg-jezero',
    missionId: 'msn-777',
  })
  assert.equal(url, '/?page=science&region=reg-jezero&mission=msn-777')
})

test('simulated History pushState / popstate navigation and missing ?mission= non-phantom workflow', () => {
  const store = new Map<string, string>()
  const storage: StorageLike = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v)
    },
    removeItem: (k) => {
      store.delete(k)
    },
  }

  // Saved mission exists under ID 'msn-saved-alpha'
  const savedBundle = createDefaultMissionBundle({
    missionId: 'msn-saved-alpha',
    regionId: 'reg-jezero',
    activePage: 'overview',
  })
  savedBundle.name = 'Alpha Traverse'
  saveMissionDraft(savedBundle, storage)

  // Visiting URL requesting non-existent ?mission=phantom-999 must NOT fabricate a mission with ID 'phantom-999'
  const parsedMissing = parseMissionUrl('?page=science&region=reg-gale&mission=phantom-999')
  const loadAttempt = loadMissionDraftResult(storage, parsedMissing.missionId)
  assert.equal(loadAttempt.status, 'id_mismatch')
  assert.equal(loadAttempt.bundle, null)

  const fallbackDraft = createDefaultMissionBundle({
    regionId: parsedMissing.region ?? DEFAULT_REGION_ID,
    activePage: parsedMissing.page ?? DEFAULT_PAGE_ID,
  })
  assert.notEqual(fallbackDraft.missionId, 'phantom-999')
  assert.equal(fallbackDraft.app.activePage, 'science')
  assert.equal(fallbackDraft.geographic.regionId, 'reg-gale')

  // Simulate multi-page browser history stack + Back/Forward popstate traversal
  const historyStack = [
    buildMissionUrl({ page: 'overview', region: 'reg-jezero', missionId: savedBundle.missionId }),
    buildMissionUrl({ page: 'science', region: 'reg-jezero', missionId: savedBundle.missionId }),
    buildMissionUrl({
      page: 'route-planner',
      region: 'reg-jezero',
      missionId: savedBundle.missionId,
    }),
  ]

  // Navigate Back to index 1 (?page=science)
  const backUrl = new URL(`http://127.0.0.1:5173${historyStack[1]}`)
  const backParsed = parseMissionUrl(backUrl.search, backUrl.hash)
  const afterBack = missionReducer(savedBundle, {
    type: 'MISSION/SET_PAGE',
    payload: { page: backParsed.page ?? DEFAULT_PAGE_ID },
  })
  assert.equal(afterBack.app.activePage, 'science')

  // Navigate Forward to index 2 (?page=route-planner)
  const fwdUrl = new URL(`http://127.0.0.1:5173${historyStack[2]}`)
  const fwdParsed = parseMissionUrl(fwdUrl.search, fwdUrl.hash)
  const afterForward = missionReducer(afterBack, {
    type: 'MISSION/SET_PAGE',
    payload: { page: fwdParsed.page ?? DEFAULT_PAGE_ID },
  })
  assert.equal(afterForward.app.activePage, 'route-planner')
})

test('parseUrlCoordinate and buildMissionUrl normalize east longitude into [-180, 180)', () => {
  assert.deepEqual(parseUrlCoordinate('?page=twin&region=reg-jezero&lat=18.45&lon=180'), {
    lat: 18.45,
    lon: -180,
  })
  assert.deepEqual(parseUrlCoordinate('?lat=-14.5&lon=360'), {
    lat: -14.5,
    lon: 0,
  })
  assert.equal(parseUrlCoordinate('?lat=95&lon=77.4'), null)
  assert.equal(parseUrlCoordinate('?page=twin'), null)

  const deepLink = buildMissionUrl({
    page: 'digital-twin',
    region: 'reg-jezero',
    coordinate: { lat: 18.45, lon: 180 },
  })
  assert.equal(deepLink, '/?page=digital-twin&region=reg-jezero&lat=18.45&lon=-180')
})

