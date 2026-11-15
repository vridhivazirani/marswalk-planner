import React, { useState, useEffect, useRef } from 'react'
import type { CandidateTargetFeature, ScientificObjectiveDTO } from '../api/science'
import { fetchScienceTargets, fetchScientificObjectives } from '../api/science'
import { useMission } from '../context/useMission.ts'
import {
  CANONICAL_MARS_CRS,
  SCIENCE_TARGETS_DATASET_ID,
  SCIENCE_TARGETS_PROVENANCE,
  checkCoordinateOverwrite,
  featureToMissionTargetRef,
  featureToSortieWaypoint,
  formatMarsCoordinate,
  type CoordinateOverwriteCheck,
} from '../mission/digitalTwinHelpers.ts'
import { getBrowserLocalStorage } from '../mission/missionStorage.ts'
import { getRegionCapabilityProfile } from '../mission/regionCapabilities.ts'
import {
  JEZERO_SOURCE_REGION_ID,
  buildScienceTargetObservation,
  buildTargetGeologyHandoffRef,
  inferTargetGeologyThemes,
  normalizeDatasetEpistemicTag,
  readLegacyScienceFieldNotes,
} from '../mission/scienceWorkflowHelpers.ts'
import type { MissionSortieWaypoint } from '../types/mission.ts'

interface ScienceExplorerPageProps {
  onSelectTargetForRouting: (target: CandidateTargetFeature) => void
  onSendWaypointsToEVAPlanner?: (waypoints: MissionSortieWaypoint[]) => void
}

export const ScienceExplorerPage: React.FC<ScienceExplorerPageProps> = ({
  onSelectTargetForRouting,
  onSendWaypointsToEVAPlanner,
}) => {
  const { mission, actions } = useMission()
  const [objectives, setObjectives] = useState<ScientificObjectiveDTO[]>([])
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string>('all')
  const [targets, setTargets] = useState<CandidateTargetFeature[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)
  const [pendingRouteOverwrite, setPendingRouteOverwrite] = useState<{
    feature: CandidateTargetFeature
    overwrite: CoordinateOverwriteCheck
  } | null>(null)
  const legacyMigratedRef = useRef(false)

  const queuedWaypoints = mission.science.queuedTargets
  const fieldNotes = mission.science.targetNotes ?? {}
  const attachedDatasets = mission.science.attachedDatasets ?? []
  const regionCaps = getRegionCapabilityProfile(mission.geographic.regionId)

  // One-time controlled migration from legacy localStorage field notes into shared MissionContext
  useEffect(() => {
    if (legacyMigratedRef.current) return
    legacyMigratedRef.current = true
    const legacy = readLegacyScienceFieldNotes(getBrowserLocalStorage())
    for (const [tid, note] of Object.entries(legacy)) {
      if (!mission.science.targetNotes?.[tid]) {
        actions.setTargetNote(tid, note)
      }
    }
  }, [actions, mission.science.targetNotes])

  // Load backend targets and objectives once on mount
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

  // Derive focused candidate target cleanly from loaded catalog + shared mission context
  const preferredTargetId =
    mission.science.selectedTarget?.targetId ??
    mission.science.selectedGeologicalFeature?.relatedTargetIds?.[0] ??
    null
  const selectedTarget =
    (preferredTargetId
      ? targets.find((f) => f.properties.target_id === preferredTargetId)
      : undefined) ??
    targets[0] ??
    null

  const handleSelectTargetForInspection = (target: CandidateTargetFeature) => {
    setSavedNotice(null)
    const tid = target.properties.target_id
    const ref = featureToMissionTargetRef(target, JEZERO_SOURCE_REGION_ID, mission.geographic.regionId)
    actions.selectScienceTarget(
      fieldNotes[tid] ? { ...ref, notes: fieldNotes[tid] } : ref,
    )
  }

  const handleSaveScienceObservation = (target: CandidateTargetFeature) => {
    const tid = target.properties.target_id
    const obs = buildScienceTargetObservation(
      target,
      mission.geographic.regionId,
      fieldNotes[tid],
    )
    actions.addObservation(obs)
    setSavedNotice(
      mission.geographic.regionId !== JEZERO_SOURCE_REGION_ID
        ? `Saved ${tid} (${obs.epistemicClass}) with source region ${JEZERO_SOURCE_REGION_ID}`
        : `Saved ${tid} (${obs.epistemicClass}) to Mission Observations`,
    )
  }

  const handleInvestigateGeology = (target: CandidateTargetFeature) => {
    const tid = target.properties.target_id
    const ref = featureToMissionTargetRef(target, JEZERO_SOURCE_REGION_ID, mission.geographic.regionId)
    actions.selectScienceTarget(
      fieldNotes[tid] ? { ...ref, notes: fieldNotes[tid] } : ref,
    )
    actions.selectGeologicalFeature(
      buildTargetGeologyHandoffRef(target, mission.geographic.regionId),
    )
    actions.setActivePage('geology')
  }

  const handleInspectDatasets = (datasetId: string | null) => {
    actions.setFocusedDataset(datasetId)
    actions.setActivePage('data-hub')
  }

  const handleQueueWaypoint = (target: CandidateTargetFeature) => {
    const targetId = target.properties.target_id
    const isAlreadyQueued = queuedWaypoints.some(
      (w) => (w.id ?? w.name) === targetId,
    )
    if (isAlreadyQueued) return

    const waypoint = featureToSortieWaypoint(
      target,
      JEZERO_SOURCE_REGION_ID,
      fieldNotes[targetId] || undefined,
    )
    actions.queueScienceTarget(waypoint)
  }

  const handleRemoveQueuedWaypoint = (id: string) => {
    actions.unqueueScienceTarget(id)
  }

  const handleRequestRouteDirectly = (target: CandidateTargetFeature) => {
    if (!regionCaps.supportsEvaRouting) return
    const proposed = {
      lat: target.geometry.coordinates[1],
      lon: target.geometry.coordinates[0],
    }
    const overwrite = checkCoordinateOverwrite('destination', mission.eva.destination, proposed)
    if (overwrite.willOverwrite) {
      setPendingRouteOverwrite({ feature: target, overwrite })
      return
    }
    setPendingRouteOverwrite(null)
    onSelectTargetForRouting(target)
  }

  const handlePlanQueuedSortie = () => {
    if (!regionCaps.supportsEvaRouting || queuedWaypoints.length === 0) return
    if (onSendWaypointsToEVAPlanner) {
      onSendWaypointsToEVAPlanner(queuedWaypoints)
    } else {
      actions.sendWaypointsToEVAPlanner(queuedWaypoints)
    }
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

      {mission.geographic.regionId !== JEZERO_SOURCE_REGION_ID && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.65rem 0.9rem',
            background: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: '4px',
            fontSize: '0.78rem',
            color: '#fbbf24',
          }}
        >
          Active Mission Region is <strong>{regionCaps.displayName}</strong> ({mission.geographic.regionId}). The ranked candidate target catalog below originates strictly from <strong>Jezero Crater Western Delta</strong> ({JEZERO_SOURCE_REGION_ID}); saved observations and targets retain <code>{JEZERO_SOURCE_REGION_ID}</code> provenance.
        </div>
      )}

      {mission.science.selectedGeologicalFeature?.relationshipMethod === 'KEYWORD_DISCOVERY_HINT' &&
        (mission.science.selectedGeologicalFeature.relatedTargetIds?.length ?? 0) > 0 && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.55rem 0.85rem',
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              borderRadius: '4px',
              fontSize: '0.74rem',
              color: '#d8b4fe',
            }}
          >
            <strong>Discovery Hint Only ({mission.science.selectedGeologicalFeature.relationshipEpistemicClass ?? 'HEURISTIC'}):</strong>{' '}
            Target focus linked via keyword overlap from{' '}
            <em>{mission.science.selectedGeologicalFeature.name}</em> — this is an exploratory theme match, not a verified field co-location.
          </div>
        )}

      {mission.science.selectedGeologicalFeature?.relationshipMethod === 'CURATED_SOURCE_SUPPORTED' &&
        (mission.science.selectedGeologicalFeature.relatedTargetIds?.length ?? 0) > 0 && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.55rem 0.85rem',
              background: 'rgba(234, 179, 8, 0.08)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              borderRadius: '4px',
              fontSize: '0.74rem',
              color: '#fde047',
            }}
          >
            <strong>Curated Source Association ({mission.science.selectedGeologicalFeature.relationshipEpistemicClass ?? 'INTERPRETED'}):</strong>{' '}
            Target focus linked via explicit curated source association from{' '}
            <em>{mission.science.selectedGeologicalFeature.name}</em>.
          </div>
        )}

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

      {!regionCaps.supportsEvaRouting && (
        <div
          className="notice-warning"
          style={{
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <span>
            Candidate science targets shown below belong to <strong>Jezero Crater (reg-jezero)</strong>. Active
            mission region is <strong>{regionCaps.displayName}</strong>; EVA routing actions remain disabled until
            switching back to Jezero Crater.
          </span>
          <button
            type="button"
            className="btn-primary"
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
            onClick={() => actions.setActiveRegion('reg-jezero')}
          >
            Switch Region to Jezero Crater
          </button>
        </div>
      )}

      {pendingRouteOverwrite && (
        <div
          className="notice-warning"
          style={{
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong>Destination Overwrite Confirmation: </strong>
            Replace current EVA Destination (
            {pendingRouteOverwrite.overwrite.existingCoordinate
              ? formatMarsCoordinate(pendingRouteOverwrite.overwrite.existingCoordinate, 4)
              : 'unset'}
            ) with <strong>{pendingRouteOverwrite.feature.properties.name}</strong> (
            {formatMarsCoordinate(pendingRouteOverwrite.overwrite.proposedCoordinate, 4)})?
          </span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn-primary"
              style={{ fontSize: '0.75rem', padding: '0.28rem 0.65rem' }}
              onClick={() => {
                const targetToRoute = pendingRouteOverwrite.feature
                setPendingRouteOverwrite(null)
                onSelectTargetForRouting(targetToRoute)
              }}
            >
              Confirm Overwrite & Route
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.28rem 0.65rem' }}
              onClick={() => setPendingRouteOverwrite(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
              const isQueued = queuedWaypoints.some(
                (w) => (w.id ?? w.name) === tgt.properties.target_id,
              )
              return (
                <div
                  key={tgt.properties.target_id}
                  className="card"
                  onClick={() => handleSelectTargetForInspection(tgt)}
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
                  onClick={() => actions.clearQueuedTargets()}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '240px', overflowY: 'auto' }}>
                {queuedWaypoints.map((wp, idx) => {
                  const wpKey = wp.id ?? wp.name
                  return (
                    <div
                      key={wpKey}
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
                          {formatMarsCoordinate({ lat: wp.lat, lon: wp.lon }, 4)}
                          {typeof wp.elevationM === 'number' ? ` • ${wp.elevationM.toFixed(1)} m` : ''}
                          {wp.epistemicClass ? ` • ${wp.epistemicClass}` : ''}
                        </div>
                        {wp.primaryTheme && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {wp.primaryTheme}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveQueuedWaypoint(wpKey)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}

                <button
                  type="button"
                  className="btn-primary"
                  disabled={!regionCaps.supportsEvaRouting}
                  title={
                    !regionCaps.supportsEvaRouting
                      ? 'Switch active region to Jezero Crater to plan an EVA sortie'
                      : undefined
                  }
                  onClick={handlePlanQueuedSortie}
                  style={{ marginTop: '0.6rem', padding: '0.4rem', fontSize: '0.75rem' }}
                >
                  🚀 Plan Multi-Destination Sortie ({queuedWaypoints.length} Stops)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Target Deep Dossier */}
        {selectedTarget && (
          <div className="card" style={{ padding: '1.2rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.8rem', gap: '0.8rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                    {selectedTarget.properties.target_id}
                  </span>
                  <span className="epistemic-badge epistemic-interpreted" style={{ fontSize: '0.65rem' }}>
                    {normalizeDatasetEpistemicTag(selectedTarget.properties.epistemic_class)}
                  </span>
                  <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                    Score {(selectedTarget.properties.composite_score * 100).toFixed(1)}%
                  </span>
                </div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.15rem' }}>
                  #{selectedTarget.properties.rank}: {selectedTarget.properties.name}
                </h3>
                <div style={{ marginTop: '0.35rem', fontSize: '0.73rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                  <div>
                    Theme: {selectedTarget.properties.primary_science_theme} · Region: {regionCaps.displayName} ({mission.geographic.regionId})
                  </div>
                  <div>
                    Coord: {formatMarsCoordinate({ lat: selectedTarget.geometry.coordinates[1], lon: selectedTarget.geometry.coordinates[0] }, 5)} ({CANONICAL_MARS_CRS}) · Elev: {selectedTarget.geometry.coordinates[2].toFixed(1)} m
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Source: {SCIENCE_TARGETS_DATASET_ID} · Provenance: {SCIENCE_TARGETS_PROVENANCE}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleSaveScienceObservation(selectedTarget)}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.76rem' }}
                >
                  {mission.science.savedObservations.some((o) => o.targetId === selectedTarget.properties.target_id)
                    ? '✓ Logged Observation'
                    : 'Save Observation to Mission'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleQueueWaypoint(selectedTarget)}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.76rem' }}
                >
                  {queuedWaypoints.some((w) => (w.id ?? w.name) === selectedTarget.properties.target_id)
                    ? '✓ Queued in Sortie'
                    : '+ Add to Sortie Queue'}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!regionCaps.supportsEvaRouting}
                  title={
                    !regionCaps.supportsEvaRouting
                      ? 'Switch active region to Jezero Crater to route directly'
                      : undefined
                  }
                  onClick={() => handleRequestRouteDirectly(selectedTarget)}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.76rem' }}
                >
                  🧭 Route Directly
                </button>
              </div>
            </div>

            {savedNotice && (
              <div
                style={{
                  marginTop: '0.65rem',
                  padding: '0.45rem 0.7rem',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '3px',
                  fontSize: '0.74rem',
                  color: '#6ee7b7',
                }}
              >
                ✓ {savedNotice}
              </div>
            )}

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

            {/* Supporting Datasets, Geological Cross-Links & Caveats */}
            {(() => {
              const hints = inferTargetGeologyThemes(selectedTarget)
              const datasetChips: Array<{ id: string; label: string }> = [
                { id: 'product-01', label: 'MRO HiRISE 1m DTM' },
                { id: 'product-03', label: 'MRO CTX 20m DTM' },
                { id: 'product-07', label: 'CRISM MTRDR Spectra' },
                { id: 'product-08', label: 'USGS SIM-3464 Map' },
              ]
              if (hints.recommendedDatasetIds.includes('product-09')) {
                datasetChips.push({ id: 'product-09', label: 'Perseverance MEDA' })
              }
              return (
                <div
                  style={{
                    marginTop: '1rem',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.8rem',
                  }}
                >
                  <div style={{ padding: '0.8rem', background: 'var(--bg-panel-elevated)', borderRadius: '4px', fontSize: '0.75rem' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.35rem' }}>
                      Connected Geological & Dataset Provenance
                    </strong>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                      {hints.relationshipMethod === 'CURATED_SOURCE_SUPPORTED'
                        ? 'Curated source-supported geological associations (INTERPRETED):'
                        : 'Heuristic discovery hints via keyword/score overlap (HEURISTIC — not verified geological correspondence):'}{' '}
                      <span style={{ color: 'var(--text-primary)' }}>{hints.keywords.join(', ')}</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                      Units: {hints.recommendedUnitHints.join(', ')} · CRISM: {hints.recommendedCrismHints.join(', ')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.55rem' }}>
                      {datasetChips.map((chip) => {
                        const isPinned = attachedDatasets.some((d) => d.datasetId === chip.id)
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleInspectDatasets(chip.id)}
                            style={{ fontSize: '0.68rem', padding: '0.2rem 0.45rem' }}
                          >
                            {chip.label}{isPinned ? ' ★' : ''}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleInvestigateGeology(selectedTarget)}
                        style={{ fontSize: '0.72rem', padding: '0.32rem 0.6rem' }}
                      >
                        Investigate Geological Context →
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleInspectDatasets(hints.recommendedDatasetIds[0] ?? 'product-07')}
                        style={{ fontSize: '0.72rem', padding: '0.32rem 0.6rem' }}
                      >
                        Inspect Supporting Datasets ({attachedDatasets.length} pinned) →
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: '0.8rem', background: 'var(--bg-panel-elevated)', borderRadius: '4px', fontSize: '0.75rem' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.3rem' }}>
                      Known Uncertainties & Caveats:
                    </strong>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                      <li>Sub-meter boulder fields unresolvable at 20m ARD grid</li>
                      <li>Atmospheric dust scattering reduces CRISM IR contrast</li>
                      <li>Subsurface clay layer thickness requires drill sampling</li>
                      <li>Candidate target rankings are INTERPRETED multi-criteria indices</li>
                    </ul>
                  </div>
                </div>
              )
            })()}

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
                Researcher Field Notes & In-Situ Hypotheses (Persisted in Shared MissionContext):
              </label>
              <textarea
                rows={3}
                value={fieldNotes[selectedTarget.properties.target_id] || ''}
                onChange={(e) => {
                  actions.setTargetNote(selectedTarget.properties.target_id, e.target.value)
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>Notes carry into queued Sortie Waypoints and Mission Observations</span>
                <span>✓ Synced to MissionContext draft</span>
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
