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
        return { background: '#1b5e20', color: '#c8e6c9', label: 'OPTIMAL (Benign Conditions)' }
      case 'ACCEPTABLE':
        return { background: '#0d47a1', color: '#bbdefb', label: 'ACCEPTABLE (Within Flight Rules)' }
      case 'MARGINAL':
        return { background: '#f57f17', color: '#fff9c4', label: 'MARGINAL (High Environmental Strain)' }
      default:
        return { background: '#b71c1c', color: '#ffcdd2', label: 'HAZARDOUS (Severe Extreme Risk)' }
    }
  }

  const getOriginBadge = (origin: string) => {
    switch (origin) {
      case 'HISTORICAL_OBSERVED':
        return { background: '#004d40', color: '#80cbc4', text: 'MEDA In-Situ Ingest' }
      case 'CLIMATE_MODELED':
        return { background: '#311b92', color: '#b39ddb', text: 'MCD Climate Model' }
      default:
        return { background: '#bf360c', color: '#ffccbc', text: 'User Scenario Input' }
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.2rem', borderColor: '#3e4e58' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: '#e0e0e0' }}>Marswalk Environmental Scenario Engine</h3>
          <small style={{ color: '#90a4ae' }}>
            Hypothetical EVA meteorological assessment, dust opacity, thermal suitability, and historical dataset provenance
          </small>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="mode-btn"
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
          background: '#1a2228',
          padding: '0.6rem 0.8rem',
          borderRadius: '4px',
          border: '1px solid #28343c',
        }}
      >
        <label htmlFor="env-scenario-select" style={{ fontSize: '0.85rem', color: '#cfd8dc', fontWeight: 600 }}>
          Select Planetary Environmental Scenario:
        </label>
        <select
          id="env-scenario-select"
          value={selectedScenarioId}
          onChange={handleScenarioSelect}
          style={{
            background: '#232d34',
            color: '#eceff1',
            border: '1px solid #37474f',
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
              borderRadius: '3px',
              ...getOriginBadge(currentScenario.data_origin),
            }}
          >
            {getOriginBadge(currentScenario.data_origin).text}
          </span>
        )}
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
            background: '#161d22',
            padding: '0.8rem',
            borderRadius: '4px',
            border: '1px solid #28343c',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#80cbc4', marginBottom: '0.6rem' }}>
            Operational Environmental Parameters & Weather Proxies:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem' }}>
            {/* Air Temperature */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#90caf9' }}>
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
                style={{ width: '100%', accentColor: '#90caf9' }}
              />
            </div>

            {/* Solar Irradiance */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#ffd700' }}>
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
                style={{ width: '100%', accentColor: '#ffd700' }}
              />
            </div>

            {/* Dust Opacity Tau */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#ffb74d' }}>
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
                style={{ width: '100%', accentColor: '#ffb74d' }}
              />
            </div>

            {/* Sustained Wind Speed */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#81c784' }}>
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
                style={{ width: '100%', accentColor: '#81c784' }}
              />
            </div>
          </div>

          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#90a4ae' }}>
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
                  background: '#12181d',
                  borderRadius: '3px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.8rem',
                  border: '1px dashed #37474f',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#90caf9', display: 'flex', justifyContent: 'space-between' }}>
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
                    style={{ width: '100%', accentColor: '#90caf9' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#ffd700', display: 'flex', justifyContent: 'space-between' }}>
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
                    style={{ width: '100%', accentColor: '#ffd700' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#ffb74d', display: 'flex', justifyContent: 'space-between' }}>
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
                    style={{ width: '100%', accentColor: '#ffb74d' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#81c784', display: 'flex', justifyContent: 'space-between' }}>
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
                    style={{ width: '100%', accentColor: '#81c784' }}
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
              borderRadius: '4px',
              background: '#1e242a',
              borderLeft: `4px solid ${getCategoryBadge(assessment.suitability.suitability_category).background}`,
            }}
          >
            <div>
              <span style={{ fontSize: '0.85rem', color: '#b0bec5' }}>Mission Environmental Suitability Score:</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#eceff1' }}>
                {(assessment.suitability.overall_suitability_score * 100).toFixed(1)}%
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginLeft: '0.8rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '3px',
                    ...getCategoryBadge(assessment.suitability.suitability_category),
                  }}
                >
                  {getCategoryBadge(assessment.suitability.suitability_category).label}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#90a4ae', textAlign: 'right' }}>
              <div>Origin: {assessment.scenario.data_origin}</div>
              <div>Source: {assessment.scenario.source_reference}</div>
            </div>
          </div>

          {/* Component Scores Breakdown */}
          <div className="hazard-breakdown-grid" style={{ marginTop: '0.6rem' }}>
            <div className="hazard-stat-box">
              <div className="stat-label">Thermal Score</div>
              <div className="stat-value" style={{ color: '#90caf9' }}>
                {(assessment.suitability.thermal_score * 100).toFixed(0)}%
              </div>
              <small style={{ color: '#90a4ae', fontSize: '0.75rem' }}>
                Air: {assessment.scenario.air_temperature_c.toFixed(1)}°C
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Solar Illumination</div>
              <div className="stat-value" style={{ color: '#ffd700' }}>
                {(assessment.suitability.solar_illumination_score * 100).toFixed(0)}%
              </div>
              <small style={{ color: '#90a4ae', fontSize: '0.75rem' }}>
                Flux: {assessment.scenario.solar_irradiance_w_per_m2.toFixed(0)} W/m²
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Dust Transparency</div>
              <div className="stat-value" style={{ color: '#ffb74d' }}>
                {(assessment.suitability.dust_opacity_score * 100).toFixed(0)}%
              </div>
              <small style={{ color: '#90a4ae', fontSize: '0.75rem' }}>
                Opacity: τ = {assessment.scenario.dust_optical_depth_tau.toFixed(2)}
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Aerodynamic Drag</div>
              <div className="stat-value" style={{ color: '#81c784' }}>
                {(assessment.suitability.wind_aerodynamic_score * 100).toFixed(0)}%
              </div>
              <small style={{ color: '#90a4ae', fontSize: '0.75rem' }}>
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
                    background: '#2b1a1a',
                    borderLeft: '3px solid #ef5350',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '2px',
                    fontSize: '0.8rem',
                    color: '#ffcdd2',
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
              background: '#141a1f',
              padding: '0.5rem 0.7rem',
              borderRadius: '3px',
              fontSize: '0.75rem',
              color: '#90a4ae',
              border: '1px solid #232d34',
            }}
          >
            {assessment.data_availability_notice}
          </div>

          {/* Safety Disclaimer Banner */}
          <div
            style={{
              marginTop: '0.6rem',
              background: '#201815',
              borderLeft: '3px solid #ff7043',
              padding: '0.5rem 0.7rem',
              borderRadius: '3px',
              fontSize: '0.75rem',
              color: '#ffccbc',
              lineHeight: '1.4',
            }}
          >
            {assessment.safety_disclaimer}
          </div>
        </div>
      )}

      {/* Comparative Scenario Evaluation Matrix */}
      {comparisons.length > 0 && (
        <div style={{ marginTop: '1.2rem', background: '#171e24', padding: '0.8rem', borderRadius: '4px', border: '1px solid #2c3942' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#80cbc4', fontSize: '0.9rem' }}>
            Multi-Scenario Comparative Ranking Matrix
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', color: '#cfd8dc' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #37474f', textAlign: 'left', color: '#90a4ae' }}>
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
                      borderBottom: '1px solid #232d34',
                      background: idx === 0 ? 'rgba(0, 150, 136, 0.08)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.4rem', fontWeight: 700 }}>#{idx + 1}</td>
                    <td style={{ padding: '0.4rem', color: '#eceff1', fontWeight: 600 }}>{c.scenario.title}</td>
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
                    <td style={{ padding: '0.4rem', fontWeight: 700, color: '#80cbc4' }}>
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
          className="mode-btn"
          onClick={() => setShowSources(!showSources)}
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
        >
          {showSources ? 'Hide Environmental Dataset Provenance ▲' : 'Inspect Authentic Planetary Data Provenance (MEDA / MCD) ▼'}
        </button>

        {showSources && sources.length > 0 && (
          <div
            style={{
              marginTop: '0.5rem',
              background: '#12171c',
              padding: '0.7rem',
              borderRadius: '4px',
              border: '1px solid #232d34',
              fontSize: '0.8rem',
              color: '#b0bec5',
            }}
          >
            <div style={{ color: '#80cbc4', fontWeight: 600, marginBottom: '0.4rem' }}>
              Official Planetary In-Situ & Modeled Climate Data Sources:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.8rem' }}>
              {sources.map((s) => (
                <div key={s.product_id} style={{ background: '#192026', padding: '0.5rem', borderRadius: '3px' }}>
                  <div style={{ color: '#eceff1', fontWeight: 600 }}>{s.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#90a4ae' }}>Product ID: {s.product_id}</div>
                  <div style={{ fontSize: '0.75rem', color: '#90a4ae' }}>Org: {s.organization}</div>
                  <div style={{ fontSize: '0.75rem', color: '#80cbc4', marginTop: '0.2rem' }}>Coverage: {s.coverage}</div>
                  <div style={{ fontSize: '0.75rem', color: '#ffb74d', marginTop: '0.2rem' }}>
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
