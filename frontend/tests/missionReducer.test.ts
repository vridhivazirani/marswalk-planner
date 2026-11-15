import assert from 'node:assert/strict'
import test from 'node:test'
import { ROUTE_PROFILE_WEIGHTS, createDefaultMissionBundle } from '../src/mission/missionModel.ts'
import { missionReducer } from '../src/mission/missionReducer.ts'

test('missionReducer performs immutable updates on coordinates, layers, metadata, and region', () => {
  const initial = createDefaultMissionBundle({
    missionId: 'msn-red-1',
    nowIso: '2026-11-13T01:00:00.000Z',
  })

  const renamed = missionReducer(initial, {
    type: 'MISSION/UPDATE_METADATA',
    payload: { name: 'Delta Rim Survey', status: 'ACTIVE' },
    nowIso: '2026-11-13T01:05:00.000Z',
  })
  assert.notEqual(renamed, initial)
  assert.equal(initial.name, 'Jezero Exploration Draft')
  assert.equal(renamed.name, 'Delta Rim Survey')
  assert.equal(renamed.status, 'ACTIVE')
  assert.equal(renamed.updatedAt, '2026-11-13T01:05:00.000Z')

  const toggled = missionReducer(renamed, {
    type: 'MISSION/TOGGLE_LAYER',
    payload: 'overall_hazard',
    nowIso: '2026-11-13T01:06:00.000Z',
  })
  assert.equal(renamed.geographic.activeLayers.overall_hazard, false)
  assert.equal(toggled.geographic.activeLayers.overall_hazard, true)

  const regionChanged = missionReducer(toggled, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-gusev' },
    nowIso: '2026-11-13T01:07:00.000Z',
  })
  assert.equal(regionChanged.geographic.regionId, 'reg-gusev')

  // Invalid region should be ignored (no-op)
  const badRegion = missionReducer(regionChanged, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-unknown-mars' },
  })
  assert.equal(badRegion, regionChanged)
})

test('missionReducer updates EVA route profile and switches to CUSTOM when weights change', () => {
  const initial = createDefaultMissionBundle({ missionId: 'msn-red-2' })

  const safety = missionReducer(initial, {
    type: 'MISSION/SET_ROUTE_PROFILE',
    payload: 'SAFETY_FIRST',
    nowIso: '2026-11-13T02:00:00.000Z',
  })
  assert.equal(safety.eva.routeProfile, 'SAFETY_FIRST')
  assert.deepEqual(safety.eva.customWeights, ROUTE_PROFILE_WEIGHTS.SAFETY_FIRST)

  const custom = missionReducer(safety, {
    type: 'MISSION/SET_CUSTOM_WEIGHTS',
    payload: { w_terrain: 0.25, w_hazard: 0.45, w_uncertainty: 0.2, w_science: 0.1 },
    nowIso: '2026-11-13T02:01:00.000Z',
  })
  assert.equal(custom.eva.routeProfile, 'CUSTOM')
  assert.equal(custom.eva.customWeights.w_hazard, 0.45)
})

test('missionReducer manages observations, queued science targets, and resets draft with new ID', () => {
  const initial = createDefaultMissionBundle({
    missionId: 'msn-red-3',
    regionId: 'reg-jezero',
  })

  const withObs = missionReducer(initial, {
    type: 'MISSION/UPSERT_OBSERVATION',
    payload: {
      id: 'obs-1',
      category: 'SCIENCE',
      label: 'Carbonate Bench',
      coordinate: { lat: 18.45, lon: 77.42 },
      summary: 'Strong Mg-carbonate absorption feature noted.',
      epistemicClass: 'INTERPRETED',
      recordedAt: '2026-11-13T02:10:00.000Z',
    },
  })
  assert.equal(withObs.science.savedObservations.length, 1)

  const removedObs = missionReducer(withObs, {
    type: 'MISSION/REMOVE_OBSERVATION',
    payload: 'obs-1',
  })
  assert.equal(removedObs.science.savedObservations.length, 0)

  const reset = missionReducer(withObs, {
    type: 'MISSION/RESET_DRAFT',
    payload: { regionId: 'reg-hellas', activePage: 'science' },
  })
  assert.notEqual(reset.missionId, initial.missionId)
  assert.equal(reset.geographic.regionId, 'reg-hellas')
  assert.equal(reset.app.activePage, 'science')
  assert.equal(reset.science.savedObservations.length, 0)
})
