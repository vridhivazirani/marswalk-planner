import React, { useEffect, useState } from 'react'
import type {
  AtlasCategorySummary,
  AtlasMapEntry,
  ProductTypeCode,
  ValidationStatusCode,
} from '../api/atlas'
import { fetchAtlasCatalogue, fetchMapDetails } from '../api/atlas'
import { GlobalMarsMap } from '../components/GlobalMarsMap'
import { RegionalMarsMap } from '../components/RegionalMarsMap'
import { GlobalMarsGlobe3D } from '../components/GlobalMarsGlobe3D'

export interface MapExplorerPageProps {
  initialTab?: ExplorerTab
  activeLayers?: Record<string, boolean>
  onToggleLayer?: (layerId: string) => void
  onSelectCoords?: (coords: { lat: number; lon: number }) => void
  onNavigateToPage?: (
    page:
      | 'digital-twin'
      | 'overview'
      | 'terrain'
      | 'hazards'
      | 'science'
      | 'route-planner'
      | 'data-hub'
      | 'map-explorer'
  ) => void
}

type ViewMode = 'GRID' | 'TABLE'
export type ExplorerTab =
  | 'MARS_EXPLORER'
  | 'MARS_MONOCHROME'
  | 'GLOBAL_GLOBE'
  | 'GLOBAL_MAP'
  | 'REGIONAL_MAP'
  | 'CATALOGUE'

const PRODUCT_TYPE_META: Record<
  ProductTypeCode,
  { label: string; desc: string; badgeClass: string }
> = {
  SRC: {
    label: 'SRC (Flight Archive)',
    desc: 'Raw/calibrated experiment data from official flight archives',
    badgeClass: 'badge-observed',
  },
  DRV: {
    label: 'DRV (Derived Topography)',
    desc: 'Deterministic spatial derivatives (slopes, hillshades, contours)',
    badgeClass: 'badge-derived',
  },
  VEC: {
    label: 'VEC (Vector Product)',
    desc: 'Discrete GIS geometric features (nomenclature, traverses, caches)',
    badgeClass: 'badge-observed',
  },
  INT: {
    label: 'INT (Interpretive Geology)',
    desc: 'Peer-reviewed geological units and spectral absorption indices',
    badgeClass: 'badge-interpreted',
  },
  SIM: {
    label: 'SIM (Simulation Model)',
    desc: 'Numerical physics scenarios, costmaps, and emergency corridors',
    badgeClass: 'badge-simulated',
  },
}

export const MapExplorerPage: React.FC<MapExplorerPageProps> = ({
  initialTab,
  activeLayers = {},
  onToggleLayer,
  onSelectCoords,
  onNavigateToPage,
}) => {
  const [explorerTab, setExplorerTab] = useState<ExplorerTab>(() => {
    if (initialTab) return initialTab
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      if (
        tabParam === 'MARS_EXPLORER' ||
        tabParam === 'MARS_MONOCHROME' ||
        tabParam === 'GLOBAL_GLOBE' ||
        tabParam === 'GLOBAL_MAP' ||
        tabParam === 'REGIONAL_MAP' ||
        tabParam === 'CATALOGUE'
      ) {
        return tabParam as ExplorerTab
      }
    }
    return 'GLOBAL_GLOBE'
  })

  const [prevInitialTab, setPrevInitialTab] = useState(initialTab)
  if (initialTab && initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab)
    setExplorerTab(initialTab)
  }
  const [entries, setEntries] = useState<AtlasMapEntry[]>([])
  const [categories, setCategories] = useState<AtlasCategorySummary[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState<number>(0)
  const [filteredCount, setFilteredCount] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)

  // Filtering State
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedEpistemic, setSelectedEpistemic] = useState<string>('ALL')
  const [selectedProductType, setSelectedProductType] = useState<string>('ALL')
  const [selectedValidation, setSelectedValidation] = useState<string>('ALL')
  const [viewMode, setViewMode] = useState<ViewMode>('GRID')

  // Pagination & Sorting State
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(20)
  const [sortBy, setSortBy] = useState<string>('id')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Detailed Dossier Modal / Drawer
  const [activeDossier, setActiveDossier] = useState<AtlasMapEntry | null>(null)
  const [loadingDossier, setLoadingDossier] = useState<boolean>(false)
  const [selectedRegionId, setSelectedRegionId] = useState<string>('reg-jezero')

  // Local layer toggle fallback
  const [localLayers, setLocalLayers] = useState<Record<string, boolean>>({
    ortho_imagery: true,
    ctx_20m_dtm: true,
    hirise_1m_dtm: true,
    perseverance_traverse: true,
  })

  const isLayerActive = (entry: AtlasMapEntry): boolean => {
    if (!entry.layer_id) return false
    if (activeLayers && entry.layer_id in activeLayers) {
      return !!activeLayers[entry.layer_id]
    }
    return !!localLayers[entry.layer_id]
  }

  const handleToggle = (entry: AtlasMapEntry) => {
    if (!entry.layer_id) return
    if (onToggleLayer) {
      onToggleLayer(entry.layer_id)
    } else {
      setLocalLayers((prev) => ({
        ...prev,
        [entry.layer_id!]: !prev[entry.layer_id!],
      }))
    }
  }

  const handleFocusCoords = (entry: AtlasMapEntry) => {
    if (onSelectCoords && entry.coverage_bounds && entry.coverage_bounds.length >= 2) {
      const centerLat = (entry.coverage_bounds[0][0] + entry.coverage_bounds[1][0]) / 2.0
      const centerLon = (entry.coverage_bounds[0][1] + entry.coverage_bounds[1][1]) / 2.0
      onSelectCoords({ lat: centerLat, lon: centerLon })
    }
  }

  const handleOpenDossier = async (entry: AtlasMapEntry) => {
    setActiveDossier(entry)
    setLoadingDossier(true)
    try {
      const fresh = await fetchMapDetails(entry.id)
      setActiveDossier(fresh)
    } catch {
      // Retain the cached entry
    } finally {
      setLoadingDossier(false)
    }
  }

  // Load catalog data on filter change
  useEffect(() => {
    let isCancelled = false
    fetchAtlasCatalogue({
      query: searchQuery || undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      epistemic_class: selectedEpistemic !== 'ALL' ? selectedEpistemic : undefined,
      product_type: selectedProductType !== 'ALL' ? selectedProductType : undefined,
      validation_status: selectedValidation !== 'ALL' ? selectedValidation : undefined,
      page,
      page_size: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder,
    })
      .then((data) => {
        if (!isCancelled) {
          setEntries(data.entries)
          setCategories(data.categories)
          setTotalCount(data.total_count)
          setFilteredCount(data.filtered_count)
          setTotalPages(data.total_pages)
          setLoading(false)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })
    return () => {
      isCancelled = true
    }
  }, [
    searchQuery,
    selectedCategory,
    selectedEpistemic,
    selectedProductType,
    selectedValidation,
    page,
    pageSize,
    sortBy,
    sortOrder,
  ])

  // Reset page to 1 when filters change
  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId)
    setPage(1)
  }

  const handleEpistemicChange = (val: string) => {
    setSelectedEpistemic(val)
    setPage(1)
  }

  const handleProductTypeChange = (val: string) => {
    setSelectedProductType(val)
    setPage(1)
  }

  const handleValidationChange = (val: string) => {
    setSelectedValidation(val)
    setPage(1)
  }

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    setPage(1)
  }

  const activeCount = entries.filter((e) => isLayerActive(e)).length

  // Calculate Product Type Summary Stats from available entries
  const typeCounts = {
    SRC: entries.filter((e) => e.product_type === 'SRC').length,
    DRV: entries.filter((e) => e.product_type === 'DRV').length,
    VEC: entries.filter((e) => e.product_type === 'VEC').length,
    INT: entries.filter((e) => e.product_type === 'INT').length,
    SIM: entries.filter((e) => e.product_type === 'SIM').length,
  }

  const getValidationBadge = (status: ValidationStatusCode | string) => {
    switch (status) {
      case 'VERIFIED_LOCAL':
        return { label: 'LOCAL_VERIFIED', style: { background: '#142517', border: '1px solid #1e3a24', color: '#86efac' } }
      case 'VERIFIED_REMOTE_WMS':
        return { label: 'REMOTE_WMS', style: { background: '#17202a', border: '1px solid #23384e', color: '#93c5fd' } }
      case 'VERIFIED_REMOTE_WMTS':
        return { label: 'REMOTE_WMTS', style: { background: '#1c1c28', border: '1px solid #2d2d48', color: '#c4b5fd' } }
      case 'VERIFIED_ARCHIVE':
        return { label: 'PDS_ARCHIVE', style: { background: '#231e13', border: '1px solid #423517', color: '#fde047' } }
      default:
        return { label: 'CATALOGUED', style: { background: '#202020', border: '1px solid #333333', color: '#a3a3a3' } }
    }
  }

  return (
    <div className="page-container" style={{ padding: '0.75rem 1rem 0.5rem', maxWidth: '100%', margin: '0 auto' }}>
      {/* Section A: Clean Minimalist Aerospace Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #222226',
          paddingBottom: '0.6rem',
          marginBottom: '0.6rem',
          flexWrap: 'wrap',
          gap: '0.6rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1
              style={{
                margin: 0,
                color: '#ffffff',
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              Planetary Explorer
            </h1>
            <span
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                padding: '0.1rem 0.4rem',
                fontSize: '0.65rem',
                color: '#a1a1aa',
                borderRadius: '2px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              IAU_2015:49900
            </span>
          </div>
          <p style={{ margin: '0.15rem 0 0 0', color: '#71717a', fontSize: '0.76rem', fontFamily: 'var(--font-mono, monospace)' }}>
            Multi-scale cartography & authentic NASA / USGS / ESA planetary datasets
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              background: '#121214',
              border: '1px solid #27272a',
              color: '#a1a1aa',
              padding: '0.2rem 0.5rem',
              fontSize: '0.68rem',
              borderRadius: '2px',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            Catalog: <strong style={{ color: '#ffffff' }}>{totalCount}</strong> Products
          </span>
          <span
            style={{
              background: '#121214',
              border: '1px solid #27272a',
              color: '#a1a1aa',
              padding: '0.2rem 0.5rem',
              fontSize: '0.68rem',
              borderRadius: '2px',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            Active: <strong style={{ color: '#ffffff' }}>{activeCount}</strong> Layers
          </span>
        </div>
      </div>

      {/* Section B: Primary Segmented Navigation Bar */}
      <div
        style={{
          display: 'inline-flex',
          gap: '0.25rem',
          background: '#121214',
          border: '1px solid #27272a',
          padding: '0.2rem',
          borderRadius: '4px',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setExplorerTab('MARS_EXPLORER')}
          style={{
            background: explorerTab === 'MARS_EXPLORER' ? '#c2410c' : 'transparent',
            color: explorerTab === 'MARS_EXPLORER' ? '#ffffff' : '#a1a1aa',
            border: 'none',
            padding: '0.35rem 0.85rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🔭</span>
          <span>01 Mars Explorer (Natural)</span>
        </button>

        <button
          type="button"
          onClick={() => setExplorerTab('MARS_MONOCHROME')}
          style={{
            background: explorerTab === 'MARS_MONOCHROME' ? '#ffffff' : 'transparent',
            color: explorerTab === 'MARS_MONOCHROME' ? '#000000' : '#a1a1aa',
            border: 'none',
            padding: '0.35rem 0.85rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🌓</span>
          <span>02 Mars Monochrome (B&W)</span>
        </button>

        <button
          type="button"
          onClick={() => setExplorerTab('GLOBAL_GLOBE')}
          style={{
            background: explorerTab === 'GLOBAL_GLOBE' ? '#ffffff' : 'transparent',
            color: explorerTab === 'GLOBAL_GLOBE' ? '#000000' : '#a1a1aa',
            border: 'none',
            padding: '0.35rem 0.85rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
            borderRadius: '2px',
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
          onClick={() => setExplorerTab('GLOBAL_MAP')}
          style={{
            background: explorerTab === 'GLOBAL_MAP' ? '#ffffff' : 'transparent',
            color: explorerTab === 'GLOBAL_MAP' ? '#000000' : '#a1a1aa',
            border: 'none',
            padding: '0.35rem 0.85rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🌐</span>
          <span>04 2D Atlas</span>
        </button>

        <button
          type="button"
          onClick={() => setExplorerTab('REGIONAL_MAP')}
          style={{
            background: explorerTab === 'REGIONAL_MAP' ? '#ffffff' : 'transparent',
            color: explorerTab === 'REGIONAL_MAP' ? '#000000' : '#a1a1aa',
            border: 'none',
            padding: '0.35rem 0.85rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🛰️</span>
          <span>Regional Atlas</span>
        </button>

        <button
          type="button"
          onClick={() => setExplorerTab('CATALOGUE')}
          style={{
            background: explorerTab === 'CATALOGUE' ? '#ffffff' : 'transparent',
            color: explorerTab === 'CATALOGUE' ? '#000000' : '#a1a1aa',
            border: 'none',
            padding: '0.35rem 0.85rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.15s ease',
          }}
        >
          <span>📋</span>
          <span>Dataset Catalogue ({totalCount})</span>
        </button>
      </div>

      {/* =========================================================================
          EXPERIENCE 01: MARS EXPLORER (NATURAL COLOUR AUTHENTIC MARS)
          ========================================================================= */}
      {explorerTab === 'MARS_EXPLORER' && (
        <div style={{ height: 'calc(100vh - 165px)', minHeight: '680px', marginBottom: '0.5rem' }}>
          <GlobalMarsMap
            displayMode="natural"
            initialBasemapId="viking_mdim21"
            onEnterJezero={() => {
              setSelectedRegionId('reg-jezero')
              setExplorerTab('REGIONAL_MAP')
            }}
            onSelectCoordinates={onSelectCoords}
          />
        </div>
      )}

      {/* =========================================================================
          EXPERIENCE 02: MARS MONOCHROME (AEROSPACE B&W SHADED RELIEF)
          ========================================================================= */}
      {explorerTab === 'MARS_MONOCHROME' && (
        <div style={{ height: 'calc(100vh - 165px)', minHeight: '680px', marginBottom: '0.5rem' }}>
          <GlobalMarsMap
            displayMode="monochrome"
            initialBasemapId="mola_shaded_relief"
            onEnterJezero={() => {
              setSelectedRegionId('reg-jezero')
              setExplorerTab('REGIONAL_MAP')
            }}
            onSelectCoordinates={onSelectCoords}
          />
        </div>
      )}

      {/* =========================================================================
          TAB 0: GLOBAL 3D MARS GLOBE (MILESTONE 3.0)
          ========================================================================= */}
      {explorerTab === 'GLOBAL_GLOBE' && (
        <div style={{ height: 'calc(100vh - 165px)', minHeight: '680px', marginBottom: '0.5rem' }}>
          <GlobalMarsGlobe3D
            onEnterJezero={() => {
              setSelectedRegionId('reg-jezero')
              setExplorerTab('REGIONAL_MAP')
            }}
            onEnterRegion={(regionId) => {
              setSelectedRegionId(regionId)
              setExplorerTab('REGIONAL_MAP')
            }}
            onSelectCoordinates={onSelectCoords}
          />
        </div>
      )}

      {/* =========================================================================
          TAB 1: GLOBAL MARS 2D MAP VIEW (MILESTONE 2.1)
          ========================================================================= */}
      {explorerTab === 'GLOBAL_MAP' && (
        <div style={{ height: 'calc(100vh - 165px)', minHeight: '680px', marginBottom: '0.5rem' }}>
          <GlobalMarsMap
            onEnterJezero={() => {
              setSelectedRegionId('reg-jezero')
              setExplorerTab('REGIONAL_MAP')
            }}
            onSelectCoordinates={onSelectCoords}
          />
        </div>
      )}

      {/* =========================================================================
          TAB 2: MULTI-REGION EXPLORATION ENVIRONMENT (STAGE B — 12 PRIORITY REGIONS)
          ========================================================================= */}
      {explorerTab === 'REGIONAL_MAP' && (
        <div style={{ height: 'calc(100vh - 165px)', minHeight: '680px', marginBottom: '0.5rem' }}>
          <RegionalMarsMap
            initialRegionId={selectedRegionId}
            onBackToGlobal={() => setExplorerTab('GLOBAL_GLOBE')}
            onEnterLocalTwin={() => {
              if (onNavigateToPage) onNavigateToPage('digital-twin')
            }}
          />
        </div>
      )}

      {/* =========================================================================
          TAB 2: DATASET CATALOGUE ENGINE (MILESTONE 1 PRIMARY INTERFACE)
          ========================================================================= */}
      {explorerTab === 'CATALOGUE' && (
        <>
          {/* 1. Catalogue Overview Summary Bar */}
      <div
        className="card"
        style={{
          padding: '0.8rem 1rem',
          marginBottom: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0.8rem',
          background: '#121212',
          border: '1px solid #262626',
        }}
      >
        <div style={{ borderLeft: '3px solid #f5f5f5', paddingLeft: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Catalogued</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f5f5f5' }}>{totalCount} Products</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>11 Dedicated Categories</div>
        </div>

        <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Source Datasets (SRC)</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#93c5fd' }}>{typeCounts.SRC} Visible</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>MGS, MRO, MEX Archives</div>
        </div>

        <div style={{ borderLeft: '3px solid #10b981', paddingLeft: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Derived Rasters (DRV)</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#86efac' }}>{typeCounts.DRV} Visible</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Slopes, VRM, Contours</div>
        </div>

        <div style={{ borderLeft: '3px solid #8b5cf6', paddingLeft: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vector Layers (VEC)</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#c4b5fd' }}>{typeCounts.VEC} Visible</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Traverses, Depots, Bounds</div>
        </div>

        <div style={{ borderLeft: '3px solid #f59e0b', paddingLeft: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Interpretive (INT)</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fde047' }}>{typeCounts.INT} Visible</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Geology & CRISM Indices</div>
        </div>

        <div style={{ borderLeft: '3px solid #ec4899', paddingLeft: '0.6rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Simulations (SIM)</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f472b6' }}>{typeCounts.SIM} Visible</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Thermal & Abort Corridors</div>
        </div>
      </div>

      {/* 2. Control Bar: Search, View Mode, Sorting */}
      <div
        className="card"
        style={{
          padding: '0.8rem 1rem',
          marginBottom: '0.8rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.8rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#141414',
        }}
      >
        {/* Search Field */}
        <div style={{ flex: '1 1 280px', display: 'flex', alignItems: 'center', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '0.6rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name, instrument, mission, product ID (PLN-SRC-01), or tags…"
            style={{
              width: '100%',
              padding: '0.45rem 0.6rem 0.45rem 2rem',
              background: '#090909',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-xs)',
              fontFamily: 'var(--font-mono)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* View Mode, Sort and Page Size Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Sort By Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                background: '#090909',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                padding: '0.35rem 0.5rem',
                borderRadius: 'var(--radius-xs)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <option value="id">Product ID</option>
              <option value="canonical_id">Canonical ID</option>
              <option value="name">Product Title</option>
              <option value="product_type">Product Type</option>
              <option value="epistemic_class">Epistemic Class</option>
              <option value="category">Category</option>
              <option value="resolution">Spatial Resolution</option>
            </select>

            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              title={`Switch to ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
              style={{
                background: '#090909',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                padding: '0.35rem 0.55rem',
                cursor: 'pointer',
                borderRadius: 'var(--radius-xs)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {sortOrder === 'asc' ? '▲ ASC' : '▼ DESC'}
            </button>
          </div>

          {/* Page Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              style={{
                background: '#090909',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                padding: '0.35rem 0.5rem',
                borderRadius: 'var(--radius-xs)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* View Toggle (Grid / Table) */}
          <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setViewMode('GRID')}
              style={{
                background: viewMode === 'GRID' ? '#ffffff' : '#090909',
                color: viewMode === 'GRID' ? '#090909' : '#a3a3a3',
                border: 'none',
                padding: '0.35rem 0.65rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              <span>⊞</span> Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              style={{
                background: viewMode === 'TABLE' ? '#ffffff' : '#090909',
                color: viewMode === 'TABLE' ? '#090909' : '#a3a3a3',
                border: 'none',
                padding: '0.35rem 0.65rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              <span>≡</span> Table
            </button>
          </div>
        </div>
      </div>

      {/* 3. Filter Ribbons: Epistemic Class, Product Type, Validation Status */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          marginBottom: '1rem',
          background: '#111111',
          padding: '0.6rem 0.8rem',
          border: '1px solid #262626',
        }}
      >
        {/* Epistemic Classification Filters */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: '100px', textTransform: 'uppercase' }}>
            Epistemic:
          </span>
          {['ALL', 'OBSERVED', 'DERIVED', 'INTERPRETED', 'HEURISTIC', 'SIMULATED'].map((cls) => {
            const isSelected = selectedEpistemic === cls
            return (
              <button
                key={cls}
                type="button"
                onClick={() => handleEpistemicChange(cls)}
                style={{
                  background: isSelected ? '#ffffff' : '#181818',
                  color: isSelected ? '#090909' : '#a3a3a3',
                  border: '1px solid',
                  borderColor: isSelected ? '#ffffff' : '#303030',
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {cls}
              </button>
            )
          })}
        </div>

        {/* Product Type Filters (SRC, DRV, VEC, INT, SIM) */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: '100px', textTransform: 'uppercase' }}>
            Product Type:
          </span>
          {['ALL', 'SRC', 'DRV', 'VEC', 'INT', 'SIM'].map((pt) => {
            const isSelected = selectedProductType === pt
            return (
              <button
                key={pt}
                type="button"
                onClick={() => handleProductTypeChange(pt)}
                style={{
                  background: isSelected ? '#ffffff' : '#181818',
                  color: isSelected ? '#090909' : '#a3a3a3',
                  border: '1px solid',
                  borderColor: isSelected ? '#ffffff' : '#303030',
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)',
                }}
                title={pt !== 'ALL' ? PRODUCT_TYPE_META[pt as ProductTypeCode]?.desc : 'All product types'}
              >
                {pt === 'ALL' ? 'ALL TYPES' : PRODUCT_TYPE_META[pt as ProductTypeCode]?.label}
              </button>
            )
          })}
        </div>

        {/* Validation Status Filters */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: '100px', textTransform: 'uppercase' }}>
            Validation:
          </span>
          {['ALL', 'VERIFIED_LOCAL', 'VERIFIED_REMOTE_WMS', 'VERIFIED_REMOTE_WMTS', 'VERIFIED_ARCHIVE', 'CATALOGUED'].map((vs) => {
            const isSelected = selectedValidation === vs
            return (
              <button
                key={vs}
                type="button"
                onClick={() => handleValidationChange(vs)}
                style={{
                  background: isSelected ? '#ffffff' : '#181818',
                  color: isSelected ? '#090909' : '#a3a3a3',
                  border: '1px solid',
                  borderColor: isSelected ? '#ffffff' : '#303030',
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {vs.replace('VERIFIED_', '')}
              </button>
            )
          })}
        </div>
      </div>

      {/* 4. Category Tabs Ribbon (All 11 Categories with live counts) */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          paddingBottom: '0.6rem',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={() => handleCategoryChange('all')}
          style={{
            background: selectedCategory === 'all' ? '#ffffff' : '#141414',
            color: selectedCategory === 'all' ? '#090909' : '#d4d4d4',
            border: '1px solid',
            borderColor: selectedCategory === 'all' ? '#ffffff' : '#303030',
            padding: '0.35rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderRadius: 'var(--radius-xs)',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span>◈</span>
          <span>All Categories</span>
          <span
            style={{
              background: selectedCategory === 'all' ? '#090909' : '#262626',
              color: selectedCategory === 'all' ? '#ffffff' : '#a3a3a3',
              fontSize: '0.65rem',
              padding: '0.1rem 0.35rem',
              borderRadius: 'var(--radius-xs)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {totalCount}
          </span>
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              style={{
                background: isSelected ? '#ffffff' : '#141414',
                color: isSelected ? '#090909' : '#d4d4d4',
                border: '1px solid',
                borderColor: isSelected ? '#ffffff' : '#303030',
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                borderRadius: 'var(--radius-xs)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
              title={cat.description}
            >
              <span>{cat.icon}</span>
              <span>{cat.title}</span>
              <span
                style={{
                  background: isSelected ? '#090909' : '#262626',
                  color: isSelected ? '#ffffff' : '#a3a3a3',
                  fontSize: '0.65rem',
                  padding: '0.1rem 0.35rem',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {cat.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            🛰️ Querying Marswalk Planetary Catalogue Registry…
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '0.8rem',
            background: '#200e0e',
            border: '1px solid #7f1d1d',
            color: '#fca5a5',
            marginBottom: '1rem',
            fontSize: '0.85rem',
          }}
        >
          Failed to load catalogue: {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && entries.length === 0 && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🛰️</div>
          <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
            No planetary map products match the active query.
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            Active filters: Category [{selectedCategory}] • Epistemic [{selectedEpistemic}] • Type [{selectedProductType}] • Validation [{selectedValidation}]
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setSelectedCategory('all')
              setSelectedEpistemic('ALL')
              setSelectedProductType('ALL')
              setSelectedValidation('ALL')
              setPage(1)
            }}
            style={{
              marginTop: '1rem',
              background: '#202020',
              border: '1px solid #404040',
              color: '#f5f5f5',
              padding: '0.4rem 0.8rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 1: GRID CARDS
          ========================================================================= */}
      {!loading && !error && viewMode === 'GRID' && entries.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '1rem',
          }}
        >
          {entries.map((entry) => {
            const active = isLayerActive(entry)
            const valBadge = getValidationBadge(entry.validation_status)
            return (
              <div
                key={entry.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: active ? '1px solid #f5f5f5' : '1px solid var(--border-default)',
                  background: active ? '#141414' : '#101010',
                  transition: 'border-color 0.15s ease',
                  padding: '1rem',
                  position: 'relative',
                }}
              >
                <div>
                  {/* Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.5rem',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1rem' }}>{entry.category_icon}</span>
                      <span
                        style={{
                          background: '#1c1c1c',
                          border: '1px solid #333333',
                          padding: '0.1rem 0.4rem',
                          fontSize: '0.68rem',
                          color: '#ffffff',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                        }}
                      >
                        {entry.canonical_id || entry.id}
                      </span>
                      <span
                        className={`badge badge-${entry.epistemic_class.toLowerCase()}`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        {entry.epistemic_class}
                      </span>
                      <span
                        style={{
                          background: '#181818',
                          border: '1px solid #333333',
                          padding: '0.1rem 0.35rem',
                          fontSize: '0.65rem',
                          color: '#d4d4d4',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {entry.product_type}
                      </span>
                    </div>

                    <span
                      style={{
                        padding: '0.15rem 0.4rem',
                        fontSize: '0.62rem',
                        fontFamily: 'var(--font-mono)',
                        borderRadius: '2px',
                        ...valBadge.style,
                      }}
                    >
                      {valBadge.label}
                    </span>
                  </div>

                  {/* Title & Clickable Inspection Trigger */}
                  <h4
                    onClick={() => handleOpenDossier(entry)}
                    style={{
                      margin: '0 0 0.35rem 0',
                      color: 'var(--text-primary)',
                      fontSize: '0.92rem',
                      lineHeight: 1.3,
                      cursor: 'pointer',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#ffffff'
                      e.currentTarget.style.textDecoration = 'underline'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-primary)'
                      e.currentTarget.style.textDecoration = 'none'
                    }}
                  >
                    {entry.name}
                  </h4>

                  {/* Mission & Source */}
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.6rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <span>🛰️ {entry.instrument_mission}</span>
                    <span>•</span>
                    <span style={{ color: 'var(--text-muted)' }}>{entry.source_organisation}</span>
                  </div>

                  {/* Physical Description */}
                  <p
                    style={{
                      fontSize: '0.76rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.45,
                      marginBottom: '0.8rem',
                      minHeight: '2.4rem',
                    }}
                  >
                    {entry.description}
                  </p>

                  {/* Geodetic Telemetry Block */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.35rem 0.6rem',
                      background: '#090909',
                      border: '1px solid #202020',
                      padding: '0.6rem',
                      borderRadius: 'var(--radius-xs)',
                      marginBottom: '0.8rem',
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Resolution: </span>
                      <span style={{ color: '#f5f5f5' }}>{entry.original_spatial_resolution || entry.resolution}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>CRS: </span>
                      <span style={{ color: '#f5f5f5' }} title={entry.crs}>
                        {entry.crs.length > 18 ? `${entry.crs.slice(0, 18)}…` : entry.crs}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Datum: </span>
                      <span style={{ color: '#f5f5f5' }} title={entry.vertical_datum}>
                        {entry.vertical_datum === 'NOT_APPLICABLE'
                          ? 'N/A (2D Layer)'
                          : entry.vertical_datum.length > 18
                          ? `${entry.vertical_datum.slice(0, 18)}…`
                          : entry.vertical_datum}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Archive ID: </span>
                      <span style={{ color: '#f5f5f5' }} title={entry.product_identifier}>
                        {entry.product_identifier.length > 16 ? `${entry.product_identifier.slice(0, 16)}…` : entry.product_identifier}
                      </span>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Coverage: </span>
                      <span style={{ color: '#f5f5f5' }}>{entry.spatial_coverage || entry.coverage}</span>
                    </div>
                  </div>

                  {/* Scientific Caveats Snippet */}
                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      marginBottom: '0.8rem',
                      borderLeft: '2px solid #404040',
                      paddingLeft: '0.5rem',
                      lineHeight: 1.35,
                    }}
                  >
                    {entry.known_limitations || entry.caveats_limitations}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '0.6rem',
                    marginTop: '0.4rem',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenDossier(entry)}
                      style={{
                        background: '#181818',
                        border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-xs)',
                        fontWeight: 600,
                      }}
                    >
                      Inspect Dossier ↗
                    </button>

                    {onSelectCoords && entry.coverage_bounds && (
                      <button
                        type="button"
                        onClick={() => handleFocusCoords(entry)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-default)',
                          color: 'var(--text-secondary)',
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-xs)',
                        }}
                        title="Center map on dataset bounds"
                      >
                        Target
                      </button>
                    )}

                    {entry.doi_or_url.startsWith('http') && (
                      <a
                        href={entry.doi_or_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          textDecoration: 'none',
                          color: '#a3a3a3',
                          border: '1px solid var(--border-default)',
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.72rem',
                          borderRadius: 'var(--radius-xs)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                        }}
                      >
                        PDS ↗
                      </a>
                    )}
                  </div>

                  {/* Toggle Layer Button (If renderable layer exists) */}
                  {entry.layer_id ? (
                    <button
                      type="button"
                      onClick={() => handleToggle(entry)}
                      style={{
                        background: active ? '#ffffff' : '#202020',
                        color: active ? '#090909' : '#ffffff',
                        border: '1px solid #404040',
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-xs)',
                      }}
                    >
                      {active ? '● Layer Active' : '○ Enable Layer'}
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Catalogued Metadata
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 2: COMPACT MISSION CONTROL TABLE
          ========================================================================= */}
      {!loading && !error && viewMode === 'TABLE' && entries.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#141414', borderBottom: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.6rem 0.8rem' }}>CANONICAL ID</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>PRODUCT TITLE</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>CATEGORY</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>TYPE</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>EPISTEMIC</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>RESOLUTION</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>CRS / DATUM</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>STATUS</th>
                <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const active = isLayerActive(entry)
                const valBadge = getValidationBadge(entry.validation_status)
                return (
                  <tr
                    key={entry.id}
                    style={{
                      borderBottom: '1px solid #202020',
                      background: active ? '#141414' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.55rem 0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f5f5f5' }}>
                      {entry.canonical_id || entry.id}
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem' }}>
                      <div
                        onClick={() => handleOpenDossier(entry)}
                        style={{ color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        {entry.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {entry.instrument_mission} • {entry.source_organisation}
                      </div>
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem', whiteSpace: 'nowrap' }}>
                      <span style={{ marginRight: '0.3rem' }}>{entry.category_icon}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{entry.category_name}</span>
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ background: '#202020', padding: '0.1rem 0.35rem', borderRadius: '2px', color: '#d4d4d4' }}>
                        {entry.product_type}
                      </span>
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem' }}>
                      <span className={`badge badge-${entry.epistemic_class.toLowerCase()}`} style={{ fontSize: '0.62rem' }}>
                        {entry.epistemic_class}
                      </span>
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {entry.original_spatial_resolution || entry.resolution}
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      <div>{entry.crs.length > 20 ? `${entry.crs.slice(0, 20)}…` : entry.crs}</div>
                      <div>
                        {entry.vertical_datum === 'NOT_APPLICABLE'
                          ? 'Datum: N/A (2D)'
                          : entry.vertical_datum.length > 20
                          ? `${entry.vertical_datum.slice(0, 20)}…`
                          : entry.vertical_datum}
                      </div>
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem' }}>
                      <span
                        style={{
                          padding: '0.12rem 0.4rem',
                          fontSize: '0.62rem',
                          fontFamily: 'var(--font-mono)',
                          borderRadius: '2px',
                          ...valBadge.style,
                        }}
                      >
                        {valBadge.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenDossier(entry)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-default)',
                          color: 'var(--text-secondary)',
                          padding: '0.2rem 0.45rem',
                          fontSize: '0.68rem',
                          cursor: 'pointer',
                          marginRight: '0.3rem',
                        }}
                      >
                        Inspect
                      </button>
                      {entry.layer_id && (
                        <button
                          type="button"
                          onClick={() => handleToggle(entry)}
                          style={{
                            background: active ? '#ffffff' : '#202020',
                            color: active ? '#090909' : '#f5f5f5',
                            border: '1px solid #404040',
                            padding: '0.2rem 0.45rem',
                            fontSize: '0.68rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {active ? 'Active' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Pagination Controls Footer */}
      {!loading && !error && filteredCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.8rem 1rem',
            background: '#111111',
            border: '1px solid var(--border-subtle)',
            marginTop: '1rem',
            flexWrap: 'wrap',
            gap: '0.6rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Showing <strong>{entries.length}</strong> of <strong>{filteredCount}</strong> matched products (Total: {totalCount})
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              style={{
                background: page <= 1 ? '#181818' : '#262626',
                color: page <= 1 ? '#555555' : '#f5f5f5',
                border: '1px solid #333333',
                padding: '0.3rem 0.6rem',
                fontSize: '0.72rem',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                borderRadius: '2px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ◀ Previous
            </button>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', padding: '0 0.4rem' }}>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              style={{
                background: page >= totalPages ? '#181818' : '#262626',
                color: page >= totalPages ? '#555555' : '#f5f5f5',
                border: '1px solid #333333',
                padding: '0.3rem 0.6rem',
                fontSize: '0.72rem',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                borderRadius: '2px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Next ▶
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {/* =========================================================================
          DETAILED DATASET DOSSIER INSPECTION MODAL (MILESTONE 1 REQUIREMENT)
          ========================================================================= */}
      {activeDossier && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setActiveDossier(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '820px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#101010',
              border: '1px solid #404040',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.8rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>{activeDossier.category_icon}</span>
                  <span
                    style={{
                      background: '#1f1f1f',
                      border: '1px solid #404040',
                      padding: '0.15rem 0.5rem',
                      fontSize: '0.75rem',
                      color: '#ffffff',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                    }}
                  >
                    {activeDossier.canonical_id || activeDossier.id}
                  </span>
                  <span className={`badge badge-${activeDossier.epistemic_class.toLowerCase()}`}>
                    {activeDossier.epistemic_class}
                  </span>
                  <span
                    style={{
                      background: '#242424',
                      border: '1px solid #3d3d3d',
                      padding: '0.15rem 0.45rem',
                      fontSize: '0.7rem',
                      color: '#d4d4d4',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {activeDossier.product_type}
                  </span>
                </div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.15rem' }}>
                  {activeDossier.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveDossier(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid #333333',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  padding: '0.25rem 0.6rem',
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              >
                ✕ Close
              </button>
            </div>

            {loadingDossier && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Fetching verified server record…
              </div>
            )}

            {/* Scientific Description */}
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                Scientific Physical Description
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.84rem', lineHeight: 1.55 }}>
                {activeDossier.description}
              </div>
            </div>

            {/* Complete Milestone 1 Mandatory Metadata Grid */}
            <div
              style={{
                background: '#161616',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.9rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#f5f5f5',
                  marginBottom: '0.6rem',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid #262626',
                  paddingBottom: '0.3rem',
                }}
              >
                Full Geodetic & Technical Metadata Record
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '170px 1fr',
                  gap: '0.45rem 0.8rem',
                  fontSize: '0.74rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>Canonical ID:</span>
                <span style={{ color: '#f5f5f5', fontWeight: 700 }}>{activeDossier.canonical_id || activeDossier.id}</span>

                <span style={{ color: 'var(--text-muted)' }}>Legacy / Internal ID:</span>
                <span style={{ color: '#d4d4d4' }}>{activeDossier.id}</span>

                <span style={{ color: 'var(--text-muted)' }}>Product Type:</span>
                <span style={{ color: '#f5f5f5' }}>
                  {activeDossier.product_type} ({PRODUCT_TYPE_META[activeDossier.product_type as ProductTypeCode]?.label || activeDossier.product_type})
                </span>

                <span style={{ color: 'var(--text-muted)' }}>Epistemic Class:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.epistemic_class}</span>

                <span style={{ color: 'var(--text-muted)' }}>Category:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.category_name} ({activeDossier.category})</span>

                <span style={{ color: 'var(--text-muted)' }}>Mission & Instrument:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.instrument_mission}</span>

                <span style={{ color: 'var(--text-muted)' }}>Source Organisation:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.source_organisation || activeDossier.source}</span>

                <span style={{ color: 'var(--text-muted)' }}>Archive Product ID:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.product_identifier}</span>

                <span style={{ color: 'var(--text-muted)' }}>Original Spatial Res:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.original_spatial_resolution || activeDossier.resolution}</span>

                <span style={{ color: 'var(--text-muted)' }}>Processing Resolution:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.processing_resolution || 'Native (Unresampled)'}</span>

                <span style={{ color: 'var(--text-muted)' }}>Spatial Coverage:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.spatial_coverage || activeDossier.coverage}</span>

                <span style={{ color: 'var(--text-muted)' }}>Native CRS:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.native_crs || activeDossier.crs}</span>

                <span style={{ color: 'var(--text-muted)' }}>Processing CRS:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.processing_crs || activeDossier.crs}</span>

                <span style={{ color: 'var(--text-muted)' }}>Display CRS:</span>
                <span style={{ color: '#f5f5f5' }}>{activeDossier.display_crs || 'IAU_2015:49900 (Equirectangular Mars Sphere Display)'}</span>

                <span style={{ color: 'var(--text-muted)' }}>Vertical Datum:</span>
                <span style={{ color: '#f5f5f5' }}>
                  {activeDossier.vertical_datum === 'NOT_APPLICABLE'
                    ? 'NOT_APPLICABLE (2D / Planimetric Layer)'
                    : activeDossier.vertical_datum}
                </span>

                <span style={{ color: 'var(--text-muted)' }}>Validation Status:</span>
                <span style={{ color: '#86efac' }}>{activeDossier.validation_status}</span>

                <span style={{ color: 'var(--text-muted)' }}>Processing History:</span>
                <span style={{ color: '#d4d4d4' }}>{activeDossier.processing_history || activeDossier.processing_status}</span>

                <span style={{ color: 'var(--text-muted)' }}>Licence & Attribution:</span>
                <span style={{ color: '#d4d4d4' }}>{activeDossier.licence_attribution || 'Public Domain / NASA Open Data Policy'}</span>

                <span style={{ color: 'var(--text-muted)' }}>Observation Era:</span>
                <span style={{ color: '#d4d4d4' }}>{activeDossier.observation_date}</span>

                <span style={{ color: 'var(--text-muted)' }}>Permanent Archive Link:</span>
                <span style={{ color: '#93c5fd', wordBreak: 'break-all' }}>{activeDossier.doi_or_url}</span>
              </div>
            </div>

            {/* Scientific Caveats & Known Limitations */}
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Known Limitations & Operational Caveats
              </div>
              <div
                style={{
                  background: '#141414',
                  border: '1px solid #262626',
                  borderLeft: '3px solid #737373',
                  padding: '0.65rem 0.85rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                  fontSize: '0.78rem',
                }}
              >
                {activeDossier.known_limitations || activeDossier.caveats_limitations}
              </div>
            </div>

            {/* Tags Ribbon */}
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Search & Provenance Tags:
              </div>
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                {activeDossier.tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      background: '#1c1c1c',
                      border: '1px solid #333333',
                      padding: '0.15rem 0.45rem',
                      fontSize: '0.68rem',
                      color: '#a3a3a3',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                gap: '0.6rem',
                marginTop: '0.6rem',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '0.8rem',
              }}
            >
              {activeDossier.layer_id && (
                <button
                  type="button"
                  onClick={() => handleToggle(activeDossier)}
                  style={{
                    flex: 1,
                    background: isLayerActive(activeDossier) ? '#ffffff' : '#202020',
                    color: isLayerActive(activeDossier) ? '#090909' : '#ffffff',
                    border: '1px solid #404040',
                    padding: '0.5rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  {isLayerActive(activeDossier) ? '● Disable Active Map Layer' : '○ Enable Active Map Layer'}
                </button>
              )}
              {activeDossier.doi_or_url.startsWith('http') && (
                <a
                  href={activeDossier.doi_or_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    textDecoration: 'none',
                    background: 'transparent',
                    border: '1px solid var(--border-default)',
                    color: '#f5f5f5',
                    padding: '0.5rem 1rem',
                    fontSize: '0.8rem',
                    borderRadius: 'var(--radius-xs)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  Open Official Data Portal ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
