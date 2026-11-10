import React from 'react'

interface MissionControlHeaderProps {
  pageTitle: string
  activeProfile: string
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  routesCount: number
  isBackendHealthy: boolean | null
}

export const MissionControlHeader: React.FC<MissionControlHeaderProps> = ({
  pageTitle,
  activeProfile,
  startPoint,
  destPoint,
  routesCount,
  isBackendHealthy,
}) => {
  return (
    <header className="mission-control-header">
      <div className="header-left">
        <h2 className="header-page-title">{pageTitle}</h2>
        <span className="header-breadcrumbs">
          Marswalk Mission Control / Jezero Western Delta / {pageTitle}
        </span>
      </div>

      <div className="header-telemetry-row">
        {/* Backend API Connectivity Status */}
        <div className="telemetry-item">
          <span className="telemetry-label">BACKEND API STATUS:</span>
          <span
            className={`status-pill ${
              isBackendHealthy === true ? 'online' : isBackendHealthy === false ? 'offline' : 'checking'
            }`}
          >
            {isBackendHealthy === true ? '● CONNECTED (200 OK)' : isBackendHealthy === false ? '● LINK DOWN' : '● CHECKING'}
          </span>
        </div>

        {/* Active Route Status */}
        <div className="telemetry-item">
          <span className="telemetry-label">SORTIE STATUS:</span>
          <span className="telemetry-value" style={{ color: routesCount > 0 ? '#00e676' : '#90a4ae' }}>
            {routesCount > 0 ? `${routesCount} ROUTES PLANNED` : 'STANDBY'}
          </span>
        </div>

        {/* Active Optimization Profile */}
        <div className="telemetry-item">
          <span className="telemetry-label">PROFILE:</span>
          <span className="profile-badge-small">{activeProfile.replace('_', ' ')}</span>
        </div>

        {/* Active Study Area Coordinate Pin */}
        <div className="telemetry-item">
          <span className="telemetry-label">BASE:</span>
          <span className="telemetry-coord">
            {startPoint.lat.toFixed(4)}°N, {startPoint.lon.toFixed(4)}°E
          </span>
          <span className="telemetry-label" style={{ marginLeft: '0.4rem' }}>DEST:</span>
          <span className="telemetry-coord">
            {destPoint.lat.toFixed(4)}°N, {destPoint.lon.toFixed(4)}°E
          </span>
        </div>
      </div>
    </header>
  )
}

