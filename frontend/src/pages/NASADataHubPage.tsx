import React, { useState, useEffect } from 'react'
import type { AtlasMapEntry } from '../api/atlas'
import { fetchAtlasCatalogue } from '../api/atlas'
import { fetchCatalogDatasets } from '../api/catalog'
import type { PlanetaryDatasetProduct } from '../api/catalog'
import { useMission } from '../context/useMission.ts'
import { getRegionCapabilityProfile } from '../mission/regionCapabilities.ts'
import {
  STORAGE_CATEGORY_LABELS,
  atlasEntryToMissionRef,
  datasetDossierToMissionRef,
  datasetSupportsRegion,
  mapAtlasEntryToStorageCategory,
  normalizeDatasetEpistemicTag,
  normalizeStorageCategory,
} from '../mission/scienceWorkflowHelpers.ts'

type HubMode = 'CORE' | 'ATLAS' | 'PINNED'

export const NASADataHubPage: React.FC = () => {
  const { mission, actions } = useMission()
  const regionCaps = getRegionCapabilityProfile(mission.geographic.regionId)
  const attachedDatasets = mission.science.attachedDatasets ?? []
  const focusedDatasetId = mission.science.focusedDatasetId ?? null

  const [hubMode, setHubMode] = useState<HubMode>('CORE')
  const [datasets, setDatasets] = useState<PlanetaryDatasetProduct[]>([])
  const [atlasEntries, setAtlasEntries] = useState<AtlasMapEntry[]>([])
  const [filter, setFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedProduct, setSelectedProduct] = useState<PlanetaryDatasetProduct | null>(null)
  const [selectedAtlas, setSelectedAtlas] = useState<AtlasMapEntry | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [atlasNote, setAtlasNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchCatalogDatasets(),
      fetchAtlasCatalogue({ page: 1, page_size: 100 }).catch((err: unknown) => {
        if (!cancelled) {
          setAtlasNote(
            err instanceof Error
              ? `Atlas catalog unavailable (${err.message}); displaying core dossiers.`
              : 'Atlas catalog unavailable; displaying core dossiers.',
          )
        }
        return null
      }),
    ])
      .then(([coreData, atlasRes]) => {
        if (cancelled) return
        setDatasets(coreData)
        const atlasList = atlasRes?.entries ?? []
        setAtlasEntries(atlasList)

        if (focusedDatasetId) {
          const coreMatch = coreData.find(
            (p) => p.id === focusedDatasetId || p.doiOrUrn === focusedDatasetId,
          )
          if (coreMatch) {
            setHubMode('CORE')
            setSelectedProduct(coreMatch)
          } else {
            const atlasMatch = atlasList.find(
              (a) => a.id === focusedDatasetId || a.canonical_id === focusedDatasetId,
            )
            if (atlasMatch) {
              setHubMode('ATLAS')
              setSelectedAtlas(atlasMatch)
            }
          }
        }
        if (!focusedDatasetId && coreData.length > 0) {
          setSelectedProduct((prev) => prev ?? coreData[0])
        }
        if (atlasList.length > 0) {
          setSelectedAtlas((prev) => prev ?? atlasList[0])
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('Failed to load datasets:', err)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [focusedDatasetId])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredCore = datasets.filter((p) => {
    const roleMatch =
      filter === 'ALL'
        ? true
        : filter === 'ELEVATION'
        ? p.role.toLowerCase().includes('topography') || p.role.toLowerCase().includes('elevation')
        : filter === 'IMAGERY'
        ? p.role.toLowerCase().includes('imagery') ||
          p.role.toLowerCase().includes('basemap') ||
          p.role.toLowerCase().includes('visual')
        : filter === 'SCIENCE'
        ? p.role.toLowerCase().includes('science') || p.role.toLowerCase().includes('geolog')
        : filter === 'IN_SITU'
        ? p.role.toLowerCase().includes('weather') || p.role.toLowerCase().includes('climate')
        : true
    if (!roleMatch) return false
    if (!normalizedQuery) return true
    return `${p.id} ${p.title} ${p.agency} ${p.instrument} ${p.doiOrUrn}`
      .toLowerCase()
      .includes(normalizedQuery)
  })

  const filteredAtlas = atlasEntries.filter((e) => {
    if (!normalizedQuery) return true
    return `${e.id} ${e.canonical_id} ${e.name} ${e.source_organisation} ${e.instrument_mission}`
      .toLowerCase()
      .includes(normalizedQuery)
  })

  const openLinkedPageForCore = (product: PlanetaryDatasetProduct, target: 'science' | 'geology' | 'map') => {
    actions.setFocusedDataset(product.id)
    if (target === 'map') {
      actions.setActivePage('map-explorer', 'CATALOGUE')
      return
    }
    actions.setActivePage(target)
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="twin-header" style={{ marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            NASA & International Planetary Data Hub
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            Provenance Dossiers & Dataset Registry · Active Region: <strong>{regionCaps.displayName}</strong> ({mission.geographic.regionId})
          </small>
        </div>

        <div className="view-mode-selector" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`mode-btn ${hubMode === 'CORE' ? 'active' : ''}`}
            onClick={() => setHubMode('CORE')}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
          >
            CORE DOSSIERS ({datasets.length})
          </button>
          <button
            type="button"
            className={`mode-btn ${hubMode === 'ATLAS' ? 'active' : ''}`}
            onClick={() => setHubMode('ATLAS')}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
          >
            ATLAS REGISTRY ({atlasEntries.length})
          </button>
          <button
            type="button"
            className={`mode-btn ${hubMode === 'PINNED' ? 'active' : ''}`}
            onClick={() => setHubMode('PINNED')}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
          >
            MISSION PINNED ({attachedDatasets.length})
          </button>
        </div>
      </div>

      {/* Honest Availability Notice (no fake PDS downloads) */}
      <div
        style={{
          marginBottom: '0.9rem',
          padding: '0.6rem 0.85rem',
          background: 'var(--bg-panel-elevated)',
          border: '1px solid var(--border-default)',
          borderLeft: '3px solid var(--accent-secondary)',
          borderRadius: '3px',
          fontSize: '0.74rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <span>
          <strong>Data Availability Disclosure:</strong> This hub surfaces verified repository files (
          <code>LOCAL RAW</code> / <code>LOCAL DERIVED</code>), cached remote tile proxies, curated
          metadata dossiers, and parametric simulations. Raw archival bundles not stored locally link
          to their official NASA PDS / USGS portals (live PDS batch streaming is disabled).
        </span>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => actions.setActivePage('science')}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
          >
            Science Targets →
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => actions.setActivePage('geology')}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
          >
            Geology & Mineralogy →
          </button>
        </div>
      </div>

      {atlasNote && (
        <div className="notice-warning" style={{ marginBottom: '0.85rem' }}>
          {atlasNote}
        </div>
      )}

      {/* Search & Filter Strip */}
      {hubMode !== 'PINNED' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.9rem',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by dataset name, instrument, agency, or DOI/URN..."
            style={{
              flex: '1 1 260px',
              padding: '0.45rem 0.65rem',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              borderRadius: '3px',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              fontFamily: 'var(--font-mono)',
            }}
          />
          {hubMode === 'CORE' && (
            <div className="view-mode-selector" style={{ flexWrap: 'wrap' }}>
              {['ALL', 'ELEVATION', 'IMAGERY', 'SCIENCE', 'IN_SITU'].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`mode-btn ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                  style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem' }}
                >
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          Loading planetary dataset dossiers and catalog provenance…
        </div>
      )}

      {/* CORE DOSSIERS VIEW */}
      {!loading && hubMode === 'CORE' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(380px, 1.25fr)', gap: '1rem' }}>
          {/* Dataset List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '72vh', overflowY: 'auto' }}>
            {filteredCore.map((prod) => {
              const isSelected = selectedProduct?.id === prod.id
              const isPinned = attachedDatasets.some((d) => d.datasetId === prod.id)
              const storageCat = normalizeStorageCategory(
                prod.storageCategory,
                prod.isIngested,
                prod.epistemicClass ?? prod.epistemic_class,
              )
              const supportsActiveRegion = datasetSupportsRegion(
                prod.supportsRegions,
                mission.geographic.regionId,
              )
              return (
                <div
                  key={prod.id}
                  className="card"
                  onClick={() => {
                    setSelectedProduct(prod)
                    actions.setFocusedDataset(prod.id)
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '0.8rem',
                    borderLeft: `3px solid ${
                      prod.decision === 'ACCEPT' ? 'var(--accent-primary)' : 'var(--accent-muted)'
                    }`,
                    background: isSelected ? 'var(--bg-panel-elevated)' : 'var(--bg-panel)',
                    borderColor: isSelected ? 'var(--border-active)' : 'var(--border-default)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {prod.title} {isPinned ? '★' : ''}
                    </span>
                    <span
                      className={`badge ${
                        prod.decision === 'ACCEPT' ? 'badge-passable' : 'badge-standby'
                      }`}
                    >
                      {prod.decision}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {prod.agency} • {prod.resolution}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', flexWrap: 'wrap', gap: '0.35rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {STORAGE_CATEGORY_LABELS[storageCat]}
                    </span>
                    <span style={{ color: supportsActiveRegion ? '#6ee7b7' : '#fbbf24' }}>
                      {supportsActiveRegion ? `Covers ${regionCaps.displayName}` : 'Outside active region'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Selected Product Detail Dossier */}
          {selectedProduct && (() => {
            const epTag = normalizeDatasetEpistemicTag(
              selectedProduct.epistemicClass ?? selectedProduct.epistemic_class,
            )
            const storageCat = normalizeStorageCategory(
              selectedProduct.storageCategory,
              selectedProduct.isIngested,
              epTag,
            )
            const isPinned = attachedDatasets.some((d) => d.datasetId === selectedProduct.id)
            const supportsActiveRegion = datasetSupportsRegion(
              selectedProduct.supportsRegions,
              mission.geographic.regionId,
            )
            return (
              <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.7rem', marginBottom: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge badge-${epTag.toLowerCase()}`}>{epTag}</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          border: '1px solid var(--border-default)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {STORAGE_CATEGORY_LABELS[storageCat]}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={isPinned ? 'btn-primary' : 'btn-secondary'}
                      disabled={!isPinned && !supportsActiveRegion}
                      title={
                        !isPinned && !supportsActiveRegion
                          ? `Dataset scope excludes ${regionCaps.displayName}`
                          : undefined
                      }
                      onClick={() => {
                        if (isPinned) {
                          actions.detachDataset(selectedProduct.id)
                        } else if (supportsActiveRegion) {
                          actions.attachDataset(datasetDossierToMissionRef(selectedProduct))
                        }
                      }}
                      style={{
                        fontSize: '0.74rem',
                        padding: '0.3rem 0.65rem',
                        opacity: !isPinned && !supportsActiveRegion ? 0.55 : 1,
                        cursor: !isPinned && !supportsActiveRegion ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isPinned
                        ? '★ Pinned to Mission (Remove)'
                        : supportsActiveRegion
                        ? '+ Pin Provenance to Mission'
                        : `Outside Active Region (${regionCaps.displayName})`}
                    </button>
                  </div>
                  <h3 style={{ margin: '0.5rem 0 0.2rem 0', color: 'var(--text-primary)', fontSize: '1.15rem' }}>
                    {selectedProduct.id.toUpperCase()} — {selectedProduct.title}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Instrument: {selectedProduct.instrument}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <div>
                    <strong style={{ color: 'var(--text-muted)' }}>Originating Agency:</strong>
                    <div>{selectedProduct.agency}</div>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-muted)' }}>DOI / PDS URN:</strong>
                    <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '0.73rem' }}>
                      {selectedProduct.doiOrUrn}
                    </div>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-muted)' }}>Spatial Resolution:</strong>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedProduct.resolution}</div>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-muted)' }}>File Format:</strong>
                    <div>{selectedProduct.fileFormat}</div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong style={{ color: 'var(--text-muted)' }}>Spatial Coverage & Active Region Match:</strong>
                    <div>
                      {selectedProduct.coverage}{' '}
                      <span style={{ color: supportsActiveRegion ? '#6ee7b7' : '#fbbf24', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                        ({supportsActiveRegion ? `Matches ${regionCaps.displayName}` : `Jezero/Archive scope — outside ${regionCaps.displayName}`})
                      </span>
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong style={{ color: 'var(--text-muted)' }}>Temporal / Campaign Coverage:</strong>
                    <div>{selectedProduct.temporalCoverage || 'Archival release compilation'}</div>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-muted)' }}>Coordinate Reference System:</strong>
                    <div>{selectedProduct.crs}</div>
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-muted)' }}>Vertical Elevation Datum:</strong>
                    <div>{selectedProduct.verticalDatum}</div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong style={{ color: 'var(--text-muted)' }}>Local Availability / Retrieval Status:</strong>
                    <div style={{ color: selectedProduct.isIngested ? '#6ee7b7' : '#fbbf24', fontFamily: 'var(--font-mono)', fontSize: '0.73rem' }}>
                      {selectedProduct.availabilityStatus ||
                        (selectedProduct.isIngested
                          ? 'Ingested in local repository archive'
                          : 'Curated metadata reference only (not stored locally)')}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong style={{ color: 'var(--text-muted)' }}>Analysis Role:</strong>
                    <div style={{ color: 'var(--accent-secondary)' }}>{selectedProduct.role}</div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong style={{ color: 'var(--status-critical)' }}>Documented Physical Limitations & Caveats:</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                      {selectedProduct.caveats}
                    </div>
                  </div>
                </div>

                {/* Connected Exploration Workflow Actions */}
                <div
                  style={{
                    marginTop: '1rem',
                    borderTop: '1px solid var(--border-subtle)',
                    paddingTop: '0.8rem',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  {selectedProduct.supportsScienceTargets && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => openLinkedPageForCore(selectedProduct, 'science')}
                      style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem' }}
                    >
                      Explore Supported Science Targets →
                    </button>
                  )}
                  {selectedProduct.supportsGeology && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => openLinkedPageForCore(selectedProduct, 'geology')}
                      style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem' }}
                    >
                      Investigate in Geology & Mineralogy →
                    </button>
                  )}
                  {(selectedProduct.supportsLayers?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => openLinkedPageForCore(selectedProduct, 'map')}
                      style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem' }}
                    >
                      Open Layer in Map Explorer →
                    </button>
                  )}
                  <a
                    href={selectedProduct.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mode-btn"
                    style={{
                      display: 'inline-block',
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      textDecoration: 'none',
                      fontSize: '0.76rem',
                      padding: '0.35rem 0.7rem',
                    }}
                  >
                    Open Official Archive Portal ↗
                  </a>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ATLAS REGISTRY VIEW */}
      {!loading && hubMode === 'ATLAS' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(380px, 1.25fr)', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '72vh', overflowY: 'auto' }}>
            {filteredAtlas.length === 0 ? (
              <div className="card" style={{ padding: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                No Atlas Registry products match the current filter.
              </div>
            ) : (
              filteredAtlas.map((entry) => {
                const isSelected = selectedAtlas?.id === entry.id
                const isPinned = attachedDatasets.some(
                  (d) => d.datasetId === (entry.canonical_id || entry.id),
                )
                const storageCat = mapAtlasEntryToStorageCategory(entry)
                const supportsActiveRegion = datasetSupportsRegion(
                  entry.supports_regions,
                  mission.geographic.regionId,
                )
                const isGlobalEntry = entry.supports_regions?.includes('all') ?? false
                return (
                  <div
                    key={entry.id}
                    className="card"
                    onClick={() => {
                      setSelectedAtlas(entry)
                      actions.setFocusedDataset(entry.canonical_id || entry.id)
                    }}
                    style={{
                      cursor: 'pointer',
                      padding: '0.75rem',
                      background: isSelected ? 'var(--bg-panel-elevated)' : 'var(--bg-panel)',
                      borderColor: isSelected ? 'var(--border-active)' : 'var(--border-default)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {entry.canonical_id} — {entry.name} {isPinned ? '★' : ''}
                      </span>
                      <span
                        className="badge"
                        style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                      >
                        {entry.product_type}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      {entry.source_organisation} · {entry.resolution}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)', flexWrap: 'wrap', gap: '0.35rem' }}>
                      <span>
                        {STORAGE_CATEGORY_LABELS[storageCat]} · {normalizeDatasetEpistemicTag(entry.epistemic_class)}
                      </span>
                      <span style={{ color: supportsActiveRegion ? '#6ee7b7' : '#fbbf24' }}>
                        {isGlobalEntry
                          ? 'Global Mars'
                          : supportsActiveRegion
                          ? `Covers ${regionCaps.displayName}`
                          : 'Outside active region'}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {selectedAtlas && (() => {
            const canonicalKey = selectedAtlas.canonical_id || selectedAtlas.id
            const isPinned = attachedDatasets.some((d) => d.datasetId === canonicalKey)
            const epTag = normalizeDatasetEpistemicTag(selectedAtlas.epistemic_class)
            const storageCat = mapAtlasEntryToStorageCategory(selectedAtlas)
            const supportsActiveRegion = datasetSupportsRegion(
              selectedAtlas.supports_regions,
              mission.geographic.regionId,
            )
            const isGlobalEntry = selectedAtlas.supports_regions?.includes('all') ?? false
            return (
              <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge badge-${epTag.toLowerCase()}`}>{epTag}</span>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {STORAGE_CATEGORY_LABELS[storageCat]}
                    </span>
                    <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: supportsActiveRegion ? '#6ee7b7' : '#fbbf24' }}>
                      {isGlobalEntry
                        ? 'Global Mars'
                        : supportsActiveRegion
                        ? `Compatible: ${regionCaps.displayName}`
                        : `Scope: ${(selectedAtlas.supports_regions ?? ['UNSPECIFIED']).join(', ')} (Outside ${regionCaps.displayName})`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={isPinned ? 'btn-primary' : 'btn-secondary'}
                    disabled={!isPinned && !supportsActiveRegion}
                    title={
                      !isPinned && !supportsActiveRegion
                        ? `Atlas dataset does not cover ${regionCaps.displayName}`
                        : undefined
                    }
                    onClick={() => {
                      if (isPinned) {
                        actions.detachDataset(canonicalKey)
                      } else if (supportsActiveRegion) {
                        actions.attachDataset(atlasEntryToMissionRef(selectedAtlas))
                      }
                    }}
                    style={{
                      fontSize: '0.74rem',
                      padding: '0.3rem 0.65rem',
                      opacity: !isPinned && !supportsActiveRegion ? 0.55 : 1,
                      cursor: !isPinned && !supportsActiveRegion ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isPinned
                      ? '★ Pinned to Mission (Remove)'
                      : supportsActiveRegion
                      ? '+ Pin to Mission Provenance'
                      : `Outside Active Region (${regionCaps.displayName})`}
                  </button>
                </div>
                <h3 style={{ margin: '0 0 0.3rem 0', color: 'var(--text-primary)' }}>
                  {selectedAtlas.canonical_id}: {selectedAtlas.name}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 0 }}>
                  {selectedAtlas.description}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Organisation:</strong><div>{selectedAtlas.source_organisation}</div></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Instrument/Source:</strong><div>{selectedAtlas.instrument_mission}</div></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Resolution:</strong><div>{selectedAtlas.resolution}</div></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Observation Date:</strong><div>{selectedAtlas.observation_date || 'Unspecified'}</div></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Coverage:</strong><div>{selectedAtlas.spatial_coverage}</div></div>
                  <div><strong style={{ color: 'var(--text-muted)' }}>Processing Status:</strong><div>{selectedAtlas.processing_status}</div></div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <strong style={{ color: 'var(--status-critical)' }}>Limitations:</strong>
                    <div>{selectedAtlas.known_limitations || selectedAtlas.caveats_limitations}</div>
                  </div>
                </div>
                <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      actions.setActivePage('map-explorer', 'CATALOGUE')
                    }
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem' }}
                  >
                    Open in Map Explorer →
                  </button>
                  {selectedAtlas.doi_or_url && selectedAtlas.doi_or_url.startsWith('http') && (
                    <a
                      href={selectedAtlas.doi_or_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mode-btn"
                      style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '0.35rem 0.7rem' }}
                    >
                      Source URL ↗
                    </a>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* MISSION PINNED DATASETS VIEW */}
      {!loading && hubMode === 'PINNED' && (
        <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)' }}>
          <h3 style={{ margin: '0 0 0.6rem 0', fontSize: '1rem', color: 'var(--text-primary)' }}>
            Datasets Pinned to Active Mission Draft ({attachedDatasets.length})
          </h3>
          {attachedDatasets.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              No datasets pinned yet. Open a dossier in Core Dossiers or Atlas Registry and click
              <strong> + Pin Provenance to Mission</strong> to persist supporting archive citations in your MissionBundleV1 draft.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.75rem' }}>
              {attachedDatasets.map((ds) => (
                <div
                  key={ds.datasetId}
                  style={{
                    padding: '0.75rem',
                    background: 'var(--bg-panel-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '3px',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{ds.title}</strong>
                    <span className={`badge badge-${ds.epistemicClass.toLowerCase()}`}>{ds.epistemicClass}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {ds.datasetId} · {STORAGE_CATEGORY_LABELS[ds.storageCategory]}
                  </div>
                  {ds.doiOrUrn && (
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', marginTop: '0.2rem', wordBreak: 'break-all' }}>
                      {ds.doiOrUrn}
                    </div>
                  )}
                  <div style={{ marginTop: '0.55rem', display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        actions.setFocusedDataset(ds.datasetId)
                        setHubMode(ds.datasetId.startsWith('product-') ? 'CORE' : 'ATLAS')
                      }}
                      style={{ fontSize: '0.7rem', padding: '0.25rem 0.55rem' }}
                    >
                      Inspect Dossier
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => actions.detachDataset(ds.datasetId)}
                      style={{ fontSize: '0.7rem', padding: '0.25rem 0.55rem', color: 'var(--accent-danger)' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
