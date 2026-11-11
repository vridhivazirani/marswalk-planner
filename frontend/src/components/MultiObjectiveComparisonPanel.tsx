import React, { useState, useEffect } from 'react'
import type {
  ExplorationScenarioDTO,
  MissionPreferencesDTO,
  MultiObjectiveComparisonDTO,
  RouteFeature,
} from '../api/routing'
import { compareRoutes, fetchExplorationScenarios } from '../api/routing'

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
    setIsEvaluating(true)
    setEvalError(null)

    compareRoutes(start, dest, prefs, 'astar', true)
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
          disabled={isEvaluating}
        >
          {isEvaluating ? 'Evaluating Alternatives…' : 'Recalculate Trade-Offs'}
        </button>
      </div>

      {/* Scenario Selection */}
      <div style={{ marginTop: '0.8rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="scenario-select" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>
          Curated Jezero Scenario:
        </label>
        <select
          id="scenario-select"
          value={selectedScenarioId}
          onChange={handleScenarioChange}
          style={{
            background: 'var(--bg-panel-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            padding: '0.35rem 0.6rem',
            borderRadius: '3px',
            fontSize: '0.85rem',
            minWidth: '280px',
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

      {evalError && (
        <div className="card status-error" style={{ marginTop: '0.75rem', padding: '0.5rem' }}>
          {evalError}
        </div>
      )}

      {/* Comparison Results */}
      {comparison && (
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
            {comparison.no_universal_optimal_notice}
          </div>

          {/* Route Cards */}
          <div className="route-comparison-grid">
            {comparison.routes.map((r) => {
              const color = getProfileColor(r.profile_name)
              return (
                <div
                  key={r.route_id}
                  className="route-card"
                  style={{
                    borderTop: `3px solid ${color}`,
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-default)',
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
                    <span style={{ color: 'var(--text-secondary)' }}>Elevation Uncertainty:</span>
                    <strong>±{r.mean_uncertainty_m.toFixed(1)} m</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Science Opportunity Score:</span>
                    <strong style={{ color: 'var(--accent-secondary)' }}>{r.accumulated_science_score.toFixed(1)}</strong>
                  </div>

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
                </div>
              )
            })}
          </div>

          {/* Trade-Off Commentary */}
          {comparison.trade_off_analysis && comparison.trade_off_analysis.length > 0 && (
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
                {comparison.trade_off_analysis.map((item, idx) => (
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

