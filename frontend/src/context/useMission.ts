import type React from 'react'
import { createContext, useContext } from 'react'
import type { CostmapInspectionResponse, CostmapWeightsDTO } from '../api/costmap.ts'
import type { DynamicReroutePlanDTO } from '../api/emergency.ts'
import type { LocationHazardInspection } from '../api/hazards.ts'
import type { RouteFeature } from '../api/routing.ts'
import type { CandidateTargetFeature, ScienceInspectionResponse } from '../api/science.ts'
import type { MultiResInspectResult } from '../api/terrain.ts'
import type { MissionAction } from '../mission/missionReducer.ts'
import type { DraftLoadStatus } from '../mission/missionStorage.ts'
import type {
  ExplorerTabId,
  MarsCoordinate,
  MissionBundleV1,
  MissionContingencyRecord,
  MissionDatasetRef,
  MissionEnvironmentalSummary,
  MissionGeologicalFeatureRef,
  MissionHazardRef,
  MissionMetadataPatch,
  MissionObservationRecord,
  MissionScienceTargetRef,
  MissionSimulationConfig,
  MissionSimulationRecord,
  MissionSortieWaypoint,
  PageId,
} from '../types/mission.ts'

export interface PersistenceStateInfo {
  loadStatus: DraftLoadStatus
  notice: string | null
  missingRequestedMissionId: string | null
  lastSavedAt: string | null
  storageError: string | null
}

export interface MissionRuntimeState {
  routes: RouteFeature[]
  emergencyPlan: DynamicReroutePlanDTO | null
  selectedHazard: LocationHazardInspection | null
  selectedCost: CostmapInspectionResponse | null
  selectedTerrain: MultiResInspectResult | null
  selectedScience: ScienceInspectionResponse | null
  inspectionError: string | null
  selectedTargetFeature: CandidateTargetFeature | null
  isInspecting: boolean
}

export interface MissionActions {
  dispatch: React.Dispatch<MissionAction>
  setActivePage: (page: PageId, explorerTab?: ExplorerTabId) => void
  setExplorerTab: (tab: ExplorerTabId) => void
  setActiveRegion: (regionId: string) => void
  updateMetadata: (patch: MissionMetadataPatch) => void
  toggleLayer: (layerId: string) => void
  setStartPoint: (coord: MarsCoordinate) => void
  setDestPoint: (coord: MarsCoordinate) => void
  updateEvaCoordinates: (baseCamp: MarsCoordinate, destination: MarsCoordinate) => void
  selectTargetFeature: (feature: CandidateTargetFeature | null) => void
  selectScienceTarget: (target: MissionScienceTargetRef | null) => void
  selectGeologicalFeature: (feature: MissionGeologicalFeatureRef | null) => void
  selectHazardRef: (hazard: MissionHazardRef | null) => void
  selectTargetForRouting: (feature: CandidateTargetFeature) => void
  queueScienceTarget: (target: MissionSortieWaypoint) => void
  unqueueScienceTarget: (targetIdOrName: string) => void
  clearQueuedTargets: () => void
  openEvaPlanner: () => void
  setQueuedWaypoints: (waypoints: MissionSortieWaypoint[]) => void
  sendWaypointsToEVAPlanner: (waypoints: MissionSortieWaypoint[]) => void
  selectRouteProfile: (profile: string) => void
  updateCustomWeight: (key: keyof CostmapWeightsDTO, value: number) => void
  setComparisonSelection: (selectedRouteId: string | null, activeRouteIds?: string[]) => void
  selectRoute: (decision: {
    routeId: string
    profileName: string
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
  }) => void
  clearSelectedRoute: () => void
  updateSimulationConfig: (patch: {
    activeConfig?: MissionSimulationConfig | null
    environmentalScenarioId?: string | null
    contingencyScenarioId?: string | null
  }) => void
  recordSimulationResult: (record: MissionSimulationRecord) => void
  recordEnvironmentalReport: (report: MissionEnvironmentalSummary) => void
  toggleEnvironmentalModifiers: (apply?: boolean) => void
  logContingencyTest: (contingency: MissionContingencyRecord) => void
  clearContingencyTests: () => void
  addObservation: (observation: MissionObservationRecord) => void
  removeObservation: (id: string) => void
  attachDataset: (dataset: MissionDatasetRef) => void
  detachDataset: (datasetId: string) => void
  setTargetNote: (targetId: string, note: string) => void
  setFocusedDataset: (datasetId: string | null) => void
  inspectCoordinates: (coords: MarsCoordinate) => void
  setRoutes: React.Dispatch<React.SetStateAction<RouteFeature[]>>
  setEmergencyPlan: React.Dispatch<React.SetStateAction<DynamicReroutePlanDTO | null>>
  resetMissionDraft: (options?: { preserveRegion?: boolean }) => void
  dismissPersistenceNotice: () => void
}

export interface MissionContextValue {
  mission: MissionBundleV1
  runtime: MissionRuntimeState
  persistence: PersistenceStateInfo
  actions: MissionActions
}

export const MissionContext = createContext<MissionContextValue | null>(null)

export function useMission(): MissionContextValue {
  const ctx = useContext(MissionContext)
  if (!ctx) {
    throw new Error('useMission must be used within a MissionProvider')
  }
  return ctx
}

export function useMissionState(): MissionBundleV1 {
  return useMission().mission
}

export function useMissionActions(): MissionActions {
  return useMission().actions
}

