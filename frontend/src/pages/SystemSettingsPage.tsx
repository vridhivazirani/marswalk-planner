import React from 'react'

interface SystemSettingsPageProps {
  isBackendHealthy: boolean | null
}

export const SystemSettingsPage: React.FC<SystemSettingsPageProps> = ({ isBackendHealthy }) => {
  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            System Settings & Geodetic Verification
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            Cartographic Standards, Planetary Constants & Architecture Integrity
          </small>
        </div>
        <span className="badge badge-passable">IAU_2015:49900 COMPLIANT</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
        {/* Backend API Status Card */}
        <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.05rem' }}>
            Backend API Link & Telemetry Health
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <span
              className={`status-pill ${
                isBackendHealthy === true ? 'online' : isBackendHealthy === false ? 'offline' : 'checking'
              }`}
            >
              {isBackendHealthy === true ? '● API ONLINE (200 OK)' : isBackendHealthy === false ? '● DISCONNECTED' : '● VERIFYING LINK'}
            </span>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Backend Base URL: </strong>
              <code>http://127.0.0.1:8000/api/v1</code>
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Health Check Endpoint: </strong>
              <code>/health</code>
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Environment: </strong>
              macOS arm64 • Python 3.12.4 • FastAPI / Uvicorn
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Raster Processing Cache: </strong>
              Level-2 ARD Jezero 20m & 1.0m DTM grids loaded in memory
            </div>
          </div>
        </div>

        {/* Mars Geodesy Rules */}
        <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.05rem' }}>
            Planetary Geodesy & CRS Rules
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Geographic CRS: </strong>
              <code>IAU_2015:49900</code> (Mars 2015 Sphere)
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Mean Volumetric Radius (R): </strong>
              3,396,190.0 meters
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Coordinate Convention: </strong>
              Planetocentric latitude, East-positive longitude in [−180, 180)
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Vertical Reference Datum: </strong>
              Mars Areoid (MOLA equipotential surface zero-level)
            </div>
            <div>
              <strong style={{ color: 'var(--status-critical)' }}>Earth Mercator Prohibition: </strong>
              Earth Web Mercator (EPSG:3857) or Earth ellipsoids (WGS84) are strictly prohibited in analysis.
            </div>
          </div>
        </div>

        {/* Mars Physical & EVA Constants */}
        <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.05rem' }}>
            Mars Physical Constants & Sortie Assumptions
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Surface Gravity (g): </strong>
              3.72076 m/s² (~0.38 g of Earth)
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Nominal Human Walking Velocity: </strong>
              1.0 m/s (level ground, adjusted by slope & roughness cost)
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Surface Atmospheric Pressure: </strong>
              680–760 Pa (tenuous CO2)
            </div>
            <div>
              <strong style={{ color: 'var(--text-muted)' }}>Max Traversal Grade: </strong>
              25.0° (Hard physical human climbing constraint)
            </div>
          </div>
        </div>

        {/* Epistemic Classification Scheme */}
        <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.05rem' }}>
            Epistemic Classification Standard (AGENTS.md)
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem' }}>
            <span className="badge badge-observed">OBSERVED</span>
            <span className="badge badge-derived">DERIVED</span>
            <span className="badge badge-interpreted">INTERPRETED</span>
            <span className="badge badge-predicted">PREDICTED</span>
            <span className="badge badge-heuristic">HEURISTIC</span>
            <span className="badge badge-simulated">SIMULATED</span>
            <span className="badge badge-unknown">UNKNOWN</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.6rem', lineHeight: '1.4' }}>
            Every spatial layer, hazard score, and simulation result is formally tagged with an
            epistemic class to prevent mistaking heuristic models for verified operational facts.
          </p>
        </div>
      </div>
    </div>
  )
}

