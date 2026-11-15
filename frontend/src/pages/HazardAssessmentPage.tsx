import React, { useState } from 'react'
import type { LocationHazardInspection } from '../api/hazards'
import { inspectLocationHazard } from '../api/hazards'

export const HazardAssessmentPage: React.FC = () => {
  const [testLat, setTestLat] = useState<number>(18.4485)
  const [testLon, setTestLon] = useState<number>(77.4320)
  const [inspection, setInspection] = useState<LocationHazardInspection | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Configurable prototype risk thresholds
  const [slopeThreshold, setSlopeThreshold] = useState<number>(25.0)
  const [triThreshold, setTriThreshold] = useState<number>(0.45)
  const [boulderThreshold, setBoulderThreshold] = useState<number>(0.7)
  const [selectedOverlay, setSelectedOverlay] = useState<string>('overall')

  const handleInspect = () => {
    setLoading(true)
    setError(null)
    inspectLocationHazard(testLat, testLon)
      .then((res) => {
        setInspection(res)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }

  const hazardLayers = [
    {
      name: 'Slope Hazard',
      desc: 'Normalized steepness risk. Slopes > 25° trigger binary impassable mask.',
      weight: 'Primary Hard Restriction',
      color: '#dc2626',
    },
    {
      name: 'Terrain Roughness Hazard',
      desc: 'TRI elevation variance. High values cause ankle rollover and slow human walking speed.',
      weight: 'Soft Traversal Weight',
      color: '#d4d4d4',
    },
    {
      name: 'Rock & Boulder Hazard',
      desc: 'High concentration of meter-scale blocks and fragment clusters.',
      weight: 'Circumvention Weight',
      color: '#a3a3a3',
    },
    {
      name: 'Sand / Dune Entrapment',
      desc: 'Loose aeolian bedforms with high slip slope angles and wheel-sinkage risk.',
      weight: 'Friction Drag Weight',
      color: '#d4d4d4',
    },
    {
      name: 'Crater / Depression Rim',
      desc: 'Steep inner crater rims and boulder-strewn ejecta blankets.',
      weight: 'Curvature Risk',
      color: '#a3a3a3',
    },
    {
      name: 'Unknown-Data Hazard',
      desc: 'Missing or low-resolution coverage. IMPASSABLE BY DEFAULT per AGENTS.md.',
      weight: 'Binary Hard Barrier',
      color: '#dc2626',
    },
  ]

  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            Hazard Intelligence Engine
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            Multi-Layer Planetary Surface Hazard Scoring & Hard Traversability Restrictions
          </small>
        </div>
        <span className="badge badge-hazard">0.0 TO 1.0 NORMALIZED SCALE</span>
      </div>

      {/* Six Hazard Layers Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.8rem' }}>
        {hazardLayers.map((h) => (
          <div key={h.name} className="card" style={{ padding: '0.8rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)', borderLeft: '3px solid var(--accent-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{h.name}</h4>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{h.weight}</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0 0' }}>{h.desc}</p>
          </div>
        ))}
      </div>

      {/* Threshold Configuration Box */}
      <div className="card" style={{ marginTop: '1rem', padding: '0.9rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          Configurable Prototype Traversability Thresholds
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Hard Slope Limit:</span>
              <strong>{slopeThreshold.toFixed(0)}°</strong>
            </div>
            <input
              type="range"
              min="15"
              max="35"
              step="1"
              value={slopeThreshold}
              onChange={(e) => setSlopeThreshold(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Roughness TRI Caution:</span>
              <strong>{triThreshold.toFixed(2)} m</strong>
            </div>
            <input
              type="range"
              min="0.2"
              max="0.8"
              step="0.05"
              value={triThreshold}
              onChange={(e) => setTriThreshold(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Boulder Obstacle Diameter:</span>
              <strong>{boulderThreshold.toFixed(1)} m</strong>
            </div>
            <input
              type="range"
              min="0.4"
              max="1.5"
              step="0.1"
              value={boulderThreshold}
              onChange={(e) => setBoulderThreshold(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Multi-Dimensional Uncertainty & Hazard Layer Visualizer (M0.3) */}
      <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.8rem' }}>
          <div>
            <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
              Multi-Dimensional Uncertainty & Hazard Surface Visualizer
            </h4>
            <small style={{ color: 'var(--text-secondary)' }}>
              Independently inspectable spatial uncertainty, data confidence, and hazard layers
            </small>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { id: 'overall', label: 'Overall Hazard', url: '/api/v1/hazards/raster/overall.png' },
              { id: 'data_conf', label: 'Data Reliability Index (M0.3)', url: '/api/v1/hazards/raster/data-confidence.png' },
              { id: 'det_conf', label: 'Evidence Reliability Index (M0.3)', url: '/api/v1/hazards/raster/detection-confidence.png' },
              { id: 'spatial_unc', label: 'Nominal Precision Tier (M0.3)', url: '/api/v1/hazards/raster/spatial-uncertainty.png' },
              { id: 'res_unc', label: 'Resolution Uncertainty', url: '/api/v1/hazards/raster/resolution-uncertainty.png' },
            ].map((layer) => (
              <button
                key={layer.id}
                type="button"
                className={`btn-ghost ${selectedOverlay === layer.id ? 'active' : ''}`}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                  border: selectedOverlay === layer.id ? '1px solid var(--text-primary)' : '1px solid var(--border-default)',
                  background: selectedOverlay === layer.id ? 'var(--bg-active)' : 'transparent',
                }}
                onClick={() => setSelectedOverlay(layer.id)}
              >
                {layer.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', width: '100%', maxHeight: '420px', background: '#090d16', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'center' }}>
          <img
            src={
              selectedOverlay === 'data_conf'
                ? '/api/v1/hazards/raster/data-confidence.png'
                : selectedOverlay === 'det_conf'
                ? '/api/v1/hazards/raster/detection-confidence.png'
                : selectedOverlay === 'spatial_unc'
                ? '/api/v1/hazards/raster/spatial-uncertainty.png'
                : selectedOverlay === 'res_unc'
                ? '/api/v1/hazards/raster/resolution-uncertainty.png'
                : '/api/v1/hazards/raster/overall.png'
            }
            alt="Hazard & Uncertainty Layer Visualization"
            style={{ width: '100%', height: 'auto', objectFit: 'contain', maxHeight: '420px' }}
          />
          <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0, 0, 0, 0.78)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', color: '#e2e8f0', border: '1px solid #334155' }}>
            {selectedOverlay === 'data_conf' && 'Data Reliability Index [0-1 Ordinal]: Cyan (≥0.90) | Sky Teal (0.70-0.90) | Amber (0.45-0.70) | Crimson (<0.45) | Dark Slate = Unmapped NoData'}
            {selectedOverlay === 'det_conf' && 'Evidence Reliability Index [0-1 Ordinal]: Cyan (≥0.90) | Sky Teal (0.70-0.90) | Amber (0.45-0.70) | Crimson (<0.45) | Dark Slate = Unmapped NoData'}
            {selectedOverlay === 'spatial_unc' && 'Provisional Nominal Precision Tier (Not ±1σ): Steel Blue = 0.20 m (HiRISE) | Orange = 2.00 m (CTX) | Magenta = NoData'}
            {selectedOverlay === 'res_unc' && 'Resolution Uncertainty: Amber = Unresolved Metre-Scale Hazards (CTX 20m Only)'}
            {selectedOverlay === 'overall' && 'Composite Risk: Green = Low Risk | Red = High Risk | Magenta = Impassable Hard Constraint'}
          </div>
        </div>
      </div>

      {/* Location Inspector Query */}
      <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          Execute Location Hazard & Uncertainty Inspection Query
        </h4>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="route-coord-input">
            <span>Lat:</span>
            <input
              type="number"
              step="0.0001"
              value={testLat}
              onChange={(e) => setTestLat(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="route-coord-input">
            <span>Lon:</span>
            <input
              type="number"
              step="0.0001"
              value={testLon}
              onChange={(e) => setTestLon(parseFloat(e.target.value) || 0)}
            />
          </div>
          <button type="button" className="btn-primary" onClick={handleInspect} disabled={loading}>
            {loading ? 'Evaluating…' : 'Inspect Coordinate Hazard & Uncertainty'}
          </button>
        </div>

        {error && (
          <div className="card status-error" style={{ marginTop: '0.6rem', padding: '0.5rem' }}>
            {error}
          </div>
        )}

        {inspection && (
          <div style={{ marginTop: '0.8rem', borderTop: '1px solid var(--border-default)', paddingTop: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Target: {inspection.coordinate.lat.toFixed(5)}°N, {inspection.coordinate.lon.toFixed(5)}°E
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className={`passability-badge ${inspection.is_passable ? 'passable' : 'impassable'}`}>
                  {inspection.is_passable ? 'PASSABLE' : `HARD RESTRICTION (${inspection.hard_restriction_code ?? 'RESTRICTED'})`}
                </span>
                <span className="badge" style={{ fontSize: '0.7rem' }}>
                  {inspection.epistemic_class ?? 'UNKNOWN'}
                </span>
              </div>
            </div>

            {/* M0.3.2 Multi-Dimensional Reliability & Provisional Nominal Precision Display */}
            {(() => {
              const dataRel = inspection.data_reliability_index ?? inspection.data_confidence
              const detRel = inspection.detection_reliability_index ?? inspection.detection_confidence
              const nomPrec = inspection.nominal_vertical_precision_m ?? inspection.spatial_uncertainty_m
              const dataLvl = inspection.data_reliability_level ?? inspection.data_confidence_level ?? 'NONE'
              const detLvl = inspection.detection_reliability_level ?? inspection.detection_confidence_level ?? 'NONE'
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '0.6rem', marginTop: '0.8rem' }}>
                  <div className="hazard-stat-box" style={{ background: 'var(--bg-canvas)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>DATA RELIABILITY INDEX</span>
                    <strong style={{ fontSize: '1.05rem', color: dataRel !== null && dataRel !== undefined && dataRel >= 0.85 ? '#22d3ee' : '#f59e0b' }}>
                      {dataRel !== null && dataRel !== undefined ? `${dataRel.toFixed(3)} [0–1]` : 'N/A (UNMAPPED)'}
                    </strong>
                    <small style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                      Ordinal Tier: {dataLvl} ({inspection.epistemic_source ?? 'Unknown'}) — Uncalibrated
                    </small>
                  </div>

                  <div className="hazard-stat-box" style={{ background: 'var(--bg-canvas)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>EVIDENCE RELIABILITY INDEX</span>
                    <strong style={{ fontSize: '1.05rem', color: detRel !== null && detRel !== undefined && detRel >= 0.70 ? '#38bdf8' : '#f59e0b' }}>
                      {detRel !== null && detRel !== undefined ? `${detRel.toFixed(3)} [0–1]` : 'N/A (UNMAPPED)'}
                    </strong>
                    <small style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                      Ordinal Tier: {detLvl} (Hazard-Independent)
                    </small>
                  </div>

                  <div className="hazard-stat-box" style={{ background: 'var(--bg-canvas)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>NOMINAL PRECISION TIER</span>
                    <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                      {nomPrec !== null && nomPrec !== undefined ? `${nomPrec.toFixed(2)} m nominal` : 'N/A (UNMAPPED)'}
                    </strong>
                    <small style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                      Unverified relative tier (not ±1σ) | {inspection.resolution_class ?? 'UNMAPPED'}
                    </small>
                  </div>

                  <div className="hazard-stat-box" style={{ background: 'var(--bg-canvas)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>OVERALL RISK SCORE</span>
                    <strong style={{ fontSize: '1.05rem', color: inspection.is_passable ? '#38bdf8' : '#ef4444' }}>
                      {inspection.overall_hazard_score !== undefined ? `${(inspection.overall_hazard_score * 100).toFixed(1)}%` : 'N/A'}
                    </strong>
                    <small style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                      Elevation: {inspection.elevation_m !== undefined && inspection.elevation_m !== null ? `${inspection.elevation_m.toFixed(1)} m` : 'N/A'}
                    </small>
                  </div>
                </div>
              )
            })()}

            {inspection.evidence_dimensions && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem', marginTop: '0.6rem' }}>
                <div className="hazard-stat-box">
                  <span style={{ fontSize: '0.65rem' }}>DTM DERIVATIVE REL (R_geom)</span>
                  <strong style={{ fontSize: '0.85rem' }}>
                    {inspection.evidence_dimensions.terrain_derivative_reliability !== null &&
                    inspection.evidence_dimensions.terrain_derivative_reliability !== undefined
                      ? inspection.evidence_dimensions.terrain_derivative_reliability.toFixed(2)
                      : 'N/A'}
                  </strong>
                </div>
                <div className="hazard-stat-box">
                  <span style={{ fontSize: '0.65rem' }}>CV OPTICAL REL (R_opt, 20m CTX)</span>
                  <strong style={{ fontSize: '0.85rem' }}>
                    {inspection.evidence_dimensions.optical_imagery_reliability !== null &&
                    inspection.evidence_dimensions.optical_imagery_reliability !== undefined
                      ? inspection.evidence_dimensions.optical_imagery_reliability.toFixed(2)
                      : 'N/A'}
                  </strong>
                </div>
                <div className="hazard-stat-box">
                  <span style={{ fontSize: '0.65rem' }}>RESOLUTION ADEQUACY (R_res)</span>
                  <strong style={{ fontSize: '0.85rem' }}>
                    {inspection.evidence_dimensions.spatial_resolution_adequacy !== null &&
                    inspection.evidence_dimensions.spatial_resolution_adequacy !== undefined
                      ? inspection.evidence_dimensions.spatial_resolution_adequacy.toFixed(2)
                      : 'N/A'}
                  </strong>
                </div>
              </div>
            )}

            {/* Individual Hazard Factors */}
            {inspection.individual_hazards && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', marginTop: '0.6rem' }}>
                <div className="hazard-stat-box">
                  <span style={{ fontSize: '0.65rem' }}>SLOPE</span>
                  <strong style={{ fontSize: '0.85rem' }}>{(inspection.individual_hazards.slope_hazard * 100).toFixed(0)}%</strong>
                </div>
                <div className="hazard-stat-box">
                  <span style={{ fontSize: '0.65rem' }}>ROUGHNESS (TRI)</span>
                  <strong style={{ fontSize: '0.85rem' }}>{(inspection.individual_hazards.roughness_hazard * 100).toFixed(0)}%</strong>
                </div>
                <div className="hazard-stat-box">
                  <span style={{ fontSize: '0.65rem' }}>BOULDERS</span>
                  <strong style={{ fontSize: '0.85rem' }}>{(inspection.individual_hazards.boulder_hazard * 100).toFixed(0)}%</strong>
                </div>
                <div className="hazard-stat-box">
                  <span style={{ fontSize: '0.65rem' }}>SAND / DUNE</span>
                  <strong style={{ fontSize: '0.85rem' }}>{(inspection.individual_hazards.sand_hazard * 100).toFixed(0)}%</strong>
                </div>
                <div className="hazard-stat-box">
                  <span style={{ fontSize: '0.65rem' }}>CRATER RIM</span>
                  <strong style={{ fontSize: '0.85rem' }}>{(inspection.individual_hazards.crater_hazard * 100).toFixed(0)}%</strong>
                </div>
              </div>
            )}

            <div className="hazard-explanation-box" style={{ marginTop: '0.6rem' }}>
              <strong>Hazard Intelligence Explanation: </strong>
              {inspection.explanation}
            </div>

            {inspection.uncertainty_profile?.reasoning && (
              <div className="hazard-explanation-box" style={{ marginTop: '0.4rem', borderLeftColor: '#38bdf8' }}>
                <strong>Uncertainty Model Diagnostics: </strong>
                {inspection.uncertainty_profile.reasoning}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

