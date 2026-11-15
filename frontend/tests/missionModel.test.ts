import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_BASE_CAMP,
  DEFAULT_DESTINATION,
  ROUTE_PROFILE_WEIGHTS,
  createDefaultMissionBundle,
  generateMissionId,
  isValidCoordinate,
  isValidEpistemicTag,
  isValidWeights,
  migrateMissionBundle,
  validateMissionBundle,
} from '../src/mission/missionModel.ts'
import { MISSION_SCHEMA_VERSION } from '../src/types/mission.ts'

test('createDefaultMissionBundle creates valid schemaVersion 1.0 bundle with stable ID and epistemic defaults', () => {
  const bundle = createDefaultMissionBundle({
    missionId: 'mission-test-001',
    regionId: 'reg-jezero',
    activePage: 'overview',
    nowIso: '2026-11-13T00:00:00.000Z',
  })

  assert.equal(bundle.schemaVersion, MISSION_SCHEMA_VERSION)
  assert.equal(bundle.missionId, 'mission-test-001')
  assert.equal(bundle.status, 'DRAFT')
  assert.equal(bundle.geographic.regionId, 'reg-jezero')
  assert.equal(bundle.geographic.selectedLocation, null)
  assert.deepEqual(bundle.eva.baseCamp, DEFAULT_BASE_CAMP)
  assert.deepEqual(bundle.eva.destination, DEFAULT_DESTINATION)
  assert.equal(bundle.eva.routeProfile, 'BALANCED')
  assert.deepEqual(bundle.eva.customWeights, ROUTE_PROFILE_WEIGHTS.BALANCED)
  assert.equal(bundle.science.selectedTarget, null)
  assert.deepEqual(bundle.science.savedObservations, [])
  assert.equal(bundle.simulation.activeConfig, null)
  assert.equal(bundle.app.activePage, 'overview')

  const validation = validateMissionBundle(bundle)
  assert.equal(validation.ok, true)
})

test('generateMissionId generates unique non-empty identifiers', () => {
  const ids = new Set<string>()
  for (let i = 0; i < 20; i += 1) {
    const id = generateMissionId()
    assert.ok(id.startsWith('msn-'))
    assert.ok(id.length > 8)
    ids.add(id)
  }
  assert.equal(ids.size, 20)
})

test('isValidCoordinate enforces Martian lat/lon bounds [-90, 90] and [-180, 180]', () => {
  assert.equal(isValidCoordinate({ lat: 18.4446, lon: 77.4509 }), true)
  assert.equal(isValidCoordinate({ lat: -90, lon: -180 }), true)
  assert.equal(isValidCoordinate({ lat: 90, lon: 180 }), true)
  assert.equal(isValidCoordinate({ lat: 91, lon: 0 }), false)
  assert.equal(isValidCoordinate({ lat: 0, lon: -181 }), false)
  assert.equal(isValidCoordinate({ lat: Number.NaN, lon: 77.4 }), false)
  assert.equal(isValidCoordinate(null), false)
})

test('isValidWeights rejects negative, NaN, or non-numeric weights', () => {
  assert.equal(isValidWeights(ROUTE_PROFILE_WEIGHTS.SAFETY_FIRST), true)
  assert.equal(isValidWeights({ w_terrain: 0, w_hazard: 0, w_uncertainty: 0, w_science: 1 }), true)
  assert.equal(
    isValidWeights({ w_terrain: -0.1, w_hazard: 0.5, w_uncertainty: 0.2, w_science: 0.4 }),
    false,
  )
  assert.equal(
    isValidWeights({ w_terrain: Number.NaN, w_hazard: 0.5, w_uncertainty: 0.2, w_science: 0.4 }),
    false,
  )
})

test('isValidEpistemicTag accepts only backend canonical epistemic classifications', () => {
  for (const tag of [
    'OBSERVED',
    'DERIVED',
    'INTERPRETED',
    'PREDICTED',
    'HEURISTIC',
    'SIMULATED',
    'UNKNOWN',
  ]) {
    assert.equal(isValidEpistemicTag(tag), true)
  }
  assert.equal(isValidEpistemicTag('NASA_CERTIFIED'), false)
})

test('validateMissionBundle supports nullable optional fields and rejects invalid regionId safely', () => {
  const base = createDefaultMissionBundle({ missionId: 'msn-null-fields' })
  const validNullable = {
    ...base,
    eva: {
      ...base.eva,
      baseCamp: null,
      destination: null,
    },
  }

  const res = validateMissionBundle(validNullable)
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.equal(res.bundle.geographic.regionId, 'reg-jezero')
    assert.equal(res.bundle.eva.baseCamp, null)
    assert.equal(res.bundle.eva.destination, null)
  }

  const badRegion = validateMissionBundle({
    ...base,
    geographic: {
      ...base.geographic,
      regionId: 'nonexistent-region',
    },
  })
  assert.equal(badRegion.ok, false)
  if (!badRegion.ok) {
    assert.equal(badRegion.reason, 'invalid_geographic')
  }
})

test('migrateMissionBundle handles schemaVersion 1.0 and rejects unsupported versions', () => {
  const valid = createDefaultMissionBundle({ missionId: 'msn-v1' })
  const okRes = migrateMissionBundle(valid)
  assert.equal(okRes.ok, true)

  const futureRes = migrateMissionBundle({ ...valid, schemaVersion: '2.0' })
  assert.equal(futureRes.ok, false)
  if (!futureRes.ok) {
    assert.equal(futureRes.reason, 'unsupported_version')
  }

  const nonObjectRes = migrateMissionBundle('not-an-object')
  assert.equal(nonObjectRes.ok, false)
  if (!nonObjectRes.ok) {
    assert.equal(nonObjectRes.reason, 'not_an_object')
  }
})
