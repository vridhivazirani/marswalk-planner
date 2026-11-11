import React, { useState } from 'react'
import type { LocationHazardInspection } from '../api/hazards'
import { inspectLocationHazard } from '../api/hazards'

interface TerrainIntelligencePageProps {
  onSelectCoords?: (coords: { lat: number; lon: number }) => void
}

export const TerrainIntelligencePage: React.FC<TerrainIntelligencePageProps> = () => {
  const [queryLat, setQueryLat] = useState<number>(18.4485)
  const [queryLon, setQueryLon] = useState<number>(77.4320)
  const [inspection, setInspection] = useState<LocationHazardInspection | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const handleInspect = () => {
    setLoading(true)
    setError(null)
    inspectLocationHazard(queryLat, queryLon)
      .then((data) => {
        setInspection(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }

  const terrainMetrics = [
    {
      name: 'Slope Calculation',
      method: 'Horn gradient algorithm on 1.0m HiRISE DTM',
      epistemic: 'DERIVED',
      status: 'Active',
      description: 'Calculates true surface normal gradient in degrees. Slopes > 25° marked as hard impassable barriers.',
      range: '0° to 38.5° in Jezero western scarp',
    },
    {
      name: 'Terrain Ruggedness Index (TRI)',
      method: 'Riley TRI (3x3 window root-mean-square elevation difference)',
      epistemic: 'DERIVED',
      status: 'Active',
      description: 'Quantifies micro-topographic roughness and footstep stability. TRI > 0.45m indicates high ankle rollover risk.',
      range: '0.02m (smooth lakebed) to 1.85m (boulder scree)',
    },
    {
      name: 'Rock & Boulder Candidate Detection',
      method: 'HiRISE 0.25m ORI shadow length & top-hat morphological filtering',
      epistemic: 'DERIVED',
      status: 'Active',
      description: 'Extracts meter-scale blocks and fragment clusters. Boulders > 0.7m flagged for traversal circumvention.',
      range: '0 to 45 blocks per 20m grid cell',
    },
    {
      name: 'Sand & Transverse Aeolian Dunes',
      method: 'Spectral variance & Gabor ripple frequency texture analysis',
      epistemic: 'DERIVED',
      status: 'Active',
      description: 'Identifies active sand ripples, dust accumulation, and wheel-sinkage zones. Incurs high metabolic walking drag.',
      range: 'High slip hazard in southern channel bed',
    },
    {
      name: 'Crater & Depression Detection',
      method: 'Hough transform & local negative curvature extraction',
      epistemic: 'DERIVED',
      status: 'Active',
      description: 'Detects impact craters with steep inner rims and ejecta blanket boulder rings.',
      range: 'Diameter 3m to 2.4 km in Jezero floor',
    },
    {
      name: 'Unknown / Impassable Masking',
      method: 'Strict NoData & out-of-coverage boundary tagging',
      epistemic: 'UNKNOWN',
      status: 'Enforced',
      description: 'AGENTS.md Rule 7: Unknown terrain is never assumed safe. Missing elevation data is impassable by default.',
      range: 'Impassable by default',
    },
  ]

  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            Terrain Intelligence Engine
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            Explainable Computer Vision & Geospatial Geomorphology Metrics • Native 1.0m HiRISE Grid
          </small>
        </div>
        <span className="badge badge-derived">EPISTEMIC: DERIVED & HEURISTIC</span>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.9rem' }}>
        {terrainMetrics.map((m) => (
          <div key={m.name} className="card" style={{ padding: '0.9rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{m.name}</h4>
              <span className="badge badge-derived">{m.epistemic}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-secondary)', marginTop: '0.3rem' }}>
              Method: {m.method}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.4rem 0' }}>
              {m.description}
            </p>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <strong>Observed Range: </strong>{m.range}
            </div>
          </div>
        ))}
      </div>

      {/* Interactive Terrain Query Inspector */}
      <div className="card" style={{ marginTop: '1.2rem', padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
        <h3 style={{ margin: '0 0 0.6rem 0', color: 'var(--text-primary)', fontSize: '1.05rem' }}>
          Interactive Terrain Intelligence Coordinate Inspector
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.8rem 0' }}>
          Query any planetary coordinate within the Jezero study footprint to inspect slope, roughness TRI, rock density, and elevation datum.
        </p>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="route-coord-input">
            <span>Lat:</span>
            <input
              type="number"
              step="0.0001"
              value={queryLat}
              onChange={(e) => setQueryLat(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="route-coord-input">
            <span>Lon:</span>
            <input
              type="number"
              step="0.0001"
              value={queryLon}
              onChange={(e) => setQueryLon(parseFloat(e.target.value) || 0)}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={handleInspect}
            disabled={loading}
          >
            {loading ? 'Analyzing Terrain…' : 'Inspect Terrain Cell'}
          </button>
        </div>

        {error && (
          <div className="card status-error" style={{ marginTop: '0.6rem', padding: '0.5rem' }}>
            {error}
          </div>
        )}

        {inspection && (
          <div style={{ marginTop: '0.8rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Query Result: {inspection.coordinate.lat.toFixed(5)}°N, {inspection.coordinate.lon.toFixed(5)}°E
              </span>
              <span className={`passability-badge ${inspection.is_passable ? 'passable' : 'impassable'}`}>
                {inspection.is_passable ? 'PASSABLE' : `HARD RESTRICTION (${inspection.hard_restriction_code ?? 'BLOCKED'})`}
              </span>
            </div>

            <div className="hazard-breakdown-grid" style={{ marginTop: '0.6rem' }}>
              <div className="hazard-stat-box">
                <div className="stat-label">Elevation (Areoid)</div>
                <div className="stat-value">{inspection.elevation_m?.toFixed(1) ?? 'N/A'} m</div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Overall Hazard Score</div>
                <div className="stat-value" style={{ color: inspection.is_passable ? 'var(--text-primary)' : 'var(--status-critical)' }}>
                  {inspection.overall_hazard_score ? `${(inspection.overall_hazard_score * 100).toFixed(1)}%` : 'N/A'}
                </div>
              </div>
              {inspection.individual_hazards && (
                <>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Slope Hazard</div>
                    <div className="stat-value">{(inspection.individual_hazards.slope_hazard * 100).toFixed(0)}%</div>
                  </div>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Roughness TRI</div>
                    <div className="stat-value">{(inspection.individual_hazards.roughness_hazard * 100).toFixed(0)}%</div>
                  </div>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Boulder Hazard</div>
                    <div className="stat-value">{(inspection.individual_hazards.boulder_hazard * 100).toFixed(0)}%</div>
                  </div>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Sand Dune Slip</div>
                    <div className="stat-value">{(inspection.individual_hazards.sand_hazard * 100).toFixed(0)}%</div>
                  </div>
                </>
              )}
            </div>

            <div className="hazard-explanation-box" style={{ marginTop: '0.6rem' }}>
              <strong>Heuristic Classification Rationale: </strong>
              {inspection.explanation}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

