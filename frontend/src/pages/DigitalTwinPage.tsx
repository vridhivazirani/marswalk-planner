import React, { useState } from 'react'
import { MarsMap2D } from '../components/MarsMap2D'
import { MarsMap3D } from '../components/MarsMap3D'
import type { DigitalTwinLayersResponse } from '../api/twin'
import type { RouteFeature } from '../api/routing'
import type { DynamicReroutePlanDTO } from '../api/emergency'
import type { CandidateTargetFeature } from '../api/science'
import type { LocationHazardInspection } from '../api/hazards'
import type { CostmapInspectionResponse } from '../api/costmap'

interface DigitalTwinPageProps {
  layersMeta: DigitalTwinLayersResponse | null
  activeLayers: Record<string, boolean>
  routes: RouteFeature[]
  emergencyPlan: DynamicReroutePlanDTO | null
  onLayerToggle: (layerId: string) => void
  onSelectCoords: (coords: { lat: number; lon: number }) => void
  onSelectTarget: (target: CandidateTargetFeature) => void
  selectedHazard: LocationHazardInspection | null
  selectedCost: CostmapInspectionResponse | null
  selectedTarget: CandidateTargetFeature | null
  isInspecting: boolean
}

export const DigitalTwinPage: React.FC<DigitalTwinPageProps> = ({
  layersMeta,
  activeLayers,
  routes,
  emergencyPlan,
  onLayerToggle,
  onSelectCoords,
  onSelectTarget,
  selectedHazard,
  selectedCost,
  selectedTarget,
  isInspecting,
}) => {
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D')
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lon: number } | null>(null)

  if (!layersMeta) {
    return (
      <div className="page-container">
        <div className="card">Loading Mars Digital Twin geospatial layers from backend…</div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* View Mode & Map Header */}
      <div className="twin-header" style={{ marginBottom: '0.8rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            Jezero Crater Planetary Digital Twin
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            Authentic USGS TRN HiRISE DTM (1.0m fused to 20m) & CTX Mosaic (6m) • Mars Equirectangular IAU_2015:49900
          </small>
        </div>

        <div className="view-mode-selector">
          <button
            type="button"
            className={`mode-btn ${viewMode === '2D' ? 'active' : ''}`}
            onClick={() => setViewMode('2D')}
          >
            2D Orthorectified Map
          </button>
          <button
            type="button"
            className={`mode-btn ${viewMode === '3D' ? 'active' : ''}`}
            onClick={() => setViewMode('3D')}
          >
            3D Elevation Surface (Three.js)
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      {viewMode === '2D' ? (
        <MarsMap2D
          metadata={layersMeta}
          activeLayers={activeLayers}
          routes={routes}
          emergencyPlan={emergencyPlan}
          onLayerToggle={onLayerToggle}
          onHoverCoords={setHoverCoords}
          onSelectCoords={onSelectCoords}
          onSelectTarget={onSelectTarget}
        />
      ) : (
        <MarsMap3D metadata={layersMeta} />
      )}

      {/* Live Coordinate & Telemetry Bar */}
      <footer className="telemetry-bar" style={{ marginTop: '0.6rem' }}>
        <div className="telemetry-item">
          <span className="telemetry-label">Cursor Mars Lat/Lon:</span>{' '}
          {hoverCoords ? (
            <span className="telemetry-val">
              {hoverCoords.lat.toFixed(5)}°N, {hoverCoords.lon.toFixed(5)}°E
            </span>
          ) : (
            'Inspect surface…'
          )}
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">CRS:</span> IAU_2015:49900 (Sphere R=3,396,190m)
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Vertical Reference:</span> Mars Areoid (MOLA Zero)
        </div>
      </footer>

      {/* Surface Inspection Drawer */}
      {isInspecting && (
        <div className="card" style={{ marginTop: '0.8rem', padding: '0.6rem' }}>
          Querying Mars intelligence engines for surface coordinate…
        </div>
      )}

      {selectedTarget && (
        <div className="card science-target-card" style={{ marginTop: '0.8rem', borderLeft: '3px solid var(--accent-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
              Selected Science Target #{selectedTarget.properties.rank}: {selectedTarget.properties.name}
            </h3>
            <span className="badge-target-rank">
              SCORE: {(selectedTarget.properties.composite_score * 100).toFixed(0)}%
            </span>
          </div>
          <p style={{ margin: '0.4rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {selectedTarget.properties.rationale}
          </p>
        </div>
      )}

      {selectedHazard && (
        <div className="card hazard-inspector" style={{ marginTop: '0.8rem' }}>
          <div className="hazard-inspector-header">
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Surface Intelligence Query: {selectedHazard.coordinate.lat.toFixed(5)}°N,{' '}
                {selectedHazard.coordinate.lon.toFixed(5)}°E
              </h3>
              <small style={{ color: 'var(--text-secondary)' }}>
                Source: {selectedHazard.epistemic_source ?? 'HiRISE DTM 1.0m'} | Epistemic: OBSERVED & DERIVED
              </small>
            </div>
            <div>
              <span
                className={`passability-badge ${
                  selectedHazard.is_passable ? 'passable' : 'impassable'
                }`}
              >
                {selectedHazard.is_passable
                  ? 'PASSABLE TERRAIN'
                  : `IMPASSABLE (${selectedHazard.hard_restriction_code ?? 'RESTRICTED'})`}
              </span>
            </div>
          </div>

          <div className="hazard-breakdown-grid" style={{ marginTop: '0.6rem' }}>
            <div className="hazard-stat-box">
              <div className="stat-label">Overall Hazard</div>
              <div
                className="stat-value"
                style={{ color: selectedHazard.is_passable ? 'var(--text-primary)' : 'var(--status-critical)' }}
              >
                {selectedHazard.overall_hazard_score !== undefined
                  ? `${(selectedHazard.overall_hazard_score * 100).toFixed(1)}%`
                  : 'N/A'}
              </div>
            </div>
            <div className="hazard-stat-box">
              <div className="stat-label">Elevation</div>
              <div className="stat-value">
                {selectedHazard.elevation_m !== null && selectedHazard.elevation_m !== undefined
                  ? `${selectedHazard.elevation_m.toFixed(1)} m`
                  : 'N/A'}
              </div>
            </div>
            {selectedHazard.individual_hazards && (
              <>
                <div className="hazard-stat-box">
                  <div className="stat-label">Slope Hazard</div>
                  <div className="stat-value">
                    {(selectedHazard.individual_hazards.slope_hazard * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="hazard-stat-box">
                  <div className="stat-label">Roughness TRI</div>
                  <div className="stat-value">
                    {(selectedHazard.individual_hazards.roughness_hazard * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="hazard-stat-box">
                  <div className="stat-label">Rock / Boulder</div>
                  <div className="stat-value">
                    {(selectedHazard.individual_hazards.boulder_hazard * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="hazard-stat-box">
                  <div className="stat-label">Sand / Dune</div>
                  <div className="stat-value">
                    {(selectedHazard.individual_hazards.sand_hazard * 100).toFixed(0)}%
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="hazard-explanation-box" style={{ marginTop: '0.6rem' }}>
            <strong>Intelligence Rationale: </strong>
            {selectedHazard.explanation}
          </div>
        </div>
      )}

      {selectedCost && (
        <div className="card hazard-inspector" style={{ marginTop: '0.8rem', borderColor: 'var(--border-default)' }}>
          <div className="hazard-inspector-header">
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Unified Cost Map Analysis [{selectedCost.mission_profile}]
              </h3>
              <small style={{ color: 'var(--text-secondary)' }}>
                Coord: {selectedCost.coordinate.lat.toFixed(5)}°N, {selectedCost.coordinate.lon.toFixed(5)}°E
              </small>
            </div>
            <div>
              <span
                className={`passability-badge ${
                  selectedCost.is_blocked ? 'impassable' : 'passable'
                }`}
                style={{ background: selectedCost.is_blocked ? '#2a0808' : 'var(--bg-panel-elevated)' }}
              >
                {selectedCost.is_blocked
                  ? 'HARD BLOCKED'
                  : `PASSABLE (COST MULTIPLIER: ${selectedCost.combined_cost?.toFixed(2)}x)`}
              </span>
            </div>
          </div>
          <div className="hazard-explanation-box" style={{ borderLeftColor: 'var(--accent-secondary)', marginTop: '0.6rem' }}>
            <strong>Cost Evaluation: </strong>
            {selectedCost.explanation}
          </div>
        </div>
      )}
    </div>
  )
}
