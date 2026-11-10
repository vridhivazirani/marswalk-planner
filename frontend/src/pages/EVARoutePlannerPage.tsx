import React, { useState } from 'react'
import type { RouteFeature } from '../api/routing'
import { planRoute, planRouteSuite } from '../api/routing'
import type { CostmapWeightsDTO } from '../api/costmap'

interface EVARoutePlannerPageProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  onUpdateCoordinates: (start: { lat: number; lon: number }, dest: { lat: number; lon: number }) => void
  activeProfile: string
  onSelectProfile: (prof: string) => void
  weights: CostmapWeightsDTO
  onWeightChange: (key: keyof CostmapWeightsDTO, val: number) => void
  routes: RouteFeature[]
  onRoutesCalculated: (routes: RouteFeature[]) => void
}

export const EVARoutePlannerPage: React.FC<EVARoutePlannerPageProps> = ({
  startPoint,
  destPoint,
  onUpdateCoordinates,
  activeProfile,
  onSelectProfile,
  weights,
  onWeightChange,
  routes,
  onRoutesCalculated,
}) => {
  const [isPlanning, setIsPlanning] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [showWeights, setShowWeights] = useState<boolean>(false)

  const handlePlanSingle = () => {
    setIsPlanning(true)
    setError(null)
    planRoute(startPoint, destPoint, activeProfile)
      .then((feature) => {
        onRoutesCalculated([feature])
        setIsPlanning(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setIsPlanning(false)
      })
  }

  const handlePlanSuite = () => {
    setIsPlanning(true)
    setError(null)
    planRouteSuite(startPoint, destPoint)
      .then((featCol) => {
        onRoutesCalculated(featCol.features)
        setIsPlanning(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setIsPlanning(false)
      })
  }

  const activeRoute = routes.length > 0 ? routes[0] : null

  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f28c52', fontSize: '1.3rem' }}>
            EVA Route Optimization Engine
          </h2>
          <small style={{ color: '#a89f97' }}>
            A* & Dijkstra Constraint-Satisfying Traversal • 8-Directional Kinematic Graph Search
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePlanSingle}
            disabled={isPlanning}
          >
            {isPlanning ? 'Calculating…' : `Plan ${activeProfile.replace('_', ' ')} Route`}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handlePlanSuite}
            disabled={isPlanning}
          >
            Plan Comparative Suite (3 Profiles)
          </button>
        </div>
      </div>

      {error && <div className="card status-error" style={{ marginBottom: '0.8rem' }}>{error}</div>}

      {/* Coordinate & Profile Controls */}
      <div className="card" style={{ padding: '1rem', background: '#161c22', marginBottom: '1rem' }}>
        <h4 style={{ margin: '0 0 0.6rem 0', color: '#00e5ff', fontSize: '0.95rem' }}>
          Mission Coordinates & Profile Selection
        </h4>

        <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="route-coord-input">
            <strong>Base Camp: </strong>
            <span>Lat:</span>
            <input
              type="number"
              step="0.0001"
              value={startPoint.lat}
              onChange={(e) =>
                onUpdateCoordinates(
                  { ...startPoint, lat: parseFloat(e.target.value) || 0 },
                  destPoint,
                )
              }
            />
            <span>Lon:</span>
            <input
              type="number"
              step="0.0001"
              value={startPoint.lon}
              onChange={(e) =>
                onUpdateCoordinates(
                  { ...startPoint, lon: parseFloat(e.target.value) || 0 },
                  destPoint,
                )
              }
            />
          </div>

          <div className="route-coord-input">
            <strong>Sortie Destination: </strong>
            <span>Lat:</span>
            <input
              type="number"
              step="0.0001"
              value={destPoint.lat}
              onChange={(e) =>
                onUpdateCoordinates(startPoint, {
                  ...destPoint,
                  lat: parseFloat(e.target.value) || 0,
                })
              }
            />
            <span>Lon:</span>
            <input
              type="number"
              step="0.0001"
              value={destPoint.lon}
              onChange={(e) =>
                onUpdateCoordinates(startPoint, {
                  ...destPoint,
                  lon: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>

          {/* Profile Select Buttons */}
          <div className="profile-button-group">
            {['SAFETY_FIRST', 'SCIENCE_FIRST', 'BALANCED', 'CUSTOM'].map((prof) => (
              <button
                key={prof}
                type="button"
                className={`profile-pill-btn ${activeProfile === prof ? 'active' : ''}`}
                onClick={() => onSelectProfile(prof)}
              >
                {prof.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mode-btn"
            onClick={() => setShowWeights(!showWeights)}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          >
            {showWeights ? 'Hide Weight Sliders ▲' : 'Tune Cost Weights ▼'}
          </button>
        </div>

        {/* Custom Costmap Weight Sliders */}
        {showWeights && (
          <div
            style={{
              marginTop: '0.8rem',
              padding: '0.8rem',
              background: '#12171c',
              borderRadius: '4px',
              border: '1px dashed #37474f',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.8rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: '#ffb74d', display: 'flex', justifyContent: 'space-between' }}>
                <span>Terrain Difficulty:</span>
                <strong>{weights.w_terrain.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={weights.w_terrain}
                onChange={(e) => onWeightChange('w_terrain', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#ffb74d' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#e57373', display: 'flex', justifyContent: 'space-between' }}>
                <span>Environmental Hazard:</span>
                <strong>{weights.w_hazard.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={weights.w_hazard}
                onChange={(e) => onWeightChange('w_hazard', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#e57373' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#ba68c8', display: 'flex', justifyContent: 'space-between' }}>
                <span>Topographic Uncertainty:</span>
                <strong>{weights.w_uncertainty.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.05"
                value={weights.w_uncertainty}
                onChange={(e) => onWeightChange('w_uncertainty', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#ba68c8' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#81c784', display: 'flex', justifyContent: 'space-between' }}>
                <span>Science Opportunity Yield:</span>
                <strong>{weights.w_science.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={weights.w_science}
                onChange={(e) => onWeightChange('w_science', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#81c784' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Calculated Route Telemetry Display */}
      {activeRoute ? (
        <div className="card" style={{ padding: '1rem', background: '#161c22' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #283440', paddingBottom: '0.6rem' }}>
            <div>
              <h3 style={{ margin: 0, color: '#eceff1', fontSize: '1.15rem' }}>
                Plan Generated: {activeRoute.properties.route_id}
              </h3>
              <small style={{ color: '#90a4ae' }}>
                Algorithm: {activeRoute.properties.algorithm.toUpperCase()} • Simplified: {activeRoute.properties.is_simplified ? 'Yes' : 'No'}
              </small>
            </div>
            <span className="badge badge-passable">ZERO RESTRICTED CELLS CROSSED</span>
          </div>

          <div className="hazard-breakdown-grid" style={{ marginTop: '0.8rem' }}>
            <div className="hazard-stat-box">
              <div className="stat-label">Total Traverse Length</div>
              <div className="stat-value" style={{ color: '#00e5ff' }}>
                {(activeRoute.properties.metrics.total_distance_m / 1000).toFixed(2)} km
              </div>
              <small style={{ color: '#90a4ae' }}>{activeRoute.properties.metrics.total_distance_m.toFixed(0)} meters</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Estimated Walking Time</div>
              <div className="stat-value" style={{ color: '#ffd700' }}>
                {activeRoute.properties.metrics.estimated_duration_minutes.toFixed(0)} min
              </div>
              <small style={{ color: '#90a4ae' }}>v0 = 1.0 m/s terrain-adjusted</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Accumulated Path Cost</div>
              <div className="stat-value" style={{ color: '#ffb74d' }}>
                {activeRoute.properties.metrics.accumulated_cost.toFixed(1)}
              </div>
              <small style={{ color: '#90a4ae' }}>Cost-weighted integral</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Mean Risk Exposure</div>
              <div className="stat-value" style={{ color: '#81c784' }}>
                {(activeRoute.properties.metrics.mean_hazard_exposure * 100).toFixed(1)}%
              </div>
              <small style={{ color: '#90a4ae' }}>0 to 1 normalized risk</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Mean Topo Uncertainty</div>
              <div className="stat-value" style={{ color: '#ba68c8' }}>
                {activeRoute.properties.metrics.mean_uncertainty_exposure.toFixed(2)} m
              </div>
              <small style={{ color: '#90a4ae' }}>Elevation sigma_z</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Science Return Yield</div>
              <div className="stat-value" style={{ color: '#64b5f6' }}>
                {activeRoute.properties.metrics.accumulated_science_opportunity.toFixed(1)}
              </div>
              <small style={{ color: '#90a4ae' }}>Total outcrop score</small>
            </div>
          </div>

          <div className="notice-warning" style={{ marginTop: '0.8rem' }}>
            {activeRoute.properties.disclaimer}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: '#90a4ae' }}>
          <p>No traversal route currently active. Click &quot;Plan Route&quot; above to compute optimal waypoints.</p>
        </div>
      )}
    </div>
  )
}
