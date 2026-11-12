import React, { useState, useEffect } from 'react'
import type { RouteFeature } from '../api/routing'
import type { DynamicReroutePlanDTO } from '../api/emergency'
import type { PageId } from '../components/layout/NavigationSidebar'
import { GlobalMarsMap } from '../components/GlobalMarsMap'
import { fetchAtlasCatalogue } from '../api/atlas'

export interface MissionOverviewPageProps {
  onNavigate: (
    page: PageId,
    tab?: 'GLOBAL_GLOBE' | 'GLOBAL_MAP' | 'REGIONAL_MAP' | 'CATALOGUE'
  ) => void
  isBackendHealthy?: boolean | null
  activeRoute?: RouteFeature | null
  emergencyPlan?: DynamicReroutePlanDTO | null
  routesCount?: number
  startPoint?: { lat: number; lon: number }
  destPoint?: { lat: number; lon: number }
}

export const MissionOverviewPage: React.FC<MissionOverviewPageProps> = ({
  onNavigate,
  isBackendHealthy = true,
  activeRoute,
  emergencyPlan,
  routesCount = 0,
}) => {
  const [datasetCount, setDatasetCount] = useState<number>(37)

  useEffect(() => {
    let cancelled = false
    fetchAtlasCatalogue({ page_size: 1 })
      .then((res) => {
        if (!cancelled && res.total_count) {
          setDatasetCount(res.total_count)
        }
      })
      .catch(() => {
        // Fallback to verified catalog count 37
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      style={{
        maxWidth: '1520px',
        margin: '0 auto',
        padding: '2.5rem 1.5rem 4rem',
        color: '#f4f4f5',
        fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
      }}
    >
      {/* =========================================================================
          1. HERO SECTION (EDITORIAL & AEROSPACE MINIMALISM)
          ========================================================================= */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#ffffff',
            }}
          >
            MARSWALK
          </span>
          <span style={{ color: '#3f3f46', fontSize: '0.75rem' }}>//</span>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.72rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#a1a1aa',
            }}
          >
            PLANETARY ATLAS
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: '1.5rem',
            borderBottom: '1px solid #1f1f23',
            paddingBottom: '2rem',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
                fontWeight: 300,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                margin: 0,
                color: '#ffffff',
              }}
            >
              Explore Mars.
            </h1>
            <p
              style={{
                margin: '0.75rem 0 0',
                fontSize: 'clamp(0.95rem, 1.4vw, 1.15rem)',
                color: '#8e8e93',
                fontWeight: 400,
                letterSpacing: '0.01em',
              }}
            >
              Global Planetary Surface Intelligence & Scientific Cartography.
            </p>
          </div>

          {/* =========================================================================
              3. SCIENTIFIC STATUS INDICATORS (COMPACT, RESTRAINED MONOCHROME)
              ========================================================================= */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.25rem',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#a1a1aa',
              padding: '0.4rem 0.85rem',
              background: '#0d0d10',
              border: '1px solid #222226',
              borderRadius: '2px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isBackendHealthy ? '#34d399' : '#fbbf24',
                  boxShadow: isBackendHealthy ? '0 0 8px rgba(52, 211, 153, 0.6)' : 'none',
                }}
              />
              <span style={{ color: isBackendHealthy ? '#e4e4e7' : '#fef08a' }}>
                {isBackendHealthy ? 'DATA CONNECTED' : 'OFFLINE'}
              </span>
            </div>

            <span style={{ color: '#3f3f46' }}>/</span>

            <div>
              <span style={{ color: '#71717a' }}>GEODESY: </span>
              <span style={{ color: '#f4f4f5', fontWeight: 600 }}>IAU 2015</span>
            </div>

            <span style={{ color: '#3f3f46' }}>/</span>

            <div>
              <span style={{ color: '#f4f4f5', fontWeight: 700 }}>{datasetCount}</span>
              <span style={{ color: '#71717a' }}> DATASETS</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. MARS TOPOGRAPHY VISUAL (AUTHENTIC INTERACTIVE PLANETARY ATLAS)
          ========================================================================= */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            position: 'relative',
            height: 'clamp(480px, 58vh, 660px)',
            width: '100%',
            background: '#09090b',
            border: '1px solid #222226',
            borderRadius: '4px',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)',
          }}
        >
          {/* Authentic NASA-backed Interactive Global Mars Atlas */}
          <GlobalMarsMap
            onEnterJezero={() => {
              onNavigate('map-explorer', 'REGIONAL_MAP')
            }}
          />
        </div>
      </section>

      {/* =========================================================================
          4. EXPLORATION NAVIGATION (THREE ELEGANT DESTINATIONS)
          ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* DESTINATION 1: 3D GLOBE */}
          <div
            onClick={() => onNavigate('map-explorer', 'GLOBAL_GLOBE')}
            style={{
              background: '#0d0d10',
              border: '1px solid #1f1f23',
              borderRadius: '4px',
              padding: '1.75rem 1.5rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '210px',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#ffffff'
              e.currentTarget.style.background = '#131317'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1f1f23'
              e.currentTarget.style.background = '#0d0d10'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '0.6rem',
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  3D Globe
                </h2>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.65rem',
                    color: '#71717a',
                  }}
                >
                  SPHERE
                </span>
              </div>
              <p style={{ margin: 0, color: '#a1a1aa', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Interactive spherical Mars exploration. Free orbital rotation, real physical radius (R = 3,396.19 km), and planetary feature inspection.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '1.25rem',
                borderTop: '1px solid #1a1a1e',
                marginTop: '1.25rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.72rem',
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              <span style={{ color: '#71717a' }}>THREE.JS • WEBGL</span>
              <span>LAUNCH GLOBE →</span>
            </div>
          </div>

          {/* DESTINATION 2: 2D ATLAS */}
          <div
            onClick={() => onNavigate('map-explorer', 'GLOBAL_MAP')}
            style={{
              background: '#0d0d10',
              border: '1px solid #1f1f23',
              borderRadius: '4px',
              padding: '1.75rem 1.5rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '210px',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#ffffff'
              e.currentTarget.style.background = '#131317'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1f1f23'
              e.currentTarget.style.background = '#0d0d10'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '0.6rem',
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  2D Atlas
                </h2>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.65rem',
                    color: '#71717a',
                  }}
                >
                  CYLINDRICAL
                </span>
              </div>
              <p style={{ margin: 0, color: '#a1a1aa', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Global planetary cartography. Full-resolution MOLA elevation shading, THEMIS thermal mosaic, continuous longitude tiling, and live point sampling.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '1.25rem',
                borderTop: '1px solid #1a1a1e',
                marginTop: '1.25rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.72rem',
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              <span style={{ color: '#71717a' }}>PLATE CARRÉE • 463M</span>
              <span>OPEN 2D MAP →</span>
            </div>
          </div>

          {/* DESTINATION 3: REGIONAL ATLAS */}
          <div
            onClick={() => onNavigate('map-explorer', 'REGIONAL_MAP')}
            style={{
              background: '#0d0d10',
              border: '1px solid #1f1f23',
              borderRadius: '4px',
              padding: '1.75rem 1.5rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '210px',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#ffffff'
              e.currentTarget.style.background = '#131317'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1f1f23'
              e.currentTarget.style.background = '#0d0d10'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '0.6rem',
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  Regional Atlas
                </h2>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.65rem',
                    color: '#71717a',
                  }}
                >
                  12 SITES
                </span>
              </div>
              <p style={{ margin: 0, color: '#a1a1aa', fontSize: '0.88rem', lineHeight: 1.5 }}>
                Explore 12 priority planetary regions including Jezero Delta, Gale Crater, Olympus Mons summit, and Valles Marineris canyon systems.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '1.25rem',
                borderTop: '1px solid #1a1a1e',
                marginTop: '1.25rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.72rem',
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              <span style={{ color: '#71717a' }}>MULTI-SCALE DOSSIERS</span>
              <span>SELECT REGION →</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. MISSION OPERATIONS & SCIENTIFIC WORKSPACES (ELEGANT SUBSYSTEMS)
          ========================================================================= */}
      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1f1f23',
            paddingBottom: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.72rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#71717a',
            }}
          >
            OPERATIONAL WORKSPACES
          </span>

          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.7rem',
              color: '#52525b',
            }}
          >
            RESEARCH & MISSION DECISION SUPPORT
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          {/* Operation 1: Digital Twin */}
          <div
            onClick={() => onNavigate('digital-twin')}
            style={{
              background: '#09090b',
              border: '1px solid #1a1a1e',
              borderRadius: '3px',
              padding: '1.2rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3f3f46'
              e.currentTarget.style.background = '#111114'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1a1a1e'
              e.currentTarget.style.background = '#09090b'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f4f4f5' }}>Jezero Digital Twin</span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono, monospace)', color: '#71717a' }}>1.0M HI-RES</span>
            </div>
            <p style={{ margin: '0 0 0.8rem', fontSize: '0.75rem', color: '#8e8e93', lineHeight: 1.4 }}>
              Western Delta fan high-resolution digital elevation model, rover telemetry, and sample depot.
            </p>
            <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono, monospace)', color: '#ffffff' }}>
              Launch Twin →
            </span>
          </div>

          {/* Operation 2: Route Planner */}
          <div
            onClick={() => onNavigate('route-planner')}
            style={{
              background: '#09090b',
              border: '1px solid #1a1a1e',
              borderRadius: '3px',
              padding: '1.2rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3f3f46'
              e.currentTarget.style.background = '#111114'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1a1a1e'
              e.currentTarget.style.background = '#09090b'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f4f4f5' }}>EVA Route Planner</span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono, monospace)', color: activeRoute ? '#86efac' : '#71717a' }}>
                {activeRoute
                  ? `${(activeRoute.properties.metrics.total_distance_m / 1000).toFixed(2)} km ACTIVE`
                  : routesCount > 0
                  ? `${routesCount} PLANNED`
                  : 'READY'}
              </span>
            </div>
            <p style={{ margin: '0 0 0.8rem', fontSize: '0.75rem', color: '#8e8e93', lineHeight: 1.4 }}>
              Multi-objective A* traversal solver with slope, hazard, and science weight profiles.
            </p>
            <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono, monospace)', color: '#ffffff' }}>
              Plan Route →
            </span>
          </div>

          {/* Operation 3: Simulation */}
          <div
            onClick={() => onNavigate('simulation')}
            style={{
              background: '#09090b',
              border: '1px solid #1a1a1e',
              borderRadius: '3px',
              padding: '1.2rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3f3f46'
              e.currentTarget.style.background = '#111114'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1a1a1e'
              e.currentTarget.style.background = '#09090b'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f4f4f5' }}>Mission Simulation</span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono, monospace)', color: '#71717a' }}>CONSUMABLES</span>
            </div>
            <p style={{ margin: '0 0 0.8rem', fontSize: '0.75rem', color: '#8e8e93', lineHeight: 1.4 }}>
              Astronaut life-support modeling: $O_2$ consumption, metabolic work, thermal margins, and comms LOS.
            </p>
            <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono, monospace)', color: '#ffffff' }}>
              Run Simulation →
            </span>
          </div>

          {/* Operation 4: Emergency Contingency */}
          <div
            onClick={() => onNavigate('emergency')}
            style={{
              background: '#09090b',
              border: '1px solid #1a1a1e',
              borderRadius: '3px',
              padding: '1.2rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3f3f46'
              e.currentTarget.style.background = '#111114'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1a1a1e'
              e.currentTarget.style.background = '#09090b'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f4f4f5' }}>Emergency Detours</span>
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono, monospace)', color: emergencyPlan ? '#f87171' : '#71717a' }}>
                {emergencyPlan ? 'ACTIVE EVENT' : 'STANDBY'}
              </span>
            </div>
            <p style={{ margin: '0 0 0.8rem', fontSize: '0.75rem', color: '#8e8e93', lineHeight: 1.4 }}>
              Simulate unforeseen obstacle injection, scarp collapses, and compute immediate safe abort paths.
            </p>
            <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono, monospace)', color: '#ffffff' }}>
              Emergency Operations →
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
