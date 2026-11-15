import React, { useState, useEffect, useMemo, useRef } from 'react'
import { EVAMissionPlannerPanel } from '../components/EVAMissionPlannerPanel'
import { EnvironmentalScenarioPanel } from '../components/EnvironmentalScenarioPanel'
import { EmergencyResponsePanel } from '../components/EmergencyResponsePanel'
import { useMission } from '../context/useMission'
import type { RouteFeature } from '../api/routing'
import type { MissionObservationCategory, MissionObservationRecord, PageId } from '../types/mission'

interface MissionSimulationPageProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  onRoutesCalculated: (routes: RouteFeature[]) => void
  queuedWaypoints?: Array<{ lat: number; lon: number; name: string }>
}

type MissionControlTab = 'traversal' | 'atmospheric' | 'emergency' | 'science'

/** Great-circle distance on IAU 2015 Mars sphere (R = 3,396,190 m) */
function marsDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3396190
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dphi = ((lat2 - lat1) * Math.PI) / 180
  const dlam = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dphi / 2) * Math.sin(dphi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) * Math.sin(dlam / 2)
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface InterpolatedPoint {
  lat: number
  lon: number
  elev: number
  distanceTraversedM: number
  totalDistanceM: number
}

function interpolateRoute(coords: number[][], fraction: number): InterpolatedPoint | null {
  if (!coords || coords.length === 0) return null
  if (coords.length === 1 || fraction <= 0) {
    const p = coords[0]
    return { lon: p[0], lat: p[1], elev: p[2] ?? 0, distanceTraversedM: 0, totalDistanceM: 0 }
  }

  const segLengths: number[] = []
  let totalM = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const d = marsDistanceM(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0])
    segLengths.push(d)
    totalM += d
  }

  if (fraction >= 1 || totalM === 0) {
    const p = coords[coords.length - 1]
    return { lon: p[0], lat: p[1], elev: p[2] ?? 0, distanceTraversedM: totalM, totalDistanceM: totalM }
  }

  const targetM = fraction * totalM
  let accum = 0
  for (let i = 0; i < segLengths.length; i++) {
    const nextAccum = accum + segLengths[i]
    if (nextAccum >= targetM) {
      const segLen = segLengths[i]
      const s = segLen > 0 ? (targetM - accum) / segLen : 0
      const pA = coords[i]
      const pB = coords[i + 1]
      const lon = pA[0] + s * (pB[0] - pA[0])
      const lat = pA[1] + s * (pB[1] - pA[1])
      const elevA = pA[2] ?? 0
      const elevB = pB[2] ?? 0
      const elev = elevA + s * (elevB - elevA)
      return { lon, lat, elev, distanceTraversedM: targetM, totalDistanceM: totalM }
    }
    accum = nextAccum
  }

  const p = coords[coords.length - 1]
  return { lon: p[0], lat: p[1], elev: p[2] ?? 0, distanceTraversedM: totalM, totalDistanceM: totalM }
}

export const MissionSimulationPage: React.FC<MissionSimulationPageProps> = ({
  startPoint,
  destPoint,
  onRoutesCalculated,
  queuedWaypoints,
}) => {
  const { mission, runtime, actions } = useMission()
  const [activeTab, setActiveTab] = useState<MissionControlTab>('traversal')
  const [progressPct, setProgressPct] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)

  // Observation form state
  const [newObsTarget, setNewObsTarget] = useState('')
  const [newObsCategory, setNewObsCategory] = useState<MissionObservationCategory>('GEOLOGY')
  const [newObsText, setNewObsText] = useState('')

  // Identify active route
  const activeRoute: RouteFeature | null = useMemo(() => {
    if (mission.eva.selectedRouteDecision?.routeId) {
      const found = runtime.routes.find((r) => r.id === mission.eva.selectedRouteDecision?.routeId)
      if (found) return found
    }
    return runtime.routes.length > 0 ? runtime.routes[0] : null
  }, [mission.eva.selectedRouteDecision, runtime.routes])

  const routeCoords: number[][] = useMemo(() => {
    if (!activeRoute || !activeRoute.geometry || !activeRoute.geometry.coordinates) return []
    return activeRoute.geometry.coordinates as number[][]
  }, [activeRoute])

  // Playback timer
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = window.setInterval(() => {
        setProgressPct((prev) => {
          if (prev >= 100) {
            setIsPlaying(false)
            return 100
          }
          return Math.min(100, prev + 0.5 * playbackSpeed)
        })
      }, 200)
    } else if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [isPlaying, playbackSpeed])

  // Interpolated astronaut position
  const currentPos = useMemo(() => {
    if (routeCoords.length === 0) return null
    return interpolateRoute(routeCoords, progressPct / 100)
  }, [routeCoords, progressPct])

  // Biophysics & Consumables Telemetry
  const latestSim = mission.simulation.latestSimulation
  const totalDurationMin = latestSim ? latestSim.totalDurationHours * 60 : (activeRoute?.properties.metrics.estimated_duration_minutes ?? 180)
  const totalDistanceM = latestSim ? latestSim.totalDistanceKm * 1000 : (activeRoute?.properties.metrics.total_distance_m ?? 0)

  // Consumables limits & baselines
  const initialO2Grams = 1200 // standard 1.2 kg consumable allocation
  const totalO2ConsumedGrams = latestSim?.o2ConsumedG ?? (totalDurationMin * 0.95)
  const initialBatteryWh = 450 // standard 450 Wh suit battery pack
  const totalBatteryConsumedWh = latestSim?.batteryConsumedWh ?? (totalDurationMin * 0.8)
  const totalMetabolicKcal = latestSim?.metabolicKcal ?? (totalDurationMin * 6.5)
  const avgWatts = latestSim?.averageMetabolicWatts ?? 285

  // Interpolated consumable amounts
  const fraction = progressPct / 100
  const elapsedMin = fraction * totalDurationMin
  const remainingMin = Math.max(0, totalDurationMin - elapsedMin)
  const o2Consumed = fraction * totalO2ConsumedGrams
  const o2Remaining = Math.max(0, initialO2Grams - o2Consumed)
  const o2MarginPct = (o2Remaining / initialO2Grams) * 100

  const batteryConsumed = fraction * totalBatteryConsumedWh
  const batteryRemaining = Math.max(0, initialBatteryWh - batteryConsumed)
  const batteryMarginPct = (batteryRemaining / initialBatteryWh) * 100

  const kcalBurned = fraction * totalMetabolicKcal

  // Determine safety tier
  const isEmergencyActive = runtime.emergencyPlan !== null
  const consumablesStatus =
    o2MarginPct < 15 || batteryMarginPct < 15
      ? 'CRITICAL'
      : o2MarginPct < 25 || batteryMarginPct < 25
      ? 'CAUTION'
      : 'NOMINAL'

  // Intercepted targets or queued targets
  const targetIds = mission.eva.selectedRouteDecision?.visitedTargetIds ?? []
  const queuedTargets = mission.science.queuedTargets

  const handleAddObservation = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newObsText.trim()) return

    const newObs: MissionObservationRecord = {
      id: `obs-${Date.now().toString(36)}`,
      targetId: newObsTarget || undefined,
      label: newObsTarget ? `Field Observation: ${newObsTarget}` : 'In-Situ Field Note',
      summary: newObsText.trim(),
      userNote: newObsText.trim(),
      category: newObsCategory,
      coordinate: currentPos ? { lat: currentPos.lat, lon: currentPos.lon } : null,
      regionId: mission.geographic.regionId,
      activeMissionRegionId: mission.geographic.regionId,
      recordedAt: new Date().toISOString(),
      epistemicClass: 'OBSERVED',
    }

    actions.addObservation(newObs)
    setNewObsText('')
    setNewObsTarget('')
  }

  const navigateTo = (page: PageId) => {
    actions.setActivePage(page)
  }

  return (
    <div className="page-container" style={{ maxWidth: '1600px', margin: '0 auto', padding: '1rem 1.5rem 3rem' }}>
      {/* =========================================================================
          1. MISSION CONTROL OPERATIONS DECK HEADER
          ========================================================================= */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '1.25rem',
          borderBottom: '1px solid var(--border-default)',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
              }}
            >
              EXPERIENCE 04 // OPERATIONAL FLIGHT DECK
            </span>
            <span style={{ color: 'var(--border-default)' }}>•</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--accent-secondary)',
              }}
            >
              ID: {mission.missionId}
            </span>
          </div>

          <h1
            style={{
              margin: '0 0 0.4rem',
              fontSize: '1.65rem',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Mission Control: EVA Simulation & Telemetry Deck
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Real-time human EVA traversal telemetry, spacesuit biophysics modeling, atmospheric coupling, and contingency operations.
          </p>
        </div>

        {/* Global Mission Control Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigateTo('map-explorer')}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            🗺️ Mars Explorer
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigateTo('route-comparison')}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            ⚖️ Route Alternatives
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigateTo('reports')}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
          >
            📋 Briefing Dossier
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. LIVE ASTRONAUT TELEMETRY HUD & ROUTE PROGRESS SCRUBBER
          ========================================================================= */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          borderRadius: '4px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem' }}>🧑‍🚀</span>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Astronaut Surface Traversal Telemetry
              </div>
              <small style={{ color: 'var(--text-secondary)' }}>
                {activeRoute
                  ? `Active LineString: ${activeRoute.properties.profile_name} (${(totalDistanceM / 1000).toFixed(2)} km total)`
                  : 'No active route selected. Compute a sortie below to engage simulation.'}
              </small>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className={`badge ${consumablesStatus === 'NOMINAL' ? 'badge-nominal' : 'badge-alert'}`}>
              LIFE-SUPPORT: {consumablesStatus}
            </span>
            {isEmergencyActive && <span className="badge badge-alert">CONTINGENCY REROUTE ACTIVE</span>}
            <span className="badge badge-heuristic">EPISTEMIC: HEURISTIC</span>
          </div>
        </div>

        {/* Live Gauges Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          {/* Gauge 1: Position */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '3px',
              padding: '0.85rem',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Current Coordinates (IAU 2015)
            </div>
            {currentPos ? (
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {currentPos.lat.toFixed(5)}°N, {currentPos.lon.toFixed(5)}°E
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Elev: {currentPos.elev.toFixed(1)} m | {(currentPos.distanceTraversedM / 1000).toFixed(2)} km
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Standing by at Base Camp</div>
            )}
          </div>

          {/* Gauge 2: Mission Time */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '3px',
              padding: '0.85rem',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Mission Elapsed / Remaining
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {elapsedMin.toFixed(0)} min / {totalDurationMin.toFixed(0)} min
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Rem: {remainingMin.toFixed(0)} min ({(fraction * 100).toFixed(0)}% complete)
            </div>
          </div>

          {/* Gauge 3: Oxygen (O2) */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '3px',
              padding: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              <span>OXYGEN MARGIN (O₂)</span>
              <span style={{ color: o2MarginPct < 20 ? 'var(--status-critical)' : 'var(--text-primary)' }}>
                {o2MarginPct.toFixed(1)}%
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {o2Remaining.toFixed(0)} g rem. ({o2Consumed.toFixed(0)} g used)
            </div>
            {/* Progress Bar */}
            <div style={{ height: '4px', background: 'var(--bg-panel)', borderRadius: '2px', marginTop: '0.4rem', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, o2MarginPct))}%`,
                  background: o2MarginPct < 20 ? '#ef4444' : o2MarginPct < 35 ? '#f59e0b' : '#10b981',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>

          {/* Gauge 4: Spacesuit Battery */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '3px',
              padding: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              <span>BATTERY STORAGE</span>
              <span style={{ color: batteryMarginPct < 20 ? 'var(--status-critical)' : 'var(--text-primary)' }}>
                {batteryMarginPct.toFixed(1)}%
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {batteryRemaining.toFixed(0)} Wh rem. ({batteryConsumed.toFixed(0)} Wh used)
            </div>
            {/* Progress Bar */}
            <div style={{ height: '4px', background: 'var(--bg-panel)', borderRadius: '2px', marginTop: '0.4rem', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, batteryMarginPct))}%`,
                  background: batteryMarginPct < 20 ? '#ef4444' : batteryMarginPct < 35 ? '#f59e0b' : '#3b82f6',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>

          {/* Gauge 5: Metabolic Power */}
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '3px',
              padding: '0.85rem',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Metabolic Expenditure
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {kcalBurned.toFixed(0)} kcal ({avgWatts.toFixed(0)} W avg)
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Budget: {totalMetabolicKcal.toFixed(0)} kcal
            </div>
          </div>
        </div>

        {/* Scrubber Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            background: 'var(--bg-secondary)',
            padding: '0.75rem 1rem',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Play/Pause */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={routeCoords.length === 0}
            style={{ minWidth: '80px', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>

          {/* Reset */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setIsPlaying(false)
              setProgressPct(0)
            }}
            disabled={routeCoords.length === 0}
            style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
            title="Reset to 0%"
          >
            ⏮ Reset
          </button>

          {/* Speed Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {[1, 5, 10].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setPlaybackSpeed(spd)}
                style={{
                  background: playbackSpeed === spd ? 'var(--accent-primary)' : 'var(--bg-panel)',
                  color: playbackSpeed === spd ? 'var(--text-inverse)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '2px',
                  padding: '2px 6px',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Timeline Slider */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={progressPct}
              onChange={(e) => setProgressPct(parseFloat(e.target.value))}
              disabled={routeCoords.length === 0}
              style={{ flex: 1, cursor: routeCoords.length > 0 ? 'pointer' : 'not-allowed' }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                minWidth: '45px',
                textAlign: 'right',
                color: 'var(--text-primary)',
              }}
            >
              {progressPct.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. UNIFIED MISSION CONTROL OPERATIONS TABS
          ========================================================================= */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            borderBottom: '1px solid var(--border-default)',
            paddingBottom: '0.5rem',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            className={`btn ${activeTab === 'traversal' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('traversal')}
            style={{ fontSize: '0.82rem', padding: '0.5rem 1rem' }}
          >
            🧑‍🚀 EVA Traversal & Biophysics
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'atmospheric' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('atmospheric')}
            style={{ fontSize: '0.82rem', padding: '0.5rem 1rem' }}
          >
            🌪️ Atmospheric Coupling
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'emergency' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('emergency')}
            style={{ fontSize: '0.82rem', padding: '0.5rem 1rem' }}
          >
            🚨 In-Situ Emergency & Abort
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'science' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('science')}
            style={{ fontSize: '0.82rem', padding: '0.5rem 1rem' }}
          >
            🔬 Science Targets & Field Notes ({mission.science.savedObservations.length})
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'traversal' && (
        <EVAMissionPlannerPanel
          startPoint={startPoint}
          destPoint={destPoint}
          onRoutesCalculated={onRoutesCalculated}
          initialWaypoints={queuedWaypoints}
        />
      )}

      {activeTab === 'atmospheric' && <EnvironmentalScenarioPanel />}

      {activeTab === 'emergency' && (
        <EmergencyResponsePanel
          startPoint={startPoint}
          destPoint={destPoint}
          activeProfile={mission.eva.routeProfile}
          onPlanUpdated={(plan) => actions.setEmergencyPlan(plan)}
        />
      )}

      {activeTab === 'science' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
          {/* Column A: Intercepted Targets along active route */}
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              borderRadius: '4px',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Expedition Target Sequence
              </h3>
              <span className="badge badge-nominal">{queuedTargets.length} Planned Waypoints</span>
            </div>

            {queuedTargets.length === 0 && targetIds.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No scientific targets queued or intercepted yet. Queue waypoints in the Science Explorer or compute a multi-stop sortie.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {queuedTargets.map((target) => (
                  <div
                    key={target.name}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '3px',
                      padding: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {target.name}
                      </span>
                      {target.compositeScore !== null && target.compositeScore !== undefined && (
                        <span className="badge badge-nominal">Score: {target.compositeScore.toFixed(1)}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                      {target.primaryTheme ?? 'Geological Target'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <small style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {target.lat.toFixed(4)}°N, {target.lon.toFixed(4)}°E
                      </small>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setNewObsTarget(target.name)
                        }}
                        style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                      >
                        + Add Note
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column B: In-Situ Field Observations Log */}
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              borderRadius: '4px',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                In-Situ Field Observations Log
              </h3>
              <span className="badge badge-observed">EPISTEMIC: OBSERVED</span>
            </div>

            {/* Observation entry form */}
            <form onSubmit={handleAddObservation} style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Target / Outcrop Name (e.g. Belva Crater Rim)"
                  value={newObsTarget}
                  onChange={(e) => setNewObsTarget(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '2px',
                    fontSize: '0.8rem',
                  }}
                />
                <select
                  value={newObsCategory}
                  onChange={(e) => setNewObsCategory(e.target.value as MissionObservationCategory)}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '2px',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value="GEOLOGY">Geology</option>
                  <option value="SCIENCE">Science</option>
                  <option value="TERRAIN">Terrain</option>
                  <option value="HAZARD">Hazard</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>

              <textarea
                placeholder="Record qualitative or quantitative field observation note..."
                value={newObsText}
                onChange={(e) => setNewObsText(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '2px',
                  fontSize: '0.8rem',
                  marginBottom: '0.5rem',
                  boxSizing: 'border-box',
                }}
              />

              <button
                type="submit"
                className="btn btn-primary"
                disabled={!newObsText.trim()}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
              >
                💾 Record Field Observation
              </button>
            </form>

            {/* List of recorded observations */}
            {mission.science.savedObservations.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No field notes recorded yet. Add observations above or in the Jezero Digital Twin.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '380px', overflowY: 'auto' }}>
                {mission.science.savedObservations.map((obs) => (
                  <div
                    key={obs.id}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '3px',
                      padding: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {obs.targetId || 'Surface Site'} • {obs.category}
                      </span>
                      <button
                        type="button"
                        onClick={() => actions.removeObservation(obs.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                        title="Remove note"
                      >
                        ✕
                      </button>
                    </div>
                    <p style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {obs.summary}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                        {new Date(obs.recordedAt).toLocaleString()}
                      </small>
                      <span className="badge badge-observed" style={{ fontSize: '0.62rem' }}>
                        {obs.epistemicClass}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
