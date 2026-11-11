import React, { useState, useEffect } from 'react'
import type { RouteFeature } from '../api/routing'
import type { DynamicReroutePlanDTO } from '../api/emergency'
import type { CandidateTargetFeature } from '../api/science'
import { generateMarkdownReport } from '../api/reports'

interface StudyAreaBookmark {
  id: string
  name: string
  lat: number
  lon: number
  region: string
  notes: string
  savedAt: string
}

interface MissionReportsPageProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  activeProfile: string
  activeRoute: RouteFeature | null
  emergencyPlan: DynamicReroutePlanDTO | null
  selectedTarget: CandidateTargetFeature | null
  onRestoreBookmark?: (lat: number, lon: number) => void
}

const STORAGE_KEY = 'marswalk_study_bookmarks_v1'

const INITIAL_BOOKMARKS: StudyAreaBookmark[] = [
  {
    id: 'bm-delta-scarp',
    name: 'Western Delta Front Scarps',
    lat: 18.4485,
    lon: 77.4320,
    region: 'Jezero Crater',
    notes: 'Smectite clay layers with steep 22° traversability challenge.',
    savedAt: '2026-11-10T12:00:00Z',
  },
  {
    id: 'bm-kodiak-butte',
    name: 'Kodiak Butte Outlier',
    lat: 18.4230,
    lon: 77.3890,
    region: 'Jezero Crater',
    notes: 'Isolated mesa demonstrating bottomset/foreset delta stratigraphy.',
    savedAt: '2026-11-10T14:30:00Z',
  },
  {
    id: 'bm-seatah-dunes',
    name: 'Séítah Dynamic Dunes',
    lat: 18.4350,
    lon: 77.4420,
    region: 'Jezero Crater',
    notes: 'High-slip olivine sand ripples with risk of mobility entrapment.',
    savedAt: '2026-11-11T09:15:00Z',
  },
]

export const MissionReportsPage: React.FC<MissionReportsPageProps> = ({
  startPoint,
  destPoint,
  activeProfile,
  activeRoute,
  emergencyPlan,
  selectedTarget,
  onRestoreBookmark,
}) => {
  const [missionTitle, setMissionTitle] = useState<string>(
    'Jezero Western Delta Reconnaissance Sortie 1'
  )
  const [crewCount, setCrewCount] = useState<number>(2)
  const [reportId] = useState<string>(() => `MARSWALK-REP-${Date.now().toString().slice(-6)}`)
  const [generatedAt] = useState<string>(() => new Date().toISOString())

  // Bookmarks State
  const [bookmarks, setBookmarks] = useState<StudyAreaBookmark[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : INITIAL_BOOKMARKS
    } catch {
      return INITIAL_BOOKMARKS
    }
  })

  const [newBookmarkName, setNewBookmarkName] = useState('')
  const [newBookmarkNotes, setNewBookmarkNotes] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks))
    } catch {
      // storage unavailable
    }
  }, [bookmarks])

  const handleAddBookmark = () => {
    if (!newBookmarkName.trim()) return
    const newBm: StudyAreaBookmark = {
      id: `bm-${Date.now()}`,
      name: newBookmarkName.trim(),
      lat: destPoint.lat,
      lon: destPoint.lon,
      region: 'Jezero Crater',
      notes: newBookmarkNotes.trim() || 'Custom planetary investigation coordinate.',
      savedAt: new Date().toISOString(),
    }
    setBookmarks((prev) => [newBm, ...prev])
    setNewBookmarkName('')
    setNewBookmarkNotes('')
  }

  const handleDeleteBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }

  const disclaimer =
    'RESEARCH DECISION-SUPPORT PROTOTYPE ONLY. Marswalk Planner is not NASA software. ' +
    'Models are illustrative and do not guarantee operational astronaut safety or life-support survival.'

  const markdownContent = generateMarkdownReport({
    reportId,
    generatedAt,
    missionTitle,
    crewCount,
    startCoordinate: startPoint,
    destCoordinate: destPoint,
    profileName: activeProfile,
    activeRoute,
    emergencyPlan,
    selectedTarget,
    disclaimer,
  })

  const handleDownloadMarkdown = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${reportId}.md`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadJSON = () => {
    const payload = {
      reportId,
      generatedAt,
      missionTitle,
      crewCount,
      coordinates: {
        start: startPoint,
        destination: destPoint,
      },
      profile: activeProfile,
      activeRoute: activeRoute ? activeRoute.properties : null,
      emergencyPlan: emergencyPlan ? emergencyPlan.event_id : null,
      selectedTarget: selectedTarget ? selectedTarget.properties : null,
      bookmarks,
      epistemic_classes: {
        route: 'HEURISTIC',
        geology: 'INTERPRETED',
        temperature: 'SIMULATED',
        catalog: 'OBSERVED',
      },
      crs: 'IAU_2015:49900 (Mars Sphere R=3,396,190m)',
      vertical_datum: 'Mars Gravitational Areoid (MOLA MEGDR)',
      disclaimer,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${reportId}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadGeoJSON = () => {
    const features: object[] = []
    if (activeRoute) {
      features.push(activeRoute)
    }
    if (selectedTarget) {
      features.push(selectedTarget)
    }
    bookmarks.forEach((b) => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [b.lon, b.lat],
        },
        properties: {
          name: b.name,
          region: b.region,
          notes: b.notes,
          saved_at: b.savedAt,
          crs: 'IAU_2015:49900',
        },
      })
    })

    const geojson = {
      type: 'FeatureCollection',
      name: `MARSWALK_${reportId}`,
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:IAU_2015:49900' },
      },
      features,
    }

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: 'application/geo+json;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${reportId}_workspace.geojson`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadCSV = () => {
    let csv = 'point_type,name,latitude_deg_north,longitude_deg_east,elevation_areoid_m,notes\n'
    csv += `BASE_CAMP,Habitat Alpha,${startPoint.lat.toFixed(6)},${startPoint.lon.toFixed(6)},-2540,Base camp start\n`
    csv += `SORTIE_DEST,Primary Destination,${destPoint.lat.toFixed(6)},${destPoint.lon.toFixed(6)},-2510,Traversal target\n`
    if (selectedTarget) {
      csv += `SCIENCE_TARGET,"${selectedTarget.properties.name}",${selectedTarget.geometry.coordinates[1].toFixed(6)},${selectedTarget.geometry.coordinates[0].toFixed(6)},-2515,"${selectedTarget.properties.primary_science_theme}"\n`
    }
    bookmarks.forEach((b) => {
      csv += `BOOKMARK,"${b.name.replace(/"/g, '""')}",${b.lat.toFixed(6)},${b.lon.toFixed(6)},-2500,"${b.notes.replace(/"/g, '""')}"\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${reportId}_points.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="page-container" style={{ paddingBottom: '4rem' }}>
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            Mission Reports & Scientific Reproducibility Workspace
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            Official Traversal Dossiers, Consumables Audits, Study Area Bookmarks & Geospatial Exports
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" onClick={handleDownloadMarkdown}>
            📥 Export Markdown (.md)
          </button>
          <button type="button" className="btn-secondary" onClick={handleDownloadGeoJSON}>
            🗺️ Export GeoJSON
          </button>
          <button type="button" className="btn-secondary" onClick={handleDownloadCSV}>
            📊 Export CSV
          </button>
          <button type="button" className="btn-secondary" onClick={handleDownloadJSON}>
            💾 Export Telemetry (.json)
          </button>
        </div>
      </div>

      {/* Grid: Left Column (Config & Bookmarks) / Right Column (Report Dossier) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '1.2rem', alignItems: 'start' }}>
        {/* Left Column: Config & Study Area Bookmarks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Report Configuration */}
          <div
            className="card"
            style={{
              padding: '1rem',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
            }}
          >
            <h4
              style={{
                margin: '0 0 0.8rem 0',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontFamily: 'monospace',
              }}
            >
              Mission Configuration
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '0.2rem',
                  }}
                >
                  Mission Title
                </label>
                <input
                  type="text"
                  value={missionTitle}
                  onChange={(e) => setMissionTitle(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-panel-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '0.2rem',
                  }}
                >
                  Crew Allocation
                </label>
                <select
                  value={crewCount}
                  onChange={(e) => setCrewCount(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-panel-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value={1}>1 Astronaut (Solo Exploration)</option>
                  <option value={2}>2 Astronauts (Nominal Buddy Pair)</option>
                  <option value={3}>3 Astronauts (Field Science Team)</option>
                  <option value={4}>4 Astronauts (Full Sortie Crew)</option>
                </select>
              </div>

              <div
                style={{
                  padding: '0.6rem',
                  background: 'var(--bg-panel-elevated)',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Analysis CRS:</strong> IAU_2015:49900
                </div>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Vertical Datum:</strong> Mars Areoid (MOLA)
                </div>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Active Profile:</strong> {activeProfile}
                </div>
              </div>
            </div>
          </div>

          {/* Study Area Bookmarks & Notes */}
          <div
            className="card"
            style={{
              padding: '1rem',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <h4
                style={{
                  margin: 0,
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: 'monospace',
                }}
              >
                Study Area Bookmarks
              </h4>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  color: 'var(--accent-primary)',
                  padding: '0.1rem 0.4rem',
                  background: 'rgba(56, 189, 248, 0.1)',
                  borderRadius: '3px',
                }}
              >
                {bookmarks.length} Saved
              </span>
            </div>

            {/* Add Current Coordinate */}
            <div
              style={{
                padding: '0.6rem',
                background: 'var(--bg-panel-elevated)',
                borderRadius: '4px',
                marginBottom: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Bookmark Dest [{destPoint.lat.toFixed(4)}°N, {destPoint.lon.toFixed(4)}°E]:
              </div>
              <input
                type="text"
                placeholder="Bookmark name (e.g. Scarp Contact)"
                value={newBookmarkName}
                onChange={(e) => setNewBookmarkName(e.target.value)}
                style={{
                  background: 'var(--bg-panel)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '3px',
                  fontSize: '0.75rem',
                }}
              />
              <input
                type="text"
                placeholder="Scientific field note..."
                value={newBookmarkNotes}
                onChange={(e) => setNewBookmarkNotes(e.target.value)}
                style={{
                  background: 'var(--bg-panel)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '3px',
                  fontSize: '0.75rem',
                }}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={handleAddBookmark}
                disabled={!newBookmarkName.trim()}
                style={{
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.75rem',
                  alignSelf: 'flex-start',
                }}
              >
                + Save Coordinate
              </button>
            </div>

            {/* Bookmarks List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
              {bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  style={{
                    padding: '0.6rem',
                    background: 'var(--bg-panel-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{bm.name}</strong>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {onRestoreBookmark && (
                        <button
                          type="button"
                          onClick={() => onRestoreBookmark(bm.lat, bm.lon)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-primary)',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            padding: 0,
                          }}
                          title="Restore destination coordinates"
                        >
                          Target
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteBookmark(bm.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-danger)',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          padding: 0,
                        }}
                        title="Delete bookmark"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                    {bm.lat.toFixed(4)}°N, {bm.lon.toFixed(4)}°E • {bm.region}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.72rem' }}>
                    "{bm.notes}"
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Markdown Report Preview */}
        <div
          className="card"
          style={{
            padding: '1.5rem',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            fontFamily: 'monospace',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            minHeight: '620px',
            overflowY: 'auto',
          }}
        >
          {markdownContent}
        </div>
      </div>
    </div>
  )
}
