import { useEffect, useState } from 'react'
import type { DigitalTwinLayersResponse } from './api/twin'
import { fetchDigitalTwinLayers } from './api/twin'
import type { LocationHazardInspection } from './api/hazards'
import { inspectLocationHazard } from './api/hazards'
import type { CandidateTargetFeature } from './api/science'
import type { CostmapInspectionResponse, CostmapWeightsDTO } from './api/costmap'
import { evaluateCustomWeights, inspectLocationCost } from './api/costmap'
import type { RouteFeature } from './api/routing'
import type { DynamicReroutePlanDTO } from './api/emergency'
import { fetchHealth } from './api/health'

import { DisclaimerBanner } from './components/DisclaimerBanner'
import { NavigationSidebar } from './components/layout/NavigationSidebar'
import type { PageId } from './components/layout/NavigationSidebar'
import { MissionControlHeader } from './components/layout/MissionControlHeader'
import { AIMarsResearchAssistant } from './components/AIMarsResearchAssistant'

// 12 Operational Mission Control Pages
import { MissionOverviewPage } from './pages/MissionOverviewPage'
import { DigitalTwinPage } from './pages/DigitalTwinPage'
import { MapExplorerPage } from './pages/MapExplorerPage'
import { NASADataHubPage } from './pages/NASADataHubPage'
import { TerrainIntelligencePage } from './pages/TerrainIntelligencePage'
import { HazardAssessmentPage } from './pages/HazardAssessmentPage'
import { GeologyMineralogyPage } from './pages/GeologyMineralogyPage'
import { ScienceExplorerPage } from './pages/ScienceExplorerPage'
import { EVARoutePlannerPage } from './pages/EVARoutePlannerPage'
import { RouteComparisonPage } from './pages/RouteComparisonPage'
import { MissionSimulationPage } from './pages/MissionSimulationPage'
import { EmergencyOperationsPage } from './pages/EmergencyOperationsPage'
import { MissionReportsPage } from './pages/MissionReportsPage'
import { SystemSettingsPage } from './pages/SystemSettingsPage'

const PROFILES: Record<string, CostmapWeightsDTO> = {
  BALANCED: { w_terrain: 0.30, w_hazard: 0.30, w_uncertainty: 0.15, w_science: 0.25 },
  SAFETY_FIRST: { w_terrain: 0.30, w_hazard: 0.50, w_uncertainty: 0.15, w_science: 0.05 },
  SCIENCE_FIRST: { w_terrain: 0.15, w_hazard: 0.20, w_uncertainty: 0.10, w_science: 0.55 },
}

const PAGE_TITLES: Record<PageId, string> = {
  'overview': 'Mission Overview',
  'digital-twin': 'Mars Digital Twin',
  'map-explorer': 'Planetary Explorer',
  'data-hub': 'NASA Planetary Data Hub',
  'terrain': 'Terrain Intelligence Engine',
  'hazards': 'Hazard Intelligence Assessment',
  'geology': 'Geology & Mineralogy Subsystem (CRISM & USGS)',
  'science': 'Scientific Opportunity Explorer',
  'route-planner': 'EVA Route Optimization Planner',
  'route-comparison': 'Multi-Objective Route Comparison',
  'simulation': 'EVA Mission Simulation & Operations',
  'emergency': 'Emergency Response & Dynamic Rerouting',
  'reports': 'Mission Briefing & Telemetry Reports',
  'settings': 'System Settings & Planetary Geodesy',
}

function App() {
  const [activePage, setActivePage] = useState<PageId>(() => {
    const hash = window.location.hash.replace('#', '') as PageId
    if (hash && hash in PAGE_TITLES) return hash
    const params = new URLSearchParams(window.location.search)
    const pageParam = params.get('page') as PageId
    if (pageParam && pageParam in PAGE_TITLES) return pageParam
    return 'overview'
  })
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null)
  const [layersMeta, setLayersMeta] = useState<DigitalTwinLayersResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Surface inspection state
  const [selectedHazard, setSelectedHazard] = useState<LocationHazardInspection | null>(null)
  const [selectedCost, setSelectedCost] = useState<CostmapInspectionResponse | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<CandidateTargetFeature | null>(null)
  const [isInspecting, setIsInspecting] = useState<boolean>(false)

  // Sortie Route Planning State
  const [startPoint, setStartPoint] = useState<{ lat: number; lon: number }>({
    lat: 18.4446,
    lon: 77.4509,
  })
  const [destPoint, setDestPoint] = useState<{ lat: number; lon: number }>({
    lat: 18.4550,
    lon: 77.4050,
  })
  const [routes, setRoutes] = useState<RouteFeature[]>([])
  const [emergencyPlan, setEmergencyPlan] = useState<DynamicReroutePlanDTO | null>(null)
  const [queuedSortieWaypoints, setQueuedSortieWaypoints] = useState<Array<{ lat: number; lon: number; name: string }>>([])

  // Mission profile and weights state
  const [activeProfile, setActiveProfile] = useState<string>('BALANCED')
  const [weights, setWeights] = useState<CostmapWeightsDTO>(PROFILES.BALANCED)
  const [mapExplorerTab, setMapExplorerTab] = useState<
    'MARS_EXPLORER' | 'MARS_MONOCHROME' | 'GLOBAL_GLOBE' | 'GLOBAL_MAP' | 'REGIONAL_MAP' | 'CATALOGUE'
  >('GLOBAL_GLOBE')

  const handleNavigateWithTab = (
    page: PageId,
    tab?: 'MARS_EXPLORER' | 'MARS_MONOCHROME' | 'GLOBAL_GLOBE' | 'GLOBAL_MAP' | 'REGIONAL_MAP' | 'CATALOGUE'
  ) => {
    if (tab) {
      setMapExplorerTab(tab)
    }
    setActivePage(page)
  }

  // Layer toggles
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    ortho_imagery: true,
    elevation_colormap: false,
    source_coverage: false,
    overall_hazard: false,
    science_opportunity: false,
    unified_costmap: false,
    perseverance_traverse: true,
  })

  // Check health and load digital twin metadata on mount
  useEffect(() => {
    fetchHealth()
      .then(() => setIsBackendHealthy(true))
      .catch(() => setIsBackendHealthy(false))

    fetchDigitalTwinLayers()
      .then((data) => {
        setLayersMeta(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [])

  const handleLayerToggle = (layerId: string) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }))
  }

  const handleProfileSelect = (prof: string) => {
    setActiveProfile(prof)
    if (PROFILES[prof]) {
      setWeights(PROFILES[prof])
    }
  }

  const handleWeightChange = (key: keyof CostmapWeightsDTO, val: number) => {
    setActiveProfile('CUSTOM')
    const updated = { ...weights, [key]: val }
    setWeights(updated)
    evaluateCustomWeights(updated).catch((err: unknown) => console.error(err))
  }

  const handleSelectCoords = (coords: { lat: number; lon: number }) => {
    setIsInspecting(true)
    Promise.all([
      inspectLocationHazard(coords.lat, coords.lon),
      inspectLocationCost(coords.lat, coords.lon, activeProfile),
    ])
      .then(([hazData, costData]) => {
        setSelectedHazard(hazData)
        setSelectedCost(costData)
        setIsInspecting(false)
      })
      .catch((err: unknown) => {
        console.error('Inspection query failed:', err)
        setIsInspecting(false)
      })
  }

  return (
    <>
      <DisclaimerBanner />

      <div className="mission-control-root">
        {/* Navigation Sidebar */}
        <NavigationSidebar
          activePage={activePage}
          onSelectPage={setActivePage}
          hasActiveRoute={routes.length > 0}
          hasEmergencyPlan={emergencyPlan !== null}
        />

        {/* Main Content Area */}
        <main className="mission-control-main">
          <MissionControlHeader
            pageTitle={PAGE_TITLES[activePage]}
            activeProfile={activeProfile}
            startPoint={startPoint}
            destPoint={destPoint}
            routesCount={routes.length}
            isBackendHealthy={isBackendHealthy}
          />

          {error && (
            <div className="page-container">
              <div className="card status-error">
                Backend API connection unavailable: {error}. Confirm backend is running at http://127.0.0.1:8000.
              </div>
            </div>
          )}

          {activePage === 'overview' && (
            <MissionOverviewPage
              onNavigate={handleNavigateWithTab}
              isBackendHealthy={isBackendHealthy}
              activeRoute={routes.length > 0 ? routes[0] : null}
              emergencyPlan={emergencyPlan}
              routesCount={routes.length}
              startPoint={startPoint}
              destPoint={destPoint}
            />
          )}

          {activePage === 'digital-twin' && (
            loading ? (
              <div className="page-container"><div className="card">Loading Jezero digital twin layers…</div></div>
            ) : (
              <DigitalTwinPage
                layersMeta={layersMeta}
                activeLayers={activeLayers}
                routes={routes}
                emergencyPlan={emergencyPlan}
                onLayerToggle={handleLayerToggle}
                onSelectCoords={handleSelectCoords}
                onSelectTarget={setSelectedTarget}
                selectedHazard={selectedHazard}
                selectedCost={selectedCost}
                selectedTarget={selectedTarget}
                isInspecting={isInspecting}
              />
            )
          )}

              {activePage === 'map-explorer' && (
                <MapExplorerPage
                  initialTab={mapExplorerTab}
                  activeLayers={activeLayers}
                  onToggleLayer={handleLayerToggle}
                  onSelectCoords={handleSelectCoords}
                  onNavigateToPage={setActivePage}
                />
              )}

              {activePage === 'data-hub' && <NASADataHubPage />}

              {activePage === 'terrain' && (
                <TerrainIntelligencePage onSelectCoords={handleSelectCoords} />
              )}

              {activePage === 'hazards' && <HazardAssessmentPage />}

              {activePage === 'geology' && <GeologyMineralogyPage />}

              {activePage === 'science' && (
                <ScienceExplorerPage
                  onSelectTargetForRouting={(tgt) => {
                    setDestPoint({
                      lat: tgt.geometry.coordinates[1],
                      lon: tgt.geometry.coordinates[0],
                    })
                    setSelectedTarget(tgt)
                    setActivePage('route-planner')
                  }}
                  onSendWaypointsToEVAPlanner={(wps) => {
                    setQueuedSortieWaypoints(wps.map((w) => ({ lat: w.lat, lon: w.lon, name: w.name })))
                    setActivePage('simulation')
                  }}
                />
              )}

              {activePage === 'route-planner' && (
                <EVARoutePlannerPage
                  startPoint={startPoint}
                  destPoint={destPoint}
                  onUpdateCoordinates={(start, dest) => {
                    setStartPoint(start)
                    setDestPoint(dest)
                  }}
                  activeProfile={activeProfile}
                  onSelectProfile={handleProfileSelect}
                  weights={weights}
                  onWeightChange={handleWeightChange}
                  routes={routes}
                  onRoutesCalculated={setRoutes}
                />
              )}

              {activePage === 'route-comparison' && (
                <RouteComparisonPage
                  startPoint={startPoint}
                  destPoint={destPoint}
                  onUpdateCoordinates={(start, dest) => {
                    setStartPoint(start)
                    setDestPoint(dest)
                  }}
                  onRoutesCalculated={setRoutes}
                />
              )}

              {activePage === 'simulation' && (
                <MissionSimulationPage
                  startPoint={startPoint}
                  destPoint={destPoint}
                  onRoutesCalculated={setRoutes}
                  queuedWaypoints={queuedSortieWaypoints}
                />
              )}

              {activePage === 'emergency' && (
                <EmergencyOperationsPage
                  startPoint={startPoint}
                  destPoint={destPoint}
                  activeProfile={activeProfile}
                  onPlanUpdated={setEmergencyPlan}
                />
              )}

              {activePage === 'reports' && (
                <MissionReportsPage
                  startPoint={startPoint}
                  destPoint={destPoint}
                  activeProfile={activeProfile}
                  activeRoute={routes.length > 0 ? routes[0] : null}
                  emergencyPlan={emergencyPlan}
                  selectedTarget={selectedTarget}
                  onRestoreBookmark={(lat, lon) => {
                    setDestPoint({ lat, lon })
                    setActivePage('digital-twin')
                  }}
                />
              )}

              {activePage === 'settings' && (
                <SystemSettingsPage isBackendHealthy={isBackendHealthy} />
              )}
        </main>
      </div>

      {/* Floating AI Mars Research Assistant */}
      <AIMarsResearchAssistant
        currentContext={{
          lat: destPoint.lat,
          lon: destPoint.lon,
          active_region_id: 'reg-jezero',
          active_page: activePage,
          active_layers: ['CTX_MOSAIC', 'HIRISE_TRN_DTM', 'CRISM_BD2210'],
        }}
      />
    </>
  )
}

export default App
