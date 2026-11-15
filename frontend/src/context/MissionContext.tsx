import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { evaluateCustomWeights, inspectLocationCost } from '../api/costmap.ts'
import type { CostmapInspectionResponse, CostmapWeightsDTO } from '../api/costmap.ts'
import type { DynamicReroutePlanDTO } from '../api/emergency.ts'
import { inspectLocationHazard } from '../api/hazards.ts'
import type { LocationHazardInspection } from '../api/hazards.ts'
import type { RouteFeature } from '../api/routing.ts'
import {
  inspectLocationScience,
  type CandidateTargetFeature,
  type ScienceInspectionResponse,
} from '../api/science.ts'
import { inspectTerrainPoint, type MultiResInspectResult } from '../api/terrain.ts'
import {
  featureToMissionTargetRef,
  normalizeMarsCoordinate,
  toEpistemicClassTag,
} from '../mission/digitalTwinHelpers.ts'
import {
  type MissionBootstrapResult,
  initializeMissionBootstrap,
} from '../mission/missionBootstrap.ts'
import { createDefaultMissionBundle, isValidCoordinate, isValidWeights } from '../mission/missionModel.ts'
import { missionReducer, type MissionAction } from '../mission/missionReducer.ts'
import { canUseLocalDigitalTwin } from '../mission/regionCapabilities.ts'
import {
  clearMissionDraft,
  getBrowserLocalStorage,
  loadMissionDraftResult,
  saveMissionDraft,
} from '../mission/missionStorage.ts'
import {
  DEFAULT_PAGE_ID,
  DEFAULT_REGION_ID,
  KNOWN_REGION_IDS,
  buildMissionUrl,
  parseMissionUrl,
  resolvePageId,
  resolveRegionId,
} from '../navigation/routes.ts'
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
  RouteProfileId,
} from '../types/mission.ts'
import {
  MissionContext,
  type MissionActions,
  type MissionContextValue,
  type MissionRuntimeState,
  type PersistenceStateInfo,
} from './useMission.ts'

function isContentMutatingAction(action: MissionAction): boolean {
  return action.type !== 'MISSION/HYDRATE' && action.type !== 'MISSION/SET_PAGE'
}

export const MissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bootstrap] = useState<MissionBootstrapResult>(() =>
    initializeMissionBootstrap({
      search: typeof window !== 'undefined' ? window.location.search : '',
      hash: typeof window !== 'undefined' ? window.location.hash : '',
      storage: getBrowserLocalStorage(),
      knownRegions: KNOWN_REGION_IDS,
    }),
  )

  const [mission, rawDispatch] = useReducer(missionReducer, bootstrap.bundle)
  const [persistence, setPersistence] = useState<PersistenceStateInfo>(bootstrap.persistence)

  const [routes, setRoutes] = useState<RouteFeature[]>([])
  const [emergencyPlan, setEmergencyPlan] = useState<DynamicReroutePlanDTO | null>(null)
  const [selectedHazard, setSelectedHazard] = useState<LocationHazardInspection | null>(null)
  const [selectedCost, setSelectedCost] = useState<CostmapInspectionResponse | null>(null)
  const [selectedTerrain, setSelectedTerrain] = useState<MultiResInspectResult | null>(null)
  const [selectedScience, setSelectedScience] = useState<ScienceInspectionResponse | null>(null)
  const [inspectionError, setInspectionError] = useState<string | null>(null)
  const [selectedTargetFeature, setSelectedTargetFeature] =
    useState<CandidateTargetFeature | null>(null)
  const [isInspecting, setIsInspecting] = useState<boolean>(false)

  const blockAutoPersistRef = useRef<boolean>(bootstrap.blockAutoPersist)
  const lastSavedSerializedRef = useRef<string | null>(bootstrap.initialSerialized)
  const missionRef = useRef<MissionBundleV1>(bootstrap.bundle)
  const inspectionSeqRef = useRef<number>(0)

  useEffect(() => {
    missionRef.current = mission
  }, [mission])

  const dispatch = useCallback((action: MissionAction) => {
    if (isContentMutatingAction(action)) {
      blockAutoPersistRef.current = false
    }
    rawDispatch(action)
  }, [])

  // Normalize initial URL on mount using replaceState (no extra history entry).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.replaceState) return
    const currentFull = `${window.location.pathname}${window.location.search}`
    const targetUrl = buildMissionUrl({
      page: missionRef.current.app.activePage,
      region: missionRef.current.geographic.regionId,
      missionId: missionRef.current.missionId,
    })
    if (currentFull !== targetUrl || window.location.hash) {
      window.history.replaceState(
        {
          missionId: missionRef.current.missionId,
          page: missionRef.current.app.activePage,
          region: missionRef.current.geographic.regionId,
        },
        '',
        targetUrl,
      )
    }
  }, [])

  // Controlled lifecycle persistence in localStorage (zero render-time writes).
  useEffect(() => {
    if (blockAutoPersistRef.current) return
    const storage = getBrowserLocalStorage()
    if (!storage) return
    const result = saveMissionDraft(mission, storage, lastSavedSerializedRef.current)
    if (result.ok) {
      if (result.serialized) {
        lastSavedSerializedRef.current = result.serialized
      }
      if (!result.skippedUnchanged) {
        setPersistence((prev) =>
          prev.lastSavedAt === mission.updatedAt && prev.storageError === null
            ? prev
            : { ...prev, lastSavedAt: mission.updatedAt, storageError: null },
        )
      }
    } else if (result.error) {
      setPersistence((prev) =>
        prev.storageError === result.error ? prev : { ...prev, storageError: result.error ?? null },
      )
    }
  }, [mission])

  // Listen to browser Back / Forward navigation (popstate) and synchronize URL -> MissionContext.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const parsed = parseMissionUrl(window.location.search, window.location.hash, KNOWN_REGION_IDS)
      const nextPage = parsed.page ?? DEFAULT_PAGE_ID
      const current = missionRef.current

      if (parsed.missionId && parsed.missionId !== current.missionId) {
        const stored = loadMissionDraftResult(
          getBrowserLocalStorage(),
          parsed.missionId,
          KNOWN_REGION_IDS,
        )
        if (stored.status === 'restored' && stored.bundle) {
          lastSavedSerializedRef.current = stored.serialized
          rawDispatch({
            type: 'MISSION/HYDRATE',
            payload: {
              ...stored.bundle,
              app: { ...stored.bundle.app, activePage: nextPage },
              geographic: {
                ...stored.bundle.geographic,
                regionId: parsed.region ?? stored.bundle.geographic.regionId,
              },
            },
          })
          return
        }
      }

      if (parsed.region && parsed.region !== current.geographic.regionId) {
        rawDispatch({ type: 'MISSION/SET_REGION', payload: { regionId: parsed.region } })
      }
      if (nextPage !== current.app.activePage) {
        rawDispatch({ type: 'MISSION/SET_PAGE', payload: { page: nextPage } })
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const syncUrlReplace = useCallback((page: PageId, region: string, missionId: string) => {
    if (typeof window === 'undefined' || !window.history?.replaceState) return
    const nextUrl = buildMissionUrl({ page, region, missionId })
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (currentUrl !== nextUrl) {
      window.history.replaceState({ page, region, missionId }, '', nextUrl)
    }
  }, [])

  const setActivePage = useCallback((page: PageId, explorerTab?: ExplorerTabId) => {
    const resolved = resolvePageId(page) ?? DEFAULT_PAGE_ID
    const current = missionRef.current
    if (resolved === current.app.activePage && (!explorerTab || explorerTab === current.app.explorerTab)) {
      return
    }

    rawDispatch({
      type: 'MISSION/SET_PAGE',
      payload: { page: resolved, explorerTab },
    })

    if (typeof window !== 'undefined' && window.history?.pushState) {
      const nextUrl = buildMissionUrl({
        page: resolved,
        region: current.geographic.regionId,
        missionId: current.missionId,
      })
      const currentUrl = `${window.location.pathname}${window.location.search}`
      if (currentUrl !== nextUrl) {
        window.history.pushState(
          {
            page: resolved,
            region: current.geographic.regionId,
            missionId: current.missionId,
          },
          '',
          nextUrl,
        )
      }
    }
  }, [])

  const setExplorerTab = useCallback((tab: ExplorerTabId) => {
    rawDispatch({ type: 'MISSION/SET_EXPLORER_TAB', payload: tab })
  }, [])

  const setActiveRegion = useCallback(
    (regionId: string) => {
      const resolved = resolveRegionId(regionId, KNOWN_REGION_IDS)
      if (!resolved) return
      const current = missionRef.current
      if (resolved === current.geographic.regionId) return
      dispatch({ type: 'MISSION/SET_REGION', payload: { regionId: resolved } })
      if (!canUseLocalDigitalTwin(resolved)) {
        inspectionSeqRef.current += 1
        setSelectedHazard(null)
        setSelectedCost(null)
        setSelectedTerrain(null)
        setSelectedScience(null)
        setInspectionError(null)
        setSelectedTargetFeature(null)
        setIsInspecting(false)
      }
      syncUrlReplace(current.app.activePage, resolved, current.missionId)
    },
    [dispatch, syncUrlReplace],
  )

  const updateMetadata = useCallback(
    (patch: MissionMetadataPatch) => {
      dispatch({ type: 'MISSION/UPDATE_METADATA', payload: patch })
    },
    [dispatch],
  )

  const toggleLayer = useCallback(
    (layerId: string) => {
      dispatch({ type: 'MISSION/TOGGLE_LAYER', payload: layerId })
    },
    [dispatch],
  )

  const setStartPoint = useCallback(
    (coord: MarsCoordinate) => {
      if (!isValidCoordinate(coord)) return
      dispatch({ type: 'MISSION/SET_BASE_CAMP', payload: coord })
    },
    [dispatch],
  )

  const setDestPoint = useCallback(
    (coord: MarsCoordinate) => {
      if (!isValidCoordinate(coord)) return
      dispatch({ type: 'MISSION/SET_DESTINATION', payload: coord })
    },
    [dispatch],
  )

  const updateEvaCoordinates = useCallback(
    (baseCamp: MarsCoordinate, destination: MarsCoordinate) => {
      if (!isValidCoordinate(baseCamp) || !isValidCoordinate(destination)) return
      dispatch({
        type: 'MISSION/SET_EVA_COORDINATES',
        payload: { baseCamp, destination },
      })
    },
    [dispatch],
  )

  const selectTargetFeature = useCallback(
    (feature: CandidateTargetFeature | null) => {
      setSelectedTargetFeature(feature)
      if (!feature) {
        dispatch({ type: 'MISSION/SELECT_TARGET', payload: null })
        return
      }
      dispatch({
        type: 'MISSION/SELECT_TARGET',
        payload: featureToMissionTargetRef(
          feature,
          'reg-jezero',
          missionRef.current.geographic.regionId,
        ),
      })
    },
    [dispatch],
  )

  const selectScienceTarget = useCallback(
    (target: MissionScienceTargetRef | null) => {
      dispatch({ type: 'MISSION/SELECT_TARGET', payload: target })
    },
    [dispatch],
  )

  const selectGeologicalFeature = useCallback(
    (feature: MissionGeologicalFeatureRef | null) => {
      dispatch({ type: 'MISSION/SELECT_GEOLOGICAL_FEATURE', payload: feature })
    },
    [dispatch],
  )

  const selectHazardRef = useCallback(
    (hazard: MissionHazardRef | null) => {
      dispatch({ type: 'MISSION/SELECT_HAZARD', payload: hazard })
    },
    [dispatch],
  )

  const selectTargetForRouting = useCallback(
    (feature: CandidateTargetFeature) => {
      const coord = normalizeMarsCoordinate({
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
      })
      selectTargetFeature(feature)
      if (isValidCoordinate(coord)) {
        dispatch({
          type: 'MISSION/SET_DESTINATION',
          payload: { ...coord, regionId: 'reg-jezero' },
        })
      }
      setActivePage('route-planner')
    },
    [dispatch, selectTargetFeature, setActivePage],
  )

  const queueScienceTarget = useCallback(
    (target: MissionSortieWaypoint) => {
      const normalizedCoord = normalizeMarsCoordinate({ lat: target.lat, lon: target.lon })
      if (!isValidCoordinate(normalizedCoord)) return
      const waypoint: MissionSortieWaypoint = {
        ...target,
        lat: normalizedCoord.lat,
        lon: normalizedCoord.lon,
      }
      dispatch({ type: 'MISSION/UPSERT_QUEUED_TARGET', payload: waypoint })
    },
    [dispatch],
  )

  const unqueueScienceTarget = useCallback(
    (targetIdOrName: string) => {
      if (!targetIdOrName) return
      dispatch({ type: 'MISSION/REMOVE_QUEUED_TARGET', payload: targetIdOrName })
    },
    [dispatch],
  )

  const clearQueuedTargets = useCallback(() => {
    dispatch({ type: 'MISSION/CLEAR_QUEUED_TARGETS' })
  }, [dispatch])

  const openEvaPlanner = useCallback(() => {
    setActivePage('route-planner')
  }, [setActivePage])

  const setQueuedWaypoints = useCallback(
    (waypoints: MissionSortieWaypoint[]) => {
      const normalized = waypoints.map((wp) => {
        const coord = normalizeMarsCoordinate({ lat: wp.lat, lon: wp.lon })
        return { ...wp, lat: coord.lat, lon: coord.lon }
      })
      dispatch({ type: 'MISSION/SET_WAYPOINTS', payload: normalized })
    },
    [dispatch],
  )

  const sendWaypointsToEVAPlanner = useCallback(
    (waypoints: MissionSortieWaypoint[]) => {
      const normalized = waypoints.map((w) => {
        const coord = normalizeMarsCoordinate({ lat: w.lat, lon: w.lon })
        return {
          ...w,
          lat: coord.lat,
          lon: coord.lon,
        }
      })
      dispatch({
        type: 'MISSION/SET_WAYPOINTS',
        payload: normalized,
      })
      setActivePage('route-planner')
    },
    [dispatch, setActivePage],
  )

  const selectRouteProfile = useCallback(
    (profile: string) => {
      const normalized = profile.toUpperCase() as RouteProfileId
      const valid: RouteProfileId =
        normalized === 'BALANCED' ||
        normalized === 'SAFETY_FIRST' ||
        normalized === 'SCIENCE_FIRST' ||
        normalized === 'CUSTOM'
          ? normalized
          : 'BALANCED'
      dispatch({ type: 'MISSION/SET_ROUTE_PROFILE', payload: valid })
    },
    [dispatch],
  )

  const updateCustomWeight = useCallback(
    (key: keyof CostmapWeightsDTO, value: number) => {
      if (!Number.isFinite(value)) return
      const updated: CostmapWeightsDTO = { ...missionRef.current.eva.customWeights, [key]: value }
      if (!isValidWeights(updated)) return
      dispatch({ type: 'MISSION/UPDATE_CUSTOM_WEIGHT', payload: { key, value } })
      evaluateCustomWeights(updated).catch((err: unknown) => console.error(err))
    },
    [dispatch],
  )

  const setComparisonSelection = useCallback(
    (selectedRouteId: string | null, activeRouteIds?: string[]) => {
      dispatch({
        type: 'MISSION/SET_COMPARISON_SELECTION',
        payload: { selectedRouteId, activeRouteIds },
      })
    },
    [dispatch],
  )

  const selectRoute = useCallback(
    (decision: {
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
    }) => {
      dispatch({ type: 'MISSION/SELECT_ROUTE', payload: decision })
    },
    [dispatch],
  )

  const clearSelectedRoute = useCallback(() => {
    dispatch({ type: 'MISSION/CLEAR_SELECTED_ROUTE' })
  }, [dispatch])

  const updateSimulationConfig = useCallback(
    (patch: {
      activeConfig?: MissionSimulationConfig | null
      environmentalScenarioId?: string | null
      contingencyScenarioId?: string | null
    }) => {
      dispatch({ type: 'MISSION/UPDATE_SIMULATION_CONFIG', payload: patch })
    },
    [dispatch],
  )

  const recordSimulationResult = useCallback(
    (record: MissionSimulationRecord) => {
      dispatch({ type: 'MISSION/RECORD_SIMULATION_RESULT', payload: record })
    },
    [dispatch],
  )

  const recordEnvironmentalReport = useCallback(
    (report: MissionEnvironmentalSummary) => {
      dispatch({ type: 'MISSION/RECORD_ENVIRONMENTAL_REPORT', payload: report })
    },
    [dispatch],
  )

  const toggleEnvironmentalModifiers = useCallback(
    (apply?: boolean) => {
      dispatch({ type: 'MISSION/TOGGLE_ENVIRONMENTAL_MODIFIERS', payload: apply })
    },
    [dispatch],
  )

  const logContingencyTest = useCallback(
    (contingency: MissionContingencyRecord) => {
      dispatch({ type: 'MISSION/LOG_CONTINGENCY_TEST', payload: contingency })
    },
    [dispatch],
  )

  const clearContingencyTests = useCallback(() => {
    dispatch({ type: 'MISSION/CLEAR_CONTINGENCY_TESTS' })
  }, [dispatch])

  const addObservation = useCallback(
    (observation: MissionObservationRecord) => {
      dispatch({ type: 'MISSION/UPSERT_OBSERVATION', payload: observation })
    },
    [dispatch],
  )

  const removeObservation = useCallback(
    (id: string) => {
      dispatch({ type: 'MISSION/REMOVE_OBSERVATION', payload: id })
    },
    [dispatch],
  )

  const attachDataset = useCallback(
    (dataset: MissionDatasetRef) => {
      dispatch({ type: 'MISSION/ATTACH_DATASET', payload: dataset })
    },
    [dispatch],
  )

  const detachDataset = useCallback(
    (datasetId: string) => {
      if (!datasetId) return
      dispatch({ type: 'MISSION/DETACH_DATASET', payload: datasetId })
    },
    [dispatch],
  )

  const setTargetNote = useCallback(
    (targetId: string, note: string) => {
      if (!targetId) return
      dispatch({ type: 'MISSION/SET_TARGET_NOTE', payload: { targetId, note } })
    },
    [dispatch],
  )

  const setFocusedDataset = useCallback(
    (datasetId: string | null) => {
      dispatch({ type: 'MISSION/SET_FOCUSED_DATASET', payload: datasetId })
    },
    [dispatch],
  )

  const inspectCoordinates = useCallback(
    (rawCoords: MarsCoordinate) => {
      const coords = normalizeMarsCoordinate(rawCoords)
      if (!isValidCoordinate(coords)) return
      dispatch({ type: 'MISSION/UPDATE_MAP_STATE', payload: { selectedLocation: coords } })

      if (!canUseLocalDigitalTwin(missionRef.current.geographic.regionId)) {
        setInspectionError(null)
        return
      }

      const reqId = inspectionSeqRef.current + 1
      inspectionSeqRef.current = reqId
      setIsInspecting(true)
      setInspectionError(null)
      const activeProfile = missionRef.current.eva.routeProfile

      Promise.allSettled([
        inspectLocationHazard(coords.lat, coords.lon),
        inspectLocationCost(coords.lat, coords.lon, activeProfile),
        inspectTerrainPoint(coords.lat, coords.lon, true, 60.0),
        inspectLocationScience(coords.lat, coords.lon),
      ]).then(([hazResult, costResult, terrainResult, scienceResult]) => {
        if (inspectionSeqRef.current !== reqId) return

        const hazData = hazResult.status === 'fulfilled' ? hazResult.value : null
        const costData = costResult.status === 'fulfilled' ? costResult.value : null
        const terrainData = terrainResult.status === 'fulfilled' ? terrainResult.value : null
        const scienceData = scienceResult.status === 'fulfilled' ? scienceResult.value : null

        setSelectedHazard(hazData)
        setSelectedCost(costData)
        setSelectedTerrain(terrainData)
        setSelectedScience(scienceData)

        const failures: string[] = []
        if (hazResult.status === 'rejected') {
          failures.push(`Hazard: ${hazResult.reason instanceof Error ? hazResult.reason.message : String(hazResult.reason)}`)
        }
        if (costResult.status === 'rejected') {
          failures.push(`Cost: ${costResult.reason instanceof Error ? costResult.reason.message : String(costResult.reason)}`)
        }
        if (terrainResult.status === 'rejected') {
          failures.push(`Terrain: ${terrainResult.reason instanceof Error ? terrainResult.reason.message : String(terrainResult.reason)}`)
        }
        if (scienceResult.status === 'rejected') {
          failures.push(`Science: ${scienceResult.reason instanceof Error ? scienceResult.reason.message : String(scienceResult.reason)}`)
        }

        if (failures.length > 0 && !hazData && !costData && !terrainData && !scienceData) {
          setInspectionError(failures.join('; '))
        } else {
          setInspectionError(null)
        }

        if (hazData) {
          dispatch({
            type: 'MISSION/SELECT_HAZARD',
            payload: {
              coordinate: coords,
              isPassable: hazData.is_passable,
              hardRestrictionCode: hazData.hard_restriction_code,
              hazardClassification: hazData.hazard_classification,
              overallHazardScore: hazData.overall_hazard_score,
              epistemicClass: toEpistemicClassTag(
                hazData.status === 'OUT_OF_BOUNDS' || hazData.status === 'DATA_UNAVAILABLE'
                  ? 'UNKNOWN'
                  : hazData.epistemic_class,
              ),
              inspectedAt: new Date().toISOString(),
            },
          })
        }
        setIsInspecting(false)
      })
    },
    [dispatch],
  )

  const resetMissionDraft = useCallback(
    (options?: { preserveRegion?: boolean }) => {
      const current = missionRef.current
      const nextRegion = options?.preserveRegion
        ? current.geographic.regionId
        : DEFAULT_REGION_ID
      const freshBundle = createDefaultMissionBundle({
        regionId: nextRegion,
        activePage: current.app.activePage,
      })

      const storage = getBrowserLocalStorage()
      clearMissionDraft(storage)
      blockAutoPersistRef.current = false
      lastSavedSerializedRef.current = null

      rawDispatch({ type: 'MISSION/HYDRATE', payload: freshBundle })
      setRoutes([])
      setEmergencyPlan(null)
      setSelectedHazard(null)
      setSelectedCost(null)
      setSelectedTerrain(null)
      setSelectedScience(null)
      setInspectionError(null)
      setSelectedTargetFeature(null)

      setPersistence({
        loadStatus: 'missing',
        notice: 'Started a fresh local mission draft.',
        missingRequestedMissionId: null,
        lastSavedAt: freshBundle.updatedAt,
        storageError: null,
      })

      syncUrlReplace(
        freshBundle.app.activePage,
        freshBundle.geographic.regionId,
        freshBundle.missionId,
      )
    },
    [syncUrlReplace],
  )

  const dismissPersistenceNotice = useCallback(() => {
    setPersistence((prev) => ({
      ...prev,
      notice: null,
      missingRequestedMissionId: null,
    }))
  }, [])

  const runtime = useMemo<MissionRuntimeState>(
    () => ({
      routes,
      emergencyPlan,
      selectedHazard,
      selectedCost,
      selectedTerrain,
      selectedScience,
      inspectionError,
      selectedTargetFeature,
      isInspecting,
    }),
    [
      routes,
      emergencyPlan,
      selectedHazard,
      selectedCost,
      selectedTerrain,
      selectedScience,
      inspectionError,
      selectedTargetFeature,
      isInspecting,
    ],
  )

  const actions = useMemo<MissionActions>(
    () => ({
      dispatch,
      setActivePage,
      setExplorerTab,
      setActiveRegion,
      updateMetadata,
      toggleLayer,
      setStartPoint,
      setDestPoint,
      updateEvaCoordinates,
      selectTargetFeature,
      selectScienceTarget,
      selectGeologicalFeature,
      selectHazardRef,
      selectTargetForRouting,
      queueScienceTarget,
      unqueueScienceTarget,
      clearQueuedTargets,
      openEvaPlanner,
      setQueuedWaypoints,
      sendWaypointsToEVAPlanner,
      selectRouteProfile,
      updateCustomWeight,
      setComparisonSelection,
      selectRoute,
      clearSelectedRoute,
      updateSimulationConfig,
      recordSimulationResult,
      recordEnvironmentalReport,
      toggleEnvironmentalModifiers,
      logContingencyTest,
      clearContingencyTests,
      addObservation,
      removeObservation,
      attachDataset,
      detachDataset,
      setTargetNote,
      setFocusedDataset,
      inspectCoordinates,
      setRoutes,
      setEmergencyPlan,
      resetMissionDraft,
      dismissPersistenceNotice,
    }),
    [
      dispatch,
      setActivePage,
      setExplorerTab,
      setActiveRegion,
      updateMetadata,
      toggleLayer,
      setStartPoint,
      setDestPoint,
      updateEvaCoordinates,
      selectTargetFeature,
      selectScienceTarget,
      selectGeologicalFeature,
      selectHazardRef,
      selectTargetForRouting,
      queueScienceTarget,
      unqueueScienceTarget,
      clearQueuedTargets,
      openEvaPlanner,
      setQueuedWaypoints,
      sendWaypointsToEVAPlanner,
      selectRouteProfile,
      updateCustomWeight,
      setComparisonSelection,
      selectRoute,
      clearSelectedRoute,
      updateSimulationConfig,
      recordSimulationResult,
      recordEnvironmentalReport,
      toggleEnvironmentalModifiers,
      logContingencyTest,
      clearContingencyTests,
      addObservation,
      removeObservation,
      attachDataset,
      detachDataset,
      setTargetNote,
      setFocusedDataset,
      inspectCoordinates,
      resetMissionDraft,
      dismissPersistenceNotice,
    ],
  )

  const value = useMemo<MissionContextValue>(
    () => ({
      mission,
      runtime,
      persistence,
      actions,
    }),
    [mission, runtime, persistence, actions],
  )

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>
}
