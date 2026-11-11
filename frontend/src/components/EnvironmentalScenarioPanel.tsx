import React, { useState, useEffect, useCallback } from 'react'
import type {
  DataSourceProvenanceDTO,
  EnvironmentalAssessmentReportDTO,
  EnvironmentalScenarioInputDTO,
  EnvironmentalWeightsDTO,
} from '../api/environmental'
import {
  assessEnvironmentalScenario,
  compareEnvironmentalScenarios,
  fetchCuratedEnvironmentalScenarios,
  fetchEnvironmentalSources,
} from '../api/environmental'

export const EnvironmentalScenarioPanel: React.FC = () => {
  const [scenarios, setScenarios] = useState<EnvironmentalScenarioInputDTO[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [currentScenario, setCurrentScenario] = useState<EnvironmentalScenarioInputDTO | null>(null)
  const [assessment, setAssessment] = useState<EnvironmentalAssessmentReportDTO | null>(null)
  const [comparisons, setComparisons] = useState<EnvironmentalAssessmentReportDTO[]>([])
  const [sources, setSources] = useState<DataSourceProvenanceDTO[]>([])
  const [weights, setWeights] = useState<EnvironmentalWeightsDTO>({
    w_thermal: 0.3,
    w_solar: 0.25,
    w_dust: 0.25,
    w_wind: 0.2,
  })
  const [showWeights, setShowWeights] = useState<boolean>(false)
  const [isAssessing, setIsAssessing] = useState<boolean>(false)
  const [showSources, setShowSources] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const evaluateScenario = useCallback(
    (
      scen: EnvironmentalScenarioInputDTO,
      w: EnvironmentalWeightsDTO = weights,
    ) => {
      setIsAssessing(true)
      setError(null)
      assessEnvironmentalScenario(scen, w)
        .then((rep) => {
          setAssessment(rep)
          setIsAssessing(false)
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err))
          setIsAssessing(false)
        })
    },
    [weights],
  )

  useEffect(() => {
    Promise.all([fetchCuratedEnvironmentalScenarios(), fetchEnvironmentalSources()])
      .then(([scenList, srcList]) => {
        setScenarios(scenList)
        setSources(srcList)
        if (scenList.length > 0) {
          const initial = scenList[0]
          setSelectedScenarioId(initial.scenario_id)
          setCurrentScenario(initial)
          setIsAssessing(true)
          assessEnvironmentalScenario(initial, {
            w_thermal: 0.3,
            w_solar: 0.25,
            w_dust: 0.25,
            w_wind: 0.2,
          })
            .then((rep) => {
              setAssessment(rep)
              setIsAssessing(false)
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : String(err))
              setIsAssessing(false)
            })
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to initialize environmental module:', err)
      })
  }, [])

  const handleScenarioSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSelectedScenarioId(id)
    const found = scenarios.find((s) => s.scenario_id === id)
    if (found) {
      setCurrentScenario(found)
      evaluateScenario(found)
    }
  }

  const handleParamChange = (field: keyof EnvironmentalScenarioInputDTO, val: unknown) => {
    if (!currentScenario) return
    const updated: EnvironmentalScenarioInputDTO = {
      ...currentScenario,
      [field]: val,
      data_origin: 'USER_SCENARIO',
      source_reference: 'User-configured hypothetical scenario',
      source_time_period: 'Custom exploration simulation',
    }
    setCurrentScenario(updated)
    setSelectedScenarioId('CUSTOM')
    evaluateScenario(updated)
  }

  const handleWeightChange = (field: keyof EnvironmentalWeightsDTO, val: number) => {
    const updated = { ...weights, [field]: val }
    setWeights(updated)
    if (currentScenario) {
      evaluateScenario(currentScenario, updated)
    }
  }

  const handleCompareAll = () => {
    if (scenarios.length === 0) return
    setIsAssessing(true)
    compareEnvironmentalScenarios(scenarios, weights)
      .then((reps) => {
        setComparisons(reps)
        setIsAssessing(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setIsAssessing(false)
      })
  }

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'OPTIMAL':
        return { background: '#202020', color: '#ffffff', border: '1px solid #ffffff', label: 'OPTIMAL (Benign Conditions)' }
      case 'ACCEPTABLE':
        return { background: '#181818', color: '#d4d4d4', border: '1px solid #737373', label: 'ACCEPTABLE (Within Flight Rules)' }
      case 'MARGINAL':
        return { background: '#261808', color: '#f5f5f5', border: '1px solid #78350f', label: 'MARGINAL (High Environmental Strain)' }
      default:
        return { background: '#2a0808', color: '#f5f5f5', border: '1px solid #5c1414', label: 'HAZARDOUS (Severe Extreme Risk)' }
    }
  }

  const getOriginBadge = (origin: string) => {
    switch (origin) {
      case 'HISTORICAL_OBSERVED':
        return { background: '#202020', color: '#f5f5f5', border: '1px solid #737373', text: 'MEDA In-Situ Ingest' }
      case 'CLIMATE_MODELED':
        return { background: '#181818', color: '#d4d4d4', border: '1px solid #525252', text: 'MCD Climate Model' }
      default:
        return { background: '#181818', color: '#a3a3a3', border: '1px solid #383838', text: 'User Scenario Input' }
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.2rem', background: 'var(--bg-panel)', borderColor: 'var(--border-default)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Marswalk Environmental Scenario Engine</h3>
          <small style={{ color: 'var(--text-secondary)' }}>
            Hypothetical EVA meteorological assessment, dust opacity, thermal suitability, and historical dataset provenance
          </small>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCompareAll}
            disabled={isAssessing}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
          >
            Compare All Scenarios
          </button>
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
        <label htmlFor="env-scenario-select" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
          Select Planetary Environmental Scenario:
        </label>
        <select
          id="env-scenario-select"
          value={selectedScenarioId}
          onChange={handleScenarioSelect}
          style={{
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            padding: '0.35rem 0.5rem',
            borderRadius: '3px',
            fontSize: '0.85rem',
            minWidth: '280px',
          }}
        >
          {scenarios.map((s) => (
            <option key={s.scenario_id} value={s.scenario_id}>
              {s.title} ({s.data_origin.replace('_', ' ')})
            </option>
          ))}
          <option value="CUSTOM">Custom User Scenario (Interactive Sliders)</option>
        </select>

        {currentScenario && (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.2rem 0.5rem',
              borderRadius: '2px',
              ...getOriginBadge(currentScenario.data_origin),
            }}
          >
            {getOriginBadge(currentScenario.data_origin).text}
          </span>
        )}
      </div>

      {/* 10 Quick-Select What-If Scenario Pills */}
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {scenarios.map((s, idx) => {
          const isSelected = selectedScenarioId === s.scenario_id
          const icons = ['☀️', '💨', '🌪️', '❄️', '🌑', '☢️', '📡', '🌡️', '🏖️', '🚨']
          return (
            <button
              key={s.scenario_id}
              type="button"
              onClick={() => {
                setSelectedScenarioId(s.scenario_id)
                setCurrentScenario(s)
                evaluateScenario(s)
              }}
              style={{
                background: isSelected ? '#18181b' : '#0d0d0f',
                border: isSelected ? '1px solid #00e5ff' : '1px solid #27272a',
                color: isSelected ? '#00e5ff' : '#a1a1aa',
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.2rem 0.45rem',
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <span>{icons[idx] || '⚙️'}</span>
              <span>{s.title.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div className="card status-error" style={{ marginTop: '0.6rem', padding: '0.5rem' }}>
          {error}
        </div>
      )}

      {/* Interactive Scenario Parameter Sliders */}
      {currentScenario && (
        <div
          style={{
            marginTop: '0.8rem',
            background: 'var(--bg-panel)',
            padding: '0.8rem',
            borderRadius: '3px',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
            Operational Environmental Parameters & Weather Proxies:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem' }}>
            {/* Air Temperature */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                <span>Ambient Air Temp:</span>
                <strong>{currentScenario.air_temperature_c.toFixed(1)} °C</strong>
              </div>
              <input
                type="range"
                min="-90"
                max="5"
                step="1"
                value={currentScenario.air_temperature_c}
                onChange={(e) => handleParamChange('air_temperature_c', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--text-primary)' }}
              />
            </div>

            {/* Solar Irradiance */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                <span>Solar Irradiance:</span>
                <strong>{currentScenario.solar_irradiance_w_per_m2.toFixed(0)} W/m²</strong>
              </div>
              <input
                type="range"
                min="0"
                max="600"
                step="10"
                value={currentScenario.solar_irradiance_w_per_m2}
                onChange={(e) => handleParamChange('solar_irradiance_w_per_m2', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-secondary)' }}
              />
            </div>

            {/* Dust Opacity Tau */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                <span>Dust Opacity (τ):</span>
                <strong>τ = {currentScenario.dust_optical_depth_tau.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.5"
                step="0.05"
                value={currentScenario.dust_optical_depth_tau}
                onChange={(e) => handleParamChange('dust_optical_depth_tau', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-secondary)' }}
              />
            </div>

            {/* Sustained Wind Speed */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                <span>Wind Speed / Gust:</span>
                <strong>
                  {currentScenario.wind_speed_mps.toFixed(1)} / {currentScenario.wind_gust_mps.toFixed(1)} m/s
                </strong>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="0.5"
                value={currentScenario.wind_speed_mps}
                onChange={(e) => {
                  const ws = parseFloat(e.target.value)
                  handleParamChange('wind_speed_mps', ws)
                  handleParamChange('wind_gust_mps', ws * 1.8)
                }}
                style={{ width: '100%', accentColor: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Operational Window: {currentScenario.operational_window_start_ltst} - {currentScenario.operational_window_end_ltst} LTST</span>
            <span>Duration: {currentScenario.operational_window_hours.toFixed(1)} hours</span>
            <span>Season (Ls): {currentScenario.season_solar_longitude_ls_deg ?? 180}°</span>
          </div>

          <div style={{ marginTop: '0.6rem' }}>
            <button
              type="button"
              className="mode-btn"
              onClick={() => setShowWeights(!showWeights)}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
            >
              {showWeights ? 'Hide Weight Sensitivity Settings ▲' : 'Configure Weight Priorities (Thermal / Solar / Dust / Wind) ▼'}
            </button>

            {showWeights && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.6rem',
                  background: 'var(--bg-panel-elevated)',
                  borderRadius: '3px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.8rem',
                  border: '1px dashed var(--border-default)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Thermal Weight:</span>
                    <strong>{weights.w_thermal.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={weights.w_thermal}
                    onChange={(e) => handleWeightChange('w_thermal', parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Solar Weight:</span>
                    <strong>{weights.w_solar.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={weights.w_solar}
                    onChange={(e) => handleWeightChange('w_solar', parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Dust Opacity Weight:</span>
                    <strong>{weights.w_dust.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={weights.w_dust}
                    onChange={(e) => handleWeightChange('w_dust', parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Wind Weight:</span>
                    <strong>{weights.w_wind.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={weights.w_wind}
                    onChange={(e) => handleWeightChange('w_wind', parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Suitability Score Results */}
      {assessment && (
        <div style={{ marginTop: '1rem' }}>
          {/* Overall Suitability Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              padding: '0.6rem 0.8rem',
              borderRadius: '3px',
              background: 'var(--bg-panel-elevated)',
              borderLeft: `3px solid ${getCategoryBadge(assessment.suitability.suitability_category).color}`,
              border: '1px solid var(--border-default)',
            }}
          >
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mission Environmental Suitability Score:</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {(assessment.suitability.overall_suitability_score * 100).toFixed(1)}%
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginLeft: '0.8rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '2px',
                    ...getCategoryBadge(assessment.suitability.suitability_category),
                  }}
                >
                  {getCategoryBadge(assessment.suitability.suitability_category).label}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
              <div>Origin: {assessment.scenario.data_origin}</div>
              <div>Source: {assessment.scenario.source_reference}</div>
            </div>
          </div>

          {/* Component Scores Breakdown */}
          <div className="hazard-breakdown-grid" style={{ marginTop: '0.6rem' }}>
            <div className="hazard-stat-box">
              <div className="stat-label">Thermal Score</div>
              <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                {(assessment.suitability.thermal_score * 100).toFixed(0)}%
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Air: {assessment.scenario.air_temperature_c.toFixed(1)}°C
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Solar Illumination</div>
              <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                {(assessment.suitability.solar_illumination_score * 100).toFixed(0)}%
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Flux: {assessment.scenario.solar_irradiance_w_per_m2.toFixed(0)} W/m²
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Dust Transparency</div>
              <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                {(assessment.suitability.dust_opacity_score * 100).toFixed(0)}%
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Opacity: τ = {assessment.scenario.dust_optical_depth_tau.toFixed(2)}
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Aerodynamic Drag</div>
              <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                {(assessment.suitability.wind_aerodynamic_score * 100).toFixed(0)}%
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Wind: {assessment.scenario.wind_speed_mps.toFixed(1)} m/s
              </small>
            </div>
          </div>

          {/* Warnings List */}
          {assessment.warnings.length > 0 && (
            <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {assessment.warnings.map((w, idx) => (
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
                  <strong>ALERT: </strong>
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Data Provenance Notice */}
          <div
            style={{
              marginTop: '0.6rem',
              background: 'var(--bg-panel-elevated)',
              padding: '0.5rem 0.7rem',
              borderRadius: '3px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
            }}
          >
            {assessment.data_availability_notice}
          </div>

          {/* Safety Disclaimer Banner */}
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
            {assessment.safety_disclaimer}
          </div>
        </div>
      )}

      {/* Comparative Scenario Evaluation Matrix */}
      {comparisons.length > 0 && (
        <div style={{ marginTop: '1.2rem', background: 'var(--bg-panel)', padding: '0.8rem', borderRadius: '3px', border: '1px solid var(--border-default)' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            Multi-Scenario Comparative Ranking Matrix
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.4rem' }}>Rank</th>
                  <th style={{ padding: '0.4rem' }}>Scenario</th>
                  <th style={{ padding: '0.4rem' }}>Data Origin</th>
                  <th style={{ padding: '0.4rem' }}>Air Temp</th>
                  <th style={{ padding: '0.4rem' }}>Solar Flux</th>
                  <th style={{ padding: '0.4rem' }}>Dust τ</th>
                  <th style={{ padding: '0.4rem' }}>Wind</th>
                  <th style={{ padding: '0.4rem' }}>Score</th>
                  <th style={{ padding: '0.4rem' }}>Category</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((c, idx) => (
                  <tr
                    key={c.scenario.scenario_id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      background: idx === 0 ? 'var(--bg-panel-elevated)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>#{idx + 1}</td>
                    <td style={{ padding: '0.4rem', color: 'var(--text-primary)', fontWeight: 600 }}>{c.scenario.title}</td>
                    <td style={{ padding: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '2px',
                          ...getOriginBadge(c.scenario.data_origin),
                        }}
                      >
                        {getOriginBadge(c.scenario.data_origin).text}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem' }}>{c.scenario.air_temperature_c.toFixed(0)}°C</td>
                    <td style={{ padding: '0.4rem' }}>{c.scenario.solar_irradiance_w_per_m2.toFixed(0)} W/m²</td>
                    <td style={{ padding: '0.4rem' }}>{c.scenario.dust_optical_depth_tau.toFixed(2)}</td>
                    <td style={{ padding: '0.4rem' }}>{c.scenario.wind_speed_mps.toFixed(1)} m/s</td>
                    <td style={{ padding: '0.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {(c.suitability.overall_suitability_score * 100).toFixed(0)}%
                    </td>
                    <td style={{ padding: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '2px',
                          ...getCategoryBadge(c.suitability.suitability_category),
                        }}
                      >
                        {c.suitability.suitability_category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dataset Provenance Drawer */}
      <div style={{ marginTop: '0.8rem' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowSources(!showSources)}
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
        >
          {showSources ? 'Hide Environmental Dataset Provenance ▲' : 'Inspect Authentic Planetary Data Provenance (MEDA / MCD) ▼'}
        </button>

        {showSources && sources.length > 0 && (
          <div
            style={{
              marginTop: '0.5rem',
              background: 'var(--bg-panel)',
              padding: '0.7rem',
              borderRadius: '3px',
              border: '1px solid var(--border-default)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.4rem' }}>
              Official Planetary In-Situ & Modeled Climate Data Sources:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.8rem' }}>
              {sources.map((s) => (
                <div key={s.product_id} style={{ background: 'var(--bg-panel-elevated)', border: '1px solid var(--border-default)', padding: '0.5rem', borderRadius: '3px' }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Product ID: {s.product_id}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Org: {s.organization}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Coverage: {s.coverage}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--status-warning)', marginTop: '0.2rem' }}>
                    <em>Limitation: </em>
                    {s.caveats}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
