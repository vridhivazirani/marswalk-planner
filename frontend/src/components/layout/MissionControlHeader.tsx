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
  const [showDetails, setShowDetails] = React.useState<boolean>(false)

  return (
    <header className="mission-control-header" style={{ padding: '0.5rem 1.25rem', minHeight: '44px' }}>
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.12em', color: '#ffffff' }}>
          MARSWALK
        </span>
        <span style={{ color: '#52525b', fontSize: '0.75rem' }}>//</span>
        <h2 className="header-page-title" style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#e4e4e7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {pageTitle}
        </h2>
      </div>

      <div className="header-telemetry-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Backend API Connectivity Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ color: '#71717a' }}>API:</span>
          <span style={{ color: isBackendHealthy === true ? '#4ade80' : isBackendHealthy === false ? '#f87171' : '#fbbf24', fontWeight: 600 }}>
            {isBackendHealthy === true ? '● ONLINE' : isBackendHealthy === false ? '● OFFLINE' : '● SYNCING'}
          </span>
        </div>

        {/* Active Optimization Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ color: '#71717a' }}>PROFILE:</span>
          <span style={{ background: '#18181b', border: '1px solid #27272a', padding: '0.15rem 0.45rem', borderRadius: '2px', color: '#fafafa', fontWeight: 600 }}>
            {activeProfile.replace('_', ' ')}
          </span>
        </div>

        {/* Dataset Connection Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ color: '#71717a' }}>DATA:</span>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>
            ● 37 PDS PRODUCTS
          </span>
        </div>

        {/* Expandable Mission Telemetry Toggle */}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          style={{
            background: showDetails ? '#27272a' : '#18181b',
            border: '1px solid #3f3f46',
            color: '#d4d4d8',
            fontSize: '0.68rem',
            fontFamily: 'var(--font-mono, monospace)',
            padding: '0.2rem 0.5rem',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
          title="Toggle base & destination coordinates"
        >
          {showDetails ? 'INFO ▲' : 'INFO ▼'}
        </button>

        {showDetails && (
          <div
            style={{
              position: 'absolute',
              top: '46px',
              right: '1.25rem',
              zIndex: 1050,
              background: 'rgba(18, 18, 20, 0.96)',
              backdropFilter: 'blur(8px)',
              border: '1px solid #3f3f46',
              borderRadius: '3px',
              padding: '0.6rem 0.8rem',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            <div><span style={{ color: '#71717a' }}>HABITAT BASE:</span> {startPoint.lat.toFixed(4)}°N, {startPoint.lon.toFixed(4)}°E</div>
            <div><span style={{ color: '#71717a' }}>TARGET DEST:</span> {destPoint.lat.toFixed(4)}°N, {destPoint.lon.toFixed(4)}°E</div>
            <div><span style={{ color: '#71717a' }}>ACTIVE SORTIES:</span> {routesCount > 0 ? `${routesCount} routes computed` : 'Standby'}</div>
          </div>
        )}
      </div>
    </header>
  )
}

