import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDefaultMissionBundle,
  validateMissionBundle,
  migrateMissionBundle,
} from '../src/mission/missionModel.ts'
import { missionReducer } from '../src/mission/missionReducer.ts'
import type {
  MissionSimulationRecord,
  MissionEnvironmentalSummary,
  MissionContingencyRecord,
} from '../src/types/mission.ts'

test('M0.4.5: Reducer records simulation, environmental report, and toggles modifiers', () => {
  const initial = createDefaultMissionBundle({ regionId: 'reg-jezero' })
  assert.equal(initial.simulation.latestSimulation, null)
  assert.equal(initial.simulation.latestEnvironmental, null)
  assert.equal(initial.simulation.applyEnvironmentalModifiers, false)
  assert.deepEqual(initial.simulation.testedContingencies, [])

  // 1. Record Simulation Result
  const simRecord: MissionSimulationRecord = {
    simulatedAt: '2026-11-15T12:00:00Z',
    routeId: 'EVA-PLAN-ROUTE-BALANCED-ASTAR',
    profileName: 'BALANCED',
    isRoundTrip: true,
    isMultiDestination: false,
    totalDistanceKm: 7.8,
    totalDurationHours: 4.5,
    walkingMinutes: 180,
    scienceMinutes: 30,
    restMinutes: 30,
    reserveMinutes: 30,
    o2ConsumedG: 340.5,
    o2RemainingG: 859.5,
    o2MarginPct: 71.6,
    batteryConsumedWh: 675.0,
    batteryRemainingWh: 1125.0,
    batteryMarginPct: 62.5,
    metabolicKcal: 1450.0,
    averageMetabolicWatts: 245.0,
    isFeasible: true,
    warningsCount: 0,
    warnings: [],
    environmentalModifierApplied: false,
  }

  const s1 = missionReducer(initial, {
    type: 'MISSION/RECORD_SIMULATION_RESULT',
    payload: simRecord,
  })
  assert.deepEqual(s1.simulation.latestSimulation, simRecord)

  // 2. Record Environmental Report
  const envReport: MissionEnvironmentalSummary = {
    evaluatedAt: '2026-11-15T12:05:00Z',
    scenarioId: 'SIM-ENV-001-MIDDAY-CALM',
    title: 'Midday Jezero Sol Thermal Window',
    suitabilityScore: 0.88,
    suitabilityCategory: 'OPTIMAL',
    airTemperatureC: -45.0,
    dustOpticalDepthTau: 0.35,
    windSpeedMps: 6.0,
    warnings: [],
  }

  const s2 = missionReducer(s1, {
    type: 'MISSION/RECORD_ENVIRONMENTAL_REPORT',
    payload: envReport,
  })
  assert.deepEqual(s2.simulation.latestEnvironmental, envReport)
  assert.equal(s2.simulation.environmentalScenarioId, 'SIM-ENV-001-MIDDAY-CALM')

  // 3. Toggle Environmental Modifiers
  const s3 = missionReducer(s2, {
    type: 'MISSION/TOGGLE_ENVIRONMENTAL_MODIFIERS',
  })
  assert.equal(s3.simulation.applyEnvironmentalModifiers, true)

  const s4 = missionReducer(s3, {
    type: 'MISSION/TOGGLE_ENVIRONMENTAL_MODIFIERS',
    payload: false,
  })
  assert.equal(s4.simulation.applyEnvironmentalModifiers, false)
})

test('M0.4.5: Contingency test logging and clearing in MissionContext reducer', () => {
  const initial = createDefaultMissionBundle({ regionId: 'reg-jezero' })

  const cont1: MissionContingencyRecord = {
    testedAt: '2026-11-15T12:15:00Z',
    incidentId: 'SIM-HAZ-001-BOULDER',
    incidentTitle: 'Fresh Escarpment Boulder Fall',
    incidentType: 'NEW_BOULDER_FIELD',
    severity: 'HIGH',
    incidentLocation: { lat: 18.4485, lon: 77.4320 },
    progressAlongRoutePct: 0.45,
    isRouteAffected: true,
    detourDistanceM: 8120,
    deltaDistanceM: 320,
    detourDurationMin: 185.0,
    deltaDurationMin: 15.0,
    additionalO2G: 22.5,
    additionalBatteryWh: 45.0,
    actionTaken: 'REROUTE',
    isFeasible: true,
    reasoning: 'Rerouted successfully around rockfall block.',
  }

  const cont2: MissionContingencyRecord = {
    testedAt: '2026-11-15T12:30:00Z',
    incidentId: 'SIM-ABORT-001',
    incidentTitle: 'Immediate Return to Base',
    incidentType: 'SUIT_WARNING_ABORT',
    severity: 'CRITICAL',
    incidentLocation: { lat: 18.4510, lon: 77.4200 },
    progressAlongRoutePct: 0.60,
    isRouteAffected: true,
    detourDistanceM: 4200,
    deltaDistanceM: -3600,
    detourDurationMin: 95.0,
    deltaDurationMin: -75.0,
    additionalO2G: -50.0,
    additionalBatteryWh: -100.0,
    actionTaken: 'ABORT_TO_BASE',
    isFeasible: true,
    reasoning: 'Direct safe corridor back to base camp.',
  }

  // Log first contingency
  const s1 = missionReducer(initial, {
    type: 'MISSION/LOG_CONTINGENCY_TEST',
    payload: cont1,
  })
  assert.equal(s1.simulation.testedContingencies?.length, 1)
  assert.equal(s1.simulation.contingencyScenarioId, 'SIM-HAZ-001-BOULDER')

  // Log second contingency (prepended)
  const s2 = missionReducer(s1, {
    type: 'MISSION/LOG_CONTINGENCY_TEST',
    payload: cont2,
  })
  assert.equal(s2.simulation.testedContingencies?.length, 2)
  assert.equal(s2.simulation.testedContingencies?.[0].incidentId, 'SIM-ABORT-001')

  // Clear contingency tests
  const s3 = missionReducer(s2, {
    type: 'MISSION/CLEAR_CONTINGENCY_TESTS',
  })
  assert.deepEqual(s3.simulation.testedContingencies, [])
  assert.equal(s3.simulation.contingencyScenarioId, null)
})

test('M0.4.5: Region switch isolates Jezero simulation state while preserving valid context', () => {
  const initial = createDefaultMissionBundle({ regionId: 'reg-jezero' })

  const cont: MissionContingencyRecord = {
    testedAt: '2026-11-15T12:15:00Z',
    incidentId: 'SIM-HAZ-001-BOULDER',
    incidentTitle: 'Fresh Escarpment Boulder Fall',
    incidentType: 'NEW_BOULDER_FIELD',
    severity: 'HIGH',
    incidentLocation: { lat: 18.4485, lon: 77.4320 },
    progressAlongRoutePct: 0.45,
    isRouteAffected: true,
    detourDistanceM: 8120,
    deltaDistanceM: 320,
    detourDurationMin: 185.0,
    deltaDurationMin: 15.0,
    additionalO2G: 22.5,
    additionalBatteryWh: 45.0,
    actionTaken: 'REROUTE',
    isFeasible: true,
    reasoning: 'Rerouted around boulder.',
  }

  const s1 = missionReducer(initial, {
    type: 'MISSION/LOG_CONTINGENCY_TEST',
    payload: cont,
  })
  assert.equal(s1.simulation.testedContingencies?.length, 1)

  // Switch to Gale Crater (orbital-only region)
  const s2 = missionReducer(s1, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-gale' },
  })
  // Simulation results and contingencies should be cleared in non-EVA region
  assert.deepEqual(s2.simulation.testedContingencies, [])
  assert.equal(s2.simulation.latestSimulation, null)
})

test('M0.4.5: Validation and migration preserves simulation and contingency state', () => {
  const bundle = createDefaultMissionBundle({ regionId: 'reg-jezero' })
  bundle.simulation.applyEnvironmentalModifiers = true
  bundle.simulation.latestSimulation = {
    simulatedAt: '2026-11-15T12:00:00Z',
    routeId: 'ROUTE-BALANCED-ASTAR',
    profileName: 'BALANCED',
    isRoundTrip: true,
    isMultiDestination: false,
    totalDistanceKm: 7.8,
    totalDurationHours: 4.5,
    walkingMinutes: 180,
    scienceMinutes: 30,
    restMinutes: 30,
    reserveMinutes: 30,
    o2ConsumedG: 340.5,
    o2RemainingG: 859.5,
    o2MarginPct: 71.6,
    batteryConsumedWh: 675.0,
    batteryRemainingWh: 1125.0,
    batteryMarginPct: 62.5,
    metabolicKcal: 1450.0,
    averageMetabolicWatts: 245.0,
    isFeasible: true,
    warningsCount: 0,
    warnings: [],
    environmentalModifierApplied: true,
  }

  // 1. Serialize & deserialize
  const json = JSON.stringify(bundle)
  const parsed = JSON.parse(json)

  // 2. Validate
  const valResult = validateMissionBundle(parsed)
  assert.ok(valResult.ok, 'Validation failed')
  assert.equal(valResult.bundle.simulation.applyEnvironmentalModifiers, true)
  assert.equal(valResult.bundle.simulation.latestSimulation?.routeId, 'ROUTE-BALANCED-ASTAR')
  assert.equal(valResult.bundle.simulation.latestSimulation?.environmentalModifierApplied, true)

  // 3. Migrate legacy bundle missing new simulation fields
  const legacyBundleRaw = JSON.parse(JSON.stringify(bundle))
  delete legacyBundleRaw.simulation.latestSimulation
  delete legacyBundleRaw.simulation.latestEnvironmental
  delete legacyBundleRaw.simulation.applyEnvironmentalModifiers
  delete legacyBundleRaw.simulation.testedContingencies

  const migResult = migrateMissionBundle(legacyBundleRaw)
  assert.ok(migResult.ok, 'Migration failed')
  assert.equal(migResult.bundle.simulation.latestSimulation, null)
  assert.equal(migResult.bundle.simulation.applyEnvironmentalModifiers, false)
  assert.deepEqual(migResult.bundle.simulation.testedContingencies, [])
})

