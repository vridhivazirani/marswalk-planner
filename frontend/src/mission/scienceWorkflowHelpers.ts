import type {
  AtlasMapEntry,
  CRISMIndexDTO,
  CRISMTargetedSceneDTO,
  GeologicUnitDTO,
  GlobalGeologicUnitDTO,
} from '../api/atlas.ts'
import type { PlanetaryDatasetProduct } from '../api/catalog.ts'
import type { CandidateTargetFeature } from '../api/science.ts'
import type {
  DatasetStorageCategory,
  EpistemicClassTag,
  MissionDatasetRef,
  MissionGeologicalFeatureRef,
  MissionObservationRecord,
} from '../types/mission.ts'
import {
  CANONICAL_MARS_CRS,
  SCIENCE_TARGETS_DATASET_ID,
  SCIENCE_TARGETS_PROVENANCE,
  normalizeMarsCoordinate,
  toEpistemicClassTag,
} from './digitalTwinHelpers.ts'

export const STORAGE_CATEGORY_LABELS: Record<DatasetStorageCategory, string> = {
  LOCAL_RAW: 'LOCAL RAW ARCHIVE',
  LOCAL_DERIVED: 'LOCAL DERIVED ARD',
  REMOTE_CACHED_PROXY: 'REMOTE TILE PROXY / CACHE',
  STATIC_METADATA: 'CURATED METADATA DOSSIER',
  MODEL_SIMULATED: 'SIMULATED / MODEL OUTPUT',
  UNKNOWN: 'UNVERIFIED / UNKNOWN',
}

export const RESEARCH_NOTES_LEGACY_STORAGE_KEY = 'marswalk_science_field_notes_v1'
export const JEZERO_SOURCE_REGION_ID = 'reg-jezero'
export const GLOBAL_SCOPE_REGION_ID = 'all'

/**
 * Normalize backend or external epistemic strings strictly to canonical EpistemicClassTag.
 * Maps model labels like CLIMATE_MODELED transparently to SIMULATED without losing provenance.
 */
export function normalizeDatasetEpistemicTag(value: unknown): EpistemicClassTag {
  if (typeof value !== 'string') return 'UNKNOWN'
  const upper = value.trim().toUpperCase()
  if (upper === 'CLIMATE_MODELED') return 'SIMULATED'
  return toEpistemicClassTag(upper)
}

/**
 * Resolve honest storage provenance category for a catalog dossier.
 */
export function normalizeStorageCategory(
  rawCategory: unknown,
  isIngested?: boolean,
  epistemicRaw?: unknown,
): DatasetStorageCategory {
  if (typeof rawCategory === 'string') {
    const upper = rawCategory.trim().toUpperCase()
    if (
      upper === 'LOCAL_RAW' ||
      upper === 'LOCAL_DERIVED' ||
      upper === 'REMOTE_CACHED_PROXY' ||
      upper === 'STATIC_METADATA' ||
      upper === 'MODEL_SIMULATED'
    ) {
      return upper
    }
  }
  if (typeof epistemicRaw === 'string') {
    const upperEp = epistemicRaw.trim().toUpperCase()
    if (upperEp === 'SIMULATED' || upperEp === 'CLIMATE_MODELED') {
      return 'MODEL_SIMULATED'
    }
    if (upperEp === 'DERIVED') {
      return isIngested ? 'LOCAL_DERIVED' : 'STATIC_METADATA'
    }
  }
  if (isIngested === true) return 'LOCAL_RAW'
  if (isIngested === false) return 'STATIC_METADATA'
  return 'UNKNOWN'
}

/**
 * Resolve storage provenance category for an Atlas Map Entry using explicit
 * validation_status, product_identifier, doi_or_url, processing_history, and
 * product_type evidence rather than blindly mapping every VERIFIED_LOCAL entry
 * to LOCAL_DERIVED. Fails safe to UNKNOWN when provenance evidence is absent.
 */
export function mapAtlasEntryToStorageCategory(entry: AtlasMapEntry): DatasetStorageCategory {
  const val = (entry.validation_status || '').trim().toUpperCase()
  const pt = entry.product_type
  const url = (entry.doi_or_url || '').toLowerCase()
  const pid = (entry.product_identifier || '').toLowerCase()
  const history = (entry.processing_history || '').toLowerCase()

  if (val === 'VERIFIED_REMOTE_WMS' || val === 'VERIFIED_REMOTE_WMTS') {
    return 'REMOTE_CACHED_PROXY'
  }
  if (pt === 'SIM' || history.includes('simulated') || history.includes('numerical climate model')) {
    return 'MODEL_SIMULATED'
  }
  if (val === 'VERIFIED_LOCAL') {
    const hasProcessedLineage =
      url.startsWith('file:///data/processed/') || pid.includes('jezero_western_delta_')
    const hasRawArchiveEvidence =
      pid.includes('m20_traverse.json') ||
      pid.includes('megt90n000cb.img') ||
      pid.includes('jez_ctx_b_soc_') ||
      pid.includes('hirise_dtm_delta_jezero')

    if (hasRawArchiveEvidence && !hasProcessedLineage) return 'LOCAL_RAW'
    if (hasProcessedLineage) return 'LOCAL_DERIVED'
    if (pt === 'SRC') return 'LOCAL_RAW'
    if (pt === 'DRV') return 'LOCAL_DERIVED'
    return 'UNKNOWN'
  }
  if (val === 'VERIFIED_ARCHIVE' || val === 'CATALOGUED') {
    return 'STATIC_METADATA'
  }

  const status = (entry.processing_status || '').toUpperCase()
  if (status.includes('SIMULAT') || status.includes('MODEL')) {
    return 'MODEL_SIMULATED'
  }
  if (status.includes('WMTS') || status.includes('WMS') || status.includes('TILE') || status.includes('PROXY')) {
    return 'REMOTE_CACHED_PROXY'
  }
  if (pt === 'DRV' && (status.includes('PROCESSED') || status.includes('READY') || status.includes('ARD'))) {
    return 'LOCAL_DERIVED'
  }
  if (pt === 'SRC' && (status.includes('INGESTED') || status.includes('LOCAL'))) {
    return 'LOCAL_RAW'
  }
  if (pt === 'VEC' || pt === 'INT' || status.includes('METADATA') || status.includes('REFERENCE')) {
    return 'STATIC_METADATA'
  }
  return 'UNKNOWN'
}

export function datasetDossierToMissionRef(
  dataset: PlanetaryDatasetProduct,
  attachedAt = new Date().toISOString(),
): MissionDatasetRef {
  const epistemicRaw = dataset.epistemicClass ?? dataset.epistemic_class
  return {
    datasetId: dataset.id,
    title: dataset.title || dataset.id,
    agency: dataset.agency || null,
    instrument: dataset.instrument || null,
    doiOrUrn: dataset.doiOrUrn || null,
    resolution: dataset.resolution || null,
    storageCategory: normalizeStorageCategory(
      dataset.storageCategory,
      dataset.isIngested,
      epistemicRaw,
    ),
    availabilityStatus:
      dataset.availabilityStatus ||
      (dataset.isIngested
        ? 'Locally available in repository archive'
        : 'Metadata reference only (not stored locally)'),
    epistemicClass: normalizeDatasetEpistemicTag(epistemicRaw),
    supportsRegions:
      Array.isArray(dataset.supportsRegions) && dataset.supportsRegions.length > 0
        ? dataset.supportsRegions
        : undefined,
    attachedAt,
  }
}

export function atlasEntryToMissionRef(
  entry: AtlasMapEntry,
  attachedAt = new Date().toISOString(),
): MissionDatasetRef {
  const supportsRegions = Array.isArray(entry.supports_regions)
    ? entry.supports_regions.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    : []
  return {
    datasetId: entry.canonical_id || entry.id,
    title: entry.name || entry.canonical_id || entry.id,
    agency: entry.source_organisation || entry.source || null,
    instrument: entry.instrument_mission || entry.mission_instrument || null,
    doiOrUrn: entry.doi_or_url || entry.product_identifier || null,
    resolution: entry.resolution || entry.original_spatial_resolution || null,
    storageCategory: mapAtlasEntryToStorageCategory(entry),
    availabilityStatus: entry.processing_status || 'Atlas catalog record',
    epistemicClass: normalizeDatasetEpistemicTag(entry.epistemic_class),
    supportsRegions,
    attachedAt,
  }
}

export function datasetSupportsRegion(
  supportsRegions: readonly string[] | undefined,
  regionId: string,
): boolean {
  if (!supportsRegions || supportsRegions.length === 0) return false
  return supportsRegions.includes('all') || supportsRegions.includes('global') || supportsRegions.includes(regionId)
}

/**
 * Build a scientifically attributed SCIENCE observation record from a target dossier.
 */
export function buildScienceTargetObservation(
  target: CandidateTargetFeature,
  activeRegionId: string = JEZERO_SOURCE_REGION_ID,
  userNote?: string,
  recordedAt = new Date().toISOString(),
): MissionObservationRecord {
  const props = target.properties
  const coord = normalizeMarsCoordinate({
    lat: target.geometry.coordinates[1],
    lon: target.geometry.coordinates[0],
  })
  const elev = target.geometry.coordinates[2]
  const scorePct = (props.composite_score * 100).toFixed(1)
  const derivedSummary = `${props.primary_science_theme} · Composite score ${scorePct}% · Elevation ${
    Number.isFinite(elev) ? `${elev.toFixed(1)} m` : 'N/A'
  } (${CANONICAL_MARS_CRS})`
  const trimmedNote = userNote?.trim()
  const trimmedActive = activeRegionId?.trim()

  return {
    id: `obs-sci-${props.target_id.toLowerCase()}`,
    category: 'SCIENCE',
    label: `${props.target_id}: ${props.name}`,
    coordinate: coord,
    summary: trimmedNote ? `${trimmedNote} — ${derivedSummary}` : derivedSummary,
    ...(trimmedNote ? { userNote: trimmedNote } : {}),
    derivedSummary,
    regionId: JEZERO_SOURCE_REGION_ID,
    ...(trimmedActive && trimmedActive !== JEZERO_SOURCE_REGION_ID
      ? { activeMissionRegionId: trimmedActive }
      : {}),
    sourceDataset: SCIENCE_TARGETS_DATASET_ID,
    provenance: SCIENCE_TARGETS_PROVENANCE,
    targetId: props.target_id,
    epistemicClass: normalizeDatasetEpistemicTag(props.epistemic_class || 'INTERPRETED'),
    recordedAt,
  }
}

export const JEZERO_SIM3464_EXTENT_LABEL =
  'Jezero Crater Floor & Western Delta (USGS SIM-3464 1:75,000 vector extent)'
export const JEZERO_SIM3464_BOUNDS: [[number, number], [number, number]] = [
  [18.15, 77.2],
  [18.65, 77.65],
]
export const JEZERO_CRISM_SWATH_BOUNDS: [[number, number], [number, number]] = [
  [18.3918, 77.3437],
  [18.58953, 77.46584],
]
export const GLOBAL_SIM3292_EXTENT_LABEL =
  'Global Mars (USGS SIM-3292 1:20,000,000 planetary geologic extent)'
export const GLOBAL_SIM3292_BOUNDS: [[number, number], [number, number]] = [
  [-90, -180],
  [90, 180],
]

/**
 * Build a scientifically attributed GEOLOGY observation record from a CRISM scene, index, or USGS unit.
 */
export function buildGeologyObservation(params: {
  featureId: string
  label: string
  coordinate: { lat: number; lon: number } | null
  spatialCoverage?: string | null
  coverageBounds?: [[number, number], [number, number]] | null
  regionId: string
  activeMissionRegionId?: string | null
  derivedSummary: string
  userNote?: string
  epistemicRaw: unknown
  sourceDataset: string
  provenance: string
  recordedAt?: string
}): MissionObservationRecord {
  const trimmedNote = params.userNote?.trim()
  const trimmedActive = params.activeMissionRegionId?.trim()
  const epistemicClass = normalizeDatasetEpistemicTag(params.epistemicRaw)
  return {
    id: `obs-geo-${params.featureId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`,
    category: 'GEOLOGY',
    label: params.label,
    coordinate: params.coordinate ? normalizeMarsCoordinate(params.coordinate) : null,
    ...(params.spatialCoverage ? { spatialCoverage: params.spatialCoverage } : {}),
    ...(params.coverageBounds ? { coverageBounds: params.coverageBounds } : {}),
    summary: trimmedNote
      ? `${trimmedNote} — ${params.derivedSummary}`
      : params.derivedSummary,
    ...(trimmedNote ? { userNote: trimmedNote } : {}),
    derivedSummary: params.derivedSummary,
    regionId: params.regionId,
    ...(trimmedActive && trimmedActive !== params.regionId
      ? { activeMissionRegionId: trimmedActive }
      : {}),
    sourceDataset: params.sourceDataset,
    provenance: params.provenance,
    epistemicClass,
    recordedAt: params.recordedAt ?? new Date().toISOString(),
  }
}

/**
 * Build a CRISM spectral summary index observation. Spectral summary parameters
 * have no single point coordinate (`coordinate: null`) and must never inherit an
 * unrelated selected target's coordinate; spatial coverage and bounds are preserved.
 */
export function buildCrismIndexObservation(
  idx: CRISMIndexDTO,
  activeMissionRegionId: string = JEZERO_SOURCE_REGION_ID,
  userNote?: string,
  recordedAt?: string,
): MissionObservationRecord {
  return buildGeologyObservation({
    featureId: `index-${idx.index_code}`,
    label: `CRISM Index ${idx.index_code}: ${idx.name}`,
    coordinate: null,
    spatialCoverage: `CRISM Jezero targeted spectral summary index (${idx.index_code} @ ${idx.wavelength_microns.toFixed(2)} µm)`,
    coverageBounds: JEZERO_CRISM_SWATH_BOUNDS,
    regionId: JEZERO_SOURCE_REGION_ID,
    activeMissionRegionId,
    derivedSummary: `λ=${idx.wavelength_microns} µm · Target: ${idx.target_mineral} · ${idx.absorption_feature}`,
    userNote,
    epistemicRaw: idx.epistemic_class || 'INTERPRETED',
    sourceDataset: 'CRISM Spectral Summary Parameters',
    provenance: 'Diagnostic spectral band definition paired with curated Jezero summary metadata',
    recordedAt,
  })
}

/**
 * Build a USGS SIM-3464 regional geologic unit observation. Areal stratigraphic units
 * have no single point coordinate (`coordinate: null`) and must never inherit an
 * unrelated selected target's coordinate; spatial coverage and bounds are preserved.
 */
export function buildGeologicUnitObservation(
  unit: GeologicUnitDTO,
  activeMissionRegionId: string = JEZERO_SOURCE_REGION_ID,
  userNote?: string,
  recordedAt?: string,
): MissionObservationRecord {
  return buildGeologyObservation({
    featureId: `unit-${unit.symbol}`,
    label: `USGS Unit [${unit.symbol}] ${unit.name}`,
    coordinate: null,
    spatialCoverage: JEZERO_SIM3464_EXTENT_LABEL,
    coverageBounds: JEZERO_SIM3464_BOUNDS,
    regionId: JEZERO_SOURCE_REGION_ID,
    activeMissionRegionId,
    derivedSummary: `${unit.epoch} · ${unit.dominant_lithology} · Key minerals: ${unit.key_minerals.join(', ')}`,
    userNote,
    epistemicRaw: unit.epistemic_class || 'INTERPRETED',
    sourceDataset: 'USGS SIM-3464 (Sun & Stack, 2020)',
    provenance: 'Curated Jezero stratigraphic unit summary (human cartographic delineation)',
    recordedAt,
  })
}

/**
 * Match candidate Jezero science targets against genuine mineralogical or lithological
 * descriptor terms using documented target themes and rationales (never fabricating links).
 */
export function matchScienceTargetsForKeywords(
  targets: readonly CandidateTargetFeature[],
  keywords: readonly string[],
): CandidateTargetFeature[] {
  const tokens = Array.from(
    new Set(
      keywords
        .flatMap((kw) => kw.toLowerCase().split(/[^a-z0-9]+/))
        .filter((tok) => tok.length >= 4 && !['unit', 'crater', 'jezero', 'western', 'delta', 'mars', 'deposit'].includes(tok)),
    ),
  )
  if (targets.length === 0 || tokens.length === 0) return []

  const scored: Array<{ target: CandidateTargetFeature; hits: number }> = []
  for (const tgt of targets) {
    const haystack =
      `${tgt.properties.primary_science_theme} ${tgt.properties.rationale} ${tgt.properties.name}`.toLowerCase()
    let hits = 0
    for (const tok of tokens) {
      if (haystack.includes(tok)) hits += 1
    }
    if (hits > 0) {
      scored.push({ target: tgt, hits })
    }
  }
  scored.sort(
    (a, b) =>
      b.hits - a.hits ||
      b.target.properties.composite_score - a.target.properties.composite_score,
  )
  return scored.map((entry) => entry.target)
}

/**
 * Derive thematic geological unit / mineral index hints associated with a Jezero target.
 * Only marks `relationshipMethod: 'CURATED_SOURCE_SUPPORTED'` (`INTERPRETED`) when the
 * target record explicitly carries curated source-backed associations; keyword/score
 * inference always remains `KEYWORD_DISCOVERY_HINT` (`HEURISTIC`).
 */
export function inferTargetGeologyThemes(target: CandidateTargetFeature): {
  keywords: string[]
  recommendedDatasetIds: string[]
  recommendedUnitHints: string[]
  recommendedCrismHints: string[]
  relationshipMethod: 'CURATED_SOURCE_SUPPORTED' | 'KEYWORD_DISCOVERY_HINT'
  relationshipEpistemicClass: 'INTERPRETED' | 'HEURISTIC'
} {
  const props = target.properties
  const curatedUnits = Array.isArray(props.curated_unit_symbols)
    ? props.curated_unit_symbols.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    : []
  const curatedScenes = Array.isArray(props.curated_crism_scenes)
    ? props.curated_crism_scenes.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : []
  const curatedIndices = Array.isArray(props.curated_crism_indices)
    ? props.curated_crism_indices.filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
    : []
  const hasCuratedAssociation =
    curatedUnits.length > 0 || curatedScenes.length > 0 || curatedIndices.length > 0

  const text = `${props.primary_science_theme} ${props.rationale} ${props.name}`.toLowerCase()
  const keywords: string[] = []
  const recommendedUnitHints: string[] = [...curatedUnits]
  const recommendedCrismHints: string[] = [...curatedScenes, ...curatedIndices]
  const recommendedDatasetIds = new Set<string>(['product-07', 'product-08', 'product-01', 'product-03'])

  if (text.includes('carbonate') || props.breakdown.mineralogy >= 0.6) {
    keywords.push('Carbonate / Olivine-Carbonate', 'Phyllosilicate / Clay')
    recommendedCrismHints.push('MIN2290', 'D2300', 'FRT00005850', 'HRL000040FF')
    recommendedUnitHints.push('Nff', 'Nld')
  }
  if (text.includes('delta') || text.includes('clay') || props.breakdown.delta_context >= 0.5) {
    keywords.push('Western Fan Delta / Fluvio-Lacustrine')
    recommendedUnitHints.push('Nld', 'Nldb')
    recommendedCrismHints.push('D2300', 'FRT00005850')
  }
  if (text.includes('layer') || text.includes('strat') || props.breakdown.layered_features >= 0.6) {
    keywords.push('Layered Stratigraphic Outcrop')
    recommendedUnitHints.push('Nld', 'Nldb', 'Ncf')
  }
  if (text.includes('rover') || props.breakdown.rover_proximity >= 0.5) {
    keywords.push('Perseverance Traverse Proximity')
    recommendedDatasetIds.add('product-09')
  }
  if (keywords.length === 0) {
    keywords.push('General Jezero Crater Mineralogy & Stratigraphy')
    recommendedUnitHints.push('Ncf', 'Nld')
    recommendedCrismHints.push('D2300', 'OLINDEX3')
  }

  return {
    keywords: Array.from(new Set(keywords)),
    recommendedDatasetIds: Array.from(recommendedDatasetIds),
    recommendedUnitHints: Array.from(new Set(recommendedUnitHints)),
    recommendedCrismHints: Array.from(new Set(recommendedCrismHints)),
    relationshipMethod: hasCuratedAssociation ? 'CURATED_SOURCE_SUPPORTED' : 'KEYWORD_DISCOVERY_HINT',
    relationshipEpistemicClass: hasCuratedAssociation ? 'INTERPRETED' : 'HEURISTIC',
  }
}

/**
 * Construct the geological feature focus reference for Science Explorer -> Geology handoff,
 * preserving honest relationship provenance (`CURATED_SOURCE_SUPPORTED` only when backed by
 * explicit curated target associations; `KEYWORD_DISCOVERY_HINT` + `HEURISTIC` otherwise).
 */
export function buildTargetGeologyHandoffRef(
  target: CandidateTargetFeature,
  activeMissionRegionId: string = JEZERO_SOURCE_REGION_ID,
): MissionGeologicalFeatureRef {
  const hints = inferTargetGeologyThemes(target)
  const tid = target.properties.target_id
  const trimmedActive = activeMissionRegionId?.trim()
  return {
    featureId: `theme-${tid}`,
    name: `${target.properties.primary_science_theme} (${tid})`,
    unitCode: hints.recommendedUnitHints[0] ?? hints.recommendedCrismHints[0] ?? null,
    featureType: 'STRATIGRAPHIC_UNIT',
    regionId: JEZERO_SOURCE_REGION_ID,
    ...(trimmedActive && trimmedActive !== JEZERO_SOURCE_REGION_ID
      ? { activeMissionRegionId: trimmedActive }
      : {}),
    coordinate: normalizeMarsCoordinate({
      lat: target.geometry.coordinates[1],
      lon: target.geometry.coordinates[0],
    }),
    epistemicClass: normalizeDatasetEpistemicTag(target.properties.epistemic_class),
    sourceDataset: SCIENCE_TARGETS_DATASET_ID,
    provenance:
      hints.relationshipMethod === 'CURATED_SOURCE_SUPPORTED'
        ? `Curated source-supported geological association from Science Target ${tid}`
        : `Heuristic keyword/score discovery hint from Science Target ${tid} (not a curated geological association)`,
    relatedTargetIds: [tid],
    relationshipMethod: hints.relationshipMethod,
    relationshipEpistemicClass: hints.relationshipEpistemicClass,
  }
}

/**
 * Resolve related Jezero science targets for a geological unit, CRISM scene, or CRISM index.
 * Prefers explicit curated source associations on target records (`CURATED_SOURCE_SUPPORTED`,
 * `INTERPRETED`); falls back to keyword overlap strictly as a `KEYWORD_DISCOVERY_HINT` (`HEURISTIC`).
 * Never promotes a heuristic link to `CURATED_SOURCE_SUPPORTED` via prior navigation state.
 */
export function resolveGeologicalTargetMatches(params: {
  targets: readonly CandidateTargetFeature[]
  featureType: 'CRISM_SCENE' | 'CRISM_INDEX' | 'STRATIGRAPHIC_UNIT'
  featureCode: string
  keywords: readonly string[]
}): {
  matchedTargets: CandidateTargetFeature[]
  relationshipMethod: 'CURATED_SOURCE_SUPPORTED' | 'KEYWORD_DISCOVERY_HINT'
  relationshipEpistemicClass: 'INTERPRETED' | 'HEURISTIC'
} {
  const code = params.featureCode.trim().toLowerCase()
  const curatedMatches = params.targets.filter((t) => {
    const p = t.properties
    if (params.featureType === 'STRATIGRAPHIC_UNIT') {
      return p.curated_unit_symbols?.some((u) => u.trim().toLowerCase() === code) ?? false
    }
    if (params.featureType === 'CRISM_SCENE') {
      return p.curated_crism_scenes?.some((s) => s.trim().toLowerCase() === code) ?? false
    }
    return p.curated_crism_indices?.some((i) => i.trim().toLowerCase() === code) ?? false
  })

  if (curatedMatches.length > 0) {
    return {
      matchedTargets: curatedMatches,
      relationshipMethod: 'CURATED_SOURCE_SUPPORTED',
      relationshipEpistemicClass: 'INTERPRETED',
    }
  }

  return {
    matchedTargets: matchScienceTargetsForKeywords(params.targets, params.keywords),
    relationshipMethod: 'KEYWORD_DISCOVERY_HINT',
    relationshipEpistemicClass: 'HEURISTIC',
  }
}

export function geologyUnitToMissionRef(
  unit: GeologicUnitDTO,
  activeRegionId: string = JEZERO_SOURCE_REGION_ID,
  relatedTargetIds: string[] = [],
  relationshipMeta?: {
    method?: MissionGeologicalFeatureRef['relationshipMethod']
    epistemicClass?: MissionGeologicalFeatureRef['relationshipEpistemicClass']
  },
): MissionGeologicalFeatureRef {
  const trimmedActive = activeRegionId?.trim()
  return {
    featureId: `sim3464-${unit.symbol}`,
    name: `${unit.symbol} — ${unit.name}`,
    unitCode: unit.symbol,
    featureType: 'STRATIGRAPHIC_UNIT',
    regionId: JEZERO_SOURCE_REGION_ID,
    ...(trimmedActive && trimmedActive !== JEZERO_SOURCE_REGION_ID
      ? { activeMissionRegionId: trimmedActive }
      : {}),
    coordinate: null,
    spatialCoverage: JEZERO_SIM3464_EXTENT_LABEL,
    coverageBounds: JEZERO_SIM3464_BOUNDS,
    epistemicClass: normalizeDatasetEpistemicTag(unit.epistemic_class || 'INTERPRETED'),
    sourceDataset: 'USGS SIM-3464 (Sun & Stack, 2020)',
    provenance: 'Curated Jezero stratigraphic unit summary (vector GIS archive)',
    ...(relatedTargetIds.length > 0 ? { relatedTargetIds } : {}),
    ...(relatedTargetIds.length > 0 && relationshipMeta?.method
      ? { relationshipMethod: relationshipMeta.method }
      : {}),
    ...(relatedTargetIds.length > 0 && relationshipMeta?.epistemicClass
      ? { relationshipEpistemicClass: relationshipMeta.epistemicClass }
      : {}),
  }
}

export function globalGeologyUnitToMissionRef(
  unit: GlobalGeologicUnitDTO,
  activeRegionId?: string | null,
): MissionGeologicalFeatureRef {
  const trimmedActive = activeRegionId?.trim()
  return {
    featureId: `sim3292-${unit.symbol}`,
    name: `${unit.symbol} — ${unit.name}`,
    unitCode: unit.symbol,
    featureType: 'GLOBAL_UNIT',
    regionId: GLOBAL_SCOPE_REGION_ID,
    ...(trimmedActive ? { activeMissionRegionId: trimmedActive } : {}),
    coordinate: null,
    spatialCoverage: GLOBAL_SIM3292_EXTENT_LABEL,
    coverageBounds: GLOBAL_SIM3292_BOUNDS,
    epistemicClass: 'INTERPRETED',
    sourceDataset: 'USGS SIM-3292 (Tanaka et al., 2014)',
    provenance: `Planetary stratigraphic map unit (1:20,000,000 global · ${unit.epoch})`,
  }
}

export function crismSceneToMissionRef(
  scene: CRISMTargetedSceneDTO,
  activeRegionId: string = JEZERO_SOURCE_REGION_ID,
  relatedTargetIds: string[] = [],
  relationshipMeta?: {
    method?: MissionGeologicalFeatureRef['relationshipMethod']
    epistemicClass?: MissionGeologicalFeatureRef['relationshipEpistemicClass']
  },
): MissionGeologicalFeatureRef {
  const trimmedActive = activeRegionId?.trim()
  return {
    featureId: `crism-${scene.scene_id}`,
    name: `${scene.scene_id} (${scene.target_description})`,
    unitCode: scene.primary_minerals_detected[0] ?? null,
    featureType: 'CRISM_SCENE',
    regionId: JEZERO_SOURCE_REGION_ID,
    ...(trimmedActive && trimmedActive !== JEZERO_SOURCE_REGION_ID
      ? { activeMissionRegionId: trimmedActive }
      : {}),
    coordinate: normalizeMarsCoordinate({ lat: scene.center_lat, lon: scene.center_lon }),
    spatialCoverage: `Jezero Crater CRISM targeted swath (${scene.scene_id})`,
    coverageBounds: JEZERO_CRISM_SWATH_BOUNDS,
    epistemicClass: normalizeDatasetEpistemicTag(scene.epistemic_class || 'INTERPRETED'),
    sourceDataset: scene.pds_archive_id || 'MRO CRISM MTRDR Metadata Summary',
    provenance: `Jezero CRISM scene ${scene.scene_id} (Ls ${scene.solar_longitude_ls.toFixed(1)}° metadata)`,
    resolution: '18.0 m/px hyperspectral',
    ...(relatedTargetIds.length > 0 ? { relatedTargetIds } : {}),
    ...(relatedTargetIds.length > 0 && relationshipMeta?.method
      ? { relationshipMethod: relationshipMeta.method }
      : {}),
    ...(relatedTargetIds.length > 0 && relationshipMeta?.epistemicClass
      ? { relationshipEpistemicClass: relationshipMeta.epistemicClass }
      : {}),
  }
}

export function crismIndexToMissionRef(
  idx: CRISMIndexDTO,
  activeRegionId: string = JEZERO_SOURCE_REGION_ID,
  relatedTargetIds: string[] = [],
  relationshipMeta?: {
    method?: MissionGeologicalFeatureRef['relationshipMethod']
    epistemicClass?: MissionGeologicalFeatureRef['relationshipEpistemicClass']
  },
): MissionGeologicalFeatureRef {
  const trimmedActive = activeRegionId?.trim()
  return {
    featureId: `crism-idx-${idx.index_code}`,
    name: `${idx.index_code} (${idx.name})`,
    unitCode: idx.index_code,
    featureType: 'CRISM_INDEX',
    regionId: JEZERO_SOURCE_REGION_ID,
    ...(trimmedActive && trimmedActive !== JEZERO_SOURCE_REGION_ID
      ? { activeMissionRegionId: trimmedActive }
      : {}),
    coordinate: null,
    spatialCoverage: `CRISM Jezero targeted spectral summary index (${idx.index_code} @ ${idx.wavelength_microns.toFixed(2)} µm)`,
    coverageBounds: JEZERO_CRISM_SWATH_BOUNDS,
    epistemicClass: normalizeDatasetEpistemicTag(idx.epistemic_class || 'INTERPRETED'),
    sourceDataset: 'CRISM Spectral Summary Parameters',
    provenance: `${idx.target_mineral} (${idx.wavelength_microns.toFixed(2)} um band: ${idx.absorption_feature})`,
    ...(relatedTargetIds.length > 0 ? { relatedTargetIds } : {}),
    ...(relatedTargetIds.length > 0 && relationshipMeta?.method
      ? { relationshipMethod: relationshipMeta.method }
      : {}),
    ...(relatedTargetIds.length > 0 && relationshipMeta?.epistemicClass
      ? { relationshipEpistemicClass: relationshipMeta.epistemicClass }
      : {}),
  }
}

/**
 * Safely migrate legacy standalone localStorage research notes once without failing on restricted storage.
 */
export function readLegacyScienceFieldNotes(storage: Pick<Storage, 'getItem'> | null): Record<string, string> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(RESEARCH_NOTES_LEGACY_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim()) {
        result[k.trim()] = v
      }
    }
    return result
  } catch {
    return {}
  }
}
