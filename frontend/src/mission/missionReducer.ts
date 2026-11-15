import type { CostmapWeightsDTO } from '../api/costmap.ts'
import { KNOWN_REGION_IDS, isValidRegionId, resolvePageId } from '../navigation/routes.ts'
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
  MissionRouteDecision,
  MissionScienceTargetRef,
  MissionSimulationConfig,
  MissionSimulationRecord,
  MissionSortieWaypoint,
  PageId,
  RouteProfileId,
} from '../types/mission.ts'
import {
  ROUTE_PROFILE_WEIGHTS,
  createDefaultMissionBundle,
  isValidCoordinate,
  isValidWeights,
  normalizeCoordinate,
  normalizeEastLon,
  validateDatasetRef,
  validateObservation,
} from './missionModel.ts'
import {
  getRegionCapabilityProfile,
  isTargetCompatibleWithRegion,
} from './regionCapabilities.ts'
import { datasetSupportsRegion } from './scienceWorkflowHelpers.ts'

export type MissionAction =
  | { type: 'MISSION/HYDRATE'; payload: MissionBundleV1 }
  | { type: 'MISSION/RESET_DRAFT'; payload?: { regionId?: string; activePage?: PageId; nowIso?: string } }
  | { type: 'MISSION/UPDATE_METADATA'; payload: MissionMetadataPatch; nowIso?: string }
  | { type: 'MISSION/SET_REGION'; payload: { regionId: string }; nowIso?: string }
  | { type: 'MISSION/SET_PAGE'; payload: { page: PageId; explorerTab?: ExplorerTabId } }
  | { type: 'MISSION/SET_EXPLORER_TAB'; payload: ExplorerTabId }
  | {
      type: 'MISSION/UPDATE_MAP_STATE'
      payload: {
        selectedLocation?: MarsCoordinate | null
        mapCenter?: MarsCoordinate | null
        mapZoom?: number | null
        terrainResolution?: string | null
      }
      nowIso?: string
    }
  | { type: 'MISSION/TOGGLE_LAYER'; payload: string; nowIso?: string }
  | { type: 'MISSION/SET_BASE_CAMP'; payload: (MarsCoordinate & { regionId?: string | null }) | null; nowIso?: string }
  | { type: 'MISSION/SET_DESTINATION'; payload: (MarsCoordinate & { regionId?: string | null }) | null; nowIso?: string }
  | { type: 'MISSION/SET_EVA_COORDINATES'; payload: { baseCamp: MarsCoordinate; destination: MarsCoordinate }; nowIso?: string }
  | { type: 'MISSION/SELECT_TARGET'; payload: MissionScienceTargetRef | null; nowIso?: string }
  | { type: 'MISSION/SELECT_GEOLOGICAL_FEATURE'; payload: MissionGeologicalFeatureRef | null; nowIso?: string }
  | { type: 'MISSION/SELECT_HAZARD'; payload: MissionHazardRef | null; nowIso?: string }
  | { type: 'MISSION/UPSERT_OBSERVATION'; payload: MissionObservationRecord; nowIso?: string }
  | { type: 'MISSION/REMOVE_OBSERVATION'; payload: string; nowIso?: string }
  | { type: 'MISSION/UPSERT_QUEUED_TARGET'; payload: MissionSortieWaypoint; nowIso?: string }
  | { type: 'MISSION/REMOVE_QUEUED_TARGET'; payload: string; nowIso?: string }
  | { type: 'MISSION/CLEAR_QUEUED_TARGETS'; nowIso?: string }
  | { type: 'MISSION/ATTACH_DATASET'; payload: MissionDatasetRef; nowIso?: string }
  | { type: 'MISSION/DETACH_DATASET'; payload: string; nowIso?: string }
  | { type: 'MISSION/SET_TARGET_NOTE'; payload: { targetId: string; note: string }; nowIso?: string }
  | { type: 'MISSION/SET_FOCUSED_DATASET'; payload: string | null; nowIso?: string }
  | { type: 'MISSION/SET_WAYPOINTS'; payload: MissionSortieWaypoint[]; nowIso?: string }
  | { type: 'MISSION/SET_ROUTE_PROFILE'; payload: RouteProfileId; nowIso?: string }
  | { type: 'MISSION/SET_CUSTOM_WEIGHTS'; payload: CostmapWeightsDTO; nowIso?: string }
  | {
      type: 'MISSION/UPDATE_CUSTOM_WEIGHT'
      payload: { key: keyof CostmapWeightsDTO; value: number }
      nowIso?: string
    }
  | {
      type: 'MISSION/SET_COMPARISON_SELECTION'
      payload: { selectedRouteId: string | null; activeRouteIds?: string[] }
      nowIso?: string
    }
  | {
      type: 'MISSION/SELECT_ROUTE'
      payload: {
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
      }
      nowIso?: string
    }
  | { type: 'MISSION/CLEAR_SELECTED_ROUTE'; nowIso?: string }
  | {
      type: 'MISSION/UPDATE_SIMULATION_CONFIG'
      payload: {
        activeConfig?: MissionSimulationConfig | null
        environmentalScenarioId?: string | null
        contingencyScenarioId?: string | null
      }
      nowIso?: string
    }
  | { type: 'MISSION/RECORD_SIMULATION_RESULT'; payload: MissionSimulationRecord; nowIso?: string }
  | { type: 'MISSION/RECORD_ENVIRONMENTAL_REPORT'; payload: MissionEnvironmentalSummary; nowIso?: string }
  | { type: 'MISSION/TOGGLE_ENVIRONMENTAL_MODIFIERS'; payload?: boolean; nowIso?: string }
  | { type: 'MISSION/LOG_CONTINGENCY_TEST'; payload: MissionContingencyRecord; nowIso?: string }
  | { type: 'MISSION/CLEAR_CONTINGENCY_TESTS'; nowIso?: string }

function withTimestamp(_state: MissionBundleV1, nowIso?: string): string {
  return nowIso ?? new Date().toISOString()
}

function sameCoord(a: MarsCoordinate | null, b: MarsCoordinate | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.lat === b.lat && a.lon === b.lon
}

function markDecisionStale(
  decision: MissionRouteDecision | null | undefined,
  reason: string,
): MissionRouteDecision | null {
  if (!decision) return null
  return {
    ...decision,
    isStale: true,
    staleReason: reason,
  }
}

export function missionReducer(state: MissionBundleV1, action: MissionAction): MissionBundleV1 {
  switch (action.type) {
    case 'MISSION/HYDRATE':
      return action.payload

    case 'MISSION/RESET_DRAFT':
      return createDefaultMissionBundle({
        regionId: action.payload?.regionId,
        activePage: action.payload?.activePage,
        nowIso: action.payload?.nowIso,
      })

    case 'MISSION/UPDATE_METADATA': {
      const nextName =
        typeof action.payload.name === 'string' && action.payload.name.trim()
          ? action.payload.name
          : state.name
      const nextStatus = action.payload.status ?? state.status
      if (nextName === state.name && nextStatus === state.status) return state
      return {
        ...state,
        name: nextName,
        status: nextStatus,
        updatedAt: withTimestamp(state, action.nowIso),
      }
    }

    case 'MISSION/SET_REGION': {
      const candidate = action.payload.regionId.trim()
      if (!isValidRegionId(candidate, KNOWN_REGION_IDS) || candidate === state.geographic.regionId) {
        return state
      }
      const caps = getRegionCapabilityProfile(candidate)
      const isLocalTwinSupported = caps.supportsLocalDigitalTwin
      const prevGeo = state.science.selectedGeologicalFeature
      const keepGeo =
        prevGeo && (prevGeo.regionId === 'all' || prevGeo.regionId === candidate)
          ? prevGeo
          : null
      const nextAttachedDatasets = (state.science.attachedDatasets ?? []).filter((d) =>
        datasetSupportsRegion(d.supportsRegions, candidate),
      )
      const nextFocusedDatasetId =
        state.science.focusedDatasetId &&
        nextAttachedDatasets.some((d) => d.datasetId === state.science.focusedDatasetId)
          ? state.science.focusedDatasetId
          : null

      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        geographic: {
          ...state.geographic,
          regionId: candidate,
          selectedLocation: isLocalTwinSupported ? state.geographic.selectedLocation : null,
          terrainResolution: isLocalTwinSupported
            ? '20m ARD / 1m HiRISE'
            : caps.primaryResolutionSummary,
        },
        science: {
          ...state.science,
          selectedTarget: isLocalTwinSupported ? state.science.selectedTarget : null,
          selectedHazard: isLocalTwinSupported ? state.science.selectedHazard : null,
          selectedGeologicalFeature: keepGeo,
          attachedDatasets: nextAttachedDatasets,
          focusedDatasetId: nextFocusedDatasetId,
        },
        eva: {
          ...state.eva,
          selectedComparisonRouteId: null,
          selectedRouteDecision: null,
        },
        simulation: isLocalTwinSupported
          ? state.simulation
          : {
              ...state.simulation,
              latestSimulation: null,
              testedContingencies: [],
              environmentalScenarioId: null,
              contingencyScenarioId: null,
            },
      }
    }

    case 'MISSION/SET_PAGE': {
      const resolvedPage = resolvePageId(action.payload.page)
      if (!resolvedPage) return state
      const nextTab = action.payload.explorerTab ?? state.app.explorerTab
      if (resolvedPage === state.app.activePage && nextTab === state.app.explorerTab) {
        return state
      }
      return {
        ...state,
        app: {
          ...state.app,
          activePage: resolvedPage,
          explorerTab: nextTab,
        },
      }
    }

    case 'MISSION/SET_EXPLORER_TAB': {
      if (action.payload === state.app.explorerTab) return state
      return {
        ...state,
        app: {
          ...state.app,
          explorerTab: action.payload,
        },
      }
    }

    case 'MISSION/UPDATE_MAP_STATE': {
      const nextLoc =
        action.payload.selectedLocation === undefined
          ? state.geographic.selectedLocation
          : action.payload.selectedLocation === null
          ? null
          : isValidCoordinate(action.payload.selectedLocation)
          ? normalizeCoordinate(action.payload.selectedLocation)
          : state.geographic.selectedLocation

      const nextCenter =
        action.payload.mapCenter === undefined
          ? state.geographic.mapCenter
          : action.payload.mapCenter === null
          ? null
          : isValidCoordinate(action.payload.mapCenter)
          ? normalizeCoordinate(action.payload.mapCenter)
          : state.geographic.mapCenter

      const nextZoom =
        action.payload.mapZoom === undefined
          ? state.geographic.mapZoom
          : action.payload.mapZoom === null ||
            (typeof action.payload.mapZoom === 'number' && Number.isFinite(action.payload.mapZoom))
          ? action.payload.mapZoom
          : state.geographic.mapZoom

      const nextRes =
        action.payload.terrainResolution === undefined
          ? state.geographic.terrainResolution
          : action.payload.terrainResolution

      if (
        sameCoord(nextLoc, state.geographic.selectedLocation) &&
        sameCoord(nextCenter, state.geographic.mapCenter) &&
        nextZoom === state.geographic.mapZoom &&
        nextRes === state.geographic.terrainResolution
      ) {
        return state
      }

      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        geographic: {
          ...state.geographic,
          selectedLocation: nextLoc ? { ...nextLoc } : null,
          mapCenter: nextCenter ? { ...nextCenter } : null,
          mapZoom: nextZoom,
          terrainResolution: nextRes,
        },
      }
    }

    case 'MISSION/TOGGLE_LAYER': {
      const layerId = action.payload
      if (!layerId) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        geographic: {
          ...state.geographic,
          activeLayers: {
            ...state.geographic.activeLayers,
            [layerId]: !state.geographic.activeLayers[layerId],
          },
        },
      }
    }

    case 'MISSION/SET_BASE_CAMP': {
      if (action.payload !== null) {
        if (!isValidCoordinate(action.payload)) return state
        if (!getRegionCapabilityProfile(state.geographic.regionId).supportsEvaRouting) {
          return state
        }
        const normalizedCandidate = normalizeCoordinate(action.payload)
        const candidateRegionId = (action.payload as { regionId?: string | null }).regionId
        if (candidateRegionId) {
          const check = isTargetCompatibleWithRegion(
            {
              regionId: candidateRegionId,
              lat: normalizedCandidate.lat,
              lon: normalizedCandidate.lon,
            },
            state.geographic.regionId,
          )
          if (!check.compatible) {
            return state
          }
        }
      }
      const normalized = action.payload ? normalizeCoordinate(action.payload) : null
      if (sameCoord(normalized, state.eva.baseCamp)) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          baseCamp: normalized,
          selectedRouteDecision: markDecisionStale(
            state.eva.selectedRouteDecision,
            'Base camp coordinates changed.',
          ),
        },
      }
    }

    case 'MISSION/SET_DESTINATION': {
      if (action.payload !== null) {
        if (!isValidCoordinate(action.payload)) return state
        if (!getRegionCapabilityProfile(state.geographic.regionId).supportsEvaRouting) {
          return state
        }
        const normalizedCandidate = normalizeCoordinate(action.payload)
        const check = isTargetCompatibleWithRegion(
          {
            regionId: (action.payload as { regionId?: string | null }).regionId,
            lat: normalizedCandidate.lat,
            lon: normalizedCandidate.lon,
          },
          state.geographic.regionId,
        )
        if (!check.compatible) {
          return state
        }
      }
      const normalized = action.payload ? normalizeCoordinate(action.payload) : null
      if (sameCoord(normalized, state.eva.destination)) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          destination: normalized,
          selectedRouteDecision: markDecisionStale(
            state.eva.selectedRouteDecision,
            'Destination coordinates changed.',
          ),
        },
      }
    }

    case 'MISSION/SET_EVA_COORDINATES': {
      if (!isValidCoordinate(action.payload.baseCamp) || !isValidCoordinate(action.payload.destination)) {
        return state
      }
      if (!getRegionCapabilityProfile(state.geographic.regionId).supportsEvaRouting) {
        return state
      }
      const nextBase = normalizeCoordinate(action.payload.baseCamp)
      const nextDest = normalizeCoordinate(action.payload.destination)
      const baseCheck = isTargetCompatibleWithRegion(
        {
          regionId: (action.payload.baseCamp as { regionId?: string | null }).regionId,
          lat: nextBase.lat,
          lon: nextBase.lon,
        },
        state.geographic.regionId,
      )
      const destCheck = isTargetCompatibleWithRegion(
        {
          regionId: (action.payload.destination as { regionId?: string | null }).regionId,
          lat: nextDest.lat,
          lon: nextDest.lon,
        },
        state.geographic.regionId,
      )
      if (!baseCheck.compatible || !destCheck.compatible) {
        return state
      }
      if (sameCoord(nextBase, state.eva.baseCamp) && sameCoord(nextDest, state.eva.destination)) {
        return state
      }
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          baseCamp: nextBase,
          destination: nextDest,
          selectedRouteDecision: markDecisionStale(
            state.eva.selectedRouteDecision,
            'EVA coordinates changed.',
          ),
        },
      }
    }

    case 'MISSION/SELECT_TARGET':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          selectedTarget: action.payload
            ? { ...action.payload, coordinate: normalizeCoordinate(action.payload.coordinate) }
            : null,
        },
      }

    case 'MISSION/SELECT_GEOLOGICAL_FEATURE':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          selectedGeologicalFeature: action.payload
            ? {
                ...action.payload,
                coordinate: action.payload.coordinate
                  ? normalizeCoordinate(action.payload.coordinate)
                  : null,
              }
            : null,
        },
      }

    case 'MISSION/SELECT_HAZARD':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          selectedHazard: action.payload
            ? { ...action.payload, coordinate: normalizeCoordinate(action.payload.coordinate) }
            : null,
        },
      }

    case 'MISSION/UPSERT_OBSERVATION': {
      const validated = validateObservation(action.payload)
      if (!validated) return state
      const idx = state.science.savedObservations.findIndex((o) => o.id === validated.id)
      const nextObs =
        idx >= 0
          ? state.science.savedObservations.map((o, i) => (i === idx ? validated : o))
          : [...state.science.savedObservations, validated]
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          savedObservations: nextObs,
        },
      }
    }

    case 'MISSION/REMOVE_OBSERVATION': {
      const nextObs = state.science.savedObservations.filter((o) => o.id !== action.payload)
      if (nextObs.length === state.science.savedObservations.length) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          savedObservations: nextObs,
        },
      }
    }

    case 'MISSION/ATTACH_DATASET': {
      const validated = validateDatasetRef(action.payload)
      if (!validated) return state
      const existing = state.science.attachedDatasets ?? []
      const idx = existing.findIndex((d) => d.datasetId === validated.datasetId)
      const nextDatasets =
        idx >= 0
          ? existing.map((d, i) => (i === idx ? validated : d))
          : [...existing, validated]
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          attachedDatasets: nextDatasets,
        },
      }
    }

    case 'MISSION/DETACH_DATASET': {
      const existing = state.science.attachedDatasets ?? []
      const nextDatasets = existing.filter((d) => d.datasetId !== action.payload)
      if (nextDatasets.length === existing.length) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          attachedDatasets: nextDatasets,
        },
      }
    }

    case 'MISSION/SET_TARGET_NOTE': {
      const targetId = action.payload.targetId.trim()
      if (!targetId) return state
      const existingNotes = state.science.targetNotes ?? {}
      const noteValue = action.payload.note
      const nextNotes: Record<string, string> = { ...existingNotes }
      if (noteValue.trim().length === 0) {
        delete nextNotes[targetId]
      } else {
        nextNotes[targetId] = noteValue
      }

      const nextSelectedTarget =
        state.science.selectedTarget && state.science.selectedTarget.targetId === targetId
          ? {
              ...state.science.selectedTarget,
              notes: noteValue.trim().length > 0 ? noteValue : undefined,
            }
          : state.science.selectedTarget

      const nextQueuedTargets = state.science.queuedTargets.map((wp) =>
        wp.id === targetId || wp.name === targetId
          ? { ...wp, notes: noteValue.trim().length > 0 ? noteValue : undefined }
          : wp,
      )

      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          targetNotes: nextNotes,
          selectedTarget: nextSelectedTarget,
          queuedTargets: nextQueuedTargets,
        },
      }
    }

    case 'MISSION/SET_FOCUSED_DATASET':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          focusedDatasetId:
            typeof action.payload === 'string' && action.payload.trim()
              ? action.payload.trim()
              : null,
        },
      }

    case 'MISSION/UPSERT_QUEUED_TARGET': {
      if (!isValidCoordinate({ lat: action.payload.lat, lon: action.payload.lon })) return state
      const wp: MissionSortieWaypoint = {
        ...action.payload,
        lon: normalizeEastLon(action.payload.lon),
      }
      const idx = wp.id
        ? state.science.queuedTargets.findIndex((t) => t.id === wp.id)
        : state.science.queuedTargets.findIndex((t) => t.name === wp.name && t.lat === wp.lat && t.lon === wp.lon)
      const nextQueued =
        idx >= 0
          ? state.science.queuedTargets.map((t, i) => (i === idx ? wp : t))
          : [...state.science.queuedTargets, wp]
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          queuedTargets: nextQueued,
        },
      }
    }

    case 'MISSION/REMOVE_QUEUED_TARGET': {
      const nextQueued = state.science.queuedTargets.filter(
        (t) => t.id !== action.payload && t.name !== action.payload,
      )
      if (nextQueued.length === state.science.queuedTargets.length) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          queuedTargets: nextQueued,
        },
      }
    }

    case 'MISSION/CLEAR_QUEUED_TARGETS': {
      if (state.science.queuedTargets.length === 0) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        science: {
          ...state.science,
          queuedTargets: [],
        },
      }
    }

    case 'MISSION/SET_WAYPOINTS': {
      if (
        action.payload.length > 0 &&
        !getRegionCapabilityProfile(state.geographic.regionId).supportsEvaRouting
      ) {
        return state
      }
      const valid = action.payload
        .filter(
          (w) =>
            isValidCoordinate({ lat: w.lat, lon: w.lon }) &&
            isTargetCompatibleWithRegion(
              { regionId: w.regionId, lat: w.lat, lon: normalizeEastLon(w.lon) },
              state.geographic.regionId,
            ).compatible,
        )
        .map((w) => ({
          ...w,
          lon: normalizeEastLon(w.lon),
        }))
      // Immutable rejection: if any supplied waypoint coordinate or region is invalid, reject the entire update
      if (action.payload.length > 0 && valid.length !== action.payload.length) {
        return state
      }
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          waypoints: valid,
          selectedRouteDecision: markDecisionStale(
            state.eva.selectedRouteDecision,
            'Sortie waypoints sequence changed.',
          ),
        },
      }
    }

    case 'MISSION/SET_ROUTE_PROFILE': {
      const profile = action.payload
      const nextWeights =
        profile !== 'CUSTOM' ? { ...ROUTE_PROFILE_WEIGHTS[profile] } : state.eva.customWeights
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          routeProfile: profile,
          customWeights: nextWeights,
        },
      }
    }

    case 'MISSION/SET_CUSTOM_WEIGHTS': {
      if (!isValidWeights(action.payload)) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          routeProfile: 'CUSTOM',
          customWeights: { ...action.payload },
        },
      }
    }

    case 'MISSION/UPDATE_CUSTOM_WEIGHT': {
      const nextWeights: CostmapWeightsDTO = {
        ...state.eva.customWeights,
        [action.payload.key]: action.payload.value,
      }
      if (!isValidWeights(nextWeights)) return state
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          routeProfile: 'CUSTOM',
          customWeights: nextWeights,
        },
      }
    }

    case 'MISSION/SET_COMPARISON_SELECTION':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          selectedComparisonRouteId: action.payload.selectedRouteId,
          activeRouteIds:
            action.payload.activeRouteIds !== undefined
              ? [...action.payload.activeRouteIds]
              : state.eva.activeRouteIds,
        },
      }

    case 'MISSION/SELECT_ROUTE': {
      const decision: MissionRouteDecision = {
        routeId: action.payload.routeId,
        profileName: action.payload.profileName,
        selectedAt: withTimestamp(state, action.nowIso),
        metricsSummary: { ...action.payload.metricsSummary },
        visitedTargetIds: [...action.payload.visitedTargetIds],
        scientificTargetsCount: action.payload.scientificTargetsCount,
        isStale: false,
        staleReason: null,
      }
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          selectedComparisonRouteId: action.payload.routeId,
          selectedRouteDecision: decision,
        },
      }
    }

    case 'MISSION/CLEAR_SELECTED_ROUTE':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        eva: {
          ...state.eva,
          selectedComparisonRouteId: null,
          selectedRouteDecision: null,
        },
      }

    case 'MISSION/UPDATE_SIMULATION_CONFIG':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        simulation: {
          ...state.simulation,
          activeConfig:
            action.payload.activeConfig !== undefined
              ? action.payload.activeConfig
                ? { ...action.payload.activeConfig }
                : null
              : state.simulation.activeConfig,
          environmentalScenarioId:
            action.payload.environmentalScenarioId !== undefined
              ? action.payload.environmentalScenarioId
              : state.simulation.environmentalScenarioId,
          contingencyScenarioId:
            action.payload.contingencyScenarioId !== undefined
              ? action.payload.contingencyScenarioId
              : state.simulation.contingencyScenarioId,
        },
      }

    case 'MISSION/RECORD_SIMULATION_RESULT':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        simulation: {
          ...state.simulation,
          latestSimulation: { ...action.payload },
        },
      }

    case 'MISSION/RECORD_ENVIRONMENTAL_REPORT':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        simulation: {
          ...state.simulation,
          latestEnvironmental: { ...action.payload },
          environmentalScenarioId: action.payload.scenarioId,
        },
      }

    case 'MISSION/TOGGLE_ENVIRONMENTAL_MODIFIERS':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        simulation: {
          ...state.simulation,
          applyEnvironmentalModifiers:
            action.payload !== undefined ? action.payload : !state.simulation.applyEnvironmentalModifiers,
        },
      }

    case 'MISSION/LOG_CONTINGENCY_TEST': {
      const existing = state.simulation.testedContingencies ?? []
      // Prepend or append new test; ensure no identical timestamp dupes
      const filtered = existing.filter((c) => c.testedAt !== action.payload.testedAt)
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        simulation: {
          ...state.simulation,
          testedContingencies: [action.payload, ...filtered],
          contingencyScenarioId: action.payload.incidentId,
        },
      }
    }

    case 'MISSION/CLEAR_CONTINGENCY_TESTS':
      return {
        ...state,
        updatedAt: withTimestamp(state, action.nowIso),
        simulation: {
          ...state.simulation,
          testedContingencies: [],
          contingencyScenarioId: null,
        },
      }

    default:
      return state
  }
}
