import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultMissionBundle,
  validateMissionBundle,
  migrateMissionBundle,
} from '../src/mission/missionModel.ts'
import { missionReducer } from '../src/mission/missionReducer.ts'
import type { MissionRouteDecision, MissionSortieWaypoint } from '../src/types/mission.ts'

test('M0.4.4: MISSION/SELECT_ROUTE commits decision and populates selectedRouteDecision', () => {
  const initial = createDefaultMissionBundle()
  assert.equal(initial.eva.selectedRouteDecision, null)
  assert.equal(initial.eva.selectedComparisonRouteId, null)

  const decisionPayload = {
    routeId: 'ROUTE-BALANCED-ASTAR',
    profileName: 'BALANCED',
    metricsSummary: {
      totalDistanceM: 3903.68,
      estimatedDurationMin: 65.1,
      meanHazardPct: 18.4,
      meanScienceScore: 0.385,
      preferenceUtilityScore: 0.762,
      rankUnderPreferences: 1,
    },
    visitedTargetIds: ['SCI-01-KODIAK'],
    scientificTargetsCount: 1,
  }

  const state1 = missionReducer(initial, {
    type: 'MISSION/SELECT_ROUTE',
    payload: decisionPayload,
    nowIso: '2026-11-15T12:00:00Z',
  })

  assert.equal(state1.eva.selectedComparisonRouteId, 'ROUTE-BALANCED-ASTAR')
  assert.ok(state1.eva.selectedRouteDecision)
  assert.equal(state1.eva.selectedRouteDecision.routeId, 'ROUTE-BALANCED-ASTAR')
  assert.equal(state1.eva.selectedRouteDecision.profileName, 'BALANCED')
  assert.equal(state1.eva.selectedRouteDecision.isStale, false)
  assert.equal(state1.eva.selectedRouteDecision.staleReason, null)
  assert.deepEqual(state1.eva.selectedRouteDecision.visitedTargetIds, ['SCI-01-KODIAK'])
  assert.equal(state1.eva.selectedRouteDecision.scientificTargetsCount, 1)
  assert.equal(state1.eva.selectedRouteDecision.metricsSummary.rankUnderPreferences, 1)

  // Clear selected route
  const state2 = missionReducer(state1, {
    type: 'MISSION/CLEAR_SELECTED_ROUTE',
    nowIso: '2026-11-15T12:05:00Z',
  })
  assert.equal(state2.eva.selectedRouteDecision, null)
  assert.equal(state2.eva.selectedComparisonRouteId, null)
})

test('M0.4.4: Stale route decision detection when base camp, destination, or waypoints change', () => {
  const initial = createDefaultMissionBundle()

  const decisionPayload = {
    routeId: 'ROUTE-SCIENCE_FIRST-ASTAR',
    profileName: 'SCIENCE_FIRST',
    metricsSummary: {
      totalDistanceM: 4200.0,
      estimatedDurationMin: 72.0,
      meanHazardPct: 22.0,
      meanScienceScore: 0.51,
      preferenceUtilityScore: 0.81,
      rankUnderPreferences: 1,
    },
    visitedTargetIds: ['SCI-01-KODIAK', 'SCI-02-HAWKSBILL'],
    scientificTargetsCount: 2,
  }

  const selected = missionReducer(initial, {
    type: 'MISSION/SELECT_ROUTE',
    payload: decisionPayload,
  })

  // 1. Changing Base Camp triggers isStale = true
  const stateBaseChanged = missionReducer(selected, {
    type: 'MISSION/SET_BASE_CAMP',
    payload: { lat: 18.4450, lon: 77.4515 },
  })
  assert.ok(stateBaseChanged.eva.selectedRouteDecision)
  assert.equal(stateBaseChanged.eva.selectedRouteDecision.isStale, true)
  assert.match(stateBaseChanged.eva.selectedRouteDecision.staleReason ?? '', /Base camp/)

  // 2. Changing Destination triggers isStale = true
  const stateDestChanged = missionReducer(selected, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: 18.4560, lon: 77.4060 },
  })
  assert.ok(stateDestChanged.eva.selectedRouteDecision)
  assert.equal(stateDestChanged.eva.selectedRouteDecision.isStale, true)
  assert.match(stateDestChanged.eva.selectedRouteDecision.staleReason ?? '', /Destination/)

  // 3. Changing Waypoints triggers isStale = true
  const wp: MissionSortieWaypoint = {
    id: 'SCI-01-KODIAK',
    name: 'Kodiak Butte',
    lat: 18.459456,
    lon: 77.408313,
    regionId: 'reg-jezero',
  }
  const stateWpChanged = missionReducer(selected, {
    type: 'MISSION/SET_WAYPOINTS',
    payload: [wp],
  })
  assert.ok(stateWpChanged.eva.selectedRouteDecision)
  assert.equal(stateWpChanged.eva.selectedRouteDecision.isStale, true)
  assert.match(stateWpChanged.eva.selectedRouteDecision.staleReason ?? '', /Sortie waypoints/)

  // 4. Changing Region clears the decision entirely (no cross-region phantom decisions)
  const stateRegionChanged = missionReducer(selected, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-gale' },
  })
  assert.equal(stateRegionChanged.eva.selectedRouteDecision, null)
  assert.equal(stateRegionChanged.eva.selectedComparisonRouteId, null)
})

test('M0.4.4: MissionBundleV1 serialization, validation, and migration preserves route decisions', () => {
  const initial = createDefaultMissionBundle()

  const decision: MissionRouteDecision = {
    routeId: 'ROUTE-BALANCED-ASTAR',
    profileName: 'BALANCED',
    selectedAt: '2026-11-15T12:00:00Z',
    metricsSummary: {
      totalDistanceM: 3500.0,
      estimatedDurationMin: 58.0,
      meanHazardPct: 15.0,
      meanScienceScore: 0.35,
      preferenceUtilityScore: 0.74,
      rankUnderPreferences: 1,
    },
    visitedTargetIds: ['SCI-01-KODIAK'],
    scientificTargetsCount: 1,
    isStale: false,
    staleReason: null,
  }

  const bundleWithDecision = {
    ...initial,
    eva: {
      ...initial.eva,
      selectedComparisonRouteId: 'ROUTE-BALANCED-ASTAR',
      selectedRouteDecision: decision,
    },
  }

  // 1. JSON Round-Trip
  const serialized = JSON.stringify(bundleWithDecision)
  const deserialized = JSON.parse(serialized)

  // 2. Validate
  const valResult = validateMissionBundle(deserialized)
  assert.ok(valResult.ok, 'Validation failed')
  assert.ok(valResult.bundle)
  assert.equal(valResult.bundle.eva.selectedRouteDecision?.routeId, 'ROUTE-BALANCED-ASTAR')
  assert.equal(valResult.bundle.eva.selectedRouteDecision?.scientificTargetsCount, 1)
  assert.deepEqual(valResult.bundle.eva.selectedRouteDecision?.visitedTargetIds, ['SCI-01-KODIAK'])

  // 3. Migration compatibility with legacy bundles missing selectedRouteDecision
  const legacyBundleRaw = JSON.parse(JSON.stringify(initial))
  delete (legacyBundleRaw.eva as Record<string, unknown>).selectedRouteDecision
  const migrated = migrateMissionBundle(legacyBundleRaw)
  assert.ok(migrated.ok)
  assert.equal(migrated.bundle?.eva.selectedRouteDecision, null)
})

