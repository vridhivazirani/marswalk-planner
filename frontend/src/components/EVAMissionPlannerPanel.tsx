import React, { useState, useEffect } from 'react'
import type { LatLon, RouteFeature } from '../api/routing'
import type {
  MissionPlanSummaryDTO,
  MissionPlanningAssumptionsDTO,
  MultiDestinationMissionResponse,
} from '../api/mission'
import {
  fetchDefaultAssumptions,
  planEVAMission,
  planMultiDestinationMission,
} from '../api/mission'

interface Props {
  startPoint: LatLon
  destPoint: LatLon
  onRoutesCalculated: (routes: RouteFeature[]) => void
  initialWaypoints?: Array<{ lat: number; lon: number; name: string }>
}

export const EVAMissionPlannerPanel: React.FC<Props> = ({
  startPoint,
  destPoint,
  onRoutesCalculated,
  initialWaypoints,
}) => {
  const [profile, setProfile] = useState<string>('BALANCED')
  const [scienceStops, setScienceStops] = useState<number>(2)
  const [isRoundTrip, setIsRoundTrip] = useState<boolean>(true)
  const [missionPlan, setMissionPlan] = useState<MissionPlanSummaryDTO | null>(null)
  const [assumptions, setAssumptions] = useState<MissionPlanningAssumptionsDTO | null>(null)
  const [showAssumptions, setShowAssumptions] = useState<boolean>(false)
  const [showBiophysicsConfig, setShowBiophysicsConfig] = useState<boolean>(false)
  const [isPlanning, setIsPlanning] = useState<boolean>(false)
  const [planError, setPlanError] = useState<string | null>(null)

  // Multi-Destination Mode State
  const [isMultiDestMode, setIsMultiDestMode] = useState<boolean>(
    () => Boolean(initialWaypoints && initialWaypoints.length > 0)
  )
  const [multiWaypoints, setMultiWaypoints] = useState<Array<{ lat: number; lon: number; name: string }>>(() => {
    if (initialWaypoints && initialWaypoints.length > 0) return initialWaypoints
    return [
      { lat: 18.4485, lon: 77.4320, name: 'Target 1: Delta Front Outcrop' },
      { lat: 18.4550, lon: 77.4050, name: 'Target 2: Kodiak Foreset Scarp' },
    ]
  })

  // Synchronize when initialWaypoints prop changes across navigation
  const [prevWaypoints, setPrevWaypoints] = useState(initialWaypoints)
  if (initialWaypoints !== prevWaypoints) {
    setPrevWaypoints(initialWaypoints)
    if (initialWaypoints && initialWaypoints.length > 0) {
      setMultiWaypoints(initialWaypoints)
      setIsMultiDestMode(true)
    }
  }

  const [multiPlanResult, setMultiPlanResult] = useState<MultiDestinationMissionResponse | null>(null)
  const [newWpLat, setNewWpLat] = useState<string>('18.4520')
  const [newWpLon, setNewWpLon] = useState<string>('77.4180')
  const [newWpName, setNewWpName] = useState<string>('Target 3: Scarp Contact')

  // Interactive Mission Timeline Simulator
  const [timelineProgress, setTimelineProgress] = useState<number>(0.0) // 0 to 1
  const [isSimPlaying, setIsSimPlaying] = useState<boolean>(false)
  const [simSpeed, setSimSpeed] = useState<number>(5) // 1x, 5x, 10x

  useEffect(() => {
    let animId: number
    let lastTime = performance.now()
    if (isSimPlaying) {
      const step = (now: number) => {
        const dt = (now - lastTime) / 1000.0
        lastTime = now
        setTimelineProgress((prev) => {
          const next = prev + (dt * 0.02 * simSpeed)
          if (next >= 1.0) {
            setIsSimPlaying(false)
            return 1.0
          }
          return next
        })
        animId = requestAnimationFrame(step)
      }
      animId = requestAnimationFrame(step)
    }
    return () => cancelAnimationFrame(animId)
  }, [isSimPlaying, simSpeed])

  useEffect(() => {
    fetchDefaultAssumptions()
      .then((data) => setAssumptions(data))
      .catch((err: unknown) => console.error('Failed to load mission assumptions:', err))
  }, [])

  const handleUpdateCrew = (field: string, val: number) => {
    if (!assumptions) return
    setAssumptions({
      ...assumptions,
      crew: { ...assumptions.crew, [field]: val },
    })
  }

  const handleUpdateEquipment = (field: string, val: number) => {
    if (!assumptions) return
    setAssumptions({
      ...assumptions,
      equipment: { ...assumptions.equipment, [field]: val },
    })
  }

  const handleUpdateTimeline = (field: string, val: number) => {
    if (!assumptions) return
    setAssumptions({
      ...assumptions,
      timeline: { ...assumptions.timeline, [field]: val },
    })
  }

  const handleResetBaselines = () => {
    fetchDefaultAssumptions()
      .then((data) => setAssumptions(data))
      .catch((err: unknown) => console.error('Failed to reset mission assumptions:', err))
  }

  const handleSimulateMission = () => {
    setIsPlanning(true)
    setPlanError(null)

    planEVAMission(
      startPoint,
      destPoint,
      profile,
      scienceStops,
      isRoundTrip,
      assumptions?.crew,
      assumptions?.equipment,
      assumptions?.timeline,
      'astar',
      true,
    )
      .then((res) => {
        setMissionPlan(res.mission)
        onRoutesCalculated([res.route_feature])
        setIsPlanning(false)
      })
      .catch((err: unknown) => {
        setPlanError(err instanceof Error ? err.message : String(err))
        setIsPlanning(false)
      })
  }

  const handleSimulateMultiDestination = () => {
    if (multiWaypoints.length === 0) return
    setIsPlanning(true)
    setPlanError(null)

    planMultiDestinationMission({
      origin: startPoint,
      waypoints: multiWaypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
      profile,
      returnToOrigin: isRoundTrip,
      scienceDurationPerStopMin: 15.0,
      crewAssumptions: assumptions?.crew,
      equipmentAssumptions: assumptions?.equipment,
      timelineAssumptions: assumptions?.timeline,
    })
      .then((res) => {
        setMultiPlanResult(res)
        const allLegRoutes = res.legs.map((l) => l.route_feature)
        onRoutesCalculated(allLegRoutes)
        setIsPlanning(false)
      })
      .catch((err: unknown) => {
        setPlanError(err instanceof Error ? err.message : String(err))
        setIsPlanning(false)
      })
  }

  const handleAddWaypoint = () => {
    const lat = parseFloat(newWpLat)
    const lon = parseFloat(newWpLon)
    if (isNaN(lat) || isNaN(lon)) return
    setMultiWaypoints((prev) => [
      ...prev,
      { lat, lon, name: newWpName.trim() || `Target ${prev.length + 1}` },
    ])
  }

  const handleRemoveWaypoint = (idx: number) => {
    setMultiWaypoints((prev) => prev.filter((_, i) => i !== idx))
  }

  const getSeverityBadgeStyle = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return { background: '#2a0808', color: '#f5f5f5', border: '1px solid #5c1414' }
      case 'WARNING':
        return { background: '#261808', color: '#f5f5f5', border: '1px solid #78350f' }
      case 'CAUTION':
        return { background: '#202020', color: '#d4d4d4', border: '1px solid #404040' }
      default:
        return { background: '#181818', color: '#a3a3a3', border: '1px solid #303030' }
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.2rem', background: 'var(--bg-panel)', borderColor: 'var(--border-default)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>EVA Mission Planning Engine</h3>
          <small style={{ color: 'var(--text-secondary)' }}>
            Operational timeline, physiological expenditure, and consumables simulation for human traverses
          </small>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-panel-elevated)', borderRadius: '4px', border: '1px solid var(--border-default)', padding: '2px' }}>
            <button
              type="button"
              onClick={() => setIsMultiDestMode(false)}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.75rem',
                background: !isMultiDestMode ? 'var(--accent-primary)' : 'transparent',
                color: !isMultiDestMode ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: !isMultiDestMode ? 700 : 400,
              }}
            >
              Point-to-Point
            </button>
            <button
              type="button"
              onClick={() => setIsMultiDestMode(true)}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.75rem',
                background: isMultiDestMode ? 'var(--accent-primary)' : 'transparent',
                color: isMultiDestMode ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: isMultiDestMode ? 700 : 400,
              }}
            >
              Multi-Destination Sortie
            </button>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={isMultiDestMode ? handleSimulateMultiDestination : handleSimulateMission}
            disabled={isPlanning}
          >
            {isPlanning
              ? 'Simulating EVA Operations…'
              : isMultiDestMode
              ? `Simulate ${multiWaypoints.length}-Target Sortie`
              : 'Simulate Human EVA'}
          </button>
        </div>
      </div>

      {/* Mission Simulation Controls */}
      <div
        style={{
          marginTop: '0.8rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          background: 'var(--bg-panel-elevated)',
          padding: '0.75rem',
          borderRadius: '3px',
          border: '1px solid var(--border-default)',
        }}
      >
        <div>
          <label htmlFor="mission-profile-select" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
            Traverse Route Profile:
          </label>
          <select
            id="mission-profile-select"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            style={{
              background: 'var(--bg-panel)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              padding: '0.35rem 0.5rem',
              borderRadius: '3px',
              width: '100%',
              fontSize: '0.85rem',
            }}
          >
            <option value="BALANCED">Balanced Compromise</option>
            <option value="SAFETY_FIRST">Safety-First (Lowest Risk)</option>
            <option value="SCIENCE_FIRST">Science-First (Max Outcrops)</option>
          </select>
        </div>

        <div>
          <label htmlFor="science-stops-input" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'block', marginBottom: '0.2rem' }}>
            Planned Science Stops (15 min each):
          </label>
          <input
            id="science-stops-input"
            type="number"
            min="0"
            max="10"
            value={scienceStops}
            onChange={(e) => setScienceStops(Math.max(0, parseInt(e.target.value) || 0))}
            style={{
              background: 'var(--bg-panel)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              padding: '0.35rem 0.5rem',
              borderRadius: '3px',
              width: '100%',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.2rem' }}>
          <input
            type="checkbox"
            id="roundtrip-check"
            checked={isRoundTrip}
            onChange={(e) => setIsRoundTrip(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--text-primary)' }}
          />
          <label htmlFor="roundtrip-check" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
            Round-Trip (Return to Base)
          </label>
        </div>
      </div>

      {/* Multi-Destination Waypoint Editor */}
      {isMultiDestMode && (
        <div
          style={{
            marginTop: '0.8rem',
            background: 'var(--bg-panel-elevated)',
            padding: '0.8rem',
            borderRadius: '4px',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              SEQUENTIAL SORTIE WAYPOINTS ({multiWaypoints.length})
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Origin: [{startPoint.lat.toFixed(4)}°N, {startPoint.lon.toFixed(4)}°E]
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.8rem' }}>
            {multiWaypoints.map((wp, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.4rem 0.6rem',
                  background: 'var(--bg-panel)',
                  borderRadius: '3px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.75rem',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    Stop {idx + 1}: {wp.name}
                  </strong>
                  <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    [{wp.lat.toFixed(4)}°N, {wp.lon.toFixed(4)}°E]
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveWaypoint(idx)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Add Waypoint Form */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Waypoint Name"
              value={newWpName}
              onChange={(e) => setNewWpName(e.target.value)}
              style={{
                background: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                padding: '0.3rem 0.5rem',
                borderRadius: '3px',
                fontSize: '0.75rem',
                flex: 2,
                minWidth: '140px',
              }}
            />
            <input
              type="text"
              placeholder="Lat (deg)"
              value={newWpLat}
              onChange={(e) => setNewWpLat(e.target.value)}
              style={{
                background: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                padding: '0.3rem 0.5rem',
                borderRadius: '3px',
                fontSize: '0.75rem',
                width: '75px',
              }}
            />
            <input
              type="text"
              placeholder="Lon (deg)"
              value={newWpLon}
              onChange={(e) => setNewWpLon(e.target.value)}
              style={{
                background: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                padding: '0.3rem 0.5rem',
                borderRadius: '3px',
                fontSize: '0.75rem',
                width: '75px',
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleAddWaypoint}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
            >
              + Add Stop
            </button>
          </div>
        </div>
      )}

      {/* Biophysical & Life-Support Configurator Toggle */}
      <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setShowBiophysicsConfig(!showBiophysicsConfig)}
          style={{
            background: showBiophysicsConfig ? '#1f2937' : '#141416',
            border: '1px solid #374151',
            color: '#e5e7eb',
            fontSize: '0.74rem',
            padding: '0.3rem 0.6rem',
            borderRadius: '2px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {showBiophysicsConfig ? '▲ Hide Astronaut Biophysical Sliders' : '⚙️ Configure Spacesuit & Physiological Parameters (Crew, Mass, O2, Batteries)'}
        </button>

        {showBiophysicsConfig && (
          <button
            type="button"
            onClick={handleResetBaselines}
            style={{
              background: 'transparent',
              border: '1px solid #4b5563',
              color: '#9ca3af',
              fontSize: '0.7rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            ↺ Reset to Baselines
          </button>
        )}
      </div>

      {showBiophysicsConfig && assumptions && (
        <div
          style={{
            marginTop: '0.6rem',
            background: '#0d0d0f',
            border: '1px solid #27272a',
            padding: '0.85rem',
            borderRadius: '3px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            fontSize: '0.74rem',
          }}
        >
          {/* Crew Size */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ color: '#a1a1aa' }}>Crew Size:</span>
              <strong style={{ color: '#38bdf8' }}>{assumptions.crew.nominal_crew_count} astronauts</strong>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={assumptions.crew.nominal_crew_count}
              onChange={(e) => handleUpdateCrew('nominal_crew_count', parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Walking Speed */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ color: '#a1a1aa' }}>Nominal Speed:</span>
              <strong style={{ color: '#38bdf8' }}>{assumptions.timeline.nominal_walking_speed_mps} m/s</strong>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.4"
              step="0.1"
              value={assumptions.timeline.nominal_walking_speed_mps}
              onChange={(e) => handleUpdateTimeline('nominal_walking_speed_mps', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Spacesuit Mass */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ color: '#a1a1aa' }}>Spacesuit Mass:</span>
              <strong style={{ color: '#38bdf8' }}>{assumptions.crew.suit_mass_kg} kg</strong>
            </div>
            <input
              type="range"
              min="40"
              max="120"
              step="5"
              value={assumptions.crew.suit_mass_kg}
              onChange={(e) => handleUpdateCrew('suit_mass_kg', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Oxygen Usable Capacity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ color: '#a1a1aa' }}>Usable O2 Capacity:</span>
              <strong style={{ color: '#10b981' }}>{assumptions.equipment.total_usable_o2_capacity_g} g</strong>
            </div>
            <input
              type="range"
              min="800"
              max="2400"
              step="100"
              value={assumptions.equipment.total_usable_o2_capacity_g}
              onChange={(e) => handleUpdateEquipment('total_usable_o2_capacity_g', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Battery Capacity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ color: '#a1a1aa' }}>Battery Capacity:</span>
              <strong style={{ color: '#f59e0b' }}>{assumptions.equipment.total_battery_capacity_wh} Wh</strong>
            </div>
            <input
              type="range"
              min="1200"
              max="3600"
              step="100"
              value={assumptions.equipment.total_battery_capacity_wh}
              onChange={(e) => handleUpdateEquipment('total_battery_capacity_wh', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Science Stop Duration */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ color: '#a1a1aa' }}>Stop Duration:</span>
              <strong style={{ color: '#c084fc' }}>{assumptions.timeline.science_stop_duration_minutes} min/stop</strong>
            </div>
            <input
              type="range"
              min="5"
              max="45"
              step="5"
              value={assumptions.timeline.science_stop_duration_minutes}
              onChange={(e) => handleUpdateTimeline('science_stop_duration_minutes', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}

      {planError && (
        <div className="card status-error" style={{ marginTop: '0.8rem', padding: '0.6rem' }}>
          {planError}
        </div>
      )}

      {/* Active Timeline Scrubber & Consumable Telemetry HUD (Shown when a plan is calculated) */}
      {(missionPlan || multiPlanResult) && (
        <div
          style={{
            marginTop: '1.2rem',
            background: 'var(--bg-panel-elevated)',
            padding: '1rem',
            borderRadius: '4px',
            border: '1px solid var(--border-default)',
            borderLeft: '4px solid var(--accent-primary)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
            <div>
              <span style={{ fontSize: '0.72rem', letterSpacing: '1px', color: 'var(--accent-primary)', fontWeight: 700, fontFamily: 'monospace' }}>
                LIVE MISSION TIMELINE & TELEMETRY SIMULATOR
              </span>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                MET: {(() => {
                  const totalMin = multiPlanResult ? multiPlanResult.total_duration_hours * 60 : missionPlan?.timeline.total_eva_duration_minutes ?? 360
                  const curMin = timelineProgress * totalMin
                  const curH = Math.floor(curMin / 60)
                  const curM = Math.floor(curMin % 60)
                  const totH = Math.floor(totalMin / 60)
                  const totM = Math.floor(totalMin % 60)
                  return `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')} / ${String(totH).padStart(2, '0')}:${String(totM).padStart(2, '0')}`
                })()}
                <span style={{ fontSize: '0.75rem', marginLeft: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  ({(timelineProgress * 100).toFixed(0)}% Elapsed)
                </span>
              </div>
            </div>

            {/* Playback Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsSimPlaying(!isSimPlaying)}
                className={isSimPlaying ? 'btn-alert' : 'btn-primary'}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', minWidth: '70px' }}
              >
                {isSimPlaying ? '❚❚ Pause' : '▶ Run'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSimPlaying(false)
                  setTimelineProgress(0.0)
                }}
                className="btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                title="Reset Timeline to MET 00:00"
              >
                ↺ Reset
              </button>
              <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-panel)', padding: '2px', borderRadius: '3px', border: '1px solid var(--border-default)' }}>
                {[1, 5, 10, 20].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSimSpeed(spd)}
                    style={{
                      background: simSpeed === spd ? 'var(--accent-primary)' : 'transparent',
                      color: simSpeed === spd ? '#000' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '2px',
                      padding: '0.2rem 0.4rem',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                      fontWeight: simSpeed === spd ? 700 : 400,
                    }}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scrubber Range Slider */}
          <input
            type="range"
            min="0"
            max="1"
            step="0.002"
            value={timelineProgress}
            onChange={(e) => {
              setIsSimPlaying(false)
              setTimelineProgress(parseFloat(e.target.value))
            }}
            style={{ width: '100%', accentColor: 'var(--accent-primary)', marginBottom: '0.8rem', cursor: 'ew-resize' }}
          />

          {/* Dynamic Consumable & Biophysical Telemetry Readout */}
          <div className="hazard-breakdown-grid" style={{ marginBottom: '0.2rem' }}>
            {(() => {
              const suitO2CapacityG = assumptions?.equipment.total_usable_o2_capacity_g ?? 1200
              const suitBatteryCapacityWh = assumptions?.equipment.total_battery_capacity_wh ?? 800
              const totalO2DrawG = multiPlanResult
                ? multiPlanResult.total_o2_consumed_g / 2
                : missionPlan?.consumables.o2_consumed_per_crew_g ?? 450
              const totalBatteryDrawWh = multiPlanResult
                ? multiPlanResult.total_battery_consumed_wh / 2
                : missionPlan?.consumables.battery_energy_consumed_wh ?? 380

              const remO2G = Math.max(0, suitO2CapacityG - (timelineProgress * totalO2DrawG))
              const remO2Pct = (remO2G / suitO2CapacityG) * 100
              const remBatWh = Math.max(0, suitBatteryCapacityWh - (timelineProgress * totalBatteryDrawWh))
              const remBatPct = (remBatWh / suitBatteryCapacityWh) * 100
              const pwrW = timelineProgress === 0 ? 120 : Math.round(230 + Math.sin(timelineProgress * 15) * 75)

              let phaseDesc = 'Sortie Preparation & Ingress'
              if (timelineProgress > 0) {
                if (multiPlanResult) {
                  const legIndex = Math.min(
                    multiPlanResult.legs.length - 1,
                    Math.floor(timelineProgress * multiPlanResult.legs.length)
                  )
                  const curLeg = multiPlanResult.legs[legIndex]
                  phaseDesc = curLeg ? `${curLeg.label} (${curLeg.is_return_leg ? 'Inbound Return' : 'Outbound Traverse'})` : 'Operational Traverse'
                } else {
                  if (timelineProgress < 0.4) phaseDesc = 'Outbound Traverse to Scientific Target'
                  else if (timelineProgress < 0.65) phaseDesc = 'In-Situ Stratigraphic Sampling & Investigation'
                  else if (timelineProgress < 0.95) phaseDesc = 'Inbound Traversal to Habitat'
                  else phaseDesc = 'Airlock Ingress & Post-EVA Debrief'
                }
              }

              return (
                <>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Active Sortie Phase</div>
                    <div className="stat-value" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {phaseDesc}
                    </div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Pandolf-Santee Mars Locomotion</small>
                  </div>

                  <div className="hazard-stat-box">
                    <div className="stat-label">Remaining Suit O2</div>
                    <div className="stat-value" style={{ color: remO2Pct < 20 ? 'var(--status-critical)' : 'var(--accent-primary)' }}>
                      {remO2G.toFixed(0)} g ({remO2Pct.toFixed(1)}%)
                    </div>
                    <div style={{ background: '#222', height: '4px', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${remO2Pct}%`, background: remO2Pct < 20 ? '#ef4444' : '#38bdf8', height: '100%' }} />
                    </div>
                  </div>

                  <div className="hazard-stat-box">
                    <div className="stat-label">Remaining Suit Battery</div>
                    <div className="stat-value" style={{ color: remBatPct < 20 ? 'var(--status-critical)' : 'var(--accent-secondary)' }}>
                      {remBatWh.toFixed(0)} Wh ({remBatPct.toFixed(1)}%)
                    </div>
                    <div style={{ background: '#222', height: '4px', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${remBatPct}%`, background: remBatPct < 20 ? '#ef4444' : '#a855f7', height: '100%' }} />
                    </div>
                  </div>

                  <div className="hazard-stat-box">
                    <div className="stat-label">Metabolic Rate Proxy</div>
                    <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                      {pwrW} Watts
                    </div>
                    <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Biophysical Heat Rejection</small>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Multi-Destination Mission Plan Results */}
      {multiPlanResult && (
        <div style={{ marginTop: '1rem' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              background: multiPlanResult.feasibility_status === 'FEASIBLE' ? 'var(--bg-panel-elevated)' : '#2a0808',
              border: `1px solid ${multiPlanResult.feasibility_status === 'FEASIBLE' ? 'var(--border-default)' : '#5c1414'}`,
              borderLeft: `4px solid ${multiPlanResult.feasibility_status === 'FEASIBLE' ? '#ffffff' : '#dc2626'}`,
              padding: '0.6rem 0.9rem',
              borderRadius: '3px',
              color: 'var(--text-primary)',
            }}
          >
            <div>
              <strong style={{ fontSize: '1rem', letterSpacing: '0.5px' }}>
                {multiPlanResult.feasibility_status === 'FEASIBLE'
                  ? `FEASIBLE MULTI-DESTINATION SORTIE (${multiPlanResult.waypoint_count} TARGETS)`
                  : `SORTIE FEASIBILITY: ${multiPlanResult.feasibility_status}`}
              </strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Total Traverse: {(multiPlanResult.total_distance_m / 1000).toFixed(2)} km | Duration: {multiPlanResult.total_duration_hours.toFixed(2)} hrs (Walk: {multiPlanResult.total_walk_time_minutes.toFixed(0)} min, Science: {multiPlanResult.total_science_time_minutes.toFixed(0)} min, Rest: {multiPlanResult.total_rest_time_minutes.toFixed(0)} min)
              </div>
            </div>

            <span
              style={{
                fontSize: '0.75rem',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                padding: '0.2rem 0.6rem',
                borderRadius: '2px',
                fontWeight: 600,
              }}
            >
              SIMULATION (PANDOLF-SANTEE MARS)
            </span>
          </div>

          {/* Point of No Return (PNR) Flight Rule Indicator */}
          <div
            style={{
              marginTop: '0.8rem',
              padding: '0.7rem 0.9rem',
              background: multiPlanResult.point_of_no_return_leg !== null ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.08)',
              border: `1px solid ${multiPlanResult.point_of_no_return_leg !== null ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.3)'}`,
              borderLeft: `4px solid ${multiPlanResult.point_of_no_return_leg !== null ? 'var(--status-critical)' : '#22c55e'}`,
              borderRadius: '3px',
              fontSize: '0.82rem',
            }}
          >
            {multiPlanResult.point_of_no_return_leg !== null ? (
              <div>
                <strong style={{ color: 'var(--status-critical)', display: 'block', marginBottom: '0.2rem' }}>
                  ⚠️ FLIGHT RULE CRITICAL: POINT OF NO RETURN (PNR) AT LEG {multiPlanResult.point_of_no_return_leg + 1}
                </strong>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Beyond Leg {multiPlanResult.point_of_no_return_leg + 1} ({multiPlanResult.legs[multiPlanResult.point_of_no_return_leg]?.label}), cumulative life-support draw prevents returning to habitat base without dipping below the mandatory 20% emergency reserve margin.
                </span>
              </div>
            ) : (
              <div>
                <strong style={{ color: '#22c55e', display: 'block', marginBottom: '0.2rem' }}>
                  ✓ NOMINAL SORTIE MARGIN: CONTINUOUS SAFE RETURN PRESERVED
                </strong>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Emergency Return to Base (RTB) remains feasible with &gt;20% oxygen and battery reserves intact from all sortie waypoints.
                </span>
              </div>
            )}
          </div>

          {/* Multi-Leg Traversal Table */}
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
              Sequential Traversal Legs Breakdown ({multiPlanResult.legs.length} Legs)
            </h4>
            <div style={{ overflowX: 'auto', background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderRadius: '3px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-panel-elevated)', borderBottom: '1px solid var(--border-default)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Leg</th>
                    <th style={{ padding: '0.5rem' }}>Traverse Sector</th>
                    <th style={{ padding: '0.5rem' }}>Distance</th>
                    <th style={{ padding: '0.5rem' }}>Walk Time</th>
                    <th style={{ padding: '0.5rem' }}>O2 Draw (2 Crew)</th>
                    <th style={{ padding: '0.5rem' }}>Battery Draw</th>
                    <th style={{ padding: '0.5rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {multiPlanResult.legs.map((leg) => (
                    <tr
                      key={leg.leg_index}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: leg.is_return_leg ? 'rgba(56, 189, 248, 0.04)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.5rem', fontWeight: 600 }}>#{leg.leg_index + 1}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {leg.label}
                        {leg.is_return_leg && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--accent-primary)' }}>[Return Leg]</span>}
                      </td>
                      <td style={{ padding: '0.5rem' }}>{(leg.distance_m / 1000).toFixed(2)} km</td>
                      <td style={{ padding: '0.5rem' }}>{leg.walking_time_minutes.toFixed(0)} min</td>
                      <td style={{ padding: '0.5rem' }}>{leg.o2_consumed_g.toFixed(0)} g</td>
                      <td style={{ padding: '0.5rem' }}>{leg.battery_consumed_wh.toFixed(0)} Wh</td>
                      <td style={{ padding: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => onRoutesCalculated([leg.route_feature])}
                          style={{
                            background: 'var(--bg-panel-elevated)',
                            border: '1px solid var(--border-default)',
                            color: 'var(--text-secondary)',
                            borderRadius: '2px',
                            padding: '0.2rem 0.4rem',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                          }}
                        >
                          Isolate On Map
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Emergency Return to Base (RTB) Vectors */}
          {multiPlanResult.emergency_return_paths.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                Emergency Return to Base (RTB) Vectors ({multiPlanResult.emergency_return_paths.length} Escape Routes)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.6rem' }}>
                {multiPlanResult.emergency_return_paths.map((rtb, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border-default)',
                      borderLeft: `3px solid ${rtb.safe_reserve_margin_o2 && rtb.safe_reserve_margin_battery ? '#22c55e' : 'var(--status-critical)'}`,
                      padding: '0.6rem 0.8rem',
                      borderRadius: '3px',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        RTB Vector: Stop {rtb.from_waypoint_index + 1} → Habitat Origin
                      </strong>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          padding: '0.1rem 0.3rem',
                          borderRadius: '2px',
                          background: rtb.safe_reserve_margin_o2 && rtb.safe_reserve_margin_battery ? '#14532d' : '#450a0a',
                          color: '#fff',
                        }}
                      >
                        {rtb.safe_reserve_margin_o2 && rtb.safe_reserve_margin_battery ? 'SAFE RTB' : 'MARGIN CRITICAL'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem' }}>
                      <div>Distance: {(rtb.rtb_distance_m / 1000).toFixed(2)} km</div>
                      <div>Walk Time: {rtb.rtb_duration_minutes.toFixed(0)} min</div>
                      <div>O2 Required: {rtb.rtb_o2_required_g.toFixed(0)} g</div>
                      <div>Battery: {rtb.rtb_battery_required_wh.toFixed(0)} Wh</div>
                    </div>
                    <div style={{ marginTop: '0.4rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => onRoutesCalculated([rtb.rtb_route])}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-primary)',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        Preview Direct RTB Path on Map →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flight Warnings */}
          {multiPlanResult.flight_warnings.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--status-warning)', fontSize: '0.95rem' }}>
                Operational Flight Rules Alerts ({multiPlanResult.flight_warnings.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {multiPlanResult.flight_warnings.map((w, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-panel-elevated)',
                      padding: '0.5rem 0.8rem',
                      borderRadius: '3px',
                      borderLeft: '3px solid var(--status-warning)',
                      border: '1px solid var(--border-default)',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    ⚠️ {w}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evaluated Single Mission Plan Results */}
      {missionPlan && (
        <div style={{ marginTop: '1rem' }}>
          {/* Status & Feasibility Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              background: missionPlan.is_feasible ? 'var(--bg-panel-elevated)' : '#2a0808',
              border: `1px solid ${missionPlan.is_feasible ? 'var(--border-default)' : '#5c1414'}`,
              borderLeft: `4px solid ${missionPlan.is_feasible ? '#ffffff' : '#dc2626'}`,
              padding: '0.6rem 0.9rem',
              borderRadius: '3px',
              color: 'var(--text-primary)',
            }}
          >
            <div>
              <strong style={{ fontSize: '1rem', letterSpacing: '0.5px' }}>
                {missionPlan.is_feasible ? 'FEASIBLE EVA MISSION' : 'FEASIBILITY VIOLATION DETECTED'}
              </strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Profile: {missionPlan.selected_route_profile} | Round-Trip Ground Distance:{' '}
                {missionPlan.round_trip_distance_km.toFixed(2)} km (One-Way:{' '}
                {missionPlan.one_way_distance_km.toFixed(2)} km)
              </div>
            </div>

            <span
              style={{
                fontSize: '0.75rem',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                padding: '0.2rem 0.6rem',
                borderRadius: '2px',
                fontWeight: 600,
              }}
            >
              SIMULATION (NOT OPERATIONAL NASA RULES)
            </span>
          </div>

          {/* Operational Timeline Breakdown */}
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
              Operational Timeline Breakdown (Traversal vs Total EVA Duration)
            </h4>
            <div className="hazard-breakdown-grid">
              <div className="hazard-stat-box">
                <div className="stat-label">Outbound Travel</div>
                <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {missionPlan.timeline.outbound_traversal_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Return Travel</div>
                <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {missionPlan.timeline.return_traversal_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Total Traversal</div>
                <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {missionPlan.timeline.total_walking_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Science Stops ({missionPlan.timeline.science_stops_count})</div>
                <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                  {missionPlan.timeline.planned_science_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Rest Pauses ({missionPlan.timeline.rest_stops_count})</div>
                <div className="stat-value" style={{ color: 'var(--text-secondary)' }}>
                  {missionPlan.timeline.rest_pauses_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Contingency Reserve</div>
                <div className="stat-value" style={{ color: 'var(--text-secondary)' }}>
                  {missionPlan.timeline.contingency_reserve_minutes.toFixed(0)} min
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '0.6rem',
                background: 'var(--bg-panel-elevated)',
                borderLeft: '3px solid var(--accent-primary)',
                border: '1px solid var(--border-default)',
                padding: '0.6rem 0.8rem',
                borderRadius: '3px',
                fontSize: '0.9rem',
                color: 'var(--text-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span>
                <strong>Total Estimated EVA Duration: </strong>
                {missionPlan.timeline.total_eva_duration_hours.toFixed(2)} hours (
                {missionPlan.timeline.total_eva_duration_minutes.toFixed(0)} minutes)
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Flight Limit: 8.0 hours | Margin:{' '}
                {(8.0 - missionPlan.timeline.total_eva_duration_hours).toFixed(2)} hrs
              </span>
            </div>
          </div>

          {/* Consumables Budget & Resource Gauges */}
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
              Resource Consumables & Physiological Expenditure Proxies
            </h4>
            <div className="hazard-breakdown-grid">
              <div className="hazard-stat-box">
                <div className="stat-label">Oxygen Margin</div>
                <div
                  className="stat-value"
                  style={{
                    color: missionPlan.consumables.o2_margin_pct < 20 ? 'var(--status-critical)' : 'var(--text-primary)',
                  }}
                >
                  {missionPlan.consumables.o2_margin_pct.toFixed(1)}%
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Used: {missionPlan.consumables.o2_consumed_per_crew_g.toFixed(0)}g /{' '}
                  {missionPlan.consumables.o2_capacity_per_suit_g.toFixed(0)}g
                </small>
              </div>

              <div className="hazard-stat-box">
                <div className="stat-label">Battery Margin</div>
                <div
                  className="stat-value"
                  style={{
                    color: missionPlan.consumables.battery_margin_pct < 20 ? 'var(--status-critical)' : 'var(--text-primary)',
                  }}
                >
                  {missionPlan.consumables.battery_margin_pct.toFixed(1)}%
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Used: {missionPlan.consumables.battery_energy_consumed_wh.toFixed(0)}Wh /{' '}
                  {missionPlan.consumables.battery_capacity_wh.toFixed(0)}Wh
                </small>
              </div>

              <div className="hazard-stat-box">
                <div className="stat-label">Metabolic Expenditure</div>
                <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                  {missionPlan.consumables.metabolic_energy_expended_kcal.toFixed(0)} kcal
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Avg Work: {missionPlan.consumables.average_metabolic_power_w.toFixed(0)} Watts
                </small>
              </div>

              <div className="hazard-stat-box">
                <div className="stat-label">Total Crew O2 Draw (2 Crew)</div>
                <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {missionPlan.consumables.total_o2_consumed_all_crew_g.toFixed(0)} g
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Buddy System Protocol</small>
              </div>
            </div>
          </div>

          {/* Operational Feasibility Warnings */}
          {missionPlan.warnings.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--status-warning)', fontSize: '0.95rem' }}>
                Operational Feasibility & Flight Rules Alerts ({missionPlan.warnings.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {missionPlan.warnings.map((w, idx) => {
                  const badge = getSeverityBadgeStyle(w.severity)
                  return (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-panel-elevated)',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '3px',
                        borderLeft: `3px solid ${w.severity === 'CRITICAL' ? 'var(--status-critical)' : 'var(--status-warning)'}`,
                        border: '1px solid var(--border-default)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span
                          style={{
                            background: badge.background,
                            color: badge.color,
                            border: badge.border,
                            padding: '0.1rem 0.4rem',
                            borderRadius: '2px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          {w.severity}
                        </span>
                        <strong style={{ color: 'var(--text-primary)' }}>{w.code}: </strong>
                        <span style={{ color: 'var(--text-secondary)' }}>{w.message}</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', paddingLeft: '0.2rem' }}>
                        <em>Remediation: </em>
                        {w.remediation}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Collapsible Assumptions Drawer */}
          <div style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAssumptions(!showAssumptions)}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
            >
              {showAssumptions ? 'Hide Model Assumptions ▲' : 'Inspect Configurable Model Assumptions ▼'}
            </button>

            {showAssumptions && assumptions && (
              <div
                style={{
                  marginTop: '0.6rem',
                  background: 'var(--bg-panel)',
                  padding: '0.8rem',
                  borderRadius: '3px',
                  border: '1px solid var(--border-default)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Configurable Physiological & Life-Support Equipment Assumptions:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Crew Physiological:</strong>
                    <div>Crew Count: {assumptions.crew.nominal_crew_count} astronauts</div>
                    <div>Body Mass: {assumptions.crew.body_mass_kg} kg | Suit Mass: {assumptions.crew.suit_mass_kg} kg</div>
                    <div>Basal Power: 120 W | Level Walking Power: {assumptions.crew.nominal_walking_power_w} W</div>
                  </div>

                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Equipment & Suit:</strong>
                    <div>Suit: {assumptions.equipment.suit_designation ?? 'Prototype'}</div>
                    <div>Usable O2: {assumptions.equipment.total_usable_o2_capacity_g} g per suit</div>
                    <div>Battery Energy: {assumptions.equipment.total_battery_capacity_wh} Wh</div>
                    <div>Life Support Power: {assumptions.equipment.base_life_support_power_w ?? 85} W</div>
                  </div>

                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>Operational Rules:</strong>
                    <div>Walking Speed: {assumptions.timeline.nominal_walking_speed_mps} m/s</div>
                    <div>Science Stop: {assumptions.timeline.science_stop_duration_minutes} min/stop</div>
                    <div>Rest Pause: 10 min every {assumptions.timeline.rest_stop_interval_minutes} min walking</div>
                    <div>Contingency Reserve: {(assumptions.timeline.contingency_reserve_time_fraction * 100).toFixed(0)}%</div>
                  </div>
                </div>

                <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.4rem', color: 'var(--text-muted)' }}>
                  <em>Epistemic Status: </em>
                  HEURISTIC illustrative placeholders. Scenarios are SIMULATED. Never claim operational astronaut safety certification.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

