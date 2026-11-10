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
      color: '#e57373',
    },
    {
      name: 'Terrain Roughness Hazard',
      desc: 'TRI elevation variance. High values cause ankle rollover and slow human walking speed.',
      weight: 'Soft Traversal Weight',
      color: '#ffb74d',
    },
    {
      name: 'Rock & Boulder Hazard',
      desc: 'High concentration of meter-scale blocks and fragment clusters.',
      weight: 'Circumvention Weight',
      color: '#ba68c8',
    },
    {
      name: 'Sand / Dune Entrapment',
      desc: 'Loose aeolian bedforms with high slip slope angles and wheel-sinkage risk.',
      weight: 'Friction Drag Weight',
      color: '#ffd54f',
    },
    {
      name: 'Crater / Depression Rim',
      desc: 'Steep inner crater rims and boulder-strewn ejecta blankets.',
      weight: 'Curvature Risk',
      color: '#81c784',
    },
    {
      name: 'Unknown-Data Hazard',
      desc: 'Missing or low-resolution coverage. IMPASSABLE BY DEFAULT per AGENTS.md.',
      weight: 'Binary Hard Barrier',
      color: '#ef5350',
    },
  ]

  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f28c52', fontSize: '1.3rem' }}>
            Hazard Intelligence Engine
          </h2>
          <small style={{ color: '#a89f97' }}>
            Multi-Layer Planetary Surface Hazard Scoring & Hard Traversability Restrictions
          </small>
        </div>
        <span className="badge badge-hazard">0.0 TO 1.0 NORMALIZED SCALE</span>
      </div>

      {/* Six Hazard Layers Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.8rem' }}>
        {hazardLayers.map((h) => (
          <div key={h.name} className="card" style={{ padding: '0.8rem', background: '#161d22', borderLeft: `4px solid ${h.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: '#eceff1', fontSize: '0.9rem' }}>{h.name}</h4>
              <span style={{ fontSize: '0.7rem', color: h.color, fontWeight: 700 }}>{h.weight}</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#b0bec5', margin: '0.4rem 0 0 0' }}>{h.desc}</p>
          </div>
        ))}
      </div>

      {/* Threshold Configuration Box */}
      <div className="card" style={{ marginTop: '1rem', padding: '0.9rem', background: '#171e24' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#ffb74d', fontSize: '0.95rem' }}>
          Configurable Prototype Traversability Thresholds
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#90a4ae', display: 'flex', justifyContent: 'space-between' }}>
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
              style={{ width: '100%', accentColor: '#e57373' }}
            />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#90a4ae', display: 'flex', justifyContent: 'space-between' }}>
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
              style={{ width: '100%', accentColor: '#ffb74d' }}
            />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#90a4ae', display: 'flex', justifyContent: 'space-between' }}>
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
              style={{ width: '100%', accentColor: '#ba68c8' }}
            />
          </div>
        </div>
      </div>

      {/* Location Inspector Query */}
      <div className="card" style={{ marginTop: '1rem', padding: '1rem', background: '#161c22' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#00e5ff', fontSize: '0.95rem' }}>
          Execute Location Hazard Inspection Query
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
            {loading ? 'Evaluating…' : 'Inspect Coordinate Hazard'}
          </button>
        </div>

        {error && (
          <div className="card status-error" style={{ marginTop: '0.6rem', padding: '0.5rem' }}>
            {error}
          </div>
        )}

        {inspection && (
          <div style={{ marginTop: '0.8rem', borderTop: '1px solid #283440', paddingTop: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#eceff1' }}>
                Inspection: {inspection.coordinate.lat.toFixed(5)}°N, {inspection.coordinate.lon.toFixed(5)}°E
              </span>
              <span className={`passability-badge ${inspection.is_passable ? 'passable' : 'impassable'}`}>
                {inspection.is_passable ? 'PASSABLE' : `HARD RESTRICTION (${inspection.hard_restriction_code ?? 'RESTRICTED'})`}
              </span>
            </div>

            <div className="hazard-explanation-box" style={{ marginTop: '0.6rem' }}>
              <strong>Hazard Intelligence Explanation: </strong>
              {inspection.explanation}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

