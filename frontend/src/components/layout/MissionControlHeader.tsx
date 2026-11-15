import React from 'react'

interface MissionControlHeaderProps {
  pageTitle: string
  activeProfile: string
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  routesCount: number
  isBackendHealthy: boolean | null
  missionId?: string
  missionName?: string
  missionStatus?: string
  regionLabel?: string
  lastSavedAt?: string | null
  persistenceNotice?: string | null
  onUpdateMissionName?: (name: string) => void
  onResetDraft?: () => void
  onDismissNotice?: () => void
}

export const MissionControlHeader: React.FC<MissionControlHeaderProps> = ({
  pageTitle,
  activeProfile,
  startPoint,
  destPoint,
  routesCount,
  isBackendHealthy,
  missionId,
  missionName,
  missionStatus,
  regionLabel,
  lastSavedAt,
  persistenceNotice,
  onUpdateMissionName,
  onResetDraft,
  onDismissNotice,
}) => {
  const [showDetails, setShowDetails] = React.useState<boolean>(false)
  const [editingName, setEditingName] = React.useState<string | null>(null)
  const displayedDraftName = editingName ?? (missionName ?? '')

  const commitMissionName = () => {
    const trimmed = displayedDraftName.trim()
    setEditingName(null)
    if (trimmed && onUpdateMissionName && trimmed !== missionName) {
      onUpdateMissionName(trimmed)
    }
  }

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
        {missionName && (
          <span
            data-testid="header-mission-pill"
            style={{
              background: '#18181b',
              border: '1px solid #27272a',
              color: '#a1a1aa',
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono, monospace)',
              padding: '0.12rem 0.45rem',
              borderRadius: '2px',
              maxWidth: '220px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={missionId ? `Mission ID: ${missionId}` : missionName}
          >
            {missionName}
          </span>
        )}
      </div>

      <div className="header-telemetry-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {persistenceNotice && (
          <div
            data-testid="mission-persistence-notice"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#18181b',
              border: '1px solid #52525b',
              color: '#fbbf24',
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono, monospace)',
              padding: '0.15rem 0.45rem',
              borderRadius: '2px',
              maxWidth: '300px',
            }}
            title={persistenceNotice}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {persistenceNotice}
            </span>
            {onDismissNotice && (
              <button
                type="button"
                onClick={onDismissNotice}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label="Dismiss notice"
              >
                ×
              </button>
            )}
          </div>
        )}

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
          title="Toggle mission bundle and coordinate telemetry"
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
              padding: '0.7rem 0.85rem',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              minWidth: '280px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            {missionId && (
              <div><span style={{ color: '#71717a' }}>MISSION ID:</span> <span data-testid="mission-id-value">{missionId}</span></div>
            )}
            {missionStatus && (
              <div><span style={{ color: '#71717a' }}>STATUS:</span> {missionStatus}</div>
            )}
            {regionLabel && (
              <div><span style={{ color: '#71717a' }}>REGION:</span> {regionLabel}</div>
            )}
            {onUpdateMissionName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                <label htmlFor="mission-name-input" style={{ color: '#71717a' }}>NAME:</label>
                <input
                  id="mission-name-input"
                  data-testid="mission-name-input"
                  type="text"
                  value={displayedDraftName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitMissionName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitMissionName()
                    } else if (e.key === 'Escape') {
                      setEditingName(null)
                    }
                  }}
                  style={{
                    flex: 1,
                    background: '#09090b',
                    border: '1px solid #3f3f46',
                    color: '#fafafa',
                    fontFamily: 'inherit',
                    fontSize: '0.72rem',
                    padding: '0.15rem 0.35rem',
                    borderRadius: '2px',
                  }}
                />
              </div>
            )}
            <div><span style={{ color: '#71717a' }}>HABITAT BASE:</span> {startPoint.lat.toFixed(4)}°N, {startPoint.lon.toFixed(4)}°E</div>
            <div><span style={{ color: '#71717a' }}>TARGET DEST:</span> {destPoint.lat.toFixed(4)}°N, {destPoint.lon.toFixed(4)}°E</div>
            <div><span style={{ color: '#71717a' }}>ACTIVE SORTIES:</span> {routesCount > 0 ? `${routesCount} routes computed` : 'Standby'}</div>
            {lastSavedAt && (
              <div style={{ color: '#71717a', fontSize: '0.66rem' }}>
                DRAFT SAVED: {new Date(lastSavedAt).toLocaleTimeString()}
              </div>
            )}
            {onResetDraft && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem', paddingTop: '0.35rem', borderTop: '1px solid #27272a' }}>
                <button
                  type="button"
                  data-testid="reset-mission-draft-btn"
                  onClick={onResetDraft}
                  style={{
                    background: '#18181b',
                    border: '1px solid #52525b',
                    color: '#e4e4e7',
                    fontFamily: 'inherit',
                    fontSize: '0.68rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  NEW / RESET DRAFT
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

