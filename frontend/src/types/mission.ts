import type { CostmapWeightsDTO } from '../api/costmap.ts'

export const MISSION_SCHEMA_VERSION = '1.0' as const

export type EpistemicClassTag =
  | 'OBSERVED'
  | 'DERIVED'
  | 'INTERPRETED'
  | 'PREDICTED'
  | 'HEURISTIC'
  | 'SIMULATED'
  | 'UNKNOWN'

export type MissionStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export type PageId =
  | 'overview'
  | 'digital-twin'
  | 'map-explorer'
  | 'data-hub'
  | 'terrain'
  | 'hazards'
  | 'geology'
  | 'science'
  | 'route-planner'
  | 'route-comparison'
  | 'simulation'
  | 'emergency'
  | 'reports'
  | 'settings'

export type ExplorerTabId =
  | 'MARS_EXPLORER'
  | 'MARS_MONOCHROME'
  | 'GLOBAL_GLOBE'
  | 'GLOBAL_MAP'
  | 'REGIONAL_MAP'
  | 'CATALOGUE'

export type RouteProfileId = 'SAFETY_FIRST' | 'SCIENCE_FIRST' | 'BALANCED' | 'CUSTOM'

export interface MarsCoordinate {
  lat: number
  lon: number
}

export interface MissionScienceTargetRef {
  targetId: string
  name: string
  coordinate: MarsCoordinate
  regionId?: string | null
  activeMissionRegionId?: string | null
  coordinateRef?: string | null
  elevationM?: number | null
  primaryTheme?: string | null
  compositeScore?: number | null
  epistemicClass: EpistemicClassTag
  sourceDataset?: string | null
  provenance?: string | null
  notes?: string
}

export interface MissionGeologicalFeatureRef {
  featureId: string
  name: string
  unitCode?: string | null
  featureType?: 'CRISM_SCENE' | 'CRISM_INDEX' | 'STRATIGRAPHIC_UNIT' | 'GLOBAL_UNIT' | null
  regionId?: string | null
  activeMissionRegionId?: string | null
  coordinate?: MarsCoordinate | null
  spatialCoverage?: string | null
  coverageBounds?: [[number, number], [number, number]] | null
  epistemicClass: EpistemicClassTag
  sourceDataset?: string | null
  provenance?: string | null
  resolution?: string | null
  relatedTargetIds?: string[]
  relationshipMethod?: 'CURATED_SOURCE_SUPPORTED' | 'KEYWORD_DISCOVERY_HINT' | null
  relationshipEpistemicClass?: EpistemicClassTag | null
}

export type DatasetStorageCategory =
  | 'LOCAL_RAW'
  | 'LOCAL_DERIVED'
  | 'REMOTE_CACHED_PROXY'
  | 'STATIC_METADATA'
  | 'MODEL_SIMULATED'
  | 'UNKNOWN'

export interface MissionDatasetRef {
  datasetId: string
  title: string
  agency?: string | null
  instrument?: string | null
  doiOrUrn?: string | null
  resolution?: string | null
  storageCategory: DatasetStorageCategory
  availabilityStatus?: string | null
  epistemicClass: EpistemicClassTag
  supportsRegions?: string[]
  attachedAt: string
}

export interface MissionHazardRef {
  coordinate: MarsCoordinate
  isPassable: boolean | null
  hardRestrictionCode: string | null
  hazardClassification?: string | null
  overallHazardScore?: number | null
  epistemicClass: EpistemicClassTag
  inspectedAt: string
}

export type MissionObservationCategory = 'TERRAIN' | 'HAZARD' | 'SCIENCE' | 'GEOLOGY' | 'CUSTOM'

export interface MissionObservationRecord {
  id: string
  category: MissionObservationCategory
  label: string
  coordinate: MarsCoordinate | null
  spatialCoverage?: string | null
  coverageBounds?: [[number, number], [number, number]] | null
  summary: string
  userNote?: string | null
  derivedSummary?: string | null
  regionId?: string | null
  activeMissionRegionId?: string | null
  sourceDataset?: string | null
  provenance?: string | null
  targetId?: string | null
  hazardClassification?: string | null
  resolutionClass?: string | null
  epistemicClass: EpistemicClassTag
  recordedAt: string
}

export interface MissionSortieWaypoint {
  id?: string
  lat: number
  lon: number
  name: string
  regionId?: string | null
  coordinateRef?: string | null
  elevationM?: number | null
  primaryTheme?: string | null
  compositeScore?: number | null
  epistemicClass?: EpistemicClassTag | null
  sourceDataset?: string | null
  provenance?: string | null
  notes?: string | null
}

export interface MissionSimulationConfig {
  scienceStopsCount: number
  isRoundTrip: boolean
  isMultiDestination: boolean
  scienceDurationPerStopMin?: number | null
  epistemicClass: 'HEURISTIC' | 'SIMULATED'
}

export interface MissionSimulationWarning {
  severity: 'CRITICAL' | 'WARNING' | 'CAUTION' | 'ADVISORY'
  code: string
  message: string
  remediation?: string
}

export interface MissionSimulationRecord {
  simulatedAt: string
  routeId: string
  profileName: string
  isRoundTrip: boolean
  isMultiDestination: boolean
  totalDistanceKm: number
  totalDurationHours: number
  walkingMinutes: number
  scienceMinutes: number
  restMinutes: number
  reserveMinutes: number
  o2ConsumedG: number
  o2RemainingG: number
  o2MarginPct: number
  batteryConsumedWh: number
  batteryRemainingWh: number
  batteryMarginPct: number
  metabolicKcal: number
  averageMetabolicWatts: number
  isFeasible: boolean
  warningsCount: number
  warnings: MissionSimulationWarning[]
  environmentalModifierApplied: boolean
  environmentalStressFactor?: number
}

export interface MissionContingencyRecord {
  testedAt: string
  incidentId: string
  incidentTitle: string
  incidentType: string
  severity: string
  incidentLocation: MarsCoordinate
  progressAlongRoutePct: number
  isRouteAffected: boolean
  detourDistanceM: number
  deltaDistanceM: number
  detourDurationMin: number
  deltaDurationMin: number
  additionalO2G: number
  additionalBatteryWh: number
  actionTaken: 'REROUTE' | 'ABORT_TO_BASE'
  isFeasible: boolean
  reasoning: string
}

export interface MissionEnvironmentalSummary {
  evaluatedAt: string
  scenarioId: string
  title: string
  suitabilityScore: number
  suitabilityCategory: string
  airTemperatureC: number
  dustOpticalDepthTau: number
  windSpeedMps: number
  warnings: string[]
}

export interface MissionGeographicContext {
  regionId: string
  selectedLocation: MarsCoordinate | null
  mapCenter: MarsCoordinate | null
  mapZoom: number | null
  activeLayers: Record<string, boolean>
  terrainResolution: string | null
}

export interface MissionScienceContext {
  selectedTarget: MissionScienceTargetRef | null
  selectedGeologicalFeature: MissionGeologicalFeatureRef | null
  selectedHazard: MissionHazardRef | null
  savedObservations: MissionObservationRecord[]
  queuedTargets: MissionSortieWaypoint[]
  attachedDatasets?: MissionDatasetRef[]
  targetNotes?: Record<string, string>
  focusedDatasetId?: string | null
}

export interface MissionRouteDecision {
  routeId: string
  profileName: string
  selectedAt: string
  metricsSummary: {
    totalDistanceM: number
    estimatedDurationMin: number
    meanHazardPct: number
    meanScienceScore: number
    preferenceUtilityScore: number
    rankUnderPreferences: number
  }
  visitedTargetIds: string[]
  scientificTargetsCount: number
  isStale?: boolean
  staleReason?: string | null
}

export interface MissionEvaContext {
  baseCamp: MarsCoordinate | null
  destination: MarsCoordinate | null
  waypoints: MissionSortieWaypoint[]
  routeProfile: RouteProfileId
  customWeights: CostmapWeightsDTO
  selectedComparisonRouteId: string | null
  activeRouteIds: string[]
  selectedRouteDecision?: MissionRouteDecision | null
}

export interface MissionSimulationContext {
  activeConfig: MissionSimulationConfig | null
  environmentalScenarioId: string | null
  contingencyScenarioId: string | null
  latestSimulation?: MissionSimulationRecord | null
  latestEnvironmental?: MissionEnvironmentalSummary | null
  applyEnvironmentalModifiers?: boolean
  testedContingencies?: MissionContingencyRecord[]
}

export interface MissionAppContext {
  activePage: PageId
  explorerTab: ExplorerTabId
}

export interface MissionBundleV1 {
  schemaVersion: typeof MISSION_SCHEMA_VERSION
  missionId: string
  name: string
  createdAt: string
  updatedAt: string
  status: MissionStatus
  geographic: MissionGeographicContext
  science: MissionScienceContext
  eva: MissionEvaContext
  simulation: MissionSimulationContext
  app: MissionAppContext
}

export interface MissionMetadataPatch {
  name?: string
  status?: MissionStatus
}

