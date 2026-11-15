import React, { useState, useEffect, useCallback } from 'react'
import type {
  DynamicReroutePlanDTO,
  SimulatedHazardDTO,
} from '../api/emergency'
import {
  abortEmergencyToBase,
  fetchCuratedEmergencyScenarios,
  simulateEmergencyIncident,
} from '../api/emergency'
import { useMission } from '../context/useMission'
import { getRegionCapabilityProfile } from '../mission/regionCapabilities'

interface EmergencyResponsePanelProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  activeProfile?: string
  onPlanUpdated?: (plan: DynamicReroutePlanDTO | null) => void
}

export const EmergencyResponsePanel: React.FC<EmergencyResponsePanelProps> = ({
  startPoint,
  destPoint,
  activeProfile = 'BALANCED',
  onPlanUpdated,
}) => {
  const { mission, actions } = useMission()
  const activeRegionId = mission.geographic.regionId
  const regionProfile = getRegionCapabilityProfile(activeRegionId)
  const isEvaSupported = regionProfile.supportsEvaRouting
  const testedContingencies = mission.simulation.testedContingencies ?? []

  const [scenarios, setScenarios] = useState<SimulatedHazardDTO[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [crewProgressPct, setCrewProgressPct] = useState<number>(0.4)
  const [currentHazard, setCurrentHazard] = useState<SimulatedHazardDTO | null>(null)
  const [plan, setPlan] = useState<DynamicReroutePlanDTO | null>(null)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [showCustomConfig, setShowCustomConfig] = useState<boolean>(false)

  // Load curated scenarios on mount
  useEffect(() => {
    fetchCuratedEmergencyScenarios()
      .then((scenList) => {
        setScenarios(scenList)
        if (scenList.length > 0) {
          setSelectedScenarioId(scenList[0].event_id)
          setCurrentHazard(scenList[0])
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to load curated emergency scenarios:', err)
      })
  }, [])

  const executeSimulation = useCallback(
    (hazardToSimulate: SimulatedHazardDTO, progress: number) => {
      if (!isEvaSupported) {
        setError(
          `Emergency simulation is disabled for ${regionProfile.displayName} (${activeRegionId}); authoritative high-resolution terrain rasters exist exclusively for Jezero Crater.`,
        )
        return
      }

      setIsProcessing(true)
      setError(null)

      simulateEmergencyIncident({
        start_lat: startPoint.lat,
        start_lon: startPoint.lon,
        dest_lat: destPoint.lat,
        dest_lon: destPoint.lon,
        profile_name: activeProfile,
        crew_progress_pct: progress,
        scenario_id: hazardToSimulate.event_id.startsWith('CUSTOM-')
          ? undefined
          : hazardToSimulate.event_id,
        custom_hazard: hazardToSimulate.event_id.startsWith('CUSTOM-')
          ? hazardToSimulate
          : undefined,
      })
        .then((res) => {
          setPlan(res)
          onPlanUpdated?.(res)
          actions.logContingencyTest({
            testedAt: new Date().toISOString(),
            incidentId: res.hazard_event.event_id,
            incidentTitle: res.hazard_event.title,
            incidentType: res.hazard_event.hazard_type,
            severity: res.hazard_event.severity,
            incidentLocation: { lat: res.hazard_event.center_lat, lon: res.hazard_event.center_lon },
            progressAlongRoutePct: progress,
            isRouteAffected: res.impact.is_route_affected,
            detourDistanceM: res.rerouted_route?.properties.metrics.total_distance_m ?? 0,
            deltaDistanceM: res.metrics_delta.distance_delta_m,
            detourDurationMin: res.rerouted_route?.properties.metrics.estimated_duration_minutes ?? 0,
            deltaDurationMin: res.metrics_delta.duration_delta_minutes,
            additionalO2G: res.metrics_delta.o2_consumption_delta_g,
            additionalBatteryWh: res.metrics_delta.battery_consumption_delta_wh,
            actionTaken: res.is_return_to_base ? 'ABORT_TO_BASE' : 'REROUTE',
            isFeasible: res.is_feasible,
            reasoning: res.reasoning,
          })
          setIsProcessing(false)
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err))
          setIsProcessing(false)
        })
    },
    [startPoint, destPoint, activeProfile, onPlanUpdated, isEvaSupported, regionProfile.displayName, activeRegionId, actions],
  )

  const handleScenarioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSelectedScenarioId(id)
    if (!isEvaSupported) return

    if (id === 'CUSTOM') {
      const custom: SimulatedHazardDTO = {
        event_id: `CUSTOM-${Date.now()}`,
        hazard_type: 'NEW_BOULDER_FIELD',
        title: 'Custom In-Situ Contingency',
        description: 'User-specified simulated terrain restriction or obstacle.',
        center_lat: (startPoint.lat + destPoint.lat) / 2,
        center_lon: (startPoint.lon + destPoint.lon) / 2,
        radius_m: 120.0,
        is_hard_restriction: true,
        cost_multiplier: 10.0,
        severity: 'HIGH',
        epistemic_class: 'SIMULATED',
        created_at_ltst: '13:00 LTST',
        disclaimer: 'Illustrative simulation only.',
      }
      setCurrentHazard(custom)
      setShowCustomConfig(true)
    } else {
      const found = scenarios.find((s) => s.event_id === id)
      if (found) {
        setCurrentHazard(found)
        setShowCustomConfig(false)
        executeSimulation(found, crewProgressPct)
      }
    }
  }

  const handleAbort = () => {
    if (!isEvaSupported) {
      setError(
        `Emergency return-to-base abort is disabled for ${regionProfile.displayName} (${activeRegionId}); authoritative high-resolution terrain rasters exist exclusively for Jezero Crater.`,
      )
      return
    }

    if (!plan) {
      setError('Please execute an initial simulation to establish current crew position.')
      return
    }

    setIsProcessing(true)
    setError(null)
    const crew = plan.crew_location

    abortEmergencyToBase(startPoint.lat, startPoint.lon, crew.lat, crew.lon)
      .then((res) => {
        setPlan(res)
        onPlanUpdated?.(res)
        actions.logContingencyTest({
          testedAt: new Date().toISOString(),
          incidentId: res.hazard_event.event_id,
          incidentTitle: res.hazard_event.title,
          incidentType: res.hazard_event.hazard_type,
          severity: res.hazard_event.severity,
          incidentLocation: { lat: res.hazard_event.center_lat, lon: res.hazard_event.center_lon },
          progressAlongRoutePct: crewProgressPct,
          isRouteAffected: res.impact.is_route_affected,
          detourDistanceM: res.rerouted_route?.properties.metrics.total_distance_m ?? 0,
          deltaDistanceM: res.metrics_delta.distance_delta_m,
          detourDurationMin: res.rerouted_route?.properties.metrics.estimated_duration_minutes ?? 0,
          deltaDurationMin: res.metrics_delta.duration_delta_minutes,
          additionalO2G: res.metrics_delta.o2_consumption_delta_g,
          additionalBatteryWh: res.metrics_delta.battery_consumption_delta_wh,
          actionTaken: 'ABORT_TO_BASE',
          isFeasible: res.is_feasible,
          reasoning: res.reasoning,
        })
        setIsProcessing(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setIsProcessing(false)
      })
  }

  const getStatusBadge = () => {
    if (!plan) return null
    if (!plan.is_feasible) {
      return {
        bg: '#2a0808',
        color: '#f5f5f5',
        border: '1px solid #5c1414',
        label: 'PATHWAY BLOCKED: NO FEASIBLE ROUTE (ABORT REQUIRED)',
      }
    }
    if (plan.is_return_to_base) {
      return {
        bg: '#261808',
        color: '#f5f5f5',
        border: '1px solid #78350f',
        label: 'EMERGENCY RETURN-TO-BASE SORTIE ACTIVE',
      }
    }
    if (plan.impact.is_route_affected) {
      return {
        bg: '#202020',
        color: '#f5f5f5',
        border: '1px solid #404040',
        label: 'ACTIVE ROUTE SEVERED: DYNAMIC DETOUR RECALCULATED',
      }
    }
    return {
      bg: '#181818',
      color: '#d4d4d4',
      border: '1px solid #303030',
      label: 'ACTIVE CORRIDOR CLEAR: HAZARD BUFFER PRESERVED',
    }
  }

  const statusBadge = getStatusBadge()

  return (
    <div
      className="card emergency-panel"
      style={{
        marginTop: '1.2rem',
        borderLeft: '3px solid var(--status-critical)',
        background: 'var(--bg-panel)',
        padding: '1rem',
      }}
    >
      {/* Panel Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⚠️</span>
            <span>Marswalk Emergency Response & Dynamic Rerouting Engine</span>
          </h3>
          <small style={{ color: 'var(--text-secondary)' }}>
            In-Situ Hazard Simulation, Obstacle Avoidance & Return-to-Base Replanning (Jezero Crater)
          </small>
        </div>
        <div>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.2rem 0.6rem',
              borderRadius: '2px',
              background: 'var(--bg-panel-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}
          >
            EPISTEMIC: SIMULATED
          </span>
        </div>
      </div>

      {/* Scenario Selection Header */}
      <div
        style={{
          marginTop: '0.8rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'var(--bg-panel-elevated)',
          padding: '0.6rem 0.8rem',
          borderRadius: '3px',
          border: '1px solid var(--border-default)',
        }}
      >
        <label htmlFor="emergency-scenario-select" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
          Simulated In-Situ Contingency Scenario:
        </label>
        <select
          id="emergency-scenario-select"
          value={selectedScenarioId}
          onChange={handleScenarioChange}
          disabled={!isEvaSupported}
          style={{
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            padding: '0.4rem 0.6rem',
            borderRadius: '3px',
            fontSize: '0.85rem',
            minWidth: '320px',
            opacity: !isEvaSupported ? 0.6 : 1,
            cursor: !isEvaSupported ? 'not-allowed' : 'pointer',
          }}
        >
          {scenarios.map((s) => (
            <option key={s.event_id} value={s.event_id}>
              {s.title} ({s.hazard_type.replace(/_/g, ' ')})
            </option>
          ))}
          <option value="CUSTOM">Custom In-Situ Simulated Hazard (Interactive Placement)</option>
        </select>

        <button
          type="button"
          className="btn-primary"
          disabled={isProcessing || !currentHazard || !isEvaSupported}
          title={
            !isEvaSupported
              ? `Emergency contingency simulation is restricted to Jezero Crater (active region: ${regionProfile.displayName}).`
              : undefined
          }
          onClick={() => currentHazard && executeSimulation(currentHazard, crewProgressPct)}
          style={{
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
          }}
        >
          {isProcessing ? 'Recalculating…' : 'Simulate Contingency & Reroute'}
        </button>

        <button
          type="button"
          className="btn-alert"
          disabled={isProcessing || !plan || !isEvaSupported}
          title={
            !isEvaSupported
              ? `Emergency return-to-base abort is restricted to Jezero Crater (active region: ${regionProfile.displayName}).`
              : undefined
          }
          onClick={handleAbort}
          style={{
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
          }}
        >
          🚨 Immediate Abort to Base
        </button>
      </div>

      {!isEvaSupported && (
        <div
          className="notice-warning"
          style={{
            marginTop: '0.8rem',
            padding: '0.75rem',
            borderLeftColor: 'var(--status-critical)',
            fontSize: '0.8rem',
          }}
        >
          <strong>Jezero Crater Emergency Engine Restricted: </strong>
          In-situ hazard simulation, obstacle avoidance, and return-to-base replanning require high-resolution (1m/20m) elevation and hazard rasters available exclusively in Jezero Crater (<code>reg-jezero</code>). Active region: <strong>{regionProfile.displayName}</strong> (<code>{activeRegionId}</code>). Switch region to Jezero Crater to evaluate emergency protocols.
        </div>
      )}

      {isEvaSupported && error && (
        <div className="card status-error" style={{ marginTop: '0.6rem', padding: '0.5rem' }}>
          {error}
        </div>
      )}

      {/* Crew Progress Along Traversal Slider */}
      <div
        style={{
          marginTop: '0.8rem',
          background: 'var(--bg-panel-elevated)',
          padding: '0.7rem 0.9rem',
          borderRadius: '3px',
          border: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
          <span>
            <strong>Crew Traverse Progress: </strong>
            Simulated position along active sortie: {(crewProgressPct * 100).toFixed(0)}%
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Origin for Dynamic Detour: {crewProgressPct === 0 ? 'Base Camp' : 'Current In-Field Waypoint'}
          </span>
        </div>
        <input
          type="range"
          min="0.0"
          max="0.95"
          step="0.05"
          value={crewProgressPct}
          onChange={(e) => {
            const p = parseFloat(e.target.value)
            setCrewProgressPct(p)
            if (currentHazard) {
              executeSimulation(currentHazard, p)
            }
          }}
          style={{ width: '100%', accentColor: 'var(--text-primary)', marginTop: '0.4rem' }}
        />
      </div>

      {/* Custom Hazard Configuration Controls */}
      {showCustomConfig && currentHazard && (
        <div
          style={{
            marginTop: '0.8rem',
            background: 'var(--bg-panel)',
            padding: '0.7rem 0.9rem',
            borderRadius: '3px',
            border: '1px dashed var(--status-critical)',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Interactive Custom Hazard Parameters:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Hazard Radius (meters):</div>
              <input
                type="range"
                min="30"
                max="400"
                step="10"
                value={currentHazard.radius_m}
                onChange={(e) => {
                  const updated = { ...currentHazard, radius_m: parseFloat(e.target.value) }
                  setCurrentHazard(updated)
                  executeSimulation(updated, crewProgressPct)
                }}
                style={{ width: '100%', accentColor: 'var(--text-primary)' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{currentHazard.radius_m.toFixed(0)} m</span>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Traversal Restriction:</div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
                <input
                  type="checkbox"
                  checked={currentHazard.is_hard_restriction}
                  onChange={(e) => {
                    const updated = { ...currentHazard, is_hard_restriction: e.target.checked }
                    setCurrentHazard(updated)
                    executeSimulation(updated, crewProgressPct)
                  }}
                />
                Hard Barrier (Impassable / Obstacle)
              </label>
            </div>

            {!currentHazard.is_hard_restriction && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cost Multiplier ({currentHazard.cost_multiplier}x):</div>
                <input
                  type="range"
                  min="2"
                  max="30"
                  step="1"
                  value={currentHazard.cost_multiplier}
                  onChange={(e) => {
                    const updated = { ...currentHazard, cost_multiplier: parseFloat(e.target.value) }
                    setCurrentHazard(updated)
                    executeSimulation(updated, crewProgressPct)
                  }}
                  style={{ width: '100%', accentColor: 'var(--accent-secondary)' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Simulation Results Section */}
      {plan && (
        <div style={{ marginTop: '1rem' }}>
          {/* Status Badge Banner */}
          {statusBadge && (
            <div
              style={{
                padding: '0.6rem 0.8rem',
                borderRadius: '3px',
                background: statusBadge.bg,
                color: statusBadge.color,
                border: statusBadge.border,
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <span>{statusBadge.label}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                Incident ID: {plan.event_id} | Created: {plan.hazard_event.created_at_ltst}
              </span>
            </div>
          )}

          {/* Operational Impact Overview */}
          <div
            style={{
              marginTop: '0.6rem',
              background: 'var(--bg-panel-elevated)',
              padding: '0.6rem 0.8rem',
              borderRadius: '3px',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}
          >
            <strong>Spatial Impact Assessment: </strong>
            {plan.impact.impact_summary}
          </div>

          {/* Recalculated Resource & Traversal Delta Grid */}
          <div className="hazard-breakdown-grid" style={{ marginTop: '0.6rem' }}>
            <div className="hazard-stat-box">
              <div className="stat-label">Traverse Distance Δ</div>
              <div
                className="stat-value"
                style={{
                  color: plan.metrics_delta.distance_delta_m <= 0 ? 'var(--text-primary)' : 'var(--status-warning)',
                }}
              >
                {plan.metrics_delta.distance_delta_m > 0 ? '+' : ''}
                {(plan.metrics_delta.distance_delta_m / 1000).toFixed(2)} km
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Reroute: {plan.rerouted_route ? (plan.rerouted_route.properties.metrics.total_distance_m / 1000).toFixed(2) : '0.00'} km
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Walking Time Δ</div>
              <div
                className="stat-value"
                style={{
                  color: plan.metrics_delta.duration_delta_minutes <= 0 ? 'var(--text-primary)' : 'var(--status-warning)',
                }}
              >
                {plan.metrics_delta.duration_delta_minutes > 0 ? '+' : ''}
                {plan.metrics_delta.duration_delta_minutes.toFixed(1)} min
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Est: {plan.rerouted_route ? plan.rerouted_route.properties.metrics.estimated_duration_minutes.toFixed(0) : '0'} min
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Oxygen Margin Δ</div>
              <div
                className="stat-value"
                style={{
                  color: plan.metrics_delta.o2_consumption_delta_g <= 0 ? 'var(--text-primary)' : 'var(--status-critical)',
                }}
              >
                {plan.metrics_delta.o2_consumption_delta_g > 0 ? '+' : ''}
                {plan.metrics_delta.o2_consumption_delta_g.toFixed(1)} g
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Suit Consumable Draw
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Battery Power Δ</div>
              <div
                className="stat-value"
                style={{
                  color: plan.metrics_delta.battery_consumption_delta_wh <= 0 ? 'var(--text-primary)' : 'var(--status-critical)',
                }}
              >
                {plan.metrics_delta.battery_consumption_delta_wh > 0 ? '+' : ''}
                {plan.metrics_delta.battery_consumption_delta_wh.toFixed(1)} Wh
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                PLSS Heating & Mobility
              </small>
            </div>
          </div>

          {/* Plain-Language Intelligence Reasoning */}
          <div
            className="hazard-explanation-box"
            style={{
              marginTop: '0.6rem',
              borderLeftColor: plan.is_feasible ? 'var(--accent-secondary)' : 'var(--status-critical)',
              background: 'var(--bg-panel)',
              padding: '0.6rem 0.8rem',
              borderRadius: '2px',
              fontSize: '0.85rem',
            }}
          >
            <strong>Tactical Intelligence Rationale: </strong>
            {plan.reasoning}
          </div>

          {/* Feasibility Warnings */}
          {plan.mission_warnings.length > 0 && (
            <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {plan.mission_warnings.map((w, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#2a0808',
                    borderLeft: '3px solid var(--status-critical)',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '2px',
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  <strong>ALERT [{w.severity}]: </strong>
                  {w.message} — <em>Remediation: {w.remediation}</em>
                </div>
              ))}
            </div>
          )}

          {/* Mandatory Research Prototype Disclaimer Banner */}
          <div
            style={{
              marginTop: '0.6rem',
              background: 'var(--bg-panel-elevated)',
              borderLeft: '3px solid var(--border-default)',
              padding: '0.5rem 0.7rem',
              borderRadius: '3px',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              lineHeight: '1.4',
            }}
          >
            {plan.disclaimer}
          </div>
        </div>
      )}

      {/* Tested Mission Contingencies Log */}
      <div
        style={{
          marginTop: '1.2rem',
          background: 'var(--bg-panel-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: '4px',
          padding: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div>
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              Mission Contingency Audit Log ({testedContingencies.length})
            </strong>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Simulated surface hazards and abort scenarios tested during active mission planning
            </div>
          </div>
          {testedContingencies.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
              onClick={() => actions.clearContingencyTests()}
            >
              Clear Log
            </button>
          )}
        </div>

        {testedContingencies.length === 0 ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.5rem 0' }}>
            No contingency scenarios evaluated yet. Simulate a hazard or abort above to record impacts to this mission.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {testedContingencies.map((test, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-panel)',
                  border: `1px solid ${test.isFeasible ? 'var(--border-default)' : 'var(--status-critical)'}`,
                  borderRadius: '3px',
                  padding: '0.5rem 0.7rem',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {test.actionTaken === 'ABORT_TO_BASE' ? '🚨 ABORT TO BASE' : '⚠️ DYNAMIC DETOUR'}: {test.incidentTitle}
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      background: test.isFeasible ? '#064e3b' : '#450a0a',
                      color: test.isFeasible ? '#6ee7b7' : '#fca5a5',
                      fontWeight: 700,
                    }}
                  >
                    {test.isFeasible ? 'FEASIBLE WITH RESERVES' : 'IMPASSABLE / RESUPPLY NEEDED'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', fontSize: '0.72rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  <span>Distance: {test.detourDistanceM.toFixed(0)} m ({test.deltaDistanceM >= 0 ? `+${test.deltaDistanceM.toFixed(0)}` : test.deltaDistanceM.toFixed(0)} m)</span>
                  <span>Duration: {test.detourDurationMin.toFixed(1)} min ({test.deltaDurationMin >= 0 ? `+${test.deltaDurationMin.toFixed(1)}` : test.deltaDurationMin.toFixed(1)} min)</span>
                  <span>O₂ Delta: {test.additionalO2G >= 0 ? `+${test.additionalO2G.toFixed(1)}` : test.additionalO2G.toFixed(1)} g</span>
                  <span>Battery Delta: {test.additionalBatteryWh >= 0 ? `+${test.additionalBatteryWh.toFixed(1)}` : test.additionalBatteryWh.toFixed(1)} Wh</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
