import React, { useEffect, useMemo, useState } from 'react'
import type { CostmapInspectionResponse } from '../api/costmap.ts'
import type { DynamicReroutePlanDTO } from '../api/emergency.ts'
import type { LocationHazardInspection } from '../api/hazards.ts'
import type { RouteFeature } from '../api/routing.ts'
import {
  fetchScienceTargets,
  type CandidateTargetFeature,
} from '../api/science.ts'
import type { DigitalTwinLayersResponse } from '../api/twin.ts'
import { MarsMap2D } from '../components/MarsMap2D.tsx'
import { MarsMap3D } from '../components/MarsMap3D.tsx'
import { useMission } from '../context/useMission.ts'
import {
  buildObservationFromInspection,
  checkCoordinateOverwrite,
  featureToSortieWaypoint,
  formatMarsCoordinate,
  isInsideBounds,
  normalizeEastLon,
  summarizeHazardInspection,
  type CoordinateOverwriteCheck,
} from '../mission/digitalTwinHelpers.ts'
import {
  DEFAULT_BASE_CAMP,
  DEFAULT_DESTINATION,
  VALID_OBS_CATEGORIES,
  isValidObservationCategory,
} from '../mission/missionModel.ts'
import { getRegionCapabilityProfile } from '../mission/regionCapabilities.ts'
import type { MissionObservationCategory } from '../types/mission.ts'

interface DigitalTwinPageProps {
  layersMeta: DigitalTwinLayersResponse | null
  activeLayers: Record<string, boolean>
  routes: RouteFeature[]
  emergencyPlan: DynamicReroutePlanDTO | null
  onLayerToggle: (layerId: string) => void
  onSelectCoords: (coords: { lat: number; lon: number }) => void
  onSelectTarget: (target: CandidateTargetFeature) => void
  selectedHazard: LocationHazardInspection | null
  selectedCost: CostmapInspectionResponse | null
  selectedTarget: CandidateTargetFeature | null
  isInspecting: boolean
}

const KEY_QUICK_LAYER_IDS = [
  'elevation_colormap',
  'elevation_contours',
  'slope_overlay',
  'terrain_classes',
  'overall_hazard',
  'source_coverage',
  'resolution_uncertainty',
  'science_opportunity',
  'unified_costmap',
  'perseverance_traverse',
] as const

export const DigitalTwinPage: React.FC<DigitalTwinPageProps> = ({
  layersMeta,
  activeLayers,
  routes,
  emergencyPlan,
  onLayerToggle,
  onSelectCoords,
  onSelectTarget,
  selectedHazard,
  selectedCost,
  selectedTarget,
  isInspecting,
}) => {
  const { mission, runtime, actions } = useMission()

  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D')
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [scienceCatalog, setScienceCatalog] = useState<CandidateTargetFeature[]>([])
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null)

  // Quick coordinate lookup form
  const [manualLat, setManualLat] = useState<string>('')
  const [manualLon, setManualLon] = useState<string>('')
  const [coordFormError, setCoordFormError] = useState<string | null>(null)

  // Lightweight observation capture form
  const [obsCategory, setObsCategory] = useState<MissionObservationCategory>('TERRAIN')
  const [obsLabel, setObsLabel] = useState<string>('')
  const [obsNote, setObsNote] = useState<string>('')
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null)

  // Explicit overwrite safeguard for Base Camp / Destination
  const [pendingOverwrite, setPendingOverwrite] = useState<CoordinateOverwriteCheck | null>(null)

  const activeRegionId = mission.geographic.regionId
  const regionCaps = useMemo(
    () => getRegionCapabilityProfile(activeRegionId),
    [activeRegionId],
  )
  const isJezeroActive = regionCaps.supportsLocalDigitalTwin

  // Load ranked Jezero science targets when Digital Twin is active
  useEffect(() => {
    if (!isJezeroActive) return
    let cancelled = false
    fetchScienceTargets()
      .then((fc) => {
        if (!cancelled) {
          setScienceCatalog(fc.features ?? [])
          setCatalogLoadError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCatalogLoadError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [isJezeroActive])

  const inspectionSummary = useMemo(
    () =>
      summarizeHazardInspection(
        selectedHazard,
        selectedCost,
        runtime.selectedTerrain,
        runtime.selectedScience,
      ),
    [selectedHazard, selectedCost, runtime.selectedTerrain, runtime.selectedScience],
  )

  const activeLayerMeta = useMemo(() => {
    if (!layersMeta) return []
    return layersMeta.layers.filter(
      (l) => l.id !== 'ortho_imagery' && Boolean(activeLayers[l.id]),
    )
  }, [layersMeta, activeLayers])

  const quickToggleLayers = useMemo(() => {
    if (!layersMeta) return []
    const byId = new Map(layersMeta.layers.map((l) => [l.id, l]))
    return KEY_QUICK_LAYER_IDS.map((id) => byId.get(id)).filter(
      (item): item is NonNullable<typeof item> => Boolean(item),
    )
  }, [layersMeta])

  const requestApplyEvaCoordinate = (
    role: 'baseCamp' | 'destination',
    coord: { lat: number; lon: number },
  ) => {
    setStatusFeedback(null)
    if (!isJezeroActive) return

    const bounds = layersMeta?.study_area?.bounds
    if (!bounds || !isInsideBounds(coord, bounds)) {
      setStatusFeedback(
        !bounds
          ? `Cannot place ${role === 'baseCamp' ? 'Base Camp' : 'Destination'}: study footprint metadata unavailable.`
          : `Cannot place ${role === 'baseCamp' ? 'Base Camp' : 'Destination'} outside the Jezero study footprint.`,
      )
      return
    }

    const existing = role === 'baseCamp' ? mission.eva.baseCamp : mission.eva.destination
    const overwrite = checkCoordinateOverwrite(role, existing, coord)
    if (overwrite.willOverwrite) {
      setPendingOverwrite(overwrite)
      return
    }

    if (role === 'baseCamp') {
      actions.setStartPoint(overwrite.proposedCoordinate)
      setStatusFeedback(
        `Base Camp confirmed at ${formatMarsCoordinate(overwrite.proposedCoordinate)}.`,
      )
    } else {
      actions.setDestPoint(overwrite.proposedCoordinate)
      setStatusFeedback(
        `EVA Destination confirmed at ${formatMarsCoordinate(overwrite.proposedCoordinate)}.`,
      )
    }
  }

  const confirmPendingOverwrite = () => {
    if (!pendingOverwrite) return
    if (pendingOverwrite.role === 'baseCamp') {
      actions.setStartPoint(pendingOverwrite.proposedCoordinate)
      setStatusFeedback(
        `Base Camp updated to ${formatMarsCoordinate(pendingOverwrite.proposedCoordinate)}.`,
      )
    } else {
      actions.setDestPoint(pendingOverwrite.proposedCoordinate)
      setStatusFeedback(
        `EVA Destination updated to ${formatMarsCoordinate(pendingOverwrite.proposedCoordinate)}.`,
      )
    }
    setPendingOverwrite(null)
  }

  const handleManualInspect = (e: React.FormEvent) => {
    e.preventDefault()
    const lat = Number.parseFloat(manualLat)
    const rawLon = Number.parseFloat(manualLon)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(rawLon)) {
      setCoordFormError('Enter a valid planetocentric latitude [-90, 90] and east longitude.')
      return
    }
    setCoordFormError(null)
    setPendingOverwrite(null)
    onSelectCoords({ lat, lon: normalizeEastLon(rawLon) })
  }

  const handleSaveObservation = (sourceMode: 'INSPECTION' | 'TARGET') => {
    const coord =
      sourceMode === 'TARGET' && selectedTarget
        ? {
            lat: selectedTarget.geometry.coordinates[1],
            lon: selectedTarget.geometry.coordinates[0],
          }
        : selectedHazard?.coordinate ?? mission.geographic.selectedLocation

    if (!coord) {
      setStatusFeedback('Select a coordinate or science target before saving an observation.')
      return
    }

    const obs = buildObservationFromInspection({
      coordinate: coord,
      category: sourceMode === 'TARGET' ? 'SCIENCE' : obsCategory,
      label:
        sourceMode === 'TARGET' && selectedTarget
          ? `${selectedTarget.properties.target_id}: ${selectedTarget.properties.name}`
          : obsLabel,
      note: obsNote,
      regionId: activeRegionId,
      hazard: selectedHazard,
      target: sourceMode === 'TARGET' ? selectedTarget : null,
    })
    actions.addObservation(obs)
    setObsLabel('')
    setObsNote('')
    setStatusFeedback(`Saved mission observation "${obs.label}" (${obs.epistemicClass}).`)
  }

  const queuedIds = useMemo(
    () => new Set(mission.science.queuedTargets.map((t) => t.id ?? t.name)),
    [mission.science.queuedTargets],
  )

  const handleToggleQueueTarget = (feature: CandidateTargetFeature) => {
    const waypoint = featureToSortieWaypoint(feature, activeRegionId)
    const key = waypoint.id ?? waypoint.name
    if (queuedIds.has(key)) {
      actions.unqueueScienceTarget(key)
      setStatusFeedback(`Removed ${key} from mission science queue.`)
    } else {
      actions.queueScienceTarget(waypoint)
      setStatusFeedback(`Queued ${key} for EVA mission planning.`)
    }
  }

  // Honest Region Capability Guard when a non-Jezero region is selected
  if (!isJezeroActive) {
    return (
      <div className="page-container">
        <div
          className="card"
          style={{
            border: '1px solid #52525b',
            borderLeft: '4px solid #d97706',
            background: 'var(--bg-panel)',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <div>
              <span className="badge badge-unknown" style={{ marginBottom: '0.4rem', display: 'inline-block' }}>
                {regionCaps.capabilityBadge}
              </span>
              <h2 style={{ margin: '0.2rem 0', color: 'var(--text-primary)' }}>
                Local Digital Twin Unavailable for {regionCaps.displayName}
              </h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Marswalk only ships high-resolution local DTM, hazard fusion, and EVA traversal rasters for{' '}
                <strong>Jezero Crater (reg-jezero)</strong>. Jezero terrain is never substituted for another region.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => actions.setActivePage('map-explorer', 'REGIONAL_MAP')}
              >
                ← Inspect {regionCaps.canonicalFeatureName} Dossier
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => actions.setActiveRegion('reg-jezero')}
              >
                Switch Mission Region to Jezero Crater
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <div>
              <strong>Available Region Data: </strong>
              {regionCaps.primaryResolutionSummary}
            </div>
            <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.2rem' }}>
              {regionCaps.limitations.map((lim, idx) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* Header & Mission Context Controls */}
      <div className="twin-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
              Jezero Scientific Digital Twin ({viewMode})
            </h2>
            <span className="badge badge-observed">{regionCaps.capabilityBadge}</span>
          </div>
          <small style={{ color: 'var(--text-secondary)' }}>
            {layersMeta?.study_area.name ?? 'Jezero Western Fan & Delta'} • CRS:{' '}
            {layersMeta?.study_area.crs_geographic ?? 'IAU_2015:49900'} (Analysis:{' '}
            {layersMeta?.study_area.crs_projected ?? 'ESRI:103885'}) • Base Camp:{' '}
            {formatMarsCoordinate(mission.eva.baseCamp ?? DEFAULT_BASE_CAMP, 4)} → Dest:{' '}
            {formatMarsCoordinate(mission.eva.destination ?? DEFAULT_DESTINATION, 4)}
          </small>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div className="coord-telemetry">
            {hoverCoords
              ? `Mars: ${formatMarsCoordinate(hoverCoords, 5)}`
              : mission.geographic.selectedLocation
                ? `Selected: ${formatMarsCoordinate(mission.geographic.selectedLocation, 5)}`
                : 'Click map to inspect terrain, hazards & science'}
          </div>
          <div className="mode-toggle">
            <button
              type="button"
              className={`mode-btn ${viewMode === '2D' ? 'active' : ''}`}
              onClick={() => setViewMode('2D')}
            >
              2D Tactical
            </button>
            <button
              type="button"
              className={`mode-btn ${viewMode === '3D' ? 'active' : ''}`}
              onClick={() => setViewMode('3D')}
            >
              3D Terrain
            </button>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => actions.openEvaPlanner()}
          >
            Open EVA Planner ({mission.science.queuedTargets.length} queued) →
          </button>
        </div>
      </div>

      {/* Honest Optical Imagery Disclaimer Banner */}
      <div
        className="card"
        style={{
          marginBottom: '0.75rem',
          padding: '0.75rem 1rem',
          borderLeft: '4px solid #38bdf8',
          background: 'rgba(56, 189, 248, 0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ flex: 1, minWidth: '280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.9rem' }}>ℹ️</span>
            <strong style={{ color: 'var(--text-primary)', fontSize: '0.86rem' }}>
              High-resolution optical imagery is currently unavailable in this view.
            </strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Jezero Western Delta terrain analysis is powered by authentic elevation models (HiRISE 1m local / CTX 20m regional DTM), 50m vector contour lines, slope hazard masks, and verified Perseverance rover telemetry. Missing optical surface imagery is not simulated or fabricated.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge badge-derived" style={{ fontSize: '0.65rem' }}>ELEVATION DATA ACTIVE</span>
          <span className="badge badge-unknown" style={{ fontSize: '0.65rem' }}>OPTICAL UNAVAILABLE</span>
        </div>
      </div>

      {/* Layer Provenance Quick Bar synced with MissionContext.activeLayers */}
      {layersMeta && (
        <div
          className="card"
          style={{
            marginBottom: '0.75rem',
            padding: '0.6rem 0.85rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.45rem',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, marginRight: '0.25rem' }}>
              LAYERS ({activeLayerMeta.length} ACTIVE):
            </span>
            {quickToggleLayers.map((layer) => {
              const isOn = Boolean(activeLayers[layer.id])
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => onLayerToggle(layer.id)}
                  style={{
                    background: isOn ? '#ffffff' : '#18181b',
                    color: isOn ? '#090909' : '#a1a1aa',
                    border: isOn ? '1px solid #ffffff' : '1px solid #303030',
                    padding: '0.18rem 0.45rem',
                    fontSize: '0.68rem',
                    fontWeight: isOn ? 700 : 500,
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                  title={`${layer.name} [${layer.epistemic_class}] — ${layer.description}`}
                >
                  {layer.id.replace(/_/g, ' ')} ({layer.epistemic_class})
                </button>
              )
            })}
          </div>

          <form onSubmit={handleManualInspect} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Lat (e.g. 18.459)"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              style={{
                width: '105px',
                background: '#090909',
                border: '1px solid #303030',
                color: '#f5f5f5',
                padding: '0.2rem 0.4rem',
                fontSize: '0.72rem',
              }}
            />
            <input
              type="text"
              placeholder="Lon (e.g. 77.408)"
              value={manualLon}
              onChange={(e) => setManualLon(e.target.value)}
              style={{
                width: '105px',
                background: '#090909',
                border: '1px solid #303030',
                color: '#f5f5f5',
                padding: '0.2rem 0.4rem',
                fontSize: '0.72rem',
              }}
            />
            <button type="submit" className="btn-secondary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
              Inspect Coord
            </button>
          </form>
        </div>
      )}

      {coordFormError && (
        <div className="card status-error" style={{ marginBottom: '0.6rem', padding: '0.5rem 0.75rem', fontSize: '0.78rem' }}>
          {coordFormError}
        </div>
      )}
      {statusFeedback && (
        <div
          className="card"
          style={{
            marginBottom: '0.6rem',
            padding: '0.5rem 0.75rem',
            fontSize: '0.78rem',
            borderColor: '#52525b',
            background: '#141417',
          }}
        >
          {statusFeedback}
        </div>
      )}

      {/* Map Viewport */}
      <div className="map-viewport-card">
        {!layersMeta ? (
          <div className="loading-box">Fetching authenticated Mars GIS layers from FastAPI…</div>
        ) : viewMode === '2D' ? (
          <MarsMap2D
            metadata={layersMeta}
            activeLayers={activeLayers}
            routes={routes}
            emergencyPlan={emergencyPlan}
            onLayerToggle={onLayerToggle}
            onHoverCoords={setHoverCoords}
            onSelectCoords={(c) => {
              setPendingOverwrite(null)
              onSelectCoords(c)
            }}
            onSelectTarget={(feat) => {
              setPendingOverwrite(null)
              onSelectTarget(feat)
            }}
          />
        ) : (
          <MarsMap3D metadata={layersMeta} />
        )}
      </div>

      {/* Overwrite Safeguard Confirmation Banner */}
      {pendingOverwrite && (
        <div
          className="card"
          style={{
            marginTop: '0.8rem',
            border: '1px solid #d97706',
            borderLeft: '4px solid #d97706',
            background: '#1c1509',
            padding: '0.75rem 1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.82rem', color: '#fef3c7' }}>
              <strong>Confirm Overwrite ({pendingOverwrite.role === 'baseCamp' ? 'Base Camp' : 'EVA Destination'}): </strong>
              Replace existing{' '}
              {pendingOverwrite.existingCoordinate
                ? formatMarsCoordinate(pendingOverwrite.existingCoordinate, 5)
                : 'unset point'}{' '}
              with {formatMarsCoordinate(pendingOverwrite.proposedCoordinate, 5)}?
            </div>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <button type="button" className="btn-primary" onClick={confirmPendingOverwrite}>
                Confirm Replace
              </button>
              <button type="button" className="btn-secondary" onClick={() => setPendingOverwrite(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Error / Loading States */}
      {isInspecting && (
        <div className="card" style={{ marginTop: '0.8rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Querying 20 m / 1 m terrain, hazard masks, uncalibrated reliability indices & science opportunity…
        </div>
      )}

      {!isInspecting && runtime.inspectionError && (
        <div className="card status-error" style={{ marginTop: '0.8rem' }}>
          <strong>Inspection Error: </strong>
          {runtime.inspectionError}
        </div>
      )}

      {/* Selected Location Terrain, Hazard, Reliability, Uncertainty & Handoff Inspector */}
      {!isInspecting && inspectionSummary && selectedHazard && (
        <div className="card hazard-inspector" style={{ marginTop: '0.8rem' }}>
          <div className="hazard-inspector-header" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Location Hazard, Terrain & Reliability Inspection
              </h3>
              <small style={{ color: 'var(--text-secondary)' }}>
                Coord: {formatMarsCoordinate(selectedHazard.coordinate, 5)} • Source:{' '}
                {inspectionSummary.sourceLabel} • Epistemic:{' '}
                <span className={`badge badge-${inspectionSummary.epistemicClass.toLowerCase()}`}>
                  {inspectionSummary.epistemicClass}
                </span>
              </small>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                className={`passability-badge ${
                  inspectionSummary.isPassable ? 'passable' : 'impassable'
                }`}
              >
                {inspectionSummary.statusBadgeLabel}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={!inspectionSummary.canPlaceEvaPoint}
                onClick={() => requestApplyEvaCoordinate('baseCamp', selectedHazard.coordinate)}
                title={
                  inspectionSummary.canPlaceEvaPoint
                    ? 'Set inspected coordinate as EVA Base Camp'
                    : 'Disabled: unmapped/NoData locations cannot serve as EVA Base Camp'
                }
              >
                Set Base Camp
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!inspectionSummary.canPlaceEvaPoint}
                onClick={() => requestApplyEvaCoordinate('destination', selectedHazard.coordinate)}
                title={
                  inspectionSummary.canPlaceEvaPoint
                    ? 'Set inspected coordinate as EVA Destination'
                    : 'Disabled: unmapped/NoData locations cannot serve as EVA Destination'
                }
              >
                Set Destination
              </button>
            </div>
          </div>

          {inspectionSummary.isUnresolvedResolutionOnly && (
            <div
              className="notice-warning"
              style={{ marginTop: '0.6rem', fontSize: '0.78rem' }}
            >
              <strong>CTX 20 m Coverage Only: </strong>
              Metre-scale boulders and sharp scarps remain unresolved without 1.0 m HiRISE overlap (conservative safety restriction active).
            </div>
          )}

          <div className="hazard-breakdown-grid" style={{ marginTop: '0.75rem' }}>
            <div className="hazard-stat-box">
              <div className="stat-label">Elevation</div>
              <div className="stat-value" style={{ fontSize: '0.95rem' }}>
                {inspectionSummary.elevationLabel}
              </div>
            </div>
            <div className="hazard-stat-box">
              <div className="stat-label">Overall Hazard</div>
              <div className="stat-value" style={{ fontSize: '0.95rem' }}>
                {inspectionSummary.overallHazardLabel}
              </div>
            </div>
            <div className="hazard-stat-box">
              <div className="stat-label">Slope Hazard</div>
              <div className="stat-value" style={{ fontSize: '0.92rem' }}>
                {inspectionSummary.slopeHazardLabel}
              </div>
            </div>
            <div className="hazard-stat-box">
              <div className="stat-label">Roughness (TRI)</div>
              <div className="stat-value" style={{ fontSize: '0.92rem' }}>
                {inspectionSummary.roughnessHazardLabel}
              </div>
            </div>
            <div className="hazard-stat-box">
              <div className="stat-label">Boulder Heuristic</div>
              <div className="stat-value" style={{ fontSize: '0.92rem' }}>
                {inspectionSummary.boulderHazardLabel}
              </div>
            </div>
            <div className="hazard-stat-box">
              <div className="stat-label">Sand / Dune Heuristic</div>
              <div className="stat-value" style={{ fontSize: '0.92rem' }}>
                {inspectionSummary.sandHazardLabel}
              </div>
            </div>
            <div className="hazard-stat-box">
              <div className="stat-label">Cost Multiplier</div>
              <div className="stat-value" style={{ fontSize: '0.92rem' }}>
                {inspectionSummary.costSummaryLabel}
              </div>
            </div>
            <div className="hazard-stat-box">
              <div className="stat-label">Science Opportunity</div>
              <div className="stat-value" style={{ fontSize: '0.92rem' }}>
                {inspectionSummary.scienceScoreLabel}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.5rem',
              marginTop: '0.65rem',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ background: '#0e0e11', border: '1px solid #27272a', padding: '0.45rem 0.6rem' }}>
              <strong>Data Reliability: </strong>
              {inspectionSummary.dataReliabilityLabel}
            </div>
            <div style={{ background: '#0e0e11', border: '1px solid #27272a', padding: '0.45rem 0.6rem' }}>
              <strong>Evidence Reliability: </strong>
              {inspectionSummary.detectionReliabilityLabel}
            </div>
            <div style={{ background: '#0e0e11', border: '1px solid #27272a', padding: '0.45rem 0.6rem' }}>
              <strong>Precision Tier: </strong>
              {inspectionSummary.verticalPrecisionLabel}
            </div>
            <div style={{ background: '#0e0e11', border: '1px solid #27272a', padding: '0.45rem 0.6rem' }}>
              <strong>Property Provenance: </strong>
              {inspectionSummary.propertyEpistemicSummary}
            </div>
          </div>

          {runtime.selectedTerrain?.local_micro_analysis_1m?.is_available && (
            <div
              style={{
                marginTop: '0.55rem',
                background: '#0e0e11',
                border: '1px solid #27272a',
                padding: '0.5rem 0.7rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              <strong>1.0 m HiRISE Micro-Window (60 m radius): </strong>
              Slope mean {runtime.selectedTerrain.local_micro_analysis_1m.metrics_1m.slope_deg.mean?.toFixed(1) ?? 'N/A'}°
              {' • '}p90 {runtime.selectedTerrain.local_micro_analysis_1m.metrics_1m.slope_deg.p90?.toFixed(1) ?? 'N/A'}°
              {' • '}Local relief {runtime.selectedTerrain.local_micro_analysis_1m.elevation.local_relief_m.toFixed(1)} m
              {' • '}Candidate boulders: {runtime.selectedTerrain.local_micro_analysis_1m.candidate_boulders.discrete_objects_found}
            </div>
          )}

          <div className="hazard-explanation-box" style={{ marginTop: '0.6rem' }}>
            <strong>Intelligence Rationale: </strong>
            {inspectionSummary.explanationText}
          </div>

          {selectedCost && (
            <div className="hazard-explanation-box" style={{ borderLeftColor: 'var(--accent-secondary)', marginTop: '0.5rem' }}>
              <strong>Cost Evaluation ({selectedCost.mission_profile}): </strong>
              {selectedCost.explanation}
            </div>
          )}

          {/* Save Lightweight Mission Observation */}
          <div
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #27272a',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.45rem',
              alignItems: 'center',
            }}
          >
            <strong style={{ fontSize: '0.76rem', color: 'var(--text-primary)' }}>
              Log Mission Observation:
            </strong>
            <select
              value={obsCategory}
              onChange={(e) => {
                const value = e.target.value
                if (isValidObservationCategory(value)) {
                  setObsCategory(value)
                }
              }}
              style={{
                background: '#090909',
                border: '1px solid #303030',
                color: '#f5f5f5',
                padding: '0.25rem 0.45rem',
                fontSize: '0.74rem',
              }}
            >
              {VALID_OBS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Short observation label (e.g. Delta scarp margin)"
              value={obsLabel}
              onChange={(e) => setObsLabel(e.target.value)}
              style={{
                flex: '1 1 200px',
                background: '#090909',
                border: '1px solid #303030',
                color: '#f5f5f5',
                padding: '0.25rem 0.45rem',
                fontSize: '0.74rem',
              }}
            />
            <input
              type="text"
              placeholder="Optional scientific / operational note"
              value={obsNote}
              onChange={(e) => setObsNote(e.target.value)}
              style={{
                flex: '1 1 220px',
                background: '#090909',
                border: '1px solid #303030',
                color: '#f5f5f5',
                padding: '0.25rem 0.45rem',
                fontSize: '0.74rem',
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleSaveObservation('INSPECTION')}
            >
              Save Observation ({inspectionSummary.epistemicClass})
            </button>
          </div>
        </div>
      )}

      {/* Selected Ranked Science Target & Target Catalog Selector */}
      <div
        className="card"
        style={{
          marginTop: '0.8rem',
          borderColor: selectedTarget ? 'var(--border-active)' : 'var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.6rem' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>
              Ranked Science Targets (Jezero Western Delta)
            </h3>
            <small style={{ color: 'var(--text-secondary)' }}>
              Source: <code>jezero_western_delta_20m_science_targets.json</code> • Inspect, queue for sortie planning, or set as EVA destination.
            </small>
          </div>
          <span className="badge badge-interpreted">INTERPRETED</span>
        </div>

        {catalogLoadError && (
          <div className="status-error" style={{ fontSize: '0.78rem', marginBottom: '0.6rem' }}>
            Failed to load ranked target catalog: {catalogLoadError}
          </div>
        )}

        {scienceCatalog.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
            {scienceCatalog.map((feat) => {
              const isSelected = selectedTarget?.properties.target_id === feat.properties.target_id
              const isQueued = queuedIds.has(feat.properties.target_id)
              return (
                <button
                  key={feat.properties.target_id}
                  type="button"
                  onClick={() => {
                    onSelectTarget(feat)
                    onSelectCoords({
                      lat: feat.geometry.coordinates[1],
                      lon: feat.geometry.coordinates[0],
                    })
                  }}
                  style={{
                    background: isSelected ? '#ffffff' : '#121214',
                    color: isSelected ? '#090909' : '#d4d4d8',
                    border: isSelected ? '1px solid #ffffff' : '1px solid #303030',
                    padding: '0.28rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: isSelected ? 700 : 500,
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  #{feat.properties.rank} {feat.properties.target_id}
                  {isQueued ? ' [QUEUED]' : ''}
                </button>
              )
            })}
          </div>
        )}

        {selectedTarget ? (
          <div style={{ borderTop: '1px solid #27272a', paddingTop: '0.7rem' }}>
            <div className="target-header" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
              <div>
                <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
                  #{selectedTarget.properties.rank} {selectedTarget.properties.name} ({selectedTarget.properties.target_id})
                </h4>
                <small style={{ color: 'var(--text-secondary)' }}>
                  Theme: {selectedTarget.properties.primary_science_theme} • Score:{' '}
                  {(selectedTarget.properties.composite_score * 100).toFixed(1)}% • Elev:{' '}
                  {selectedTarget.geometry.coordinates[2].toFixed(1)} m (Areoid) •{' '}
                  {formatMarsCoordinate(
                    {
                      lat: selectedTarget.geometry.coordinates[1],
                      lon: selectedTarget.geometry.coordinates[0],
                    },
                    5,
                  )}
                </small>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={queuedIds.has(selectedTarget.properties.target_id) ? 'btn-secondary' : 'btn-primary'}
                  onClick={() => handleToggleQueueTarget(selectedTarget)}
                >
                  {queuedIds.has(selectedTarget.properties.target_id)
                    ? 'Remove Target from Queue'
                    : 'Queue Science Target'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    requestApplyEvaCoordinate('destination', {
                      lat: selectedTarget.geometry.coordinates[1],
                      lon: selectedTarget.geometry.coordinates[0],
                    })
                  }
                >
                  Set as Destination
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleSaveObservation('TARGET')}
                >
                  Save Target Observation
                </button>
              </div>
            </div>

            <p className="rationale" style={{ marginTop: '0.5rem' }}>
              {selectedTarget.properties.rationale}
            </p>
            <div className="notice-warning" style={{ marginTop: '0.45rem', fontSize: '0.75rem' }}>
              {selectedTarget.properties.safety_caveat}
            </div>
            <div className="notice-warning" style={{ marginTop: '0.35rem', fontSize: '0.75rem' }}>
              {selectedTarget.properties.life_inference_warning}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Select any ranked target above or click a gold/white target circle on the map to inspect provenance and queue it for EVA planning.
          </div>
        )}
      </div>

      {/* Mission Queue & Saved Observations Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '0.8rem',
          marginTop: '0.8rem',
        }}
      >
        {/* Queued Science Targets */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
              Queued Science Targets ({mission.science.queuedTargets.length})
            </h4>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
              onClick={() => actions.openEvaPlanner()}
            >
              Open in EVA Planner →
            </button>
          </div>
          {mission.science.queuedTargets.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              No targets queued yet. Queue targets above to carry them into the EVA Route Planner.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {mission.science.queuedTargets.map((tgt) => {
                const key = tgt.id ?? tgt.name
                const coord = { lat: tgt.lat, lon: tgt.lon }
                return (
                  <div
                    key={key}
                    style={{
                      background: '#111114',
                      border: '1px solid #27272a',
                      padding: '0.45rem 0.6rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.76rem',
                    }}
                  >
                    <div>
                      <strong>{tgt.name}</strong> ({key})
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        {formatMarsCoordinate(coord, 4)}
                        {typeof tgt.elevationM === 'number' ? ` • ${tgt.elevationM.toFixed(1)} m` : ''}
                        {tgt.primaryTheme ? ` • ${tgt.primaryTheme}` : ''}
                        {tgt.epistemicClass ? ` • ${tgt.epistemicClass}` : ''}
                      </div>
                      {tgt.sourceDataset && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          Source: {tgt.sourceDataset}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.68rem', padding: '0.18rem 0.45rem' }}
                        onClick={() => requestApplyEvaCoordinate('destination', coord)}
                      >
                        Set Dest
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.68rem', padding: '0.18rem 0.45rem' }}
                        onClick={() => actions.unqueueScienceTarget(key)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Saved Lightweight Observations */}
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
            Saved Mission Observations ({mission.science.savedObservations.length})
          </h4>
          {mission.science.savedObservations.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              No saved observations yet. Inspect a coordinate or target and click &quot;Save Observation&quot;.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto' }}>
              {mission.science.savedObservations.map((obs) => (
                <div
                  key={obs.id}
                  style={{
                    background: '#111114',
                    border: '1px solid #27272a',
                    padding: '0.45rem 0.6rem',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                    <div>
                      <span className="badge" style={{ marginRight: '0.35rem', border: '1px solid #3f3f46' }}>
                        {obs.category}
                      </span>
                      <span className={`badge badge-${obs.epistemicClass.toLowerCase()}`} style={{ marginRight: '0.4rem' }}>
                        {obs.epistemicClass}
                      </span>
                      <strong>{obs.label}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {obs.coordinate ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                          onClick={() => obs.coordinate && onSelectCoords(obs.coordinate)}
                        >
                          Inspect
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.66rem',
                            color: 'var(--text-muted)',
                            padding: '0.15rem 0.35rem',
                            border: '1px solid #27272a',
                            borderRadius: '2px',
                          }}
                          title="Regional or global unit metadata has no single point coordinate"
                        >
                          No Point Coord
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}
                        onClick={() => actions.removeObservation(obs.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    {obs.derivedSummary ?? obs.summary}
                  </div>
                  {obs.userNote && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', marginTop: '0.18rem' }}>
                      Note: {obs.userNote}
                    </div>
                  )}
                  {(obs.regionId || obs.sourceDataset || obs.spatialCoverage || obs.coverageBounds) && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.18rem' }}>
                      {obs.regionId ? `Region: ${obs.regionId}` : ''}
                      {obs.regionId && obs.spatialCoverage ? ' • ' : ''}
                      {obs.spatialCoverage ? `Extent: ${obs.spatialCoverage}` : ''}
                      {(obs.regionId || obs.spatialCoverage) && obs.coverageBounds ? ' • ' : ''}
                      {obs.coverageBounds
                        ? `Bounds: [${obs.coverageBounds[0][0].toFixed(2)}°..${obs.coverageBounds[1][0].toFixed(2)}°, ${obs.coverageBounds[0][1].toFixed(2)}°..${obs.coverageBounds[1][1].toFixed(2)}°]`
                        : ''}
                      {(obs.regionId || obs.spatialCoverage || obs.coverageBounds) && obs.sourceDataset ? ' • ' : ''}
                      {obs.sourceDataset ? `Dataset: ${obs.sourceDataset}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
