import React, { useState } from 'react'
import type { RouteFeature } from '../api/routing'
import { planRoute, planRouteSuite } from '../api/routing'
import type { CostmapWeightsDTO } from '../api/costmap'
import { useMission } from '../context/useMission.ts'
import {
  checkCoordinateOverwrite,
  formatMarsCoordinate,
  type CoordinateOverwriteCheck,
} from '../mission/digitalTwinHelpers.ts'
import {
  evaluateEvaConfigCompatibility,
  getRegionCapabilityProfile,
  isTargetCompatibleWithRegion,
} from '../mission/regionCapabilities.ts'

interface EVARoutePlannerPageProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  onUpdateCoordinates: (start: { lat: number; lon: number }, dest: { lat: number; lon: number }) => void
  activeProfile: string
  onSelectProfile: (prof: string) => void
  weights: CostmapWeightsDTO
  onWeightChange: (key: keyof CostmapWeightsDTO, val: number) => void
  routes: RouteFeature[]
  onRoutesCalculated: (routes: RouteFeature[]) => void
}

export const EVARoutePlannerPage: React.FC<EVARoutePlannerPageProps> = ({
  startPoint,
  destPoint,
  onUpdateCoordinates,
  activeProfile,
  onSelectProfile,
  weights,
  onWeightChange,
  routes,
  onRoutesCalculated,
}) => {
  const { mission, actions } = useMission()
  const [isPlanning, setIsPlanning] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [showWeights, setShowWeights] = useState<boolean>(false)
  const [pendingDestOverwrite, setPendingDestOverwrite] = useState<{
    label: string
    overwrite: CoordinateOverwriteCheck
  } | null>(null)
  const regionCaps = getRegionCapabilityProfile(mission.geographic.regionId)
  const evaCompatibility = evaluateEvaConfigCompatibility({
    activeRegionId: mission.geographic.regionId,
    baseCamp: startPoint,
    destination: destPoint,
    waypoints: mission.eva.waypoints,
  })

  const requestApplyDestination = (
    label: string,
    coord: { lat: number; lon: number },
    sourceRegionId?: string | null,
  ) => {
    const compat = isTargetCompatibleWithRegion(
      { regionId: sourceRegionId ?? 'reg-jezero', lat: coord.lat, lon: coord.lon },
      mission.geographic.regionId,
    )
    if (!compat.compatible) {
      setError(compat.reason)
      return
    }
    setError(null)
    const overwrite = checkCoordinateOverwrite('destination', destPoint, coord)
    if (overwrite.willOverwrite) {
      setPendingDestOverwrite({ label, overwrite })
      return
    }
    setPendingDestOverwrite(null)
    onUpdateCoordinates(startPoint, overwrite.proposedCoordinate)
  }

  const moveWaypoint = (index: number, direction: 'up' | 'down') => {
    const list = [...mission.eva.waypoints]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= list.length) return
    const temp = list[index]
    list[index] = list[targetIndex]
    list[targetIndex] = temp
    actions.setQueuedWaypoints(list)
  }

  const removeWaypoint = (index: number) => {
    const list = mission.eva.waypoints.filter((_, i) => i !== index)
    actions.setQueuedWaypoints(list)
  }

  const addQueuedTargetAsWaypoint = (target: (typeof mission.science.queuedTargets)[0]) => {
    const isAlreadyAdded = mission.eva.waypoints.some(
      (w) => w.id === target.id || (w.lat === target.lat && w.lon === target.lon),
    )
    if (isAlreadyAdded) return
    actions.setQueuedWaypoints([...mission.eva.waypoints, target])
  }

  const handlePlanSingle = () => {
    if (!evaCompatibility.compatible) {
      setError(evaCompatibility.reason)
      return
    }
    setIsPlanning(true)
    setError(null)
    const waypoints = mission.eva.waypoints.map((w) => ({ lat: w.lat, lon: w.lon }))
    planRoute(startPoint, destPoint, activeProfile, 'astar', true, waypoints)
      .then((feature) => {
        onRoutesCalculated([feature])
        setIsPlanning(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setIsPlanning(false)
      })
  }

  const handlePlanSuite = () => {
    if (!evaCompatibility.compatible) {
      setError(evaCompatibility.reason)
      return
    }
    setIsPlanning(true)
    setError(null)
    const waypoints = mission.eva.waypoints.map((w) => ({ lat: w.lat, lon: w.lon }))
    planRouteSuite(startPoint, destPoint, 'astar', true, waypoints)
      .then((featCol) => {
        onRoutesCalculated(featCol.features)
        setIsPlanning(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setIsPlanning(false)
      })
  }

  const activeRoute = routes.length > 0 ? routes[0] : null

  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            EVA Route Optimization Engine
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            A* & Dijkstra Constraint-Satisfying Traversal • 8-Directional Kinematic Graph Search
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePlanSingle}
            disabled={isPlanning || !evaCompatibility.compatible}
            title={!evaCompatibility.compatible ? (evaCompatibility.reason ?? undefined) : undefined}
          >
            {isPlanning ? 'Calculating…' : `Plan ${activeProfile.replace('_', ' ')} Route`}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handlePlanSuite}
            disabled={isPlanning || !evaCompatibility.compatible}
            title={!evaCompatibility.compatible ? (evaCompatibility.reason ?? undefined) : undefined}
          >
            Plan Comparative Suite (3 Profiles)
          </button>
        </div>
      </div>

      {error && <div className="card status-error" style={{ marginBottom: '0.8rem' }}>{error}</div>}

      {/* Carried Mission Context Summary (Region, Queued Targets, Saved Observations from Digital Twin) */}
      <div
        className="card"
        style={{
          padding: '0.8rem 1rem',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          marginBottom: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Carried Mission Context: </strong>
            Region <strong>{regionCaps.canonicalFeatureName}</strong> ({regionCaps.capabilityBadge})
            {' • '}Queued Targets: <strong>{mission.science.queuedTargets.length}</strong>
            {' • '}Saved Observations: <strong>{mission.science.savedObservations.length}</strong>
            {mission.science.selectedTarget && (
              <>
                {' • '}Active Target: <strong>{mission.science.selectedTarget.targetId}</strong> (
                {mission.science.selectedTarget.epistemicClass})
              </>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.72rem', padding: '0.24rem 0.55rem' }}
            onClick={() => actions.setActivePage('map-explorer')}
          >
            ← Back to Mars Explorer
          </button>
        </div>

        {!evaCompatibility.compatible && (
          <div
            className="notice-warning"
            style={{
              marginTop: '0.55rem',
              fontSize: '0.76rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <span>{evaCompatibility.reason}</span>
            {mission.geographic.regionId !== 'reg-jezero' && (
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '0.72rem', padding: '0.24rem 0.6rem' }}
                onClick={() => actions.setActiveRegion('reg-jezero')}
              >
                Switch Region to Jezero Crater
              </button>
            )}
          </div>
        )}

        {pendingDestOverwrite && (
          <div
            className="notice-warning"
            style={{
              marginTop: '0.55rem',
              fontSize: '0.76rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <span>
              <strong>Destination Overwrite Confirmation: </strong>
              Replace current EVA Destination (
              {pendingDestOverwrite.overwrite.existingCoordinate
                ? formatMarsCoordinate(pendingDestOverwrite.overwrite.existingCoordinate, 4)
                : 'unset'}
              ) with <strong>{pendingDestOverwrite.label}</strong> (
              {formatMarsCoordinate(pendingDestOverwrite.overwrite.proposedCoordinate, 4)})?
            </span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '0.72rem', padding: '0.22rem 0.55rem' }}
                onClick={() => {
                  onUpdateCoordinates(startPoint, pendingDestOverwrite.overwrite.proposedCoordinate)
                  setPendingDestOverwrite(null)
                }}
              >
                Confirm Overwrite
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.72rem', padding: '0.22rem 0.55rem' }}
                onClick={() => setPendingDestOverwrite(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mission.science.queuedTargets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.6rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
              Queued Science Targets ({mission.science.queuedTargets.length}) — add to route as waypoint or destination:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {mission.science.queuedTargets.map((tgt) => {
                const key = tgt.id ?? tgt.name
                const coord = { lat: tgt.lat, lon: tgt.lon }
                const srcRegion = tgt.regionId ?? 'reg-jezero'
                const tgtCompat = isTargetCompatibleWithRegion(
                  { regionId: srcRegion, lat: tgt.lat, lon: tgt.lon },
                  mission.geographic.regionId,
                )
                const isAlreadyWaypoint = mission.eva.waypoints.some(
                  (w) => w.id === tgt.id || (w.lat === tgt.lat && w.lon === tgt.lon),
                )
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      padding: '0.38rem 0.55rem',
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.72rem',
                    }}
                  >
                    <div>
                      <strong>{key}</strong> ({tgt.name}) • [{srcRegion}] • {formatMarsCoordinate(coord, 4)}
                      {typeof tgt.elevationM === 'number' ? ` • ${tgt.elevationM.toFixed(1)} m` : ''}
                      {tgt.primaryTheme ? ` • ${tgt.primaryTheme}` : ''}
                      {typeof tgt.compositeScore === 'number'
                        ? ` • Score ${(tgt.compositeScore * 100).toFixed(0)}%`
                        : ''}
                      {tgt.epistemicClass ? ` • ${tgt.epistemicClass}` : ''}
                      {tgt.sourceDataset ? ` • ${tgt.sourceDataset}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={!tgtCompat.compatible || isAlreadyWaypoint}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.45rem',
                          opacity: tgtCompat.compatible && !isAlreadyWaypoint ? 1 : 0.55,
                          cursor: tgtCompat.compatible && !isAlreadyWaypoint ? 'pointer' : 'not-allowed',
                        }}
                        onClick={() => addQueuedTargetAsWaypoint(tgt)}
                        title={
                          isAlreadyWaypoint
                            ? 'Target already added to active sortie waypoints'
                            : 'Include this science target in multi-stop traversal route'
                        }
                      >
                        {isAlreadyWaypoint ? '✓ In Route' : '+ Add Waypoint'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!tgtCompat.compatible}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.45rem',
                          opacity: tgtCompat.compatible ? 1 : 0.55,
                          cursor: tgtCompat.compatible ? 'pointer' : 'not-allowed',
                        }}
                        onClick={() => requestApplyDestination(`${key}: ${tgt.name}`, coord, srcRegion)}
                        title={
                          tgtCompat.compatible
                            ? `Set ${tgt.name} (${formatMarsCoordinate(coord, 4)}) as Sortie Destination`
                            : (tgtCompat.reason ?? undefined)
                        }
                      >
                        {tgtCompat.compatible ? 'Set Dest →' : 'Incompatible'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Active Sortie Waypoints & Sequence Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 700 }}>
              Active Sortie Waypoints Sequence ({mission.eva.waypoints.length}):
            </div>
            {mission.eva.waypoints.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}
                onClick={() => actions.setQueuedWaypoints([])}
              >
                Clear All Waypoints
              </button>
            )}
          </div>

          {mission.eva.waypoints.length === 0 ? (
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                padding: '0.4rem 0.6rem',
                background: 'var(--bg-panel-elevated)',
                border: '1px dashed var(--border-subtle)',
              }}
            >
              Direct point-to-point route ([Base Camp] → [Destination]). Add queued science targets above to plan multi-stop exploration sorties.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {mission.eva.waypoints.map((wp, idx) => {
                const key = wp.id ?? wp.name
                const coord = { lat: wp.lat, lon: wp.lon }
                const srcRegion = wp.regionId ?? 'reg-jezero'
                return (
                  <div
                    key={`${key}-${idx}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                      padding: '0.35rem 0.55rem',
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border-default)',
                      fontSize: '0.72rem',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          background: 'var(--accent-primary)',
                          color: 'var(--text-inverse)',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '2px',
                          fontWeight: 700,
                          marginRight: '0.4rem',
                          fontSize: '0.68rem',
                        }}
                      >
                        Stop #{idx + 1}
                      </span>
                      <strong>{wp.name}</strong> • [{srcRegion}] • {formatMarsCoordinate(coord, 4)}
                      {typeof wp.elevationM === 'number' ? ` • ${wp.elevationM.toFixed(0)} m` : ''}
                      {wp.primaryTheme ? ` • ${wp.primaryTheme}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={idx === 0}
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', opacity: idx === 0 ? 0.4 : 1 }}
                        onClick={() => moveWaypoint(idx, 'up')}
                        title="Move waypoint earlier in sortie order"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={idx === mission.eva.waypoints.length - 1}
                        style={{
                          fontSize: '0.68rem',
                          padding: '0.15rem 0.4rem',
                          opacity: idx === mission.eva.waypoints.length - 1 ? 0.4 : 1,
                        }}
                        onClick={() => moveWaypoint(idx, 'down')}
                        title="Move waypoint later in sortie order"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem', color: 'var(--status-critical)' }}
                        onClick={() => removeWaypoint(idx)}
                        title="Remove waypoint from route"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Persisted Mission Route Decision Banner */}
      {mission.eva.selectedRouteDecision && (
        <div
          className="card"
          style={{
            padding: '0.85rem',
            marginBottom: '1rem',
            background: 'var(--bg-panel)',
            border: mission.eva.selectedRouteDecision.isStale
              ? '1px solid var(--status-critical)'
              : '1px solid var(--accent-primary)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <span
                style={{
                  background: mission.eva.selectedRouteDecision.isStale
                    ? 'var(--status-critical)'
                    : 'var(--accent-primary)',
                  color: 'var(--text-inverse)',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '2px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  marginRight: '0.5rem',
                }}
              >
                {mission.eva.selectedRouteDecision.isStale ? 'STALE ROUTE DECISION' : 'COMMITTED MISSION ROUTE'}
              </span>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {mission.eva.selectedRouteDecision.profileName.replace('_', ' ')} (
                {mission.eva.selectedRouteDecision.routeId})
              </strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                Selected: {new Date(mission.eva.selectedRouteDecision.selectedAt).toLocaleTimeString()}
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
              onClick={() => actions.clearSelectedRoute()}
            >
              Clear Selection
            </button>
          </div>

          {mission.eva.selectedRouteDecision.isStale && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.4rem 0.6rem',
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--status-critical)',
                fontSize: '0.75rem',
                borderRadius: '2px',
              }}
            >
              <strong>Notice: </strong>
              {mission.eva.selectedRouteDecision.staleReason ?? 'Mission parameters changed.'}{' '}
              Recalculate trade-offs or re-select a route in the comparison panel.
            </div>
          )}

          <div style={{ display: 'flex', gap: '1.2rem', marginTop: '0.6rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Distance: </span>
              <strong>{(mission.eva.selectedRouteDecision.metricsSummary.totalDistanceM / 1000).toFixed(2)} km</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Walking Duration: </span>
              <strong>{mission.eva.selectedRouteDecision.metricsSummary.estimatedDurationMin.toFixed(0)} min</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Mean Hazard: </span>
              <strong>{mission.eva.selectedRouteDecision.metricsSummary.meanHazardPct.toFixed(1)}%</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Science Yield: </span>
              <strong style={{ color: 'var(--accent-secondary)' }}>
                {mission.eva.selectedRouteDecision.metricsSummary.meanScienceScore.toFixed(3)}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Preference Rank: </span>
              <strong>Rank #{mission.eva.selectedRouteDecision.metricsSummary.rankUnderPreferences}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Visited Targets: </span>
              <strong>{mission.eva.selectedRouteDecision.scientificTargetsCount}</strong>
              {mission.eva.selectedRouteDecision.visitedTargetIds.length > 0 && (
                <span> ({mission.eva.selectedRouteDecision.visitedTargetIds.join(', ')})</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coordinate & Profile Controls */}
      <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)', marginBottom: '1rem' }}>
        <h4 style={{ margin: '0 0 0.6rem 0', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          Mission Coordinates & Profile Selection
        </h4>

        <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="route-coord-input">
            <strong>Base Camp: </strong>
            <span>Lat:</span>
            <input
              type="number"
              step="0.0001"
              value={startPoint.lat}
              onChange={(e) =>
                onUpdateCoordinates(
                  { ...startPoint, lat: parseFloat(e.target.value) || 0 },
                  destPoint,
                )
              }
            />
            <span>Lon:</span>
            <input
              type="number"
              step="0.0001"
              value={startPoint.lon}
              onChange={(e) =>
                onUpdateCoordinates(
                  { ...startPoint, lon: parseFloat(e.target.value) || 0 },
                  destPoint,
                )
              }
            />
          </div>

          <div className="route-coord-input">
            <strong>Sortie Destination: </strong>
            <span>Lat:</span>
            <input
              type="number"
              step="0.0001"
              value={destPoint.lat}
              onChange={(e) =>
                onUpdateCoordinates(startPoint, {
                  ...destPoint,
                  lat: parseFloat(e.target.value) || 0,
                })
              }
            />
            <span>Lon:</span>
            <input
              type="number"
              step="0.0001"
              value={destPoint.lon}
              onChange={(e) =>
                onUpdateCoordinates(startPoint, {
                  ...destPoint,
                  lon: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>

          {/* Profile Select Buttons */}
          <div className="profile-button-group">
            {['SAFETY_FIRST', 'SCIENCE_FIRST', 'BALANCED', 'CUSTOM'].map((prof) => (
              <button
                key={prof}
                type="button"
                className={`profile-pill-btn ${activeProfile === prof ? 'active' : ''}`}
                onClick={() => onSelectProfile(prof)}
              >
                {prof.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mode-btn"
            onClick={() => setShowWeights(!showWeights)}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          >
            {showWeights ? 'Hide Weight Sliders ▲' : 'Tune Cost Weights ▼'}
          </button>
        </div>

        {/* Custom Costmap Weight Sliders */}
        {showWeights && (
          <div
            style={{
              marginTop: '0.8rem',
              padding: '0.8rem',
              background: 'var(--bg-panel-elevated)',
              borderRadius: '4px',
              border: '1px dashed var(--border-default)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.8rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Terrain Difficulty:</span>
                <strong>{weights.w_terrain.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={weights.w_terrain}
                onChange={(e) => onWeightChange('w_terrain', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Environmental Hazard:</span>
                <strong>{weights.w_hazard.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={weights.w_hazard}
                onChange={(e) => onWeightChange('w_hazard', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Topographic Uncertainty:</span>
                <strong>{weights.w_uncertainty.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.05"
                value={weights.w_uncertainty}
                onChange={(e) => onWeightChange('w_uncertainty', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Science Opportunity Yield:</span>
                <strong>{weights.w_science.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.05"
                value={weights.w_science}
                onChange={(e) => onWeightChange('w_science', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--text-primary)' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Calculated Route Telemetry Display */}
      {activeRoute ? (
        <div className="card" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.6rem' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.15rem' }}>
                Plan Generated: {activeRoute.properties.route_id}
              </h3>
              <small style={{ color: 'var(--text-secondary)' }}>
                Algorithm: {activeRoute.properties.algorithm.toUpperCase()} • Simplified: {activeRoute.properties.is_simplified ? 'Yes' : 'No'}
              </small>
            </div>
            <span className="badge badge-passable">ZERO RESTRICTED CELLS CROSSED</span>
          </div>

          <div className="hazard-breakdown-grid" style={{ marginTop: '0.8rem' }}>
            <div className="hazard-stat-box">
              <div className="stat-label">Total Traverse Length</div>
              <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                {(activeRoute.properties.metrics.total_distance_m / 1000).toFixed(2)} km
              </div>
              <small style={{ color: 'var(--text-muted)' }}>{activeRoute.properties.metrics.total_distance_m.toFixed(0)} meters</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Estimated Walking Time</div>
              <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                {activeRoute.properties.metrics.estimated_duration_minutes.toFixed(0)} min
              </div>
              <small style={{ color: 'var(--text-muted)' }}>v0 = 1.0 m/s terrain-adjusted</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Accumulated Path Cost</div>
              <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                {activeRoute.properties.metrics.accumulated_cost.toFixed(1)}
              </div>
              <small style={{ color: 'var(--text-muted)' }}>Cost-weighted integral</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Mean Risk Exposure</div>
              <div className="stat-value" style={{ color: 'var(--text-secondary)' }}>
                {(activeRoute.properties.metrics.mean_hazard_exposure * 100).toFixed(1)}%
              </div>
              <small style={{ color: 'var(--text-muted)' }}>0 to 1 normalized risk</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Nominal Precision Tier</div>
              <div className="stat-value" style={{ color: 'var(--text-secondary)' }}>
                {activeRoute.properties.metrics.mean_uncertainty_exposure !== undefined &&
                  activeRoute.properties.metrics.mean_uncertainty_exposure !== null
                  ? `${activeRoute.properties.metrics.mean_uncertainty_exposure.toFixed(2)} m`
                  : 'N/A'}
              </div>
              <small style={{ color: 'var(--text-muted)' }}>
                {activeRoute.properties.metrics.max_uncertainty_m !== undefined &&
                  activeRoute.properties.metrics.max_uncertainty_m !== null &&
                  activeRoute.properties.metrics.p95_uncertainty_m !== undefined &&
                  activeRoute.properties.metrics.p95_uncertainty_m !== null
                  ? `Unverified tier | max ${activeRoute.properties.metrics.max_uncertainty_m.toFixed(2)}m, p95 ${activeRoute.properties.metrics.p95_uncertainty_m.toFixed(2)}m`
                  : 'Provisional relative tier (not ±1σ)'}
              </small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Science Return Yield</div>
              <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                {activeRoute.properties.metrics.accumulated_science_opportunity.toFixed(1)}
              </div>
              <small style={{ color: 'var(--text-muted)' }}>Total outcrop score</small>
            </div>

            <div className="hazard-stat-box">
              <div className="stat-label">Visited Science Targets</div>
              <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                {activeRoute.properties.metrics.scientific_targets_count ?? 0}
              </div>
              <small style={{ color: 'var(--text-muted)' }}>
                {activeRoute.properties.metrics.visited_target_ids &&
                activeRoute.properties.metrics.visited_target_ids.length > 0
                  ? activeRoute.properties.metrics.visited_target_ids.join(', ')
                  : 'No candidate targets within 100m'}
              </small>
            </div>
          </div>

          {/* M0.3.2 Dedicated Route Reliability & Terrain Characterization Panel */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem', marginTop: '0.8rem' }}>
            <div className="hazard-stat-box" style={{ background: 'var(--bg-canvas)' }}>
              <div className="stat-label">Data Reliability Index</div>
              <div className="stat-value" style={{ color: '#22d3ee' }}>
                {activeRoute.properties.metrics.mean_data_confidence !== undefined &&
                  activeRoute.properties.metrics.mean_data_confidence !== null
                  ? activeRoute.properties.metrics.mean_data_confidence.toFixed(3)
                  : 'N/A'}
              </div>
              <small style={{ color: 'var(--text-muted)' }}>Arc-length mean [0–1 uncalibrated ordinal index]</small>
            </div>

            <div className="hazard-stat-box" style={{ background: 'var(--bg-canvas)' }}>
              <div className="stat-label">Evidence Reliability Index</div>
              <div className="stat-value" style={{ color: '#38bdf8' }}>
                {activeRoute.properties.metrics.mean_detection_confidence !== undefined &&
                  activeRoute.properties.metrics.mean_detection_confidence !== null
                  ? activeRoute.properties.metrics.mean_detection_confidence.toFixed(3)
                  : 'N/A'}
              </div>
              <small style={{ color: 'var(--text-muted)' }}>DTM + 20m CTX CV + resolution [0–1 index]</small>
            </div>

            <div className="hazard-stat-box" style={{ background: 'var(--bg-canvas)' }}>
              <div className="stat-label">Terrain Characterization</div>
              <div className="stat-value" style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {activeRoute.properties.metrics.terrain_characterization?.replace(/_/g, ' ') ?? 'UNKNOWN'}
              </div>
              <small style={{ color: 'var(--text-muted)' }}>
                CTX-Only: {(activeRoute.properties.metrics.resolution_uncertainty_distance_m ?? 0).toFixed(0)}m ({((activeRoute.properties.metrics.resolution_uncertainty_fraction ?? 0) * 100).toFixed(1)}%) | Hazard: {activeRoute.properties.metrics.hazard_classification ?? 'UNKNOWN'}
              </small>
            </div>
          </div>

          {activeRoute.properties.metrics.uncertainty_explanation && (
            <div className="hazard-explanation-box" style={{ marginTop: '0.6rem', borderLeftColor: '#38bdf8' }}>
              <strong>Trajectory Reliability Assessment: </strong>
              {activeRoute.properties.metrics.uncertainty_explanation}
            </div>
          )}

          <div className="notice-warning" style={{ marginTop: '0.8rem' }}>
            {activeRoute.properties.disclaimer}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>No traversal route currently active. Click &quot;Plan Route&quot; above to compute optimal waypoints.</p>
        </div>
      )}
    </div>
  )
}
