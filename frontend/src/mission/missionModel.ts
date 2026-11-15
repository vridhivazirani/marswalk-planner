import type { CostmapWeightsDTO } from '../api/costmap.ts'
import {
  DEFAULT_PAGE_ID,
  DEFAULT_REGION_ID,
  EXPLORER_TABS,
  KNOWN_REGION_IDS,
  isValidRegionId,
  resolvePageId,
} from '../navigation/routes.ts'
import {
  MISSION_SCHEMA_VERSION,
  type DatasetStorageCategory,
  type EpistemicClassTag,
  type ExplorerTabId,
  type MarsCoordinate,
  type MissionBundleV1,
  type MissionContingencyRecord,
  type MissionDatasetRef,
  type MissionEnvironmentalSummary,
  type MissionGeologicalFeatureRef,
  type MissionHazardRef,
  type MissionObservationCategory,
  type MissionObservationRecord,
  type MissionRouteDecision,
  type MissionScienceTargetRef,
  type MissionSimulationConfig,
  type MissionSimulationRecord,
  type MissionSortieWaypoint,
  type MissionStatus,
  type PageId,
  type RouteProfileId,
} from '../types/mission.ts'

export const DEFAULT_BASE_CAMP: MarsCoordinate = { lat: 18.4446, lon: 77.4509 }
export const DEFAULT_DESTINATION: MarsCoordinate = { lat: 18.4550, lon: 77.4050 }

export const ROUTE_PROFILE_WEIGHTS: Record<Exclude<RouteProfileId, 'CUSTOM'>, CostmapWeightsDTO> = {
  BALANCED: { w_terrain: 0.30, w_hazard: 0.30, w_uncertainty: 0.15, w_science: 0.25 },
  SAFETY_FIRST: { w_terrain: 0.30, w_hazard: 0.50, w_uncertainty: 0.15, w_science: 0.05 },
  SCIENCE_FIRST: { w_terrain: 0.15, w_hazard: 0.20, w_uncertainty: 0.10, w_science: 0.55 },
}

export const DEFAULT_DIGITAL_TWIN_LAYERS: Record<string, boolean> = {
  ortho_imagery: true,
  elevation_colormap: false,
  hillshade: false,
  multidirectional_hillshade: false,
  elevation_contours: false,
  slope_overlay: false,
  terrain_classes: false,
  source_coverage: false,
  data_confidence: false,
  detection_confidence: false,
  spatial_uncertainty: false,
  resolution_uncertainty: false,
  overall_hazard: false,
  science_opportunity: false,
  unified_costmap: false,
  perseverance_traverse: true,
}

const VALID_EPISTEMIC_TAGS: readonly EpistemicClassTag[] = [
  'OBSERVED',
  'DERIVED',
  'INTERPRETED',
  'PREDICTED',
  'HEURISTIC',
  'SIMULATED',
  'UNKNOWN',
] as const

const VALID_MISSION_STATUSES: readonly MissionStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const
const VALID_ROUTE_PROFILES: readonly RouteProfileId[] = [
  'SAFETY_FIRST',
  'SCIENCE_FIRST',
  'BALANCED',
  'CUSTOM',
] as const
export const VALID_OBS_CATEGORIES: readonly MissionObservationCategory[] = [
  'TERRAIN',
  'HAZARD',
  'SCIENCE',
  'GEOLOGY',
  'CUSTOM',
] as const

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

export function isValidEpistemicTag(val: unknown): val is EpistemicClassTag {
  return typeof val === 'string' && VALID_EPISTEMIC_TAGS.includes(val as EpistemicClassTag)
}

export function isValidObservationCategory(val: unknown): val is MissionObservationCategory {
  return (
    typeof val === 'string' &&
    VALID_OBS_CATEGORIES.includes(val as MissionObservationCategory)
  )
}

/**
 * Normalize east-positive Mars longitude into canonical [-180, 180).
 */
export function normalizeEastLon(lon: number): number {
  if (!Number.isFinite(lon)) return Number.NaN
  if (lon >= -180 && lon < 180) {
    return Object.is(lon, -0) ? 0 : lon
  }
  let wrapped = lon % 360
  if (wrapped >= 180) wrapped -= 360
  if (wrapped < -180) wrapped += 360
  return Object.is(wrapped, -0) ? 0 : wrapped
}

export function normalizeCoordinate(coord: MarsCoordinate): MarsCoordinate {
  return {
    lat: coord.lat,
    lon: normalizeEastLon(coord.lon),
  }
}

export function isCanonicalCoordinate(val: unknown): val is MarsCoordinate {
  if (!isRecord(val)) return false
  const { lat, lon } = val
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon < 180
  )
}

export function isValidCoordinate(val: unknown): val is MarsCoordinate {
  if (!isRecord(val)) return false
  const { lat, lon } = val
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  )
}

function sanitizeNullableCoordinate(val: unknown): MarsCoordinate | null | undefined {
  if (val === null) return null
  if (!isValidCoordinate(val)) return undefined
  return normalizeCoordinate({ lat: val.lat, lon: val.lon })
}

export function isValidWeights(val: unknown): val is CostmapWeightsDTO {
  if (!isRecord(val)) return false
  const keys: Array<keyof CostmapWeightsDTO> = [
    'w_terrain',
    'w_hazard',
    'w_uncertainty',
    'w_science',
  ]
  for (const key of keys) {
    const v = val[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return false
    }
  }
  const sum =
    (val.w_terrain as number) +
    (val.w_hazard as number) +
    (val.w_uncertainty as number) +
    (val.w_science as number)
  return sum > 0
}

export function generateMissionId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `msn-${globalThis.crypto.randomUUID().slice(0, 8)}`
  }
  const ts = Date.now().toString(36)
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0')
  return `msn-${ts}-${rand}`
}

export interface CreateDefaultMissionOptions {
  missionId?: string
  name?: string
  regionId?: string
  activePage?: PageId
  explorerTab?: ExplorerTabId
  nowIso?: string
}

export function createDefaultMissionBundle(options: CreateDefaultMissionOptions = {}): MissionBundleV1 {
  const now = options.nowIso ?? new Date().toISOString()
  const regionId =
    options.regionId && isValidRegionId(options.regionId, KNOWN_REGION_IDS)
      ? options.regionId
      : DEFAULT_REGION_ID

  return {
    schemaVersion: MISSION_SCHEMA_VERSION,
    missionId: options.missionId ?? generateMissionId(),
    name: options.name ?? 'Jezero Exploration Draft',
    createdAt: now,
    updatedAt: now,
    status: 'DRAFT',
    geographic: {
      regionId,
      selectedLocation: null,
      mapCenter: null,
      mapZoom: null,
      activeLayers: { ...DEFAULT_DIGITAL_TWIN_LAYERS },
      terrainResolution:
        regionId === 'reg-jezero' ? '20m ARD / 1m HiRISE' : '14.818 km/px MOLA (4 ppd) Orbital Context',
    },
    science: {
      selectedTarget: null,
      selectedGeologicalFeature: null,
      selectedHazard: null,
      savedObservations: [],
      queuedTargets: [],
      attachedDatasets: [],
      targetNotes: {},
      focusedDatasetId: null,
    },
    eva: {
      baseCamp: { ...DEFAULT_BASE_CAMP },
      destination: { ...DEFAULT_DESTINATION },
      waypoints: [],
      routeProfile: 'BALANCED',
      customWeights: { ...ROUTE_PROFILE_WEIGHTS.BALANCED },
      selectedComparisonRouteId: null,
      activeRouteIds: [],
      selectedRouteDecision: null,
    },
    simulation: {
      activeConfig: null,
      environmentalScenarioId: null,
      contingencyScenarioId: null,
      latestSimulation: null,
      latestEnvironmental: null,
      applyEnvironmentalModifiers: false,
      testedContingencies: [],
    },
    app: {
      activePage: options.activePage ?? DEFAULT_PAGE_ID,
      explorerTab: options.explorerTab ?? 'GLOBAL_GLOBE',
    },
  }
}

function validateScienceTargetRef(raw: unknown): MissionScienceTargetRef | null {
  if (!isRecord(raw)) return null
  if (typeof raw.targetId !== 'string' || !raw.targetId.trim()) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (!isValidCoordinate(raw.coordinate)) return null
  if (!isValidEpistemicTag(raw.epistemicClass)) return null

  return {
    targetId: raw.targetId,
    name: raw.name,
    coordinate: normalizeCoordinate({ lat: raw.coordinate.lat, lon: raw.coordinate.lon }),
    regionId: typeof raw.regionId === 'string' && raw.regionId.trim() ? raw.regionId : null,
    ...(typeof raw.activeMissionRegionId === 'string' && raw.activeMissionRegionId.trim()
      ? { activeMissionRegionId: raw.activeMissionRegionId }
      : {}),
    coordinateRef:
      typeof raw.coordinateRef === 'string' && raw.coordinateRef.trim() ? raw.coordinateRef : null,
    elevationM: typeof raw.elevationM === 'number' && Number.isFinite(raw.elevationM) ? raw.elevationM : null,
    primaryTheme: typeof raw.primaryTheme === 'string' ? raw.primaryTheme : null,
    compositeScore:
      typeof raw.compositeScore === 'number' && Number.isFinite(raw.compositeScore)
        ? raw.compositeScore
        : null,
    epistemicClass: raw.epistemicClass,
    sourceDataset:
      typeof raw.sourceDataset === 'string' && raw.sourceDataset.trim() ? raw.sourceDataset : null,
    provenance: typeof raw.provenance === 'string' && raw.provenance.trim() ? raw.provenance : null,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
  }
}

const VALID_GEO_FEATURE_TYPES = new Set([
  'CRISM_SCENE',
  'CRISM_INDEX',
  'STRATIGRAPHIC_UNIT',
  'GLOBAL_UNIT',
])

const VALID_STORAGE_CATEGORIES = new Set<DatasetStorageCategory>([
  'LOCAL_RAW',
  'LOCAL_DERIVED',
  'REMOTE_CACHED_PROXY',
  'STATIC_METADATA',
  'MODEL_SIMULATED',
  'UNKNOWN',
])

const VALID_RELATIONSHIP_METHODS = new Set(['CURATED_SOURCE_SUPPORTED', 'KEYWORD_DISCOVERY_HINT'])

function validateCoverageBounds(
  raw: unknown,
): [[number, number], [number, number]] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const [sw, ne] = raw
  if (!Array.isArray(sw) || !Array.isArray(ne) || sw.length !== 2 || ne.length !== 2) {
    return null
  }
  const [latMin, lonMin] = sw
  const [latMax, lonMax] = ne
  if (
    typeof latMin !== 'number' ||
    typeof lonMin !== 'number' ||
    typeof latMax !== 'number' ||
    typeof lonMax !== 'number' ||
    !Number.isFinite(latMin) ||
    !Number.isFinite(lonMin) ||
    !Number.isFinite(latMax) ||
    !Number.isFinite(lonMax)
  ) {
    return null
  }
  if (latMin < -90 || latMax > 90 || lonMin < -180 || lonMax > 180) {
    return null
  }
  return [
    [latMin, lonMin],
    [latMax, lonMax],
  ]
}

function validateGeologicalFeatureRef(raw: unknown): MissionGeologicalFeatureRef | null {
  if (!isRecord(raw)) return null
  if (typeof raw.featureId !== 'string' || !raw.featureId.trim()) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (!isValidEpistemicTag(raw.epistemicClass)) return null
  const coord =
    raw.coordinate === undefined || raw.coordinate === null
      ? null
      : isValidCoordinate(raw.coordinate)
      ? normalizeCoordinate({ lat: raw.coordinate.lat, lon: raw.coordinate.lon })
      : undefined
  if (coord === undefined) return null

  const featureType =
    typeof raw.featureType === 'string' && VALID_GEO_FEATURE_TYPES.has(raw.featureType)
      ? (raw.featureType as MissionGeologicalFeatureRef['featureType'])
      : null

  const relatedTargetIds = Array.isArray(raw.relatedTargetIds)
    ? raw.relatedTargetIds.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : undefined
  const coverageBounds = validateCoverageBounds(raw.coverageBounds)
  const relationshipMethod =
    typeof raw.relationshipMethod === 'string' && VALID_RELATIONSHIP_METHODS.has(raw.relationshipMethod)
      ? (raw.relationshipMethod as MissionGeologicalFeatureRef['relationshipMethod'])
      : undefined
  const relationshipEpistemicClass = isValidEpistemicTag(raw.relationshipEpistemicClass)
    ? raw.relationshipEpistemicClass
    : undefined

  return {
    featureId: raw.featureId,
    name: raw.name,
    unitCode: typeof raw.unitCode === 'string' ? raw.unitCode : null,
    ...(featureType ? { featureType } : {}),
    ...(typeof raw.regionId === 'string' && raw.regionId.trim() ? { regionId: raw.regionId } : {}),
    ...(typeof raw.activeMissionRegionId === 'string' && raw.activeMissionRegionId.trim()
      ? { activeMissionRegionId: raw.activeMissionRegionId }
      : {}),
    coordinate: coord,
    ...(typeof raw.spatialCoverage === 'string' && raw.spatialCoverage.trim()
      ? { spatialCoverage: raw.spatialCoverage }
      : {}),
    ...(coverageBounds ? { coverageBounds } : {}),
    epistemicClass: raw.epistemicClass,
    ...(typeof raw.sourceDataset === 'string' && raw.sourceDataset.trim()
      ? { sourceDataset: raw.sourceDataset }
      : {}),
    ...(typeof raw.provenance === 'string' && raw.provenance.trim()
      ? { provenance: raw.provenance }
      : {}),
    ...(typeof raw.resolution === 'string' && raw.resolution.trim()
      ? { resolution: raw.resolution }
      : {}),
    ...(relatedTargetIds && relatedTargetIds.length > 0 ? { relatedTargetIds } : {}),
    ...(relationshipMethod ? { relationshipMethod } : {}),
    ...(relationshipEpistemicClass ? { relationshipEpistemicClass } : {}),
  }
}

export function validateDatasetRef(raw: unknown): MissionDatasetRef | null {
  if (!isRecord(raw)) return null
  if (typeof raw.datasetId !== 'string' || !raw.datasetId.trim()) return null
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null
  if (!isValidEpistemicTag(raw.epistemicClass)) return null
  const storageCategory =
    typeof raw.storageCategory === 'string' &&
    VALID_STORAGE_CATEGORIES.has(raw.storageCategory as DatasetStorageCategory)
      ? (raw.storageCategory as DatasetStorageCategory)
      : 'UNKNOWN'
  const supportsRegions = Array.isArray(raw.supportsRegions)
    ? raw.supportsRegions.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    : undefined

  return {
    datasetId: raw.datasetId.trim(),
    title: raw.title.trim(),
    agency: typeof raw.agency === 'string' && raw.agency.trim() ? raw.agency : null,
    instrument: typeof raw.instrument === 'string' && raw.instrument.trim() ? raw.instrument : null,
    doiOrUrn: typeof raw.doiOrUrn === 'string' && raw.doiOrUrn.trim() ? raw.doiOrUrn : null,
    resolution: typeof raw.resolution === 'string' && raw.resolution.trim() ? raw.resolution : null,
    storageCategory,
    availabilityStatus:
      typeof raw.availabilityStatus === 'string' && raw.availabilityStatus.trim()
        ? raw.availabilityStatus
        : null,
    epistemicClass: raw.epistemicClass,
    ...(supportsRegions && supportsRegions.length > 0 ? { supportsRegions } : {}),
    attachedAt:
      typeof raw.attachedAt === 'string' && raw.attachedAt.trim()
        ? raw.attachedAt
        : new Date(0).toISOString(),
  }
}

function validateHazardRef(raw: unknown): MissionHazardRef | null {
  if (!isRecord(raw)) return null
  if (!isValidCoordinate(raw.coordinate)) return null
  if (!isValidEpistemicTag(raw.epistemicClass)) return null
  if (typeof raw.inspectedAt !== 'string') return null

  return {
    coordinate: normalizeCoordinate({ lat: raw.coordinate.lat, lon: raw.coordinate.lon }),
    isPassable: typeof raw.isPassable === 'boolean' ? raw.isPassable : null,
    hardRestrictionCode:
      typeof raw.hardRestrictionCode === 'string' ? raw.hardRestrictionCode : null,
    hazardClassification:
      typeof raw.hazardClassification === 'string' ? raw.hazardClassification : null,
    overallHazardScore:
      typeof raw.overallHazardScore === 'number' && Number.isFinite(raw.overallHazardScore)
        ? raw.overallHazardScore
        : null,
    epistemicClass: raw.epistemicClass,
    inspectedAt: raw.inspectedAt,
  }
}

function validateWaypoint(raw: unknown): MissionSortieWaypoint | null {
  if (!isRecord(raw)) return null
  if (typeof raw.lat !== 'number' || typeof raw.lon !== 'number') return null
  if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) return null
  if (raw.lat < -90 || raw.lat > 90 || raw.lon < -180 || raw.lon > 180) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  const normalizedLon = normalizeEastLon(raw.lon)
  return {
    ...(typeof raw.id === 'string' && raw.id ? { id: raw.id } : {}),
    lat: raw.lat,
    lon: normalizedLon,
    name: raw.name,
    ...(typeof raw.regionId === 'string' && raw.regionId.trim() ? { regionId: raw.regionId } : {}),
    ...(typeof raw.coordinateRef === 'string' && raw.coordinateRef.trim()
      ? { coordinateRef: raw.coordinateRef }
      : {}),
    ...(typeof raw.elevationM === 'number' && Number.isFinite(raw.elevationM)
      ? { elevationM: raw.elevationM }
      : raw.elevationM === null
      ? { elevationM: null }
      : {}),
    ...(typeof raw.primaryTheme === 'string' ? { primaryTheme: raw.primaryTheme } : {}),
    ...(typeof raw.compositeScore === 'number' && Number.isFinite(raw.compositeScore)
      ? { compositeScore: raw.compositeScore }
      : raw.compositeScore === null
      ? { compositeScore: null }
      : {}),
    ...(isValidEpistemicTag(raw.epistemicClass) ? { epistemicClass: raw.epistemicClass } : {}),
    ...(typeof raw.sourceDataset === 'string' && raw.sourceDataset.trim()
      ? { sourceDataset: raw.sourceDataset }
      : {}),
    ...(typeof raw.provenance === 'string' && raw.provenance.trim()
      ? { provenance: raw.provenance }
      : {}),
    ...(typeof raw.notes === 'string' ? { notes: raw.notes } : {}),
  }
}

export function validateObservation(raw: unknown): MissionObservationRecord | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (!isValidObservationCategory(raw.category)) return null
  if (typeof raw.label !== 'string' || typeof raw.summary !== 'string') return null
  const coord =
    raw.coordinate === undefined || raw.coordinate === null
      ? null
      : isValidCoordinate(raw.coordinate)
      ? normalizeCoordinate({ lat: raw.coordinate.lat, lon: raw.coordinate.lon })
      : undefined
  if (coord === undefined) return null
  if (!isValidEpistemicTag(raw.epistemicClass)) return null
  if (typeof raw.recordedAt !== 'string' || !raw.recordedAt.trim()) return null

  const userNote =
    typeof raw.userNote === 'string'
      ? raw.userNote
      : raw.userNote === null
      ? null
      : undefined
  const derivedSummary =
    typeof raw.derivedSummary === 'string'
      ? raw.derivedSummary
      : raw.derivedSummary === null
      ? null
      : undefined

  const coverageBounds = validateCoverageBounds(raw.coverageBounds)
  return {
    id: raw.id,
    category: raw.category,
    label: raw.label,
    coordinate: coord,
    ...(typeof raw.spatialCoverage === 'string' && raw.spatialCoverage.trim()
      ? { spatialCoverage: raw.spatialCoverage }
      : {}),
    ...(coverageBounds ? { coverageBounds } : {}),
    summary: raw.summary,
    ...(userNote !== undefined ? { userNote } : {}),
    ...(derivedSummary !== undefined ? { derivedSummary } : {}),
    ...(typeof raw.regionId === 'string' && raw.regionId.trim() ? { regionId: raw.regionId } : {}),
    ...(typeof raw.activeMissionRegionId === 'string' && raw.activeMissionRegionId.trim()
      ? { activeMissionRegionId: raw.activeMissionRegionId }
      : {}),
    ...(typeof raw.sourceDataset === 'string' && raw.sourceDataset.trim()
      ? { sourceDataset: raw.sourceDataset }
      : {}),
    ...(typeof raw.provenance === 'string' && raw.provenance.trim()
      ? { provenance: raw.provenance }
      : {}),
    ...(typeof raw.targetId === 'string' && raw.targetId.trim() ? { targetId: raw.targetId } : {}),
    ...(typeof raw.hazardClassification === 'string' && raw.hazardClassification.trim()
      ? { hazardClassification: raw.hazardClassification }
      : {}),
    ...(typeof raw.resolutionClass === 'string' && raw.resolutionClass.trim()
      ? { resolutionClass: raw.resolutionClass }
      : {}),
    epistemicClass: raw.epistemicClass,
    recordedAt: raw.recordedAt,
  }
}

function validateSimulationConfig(raw: unknown): MissionSimulationConfig | null {
  if (!isRecord(raw)) return null
  if (typeof raw.scienceStopsCount !== 'number' || !Number.isFinite(raw.scienceStopsCount) || raw.scienceStopsCount < 0) {
    return null
  }
  if (typeof raw.isRoundTrip !== 'boolean' || typeof raw.isMultiDestination !== 'boolean') {
    return null
  }
  const epistemic = raw.epistemicClass
  if (epistemic !== 'HEURISTIC' && epistemic !== 'SIMULATED') return null

  return {
    scienceStopsCount: raw.scienceStopsCount,
    isRoundTrip: raw.isRoundTrip,
    isMultiDestination: raw.isMultiDestination,
    scienceDurationPerStopMin:
      typeof raw.scienceDurationPerStopMin === 'number' && Number.isFinite(raw.scienceDurationPerStopMin)
        ? raw.scienceDurationPerStopMin
        : null,
    epistemicClass: epistemic,
  }
}

function validateSimulationRecord(raw: unknown): MissionSimulationRecord | null {
  if (!isRecord(raw)) return null
  if (typeof raw.simulatedAt !== 'string' || typeof raw.routeId !== 'string' || typeof raw.profileName !== 'string') {
    return null
  }
  if (typeof raw.isRoundTrip !== 'boolean' || typeof raw.isMultiDestination !== 'boolean') return null
  if (typeof raw.totalDistanceKm !== 'number' || !Number.isFinite(raw.totalDistanceKm)) return null
  if (typeof raw.totalDurationHours !== 'number' || !Number.isFinite(raw.totalDurationHours)) return null
  if (typeof raw.o2ConsumedG !== 'number' || !Number.isFinite(raw.o2ConsumedG)) return null
  if (typeof raw.batteryConsumedWh !== 'number' || !Number.isFinite(raw.batteryConsumedWh)) return null
  if (typeof raw.isFeasible !== 'boolean') return null

  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((w): w is any => isRecord(w) && typeof w.severity === 'string' && typeof w.code === 'string')
    : []

  return {
    simulatedAt: raw.simulatedAt,
    routeId: raw.routeId,
    profileName: raw.profileName,
    isRoundTrip: raw.isRoundTrip,
    isMultiDestination: raw.isMultiDestination,
    totalDistanceKm: raw.totalDistanceKm,
    totalDurationHours: raw.totalDurationHours,
    walkingMinutes: typeof raw.walkingMinutes === 'number' ? raw.walkingMinutes : 0,
    scienceMinutes: typeof raw.scienceMinutes === 'number' ? raw.scienceMinutes : 0,
    restMinutes: typeof raw.restMinutes === 'number' ? raw.restMinutes : 0,
    reserveMinutes: typeof raw.reserveMinutes === 'number' ? raw.reserveMinutes : 0,
    o2ConsumedG: raw.o2ConsumedG,
    o2RemainingG: typeof raw.o2RemainingG === 'number' ? raw.o2RemainingG : 0,
    o2MarginPct: typeof raw.o2MarginPct === 'number' ? raw.o2MarginPct : 0,
    batteryConsumedWh: raw.batteryConsumedWh,
    batteryRemainingWh: typeof raw.batteryRemainingWh === 'number' ? raw.batteryRemainingWh : 0,
    batteryMarginPct: typeof raw.batteryMarginPct === 'number' ? raw.batteryMarginPct : 0,
    metabolicKcal: typeof raw.metabolicKcal === 'number' ? raw.metabolicKcal : 0,
    averageMetabolicWatts: typeof raw.averageMetabolicWatts === 'number' ? raw.averageMetabolicWatts : 0,
    isFeasible: raw.isFeasible,
    warningsCount: typeof raw.warningsCount === 'number' ? raw.warningsCount : warnings.length,
    warnings,
    environmentalModifierApplied: Boolean(raw.environmentalModifierApplied),
    environmentalStressFactor:
      typeof raw.environmentalStressFactor === 'number' && Number.isFinite(raw.environmentalStressFactor)
        ? raw.environmentalStressFactor
        : undefined,
  }
}

function validateEnvironmentalSummary(raw: unknown): MissionEnvironmentalSummary | null {
  if (!isRecord(raw)) return null
  if (typeof raw.evaluatedAt !== 'string' || typeof raw.scenarioId !== 'string' || typeof raw.title !== 'string') {
    return null
  }
  if (typeof raw.suitabilityScore !== 'number' || !Number.isFinite(raw.suitabilityScore)) return null
  return {
    evaluatedAt: raw.evaluatedAt,
    scenarioId: raw.scenarioId,
    title: raw.title,
    suitabilityScore: raw.suitabilityScore,
    suitabilityCategory: typeof raw.suitabilityCategory === 'string' ? raw.suitabilityCategory : 'OPTIMAL',
    airTemperatureC: typeof raw.airTemperatureC === 'number' ? raw.airTemperatureC : 0,
    dustOpticalDepthTau: typeof raw.dustOpticalDepthTau === 'number' ? raw.dustOpticalDepthTau : 0,
    windSpeedMps: typeof raw.windSpeedMps === 'number' ? raw.windSpeedMps : 0,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
  }
}

function validateContingencyRecord(raw: unknown): MissionContingencyRecord | null {
  if (!isRecord(raw)) return null
  if (typeof raw.testedAt !== 'string' || typeof raw.incidentId !== 'string' || typeof raw.incidentTitle !== 'string') {
    return null
  }
  if (!isValidCoordinate(raw.incidentLocation)) return null
  return {
    testedAt: raw.testedAt,
    incidentId: raw.incidentId,
    incidentTitle: raw.incidentTitle,
    incidentType: typeof raw.incidentType === 'string' ? raw.incidentType : 'SIMULATED_HAZARD',
    severity: typeof raw.severity === 'string' ? raw.severity : 'HIGH',
    incidentLocation: normalizeCoordinate(raw.incidentLocation),
    progressAlongRoutePct: typeof raw.progressAlongRoutePct === 'number' ? raw.progressAlongRoutePct : 0.5,
    isRouteAffected: Boolean(raw.isRouteAffected),
    detourDistanceM: typeof raw.detourDistanceM === 'number' ? raw.detourDistanceM : 0,
    deltaDistanceM: typeof raw.deltaDistanceM === 'number' ? raw.deltaDistanceM : 0,
    detourDurationMin: typeof raw.detourDurationMin === 'number' ? raw.detourDurationMin : 0,
    deltaDurationMin: typeof raw.deltaDurationMin === 'number' ? raw.deltaDurationMin : 0,
    additionalO2G: typeof raw.additionalO2G === 'number' ? raw.additionalO2G : 0,
    additionalBatteryWh: typeof raw.additionalBatteryWh === 'number' ? raw.additionalBatteryWh : 0,
    actionTaken: raw.actionTaken === 'ABORT_TO_BASE' ? 'ABORT_TO_BASE' : 'REROUTE',
    isFeasible: Boolean(raw.isFeasible),
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
  }
}

export type ValidationFailureReason =
  | 'not_an_object'
  | 'unsupported_version'
  | 'invalid_identity'
  | 'invalid_geographic'
  | 'invalid_science'
  | 'invalid_eva'
  | 'invalid_simulation'
  | 'invalid_app'

export type MissionValidationResult =
  | { ok: true; bundle: MissionBundleV1 }
  | { ok: false; reason: ValidationFailureReason; detail: string }

/**
 * Strictly validate an untrusted parsed JSON value against MissionBundleV1.
 * Rejects malformed types, invalid coordinates, and unsupported schema versions cleanly.
 */
export function validateMissionBundle(
  raw: unknown,
  knownRegions: readonly string[] = KNOWN_REGION_IDS,
): MissionValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'not_an_object', detail: 'Mission bundle must be a JSON object.' }
  }

  if (raw.schemaVersion !== MISSION_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'unsupported_version',
      detail: `Unsupported schemaVersion '${String(raw.schemaVersion)}' (expected '${MISSION_SCHEMA_VERSION}').`,
    }
  }

  if (
    typeof raw.missionId !== 'string' ||
    !raw.missionId.trim() ||
    typeof raw.name !== 'string' ||
    typeof raw.createdAt !== 'string' ||
    typeof raw.updatedAt !== 'string' ||
    typeof raw.status !== 'string' ||
    !VALID_MISSION_STATUSES.includes(raw.status as MissionStatus)
  ) {
    return { ok: false, reason: 'invalid_identity', detail: 'Invalid mission identity fields.' }
  }

  // Geographic section
  if (!isRecord(raw.geographic)) {
    return { ok: false, reason: 'invalid_geographic', detail: 'Missing geographic object.' }
  }
  const regionId =
    typeof raw.geographic.regionId === 'string' && isValidRegionId(raw.geographic.regionId, knownRegions)
      ? raw.geographic.regionId
      : null
  if (!regionId) {
    return { ok: false, reason: 'invalid_geographic', detail: 'Invalid geographic.regionId.' }
  }
  const selectedLocation =
    raw.geographic.selectedLocation === undefined
      ? null
      : sanitizeNullableCoordinate(raw.geographic.selectedLocation)
  const mapCenter =
    raw.geographic.mapCenter === undefined ? null : sanitizeNullableCoordinate(raw.geographic.mapCenter)
  if (selectedLocation === undefined || mapCenter === undefined) {
    return { ok: false, reason: 'invalid_geographic', detail: 'Invalid geographic coordinates.' }
  }
  const mapZoom =
    raw.geographic.mapZoom === undefined || raw.geographic.mapZoom === null
      ? null
      : typeof raw.geographic.mapZoom === 'number' && Number.isFinite(raw.geographic.mapZoom)
      ? raw.geographic.mapZoom
      : undefined
  if (mapZoom === undefined) {
    return { ok: false, reason: 'invalid_geographic', detail: 'Invalid geographic.mapZoom.' }
  }

  const activeLayers: Record<string, boolean> = { ...DEFAULT_DIGITAL_TWIN_LAYERS }
  if (isRecord(raw.geographic.activeLayers)) {
    for (const [k, v] of Object.entries(raw.geographic.activeLayers)) {
      if (typeof v === 'boolean') {
        activeLayers[k] = v
      }
    }
  }

  // Science section
  if (!isRecord(raw.science)) {
    return { ok: false, reason: 'invalid_science', detail: 'Missing science object.' }
  }
  const selectedTarget =
    raw.science.selectedTarget === undefined || raw.science.selectedTarget === null
      ? null
      : validateScienceTargetRef(raw.science.selectedTarget)
  if (raw.science.selectedTarget !== undefined && raw.science.selectedTarget !== null && !selectedTarget) {
    return { ok: false, reason: 'invalid_science', detail: 'Invalid science.selectedTarget.' }
  }

  const selectedGeoFeature =
    raw.science.selectedGeologicalFeature === undefined || raw.science.selectedGeologicalFeature === null
      ? null
      : validateGeologicalFeatureRef(raw.science.selectedGeologicalFeature)
  if (
    raw.science.selectedGeologicalFeature !== undefined &&
    raw.science.selectedGeologicalFeature !== null &&
    !selectedGeoFeature
  ) {
    return { ok: false, reason: 'invalid_science', detail: 'Invalid science.selectedGeologicalFeature.' }
  }

  const selectedHazard =
    raw.science.selectedHazard === undefined || raw.science.selectedHazard === null
      ? null
      : validateHazardRef(raw.science.selectedHazard)
  if (raw.science.selectedHazard !== undefined && raw.science.selectedHazard !== null && !selectedHazard) {
    return { ok: false, reason: 'invalid_science', detail: 'Invalid science.selectedHazard.' }
  }

  const savedObservations: MissionObservationRecord[] = []
  if (
    raw.science.savedObservations !== undefined &&
    raw.science.savedObservations !== null &&
    !Array.isArray(raw.science.savedObservations)
  ) {
    return {
      ok: false,
      reason: 'invalid_science',
      detail: 'Invalid science.savedObservations array.',
    }
  }
  if (Array.isArray(raw.science.savedObservations)) {
    for (const obs of raw.science.savedObservations) {
      const parsed = validateObservation(obs)
      if (parsed) {
        savedObservations.push(parsed)
      }
    }
  }

  const queuedTargets: MissionSortieWaypoint[] = []
  if (Array.isArray(raw.science.queuedTargets)) {
    for (const wp of raw.science.queuedTargets) {
      const parsed = validateWaypoint(wp)
      if (!parsed) {
        return { ok: false, reason: 'invalid_science', detail: 'Invalid queuedTargets entry.' }
      }
      queuedTargets.push(parsed)
    }
  }

  const attachedDatasets: MissionDatasetRef[] = []
  if (Array.isArray(raw.science.attachedDatasets)) {
    for (const ds of raw.science.attachedDatasets) {
      const parsed = validateDatasetRef(ds)
      if (parsed) {
        attachedDatasets.push(parsed)
      }
    }
  }

  const targetNotes: Record<string, string> = {}
  if (isRecord(raw.science.targetNotes)) {
    for (const [k, v] of Object.entries(raw.science.targetNotes)) {
      if (typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim().length > 0) {
        targetNotes[k.trim()] = v
      }
    }
  }

  const focusedDatasetId =
    typeof raw.science.focusedDatasetId === 'string' && raw.science.focusedDatasetId.trim()
      ? raw.science.focusedDatasetId.trim()
      : null

  // EVA section
  if (!isRecord(raw.eva)) {
    return { ok: false, reason: 'invalid_eva', detail: 'Missing eva object.' }
  }
  const baseCamp = raw.eva.baseCamp === undefined ? null : sanitizeNullableCoordinate(raw.eva.baseCamp)
  const destination = raw.eva.destination === undefined ? null : sanitizeNullableCoordinate(raw.eva.destination)
  if (baseCamp === undefined || destination === undefined) {
    return { ok: false, reason: 'invalid_eva', detail: 'Invalid eva baseCamp/destination coordinates.' }
  }

  const waypoints: MissionSortieWaypoint[] = []
  if (Array.isArray(raw.eva.waypoints)) {
    for (const wp of raw.eva.waypoints) {
      const parsed = validateWaypoint(wp)
      if (!parsed) {
        return { ok: false, reason: 'invalid_eva', detail: 'Invalid eva.waypoints entry.' }
      }
      waypoints.push(parsed)
    }
  }

  const routeProfile =
    typeof raw.eva.routeProfile === 'string' && VALID_ROUTE_PROFILES.includes(raw.eva.routeProfile as RouteProfileId)
      ? (raw.eva.routeProfile as RouteProfileId)
      : 'BALANCED'

  const customWeights = isValidWeights(raw.eva.customWeights)
    ? {
        w_terrain: raw.eva.customWeights.w_terrain,
        w_hazard: raw.eva.customWeights.w_hazard,
        w_uncertainty: raw.eva.customWeights.w_uncertainty,
        w_science: raw.eva.customWeights.w_science,
      }
    : { ...ROUTE_PROFILE_WEIGHTS.BALANCED }

  const activeRouteIds = Array.isArray(raw.eva.activeRouteIds)
    ? raw.eva.activeRouteIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []

  // Simulation section
  if (!isRecord(raw.simulation)) {
    return { ok: false, reason: 'invalid_simulation', detail: 'Missing simulation object.' }
  }
  const activeConfig =
    raw.simulation.activeConfig === undefined || raw.simulation.activeConfig === null
      ? null
      : validateSimulationConfig(raw.simulation.activeConfig)
  if (raw.simulation.activeConfig !== undefined && raw.simulation.activeConfig !== null && !activeConfig) {
    return { ok: false, reason: 'invalid_simulation', detail: 'Invalid simulation.activeConfig.' }
  }

  // App section
  if (!isRecord(raw.app)) {
    return { ok: false, reason: 'invalid_app', detail: 'Missing app object.' }
  }
  const activePage =
    typeof raw.app.activePage === 'string' ? (resolvePageId(raw.app.activePage) ?? DEFAULT_PAGE_ID) : DEFAULT_PAGE_ID
  const explorerTab =
    typeof raw.app.explorerTab === 'string' && EXPLORER_TABS.includes(raw.app.explorerTab as ExplorerTabId)
      ? (raw.app.explorerTab as ExplorerTabId)
      : 'GLOBAL_GLOBE'

  return {
    ok: true,
    bundle: {
      schemaVersion: MISSION_SCHEMA_VERSION,
      missionId: raw.missionId.trim(),
      name: raw.name,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      status: raw.status as MissionStatus,
      geographic: {
        regionId,
        selectedLocation,
        mapCenter,
        mapZoom,
        activeLayers,
        terrainResolution:
          typeof raw.geographic.terrainResolution === 'string' ? raw.geographic.terrainResolution : null,
      },
      science: {
        selectedTarget,
        selectedGeologicalFeature: selectedGeoFeature,
        selectedHazard,
        savedObservations,
        queuedTargets,
        attachedDatasets,
        targetNotes,
        focusedDatasetId,
      },
      eva: {
        baseCamp,
        destination,
        waypoints,
        routeProfile,
        customWeights,
        selectedComparisonRouteId:
          typeof raw.eva.selectedComparisonRouteId === 'string' ? raw.eva.selectedComparisonRouteId : null,
        activeRouteIds,
        selectedRouteDecision:
          raw.eva.selectedRouteDecision && typeof raw.eva.selectedRouteDecision === 'object'
            ? (raw.eva.selectedRouteDecision as MissionRouteDecision)
            : null,
      },
      simulation: {
        activeConfig,
        environmentalScenarioId:
          typeof raw.simulation.environmentalScenarioId === 'string'
            ? raw.simulation.environmentalScenarioId
            : null,
        contingencyScenarioId:
          typeof raw.simulation.contingencyScenarioId === 'string'
            ? raw.simulation.contingencyScenarioId
            : null,
        latestSimulation:
          raw.simulation.latestSimulation ? validateSimulationRecord(raw.simulation.latestSimulation) : null,
        latestEnvironmental:
          raw.simulation.latestEnvironmental ? validateEnvironmentalSummary(raw.simulation.latestEnvironmental) : null,
        applyEnvironmentalModifiers: Boolean(raw.simulation.applyEnvironmentalModifiers),
        testedContingencies: Array.isArray(raw.simulation.testedContingencies)
          ? raw.simulation.testedContingencies
              .map(validateContingencyRecord)
              .filter((c): c is MissionContingencyRecord => c !== null)
          : [],
      },
      app: {
        activePage,
        explorerTab,
      },
    },
  }
}

/**
 * Normalize all coordinate longitudes in a MissionBundleV1 into canonical [-180, 180) East.
 */
export function normalizeMissionBundleCoordinates(bundle: MissionBundleV1): MissionBundleV1 {
  return {
    ...bundle,
    geographic: {
      ...bundle.geographic,
      selectedLocation: bundle.geographic.selectedLocation
        ? normalizeCoordinate(bundle.geographic.selectedLocation)
        : null,
      mapCenter: bundle.geographic.mapCenter
        ? normalizeCoordinate(bundle.geographic.mapCenter)
        : null,
    },
    science: {
      ...bundle.science,
      selectedTarget: bundle.science.selectedTarget
        ? {
            ...bundle.science.selectedTarget,
            coordinate: normalizeCoordinate(bundle.science.selectedTarget.coordinate),
          }
        : null,
      selectedHazard: bundle.science.selectedHazard
        ? {
            ...bundle.science.selectedHazard,
            coordinate: normalizeCoordinate(bundle.science.selectedHazard.coordinate),
          }
        : null,
      queuedTargets: bundle.science.queuedTargets.map((target) => ({
        ...target,
        lon: normalizeEastLon(target.lon),
      })),
      savedObservations: bundle.science.savedObservations.map((obs) => ({
        ...obs,
        coordinate: obs.coordinate ? normalizeCoordinate(obs.coordinate) : null,
      })),
    },
    eva: {
      ...bundle.eva,
      baseCamp: bundle.eva.baseCamp ? normalizeCoordinate(bundle.eva.baseCamp) : null,
      destination: bundle.eva.destination ? normalizeCoordinate(bundle.eva.destination) : null,
      waypoints: bundle.eva.waypoints.map((wp) => ({
        ...wp,
        lon: normalizeEastLon(wp.lon),
      })),
    },
  }
}

/**
 * Migration boundary converting persisted JSON objects from previous compatible
 * schema versions into MissionBundleV1. Returns validation failure when incompatible.
 */
export function migrateMissionBundle(
  raw: unknown,
  knownRegions: readonly string[] = KNOWN_REGION_IDS,
): MissionValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'not_an_object', detail: 'Persisted mission payload is not an object.' }
  }

  switch (raw.schemaVersion) {
    case MISSION_SCHEMA_VERSION:
      return validateMissionBundle(raw, knownRegions)
    default:
      return {
        ok: false,
        reason: 'unsupported_version',
        detail: `No migration path available for schemaVersion '${String(raw.schemaVersion)}'.`,
      }
  }
}

