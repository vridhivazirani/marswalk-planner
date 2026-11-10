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
        return '#00e5ff'
      case 'SCIENCE_FIRST':
        return '#ffd700'
      case 'BALANCED':
        return '#00e676'
      default:
        return '#ff9800'
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem', borderColor: '#455a64' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: '#e0e0e0' }}>Multi-Objective Route Trade-Off Engine</h3>
          <small style={{ color: '#90a4ae' }}>
            Pareto-optimal comparative evaluation across Safety, Science, and Efficiency
          </small>
        </div>

        <button
          type="button"
          className="mode-btn active"
          onClick={() => runComparison()}
          disabled={isEvaluating}
          style={{ background: '#00897b', borderColor: '#4db6ac' }}
        >
          {isEvaluating ? 'Evaluating Alternatives…' : 'Recalculate Trade-Offs'}
        </button>
      </div>

      {/* Scenario Selection */}
      <div style={{ marginTop: '0.8rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="scenario-select" style={{ color: '#b0bec5', fontSize: '0.9rem', fontWeight: 600 }}>
          Curated Jezero Scenario:
        </label>
        <select
          id="scenario-select"
          value={selectedScenarioId}
          onChange={handleScenarioChange}
          style={{
            background: '#1e2429',
            color: '#eceff1',
            border: '1px solid #37474f',
            padding: '0.35rem 0.6rem',
            borderRadius: '4px',
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
      <div style={{ marginTop: '0.8rem', background: '#1c2227', padding: '0.75rem', borderRadius: '4px', border: '1px solid #2e3a40' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cfd8dc', marginBottom: '0.5rem' }}>
          Mission Importance Preferences (Trade-Off Weights):
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#00e5ff' }}>
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
              style={{ width: '100%', accentColor: '#00e5ff' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#ffd700' }}>
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
              style={{ width: '100%', accentColor: '#ffd700' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#81c784' }}>
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
              style={{ width: '100%', accentColor: '#81c784' }}
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
              background: '#262d33',
              borderLeft: '4px solid #00bcd4',
              padding: '0.6rem 0.8rem',
              borderRadius: '2px',
              fontSize: '0.8rem',
              color: '#eceff1',
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
                    background: '#181f25',
                    padding: '0.75rem',
                    borderRadius: '4px',
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
                        background: r.rank_under_preferences === 1 ? '#00695c' : '#37474f',
                        color: r.rank_under_preferences === 1 ? '#a7ffeb' : '#cfd8dc',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      Rank #{r.rank_under_preferences} (Score: {(r.preference_utility_score * 100).toFixed(0)}%)
                    </span>
                  </div>

                  <div style={{ color: '#b0bec5', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    {r.primary_optimization_objective}
                  </div>

                  <hr style={{ borderColor: '#2e3a40', margin: '0.2rem 0' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#90a4ae' }}>Length:</span>
                    <strong>{r.length_km.toFixed(2)} km</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#90a4ae' }}>Est. Walking Time:</span>
                    <strong>{r.estimated_duration_min.toFixed(0)} min</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#90a4ae' }}>Mean Hazard Exposure:</span>
                    <strong style={{ color: r.mean_hazard_exposure_pct > 20 ? '#ff8a80' : '#81c784' }}>
                      {r.mean_hazard_exposure_pct.toFixed(1)}%
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#90a4ae' }}>Elevation Uncertainty:</span>
                    <strong>±{r.mean_uncertainty_m.toFixed(1)} m</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#90a4ae' }}>Science Opportunity Score:</span>
                    <strong style={{ color: '#ffd700' }}>{r.accumulated_science_score.toFixed(1)}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#90a4ae' }}>Accumulated Cost:</span>
                    <strong>{r.accumulated_cost.toFixed(0)}</strong>
                  </div>

                  <div
                    style={{
                      marginTop: '0.3rem',
                      background: '#12171b',
                      padding: '0.4rem 0.5rem',
                      borderRadius: '3px',
                      fontSize: '0.75rem',
                      color: '#b0bec5',
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
                background: '#171e23',
                padding: '0.75rem 1rem',
                borderRadius: '4px',
                border: '1px solid #2e3b43',
              }}
            >
              <h4 style={{ margin: '0 0 0.4rem 0', color: '#80cbc4', fontSize: '0.9rem' }}>
                Comparative Trade-Off Synthesis
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#cfd8dc', fontSize: '0.85rem', lineHeight: '1.5' }}>
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

