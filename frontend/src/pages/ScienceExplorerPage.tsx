import React, { useState, useEffect } from 'react'
import type { CandidateTargetFeature, ScientificObjectiveDTO } from '../api/science'
import { fetchScienceTargets, fetchScientificObjectives } from '../api/science'

interface ScienceExplorerPageProps {
  onSelectTargetForRouting: (target: CandidateTargetFeature) => void
  onSendWaypointsToEVAPlanner?: (waypoints: Array<{ lat: number; lon: number; name: string }>) => void
}

interface QueuedWaypoint {
  id: string
  name: string
  lat: number
  lon: number
  elevation_m: number
  notes: string
  objectiveTitle: string
}

const RESEARCH_NOTES_KEY = 'marswalk_science_field_notes_v1'

export const ScienceExplorerPage: React.FC<ScienceExplorerPageProps> = ({
  onSelectTargetForRouting,
  onSendWaypointsToEVAPlanner,
}) => {
  const [objectives, setObjectives] = useState<ScientificObjectiveDTO[]>([])
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string>('all')
  const [targets, setTargets] = useState<CandidateTargetFeature[]>([])
  const [selectedTarget, setSelectedTarget] = useState<CandidateTargetFeature | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Investigation Waypoint Queue
  const [queuedWaypoints, setQueuedWaypoints] = useState<QueuedWaypoint[]>([])

  // Field Notes State (target_id -> note)
  const [fieldNotes, setFieldNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(RESEARCH_NOTES_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(RESEARCH_NOTES_KEY, JSON.stringify(fieldNotes))
    } catch {
      // storage unavailable
    }
  }, [fieldNotes])

  // Load backend targets and objectives
  useEffect(() => {
    let cancelled = false
    async function loadData() {
      try {
        const [targetData, objData] = await Promise.all([
          fetchScienceTargets(),
          fetchScientificObjectives().catch(() => ({ count: 0, objectives: [] })),
        ])
        if (cancelled) return
        setTargets(targetData.features)
        setObjectives(objData.objectives)
        if (targetData.features.length > 0) {
          setSelectedTarget(targetData.features[0])
        }
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }
    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  const handleQueueWaypoint = (target: CandidateTargetFeature) => {
    const isAlreadyQueued = queuedWaypoints.some(
      (w) => w.id === target.properties.target_id
    )
    if (isAlreadyQueued) return

    const selectedObj = objectives.find((o) => o.id === selectedObjectiveId)
    const newWp: QueuedWaypoint = {
      id: target.properties.target_id,
      name: target.properties.name,
      lat: target.geometry.coordinates[1],
      lon: target.geometry.coordinates[0],
      elevation_m: target.geometry.coordinates[2],
      notes: fieldNotes[target.properties.target_id] || '',
      objectiveTitle: selectedObj?.title || target.properties.primary_science_theme,
    }
    setQueuedWaypoints((prev) => [...prev, newWp])
  }

  const handleRemoveQueuedWaypoint = (id: string) => {
    setQueuedWaypoints((prev) => prev.filter((w) => w.id !== id))
  }

  const handleExportSession = () => {
    const sessionData = {
      exported_at: new Date().toISOString(),
      active_objective: selectedObjectiveId,
      queued_waypoints: queuedWaypoints,
      field_notes: fieldNotes,
      disclaimer:
        'RESEARCH DECISION-SUPPORT PROTOTYPE ONLY. Mineral detections indicate abiotic aqueous alteration. Not certified for flight operations.',
    }
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `marswalk_science_session_${Date.now()}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Filter targets by selected objective
  const activeObjective = objectives.find((o) => o.id === selectedObjectiveId)
  const filteredTargets = targets.filter((tgt) => {
    if (selectedObjectiveId === 'all' || !activeObjective) return true
    return activeObjective.candidate_target_ids.includes(tgt.properties.target_id)
  })

  return (
    <div className="page-container" style={{ paddingBottom: '3rem' }}>
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            Scientific Intelligence & Investigation Workspace
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            7 Core Planetary Exploration Objectives • CRISM Hyperspectral Signatures • Stratigraphic Sampling
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportSession}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem' }}
          >
            💾 Export Session (.json)
          </button>
          <span className="badge badge-science">
            {filteredTargets.length} TARGETS AVAILABLE
          </span>
        </div>
      </div>

      {/* Objective Filter Pills */}
      <div
        className="card"
        style={{
          padding: '0.8rem',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          marginBottom: '1rem',
        }}
      >
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
          SELECT SCIENTIFIC RESEARCH OBJECTIVE (NASA SPACE APPS CHALLENGE):
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedObjectiveId('all')}
            style={{
              padding: '0.35rem 0.7rem',
              fontSize: '0.75rem',
              borderRadius: '4px',
              border: selectedObjectiveId === 'all' ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
              background: selectedObjectiveId === 'all' ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-panel-elevated)',
              color: selectedObjectiveId === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: selectedObjectiveId === 'all' ? 700 : 400,
            }}
          >
            All Candidates ({targets.length})
          </button>
          {objectives.map((obj) => {
            const isSelected = selectedObjectiveId === obj.id
            return (
              <button
                key={obj.id}
                type="button"
                onClick={() => setSelectedObjectiveId(obj.id)}
                style={{
                  padding: '0.35rem 0.7rem',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                  background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-panel-elevated)',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 700 : 400,
                }}
              >
                #{obj.number}. {obj.title}
              </button>
            )
          })}
        </div>

        {/* Active Objective Briefing Banner */}
        {activeObjective && (
          <div
            style={{
              marginTop: '0.8rem',
              padding: '0.7rem 0.9rem',
              background: 'var(--bg-panel-elevated)',
              borderLeft: '3px solid var(--accent-primary)',
              borderRadius: '2px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
              Hypothesis: {activeObjective.scientific_hypothesis}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Diagnostic Spectra:</strong>{' '}
                {activeObjective.diagnostic_spectral_indices.join(', ')}
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Supporting Instruments:</strong>{' '}
                {activeObjective.supporting_instruments.join(', ')}
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Target Units:</strong>{' '}
                {activeObjective.target_geological_units.join(', ')}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="card">Loading scientific opportunity candidates from backend…</div>}
      {error && <div className="card status-error">{error}</div>}

      {/* Main Grid: Left (Targets List & Queued Waypoints) / Right (Target Deep Dossier) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '1.2rem', alignItems: 'start' }}>
        {/* Left Column: Targets List & Queued Waypoints */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Targets List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '420px', overflowY: 'auto' }}>
            {filteredTargets.map((tgt) => {
              const isSelected = selectedTarget?.properties.target_id === tgt.properties.target_id
              const isQueued = queuedWaypoints.some((w) => w.id === tgt.properties.target_id)
              return (
                <div
                  key={tgt.properties.target_id}
                  className="card"
                  onClick={() => setSelectedTarget(tgt)}
                  style={{
                    cursor: 'pointer',
                    padding: '0.8rem',
                    borderLeft: `3px solid ${isQueued ? 'var(--status-nominal)' : 'var(--accent-secondary)'}`,
                    background: isSelected ? 'var(--bg-panel-elevated)' : 'var(--bg-panel)',
                    borderColor: isSelected ? 'var(--border-active)' : 'var(--border-default)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      #{tgt.properties.rank}: {tgt.properties.name}
                    </span>
                    <span className="badge-target-rank">
                      {(tgt.properties.composite_score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Theme: {tgt.properties.primary_science_theme}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>
                      [{tgt.geometry.coordinates[1].toFixed(4)}°N, {tgt.geometry.coordinates[0].toFixed(4)}°E]
                    </span>
                    {isQueued && (
                      <span style={{ color: 'var(--status-nominal)', fontWeight: 600 }}>
                        ✔ IN SORTIE QUEUE
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Investigation Waypoint Queue */}
          <div
            className="card"
            style={{
              padding: '0.9rem',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                SORTIE INVESTIGATION WAYPOINTS ({queuedWaypoints.length})
              </h4>
              {queuedWaypoints.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQueuedWaypoints([])}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer' }}
                >
                  Clear All
                </button>
              )}
            </div>

            {queuedWaypoints.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No targets queued. Select targets and click "+ Add to Sortie Queue" to build a multi-destination EVA sortie.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
                {queuedWaypoints.map((wp, idx) => (
                  <div
                    key={wp.id}
                    style={{
                      padding: '0.5rem',
                      background: 'var(--bg-panel-elevated)',
                      borderRadius: '3px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {idx + 1}. {wp.name}
                      </strong>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        [{wp.lat.toFixed(4)}°N, {wp.lon.toFixed(4)}°E]
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQueuedWaypoint(wp.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: '0 4px' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {onSendWaypointsToEVAPlanner && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onSendWaypointsToEVAPlanner(queuedWaypoints)}
                    style={{ marginTop: '0.6rem', padding: '0.4rem', fontSize: '0.75rem' }}
                  >
                    🚀 Plan Multi-Destination Sortie ({queuedWaypoints.length} Stops)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Target Deep Dossier */}
        {selectedTarget && (
          <div className="card" style={{ padding: '1.2rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.8rem' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.2rem' }}>
                  #{selectedTarget.properties.rank}: {selectedTarget.properties.name}
                </h3>
                <small style={{ color: 'var(--text-secondary)' }}>
                  Theme: {selectedTarget.properties.primary_science_theme} | Epistemic: {selectedTarget.properties.epistemic_class} | Elevation: {selectedTarget.geometry.coordinates[2]} m
                </small>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleQueueWaypoint(selectedTarget)}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  + Add to Sortie Queue
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onSelectTargetForRouting(selectedTarget)}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  🧭 Route Directly
                </button>
              </div>
            </div>

            {/* Score Breakdown Grid */}
            <div className="hazard-breakdown-grid" style={{ marginTop: '1rem' }}>
              <div className="hazard-stat-box">
                <div className="stat-label">Mineralogy</div>
                <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {(selectedTarget.properties.breakdown.mineralogy * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Diversity</div>
                <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {(selectedTarget.properties.breakdown.diversity * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Layered Strata</div>
                <div className="stat-value" style={{ color: 'var(--text-secondary)' }}>
                  {(selectedTarget.properties.breakdown.layered_features * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Delta Context</div>
                <div className="stat-value" style={{ color: 'var(--text-secondary)' }}>
                  {(selectedTarget.properties.breakdown.delta_context * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Rover Proximity</div>
                <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                  {(selectedTarget.properties.breakdown.rover_proximity * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Confidence</div>
                <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                  {(selectedTarget.properties.breakdown.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Scientific Rationale */}
            <div className="hazard-explanation-box" style={{ borderLeftColor: 'var(--accent-secondary)', marginTop: '1rem' }}>
              <strong>Scientific Rationale: </strong>
              {selectedTarget.properties.rationale}
            </div>

            {/* Supporting Observations & Available Datasets */}
            <div
              style={{
                marginTop: '1rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.8rem',
              }}
            >
              <div style={{ padding: '0.8rem', background: 'var(--bg-panel-elevated)', borderRadius: '4px', fontSize: '0.75rem' }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.3rem' }}>
                  Available Planetary Datasets:
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                  <li>MRO HiRISE TRN 1m Digital Terrain Model</li>
                  <li>MRO CTX 6m Regional Orthomosaic</li>
                  <li>USGS SIM-3464 Geologic Map of Jezero</li>
                  <li>MRO CRISM Targeted Spectral Scenes (FRT00005850)</li>
                </ul>
              </div>

              <div style={{ padding: '0.8rem', background: 'var(--bg-panel-elevated)', borderRadius: '4px', fontSize: '0.75rem' }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.3rem' }}>
                  Known Uncertainties & Caveats:
                </strong>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                  <li>Sub-meter boulder fields unresolvable at 20m ARD grid</li>
                  <li>Atmospheric dust scattering reduces CRISM IR contrast</li>
                  <li>Subsurface clay layer thickness requires drill sampling</li>
                </ul>
              </div>
            </div>

            {/* Field Notes & Investigation Observations */}
            <div
              style={{
                marginTop: '1rem',
                padding: '0.8rem',
                background: 'var(--bg-panel-elevated)',
                borderRadius: '4px',
              }}
            >
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Researcher Field Notes & In-Situ Hypotheses:
              </label>
              <textarea
                rows={3}
                value={fieldNotes[selectedTarget.properties.target_id] || ''}
                onChange={(e) => {
                  const val = e.target.value
                  setFieldNotes((prev) => ({
                    ...prev,
                    [selectedTarget.properties.target_id]: val,
                  }))
                }}
                placeholder="Enter field notes, sampling priorities, or outcrop observations..."
                style={{
                  width: '100%',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '3px',
                  color: 'var(--text-primary)',
                  padding: '0.5rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                ✓ Auto-saved to session workspace
              </div>
            </div>

            {/* Strict Epistemic Warnings */}
            <div className="notice-warning" style={{ marginTop: '0.8rem' }}>
              <strong>Notice: </strong>
              {selectedTarget.properties.life_inference_warning}
            </div>

            <div className="notice-warning" style={{ borderLeftColor: 'var(--status-critical)', marginTop: '0.4rem' }}>
              <strong>Safety Caveat: </strong>
              {selectedTarget.properties.safety_caveat}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
