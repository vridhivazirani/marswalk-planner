import React, { useState, useEffect } from 'react'
import type {
  ExplorationScenarioDTO,
  MissionPreferencesDTO,
  MultiObjectiveComparisonDTO,
  RouteFeature,
} from '../api/routing'
import { compareRoutes, fetchExplorationScenarios } from '../api/routing'
import { useMission } from '../context/useMission'
import { getRegionCapabilityProfile } from '../mission/regionCapabilities'

interface Props {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  onUpdateCoordinates: (start: { lat: number; lon: number }, dest: { lat: number; lon: number }) => void
  onRoutesCalculated: (routes: RouteFeature[]) => void
}

export const MultiObjectiveComparisonPanel: React.FC<Props> = ({
  startPoint,
  destPoint,
  onUpdateCoordinates,
  onRoutesCalculated,
}) => {
  const { mission, actions } = useMission()
  const activeRegionId = mission.geographic.regionId
  const regionProfile = getRegionCapabilityProfile(activeRegionId)
  const isEvaSupported = regionProfile.supportsEvaRouting

  const [scenarios, setScenarios] = useState<ExplorationScenarioDTO[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [preferences, setPreferences] = useState<MissionPreferencesDTO>({
    safety_importance: 0.4,
    science_importance: 0.35,
    efficiency_importance: 0.25,
  })
  const [comparison, setComparison] = useState<MultiObjectiveComparisonDTO | null>(null)
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false)
  const [evalError, setEvalError] = useState<string | null>(null)

  const activeComparison = isEvaSupported ? comparison : null
  const activeEvalError = isEvaSupported ? evalError : null

  useEffect(() => {
    fetchExplorationScenarios()
      .then((data) => {
        setScenarios(data)
        if (data.length > 0) {
          const first = data[0]
          setSelectedScenarioId(first.scenario_id)
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to load exploration scenarios:', err)
      })
  }, [])

  const runComparison = (
    start = startPoint,
    dest = destPoint,
    prefs = preferences,
  ) => {
    if (!isEvaSupported) {
      setEvalError(
        `Route comparison is disabled for ${regionProfile.displayName} (${activeRegionId}); authoritative high-resolution terrain rasters exist exclusively for Jezero Crater.`,
      )
      return
    }

    setIsEvaluating(true)
    setEvalError(null)

    const waypoints = mission.eva.waypoints.map((w) => ({ lat: w.lat, lon: w.lon }))
    compareRoutes(start, dest, prefs, 'astar', true, waypoints)
      .then((res) => {
        setComparison(res.comparison)
        onRoutesCalculated(res.features)
        setIsEvaluating(false)
      })
      .catch((err: unknown) => {
        setEvalError(err instanceof Error ? err.message : String(err))
        setIsEvaluating(false)
      })
  }

  const handleScenarioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSelectedScenarioId(id)
    if (!isEvaSupported) return

    const found = scenarios.find((s) => s.scenario_id === id)
    if (found) {
      const newStart = { lat: found.start.lat, lon: found.start.lon }
      const newDest = { lat: found.destination.lat, lon: found.destination.lon }
      const newPrefs = found.suggested_preferences
      setPreferences(newPrefs)
      onUpdateCoordinates(newStart, newDest)
      runComparison(newStart, newDest, newPrefs)
    }
  }

  const handlePreferenceSlider = (key: keyof MissionPreferencesDTO, val: number) => {
    const updated = { ...preferences, [key]: val }
    setPreferences(updated)
  }

  const getProfileColor = (profileName: string): string => {
    switch (profileName) {
      case 'SAFETY_FIRST':
        return '#ffffff'
      case 'SCIENCE_FIRST':
        return '#8a8a8a'
      case 'BALANCED':
        return '#d4d4d4'
      default:
        return '#a3a3a3'
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem', background: 'var(--bg-panel)', borderColor: 'var(--border-default)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Multi-Objective Route Trade-Off Engine</h3>
          <small style={{ color: 'var(--text-secondary)' }}>
            Pareto-optimal comparative evaluation across Safety, Science, and Efficiency
          </small>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => runComparison()}
          disabled={isEvaluating || !isEvaSupported}
          title={
            !isEvaSupported
              ? `Route comparison is restricted to Jezero Crater (active region: ${regionProfile.displayName}).`
              : undefined
          }
        >
          {isEvaluating ? 'Evaluating Alternatives…' : 'Recalculate Trade-Offs'}
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
          <strong>Jezero Crater Route Engine Restricted: </strong>
          Multi-objective Pareto comparison and curated exploration scenarios require high-resolution (1m/20m) elevation and hazard rasters available exclusively in Jezero Crater (<code>reg-jezero</code>). Active region: <strong>{regionProfile.displayName}</strong> (<code>{activeRegionId}</code>). Switch region to Jezero Crater to evaluate EVA trade-offs.
        </div>
      )}

      {/* Scenario Selection */}
      <div style={{ marginTop: '0.8rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="scenario-select" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>
          Curated Jezero Scenario:
        </label>
        <select
          id="scenario-select"
          value={selectedScenarioId}
          onChange={handleScenarioChange}
          disabled={!isEvaSupported}
          style={{
            background: 'var(--bg-panel-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            padding: '0.35rem 0.6rem',
            borderRadius: '3px',
            fontSize: '0.85rem',
            minWidth: '280px',
            opacity: !isEvaSupported ? 0.6 : 1,
            cursor: !isEvaSupported ? 'not-allowed' : 'pointer',
          }}
        >
          {scenarios.map((s) => (
            <option key={s.scenario_id} value={s.scenario_id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      {/* Interactive Mission Preferences */}
      <div style={{ marginTop: '0.8rem', background: 'var(--bg-panel-elevated)', padding: '0.75rem', borderRadius: '3px', border: '1px solid var(--border-default)' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Mission Importance Preferences (Trade-Off Weights):
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              <span>Safety Importance (Slope/Hazard):</span>
              <strong>{(preferences.safety_importance * 100).toFixed(0)}%</strong>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={preferences.safety_importance}
              onChange={(e) => handlePreferenceSlider('safety_importance', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              <span>Science Importance (Mineral/Delta):</span>
              <strong>{(preferences.science_importance * 100).toFixed(0)}%</strong>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={preferences.science_importance}
              onChange={(e) => handlePreferenceSlider('science_importance', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-secondary)' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              <span>Efficiency Importance (Speed/Time):</span>
              <strong>{(preferences.efficiency_importance * 100).toFixed(0)}%</strong>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={preferences.efficiency_importance}
              onChange={(e) => handlePreferenceSlider('efficiency_importance', parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-secondary)' }}
            />
          </div>
        </div>
      </div>

      {activeEvalError && (
        <div className="card status-error" style={{ marginTop: '0.75rem', padding: '0.5rem' }}>
          {activeEvalError}
        </div>
      )}

      {/* Comparison Results */}
      {activeComparison && (
        <div style={{ marginTop: '1rem' }}>
          {/* Universal Optimal Disclaimer Banner */}
          <div
            style={{
              background: 'var(--bg-panel-elevated)',
              borderLeft: '3px solid var(--accent-primary)',
              padding: '0.6rem 0.8rem',
              borderRadius: '2px',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              lineHeight: '1.4',
              marginBottom: '1rem',
            }}
          >
            <strong>Decision Support Note: </strong>
            {activeComparison.no_universal_optimal_notice}
          </div>

          {/* Route Cards */}
          <div className="route-comparison-grid">
            {activeComparison.routes.map((r) => {
              const color = getProfileColor(r.profile_name)
              const isCommitted = mission.eva.selectedRouteDecision?.routeId === r.route_id
              const targetCount =
                r.scientific_targets_count ?? (r.visited_target_ids ? r.visited_target_ids.length : 0)
              return (
                <div
                  key={r.route_id}
                  className="route-card"
                  style={{
                    borderTop: `3px solid ${color}`,
                    background: isCommitted ? 'var(--bg-panel-elevated)' : 'var(--bg-panel)',
                    border: isCommitted ? '2px solid var(--accent-primary)' : '1px solid var(--border-default)',
                    padding: '0.75rem',
                    borderRadius: '3px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color, fontSize: '0.95rem' }}>
                      {r.profile_name.replace('_', ' ')}
                    </span>
                    <span
                      style={{
                        background: r.rank_under_preferences === 1 ? 'var(--accent-primary)' : 'var(--bg-panel-elevated)',
                        color: r.rank_under_preferences === 1 ? 'var(--text-inverse)' : 'var(--text-secondary)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '2px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      Rank #{r.rank_under_preferences} (Score: {(r.preference_utility_score * 100).toFixed(0)}%)
                    </span>
                  </div>

                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    {r.primary_optimization_objective}
                  </div>

                  <hr style={{ borderColor: 'var(--border-subtle)', margin: '0.2rem 0' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Length:</span>
                    <strong>{r.length_km.toFixed(2)} km</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Est. Walking Time:</span>
                    <strong>{r.estimated_duration_min.toFixed(0)} min</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Mean Hazard Exposure:</span>
                    <strong style={{ color: r.mean_hazard_exposure_pct > 20 ? 'var(--status-critical)' : 'var(--text-primary)' }}>
                      {r.mean_hazard_exposure_pct.toFixed(1)}%
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Nominal Precision Tier:</span>
                    <strong>
                      {r.mean_uncertainty_m !== null && r.mean_uncertainty_m !== undefined
                        ? `${r.mean_uncertainty_m.toFixed(2)} m${r.max_uncertainty_m !== null && r.max_uncertainty_m !== undefined ? ` (max ${r.max_uncertainty_m.toFixed(2)}m)` : ''}`
                        : 'N/A'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Data Reliability [0–1]:</span>
                    <strong>
                      {r.mean_data_confidence !== null && r.mean_data_confidence !== undefined
                        ? r.mean_data_confidence.toFixed(3)
                        : 'N/A'}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>CTX-Only Exposure:</span>
                    <strong>{(r.resolution_uncertainty_km ?? 0).toFixed(2)} km</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Science Opportunity Score:</span>
                    <strong style={{ color: 'var(--accent-secondary)' }}>{r.accumulated_science_score.toFixed(1)}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Visited Science Targets:</span>
                    <strong style={{ color: 'var(--accent-secondary)' }}>{targetCount}</strong>
                  </div>

                  {r.visited_target_ids && r.visited_target_ids.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.15rem' }}>
                      {r.visited_target_ids.map((tid) => (
                        <span
                          key={tid}
                          style={{
                            background: 'var(--bg-panel-elevated)',
                            color: 'var(--text-primary)',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '2px',
                            fontSize: '0.68rem',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          🎯 {tid}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Accumulated Cost:</span>
                    <strong>{r.accumulated_cost.toFixed(0)}</strong>
                  </div>

                  <div
                    style={{
                      marginTop: '0.3rem',
                      background: 'var(--bg-panel-elevated)',
                      padding: '0.4rem 0.5rem',
                      borderRadius: '2px',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      borderLeft: `2px solid ${color}`,
                    }}
                  >
                    <strong>Trade-off: </strong>
                    {r.key_trade_off}
                  </div>

                  {/* Route Selection Commit Button */}
                  <div style={{ marginTop: '0.5rem' }}>
                    {isCommitted ? (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.35rem 0.55rem',
                          background: 'rgba(34, 197, 94, 0.12)',
                          border: '1px solid #22c55e',
                          borderRadius: '3px',
                          fontSize: '0.75rem',
                          color: '#22c55e',
                          fontWeight: 700,
                        }}
                      >
                        <span>✓ Selected for Mission</span>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.68rem', padding: '0.12rem 0.35rem' }}
                          onClick={() => actions.clearSelectedRoute()}
                        >
                          Deselect
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ width: '100%', fontSize: '0.75rem', padding: '0.32rem 0.5rem' }}
                        onClick={() => {
                          actions.selectRoute({
                            routeId: r.route_id,
                            profileName: r.profile_name,
                            metricsSummary: {
                              totalDistanceM: r.length_km * 1000.0,
                              estimatedDurationMin: r.estimated_duration_min,
                              meanHazardPct: r.mean_hazard_exposure_pct,
                              meanScienceScore: r.mean_science_score,
                              preferenceUtilityScore: r.preference_utility_score,
                              rankUnderPreferences: r.rank_under_preferences,
                            },
                            visitedTargetIds: r.visited_target_ids ?? [],
                            scientificTargetsCount: targetCount,
                          })
                        }}
                      >
                        Select this Route for Mission Plan
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Trade-Off Commentary */}
          {activeComparison.trade_off_analysis && activeComparison.trade_off_analysis.length > 0 && (
            <div
              style={{
                marginTop: '1rem',
                background: 'var(--bg-panel)',
                padding: '0.75rem 1rem',
                borderRadius: '3px',
                border: '1px solid var(--border-default)',
              }}
            >
              <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                Comparative Trade-Off Synthesis
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                {activeComparison.trade_off_analysis.map((item, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

