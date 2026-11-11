import React, { useEffect, useState } from 'react'
import type {
  CandidateBoulderObject,
  MultiResInspectResult,
  TerrainClassDetail,
  TerrainLayersCatalogResponse,
  TerrainStatisticsResponse,
  TerrainTransectResponse,
} from '../api/terrain'
import {
  fetchTerrainClasses,
  fetchTerrainLayers,
  fetchTerrainStatistics,
  fetchTerrainTransectProfile,
  getTerrainRasterUrl,
  inspectTerrainPoint,
} from '../api/terrain'

interface TerrainIntelligencePageProps {
  onSelectCoords?: (coords: { lat: number; lon: number }) => void
}

type TabType = 'INSPECTION' | 'DERIVATIVES' | 'CLASSIFIER' | 'VISUAL_QC' | 'TRANSECT'

interface PresetTransect {
  label: string
  startLat: number
  startLon: number
  destLat: number
  destLon: number
  description: string
}

const PRESET_TRANSECTS: PresetTransect[] = [
  {
    label: 'Delta Scarp Ascent (Crater Floor to Delta Top)',
    startLat: 18.4446,
    startLon: 77.4509,
    destLat: 18.4550,
    destLon: 77.4050,
    description: 'Traverses from Octavia Butler landing site up the 150m western delta front.',
  },
  {
    label: 'Kodiak Remnant Butte Flank',
    startLat: 18.4120,
    startLon: 77.4000,
    destLat: 18.4300,
    destLon: 77.4250,
    description: 'Cross-section of the isolated sedimentary butte revealing preserved delta layering.',
  },
  {
    label: 'Neretva Vallis Inflow Channel Breach',
    startLat: 18.3950,
    startLon: 77.3450,
    destLat: 18.4350,
    destLon: 77.3850,
    description: 'Incision through the western crater rim where catastrophic flows entered.',
  },
  {
    label: 'Belva Impact Crater Cross-Section',
    startLat: 18.4800,
    startLon: 77.3550,
    destLat: 18.5100,
    destLon: 77.3950,
    description: '1 km secondary impact crater providing vertical stratigraphic exposure.',
  },
]

interface PresetLocation {
  label: string
  lat: number
  lon: number
  description: string
  coverage: string
}

const PRESET_LOCATIONS: PresetLocation[] = [
  {
    label: 'Western Delta Scarp',
    lat: 18.4485,
    lon: 77.4320,
    description: 'Steep lacustrine delta front with layered cliffs and blocky scree.',
    coverage: 'HiRISE 1.0m + CTX 20m',
  },
  {
    label: 'Kodiak Remnant Butte',
    lat: 18.4230,
    lon: 77.4080,
    description: 'Isolated erosional butte with truncated delta stratigraphy.',
    coverage: 'HiRISE 1.0m + CTX 20m',
  },
  {
    label: 'Delta Fan Apex',
    lat: 18.4100,
    lon: 77.3800,
    description: 'Inflow channel breach through crater rim into the delta.',
    coverage: 'HiRISE 1.0m + CTX 20m',
  },
  {
    label: 'Basin Floor (Eastern Outskirts)',
    lat: 18.3800,
    lon: 77.5800,
    description: 'Smooth crater floor plain beyond the high-resolution HiRISE strip.',
    coverage: 'CTX 20m Regional Only',
  },
]

export const TerrainIntelligencePage: React.FC<TerrainIntelligencePageProps> = ({ onSelectCoords }) => {
  const [activeTab, setActiveTab] = useState<TabType>('INSPECTION')

  // Coordinate Inspection state
  const [queryLat, setQueryLat] = useState<number>(18.4485)
  const [queryLon, setQueryLon] = useState<number>(77.4320)
  const [windowRadiusM, setWindowRadiusM] = useState<number>(60.0)
  const [inspectResult, setInspectResult] = useState<MultiResInspectResult | null>(null)
  const [inspectLoading, setInspectLoading] = useState<boolean>(false)
  const [inspectError, setInspectError] = useState<string | null>(null)

  // Catalog, Stats, Classes state
  const [classes, setClasses] = useState<TerrainClassDetail[]>([])
  const [catalog, setCatalog] = useState<TerrainLayersCatalogResponse | null>(null)
  const [statistics, setStatistics] = useState<TerrainStatisticsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState<boolean>(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  // Visual QC state
  const [selectedRasterLayer, setSelectedRasterLayer] = useState<string>('classes')
  const [rasterOpacity, setRasterOpacity] = useState<number>(100)

  // Dynamic Transect state (Phase 7)
  const [transectStartLat, setTransectStartLat] = useState<number>(18.4446)
  const [transectStartLon, setTransectStartLon] = useState<number>(77.4509)
  const [transectDestLat, setTransectDestLat] = useState<number>(18.4550)
  const [transectDestLon, setTransectDestLon] = useState<number>(77.4050)
  const [transectSamples, setTransectSamples] = useState<number>(100)
  const [transectResult, setTransectResult] = useState<TerrainTransectResponse | null>(null)
  const [transectLoading, setTransectLoading] = useState<boolean>(false)
  const [transectError, setTransectError] = useState<string | null>(null)

  const handleRunTransect = (
    sLat = transectStartLat,
    sLon = transectStartLon,
    dLat = transectDestLat,
    dLon = transectDestLon,
    samples = transectSamples
  ) => {
    setTransectLoading(true)
    setTransectError(null)
    fetchTerrainTransectProfile(sLat, sLon, dLat, dLon, samples)
      .then((data) => {
        setTransectResult(data)
        setTransectLoading(false)
      })
      .catch((err: unknown) => {
        setTransectError(err instanceof Error ? err.message : String(err))
        setTransectLoading(false)
      })
  }

  // Load classes, catalog, and statistics on mount
  useEffect(() => {
    setStatsLoading(true)
    Promise.all([
      fetchTerrainClasses().catch((err: unknown) => {
        console.warn('Failed to load terrain classes:', err)
        return null
      }),
      fetchTerrainLayers().catch((err: unknown) => {
        console.warn('Failed to load terrain layers:', err)
        return null
      }),
      fetchTerrainStatistics().catch((err: unknown) => {
        console.warn('Failed to load terrain statistics:', err)
        return null
      }),
    ])
      .then(([classesData, catalogData, statsData]) => {
        if (classesData) setClasses(classesData.classes)
        if (catalogData) setCatalog(catalogData)
        if (statsData) setStatistics(statsData)
        setStatsLoading(false)
      })
      .catch((err: unknown) => {
        setStatsError(err instanceof Error ? err.message : String(err))
        setStatsLoading(false)
      })
  }, [])

  // Auto-run first inspection on mount
  useEffect(() => {
    handleRunInspection(queryLat, queryLon, windowRadiusM)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRunInspection = (lat: number, lon: number, radiusM: number) => {
    setInspectLoading(true)
    setInspectError(null)
    inspectTerrainPoint(lat, lon, true, radiusM)
      .then((res) => {
        setInspectResult(res)
        setInspectLoading(false)
        if (onSelectCoords) {
          onSelectCoords({ lat, lon })
        }
      })
      .catch((err: unknown) => {
        setInspectError(err instanceof Error ? err.message : String(err))
        setInspectLoading(false)
      })
  }

  const applyPreset = (preset: PresetLocation) => {
    setQueryLat(preset.lat)
    setQueryLon(preset.lon)
    handleRunInspection(preset.lat, preset.lon, windowRadiusM)
  }

  // Render SVG transect profile
  const renderTransectSvg = (elevations: number[], label: string, stepM: number) => {
    if (!elevations || elevations.length < 2) {
      return <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No transect data available</div>
    }

    const minElev = Math.min(...elevations)
    const maxElev = Math.max(...elevations)
    const range = Math.max(1.0, maxElev - minElev)
    const width = 360
    const height = 90
    const padX = 35
    const padY = 15

    const points = elevations
      .map((val, idx) => {
        const x = padX + (idx / (elevations.length - 1)) * (width - 2 * padX)
        const y = height - padY - ((val - minElev) / range) * (height - 2 * padY)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

    const totalDistM = (elevations.length - 1) * stepM

    return (
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '0.6rem', borderRadius: 'var(--radius-xs)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>Range: {minElev.toFixed(1)}m to {maxElev.toFixed(1)}m (Δ {range.toFixed(1)}m)</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '80px', display: 'block' }}>
          {/* Baseline grid */}
          <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#303030" strokeWidth="1" />
          <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#303030" strokeWidth="1" />

          {/* Elevation Curve */}
          <polyline
            fill="none"
            stroke="#f5f5f5"
            strokeWidth="1.8"
            strokeLinejoin="round"
            points={points}
          />

          {/* Distance and Elevation Axis Labels */}
          <text x={padX} y={height - 2} fill="#737373" fontSize="8" fontFamily="var(--font-mono)">0m</text>
          <text x={width - padX - 25} y={height - 2} fill="#737373" fontSize="8" fontFamily="var(--font-mono)">{totalDistM.toFixed(0)}m</text>
          <text x={2} y={padY + 7} fill="#737373" fontSize="8" fontFamily="var(--font-mono)">{maxElev.toFixed(0)}m</text>
          <text x={2} y={height - padY} fill="#737373" fontSize="8" fontFamily="var(--font-mono)">{minElev.toFixed(0)}m</text>
        </svg>
      </div>
    )
  }

  return (
    <div className="page-container" style={{ padding: '1rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Precision Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '1px solid var(--border-default)',
        paddingBottom: '0.8rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '0.8rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              Advanced Terrain Intelligence
            </h2>
            <span style={{
              background: '#202020',
              border: '1px solid #404040',
              padding: '0.15rem 0.45rem',
              fontSize: '0.7rem',
              color: '#d4d4d4',
              borderRadius: 'var(--radius-xs)',
              fontFamily: 'var(--font-mono)',
            }}>
              PHASE 2 DEPLOYED
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            Multi-Resolution Analysis • Native 1.0m HiRISE DTM • 20m Regional CTX Synthesis • 7-Class Rule-Based Classifier
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge badge-derived" style={{ fontSize: '0.72rem' }}>
            EPISTEMIC: DERIVED & HEURISTIC
          </span>
          <span style={{
            background: '#111111',
            border: '1px solid #303030',
            color: '#a3a3a3',
            padding: '0.25rem 0.6rem',
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)',
          }}>
            HiRISE 1m Coverage: 76.98%
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-default)',
        marginBottom: '1.2rem',
        gap: '0.25rem',
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('INSPECTION')}
          style={{
            background: activeTab === 'INSPECTION' ? 'var(--bg-panel-elevated)' : 'transparent',
            color: activeTab === 'INSPECTION' ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid',
            borderColor: activeTab === 'INSPECTION' ? 'var(--border-default) var(--border-default) transparent var(--border-default)' : 'transparent',
            padding: '0.55rem 1.1rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderTopLeftRadius: 'var(--radius-xs)',
            borderTopRightRadius: 'var(--radius-xs)',
          }}
        >
          1. Multi-Resolution Coordinate Inspector
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('DERIVATIVES')}
          style={{
            background: activeTab === 'DERIVATIVES' ? 'var(--bg-panel-elevated)' : 'transparent',
            color: activeTab === 'DERIVATIVES' ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid',
            borderColor: activeTab === 'DERIVATIVES' ? 'var(--border-default) var(--border-default) transparent var(--border-default)' : 'transparent',
            padding: '0.55rem 1.1rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderTopLeftRadius: 'var(--radius-xs)',
            borderTopRightRadius: 'var(--radius-xs)',
          }}
        >
          2. Derivatives & Regional Statistics
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CLASSIFIER')}
          style={{
            background: activeTab === 'CLASSIFIER' ? 'var(--bg-panel-elevated)' : 'transparent',
            color: activeTab === 'CLASSIFIER' ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid',
            borderColor: activeTab === 'CLASSIFIER' ? 'var(--border-default) var(--border-default) transparent var(--border-default)' : 'transparent',
            padding: '0.55rem 1.1rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderTopLeftRadius: 'var(--radius-xs)',
            borderTopRightRadius: 'var(--radius-xs)',
          }}
        >
          3. 7-Class Geomorphic Classifier
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('VISUAL_QC')}
          style={{
            background: activeTab === 'VISUAL_QC' ? 'var(--bg-panel-elevated)' : 'transparent',
            color: activeTab === 'VISUAL_QC' ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid',
            borderColor: activeTab === 'VISUAL_QC' ? 'var(--border-default) var(--border-default) transparent var(--border-default)' : 'transparent',
            padding: '0.55rem 1.1rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderTopLeftRadius: 'var(--radius-xs)',
            borderTopRightRadius: 'var(--radius-xs)',
          }}
        >
          4. QC Raster Overlays
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('TRANSECT')
            if (!transectResult) {
              handleRunTransect()
            }
          }}
          style={{
            background: activeTab === 'TRANSECT' ? 'var(--bg-panel-elevated)' : 'transparent',
            color: activeTab === 'TRANSECT' ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid',
            borderColor: activeTab === 'TRANSECT' ? 'var(--border-default) var(--border-default) transparent var(--border-default)' : 'transparent',
            padding: '0.55rem 1.1rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderTopLeftRadius: 'var(--radius-xs)',
            borderTopRightRadius: 'var(--radius-xs)',
          }}
        >
          5. Elevation Transect & Cross-Section Tool
        </button>
      </div>

      {/* =========================================================================
          TAB 1: MULTI-RESOLUTION COORDINATE INSPECTOR
          ========================================================================= */}
      {activeTab === 'INSPECTION' && (
        <div>
          {/* Query Controls Card */}
          <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)', marginBottom: '1.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Coordinate Query & Windowed Read Controller
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Projection: IAU_2015:49900 → ESRI:103885 (Mars Equirectangular)
              </span>
            </div>

            {/* Presets */}
            <div style={{ marginBottom: '0.8rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.3rem' }}>Presets:</span>
              {PRESET_LOCATIONS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  style={{
                    background: '#141414',
                    border: '1px solid #333333',
                    color: '#d4d4d4',
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-xs)',
                    fontFamily: 'var(--font-sans)',
                  }}
                  title={`${preset.description} (${preset.coverage})`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="route-coord-input">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Latitude (°N):</span>
                <input
                  type="number"
                  step="0.0001"
                  value={queryLat}
                  onChange={(e) => setQueryLat(parseFloat(e.target.value) || 0)}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div className="route-coord-input">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Longitude (°E):</span>
                <input
                  type="number"
                  step="0.0001"
                  value={queryLon}
                  onChange={(e) => setQueryLon(parseFloat(e.target.value) || 0)}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div className="route-coord-input">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Window Radius:</span>
                <select
                  value={windowRadiusM}
                  onChange={(e) => setWindowRadiusM(parseFloat(e.target.value))}
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    padding: '0.35rem 0.5rem',
                    borderRadius: 'var(--radius-xs)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value={30}>30 m (60m box)</option>
                  <option value={60}>60 m (120m box)</option>
                  <option value={100}>100 m (200m box)</option>
                  <option value={150}>150 m (300m box)</option>
                </select>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleRunInspection(queryLat, queryLon, windowRadiusM)}
                disabled={inspectLoading}
                style={{ padding: '0.45rem 1.1rem', fontSize: '0.82rem', fontWeight: 600 }}
              >
                {inspectLoading ? 'Executing Windowed Read…' : 'Inspect Martian Coordinate'}
              </button>
            </div>

            {inspectError && (
              <div style={{ marginTop: '0.8rem', padding: '0.6rem', background: '#200e0e', border: '1px solid #7f1d1d', color: '#fca5a5', fontSize: '0.8rem' }}>
                Error querying coordinate: {inspectError}
              </div>
            )}
          </div>

          {/* Inspection Results */}
          {inspectResult && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1.2rem' }}>
              {/* Regional 20m Card */}
              <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', marginBottom: '0.8rem' }}>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                      Regional 20m Terrain Synthesis
                    </h4>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Cell footprint: 20m x 20m ({inspectResult.regional_analysis_20m.source_product ?? 'CTX/HiRISE synthesis'})
                    </span>
                  </div>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    background: inspectResult.regional_analysis_20m.is_valid ? '#1c2e1c' : '#2e1c1c',
                    color: inspectResult.regional_analysis_20m.is_valid ? '#86efac' : '#fca5a5',
                    fontSize: '0.7rem',
                    fontFamily: 'var(--font-mono)',
                    border: '1px solid',
                    borderColor: inspectResult.regional_analysis_20m.is_valid ? '#166534' : '#991b1b',
                  }}>
                    {inspectResult.regional_analysis_20m.is_valid ? 'VALID CELL' : 'OUT OF BOUNDS / NODATA'}
                  </span>
                </div>

                <div className="hazard-breakdown-grid" style={{ marginBottom: '0.8rem' }}>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Elevation (Areoid Datum)</div>
                    <div className="stat-value">{inspectResult.regional_analysis_20m.elevation_m?.toFixed(2) ?? 'N/A'} m</div>
                  </div>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Horn Gradient Slope</div>
                    <div className="stat-value" style={{
                      color: (inspectResult.regional_analysis_20m.slope_deg ?? 0) >= 25 ? 'var(--status-critical)' : 'var(--text-primary)',
                    }}>
                      {inspectResult.regional_analysis_20m.slope_deg?.toFixed(1) ?? 'N/A'}°
                    </div>
                  </div>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Riley Ruggedness (TRI)</div>
                    <div className="stat-value">{inspectResult.regional_analysis_20m.tri_m?.toFixed(3) ?? 'N/A'} m</div>
                  </div>
                  <div className="hazard-stat-box">
                    <div className="stat-label">Classification Confidence</div>
                    <div className="stat-value" style={{ fontFamily: 'var(--font-mono)' }}>
                      {inspectResult.regional_analysis_20m.confidence_score ? `${(inspectResult.regional_analysis_20m.confidence_score * 100).toFixed(0)}%` : 'N/A'}
                    </div>
                  </div>
                </div>

                {inspectResult.regional_analysis_20m.terrain_class && (
                  <div style={{
                    padding: '0.7rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        Class: {inspectResult.regional_analysis_20m.terrain_class.name}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-mono)',
                        color: inspectResult.regional_analysis_20m.terrain_class.hazard_risk.includes('CRITICAL') ? '#f87171' : '#d4d4d4',
                      }}>
                        {inspectResult.regional_analysis_20m.terrain_class.hazard_risk}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {inspectResult.regional_analysis_20m.terrain_class.description}
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span>Speed Factor: {inspectResult.regional_analysis_20m.terrain_class.speed_factor.toFixed(2)}x</span>
                      <span>Traversability: {inspectResult.regional_analysis_20m.terrain_class.traversability}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Local 1.0m HiRISE Micro-Terrain Card */}
              <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', marginBottom: '0.8rem' }}>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                      Native 1.0m HiRISE Micro-Topography
                    </h4>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Source: HiRISE DTM Delta Jezero DL (NASA PDS / USGS TRN) • Window: {inspectResult.local_micro_analysis_1m?.window_size_pixels[0] ?? 0}x{inspectResult.local_micro_analysis_1m?.window_size_pixels[1] ?? 0} px
                    </span>
                  </div>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    background: inspectResult.high_resolution_available ? '#1c2e1c' : '#262626',
                    color: inspectResult.high_resolution_available ? '#86efac' : '#a3a3a3',
                    fontSize: '0.7rem',
                    fontFamily: 'var(--font-mono)',
                    border: '1px solid',
                    borderColor: inspectResult.high_resolution_available ? '#166534' : '#404040',
                  }}>
                    {inspectResult.high_resolution_available ? '1.0m HiRISE ACTIVE' : 'HI-RES UNAVAILABLE'}
                  </span>
                </div>

                {inspectResult.local_micro_analysis_1m && inspectResult.local_micro_analysis_1m.is_available ? (
                  <>
                    <div className="hazard-breakdown-grid" style={{ marginBottom: '0.8rem' }}>
                      <div className="hazard-stat-box">
                        <div className="stat-label">1m Elevation Span</div>
                        <div className="stat-value">
                          {inspectResult.local_micro_analysis_1m.elevation.min_m.toFixed(1)} to {inspectResult.local_micro_analysis_1m.elevation.max_m.toFixed(1)} m
                        </div>
                      </div>
                      <div className="hazard-stat-box">
                        <div className="stat-label">1m Local Relief (Δz)</div>
                        <div className="stat-value">
                          {inspectResult.local_micro_analysis_1m.elevation.local_relief_m.toFixed(2)} m
                        </div>
                      </div>
                      <div className="hazard-stat-box">
                        <div className="stat-label">Micro-Slope (Mean / P90)</div>
                        <div className="stat-value">
                          {inspectResult.local_micro_analysis_1m.metrics_1m.slope_deg.mean?.toFixed(1) ?? 'N/A'}° / {inspectResult.local_micro_analysis_1m.metrics_1m.slope_deg.p90?.toFixed(1) ?? 'N/A'}°
                        </div>
                      </div>
                      <div className="hazard-stat-box">
                        <div className="stat-label">Vector Ruggedness (VRM)</div>
                        <div className="stat-value" style={{ fontFamily: 'var(--font-mono)' }}>
                          {inspectResult.local_micro_analysis_1m.metrics_1m.vector_ruggedness_measure.mean?.toFixed(5) ?? '0.00000'}
                        </div>
                      </div>
                    </div>

                    {/* Curvature & Roughness Line */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.4rem',
                      marginBottom: '0.8rem',
                      fontSize: '0.72rem',
                      background: 'var(--bg-secondary)',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-xs)',
                    }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Surface Roughness (σ):</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {inspectResult.local_micro_analysis_1m.metrics_1m.surface_roughness_m.mean?.toFixed(3) ?? 'N/A'} m
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Profile Curv (Kp):</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {inspectResult.local_micro_analysis_1m.metrics_1m.curvatures_1_per_m.profile_mean.toFixed(5)} /m
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)' }}>Planform Curv (Kc):</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {inspectResult.local_micro_analysis_1m.metrics_1m.curvatures_1_per_m.planform_mean.toFixed(5)} /m
                        </div>
                      </div>
                    </div>

                    {/* Transects */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.8rem' }}>
                      {renderTransectSvg(
                        inspectResult.local_micro_analysis_1m.transects_1m.west_to_east_elev_m,
                        'West → East Transect',
                        inspectResult.local_micro_analysis_1m.transects_1m.sample_step_m,
                      )}
                      {renderTransectSvg(
                        inspectResult.local_micro_analysis_1m.transects_1m.south_to_north_elev_m,
                        'South → North Transect',
                        inspectResult.local_micro_analysis_1m.transects_1m.sample_step_m,
                      )}
                    </div>

                    {/* Boulder Candidates */}
                    <div style={{
                      padding: '0.6rem',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Candidate Rock / Boulder Objects (Morphological Top-Hat & Shadow Association)
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          Total: {inspectResult.local_micro_analysis_1m.candidate_boulders.discrete_objects_found} objects
                        </span>
                      </div>

                      {inspectResult.local_micro_analysis_1m.candidate_boulders.top_candidates.length === 0 ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No candidate boulders &gt; 1.0m detected in this inspection window.</div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {inspectResult.local_micro_analysis_1m.candidate_boulders.top_candidates.slice(0, 6).map((bld: CandidateBoulderObject) => (
                            <div
                              key={bld.candidate_id}
                              style={{
                                background: '#1c1c1c',
                                border: '1px solid #333333',
                                padding: '0.2rem 0.4rem',
                                fontSize: '0.7rem',
                                fontFamily: 'var(--font-mono)',
                                color: '#e5e5e5',
                              }}
                            >
                              <span>{bld.candidate_id}: </span>
                              <span style={{ color: '#d4d4d4' }}>⌀ {bld.estimated_diameter_m.toFixed(1)}m</span>
                              <span style={{ color: '#737373', marginLeft: '0.3rem' }}>({(bld.score * 100).toFixed(0)}%)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Coordinate lies outside the high-resolution 1.0m HiRISE DTM footprint.
                    <br />
                    Analysis strictly adheres to authentic regional 20m CTX data without synthetic interpolation.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Epistemic Provenance Footer */}
          {inspectResult && (
            <div style={{
              marginTop: '1.2rem',
              padding: '0.6rem 0.8rem',
              background: '#111111',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}>
              <span><strong>Resampling Policy: </strong>{inspectResult.provenance_and_metadata.resampling_policy}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{inspectResult.provenance_and_metadata.disclaimer}</span>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: DERIVATIVES & REGIONAL STATISTICS
          ========================================================================= */}
      {activeTab === 'DERIVATIVES' && (
        <div>
          {statsLoading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading terrain derivatives and regional statistics…
            </div>
          )}

          {statsError && (
            <div style={{ padding: '0.8rem', background: '#200e0e', border: '1px solid #7f1d1d', color: '#fca5a5', marginBottom: '1rem' }}>
              Error: {statsError}
            </div>
          )}

          {statistics && (
            <>
              {/* Regional Metric Highlights Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.8rem', marginBottom: '1.2rem' }}>
                <div className="card" style={{ padding: '0.9rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Slope Gradient (Horn 1981)
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.2rem 0' }}>
                    {statistics.layers.slope?.mean_val?.toFixed(1) ?? 'N/A'}° <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>mean</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    Max: {statistics.layers.slope?.max_val?.toFixed(1) ?? 'N/A'}° | Min: {statistics.layers.slope?.min_val?.toFixed(1) ?? 'N/A'}°
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    {statistics.layers.slope?.method ?? 'Horn 3x3 convolution'}
                  </div>
                </div>

                <div className="card" style={{ padding: '0.9rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Terrain Ruggedness (Riley 1999)
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.2rem 0' }}>
                    {statistics.layers.tri?.mean_val?.toFixed(2) ?? 'N/A'} m <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>mean</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    Max TRI: {statistics.layers.tri?.max_val?.toFixed(2) ?? 'N/A'} m
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Root-mean-square elevation difference (3x3 window)
                  </div>
                </div>

                <div className="card" style={{ padding: '0.9rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Vector Ruggedness (Hobson/Sappington)
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.2rem 0' }}>
                    {statistics.layers.vrm?.mean_val?.toFixed(5) ?? '0.00000'} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>mean</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    Max VRM: {statistics.layers.vrm?.max_val?.toFixed(4) ?? '0.0000'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#a3a3a3', marginTop: '0.3rem' }}>
                    Decoupled from macroscopic slope steepness
                  </div>
                </div>

                <div className="card" style={{ padding: '0.9rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Local Relief & Roughness (Shepard 2001)
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.2rem 0' }}>
                    {statistics.layers.relief?.mean_val?.toFixed(1) ?? 'N/A'} m <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>relief</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    Max Relief: {statistics.layers.relief?.max_val?.toFixed(1) ?? 'N/A'} m | Mean σ: {statistics.layers.roughness?.mean_val?.toFixed(2) ?? 'N/A'} m
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    5x5 cell moving window (100m footprint)
                  </div>
                </div>
              </div>

              {/* Class Coverage Breakdown Table */}
              {statistics.class_distribution && (
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)', marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem', textTransform: 'uppercase' }}>
                      Geomorphic Class Coverage Distribution (Total Valid: {statistics.total_analyzed_cells.toLocaleString()} cells)
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Total Area: ~{(statistics.total_analyzed_cells * 0.0004).toFixed(1)} km²
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-default)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.5rem 0.6rem' }}>Geomorphic Code</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Cell Count</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Area (km²)</th>
                        <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Coverage %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(statistics.class_distribution).map(([clsCode, count]) => {
                        const pct = statistics.total_analyzed_cells > 0 ? (count / statistics.total_analyzed_cells) * 100 : 0
                        const areaKm2 = count * 0.0004
                        return (
                          <tr key={clsCode} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {clsCode}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {count.toLocaleString()}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {areaKm2.toFixed(2)}
                            </td>
                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                <span>{pct.toFixed(1)}%</span>
                                <div style={{ width: '40px', height: '4px', background: '#262626', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: '#d4d4d4' }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Scientific Algorithms Citation Panel */}
              <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)', marginBottom: '1.2rem' }}>
                <h4 style={{ margin: '0 0 0.6rem 0', color: 'var(--text-primary)', fontSize: '0.95rem', textTransform: 'uppercase' }}>
                  Scientific Derivatives Methodology & Literature Citations
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.8rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Slope & Aspect: </strong>
                    Horn (1981) 8-neighborhood weighted finite difference kernel. Evaluates surface normal vector and steepest fall-line direction.
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Terrain Ruggedness Index: </strong>
                    Riley et al. (1999) Root-mean-square elevation difference between central cell and its 8 contiguous neighbours.
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Topographic Curvatures: </strong>
                    Zevenbergen & Thorne (1987) 9-point bivariate polynomial fitting. Decomposes flow into profile and planform acceleration.
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Vector Ruggedness Measure: </strong>
                    Hobson (1972) / Sappington et al. (2007) 3D unit normal vector dispersion. Decouples local micro-ruggedness from macroscopic slope steepness.
                  </div>
                </div>
              </div>

              {/* Ingested Layer Catalog */}
              {catalog && catalog.layers && (
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <h4 style={{ margin: '0 0 0.6rem 0', color: 'var(--text-primary)', fontSize: '0.95rem', textTransform: 'uppercase' }}>
                    Authentic Processed Terrain Layers Catalog (Jezero Study Area)
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-default)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Layer ID</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Name</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Resolution</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Units</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Epistemic</th>
                        <th style={{ padding: '0.4rem 0.5rem' }}>Method / Formulation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(catalog.layers).map(([layerKey, layer]) => (
                        <tr key={layerKey} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)' }}>{layer.id}</td>
                          <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{layer.name}</td>
                          <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)' }}>{layer.resolution_m}m</td>
                          <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)' }}>{layer.unit}</td>
                          <td style={{ padding: '0.4rem 0.5rem' }}>
                            <span className="badge badge-derived" style={{ fontSize: '0.65rem' }}>{layer.epistemic_class}</span>
                          </td>
                          <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-secondary)' }}>{layer.method}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: 7-CLASS GEOMORPHIC CLASSIFIER
          ========================================================================= */}
      {activeTab === 'CLASSIFIER' && (
        <div>
          <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)', marginBottom: '1.2rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1rem', textTransform: 'uppercase' }}>
              Transparent Rule-Based 7-Class Geomorphic Hierarchy
            </h3>
            <p style={{ margin: '0 0 0.8rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Unlike opaque black-box machine learning models, Marswalk Planner uses an explainable scientific rule hierarchy based on slope thresholds, terrain ruggedness, morphological boulder scores, and aeolian ripple detection.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0.8rem' }}>
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.8rem',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '12px', height: '12px', background: cls.color_hex, border: '1px solid #555555' }} />
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                        {cls.id}: {cls.name}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      color: cls.hazard_risk.includes('CRITICAL') ? '#f87171' : '#d4d4d4',
                    }}>
                      {cls.hazard_risk}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {cls.description}
                  </p>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    borderTop: '1px solid #202020',
                    paddingTop: '0.3rem',
                  }}>
                    <span>Speed Factor: <strong>{cls.speed_factor.toFixed(2)}x</strong></span>
                    <span>Mobility: <strong>{cls.traversability}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Decision Rules Flowchart */}
          <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
            <h4 style={{ margin: '0 0 0.6rem 0', color: 'var(--text-primary)', fontSize: '0.95rem', textTransform: 'uppercase' }}>
              Heuristic Decision Priority Sequence
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              <div>[1] NoData or Boundary Exceeded → <strong>UNKNOWN_TERRAIN (0)</strong> [Impassable by default per AGENTS.md Rule 7]</div>
              <div>[2] Slope ≥ 25.0° OR TRI ≥ 2.5m → <strong>ROUGH_TERRAIN (3)</strong> [Steep scarp / fall barrier]</div>
              <div>[3] Boulder Score ≥ 0.48 → <strong>ROCKY_TERRAIN (2)</strong> [Blocky scree / boulder field]</div>
              <div>[4] Crater Score ≥ 0.48 AND LEV ≤ -1.2m → <strong>CRATERED_TERRAIN (6)</strong> [Impact bowl / depression]</div>
              <div>[5] Sand Score ≥ 0.65 AND Slope &lt; 18° → <strong>DUNE_LIKE_FEATURES (5)</strong> [Transverse Aeolian Ridges]</div>
              <div>[6] Sand Score in [0.45, 0.65) AND Slope &lt; 15° → <strong>POTENTIAL_LOOSE_MATERIAL (4)</strong> [Airfall dust mantle]</div>
              <div>[7] Default Baseline → <strong>SMOOTH_TERRAIN (1)</strong> [Optimal human walking corridor]</div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: VISUAL QC RASTER OVERLAYS
          ========================================================================= */}
      {activeTab === 'VISUAL_QC' && (
        <div>
          <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Select Layer:</span>
                {[
                  { id: 'classes', label: '7-Class Terrain Map' },
                  { id: 'slope', label: 'Slope Gradient (Horn)' },
                  { id: 'elevation', label: 'Elevation (Areoid Datum)' },
                  { id: 'ortho', label: '6m CTX Orthomosaic' },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedRasterLayer(l.id)}
                    style={{
                      background: selectedRasterLayer === l.id ? '#ffffff' : '#141414',
                      color: selectedRasterLayer === l.id ? '#090909' : '#d4d4d4',
                      border: '1px solid #333333',
                      padding: '0.3rem 0.7rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Opacity:</span>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={rasterOpacity}
                  onChange={(e) => setRasterOpacity(parseInt(e.target.value, 10))}
                  style={{ width: '100px' }}
                />
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{rasterOpacity}%</span>
              </div>
            </div>

            {/* Raster Viewer Container */}
            <div style={{
              background: '#050505',
              border: '1px solid var(--border-default)',
              position: 'relative',
              textAlign: 'center',
              overflow: 'hidden',
              minHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}>
              <img
                src={getTerrainRasterUrl(selectedRasterLayer)}
                alt={`Terrain layer ${selectedRasterLayer}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: '600px',
                  objectFit: 'contain',
                  opacity: rasterOpacity / 100,
                  transition: 'opacity 0.15s ease',
                  border: '1px solid #202020',
                }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />

              <div style={{
                marginTop: '0.8rem',
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}>
                Extents: 18.33°N to 18.57°N, 77.30°E to 77.64°E • Jezero Western Delta Footprint (1000 x 740 cells @ 20m)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: DYNAMIC ELEVATION TRANSECT & CROSS-SECTION TOOL (PHASE 7)
          ========================================================================= */}
      {activeTab === 'TRANSECT' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Transect Controls Card */}
          <div className="card" style={{
            padding: '1rem',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Martian Surface Cross-Section & Elevation Transect
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Continuous Geodesic Elevation & Slope Profiler Across Jezero Crater Formations
                </p>
              </div>

              {/* Preset Transect Buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {PRESET_TRANSECTS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTransectStartLat(preset.startLat)
                      setTransectStartLon(preset.startLon)
                      setTransectDestLat(preset.destLat)
                      setTransectDestLon(preset.destLon)
                      handleRunTransect(preset.startLat, preset.startLon, preset.destLat, preset.destLon)
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-xs)',
                      fontFamily: 'var(--font-mono)',
                    }}
                    title={preset.description}
                  >
                    📍 {preset.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Coordinate Inputs and Execution */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.8rem',
              alignItems: 'flex-end',
              background: 'var(--bg-secondary)',
              padding: '0.8rem',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  START LATITUDE (°N)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={transectStartLat}
                  onChange={(e) => setTransectStartLat(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  START LONGITUDE (°E)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={transectStartLon}
                  onChange={(e) => setTransectStartLon(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  DEST LATITUDE (°N)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={transectDestLat}
                  onChange={(e) => setTransectDestLat(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  DEST LONGITUDE (°E)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={transectDestLon}
                  onChange={(e) => setTransectDestLon(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  SAMPLES
                </label>
                <select
                  value={transectSamples}
                  onChange={(e) => setTransectSamples(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <option value={50}>50 samples</option>
                  <option value={100}>100 samples</option>
                  <option value={200}>200 samples</option>
                </select>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => handleRunTransect()}
                  disabled={transectLoading}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    color: '#000000',
                    border: 'none',
                    padding: '0.45rem',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    cursor: transectLoading ? 'wait' : 'pointer',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  {transectLoading ? 'EXTRACTING...' : 'COMPUTE PROFILE →'}
                </button>
              </div>
            </div>

            {transectError && (
              <div style={{ marginTop: '0.8rem', color: '#ff6b6b', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                ⚠️ {transectError}
              </div>
            )}
          </div>

          {/* Profile Results & Interactive SVG Visualizations */}
          {transectResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Telemetry Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.8rem',
              }}>
                <div className="card" style={{ padding: '0.8rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Transect Distance</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    {transectResult.transect_summary.total_distance_km} km
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {transectResult.transect_summary.total_distance_m.toLocaleString()} m surface length
                  </div>
                </div>

                <div className="card" style={{ padding: '0.8rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Elevation Range</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    Δ {Math.abs((transectResult.transect_summary.max_elevation_m ?? 0) - (transectResult.transect_summary.min_elevation_m ?? 0)).toFixed(1)} m
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {transectResult.transect_summary.min_elevation_m}m to {transectResult.transect_summary.max_elevation_m}m
                  </div>
                </div>

                <div className="card" style={{ padding: '0.8rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vertical Climbing Work</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    +{transectResult.transect_summary.elevation_gain_m}m
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Loss: -{transectResult.transect_summary.elevation_loss_m}m descent
                  </div>
                </div>

                <div className="card" style={{ padding: '0.8rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Slope Gradients</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    {transectResult.transect_summary.max_slope_deg}° max
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Mean: {transectResult.transect_summary.mean_slope_deg}° average
                  </div>
                </div>

                <div className="card" style={{ padding: '0.8rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>HiRISE 1m Coverage</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    {(transectResult.transect_summary.hirise_fraction * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Native sub-meter DTM extent
                  </div>
                </div>
              </div>

              {/* Main SVG Elevation Profile Chart */}
              <div className="card" style={{ padding: '1.2rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Surface Elevation Profile (MOLA Areoid Datum)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Datum: MOLA Areoid • 20m Aligned Analysis Grid
                  </div>
                </div>

                {/* SVG Elevation Chart */}
                {(() => {
                  const pts = transectResult.points
                  const validPts = pts.filter((p) => p.elevation_m !== null)
                  if (validPts.length < 2) return null

                  const minE = Math.min(...validPts.map((p) => p.elevation_m!))
                  const maxE = Math.max(...validPts.map((p) => p.elevation_m!))
                  const rangeE = Math.max(1.0, maxE - minE)
                  const totalDist = transectResult.transect_summary.total_distance_m

                  const w = 800
                  const h = 200
                  const padLeft = 55
                  const padRight = 30
                  const padTop = 20
                  const padBottom = 30

                  const chartW = w - padLeft - padRight
                  const chartH = h - padTop - padBottom

                  const polylineCoords = validPts
                    .map((p) => {
                      const x = padLeft + (p.distance_m / totalDist) * chartW
                      const y = padTop + chartH - ((p.elevation_m! - minE) / rangeE) * chartH
                      return `${x.toFixed(1)},${y.toFixed(1)}`
                    })
                    .join(' ')

                  const areaCoords = `${padLeft},${padTop + chartH} ` +
                    polylineCoords +
                    ` ${padLeft + chartW},${padTop + chartH}`

                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '220px', display: 'block', background: '#0a0a0a', border: '1px solid #202020' }}>
                      <defs>
                        <linearGradient id="elevAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                        const y = padTop + chartH * (1.0 - frac)
                        const elevLabel = (minE + frac * rangeE).toFixed(0)
                        return (
                          <g key={frac}>
                            <line x1={padLeft} y1={y} x2={padLeft + chartW} y2={y} stroke="#202020" strokeWidth="1" strokeDasharray="3, 3" />
                            <text x={padLeft - 8} y={y + 3} fill="#737373" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">
                              {elevLabel}m
                            </text>
                          </g>
                        )
                      })}

                      {/* Area Fill */}
                      <polygon points={areaCoords} fill="url(#elevAreaGrad)" />

                      {/* Elevation Line */}
                      <polyline
                        points={polylineCoords}
                        fill="none"
                        stroke="#f5f5f5"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />

                      {/* Distance X-Axis Ticks */}
                      {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                        const x = padLeft + chartW * frac
                        const distLabel = ((frac * totalDist) / 1000.0).toFixed(2) + 'km'
                        return (
                          <g key={frac}>
                            <line x1={x} y1={padTop + chartH} x2={x} y2={padTop + chartH + 4} stroke="#404040" strokeWidth="1" />
                            <text x={x} y={padTop + chartH + 16} fill="#737373" fontSize="9" textAnchor="middle" fontFamily="var(--font-mono)">
                              {distLabel}
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  )
                })()}

                {/* Slope Gradient Secondary Chart */}
                <div style={{ marginTop: '1.2rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#ffffff', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                    Slope Gradient Profile (Horn's Method)
                  </div>

                  {(() => {
                    const pts = transectResult.points
                    const validPts = pts.filter((p) => p.slope_deg !== null)
                    if (validPts.length < 2) return null

                    const maxS = Math.max(25.0, Math.max(...validPts.map((p) => p.slope_deg!)))
                    const totalDist = transectResult.transect_summary.total_distance_m

                    const w = 800
                    const h = 100
                    const padLeft = 55
                    const padRight = 30
                    const padTop = 10
                    const padBottom = 20

                    const chartW = w - padLeft - padRight
                    const chartH = h - padTop - padBottom

                    const slopePolyline = validPts
                      .map((p) => {
                        const x = padLeft + (p.distance_m / totalDist) * chartW
                        const y = padTop + chartH - (p.slope_deg! / maxS) * chartH
                        return `${x.toFixed(1)},${y.toFixed(1)}`
                      })
                      .join(' ')

                    // 15 deg and 20 deg hazard threshold lines
                    const y15 = padTop + chartH - (15.0 / maxS) * chartH
                    const y20 = padTop + chartH - (20.0 / maxS) * chartH

                    return (
                      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '110px', display: 'block', background: '#0a0a0a', border: '1px solid #202020' }}>
                        {/* 15 deg caution line */}
                        <line x1={padLeft} y1={y15} x2={padLeft + chartW} y2={y15} stroke="#d97706" strokeWidth="1" strokeDasharray="4, 4" opacity="0.7" />
                        <text x={padLeft + chartW - 5} y={y15 - 3} fill="#d97706" fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">15° Caution Threshold</text>

                        {/* 20 deg impassable line */}
                        <line x1={padLeft} y1={y20} x2={padLeft + chartW} y2={y20} stroke="#dc2626" strokeWidth="1" strokeDasharray="4, 4" opacity="0.7" />
                        <text x={padLeft + chartW - 5} y={y20 - 3} fill="#dc2626" fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">20° Impassable Barrier</text>

                        <polyline
                          points={slopePolyline}
                          fill="none"
                          stroke="#a3a3a3"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />

                        {/* Y axis labels */}
                        <text x={padLeft - 8} y={padTop + chartH} fill="#737373" fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">0°</text>
                        <text x={padLeft - 8} y={padTop + 8} fill="#737373" fontSize="8" textAnchor="end" fontFamily="var(--font-mono)">{maxS.toFixed(0)}°</text>
                      </svg>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
