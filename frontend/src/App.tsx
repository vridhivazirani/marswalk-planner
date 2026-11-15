import { useCallback, useEffect, useState } from 'react'
import { fetchHealth } from './api/health'

import { DisclaimerBanner } from './components/DisclaimerBanner'
import { NavigationSidebar } from './components/layout/NavigationSidebar'
import { MissionControlHeader } from './components/layout/MissionControlHeader'
import { AIMarsResearchAssistant } from './components/AIMarsResearchAssistant'
import { useMission } from './context/useMission.ts'
import { DEFAULT_BASE_CAMP, DEFAULT_DESTINATION } from './mission/missionModel.ts'
import { getPageTitle, getRegionBadgeLabel } from './navigation/routes.ts'

// 14 Operational Mission Control Pages
import { MissionOverviewPage } from './pages/MissionOverviewPage'
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

function App() {
  const { mission, runtime, persistence, actions } = useMission()

  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkHealth = useCallback(() => {
    fetchHealth()
      .then(() => {
        setIsBackendHealthy(true)
        setError(null)
      })
      .catch((err: unknown) => {
        setIsBackendHealthy(false)
        setError(err instanceof Error ? err.message : 'Backend unreachable')
      })
  }, [])

  // Check health on mount and periodically every 10 seconds for automatic recovery
  useEffect(() => {
    checkHealth()
    const timer = setInterval(checkHealth, 10000)
    const handleFocus = () => checkHealth()
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
    }
  }, [checkHealth])

  const activePage = mission.app.activePage
  const activeRegionId = mission.geographic.regionId
  const regionLabel = getRegionBadgeLabel(activeRegionId)
  const startPoint = mission.eva.baseCamp ?? DEFAULT_BASE_CAMP
  const destPoint = mission.eva.destination ?? DEFAULT_DESTINATION
  const activeProfile = mission.eva.routeProfile
  const weights = mission.eva.customWeights
  const activeLayers = mission.geographic.activeLayers
  const mapExplorerTab = mission.app.explorerTab
  const queuedSortieWaypoints = mission.eva.waypoints

  return (
    <>
      <DisclaimerBanner />

      <div className="mission-control-root">
        {/* Navigation Sidebar */}
        <NavigationSidebar
          activePage={activePage}
          onSelectPage={(page) => actions.setActivePage(page)}
          hasActiveRoute={runtime.routes.length > 0}
          hasEmergencyPlan={runtime.emergencyPlan !== null}
          activeRegionId={activeRegionId}
        />

        {/* Main Content Area */}
        <main className="mission-control-main">
          <MissionControlHeader
            pageTitle={getPageTitle(activePage)}
            activeProfile={activeProfile}
            startPoint={startPoint}
            destPoint={destPoint}
            routesCount={runtime.routes.length}
            isBackendHealthy={isBackendHealthy}
            missionId={mission.missionId}
            missionName={mission.name}
            missionStatus={mission.status}
            regionLabel={regionLabel}
            lastSavedAt={persistence.lastSavedAt}
            persistenceNotice={persistence.notice}
            onUpdateMissionName={(name) => actions.updateMetadata({ name })}
            onResetDraft={() => actions.resetMissionDraft({ preserveRegion: true })}
            onDismissNotice={actions.dismissPersistenceNotice}
          />

          {error && (
            <div className="page-container">
              <div
                className="card status-error"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  Backend API connection unavailable: {error}. Confirm backend is running at http://127.0.0.1:8000.
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={checkHealth}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          {activePage === 'overview' && (
            <MissionOverviewPage
              onNavigate={actions.setActivePage}
              isBackendHealthy={isBackendHealthy}
              activeRoute={runtime.routes.length > 0 ? runtime.routes[0] : null}
              emergencyPlan={runtime.emergencyPlan}
              routesCount={runtime.routes.length}
              startPoint={startPoint}
              destPoint={destPoint}
            />
          )}

          {activePage === 'digital-twin' && (
            <div className="page-container">
              <div
                className="card"
                style={{
                  padding: '1.75rem',
                  borderLeft: '4px solid #f59e0b',
                  background: 'var(--bg-panel)',
                  maxWidth: '780px',
                  margin: '1.5rem auto',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '1.3rem' }}>🛰️</span>
                  <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.2rem' }}>
                    Jezero Digital Twin Isolated
                  </h2>
                </div>
                <p style={{ margin: '0 0 1.2rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.55 }}>
                  The local high-resolution Jezero Digital Twin experience has been isolated for submission stability.
                  Martian planetary cartography, Jezero regional geology, CRISM mineralogy, and Perseverance rover telemetry remain fully accessible in <strong>Mars Explorer</strong>. Human sortie route planning and multi-objective evaluations remain fully operational in <strong>EVA Planner</strong>.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => actions.setActivePage('map-explorer')}
                  >
                    Open Mars Explorer →
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => actions.setActivePage('route-planner')}
                  >
                    Open EVA Planner →
                  </button>
                </div>
              </div>
            </div>
          )}

          {activePage === 'map-explorer' && (
            <MapExplorerPage
              initialTab={mapExplorerTab}
              activeLayers={activeLayers}
              selectedRegionId={activeRegionId}
              onSelectRegion={actions.setActiveRegion}
              onToggleLayer={actions.toggleLayer}
              onSelectCoords={actions.inspectCoordinates}
              onNavigateToPage={(page) => actions.setActivePage(page)}
            />
          )}

          {activePage === 'data-hub' && <NASADataHubPage />}

          {activePage === 'terrain' && (
            <TerrainIntelligencePage onSelectCoords={actions.inspectCoordinates} />
          )}

          {activePage === 'hazards' && <HazardAssessmentPage />}

          {activePage === 'geology' && <GeologyMineralogyPage />}

          {activePage === 'science' && (
            <ScienceExplorerPage
              onSelectTargetForRouting={actions.selectTargetForRouting}
              onSendWaypointsToEVAPlanner={actions.sendWaypointsToEVAPlanner}
            />
          )}

          {activePage === 'route-planner' && (
            <EVARoutePlannerPage
              startPoint={startPoint}
              destPoint={destPoint}
              onUpdateCoordinates={actions.updateEvaCoordinates}
              activeProfile={activeProfile}
              onSelectProfile={actions.selectRouteProfile}
              weights={weights}
              onWeightChange={actions.updateCustomWeight}
              routes={runtime.routes}
              onRoutesCalculated={actions.setRoutes}
            />
          )}

          {activePage === 'route-comparison' && (
            <RouteComparisonPage
              startPoint={startPoint}
              destPoint={destPoint}
              onUpdateCoordinates={actions.updateEvaCoordinates}
              onRoutesCalculated={actions.setRoutes}
            />
          )}

          {activePage === 'simulation' && (
            <MissionSimulationPage
              startPoint={startPoint}
              destPoint={destPoint}
              onRoutesCalculated={actions.setRoutes}
              queuedWaypoints={queuedSortieWaypoints}
            />
          )}

          {activePage === 'emergency' && (
            <EmergencyOperationsPage
              startPoint={startPoint}
              destPoint={destPoint}
              activeProfile={activeProfile}
              onPlanUpdated={actions.setEmergencyPlan}
            />
          )}

          {activePage === 'reports' && (
            <MissionReportsPage
              startPoint={startPoint}
              destPoint={destPoint}
              activeProfile={activeProfile}
              activeRoute={runtime.routes.length > 0 ? runtime.routes[0] : null}
              emergencyPlan={runtime.emergencyPlan}
              selectedTarget={runtime.selectedTargetFeature}
              onRestoreBookmark={(lat, lon) => {
                actions.setDestPoint({ lat, lon })
                actions.setActivePage('map-explorer')
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
          active_region_id: activeRegionId,
          active_page: activePage,
          active_layers: ['CTX_MOSAIC', 'HIRISE_TRN_DTM', 'CRISM_BD2210'],
        }}
      />
    </>
  )
}

export default App
