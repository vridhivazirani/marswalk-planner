import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AtlasMapEntry,
  CRISMIndexDTO,
  CRISMTargetedSceneDTO,
  GeologicUnitDTO,
  GlobalGeologicUnitDTO,
} from '../src/api/atlas.ts'
import {
  AUTHENTIC_PLANETARY_DATASETS,
  type PlanetaryDatasetProduct,
} from '../src/api/catalog.ts'
import type { CandidateTargetFeature } from '../src/api/science.ts'
import {
  featureToMissionTargetRef,
  featureToSortieWaypoint,
  formatMarsCoordinate,
} from '../src/mission/digitalTwinHelpers.ts'
import {
  createDefaultMissionBundle,
  validateMissionBundle,
} from '../src/mission/missionModel.ts'
import { missionReducer } from '../src/mission/missionReducer.ts'
import { loadMissionDraftResult, saveMissionDraft } from '../src/mission/missionStorage.ts'
import {
  evaluateEvaConfigCompatibility,
  getRegionCapabilityProfile,
  isTargetCompatibleWithRegion,
  listAllRegionCapabilities,
} from '../src/mission/regionCapabilities.ts'
import {
  GLOBAL_SCOPE_REGION_ID,
  JEZERO_SOURCE_REGION_ID,
  RESEARCH_NOTES_LEGACY_STORAGE_KEY,
  atlasEntryToMissionRef,
  buildCrismIndexObservation,
  buildGeologicUnitObservation,
  buildGeologyObservation,
  buildScienceTargetObservation,
  buildTargetGeologyHandoffRef,
  crismIndexToMissionRef,
  crismSceneToMissionRef,
  datasetDossierToMissionRef,
  datasetSupportsRegion,
  geologyUnitToMissionRef,
  globalGeologyUnitToMissionRef,
  inferTargetGeologyThemes,
  mapAtlasEntryToStorageCategory,
  matchScienceTargetsForKeywords,
  normalizeDatasetEpistemicTag,
  normalizeStorageCategory,
  readLegacyScienceFieldNotes,
  resolveGeologicalTargetMatches,
} from '../src/mission/scienceWorkflowHelpers.ts'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

const SAMPLE_TARGET: CandidateTargetFeature = {
  type: 'Feature',
  id: 'SCI-01-KODIAK',
  geometry: {
    type: 'Point',
    coordinates: [77.3812, 18.4315, -2488.4],
  },
  properties: {
    target_id: 'SCI-01-KODIAK',
    name: 'Kodiak Delta Escarpment',
    rank: 1,
    composite_score: 0.892,
    primary_science_theme: 'Carbonate & Phyllosilicate Delta Stratigraphy',
    breakdown: {
      mineralogy: 0.91,
      diversity: 0.88,
      layered_features: 0.94,
      delta_context: 0.95,
      rover_proximity: 0.72,
      confidence: 0.98,
    },
    epistemic_class: 'INTERPRETED',
    rationale: 'Preserves bottomset clay-carbonate beds below prograding delta topset.',
    safety_caveat: 'Steep scarp apron requires 1m HiRISE verification before EVA.',
    life_inference_warning: 'Mineralogy indicates aqueous alteration, not confirmed biosignatures.',
  },
}

test('target metadata, field notes, and sortie queue handoff survive reducer and storage round-trip', () => {
  const storage = new MemoryStorage()
  let state = createDefaultMissionBundle({ regionId: 'reg-jezero', activePage: 'science' })

  const ref = featureToMissionTargetRef(SAMPLE_TARGET, 'reg-jezero')
  state = missionReducer(state, { type: 'MISSION/SELECT_TARGET', payload: ref })
  state = missionReducer(state, {
    type: 'MISSION/SET_TARGET_NOTE',
    payload: { targetId: 'SCI-01-KODIAK', note: 'Verify bottomset bedding dip at base of scarp.' },
  })

  const waypoint = featureToSortieWaypoint(
    SAMPLE_TARGET,
    'reg-jezero',
    state.science.targetNotes?.['SCI-01-KODIAK'],
  )
  state = missionReducer(state, { type: 'MISSION/UPSERT_QUEUED_TARGET', payload: waypoint })
  state = missionReducer(state, { type: 'MISSION/SET_WAYPOINTS', payload: state.science.queuedTargets })
  state = missionReducer(state, { type: 'MISSION/SET_PAGE', payload: { page: 'route-planner' } })

  const saved = saveMissionDraft(state, storage)
  assert.equal(saved.ok, true)

  const reloaded = loadMissionDraftResult(storage)
  assert.equal(reloaded.status, 'restored')
  assert.ok(reloaded.bundle)
  assert.equal(reloaded.bundle.science.selectedTarget?.targetId, 'SCI-01-KODIAK')
  assert.equal(
    reloaded.bundle.science.selectedTarget?.sourceDataset,
    'jezero_western_delta_20m_science_targets.json',
  )
  assert.equal(
    reloaded.bundle.science.targetNotes?.['SCI-01-KODIAK'],
    'Verify bottomset bedding dip at base of scarp.',
  )
  assert.equal(reloaded.bundle.science.queuedTargets[0]?.notes, 'Verify bottomset bedding dip at base of scarp.')
  assert.equal(reloaded.bundle.eva.waypoints[0]?.id, 'SCI-01-KODIAK')
  assert.equal(reloaded.bundle.app.activePage, 'route-planner')
})

test('scientific and geological observations preserve epistemic tags and separate userNote vs derivedSummary', () => {
  const storage = new MemoryStorage()
  let state = createDefaultMissionBundle({ regionId: 'reg-jezero', activePage: 'geology' })

  const sciObs = buildScienceTargetObservation(
    SAMPLE_TARGET,
    'reg-jezero',
    'Priority core sample station',
  )
  assert.equal(sciObs.category, 'SCIENCE')
  assert.equal(sciObs.epistemicClass, 'INTERPRETED')
  assert.equal(sciObs.userNote, 'Priority core sample station')
  assert.ok(sciObs.derivedSummary?.includes('89.2%'))

  const geoObs = buildGeologyObservation({
    featureId: 'FRT00005850',
    label: 'CRISM FRT00005850: Western Delta Front',
    coordinate: { lat: 18.44, lon: 77.41 },
    regionId: 'reg-jezero',
    derivedSummary: 'Minerals: Mg-Carbonate, Fe/Mg-Smectite',
    epistemicRaw: 'OBSERVED',
    sourceDataset: 'urn:nasa:pds:crism_mtrdr:frt00005850_07_if166l_trr3',
    provenance: 'PDS Geosciences Node CRISM targeted summary metadata',
  })
  assert.equal(geoObs.category, 'GEOLOGY')
  assert.equal(geoObs.epistemicClass, 'OBSERVED')

  state = missionReducer(state, { type: 'MISSION/UPSERT_OBSERVATION', payload: sciObs })
  state = missionReducer(state, { type: 'MISSION/UPSERT_OBSERVATION', payload: geoObs })
  saveMissionDraft(state, storage)

  const reloaded = loadMissionDraftResult(storage)
  assert.equal(reloaded.status, 'restored')
  assert.equal(reloaded.bundle?.science.savedObservations.length, 2)
  assert.equal(reloaded.bundle?.science.savedObservations[0]?.category, 'SCIENCE')
  assert.equal(reloaded.bundle?.science.savedObservations[1]?.category, 'GEOLOGY')
})

test('dataset pinning, storage categories, and region matching maintain strict provenance boundaries', () => {
  assert.equal(normalizeDatasetEpistemicTag('CLIMATE_MODELED'), 'SIMULATED')
  assert.equal(normalizeDatasetEpistemicTag(undefined), 'UNKNOWN')
  assert.equal(normalizeDatasetEpistemicTag('FABRICATED_TAG'), 'UNKNOWN')

  assert.equal(normalizeStorageCategory('LOCAL_RAW', true, 'OBSERVED'), 'LOCAL_RAW')
  assert.equal(normalizeStorageCategory(undefined, false, 'OBSERVED'), 'STATIC_METADATA')
  assert.equal(normalizeStorageCategory(undefined, undefined, 'CLIMATE_MODELED'), 'MODEL_SIMULATED')
  assert.equal(normalizeStorageCategory(undefined, undefined, undefined), 'UNKNOWN')

  const coreSimProduct: PlanetaryDatasetProduct = {
    id: 'product-10',
    title: 'Mars Climate Database (MCD v6.1) Jezero Regional Model',
    agency: 'LMD-CNRS',
    instrument: 'GCM',
    doiOrUrn: 'MCD_v6.1_LMD_CNRS_ESA',
    resolution: '5.625° x 3.75°',
    coverage: 'Jezero Crater across Ls 0-360',
    crs: 'Mars Sphere',
    verticalDatum: 'Mars Areoid',
    fileFormat: 'NetCDF4',
    decision: 'ACCEPT',
    role: 'Seasonal modeling',
    caveats: 'Numerical simulation only.',
    officialUrl: 'http://www-mars.lmd.jussieu.fr/mcd_python/',
    isIngested: false,
    epistemicClass: 'SIMULATED',
    storageCategory: 'MODEL_SIMULATED',
    supportsRegions: ['all'],
  }

  const atlasDerivedEntry: AtlasMapEntry = {
    id: 'pln-drv-01',
    canonical_id: 'PLN-DRV-01',
    name: '20m Slope Derivative Grid',
    category: 'terrain',
    category_name: 'Terrain',
    category_icon: 'mountain',
    product_type: 'DRV',
    epistemic_class: 'DERIVED',
    instrument_mission: 'CTX 20m DTM',
    source_organisation: 'Marswalk ARD',
    source: 'Marswalk ARD',
    product_identifier: 'jezero_slope_20m',
    doi_or_url: 'internal://ard',
    original_spatial_resolution: '20m',
    resolution: '20m',
    processing_resolution: '20m',
    spatial_coverage: 'Jezero Western Delta',
    coverage: 'Jezero Western Delta',
    coverage_bounds: [
      [18.15, 77.2],
      [18.65, 77.65],
    ],
    crs: 'Equirectangular',
    vertical_datum: 'Mars Areoid',
    processing_history: 'Horn slope',
    processing_status: 'PROCESSED_READY',
    licence_attribution: 'CC-BY',
    validation_status: 'VERIFIED',
    known_limitations: 'Smoothed at 20m',
    caveats_limitations: 'Smoothed at 20m',
    description: 'Slope derivative',
    observation_date: '2020',
    layer_id: 'slope',
    default_enabled: false,
    tags: ['slope'],
  }

  assert.equal(mapAtlasEntryToStorageCategory(atlasDerivedEntry), 'LOCAL_DERIVED')
  assert.equal(datasetSupportsRegion(coreSimProduct.supportsRegions, 'reg-gale'), true)
  assert.equal(datasetSupportsRegion(['reg-jezero'], 'reg-gale'), false)

  let state = createDefaultMissionBundle()
  state = missionReducer(state, {
    type: 'MISSION/ATTACH_DATASET',
    payload: datasetDossierToMissionRef(coreSimProduct),
  })
  state = missionReducer(state, {
    type: 'MISSION/ATTACH_DATASET',
    payload: atlasEntryToMissionRef(atlasDerivedEntry),
  })
  state = missionReducer(state, { type: 'MISSION/SET_FOCUSED_DATASET', payload: 'product-10' })

  assert.equal(state.science.attachedDatasets?.length, 2)
  assert.equal(state.science.attachedDatasets?.[0]?.storageCategory, 'MODEL_SIMULATED')
  assert.equal(state.science.attachedDatasets?.[1]?.storageCategory, 'LOCAL_DERIVED')
  assert.equal(state.science.focusedDatasetId, 'product-10')

  state = missionReducer(state, { type: 'MISSION/DETACH_DATASET', payload: 'product-10' })
  assert.equal(state.science.attachedDatasets?.length, 1)
})

test('MissionBundleV1 backward compatibility defaults missing M0.4.3 science fields and skips corrupt datasets', () => {
  const legacyBundle = createDefaultMissionBundle({ regionId: 'reg-jezero' }) as unknown as Record<
    string,
    unknown
  >
  const scienceObj = { ...(legacyBundle.science as Record<string, unknown>) }
  delete scienceObj.attachedDatasets
  delete scienceObj.targetNotes
  delete scienceObj.focusedDatasetId
  legacyBundle.science = scienceObj

  const resLegacy = validateMissionBundle(legacyBundle)
  assert.equal(resLegacy.ok, true)
  if (resLegacy.ok) {
    assert.deepEqual(resLegacy.bundle.science.attachedDatasets, [])
    assert.deepEqual(resLegacy.bundle.science.targetNotes, {})
    assert.equal(resLegacy.bundle.science.focusedDatasetId, null)
  }

  // Corrupt dataset ref is ignored individually while valid dataset ref survives
  const withMixedDatasets = {
    ...legacyBundle,
    science: {
      ...scienceObj,
      attachedDatasets: [
        { bad: true },
        {
          datasetId: 'product-01',
          title: 'HiRISE 1m DTM',
          storageCategory: 'LOCAL_RAW',
          epistemicClass: 'OBSERVED',
          attachedAt: '2026-01-01T00:00:00Z',
        },
      ],
    },
  }
  const resMixed = validateMissionBundle(withMixedDatasets)
  assert.equal(resMixed.ok, true)
  if (resMixed.ok) {
    assert.equal(resMixed.bundle.science.attachedDatasets?.length, 1)
    assert.equal(resMixed.bundle.science.attachedDatasets?.[0]?.datasetId, 'product-01')
  }
})

test('legacy field notes reader handles corrupt JSON gracefully and thematic geology links are well-formed', () => {
  const storage = new MemoryStorage()
  storage.setItem(RESEARCH_NOTES_LEGACY_STORAGE_KEY, '{not-valid-json')
  assert.deepEqual(readLegacyScienceFieldNotes(storage), {})

  storage.setItem(
    RESEARCH_NOTES_LEGACY_STORAGE_KEY,
    JSON.stringify({ 'SCI-01-KODIAK': 'Sample bottomset siltstone', BAD: 123 }),
  )
  assert.deepEqual(readLegacyScienceFieldNotes(storage), {
    'SCI-01-KODIAK': 'Sample bottomset siltstone',
  })

  const hints = inferTargetGeologyThemes(SAMPLE_TARGET)
  assert.ok(hints.recommendedUnitHints.includes('Nld'))
  assert.ok(hints.recommendedCrismHints.includes('D2300'))

  const sampleUnit: GeologicUnitDTO = {
    symbol: 'Nld',
    name: 'Jezero Western Delta Layered Unit',
    epoch: 'Noachian-Hesperian',
    dominant_lithology: 'Layered smectite-carbonate mudstone and sandstone',
    key_minerals: ['Fe/Mg-smectite', 'Mg-carbonate'],
    traversability_risk: 'Moderate-High',
    eva_science_priority: 'Critical',
    description: 'Deltaic fan deposit.',
    sample_cores_collected: ['Wildcat Ridge'],
    color_hex: '#10b981',
    epistemic_class: 'INTERPRETED',
  }
  const unitRef = geologyUnitToMissionRef(sampleUnit, 'reg-jezero', ['SCI-01-KODIAK'])
  assert.equal(unitRef.unitCode, 'Nld')
  assert.equal(unitRef.epistemicClass, 'INTERPRETED')
  assert.deepEqual(unitRef.relatedTargetIds, ['SCI-01-KODIAK'])

  const sampleScene: CRISMTargetedSceneDTO = {
    scene_id: 'FRT00005850',
    product_type: 'MTRDR',
    center_lat: 18.44,
    center_lon: 77.41,
    solar_longitude_ls: 152.3,
    target_description: 'Western Delta Front',
    primary_minerals_detected: ['Fe/Mg-smectite', 'Mg-carbonate'],
    pds_archive_id: 'urn:nasa:pds:crism_mtrdr:frt00005850_07_if166l_trr3',
    epistemic_class: 'OBSERVED',
  }
  const sceneRef = crismSceneToMissionRef(sampleScene, 'reg-jezero', ['SCI-01-KODIAK'])
  assert.equal(sceneRef.featureId, 'crism-FRT00005850')
  assert.equal(sceneRef.epistemicClass, 'OBSERVED')
  assert.equal(sceneRef.featureType, 'CRISM_SCENE')
})

test('M0.4.3.2 AUD-01: Jezero targets and geology keep immutable reg-jezero source without fabricated point coordinates', () => {
  const storage = new MemoryStorage()
  let state = createDefaultMissionBundle({ regionId: 'reg-gale', activePage: 'science' })

  // Target from Jezero catalog viewed under reg-gale retains authoritative reg-jezero origin
  const targetRef = featureToMissionTargetRef(SAMPLE_TARGET, JEZERO_SOURCE_REGION_ID, state.geographic.regionId)
  assert.equal(targetRef.regionId, 'reg-jezero')
  assert.equal(targetRef.activeMissionRegionId, 'reg-gale')

  const sciObs = buildScienceTargetObservation(SAMPLE_TARGET, state.geographic.regionId, 'Cross-region check')
  assert.equal(sciObs.regionId, 'reg-jezero')
  assert.equal(sciObs.activeMissionRegionId, 'reg-gale')

  // CRISM index & SIM-3464 unit never fabricate { lat: 18.4446, lon: 77.4509 }
  const idxRef = crismIndexToMissionRef(
    {
      index_code: 'D2300',
      name: '2.3 um Clay Index',
      wavelength_microns: 2.3,
      target_mineral: 'Fe/Mg-smectite',
      absorption_feature: '2.3 um Mg-OH',
      geological_significance: 'Phyllosilicate indicator',
      epistemic_class: 'INTERPRETED',
    },
    'reg-gale',
    ['SCI-02-HAWKSBILL'],
  )
  assert.equal(idxRef.regionId, 'reg-jezero')
  assert.equal(idxRef.activeMissionRegionId, 'reg-gale')
  assert.equal(idxRef.coordinate, null)

  const unitRef = geologyUnitToMissionRef(
    {
      symbol: 'Nld',
      name: 'Western Delta Layered Unit',
      epoch: 'Noachian-Hesperian',
      dominant_lithology: 'Layered clay mudstone',
      key_minerals: ['Fe/Mg-smectite'],
      traversability_risk: 'Moderate',
      eva_science_priority: 'Critical',
      description: 'Delta unit.',
      sample_cores_collected: [],
      color_hex: '#10b981',
      epistemic_class: 'INTERPRETED',
    },
    'reg-gale',
  )
  assert.equal(unitRef.regionId, 'reg-jezero')
  assert.equal(unitRef.coordinate, null)

  const globalRef = globalGeologyUnitToMissionRef(
    {
      symbol: 'lNh',
      name: 'Late Noachian highland',
      system: 'Noachian',
      epoch: 'Late Noachian',
      dominant_lithology: 'Brecciated impactite and basaltic regolith',
      area_percentage: 14.5,
      color_hex: '#8c564b',
      description: 'Ancient highlands',
      limitations: '1:20,000,000 planetary scale',
      epistemic_class: 'INTERPRETED',
      authority: 'Tanaka et al., 2014',
      doi: '10.3133/sim3292',
    },
    'reg-gale',
  )
  assert.equal(globalRef.regionId, GLOBAL_SCOPE_REGION_ID)
  assert.equal(globalRef.coordinate, null)

  // Observations with coordinate === null survive persistence while malformed coordinates still fail
  const nullCoordObs = buildGeologyObservation({
    featureId: 'unit-Nld',
    label: 'USGS Unit [Nld]',
    coordinate: null,
    regionId: 'reg-jezero',
    activeMissionRegionId: 'reg-gale',
    derivedSummary: 'Stratigraphic unit metadata',
    epistemicRaw: 'INTERPRETED',
    sourceDataset: 'USGS SIM-3464',
    provenance: 'Curated stratigraphic unit summary',
  })
  state = missionReducer(state, { type: 'MISSION/UPSERT_OBSERVATION', payload: sciObs })
  state = missionReducer(state, { type: 'MISSION/UPSERT_OBSERVATION', payload: nullCoordObs })
  saveMissionDraft(state, storage)
  const restored = loadMissionDraftResult(storage)
  assert.equal(restored.status, 'restored')
  assert.equal(restored.bundle?.science.savedObservations.length, 2)
  assert.equal(restored.bundle?.science.savedObservations[1]?.coordinate, null)
  assert.equal(restored.bundle?.science.savedObservations[1]?.regionId, 'reg-jezero')

  // Malformed non-null coordinate is still rejected by validator
  const withCorruptObs = {
    ...state,
    science: {
      ...state.science,
      savedObservations: [{ ...nullCoordObs, id: 'bad-coord', coordinate: { lat: 999, lon: 0 } }],
    },
  }
  const validatedCorrupt = validateMissionBundle(withCorruptObs)
  assert.equal(validatedCorrupt.ok, true)
  if (validatedCorrupt.ok) {
    assert.equal(validatedCorrupt.bundle.science.savedObservations.length, 0)
  }
})

test('M0.4.3.2 AUD-02 & AUD-04: Atlas storage validation_status, explicit supports_regions, and region-switch cleanup', () => {
  const baseEntry: AtlasMapEntry = {
    id: 'test',
    canonical_id: 'PLN-TEST',
    name: 'Test Entry',
    category: 'terrain',
    category_name: 'Terrain',
    category_icon: 'map',
    product_type: 'DRV',
    epistemic_class: 'DERIVED',
    instrument_mission: 'CTX',
    source_organisation: 'USGS',
    source: 'USGS',
    product_identifier: 'id',
    doi_or_url: 'https://example.org',
    original_spatial_resolution: '20m',
    resolution: '20m',
    processing_resolution: '20m',
    spatial_coverage: 'Global wording ignored when supports_regions omitted',
    coverage: 'Global',
    coverage_bounds: [
      [-90, -180],
      [90, 180],
    ],
    crs: 'IAU_2015:49900',
    vertical_datum: 'Areoid',
    processing_history: 'Test',
    processing_status: 'Custom Unrecognized String',
    licence_attribution: 'Public',
    validation_status: 'VERIFIED_LOCAL',
    known_limitations: 'None',
    caveats_limitations: 'None',
    description: 'Test',
    observation_date: '2020',
    layer_id: null,
    default_enabled: false,
    tags: [],
  }

  assert.equal(mapAtlasEntryToStorageCategory({ ...baseEntry, validation_status: 'VERIFIED_LOCAL', product_type: 'DRV', doi_or_url: 'file:///data/processed/jezero_western_delta_20m_slope.tif' }), 'LOCAL_DERIVED')
  assert.equal(mapAtlasEntryToStorageCategory({ ...baseEntry, validation_status: 'VERIFIED_LOCAL', product_type: 'SRC' }), 'LOCAL_RAW')
  assert.equal(
    mapAtlasEntryToStorageCategory({
      ...baseEntry,
      validation_status: 'VERIFIED_LOCAL',
      product_type: 'VEC',
      product_identifier: 'M20_traverse.json (Sols 0 to 1050)',
      doi_or_url: 'https://mars.nasa.gov/mars2020/mission/where-is-the-rover/',
    }),
    'LOCAL_RAW',
  )
  assert.equal(
    mapAtlasEntryToStorageCategory({
      ...baseEntry,
      validation_status: 'VERIFIED_LOCAL',
      product_type: 'VEC',
      product_identifier: 'unrecognized_vec',
      doi_or_url: 'https://example.org',
    }),
    'UNKNOWN',
  )
  assert.equal(
    mapAtlasEntryToStorageCategory({
      ...baseEntry,
      validation_status: 'VERIFIED_LOCAL',
      product_type: 'SIM',
      processing_history: 'Simulated diurnal output',
    }),
    'MODEL_SIMULATED',
  )
  assert.equal(mapAtlasEntryToStorageCategory({ ...baseEntry, validation_status: 'VERIFIED_REMOTE_WMS' }), 'REMOTE_CACHED_PROXY')
  assert.equal(mapAtlasEntryToStorageCategory({ ...baseEntry, validation_status: 'VERIFIED_REMOTE_WMTS' }), 'REMOTE_CACHED_PROXY')
  assert.equal(mapAtlasEntryToStorageCategory({ ...baseEntry, validation_status: 'CATALOGUED', product_type: 'INT' }), 'STATIC_METADATA')
  assert.equal(mapAtlasEntryToStorageCategory({ ...baseEntry, validation_status: 'VERIFIED_ARCHIVE', product_type: 'SIM' }), 'MODEL_SIMULATED')
  assert.equal(mapAtlasEntryToStorageCategory({ ...baseEntry, validation_status: 'OTHER', product_type: 'SRC', processing_status: 'SOMETHING_NEW' }), 'UNKNOWN')

  // Omitted supports_regions fails safe to [] instead of guessing from spatial_coverage text
  const missingScopeRef = atlasEntryToMissionRef(baseEntry)
  assert.deepEqual(missingScopeRef.supportsRegions, [])
  assert.equal(datasetSupportsRegion(missingScopeRef.supportsRegions, 'reg-gale'), false)

  const globalRef = atlasEntryToMissionRef({ ...baseEntry, canonical_id: 'PLN-SRC-01', supports_regions: ['all'] })
  const jezeroRef = atlasEntryToMissionRef({ ...baseEntry, canonical_id: 'PLN-DRV-02', supports_regions: ['reg-jezero'] })

  let state = createDefaultMissionBundle({ regionId: 'reg-jezero', activePage: 'geology' })
  state = missionReducer(state, { type: 'MISSION/ATTACH_DATASET', payload: globalRef })
  state = missionReducer(state, { type: 'MISSION/ATTACH_DATASET', payload: jezeroRef })
  state = missionReducer(state, { type: 'MISSION/SET_FOCUSED_DATASET', payload: 'PLN-DRV-02' })
  state = missionReducer(state, {
    type: 'MISSION/SELECT_GEOLOGICAL_FEATURE',
    payload: {
      featureId: 'sim3464-Nld',
      name: 'Nld — Jezero Delta',
      unitCode: 'Nld',
      featureType: 'STRATIGRAPHIC_UNIT',
      regionId: 'reg-jezero',
      coordinate: null,
      epistemicClass: 'INTERPRETED',
    },
  })
  state = missionReducer(state, {
    type: 'MISSION/SET_TARGET_NOTE',
    payload: { targetId: 'SCI-01-KODIAK', note: 'Keep user field note across region switch' },
  })
  state = missionReducer(state, {
    type: 'MISSION/UPSERT_QUEUED_TARGET',
    payload: featureToSortieWaypoint(SAMPLE_TARGET, 'reg-jezero'),
  })

  // Switch from reg-jezero to reg-gale: Jezero-only feature, focusedDatasetId, and Jezero dataset clear;
  // global dataset + user notes + queuedTargets + observations stay preserved.
  const switched = missionReducer(state, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-gale' },
  })
  assert.equal(switched.geographic.regionId, 'reg-gale')
  assert.equal(switched.science.selectedGeologicalFeature, null)
  assert.equal(switched.science.focusedDatasetId, null)
  assert.deepEqual(
    switched.science.attachedDatasets?.map((d) => d.datasetId),
    ['PLN-SRC-01'],
  )
  assert.equal(switched.science.targetNotes?.['SCI-01-KODIAK'], 'Keep user field note across region switch')
  assert.equal(switched.science.queuedTargets.length, 1)

  // Global geological feature (regionId === 'all') survives canonical region switching
  const withGlobalGeo = missionReducer(switched, {
    type: 'MISSION/SELECT_GEOLOGICAL_FEATURE',
    payload: {
      featureId: 'sim3292-lNh',
      name: 'lNh — Late Noachian highland',
      unitCode: 'lNh',
      featureType: 'GLOBAL_UNIT',
      regionId: 'all',
      coordinate: null,
      epistemicClass: 'INTERPRETED',
    },
  })
  const afterOlympus = missionReducer(withGlobalGeo, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-olympus-mons' },
  })
  assert.notEqual(afterOlympus, withGlobalGeo)
  assert.equal(afterOlympus.geographic.regionId, 'reg-olympus-mons')
  assert.equal(afterOlympus.science.selectedGeologicalFeature?.featureId, 'sim3292-lNh')
})

test('M0.4.3.2 AUD-05: hemisphere coordinate formatting and genuine mineral-to-target matching', () => {
  assert.equal(formatMarsCoordinate({ lat: -4.5, lon: 137.4 }), '4.50000°S, 137.40000°E')
  assert.equal(formatMarsCoordinate({ lat: 18.4446, lon: -76.5 }), '18.44460°N, 76.50000°W')
  assert.equal(formatMarsCoordinate({ lat: 0, lon: 0 }), '0.00000°N, 0.00000°E')
  assert.equal(formatMarsCoordinate({ lat: -1e-9, lon: -1e-9 }, 5), '0.00000°N, 0.00000°E')

  const carbonateMatches = matchScienceTargetsForKeywords([SAMPLE_TARGET], ['Mg-Carbonate', 'Delta'])
  assert.deepEqual(
    carbonateMatches.map((t) => t.properties.target_id),
    ['SCI-01-KODIAK'],
  )
  const unrelatedMatches = matchScienceTargetsForKeywords([SAMPLE_TARGET], ['Halite', 'Sulfate'])
  assert.deepEqual(unrelatedMatches, [])
})

test('M0.4.3.2 Clarifications 1, 3, 4: null coordinate coverage preservation, serialization after region switch, and relationship semantics', () => {
  const unit: GeologicUnitDTO = {
    symbol: 'Nld',
    name: 'Nld — Jezero Delta',
    epoch: 'Noachian-Hesperian',
    dominant_lithology: 'Layered deltaic sedimentary rock',
    key_minerals: ['Smectite', 'Mg-Carbonate'],
    traversability_risk: 'MODERATE',
    eva_science_priority: 'HIGH',
    description: 'Delta front deposits',
    sample_cores_collected: ['Wildcat Ridge'],
    color_hex: '#aabbcc',
    epistemic_class: 'INTERPRETED',
  }
  const globalUnit: GlobalGeologicUnitDTO = {
    symbol: 'lNh',
    name: 'Late Noachian highland unit',
    system: 'Noachian',
    epoch: 'Late Noachian',
    dominant_lithology: 'Cratered highland breccia',
    color_hex: '#998877',
    area_percentage: 8.5,
    description: 'Global highland plains',
    limitations: '1:20,000,000 planetary scale',
    epistemic_class: 'INTERPRETED',
    authority: 'USGS SIM-3292',
    doi: '10.3133/sim3292',
  }

  const featureRef = geologyUnitToMissionRef(
    unit,
    JEZERO_SOURCE_REGION_ID,
    ['SCI-01-KODIAK'],
    { method: 'CURATED_SOURCE_SUPPORTED', epistemicClass: 'INTERPRETED' },
  )
  assert.equal(featureRef.coordinate, null)
  assert.ok(featureRef.spatialCoverage?.includes('SIM-3464'))
  assert.deepEqual(featureRef.coverageBounds, [
    [18.15, 77.2],
    [18.65, 77.65],
  ])
  assert.equal(featureRef.relationshipMethod, 'CURATED_SOURCE_SUPPORTED')
  assert.equal(featureRef.relationshipEpistemicClass, 'INTERPRETED')

  const globalRef = globalGeologyUnitToMissionRef(globalUnit)
  assert.equal(globalRef.coordinate, null)
  assert.equal(globalRef.regionId, GLOBAL_SCOPE_REGION_ID)
  assert.deepEqual(globalRef.coverageBounds, [
    [-90, -180],
    [90, 180],
  ])

  const arealObs = buildGeologyObservation({
    featureId: 'sim3464-Nld',
    label: 'Delta Front Lithology',
    regionId: JEZERO_SOURCE_REGION_ID,
    derivedSummary: 'Preserved areal unit with no manufactured center coordinate',
    userNote: 'Field stratigraphy check',
    coordinate: null,
    spatialCoverage: featureRef.spatialCoverage,
    coverageBounds: featureRef.coverageBounds,
    epistemicRaw: 'INTERPRETED',
    sourceDataset: 'USGS SIM-3464',
    provenance: 'Unit Nld',
  })
  assert.equal(arealObs.coordinate, null)
  assert.equal(arealObs.spatialCoverage, featureRef.spatialCoverage)
  assert.deepEqual(arealObs.coverageBounds, featureRef.coverageBounds)

  let state = createDefaultMissionBundle({ regionId: JEZERO_SOURCE_REGION_ID, activePage: 'geology' })
  state = missionReducer(state, { type: 'MISSION/SELECT_GEOLOGICAL_FEATURE', payload: featureRef })
  state = missionReducer(state, { type: 'MISSION/UPSERT_OBSERVATION', payload: arealObs })
  state = missionReducer(state, {
    type: 'MISSION/UPSERT_OBSERVATION',
    payload: buildScienceTargetObservation(
      SAMPLE_TARGET,
      JEZERO_SOURCE_REGION_ID,
      'Sample point observation',
    ),
  })
  state = missionReducer(state, {
    type: 'MISSION/SET_TARGET_NOTE',
    payload: { targetId: 'SCI-01-KODIAK', note: 'Historical field note' },
  })
  state = missionReducer(state, {
    type: 'MISSION/UPSERT_QUEUED_TARGET',
    payload: featureToSortieWaypoint(SAMPLE_TARGET, JEZERO_SOURCE_REGION_ID),
  })

  // Transition reg-jezero -> reg-gale, then serialize + reload via MissionStorage
  const switched = missionReducer(state, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-gale' },
  })
  const storage = new MemoryStorage()
  saveMissionDraft(switched, storage)
  const reloaded = loadMissionDraftResult(storage)
  assert.equal(reloaded.status, 'restored')
  assert.ok(reloaded.bundle)
  assert.equal(reloaded.bundle.geographic.regionId, 'reg-gale')
  assert.equal(reloaded.bundle.science.selectedGeologicalFeature, null)
  assert.equal(reloaded.bundle.science.savedObservations.length, 2)

  const reloadedAreal = reloaded.bundle.science.savedObservations.find((o) => o.coordinate === null)
  assert.ok(reloadedAreal)
  assert.equal(reloadedAreal.regionId, JEZERO_SOURCE_REGION_ID)
  assert.equal(reloadedAreal.sourceDataset, 'USGS SIM-3464')
  assert.equal(reloadedAreal.spatialCoverage, featureRef.spatialCoverage)
  assert.deepEqual(reloadedAreal.coverageBounds, featureRef.coverageBounds)
  assert.equal(reloaded.bundle.science.targetNotes?.['SCI-01-KODIAK'], 'Historical field note')
  assert.equal(reloaded.bundle.science.queuedTargets.length, 1)

  // Validation strips invalid relationshipMethod cleanly while preserving valid spatialCoverage
  const normalized = validateMissionBundle({
    ...switched,
    science: {
      ...switched.science,
      selectedGeologicalFeature: {
        ...featureRef,
        relationshipMethod: 'INVENTED_METHOD',
        relationshipEpistemicClass: 'OBSERVED',
      },
    },
  })
  assert.equal(normalized.ok, true)
  if (normalized.ok) {
    assert.equal(normalized.bundle.science.selectedGeologicalFeature?.relationshipMethod, undefined)
    assert.equal(normalized.bundle.science.selectedGeologicalFeature?.relationshipEpistemicClass, 'OBSERVED')
    assert.deepEqual(normalized.bundle.science.selectedGeologicalFeature?.coverageBounds, [
      [18.15, 77.2],
      [18.65, 77.65],
    ])
  }
})

test('M0.4.3.3 NEW-01: selecting a Jezero target never fabricates point coordinates for CRISM index or SIM-3464 unit observations', () => {
  const storage = new MemoryStorage()
  let state = createDefaultMissionBundle({ regionId: JEZERO_SOURCE_REGION_ID, activePage: 'geology' })

  // 1. User selects a Jezero candidate science target with a valid point coordinate
  const targetRef = featureToMissionTargetRef(SAMPLE_TARGET, JEZERO_SOURCE_REGION_ID, 'reg-gale')
  state = missionReducer(state, { type: 'MISSION/SELECT_TARGET', payload: targetRef })
  assert.deepEqual(state.science.selectedTarget?.coordinate, { lat: 18.4315, lon: 77.3812 })

  // 2. Logging a CRISM spectral index observation while target is selected keeps coordinate: null
  const crismIdx: CRISMIndexDTO = {
    index_code: 'LCPINDEX',
    name: 'Low-Calcium Pyroxene Index',
    wavelength_microns: 1.8,
    target_mineral: 'Low-Calcium Pyroxene',
    absorption_feature: 'Fe2+ electronic crystal-field transition at 1.8 µm',
    geological_significance: 'Noachian crustal basement',
    epistemic_class: 'INTERPRETED',
  }
  const idxObs = buildCrismIndexObservation(crismIdx, 'reg-gale')
  assert.equal(idxObs.coordinate, null)
  assert.equal(idxObs.regionId, JEZERO_SOURCE_REGION_ID)
  assert.equal(idxObs.activeMissionRegionId, 'reg-gale')
  assert.ok(idxObs.spatialCoverage?.includes('LCPINDEX'))
  assert.deepEqual(idxObs.coverageBounds, [
    [18.3918, 77.3437],
    [18.58953, 77.46584],
  ])

  // 3. Logging a SIM-3464 regional geologic unit observation while target is selected keeps coordinate: null
  const unit: GeologicUnitDTO = {
    symbol: 'Nhb',
    name: 'Noachian Highland Breccia',
    epoch: 'Noachian',
    dominant_lithology: 'Megabreccia blocks',
    key_minerals: ['Low-Ca Pyroxene', 'Fe/Mg-Smectite'],
    traversability_risk: 'HIGH',
    eva_science_priority: 'HIGH',
    description: 'Crater rim wall basement unrelated to Kodiak delta scarp',
    sample_cores_collected: [],
    color_hex: '#886644',
    epistemic_class: 'INTERPRETED',
  }
  const unitObs = buildGeologicUnitObservation(unit, 'reg-gale')
  assert.equal(unitObs.coordinate, null)
  assert.equal(unitObs.regionId, JEZERO_SOURCE_REGION_ID)
  assert.equal(unitObs.activeMissionRegionId, 'reg-gale')
  assert.ok(unitObs.spatialCoverage?.includes('SIM-3464'))
  assert.deepEqual(unitObs.coverageBounds, [
    [18.15, 77.2],
    [18.65, 77.65],
  ])

  // 4. Null coordinates + coverage metadata + source region survive reducer, validation, and save/reload
  state = missionReducer(state, { type: 'MISSION/UPSERT_OBSERVATION', payload: idxObs })
  state = missionReducer(state, { type: 'MISSION/UPSERT_OBSERVATION', payload: unitObs })
  saveMissionDraft(state, storage)

  const reloaded = loadMissionDraftResult(storage)
  assert.equal(reloaded.status, 'restored')
  assert.ok(reloaded.bundle)
  const savedIdx = reloaded.bundle.science.savedObservations.find((o) => o.id === idxObs.id)
  const savedUnit = reloaded.bundle.science.savedObservations.find((o) => o.id === unitObs.id)
  assert.ok(savedIdx)
  assert.ok(savedUnit)
  assert.equal(savedIdx.coordinate, null)
  assert.equal(savedIdx.regionId, JEZERO_SOURCE_REGION_ID)
  assert.equal(savedIdx.activeMissionRegionId, 'reg-gale')
  assert.deepEqual(savedIdx.coverageBounds, [
    [18.3918, 77.3437],
    [18.58953, 77.46584],
  ])
  assert.equal(savedUnit.coordinate, null)
  assert.equal(savedUnit.regionId, JEZERO_SOURCE_REGION_ID)
  assert.equal(savedUnit.activeMissionRegionId, 'reg-gale')
  assert.deepEqual(savedUnit.coverageBounds, [
    [18.15, 77.2],
    [18.65, 77.65],
  ])
})

test('M0.4.3.3 NEW-02: keyword-inferred geology relationships stay HEURISTIC across Science->Geology->Science and reload, while explicit curated links stay CURATED_SOURCE_SUPPORTED', () => {
  const storage = new MemoryStorage()
  let state = createDefaultMissionBundle({ regionId: JEZERO_SOURCE_REGION_ID, activePage: 'science' })

  // 1. Standard target without curated foreign keys -> KEYWORD_DISCOVERY_HINT / HEURISTIC
  const handoffHeuristic = buildTargetGeologyHandoffRef(SAMPLE_TARGET, JEZERO_SOURCE_REGION_ID)
  assert.equal(handoffHeuristic.relationshipMethod, 'KEYWORD_DISCOVERY_HINT')
  assert.equal(handoffHeuristic.relationshipEpistemicClass, 'HEURISTIC')
  assert.ok(handoffHeuristic.provenance?.toLowerCase().includes('heuristic'))

  // Navigate Science -> Geology with heuristic handoff ref
  state = missionReducer(state, {
    type: 'MISSION/SELECT_TARGET',
    payload: featureToMissionTargetRef(SAMPLE_TARGET, JEZERO_SOURCE_REGION_ID),
  })
  state = missionReducer(state, {
    type: 'MISSION/SELECT_GEOLOGICAL_FEATURE',
    payload: handoffHeuristic,
  })
  state = missionReducer(state, { type: 'MISSION/SET_PAGE', payload: { page: 'geology' } })

  // 3. Return Geology -> Science via resolveGeologicalTargetMatches cannot upgrade heuristic to curated
  const returnMatch = resolveGeologicalTargetMatches({
    targets: [SAMPLE_TARGET],
    featureType: 'STRATIGRAPHIC_UNIT',
    featureCode: 'Nld',
    keywords: ['Western Delta Layered Unit', 'Mg-Carbonate', 'Delta'],
  })
  assert.equal(returnMatch.relationshipMethod, 'KEYWORD_DISCOVERY_HINT')
  assert.equal(returnMatch.relationshipEpistemicClass, 'HEURISTIC')
  assert.deepEqual(
    returnMatch.matchedTargets.map((t) => t.properties.target_id),
    ['SCI-01-KODIAK'],
  )

  const unit: GeologicUnitDTO = {
    symbol: 'Nld',
    name: 'Western Delta Layered Unit',
    epoch: 'Noachian-Hesperian',
    dominant_lithology: 'Mudstone and sandstone',
    key_minerals: ['Fe/Mg smectite', 'Mg-carbonate'],
    traversability_risk: 'LOW',
    eva_science_priority: 'CRITICAL',
    description: 'Delta front beds',
    sample_cores_collected: ['Montdenier'],
    color_hex: '#4a7c59',
    epistemic_class: 'INTERPRETED',
  }
  const returnedFeatureRef = geologyUnitToMissionRef(
    unit,
    JEZERO_SOURCE_REGION_ID,
    returnMatch.matchedTargets.map((t) => t.properties.target_id),
    {
      method: returnMatch.relationshipMethod,
      epistemicClass: returnMatch.relationshipEpistemicClass,
    },
  )
  state = missionReducer(state, {
    type: 'MISSION/SELECT_GEOLOGICAL_FEATURE',
    payload: returnedFeatureRef,
  })
  state = missionReducer(state, { type: 'MISSION/SET_PAGE', payload: { page: 'science' } })
  assert.equal(state.science.selectedGeologicalFeature?.relationshipMethod, 'KEYWORD_DISCOVERY_HINT')
  assert.equal(state.science.selectedGeologicalFeature?.relationshipEpistemicClass, 'HEURISTIC')

  // 4. Reloading mission preserves KEYWORD_DISCOVERY_HINT / HEURISTIC without upgrading
  saveMissionDraft(state, storage)
  const reloaded = loadMissionDraftResult(storage)
  assert.equal(reloaded.status, 'restored')
  assert.equal(
    reloaded.bundle?.science.selectedGeologicalFeature?.relationshipMethod,
    'KEYWORD_DISCOVERY_HINT',
  )
  assert.equal(
    reloaded.bundle?.science.selectedGeologicalFeature?.relationshipEpistemicClass,
    'HEURISTIC',
  )

  // 2. Target with explicit source-backed curated association -> CURATED_SOURCE_SUPPORTED / INTERPRETED
  const curatedTarget: CandidateTargetFeature = {
    ...SAMPLE_TARGET,
    properties: {
      ...SAMPLE_TARGET.properties,
      curated_unit_symbols: ['Nld'],
    },
  }
  const handoffCurated = buildTargetGeologyHandoffRef(curatedTarget, JEZERO_SOURCE_REGION_ID)
  assert.equal(handoffCurated.relationshipMethod, 'CURATED_SOURCE_SUPPORTED')
  assert.equal(handoffCurated.relationshipEpistemicClass, 'INTERPRETED')
  assert.equal(handoffCurated.unitCode, 'Nld')

  const curatedReturn = resolveGeologicalTargetMatches({
    targets: [curatedTarget],
    featureType: 'STRATIGRAPHIC_UNIT',
    featureCode: 'Nld',
    keywords: ['Unrelated Keyword'],
  })
  assert.equal(curatedReturn.relationshipMethod, 'CURATED_SOURCE_SUPPORTED')
  assert.equal(curatedReturn.relationshipEpistemicClass, 'INTERPRETED')
  assert.equal(curatedReturn.matchedTargets.length, 1)
})

test('M0.4.3.3 NEW-03, NEW-04 & NEW-05: cross-region EVA destination gating, source region provenance preservation, and canonical region-switch testing', () => {
  const storage = new MemoryStorage()
  let state = createDefaultMissionBundle({ regionId: 'reg-jezero', activePage: 'route-planner' })

  // NEW-04: selecting a Jezero target while active mission region is reg-gale preserves regionId = reg-jezero
  const targetWhileInGale = featureToMissionTargetRef(SAMPLE_TARGET, 'reg-jezero', 'reg-gale')
  assert.equal(targetWhileInGale.regionId, 'reg-jezero')
  assert.equal(targetWhileInGale.activeMissionRegionId, 'reg-gale')

  const jezeroWaypoint = featureToSortieWaypoint(SAMPLE_TARGET, 'reg-jezero', 'Primary delta target')
  assert.equal(jezeroWaypoint.regionId, 'reg-jezero')

  // 4. Compatible targets and waypoints remain usable in reg-jezero
  const jezeroTargetCheck = isTargetCompatibleWithRegion(
    {
      regionId: jezeroWaypoint.regionId,
      lat: targetWhileInGale.coordinate.lat,
      lon: targetWhileInGale.coordinate.lon,
    },
    'reg-jezero',
  )
  assert.equal(jezeroTargetCheck.compatible, true)
  assert.equal(jezeroTargetCheck.reason, null)

  state = missionReducer(state, {
    type: 'MISSION/UPSERT_QUEUED_TARGET',
    payload: jezeroWaypoint,
  })
  state = missionReducer(state, {
    type: 'MISSION/SET_WAYPOINTS',
    payload: [jezeroWaypoint],
  })
  state = missionReducer(state, {
    type: 'MISSION/SET_DESTINATION',
    payload: {
      lat: jezeroWaypoint.lat,
      lon: jezeroWaypoint.lon,
      regionId: jezeroWaypoint.regionId,
    },
  })
  assert.equal(state.eva.destination?.lat, jezeroWaypoint.lat)
  assert.equal(state.eva.waypoints.length, 1)
  assert.equal(
    evaluateEvaConfigCompatibility({
      activeRegionId: state.geographic.regionId,
      baseCamp: state.eva.baseCamp,
      destination: state.eva.destination,
      waypoints: state.eva.waypoints,
    }).compatible,
    true,
  )

  // 5. Switch active region from reg-jezero to reg-gale: historical targets, waypoints, and provenance survive
  const inGale = missionReducer(state, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-gale' },
  })
  assert.equal(inGale.geographic.regionId, 'reg-gale')
  assert.equal(inGale.science.queuedTargets.length, 1)
  assert.equal(inGale.science.queuedTargets[0]?.regionId, 'reg-jezero')
  assert.equal(inGale.eva.waypoints.length, 1)
  assert.equal(inGale.eva.waypoints[0]?.regionId, 'reg-jezero')
  assert.deepEqual(inGale.eva.destination, state.eva.destination)

  // Save and reload in reg-gale: historical reg-jezero provenance is untouched
  saveMissionDraft(inGale, storage)
  const reloadedInGale = loadMissionDraftResult(storage)
  assert.equal(reloadedInGale.status, 'restored')
  assert.equal(reloadedInGale.bundle?.geographic.regionId, 'reg-gale')
  assert.equal(reloadedInGale.bundle?.science.queuedTargets[0]?.regionId, 'reg-jezero')
  assert.equal(reloadedInGale.bundle?.eva.waypoints[0]?.regionId, 'reg-jezero')

  // 1 & 2. Jezero target or waypoint cannot be assigned as a Gale destination
  const galeTargetCheck = isTargetCompatibleWithRegion(
    {
      regionId: jezeroWaypoint.regionId,
      lat: targetWhileInGale.coordinate.lat,
      lon: targetWhileInGale.coordinate.lon,
    },
    'reg-gale',
  )
  assert.equal(galeTargetCheck.compatible, false)
  assert.ok(galeTargetCheck.reason?.includes('reg-gale'))

  const blockedDest = missionReducer(inGale, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: 18.45, lon: 77.46, regionId: 'reg-jezero' },
  })
  assert.equal(blockedDest, inGale)

  const blockedWaypointDest = missionReducer(inGale, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: jezeroWaypoint.lat, lon: jezeroWaypoint.lon },
  })
  assert.equal(blockedWaypointDest, inGale)

  // 3. Unsupported regions cannot invoke EVA routing coordinate/waypoint mutations
  const blockedBaseCamp = missionReducer(inGale, {
    type: 'MISSION/SET_BASE_CAMP',
    payload: { lat: -4.5895, lon: 137.4417 },
  })
  assert.equal(blockedBaseCamp, inGale)

  const blockedEvaCoords = missionReducer(inGale, {
    type: 'MISSION/SET_EVA_COORDINATES',
    payload: {
      baseCamp: { lat: -4.5895, lon: 137.4417 },
      destination: { lat: -4.6, lon: 137.45 },
    },
  })
  assert.equal(blockedEvaCoords, inGale)

  const blockedWaypoints = missionReducer(inGale, {
    type: 'MISSION/SET_WAYPOINTS',
    payload: [jezeroWaypoint],
  })
  assert.equal(blockedWaypoints, inGale)

  // Even inside reg-jezero, a target tagged with another source region or outside Jezero bounds is rejected
  const crossRegionInJezero = missionReducer(state, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: 18.4446, lon: 77.4509, regionId: 'reg-gale' },
  })
  assert.equal(crossRegionInJezero, state)

  const outOfBoundsInJezero = missionReducer(state, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: -4.5895, lon: 137.4417, regionId: 'reg-jezero' },
  })
  assert.equal(outOfBoundsInJezero, state)

  // 6. Incompatible active EVA configuration in reg-gale is flagged before simulation
  const galeSimCompat = evaluateEvaConfigCompatibility({
    activeRegionId: inGale.geographic.regionId,
    baseCamp: inGale.eva.baseCamp,
    destination: inGale.eva.destination,
    waypoints: inGale.eva.waypoints,
  })
  assert.equal(galeSimCompat.compatible, false)
  assert.ok(galeSimCompat.reason?.includes('reg-jezero'))

  // 7. Returning to reg-jezero restores compatibility and allows assigning preserved Jezero targets
  const restoredJezero = missionReducer(inGale, {
    type: 'MISSION/SET_REGION',
    payload: { regionId: 'reg-jezero' },
  })
  assert.equal(restoredJezero.geographic.regionId, 'reg-jezero')
  const restoredCompat = evaluateEvaConfigCompatibility({
    activeRegionId: restoredJezero.geographic.regionId,
    baseCamp: restoredJezero.eva.baseCamp,
    destination: restoredJezero.eva.destination,
    waypoints: restoredJezero.eva.waypoints,
  })
  assert.equal(restoredCompat.compatible, true)
  assert.equal(restoredCompat.reason, null)

  const reassignedInJezero = missionReducer(restoredJezero, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: 18.438, lon: 77.452, regionId: 'reg-jezero' },
  })
  assert.notEqual(reassignedInJezero, restoredJezero)
  assert.equal(reassignedInJezero.eva.destination?.lat, 18.438)

  // NEW-06 frontend catalog consistency checks
  const byId = new Map(AUTHENTIC_PLANETARY_DATASETS.map((d) => [d.id, d]))
  assert.ok(byId.get('product-06')?.resolution.includes('4 pixels/degree'))
  assert.ok(byId.get('product-06')?.resolution.includes('14.818 km/pixel'))
  assert.ok(byId.get('product-08')?.resolution.includes('1:75,000'))
  assert.ok(!byId.get('product-08')?.resolution.includes('1:5,000'))
  assert.equal(byId.get('product-01')?.epistemicClass, 'DERIVED')
  assert.equal(byId.get('product-03')?.epistemicClass, 'DERIVED')
  assert.equal(byId.get('product-05')?.epistemicClass, 'DERIVED')
  assert.equal(byId.get('product-02')?.epistemicClass, 'OBSERVED')
  assert.equal(byId.get('product-04')?.epistemicClass, 'OBSERVED')
  assert.equal(byId.get('product-06')?.epistemicClass, 'OBSERVED')
})

test('M0.4.3.4 Targeted Audit Remediation (AUD-03-A, AUD-06-A, AUD-06-D)', () => {
  const defaultState = createDefaultMissionBundle()

  // 1. AUD-03-A: Reducer rejects out-of-bounds destinations even when regionId is omitted from payload
  const galeCoordsNoRegion = { lat: -4.5895, lon: 137.4417 } // Gale Crater
  const rejectedDestNoRegion = missionReducer(defaultState, {
    type: 'MISSION/SET_DESTINATION',
    payload: galeCoordsNoRegion,
  })
  assert.equal(rejectedDestNoRegion, defaultState, 'Destination outside active region must be rejected even without regionId')

  const rejectedBaseWithRegion = missionReducer(defaultState, {
    type: 'MISSION/SET_BASE_CAMP',
    payload: { ...galeCoordsNoRegion, regionId: 'reg-gale' },
  })
  assert.equal(rejectedBaseWithRegion, defaultState, 'Base camp with mismatched region must be rejected')

  // Reducer rejects NaN and Infinity coordinates
  const nanDest = missionReducer(defaultState, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: NaN, lon: 77.45 },
  })
  assert.equal(nanDest, defaultState, 'NaN coordinate must be rejected')

  const infBase = missionReducer(defaultState, {
    type: 'MISSION/SET_BASE_CAMP',
    payload: { lat: 18.44, lon: Infinity },
  })
  assert.equal(infBase, defaultState, 'Infinity coordinate must be rejected')

  // SET_EVA_COORDINATES rejects out-of-bounds start or destination
  const rejectedEvaCoords = missionReducer(defaultState, {
    type: 'MISSION/SET_EVA_COORDINATES',
    payload: {
      baseCamp: { lat: 18.4446, lon: 77.4509 },
      destination: { lat: -4.5895, lon: 137.4417 },
    },
  })
  assert.equal(rejectedEvaCoords, defaultState, 'SET_EVA_COORDINATES with out-of-bounds destination must be rejected')

  // SET_WAYPOINTS immutably rejects entire array if any waypoint is out-of-bounds
  const mixedWaypoints = [
    { id: 'wp-1', name: 'WP1', lat: 18.445, lon: 77.451 },
    { id: 'wp-2', name: 'Gale WP', lat: -4.5895, lon: 137.4417 },
  ]
  const rejectedWaypoints = missionReducer(defaultState, {
    type: 'MISSION/SET_WAYPOINTS',
    payload: mixedWaypoints,
  })
  assert.equal(rejectedWaypoints, defaultState, 'SET_WAYPOINTS with an invalid waypoint must reject entire batch')

  // Valid within-bounds Jezero destination and base camp succeed
  const validDest = missionReducer(defaultState, {
    type: 'MISSION/SET_DESTINATION',
    payload: { lat: 18.441, lon: 77.452 },
  })
  assert.notEqual(validDest, defaultState)
  assert.equal(validDest.eva.destination?.lat, 18.441)

  // 2. AUD-03-A: Auxiliary routing & emergency response blocked for non-Jezero regions
  const nonJezeroProfiles = listAllRegionCapabilities().filter((p) => p.regionId !== 'reg-jezero')
  for (const profile of nonJezeroProfiles) {
    assert.equal(profile.supportsEvaRouting, false, `${profile.regionId} must not support EVA routing`)
    assert.equal(profile.supportsLocalDigitalTwin, false, `${profile.regionId} must not support local digital twin`)
    assert.ok(profile.limitations.length > 0)
  }

  const jezeroProfile = getRegionCapabilityProfile('reg-jezero')
  assert.equal(jezeroProfile.supportsEvaRouting, true)
  assert.equal(jezeroProfile.supportsLocalDigitalTwin, true)

  // 3. AUD-06-A: Zero occurrences of '46.3 km/px' across all region capabilities
  const allProfiles = listAllRegionCapabilities()
  for (const profile of allProfiles) {
    assert.ok(!profile.primaryResolutionSummary.includes('46.3 km/px'))
    for (const ds of profile.datasets) {
      assert.ok(!ds.resolution.includes('46.3 km/px'))
      if (ds.productId === 'PLN-SRC-01' && profile.regionId !== 'reg-jezero') {
        assert.equal(ds.resolution, '14.818 km/px (4 ppd)')
      }
    }
  }
})
