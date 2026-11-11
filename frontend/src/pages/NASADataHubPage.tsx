import React, { useState, useEffect } from 'react'
import { fetchCatalogDatasets } from '../api/catalog'
import type { PlanetaryDatasetProduct } from '../api/catalog'

export const NASADataHubPage: React.FC = () => {
  const [datasets, setDatasets] = useState<PlanetaryDatasetProduct[]>([])
  const [filter, setFilter] = useState<string>('ALL')
  const [selectedProduct, setSelectedProduct] = useState<PlanetaryDatasetProduct | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    fetchCatalogDatasets()
      .then((data) => {
        setDatasets(data)
        if (data.length > 0) {
          setSelectedProduct(data[0])
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        console.error('Failed to load datasets:', err)
        setLoading(false)
      })
  }, [])

  const filtered = datasets.filter((p) => {
    if (filter === 'ALL') return true
    if (filter === 'ELEVATION') return p.role.toLowerCase().includes('topography') || p.role.toLowerCase().includes('elevation')
    if (filter === 'IMAGERY') return p.role.toLowerCase().includes('imagery') || p.role.toLowerCase().includes('basemap')
    if (filter === 'SCIENCE') return p.role.toLowerCase().includes('science') || p.role.toLowerCase().includes('geologic')
    if (filter === 'IN_SITU') return p.role.toLowerCase().includes('weather') || p.role.toLowerCase().includes('climate')
    return true
  })

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            NASA & International Planetary Data Hub
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            Authentic Archived Planetary Products for Jezero Crater • NASA PDS & USGS Astrogeology
          </small>
        </div>

        <div className="view-mode-selector">
          {['ALL', 'ELEVATION', 'IMAGERY', 'SCIENCE', 'IN_SITU'].map((f) => (
            <button
              key={f}
              type="button"
              className={`mode-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          Loading authentic planetary dataset dossiers from backend catalog API…
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(380px, 1.2fr)', gap: '1rem' }}>
        {/* Dataset List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map((prod) => {
            const isSelected = selectedProduct?.id === prod.id
            return (
              <div
                key={prod.id}
                className="card"
                onClick={() => setSelectedProduct(prod)}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {prod.title}
                  </span>
                  <span
                    className={`badge ${
                      prod.decision === 'ACCEPT' ? 'badge-passable' : 'badge-standby'
                    }`}
                  >
                    {prod.decision}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Agency: {prod.agency} • Resolution: {prod.resolution}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  DOI/URN: {prod.doiOrUrn}
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Product Detail Dossier */}
        {selectedProduct && (
          <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
            <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.6rem', marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge badge-observed">AUTHENTIC ARCHIVED PRODUCT</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Status: {selectedProduct.isIngested ? 'INGESTED & PROCESSED' : 'ARCHIVED REFERENCE'}
                </span>
              </div>
              <h3 style={{ margin: '0.4rem 0 0.2rem 0', color: 'var(--text-primary)', fontSize: '1.15rem' }}>
                {selectedProduct.title}
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Instrument: {selectedProduct.instrument}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div>
                <strong style={{ color: 'var(--text-muted)' }}>Originating Agency:</strong>
                <div>{selectedProduct.agency}</div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-muted)' }}>DOI / PDS URN:</strong>
                <div style={{ wordBreak: 'break-all' }}>{selectedProduct.doiOrUrn}</div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-muted)' }}>Spatial Post Spacing:</strong>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedProduct.resolution}</div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-muted)' }}>File Format:</strong>
                <div>{selectedProduct.fileFormat}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong style={{ color: 'var(--text-muted)' }}>Coordinate Reference System:</strong>
                <div>{selectedProduct.crs}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong style={{ color: 'var(--text-muted)' }}>Vertical Elevation Datum:</strong>
                <div>{selectedProduct.verticalDatum}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong style={{ color: 'var(--text-muted)' }}>Analysis Role:</strong>
                <div style={{ color: 'var(--accent-secondary)' }}>{selectedProduct.role}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong style={{ color: 'var(--status-critical)' }}>Documented Physical Caveats:</strong>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                  {selectedProduct.caveats}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.8rem' }}>
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
                  fontSize: '0.8rem',
                  padding: '0.4rem 0.8rem',
                }}
              >
                Open Official Portal Entry ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

