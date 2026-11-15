import assert from 'node:assert/strict'
import test from 'node:test'
import type { CostmapInspectionResponse } from '../src/api/costmap.ts'
import type { LocationHazardInspection } from '../src/api/hazards.ts'
import type { RegionMetadata } from '../src/api/regions.ts'
import type { CandidateTargetFeature, ScienceInspectionResponse } from '../src/api/science.ts'
import type { MultiResInspectResult } from '../src/api/terrain.ts'
import {
  CV_SYNTHETIC_DEMO_DISCLOSURE,
  buildObservationFromInspection,
  checkCoordinateOverwrite,
  featureToMissionTargetRef,
  featureToSortieWaypoint,
  isInsideBounds,
  normalizeEastLon,
  summarizeHazardInspection,
} from '../src/mission/digitalTwinHelpers.ts'
import { initializeMissionBootstrap } from '../src/mission/missionBootstrap.ts'
import {
  DEFAULT_DIGITAL_TWIN_LAYERS,
  VALID_OBS_CATEGORIES,
  createDefaultMissionBundle,
  isCanonicalCoordinate,
  validateMissionBundle,
} from '../src/mission/missionModel.ts'
import { missionReducer } from '../src/mission/missionReducer.ts'
import { type StorageLike, loadMissionDraftResult, saveMissionDraft } from '../src/mission/missionStorage.ts'
import {
  canUseLocalDigitalTwin,
  getRegionCapabilityProfile,
  listAllRegionCapabilities,
} from '../src/mission/regionCapabilities.ts'
import { KNOWN_REGION_IDS } from '../src/navigation/routes.ts'

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
}

test('regionCapabilities enforces strict Jezero-only Digital Twin capability across all 12 Mars regions', () => {
  const allCaps = listAllRegionCapabilities()
  assert.equal(allCaps.length, KNOWN_REGION_IDS.length)
  assert.equal(allCaps.length, 12)

  for (const regionId of KNOWN_REGION_IDS) {
    const caps = getRegionCapabilityProfile(regionId)
    assert.equal(caps.supportsGlobalExploration, true)
    assert.equal(caps.supportsRegionalDossier, true)
    if (regionId === 'reg-jezero') {
      assert.equal(caps.supportsLocalDigitalTwin, true)
      assert.equal(caps.supportsHazardInspection, true)
      assert.equal(caps.supportsEvaRouting, true)
      assert.equal(caps.localTwinPageId, 'digital-twin')
      assert.equal(canUseLocalDigitalTwin(regionId), true)
    } else {
      assert.equal(caps.supportsLocalDigitalTwin, false, `${regionId} must not unlock Digital Twin`)
      assert.equal(caps.supportsHazardInspection, false)
      assert.equal(caps.supportsEvaRouting, false)
      assert.equal(caps.localTwinPageId, null)
      assert.equal(canUseLocalDigitalTwin(regionId), false)
      assert.ok(caps.limitations.length >= 2)
    }
  }

  const unknownCaps = getRegionCapabilityProfile('reg-nonexistent')
  assert.equal(unknownCaps.capabilityTier, 'UNKNOWN_REGION')
  assert.equal(unknownCaps.supportsLocalDigitalTwin, false)
  assert.equal(canUseLocalDigitalTwin('reg-nonexistent'), false)
})

test('regionCapabilities reconciles live RegionMetadata dossiers without promoting orbital regions', () => {
  const galeDossier: RegionMetadata = {
    id: 'reg-gale',
    name: 'Gale Crater (Mount Sharp & Aeolis Palus)',
    canonical_feature_name: 'Gale Crater',
    physiographic_province: 'Aeolis Quadrangle',
    geological_setting: 'Hesperian lacustrine mudstones and central mound.',
    formation_period: 'Noachian–Hesperian',
    center: [-5.37, 137.44],
    bounds: { lat_min: -6.8, lat_max: -4.0, lon_min: 136.0, lon_max: 139.0 },
    dimensions: { width_km: 154, height_km: 154, diameter_km: 154, area_km2: 18600 },
    elevation_range: { min_elevation_m: -4500, max_elevation_m: 1000, datum: 'Mars Areoid' },
    missions: [],
    has_local_digital_twin: false,
    local_twin_page_id: null,
    available_datasets: [
      {
        product_id: 'PLN-SRC-01',
        name: 'MOLA MEGDR',
        instrument_mission: 'MGS MOLA',
        resolution: '14.818 km/px (4 ppd)',
        storage_type: 'VERIFIED_LOCAL',
        epistemic_class: 'OBSERVED',
        source_portal: 'PDS',
        coverage_type: 'Global',
      },
    ],
    scientific_highlights: ['Aeolis Mons stratigraphy'],
    epistemic_class: 'OBSERVED',
  }

  const caps = getRegionCapabilityProfile('reg-gale', galeDossier)
  assert.equal(caps.supportsLocalDigitalTwin, false)
  assert.equal(caps.datasets[0]?.epistemicClass, 'OBSERVED')
  assert.equal(caps.capabilityBadge, 'ORBITAL / REGIONAL CONTEXT ONLY')
})

test('summarizeHazardInspection fails closed on OUT_OF_BOUNDS and NoData without inventing zero risk', () => {
  const outOfBoundsHazard: LocationHazardInspection = {
    coordinate: { lat: 18.0, lon: 76.5 },
    status: 'OUT_OF_BOUNDS',
    is_passable: false,
    hard_restriction_code: 'OUT_OF_STUDY_AREA',
    explanation: 'Location is outside the Jezero Western Delta study footprint.',
  }

  const oobSummary = summarizeHazardInspection(outOfBoundsHazard)
  assert.ok(oobSummary)
  assert.equal(oobSummary.isOutOfBounds, true)
  assert.equal(oobSummary.hasMissingElevationOrNoData, true)
  assert.equal(oobSummary.isPassable, false)
  assert.equal(oobSummary.canPlaceEvaPoint, false)
  assert.equal(oobSummary.epistemicClass, 'UNKNOWN')
  assert.equal(oobSummary.elevationLabel, 'UNMAPPED (NoData)')
  assert.ok(oobSummary.overallHazardLabel.includes('UNKNOWN'))
  assert.ok(!oobSummary.overallHazardLabel.includes('0%'))

  const missingDataHazard: LocationHazardInspection = {
    coordinate: { lat: 18.45, lon: 77.41 },
    elevation_m: null,
    is_passable: false,
    hard_restriction_code: 'NO_DATA_UNKNOWN',
    hard_restriction_codes: ['NO_DATA_UNKNOWN'],
    epistemic_class: 'UNKNOWN',
    explanation: 'Elevation missing.',
  }
  const missingSummary = summarizeHazardInspection(missingDataHazard)
  assert.ok(missingSummary)
  assert.equal(missingSummary.hasMissingElevationOrNoData, true)
  assert.equal(missingSummary.isPassable, false)
  assert.equal(missingSummary.canPlaceEvaPoint, false)
  assert.equal(missingSummary.dataReliabilityLabel, 'UNKNOWN / UNMAPPED')
})

test('summarizeHazardInspection propagates authentic HiRISE/CTX reliability, precision tiers, and epistemic tags', () => {
  const ctxOnlyHazard: LocationHazardInspection = {
    coordinate: { lat: 18.48, lon: 77.32 },
    elevation_m: -2450.2,
    is_passable: false,
    hard_restriction_code: 'UNRESOLVED_RESOLUTION_HAZARD',
    hard_restriction_codes: ['UNRESOLVED_RESOLUTION_HAZARD'],
    overall_hazard_score: 0.28,
    individual_hazards: {
      slope_hazard: 0.12,
      roughness_hazard: 0.18,
      boulder_hazard: 0.25,
      sand_hazard: 0.1,
      crater_hazard: 0.05,
      unknown_hazard: 0.5,
    },
    epistemic_source: 'CTX (20m)',
    data_reliability_index: 0.7,
    data_reliability_level: 'MODERATE',
    detection_reliability_index: 0.52,
    detection_reliability_level: 'LOW_MODERATE',
    nominal_vertical_precision_m: 2.0,
    uncertainty_precision_status: 'PROVISIONAL_UNVERIFIED_NOMINAL_TIER',
    property_epistemic_classes: {
      slope_hazard: 'DERIVED',
      boulder_hazard: 'HEURISTIC',
    },
    resolution_class: 'CTX_20M_COARSE',
    epistemic_class: 'HEURISTIC',
    explanation: 'CTX-only sector; sub-20m obstacles unresolved.',
  }

  const costResp: CostmapInspectionResponse = {
    coordinate: { lat: 18.48, lon: 77.32 },
    elevation_m: -2450.2,
    is_blocked: true,
    combined_cost: null,
    weights_applied: { w_terrain: 0.3, w_hazard: 0.3, w_uncertainty: 0.15, w_science: 0.25 },
    mission_profile: 'BALANCED',
    explanation: 'Hard blocked due to unresolved metre-scale resolution.',
  }

  const terrainResp: MultiResInspectResult = {
    coordinate: {
      lat: 18.48,
      lon: 77.32,
      projected_x_m: 1000,
      projected_y_m: 2000,
      crs_geographic: 'IAU_2015:49900',
      crs_projected: 'ESRI:103885',
    },
    high_resolution_available: false,
    regional_analysis_20m: {
      is_valid: true,
      elevation_m: -2450.2,
      slope_deg: 6.4,
      tri_m: 1.25,
    },
    local_micro_analysis_1m: null,
    provenance_and_metadata: {
      regional_source: 'CTX 20m',
      high_res_source: 'None',
      resampling_policy: 'Conservative max',
      disclaimer: 'Research prototype',
    },
  }

  const scienceResp: ScienceInspectionResponse = {
    coordinate: { lat: 18.48, lon: 77.32 },
    elevation_m: -2450.2,
    composite_opportunity_score: 0.42,
    epistemic_class: 'INTERPRETED',
    explanation: 'Delta contact context.',
    disclaimers: { life_inference: 'Abiotic only', rover_safety: 'Verify hazards' },
  }

  const summary = summarizeHazardInspection(ctxOnlyHazard, costResp, terrainResp, scienceResp)
  assert.ok(summary)
  assert.equal(summary.isUnresolvedResolutionOnly, true)
  assert.equal(summary.isPassable, false)
  assert.equal(summary.canPlaceEvaPoint, true)
  assert.equal(summary.epistemicClass, 'HEURISTIC')
  assert.ok(summary.dataReliabilityLabel.includes('uncalibrated ordinal index'))
  assert.ok(summary.verticalPrecisionLabel.includes('PROVISIONAL_UNVERIFIED_NOMINAL_TIER'))
  assert.ok(summary.slopeHazardLabel.includes('6.4°'))
  assert.ok(summary.roughnessHazardLabel.includes('TRI 1.25 m'))
  assert.ok(summary.scienceScoreLabel.includes('42.0% (INTERPRETED)'))
})

test('coordinate normalization, study bounds, overwrite safeguards, and synthetic CV disclosure work deterministically', () => {
  assert.equal(normalizeEastLon(-0), 0)
  assert.equal(normalizeEastLon(180), -180)
  assert.equal(normalizeEastLon(-282.6).toFixed(1), '77.4')

  const jezeroBounds: [[number, number], [number, number]] = [
    [18.211, 77.1605],
    [18.7212, 77.6992],
  ]
  assert.equal(isInsideBounds({ lat: 18.459, lon: 77.408 }, jezeroBounds), true)
  assert.equal(isInsideBounds({ lat: 17.5, lon: 77.408 }, jezeroBounds), false)

  const overwriteDiff = checkCoordinateOverwrite(
    'destination',
    { lat: 18.4485, lon: 77.432 },
    { lat: 18.459456, lon: 77.408313 },
  )
  assert.equal(overwriteDiff.willOverwrite, true)

  const overwriteSame = checkCoordinateOverwrite(
    'baseCamp',
    { lat: 18.4485, lon: 77.432 },
    { lat: 18.4485, lon: 77.432 },
  )
  assert.equal(overwriteSame.willOverwrite, false)

  assert.ok(CV_SYNTHETIC_DEMO_DISCLOSURE.includes('SYNTHETIC_DEMO_WINDOW'))
})

test('science target queueing, lightweight observations, and EVA context persist cleanly in MissionBundleV1', () => {
  const storage = new MemoryStorage()
  let mission = createDefaultMissionBundle({ regionId: 'reg-jezero', activePage: 'digital-twin' })

  const sampleFeature: CandidateTargetFeature = {
    type: 'Feature',
    id: 'SCI-01-KODIAK',
    geometry: { type: 'Point', coordinates: [77.408313, 18.459456, -2514.4] },
    properties: {
      target_id: 'SCI-01-KODIAK',
      name: 'Kodiak Isolated Delta Remnant Butte',
      rank: 1,
      composite_score: 0.4854,
      primary_science_theme: 'Delta Architecture & Stratigraphy',
      breakdown: {
        mineralogy: 0.438,
        diversity: 0.144,
        layered_features: 0.898,
        delta_context: 0,
        rover_proximity: 0.907,
        confidence: 1,
      },
      epistemic_class: 'INTERPRETED',
      rationale: 'Topset-foreset-bottomset delta beds.',
      safety_caveat: 'Rover tracks do not guarantee EVA safety.',
      life_inference_warning: 'Abiotic alteration only.',
    },
  }

  const targetRef = featureToMissionTargetRef(sampleFeature)
  assert.equal(targetRef.elevationM, -2514.4)
  assert.equal(targetRef.epistemicClass, 'INTERPRETED')

  mission = missionReducer(mission, { type: 'MISSION/SELECT_TARGET', payload: targetRef })
  mission = missionReducer(mission, {
    type: 'MISSION/UPSERT_QUEUED_TARGET',
    payload: featureToSortieWaypoint(sampleFeature),
  })

  const obs = buildObservationFromInspection({
    id: 'obs-kodiak-1',
    coordinate: { lat: 18.459456, lon: 77.408313 },
    category: 'SCIENCE',
    label: 'Kodiak stratigraphic outcrop',
    note: 'Preserve cross-bedded foreset vista for EVA planning',
    regionId: 'reg-jezero',
    hazard: {
      coordinate: { lat: 18.459456, lon: 77.408313 },
      elevation_m: -2514.4,
      is_passable: true,
      hard_restriction_code: null,
      epistemic_source: 'HiRISE (1m)',
      epistemic_class: 'DERIVED',
      explanation: 'Passable terrain.',
    },
    target: sampleFeature,
    recordedAt: '2026-11-13T04:00:00.000Z',
  })

  mission = missionReducer(mission, { type: 'MISSION/UPSERT_OBSERVATION', payload: obs })
  mission = missionReducer(mission, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: 18.459456, lon: 77.408313 },
  })
  mission = missionReducer(mission, {
    type: 'MISSION/SET_PAGE',
    payload: { page: 'route-planner' },
  })

  const saveRes = saveMissionDraft(mission, storage)
  assert.equal(saveRes.ok, true)

  const reloaded = initializeMissionBootstrap({
    search: `?mission=${mission.missionId}&page=route-planner&region=reg-jezero`,
    hash: '',
    storage,
    knownRegions: KNOWN_REGION_IDS,
  })
  assert.equal(reloaded.bundle.app.activePage, 'route-planner')
  assert.equal(reloaded.bundle.science.queuedTargets.length, 1)
  assert.equal(reloaded.bundle.science.queuedTargets[0]?.id, 'SCI-01-KODIAK')
  assert.equal(reloaded.bundle.science.savedObservations.length, 1)
  assert.equal(reloaded.bundle.science.savedObservations[0]?.epistemicClass, 'INTERPRETED')
  assert.equal(reloaded.bundle.eva.destination?.lat, 18.459456)
})

test('F01 & F02: all 5 observation categories including CUSTOM persist cleanly, invalid individual entries do not destroy valid drafts, and provenance stays separated', () => {
  const storage = new MemoryStorage()
  let mission = createDefaultMissionBundle({ regionId: 'reg-jezero', activePage: 'digital-twin' })

  const mockHazard: LocationHazardInspection = {
    coordinate: { lat: 18.451, lon: 77.412 },
    elevation_m: -2520.5,
    is_passable: true,
    hard_restriction_code: null,
    epistemic_source: 'HiRISE_20m + MOLA',
    epistemic_class: 'DERIVED',
    hazard_classification: 'MODERATE',
    overall_hazard_score: 0.31,
    explanation: 'Moderately sloped outcrop apron.',
  }

  for (const [idx, category] of VALID_OBS_CATEGORIES.entries()) {
    const obs = buildObservationFromInspection({
      id: `obs-cat-${category.toLowerCase()}`,
      coordinate: { lat: 18.45 + idx * 0.001, lon: 77.41 },
      category,
      label: `Obs ${category}`,
      note: `Researcher note for ${category}`,
      regionId: 'reg-jezero',
      sourceDataset: category === 'CUSTOM' ? undefined : 'HiRISE_20m_DTM',
      hazard: category === 'CUSTOM' ? null : mockHazard,
      target: null,
      recordedAt: '2026-11-13T04:10:00.000Z',
    })
    if (category === 'CUSTOM') {
      // Uninspected custom point with no target/hazard must never fabricate INTERPRETED
      assert.equal(obs.epistemicClass, 'UNKNOWN')
      assert.equal(obs.derivedSummary, null)
    } else {
      assert.equal(obs.epistemicClass, 'DERIVED')
      assert.equal(obs.hazardClassification, 'MODERATE')
      assert.ok(obs.derivedSummary?.includes('Passability:'))
    }
    assert.equal(obs.userNote, `Researcher note for ${category}`)
    assert.equal(obs.regionId, 'reg-jezero')
    mission = missionReducer(mission, { type: 'MISSION/UPSERT_OBSERVATION', payload: obs })
  }

  assert.equal(mission.science.savedObservations.length, 5)
  assert.equal(saveMissionDraft(mission, storage).ok, true)

  const reloaded = initializeMissionBootstrap({
    search: `?mission=${mission.missionId}&page=digital-twin&region=reg-jezero`,
    storage,
    knownRegions: KNOWN_REGION_IDS,
  })
  assert.equal(reloaded.persistence.loadStatus, 'restored')
  assert.equal(reloaded.bundle.science.savedObservations.length, 5)
  const customReloaded = reloaded.bundle.science.savedObservations.find((o) => o.category === 'CUSTOM')
  assert.ok(customReloaded)
  assert.equal(customReloaded.epistemicClass, 'UNKNOWN')
  assert.equal(customReloaded.userNote, 'Researcher note for CUSTOM')
  assert.equal(customReloaded.derivedSummary, null)

  // Inject one invalid observation element into persisted JSON and ensure valid observations + bundle still recover
  const parsed = JSON.parse(JSON.stringify(mission))
  parsed.science.savedObservations.push({
    id: 'corrupt-obs',
    category: 'BOGUS_CATEGORY',
    label: 'Corrupt',
    coordinate: { lat: 0, lon: 0 },
    summary: 'bad',
    epistemicClass: 'DERIVED',
    recordedAt: '2026-11-13T04:10:00.000Z',
  })
  const partialValidation = validateMissionBundle(parsed, KNOWN_REGION_IDS)
  assert.equal(partialValidation.ok, true)
  if (partialValidation.ok) {
    assert.equal(partialValidation.bundle.science.savedObservations.length, 5)
  }
})

test('F03 & F04: target metadata survives Science Explorer -> MissionContext -> EVA Planner handoff and region switching isolates Jezero state while preserving valid history', () => {
  let mission = createDefaultMissionBundle({ regionId: 'reg-jezero', activePage: 'science' })
  mission = missionReducer(mission, {
    type: 'MISSION/UPDATE_METADATA',
    payload: { name: 'Kodiak Stratigraphy EVA' },
  })

  const feature: CandidateTargetFeature = {
    type: 'Feature',
    id: 'SCI-01-KODIAK',
    geometry: { type: 'Point', coordinates: [77.408313, 18.459456, -2514.4] },
    properties: {
      target_id: 'SCI-01-KODIAK',
      name: 'Kodiak Isolated Delta Remnant Butte',
      rank: 1,
      composite_score: 0.4854,
      primary_science_theme: 'Delta Architecture & Stratigraphy',
      breakdown: {
        mineralogy: 0.438,
        diversity: 0.144,
        layered_features: 0.898,
        delta_context: 0,
        rover_proximity: 0.907,
        confidence: 1,
      },
      epistemic_class: 'INTERPRETED',
      rationale: 'Topset-foreset-bottomset delta beds.',
      safety_caveat: 'Rover tracks do not guarantee EVA safety.',
      life_inference_warning: 'Abiotic alteration only.',
    },
  }

  const wp = featureToSortieWaypoint(feature, 'reg-jezero', 'Priority foreset sample')
  mission = missionReducer(mission, { type: 'MISSION/SELECT_TARGET', payload: featureToMissionTargetRef(feature, 'reg-jezero') })
  mission = missionReducer(mission, { type: 'MISSION/UPSERT_QUEUED_TARGET', payload: wp })
  mission = missionReducer(mission, { type: 'MISSION/SET_WAYPOINTS', payload: [wp] })
  mission = missionReducer(mission, { type: 'MISSION/SET_PAGE', payload: { page: 'route-planner' } })
  mission = missionReducer(mission, {
    type: 'MISSION/UPDATE_MAP_STATE',
    payload: { selectedLocation: { lat: 18.459456, lon: 77.408313 } },
  })

  const obs = buildObservationFromInspection({
    id: 'obs-preserved',
    coordinate: { lat: 18.459456, lon: 77.408313 },
    category: 'SCIENCE',
    label: 'Kodiak foreset outcrop',
    note: 'Historical Jezero note',
    regionId: 'reg-jezero',
    hazard: null,
    target: feature,
  })
  mission = missionReducer(mission, { type: 'MISSION/UPSERT_OBSERVATION', payload: obs })

  assert.equal(mission.app.activePage, 'route-planner')
  assert.equal(mission.eva.waypoints[0]?.id, 'SCI-01-KODIAK')
  assert.equal(mission.eva.waypoints[0]?.elevationM, -2514.4)
  assert.equal(mission.eva.waypoints[0]?.primaryTheme, 'Delta Architecture & Stratigraphy')
  assert.equal(mission.eva.waypoints[0]?.epistemicClass, 'INTERPRETED')
  assert.equal(mission.eva.waypoints[0]?.notes, 'Priority foreset sample')

  // Verify DEFAULT_DIGITAL_TWIN_LAYERS aligns with all 16 backend layers with only 2 active by default
  const layerIds = Object.keys(DEFAULT_DIGITAL_TWIN_LAYERS)
  assert.equal(layerIds.length, 16)
  assert.deepEqual(
    layerIds.filter((id) => DEFAULT_DIGITAL_TWIN_LAYERS[id]).sort(),
    ['ortho_imagery', 'perseverance_traverse'],
  )

  // Switch reg-jezero -> reg-gale: clears Jezero-specific location/target/hazard & updates terrainResolution while keeping history/config
  const gale = missionReducer(mission, { type: 'MISSION/SET_REGION', payload: { regionId: 'reg-gale' } })
  assert.equal(gale.geographic.regionId, 'reg-gale')
  assert.equal(gale.geographic.selectedLocation, null)
  assert.equal(gale.science.selectedTarget, null)
  assert.equal(gale.science.selectedHazard, null)
  assert.equal(gale.name, 'Kodiak Stratigraphy EVA')
  assert.equal(gale.science.savedObservations.length, 1)
  assert.equal(gale.geographic.terrainResolution, getRegionCapabilityProfile('reg-gale').primaryResolutionSummary)

  // Switching back to reg-jezero restores Jezero resolution tier cleanly
  const backJezero = missionReducer(gale, { type: 'MISSION/SET_REGION', payload: { regionId: 'reg-jezero' } })
  assert.equal(backJezero.geographic.regionId, 'reg-jezero')
  assert.equal(backJezero.geographic.terrainResolution, '20m ARD / 1m HiRISE')

  // Clear queue action
  const cleared = missionReducer(backJezero, { type: 'MISSION/CLEAR_QUEUED_TARGETS' })
  assert.equal(cleared.science.queuedTargets.length, 0)
})

test('F06: longitude normalization [-180, 180) edges and fail-closed bounds / missing metadata checks', () => {
  assert.equal(normalizeEastLon(180), -180)
  assert.equal(normalizeEastLon(-180), -180)
  assert.equal(normalizeEastLon(179.9999), 179.9999)
  assert.equal(normalizeEastLon(-179.9999), -179.9999)
  assert.ok(Math.abs(normalizeEastLon(180.0001) - -179.9999) < 1e-6)
  assert.ok(Math.abs(normalizeEastLon(-180.0001) - 179.9999) < 1e-6)
  assert.equal(Object.is(normalizeEastLon(-0), -0), false)

  assert.equal(isCanonicalCoordinate({ lat: 0, lon: -180 }), true)
  assert.equal(isCanonicalCoordinate({ lat: 0, lon: 180 }), false)

  // Fail closed when study bounds are missing or undefined
  assert.equal(isInsideBounds({ lat: 18.45, lon: 77.45 }, null), false)
  assert.equal(isInsideBounds({ lat: 18.45, lon: 77.45 }, undefined), false)

  const jezeroBounds: [[number, number], [number, number]] = [
    [18.38, 77.32],
    [18.54, 77.54],
  ]
  assert.equal(isInsideBounds({ lat: 18.45, lon: 77.45 }, jezeroBounds), true)
  assert.equal(isInsideBounds({ lat: 18.99, lon: 77.45 }, jezeroBounds), false)

  // Reducer & storage normalize 180 -> -180 consistently
  const storage = new MemoryStorage()
  let mission = createDefaultMissionBundle({ regionId: 'reg-jezero', activePage: 'digital-twin' })
  mission = missionReducer(mission, {
    type: 'MISSION/SET_BASE_CAMP',
    payload: { lat: 18.45, lon: 180 },
  })
  assert.equal(mission.eva.baseCamp?.lon, -180)

  saveMissionDraft(mission, storage)
  const loaded = loadMissionDraftResult(storage, mission.missionId, KNOWN_REGION_IDS)
  assert.equal(loaded.status, 'restored')
  assert.equal(loaded.bundle?.eva.baseCamp?.lon, -180)
})

