import React, { useState, useEffect } from 'react'
import type { RouteFeature } from '../api/routing'
import type { DynamicReroutePlanDTO } from '../api/emergency'
import type { PageId } from '../components/layout/NavigationSidebar'
import type { ExplorerTab } from './MapExplorerPage'
import { GlobalMarsMap } from '../components/GlobalMarsMap'
import { GlobalMarsGlobe3D } from '../components/GlobalMarsGlobe3D'
import { fetchAtlasCatalogue } from '../api/atlas'

export interface MissionOverviewPageProps {
  onNavigate: (page: PageId, tab?: ExplorerTab) => void
  isBackendHealthy?: boolean | null
  activeRoute?: RouteFeature | null
  emergencyPlan?: DynamicReroutePlanDTO | null
  routesCount?: number
  startPoint?: { lat: number; lon: number }
  destPoint?: { lat: number; lon: number }
}

type ActiveExperience = '01_EXPLORER' | '02_MONOCHROME' | '03_GLOBE' | '04_ATLAS'

export const MissionOverviewPage: React.FC<MissionOverviewPageProps> = ({
  onNavigate,
  isBackendHealthy = true,
  activeRoute,
  emergencyPlan,
  routesCount = 0,
}) => {
  const [datasetCount, setDatasetCount] = useState<number>(37)
  const [activeExperience, setActiveExperience] = useState<ActiveExperience>('01_EXPLORER')

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

  const getCorrespondingTab = (exp: ActiveExperience): ExplorerTab => {
    switch (exp) {
      case '01_EXPLORER':
        return 'MARS_EXPLORER'
      case '02_MONOCHROME':
        return 'MARS_MONOCHROME'
      case '03_GLOBE':
        return 'GLOBAL_GLOBE'
      case '04_ATLAS':
        return 'GLOBAL_MAP'
    }
  }

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
          1. HERO HEADER (AEROSPACE EDITORIAL MINIMALISM)
          ========================================================================= */}
      <section style={{ marginBottom: '2rem' }}>
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
            FOUR EXPLORATION EXPERIENCES
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
            paddingBottom: '1.75rem',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(2.4rem, 4.8vw, 4.2rem)',
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
                fontSize: 'clamp(0.95rem, 1.3vw, 1.15rem)',
                color: '#8e8e93',
                fontWeight: 400,
                letterSpacing: '0.01em',
              }}
            >
              Global Planetary Surface Intelligence & Four Distinct Exploration Environments.
            </p>
          </div>

          {/* Scientific Status Indicators */}
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
          2. INTERACTIVE EXPLORATION STAGE (LIVE MULTI-EXPERIENCE VIEWPORT)
          ========================================================================= */}
      <section style={{ marginBottom: '3rem' }}>
        {/* Stage Header & Experience Selector Pills */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '0.85rem',
          }}
        >
          <div style={{ display: 'inline-flex', gap: '0.35rem', background: '#0e0e11', border: '1px solid #222226', padding: '3px', borderRadius: '4px' }}>
            <button
              type="button"
              onClick={() => setActiveExperience('01_EXPLORER')}
              style={{
                background: activeExperience === '01_EXPLORER' ? '#c2410c' : 'transparent',
                color: activeExperience === '01_EXPLORER' ? '#ffffff' : '#a1a1aa',
                border: 'none',
                padding: '0.4rem 0.85rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🔭</span>
              <span>01 Mars Explorer</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveExperience('02_MONOCHROME')}
              style={{
                background: activeExperience === '02_MONOCHROME' ? '#ffffff' : 'transparent',
                color: activeExperience === '02_MONOCHROME' ? '#000000' : '#a1a1aa',
                border: 'none',
                padding: '0.4rem 0.85rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🌓</span>
              <span>02 Mars Monochrome</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveExperience('03_GLOBE')}
              style={{
                background: activeExperience === '03_GLOBE' ? '#ffffff' : 'transparent',
                color: activeExperience === '03_GLOBE' ? '#000000' : '#a1a1aa',
                border: 'none',
                padding: '0.4rem 0.85rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🪐</span>
              <span>03 3D Globe</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveExperience('04_ATLAS')}
              style={{
                background: activeExperience === '04_ATLAS' ? '#ffffff' : 'transparent',
                color: activeExperience === '04_ATLAS' ? '#000000' : '#a1a1aa',
                border: 'none',
                padding: '0.4rem 0.85rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                borderRadius: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🌐</span>
              <span>04 2D Atlas</span>
            </button>
          </div>

          {/* Right Header Controls: Active Data Badge & Fullscreen Launch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div
              style={{
                background: '#0e0e11',
                border: '1px solid #222226',
                padding: '0.4rem 0.75rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.68rem',
                color: '#a1a1aa',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background:
                    activeExperience === '01_EXPLORER'
                      ? '#ea580c'
                      : activeExperience === '02_MONOCHROME'
                      ? '#ffffff'
                      : activeExperience === '03_GLOBE'
                      ? '#38bdf8'
                      : '#34d399',
                }}
              />
              <span>
                {activeExperience === '01_EXPLORER' && 'VIKING MDIM 2.1 (232m) • OBSERVED'}
                {activeExperience === '02_MONOCHROME' && 'MOLA SHADED RELIEF (463m) • DERIVED'}
                {activeExperience === '03_GLOBE' && 'THREE.JS SPHERE (R = 3,396.19 km) • IAU 2015'}
                {activeExperience === '04_ATLAS' && 'JEZERO TWIN (1m/20m) • MULTI-SCALE'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('map-explorer', getCorrespondingTab(activeExperience))}
              style={{
                background: '#141418',
                border: '1px solid #303036',
                color: '#ffffff',
                padding: '0.4rem 0.95rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                borderRadius: '3px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#ffffff'
                e.currentTarget.style.background = '#1e1e24'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#303036'
                e.currentTarget.style.background = '#141418'
              }}
            >
              <span>OPEN FULLSCREEN WORKSPACE</span>
              <span>↗</span>
            </button>
          </div>
        </div>

        {/* Viewport Frame with Live Active Experience */}
        <div
          style={{
            position: 'relative',
            height: 'clamp(500px, 62vh, 700px)',
            width: '100%',
            background: '#09090b',
            border: '1px solid #222226',
            borderRadius: '4px',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.75)',
          }}
        >

          {/* 01. Mars Explorer (Natural Colour) */}
          {activeExperience === '01_EXPLORER' && (
            <GlobalMarsMap
              key="stage-natural"
              compact={true}
              displayMode="natural"
              initialBasemapId="viking_mdim21"
              onEnterJezero={() => onNavigate('map-explorer', 'REGIONAL_MAP')}
            />
          )}

          {/* 02. Mars Monochrome (Grayscale Relief) */}
          {activeExperience === '02_MONOCHROME' && (
            <GlobalMarsMap
              key="stage-monochrome"
              compact={true}
              displayMode="monochrome"
              initialBasemapId="mola_shaded_relief"
              onEnterJezero={() => onNavigate('map-explorer', 'REGIONAL_MAP')}
            />
          )}

          {/* 03. 3D Mars Globe (Interactive Three.js) */}
          {activeExperience === '03_GLOBE' && (
            <GlobalMarsGlobe3D
              key="stage-globe"
              onEnterJezero={() => onNavigate('map-explorer', 'REGIONAL_MAP')}
              onEnterRegion={() => onNavigate('map-explorer', 'REGIONAL_MAP')}
            />
          )}

          {/* 04. 2D Mars Atlas (Cartographic Layers) */}
          {activeExperience === '04_ATLAS' && (
            <GlobalMarsMap
              key="stage-atlas"
              compact={true}
              displayMode="atlas"
              initialBasemapId="mola_color_topography"
              onEnterJezero={() => onNavigate('map-explorer', 'REGIONAL_MAP')}
            />
          )}
        </div>
      </section>

      {/* =========================================================================
          3. FOUR EXPLORATION EXPERIENCES (FOUR LARGE DISTINCT NAVIGATION CARDS)
          ========================================================================= */}
      <section style={{ marginBottom: '3.5rem' }}>
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
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#ffffff',
              fontWeight: 800,
            }}
          >
            FOUR EXPLORATION EXPERIENCES
          </span>

          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.7rem',
              color: '#71717a',
            }}
          >
            SELECT AN ENVIRONMENT TO LAUNCH
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* CARD 01: MARS EXPLORER */}
          <div
            onClick={() => onNavigate('map-explorer', 'MARS_EXPLORER')}
            style={{
              background: '#0d0d10',
              border: '1px solid #1f1f23',
              borderRadius: '4px',
              padding: '1.75rem 1.5rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '310px',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#ea580c'
              e.currentTarget.style.background = '#121217'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1f1f23'
              e.currentTarget.style.background = '#0d0d10'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: '#ea580c',
                  }}
                >
                  01 // NATURAL COLOUR
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.62rem',
                    background: 'rgba(234, 88, 12, 0.12)',
                    border: '1px solid rgba(234, 88, 12, 0.3)',
                    color: '#fb923c',
                    padding: '2px 6px',
                    borderRadius: '2px',
                  }}
                >
                  VIKING MDIM 2.1
                </span>
              </div>

              <h2
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                }}
              >
                Mars Explorer
              </h2>

              <p
                style={{
                  margin: '0 0 1rem',
                  fontSize: '0.85rem',
                  color: '#d4d4d8',
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                Full-spectrum natural-colour visual exploration of authentic Martian surface terrain.
              </p>

              <p style={{ margin: 0, color: '#8e8e93', fontSize: '0.82rem', lineHeight: 1.55 }}>
                Navigate across volcanic shields, ancient fluvial deltas, and impact structures using USGS-controlled true-albedo orbital mosaics. Verified planetary science imagery with zero artistic fabrication.
              </p>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: '#71717a',
                  marginBottom: '1rem',
                }}
              >
                <span>• 232 m/px</span>
                <span>• True Albedo</span>
                <span>• Landmark Fly-To</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '1rem',
                  borderTop: '1px solid #1a1a1e',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.74rem',
                  color: '#fb923c',
                  fontWeight: 700,
                }}
              >
                <span>NASA / USGS VERIFIED</span>
                <span>LAUNCH EXPLORER →</span>
              </div>
            </div>
          </div>

          {/* CARD 02: MARS MONOCHROME */}
          <div
            onClick={() => onNavigate('map-explorer', 'MARS_MONOCHROME')}
            style={{
              background: '#0d0d10',
              border: '1px solid #1f1f23',
              borderRadius: '4px',
              padding: '1.75rem 1.5rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '310px',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#ffffff'
              e.currentTarget.style.background = '#121217'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1f1f23'
              e.currentTarget.style.background = '#0d0d10'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: '#ffffff',
                  }}
                >
                  02 // MONOCHROME
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.62rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    padding: '2px 6px',
                    borderRadius: '2px',
                  }}
                >
                  MOLA SHADED RELIEF
                </span>
              </div>

              <h2
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                }}
              >
                Mars Monochrome
              </h2>

              <p
                style={{
                  margin: '0 0 1rem',
                  fontSize: '0.85rem',
                  color: '#d4d4d8',
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                Pure black-and-white planetary cartography engineered for structural and terrain analysis.
              </p>

              <p style={{ margin: 0, color: '#8e8e93', fontSize: '0.82rem', lineHeight: 1.55 }}>
                Stripping away surface albedo color reveals crater rims, grabens, fault scarps, and elevation gradients with maximum clarity. Preserves the clean minimalist monochrome visual identity in an interactive exploration environment.
              </p>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: '#71717a',
                  marginBottom: '1rem',
                }}
              >
                <span>• 463 m/px</span>
                <span>• High-Contrast Relief</span>
                <span>• Morphological GIS</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '1rem',
                  borderTop: '1px solid #1a1a1e',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.74rem',
                  color: '#ffffff',
                  fontWeight: 700,
                }}
              >
                <span>AEROSPACE MONOCHROME</span>
                <span>LAUNCH MONOCHROME →</span>
              </div>
            </div>
          </div>

          {/* CARD 03: 3D MARS GLOBE */}
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
              minHeight: '310px',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#38bdf8'
              e.currentTarget.style.background = '#121217'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1f1f23'
              e.currentTarget.style.background = '#0d0d10'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: '#38bdf8',
                  }}
                >
                  03 // SPHERICAL ORBIT
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.62rem',
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#7dd3fc',
                    padding: '2px 6px',
                    borderRadius: '2px',
                  }}
                >
                  THREE.JS WEBGL
                </span>
              </div>

              <h2
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                }}
              >
                3D Mars Globe
              </h2>

              <p
                style={{
                  margin: '0 0 1rem',
                  fontSize: '0.85rem',
                  color: '#d4d4d8',
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                Fully interactive Three.js planetary sphere with real physical radius and orbital camera.
              </p>

              <p style={{ margin: 0, color: '#8e8e93', fontSize: '0.82rem', lineHeight: 1.55 }}>
                Built on the IAU 2015 Mars sphere (R = 3,396.19 km). Free orbital rotation, multi-tier altitude zoom, atmospheric limb glow, surface raycasting, and smooth camera fly-to targeting to historical landing sites.
              </p>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: '#71717a',
                  marginBottom: '1rem',
                }}
              >
                <span>• R = 3,396.19 km</span>
                <span>• 60 FPS Orbit</span>
                <span>• Fly-To Targeting</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '1rem',
                  borderTop: '1px solid #1a1a1e',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.74rem',
                  color: '#7dd3fc',
                  fontWeight: 700,
                }}
              >
                <span>SPHERICAL GEODESY</span>
                <span>ORBIT 3D GLOBE →</span>
              </div>
            </div>
          </div>

          {/* CARD 04: 2D MARS ATLAS */}
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
              minHeight: '310px',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#34d399'
              e.currentTarget.style.background = '#121217'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1f1f23'
              e.currentTarget.style.background = '#0d0d10'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: '#34d399',
                  }}
                >
                  04 // SCIENTIFIC CARTOGRAPHY
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.62rem',
                    background: 'rgba(52, 211, 153, 0.12)',
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                    color: '#86efac',
                    padding: '2px 6px',
                    borderRadius: '2px',
                  }}
                >
                  1M / 20M DIGITAL TWIN
                </span>
              </div>

              <h2
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                }}
              >
                2D Mars Atlas
              </h2>

              <p
                style={{
                  margin: '0 0 1rem',
                  fontSize: '0.85rem',
                  color: '#d4d4d8',
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                High-performance GIS cartography linking global elevation to the Jezero Crater Digital Twin.
              </p>

              <p style={{ margin: 0, color: '#8e8e93', fontSize: '0.82rem', lineHeight: 1.55 }}>
                Plate Carrée projection equipped with local disk tile proxying, canvas vector rendering, 45.2 km Perseverance traverse ground truth, CRISM mineral units, and 12 multi-resolution regional dossiers.
              </p>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: '#71717a',
                  marginBottom: '1rem',
                }}
              >
                <span>• 1 m/px Jezero</span>
                <span>• Canvas Vectors</span>
                <span>• 37 Data Layers</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '1rem',
                  borderTop: '1px solid #1a1a1e',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.74rem',
                  color: '#86efac',
                  fontWeight: 700,
                }}
              >
                <span>LEAFLET PLANETARY GIS</span>
                <span>LAUNCH 2D ATLAS →</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. MISSION OPERATIONS & SCIENTIFIC WORKSPACES (COMPACT LAUNCHPADS)
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
