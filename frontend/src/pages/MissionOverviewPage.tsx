import React from 'react'
import type { RouteFeature } from '../api/routing'
import type { DynamicReroutePlanDTO } from '../api/emergency'
import type { PageId } from '../components/layout/NavigationSidebar'

interface MissionOverviewPageProps {
  onNavigate: (page: PageId) => void
  activeRoute: RouteFeature | null
  emergencyPlan: DynamicReroutePlanDTO | null
  routesCount: number
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
}

export const MissionOverviewPage: React.FC<MissionOverviewPageProps> = ({
  onNavigate,
  activeRoute,
  emergencyPlan,
  routesCount,
  startPoint,
  destPoint,
}) => {
  return (
    <div className="page-container">
      {/* Welcome Banner */}
      <div className="overview-hero card">
        <div className="hero-content">
          <div className="hero-badge">OPERATIONAL DECISION-SUPPORT PROTOTYPE</div>
          <h1 className="hero-title">Marswalk Mission Control</h1>
          <p className="hero-desc">
            High-fidelity decision support for hypothetical human extravehicular activities (EVAs)
            across the Western Fan and Delta deposits of Jezero Crater, Mars.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => onNavigate('digital-twin')}
            >
              🪐 Launch Mars Digital Twin
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onNavigate('route-planner')}
            >
              🧭 Plan EVA Traversal
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onNavigate('science')}
            >
              🔬 Explore Science Targets
            </button>
            <button
              type="button"
              className="btn-alert"
              onClick={() => onNavigate('emergency')}
            >
              ⚠️ Emergency Operations
            </button>
          </div>
        </div>
        <div className="hero-metrics-sidebar">
          <div className="metric-box">
            <span className="metric-label">STUDY FOOTPRINT</span>
            <span className="metric-value">Jezero Delta</span>
            <span className="metric-sub">18.44°N, 77.45°E</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">MARS AREOID DATUM</span>
            <span className="metric-value">-2,540 m</span>
            <span className="metric-sub">Mean Crater Floor</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">ROVER GROUND TRUTH</span>
            <span className="metric-value">Perseverance</span>
            <span className="metric-sub">Sols 1–1000+ In-Situ</span>
          </div>
        </div>
      </div>

      {/* Grid of Key Mission Modules */}
      <div className="overview-cards-grid">
        {/* Active Sortie Telemetry */}
        <div className="card overview-card">
          <div className="card-header">
            <h3>Active Sortie Telemetry ({routesCount} Planned)</h3>
            <span className={`badge ${activeRoute ? 'badge-active' : 'badge-standby'}`}>
              {activeRoute ? 'ACTIVE TRAVERSE' : 'STANDBY'}
            </span>
          </div>
          {activeRoute ? (
            <div className="overview-stats-grid">
              <div className="stat-unit">
                <span className="stat-unit-label">Distance</span>
                <span className="stat-unit-val" style={{ color: 'var(--text-primary)' }}>
                  {(activeRoute.properties.metrics.total_distance_m / 1000).toFixed(2)} km
                </span>
              </div>
              <div className="stat-unit">
                <span className="stat-unit-label">Walking Time</span>
                <span className="stat-unit-val" style={{ color: 'var(--text-primary)' }}>
                  {activeRoute.properties.metrics.estimated_duration_minutes.toFixed(0)} min
                </span>
              </div>
              <div className="stat-unit">
                <span className="stat-unit-label">Mean Risk</span>
                <span className="stat-unit-val" style={{ color: 'var(--text-secondary)' }}>
                  {(activeRoute.properties.metrics.mean_hazard_exposure * 100).toFixed(1)}%
                </span>
              </div>
              <div className="stat-unit">
                <span className="stat-unit-label">Science Return</span>
                <span className="stat-unit-val" style={{ color: 'var(--accent-secondary)' }}>
                  {activeRoute.properties.metrics.accumulated_science_opportunity.toFixed(1)}
                </span>
              </div>
            </div>
          ) : (
            <p className="empty-hint">
              No route currently calculated. Use the EVA Route Planner to generate safety-first,
              science-first, or balanced traverses.
            </p>
          )}
          <div className="card-footer-action">
            <button
              type="button"
              className="mode-btn"
              onClick={() => onNavigate('route-planner')}
            >
              Open Route Planner →
            </button>
          </div>
        </div>

        {/* Emergency Contingency Status */}
        <div className="card overview-card" style={{ borderLeft: '3px solid var(--status-critical)' }}>
          <div className="card-header">
            <h3>Emergency Operations Status</h3>
            <span className={`badge ${emergencyPlan ? 'badge-alert' : 'badge-standby'}`}>
              {emergencyPlan ? 'INCIDENT SIMULATED' : 'NOMINAL'}
            </span>
          </div>
          {emergencyPlan ? (
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <strong>Active Contingency: </strong>
                {emergencyPlan.hazard_event.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Status:{' '}
                {emergencyPlan.is_feasible
                  ? emergencyPlan.is_return_to_base
                    ? 'Sortie Aborted — RTB Corridor Active'
                    : 'Dynamic Detour Route Verified'
                  : 'Destination Blocked — Abort Required'}
              </div>
            </div>
          ) : (
            <p className="empty-hint">
              Nominal status. Ready to inject simulated boulder fields, dune bedforms, scarp
              closures, or return-to-base abort orders.
            </p>
          )}
          <div className="card-footer-action">
            <button
              type="button"
              className="mode-btn"
              onClick={() => onNavigate('emergency')}
            >
              Open Emergency Center →
            </button>
          </div>
        </div>

        {/* NASA Planetary Datasets */}
        <div className="card overview-card">
          <div className="card-header">
            <h3>Planetary Data Pipeline</h3>
            <span className="badge badge-observed">10 VERIFIED</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Fully integrated with USGS HiRISE DTM (1.0m), HiRISE ORI (0.25m), CTX DTM (20m), CRISM
            Mineralogy, and Perseverance MEDA in-situ weather telemetry.
          </p>
          <div className="card-footer-action">
            <button
              type="button"
              className="mode-btn"
              onClick={() => onNavigate('data-hub')}
            >
              Inspect NASA Catalog →
            </button>
          </div>
        </div>

        {/* Exploration Coordinates */}
        <div className="card overview-card">
          <div className="card-header">
            <h3>Sortie Coordinates</h3>
            <span className="badge badge-heuristic">CONFIGURABLE</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: '0.4rem' }}>
              <strong>Base Camp: </strong>
              {startPoint.lat.toFixed(5)}°N, {startPoint.lon.toFixed(5)}°E
            </div>
            <div>
              <strong>Target Outcrop: </strong>
              {destPoint.lat.toFixed(5)}°N, {destPoint.lon.toFixed(5)}°E
            </div>
          </div>
          <div className="card-footer-action">
            <button
              type="button"
              className="mode-btn"
              onClick={() => onNavigate('digital-twin')}
            >
              View on Planetary Map →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
