import React, { useState, useEffect } from 'react'
import type { LatLon, RouteFeature } from '../api/routing'
import type {
  MissionPlanSummaryDTO,
  MissionPlanningAssumptionsDTO,
} from '../api/mission'
import { fetchDefaultAssumptions, planEVAMission } from '../api/mission'

interface Props {
  startPoint: LatLon
  destPoint: LatLon
  onRoutesCalculated: (routes: RouteFeature[]) => void
}

export const EVAMissionPlannerPanel: React.FC<Props> = ({
  startPoint,
  destPoint,
  onRoutesCalculated,
}) => {
  const [profile, setProfile] = useState<string>('BALANCED')
  const [scienceStops, setScienceStops] = useState<number>(2)
  const [isRoundTrip, setIsRoundTrip] = useState<boolean>(true)
  const [missionPlan, setMissionPlan] = useState<MissionPlanSummaryDTO | null>(null)
  const [assumptions, setAssumptions] = useState<MissionPlanningAssumptionsDTO | null>(null)
  const [showAssumptions, setShowAssumptions] = useState<boolean>(false)
  const [isPlanning, setIsPlanning] = useState<boolean>(false)
  const [planError, setPlanError] = useState<string | null>(null)

  useEffect(() => {
    fetchDefaultAssumptions()
      .then((data) => setAssumptions(data))
      .catch((err: unknown) => console.error('Failed to load mission assumptions:', err))
  }, [])

  const handleSimulateMission = () => {
    setIsPlanning(true)
    setPlanError(null)

    planEVAMission(
      startPoint,
      destPoint,
      profile,
      scienceStops,
      isRoundTrip,
      undefined,
      undefined,
      undefined,
      'astar',
      true,
    )
      .then((res) => {
        setMissionPlan(res.mission)
        onRoutesCalculated([res.route_feature])
        setIsPlanning(false)
      })
      .catch((err: unknown) => {
        setPlanError(err instanceof Error ? err.message : String(err))
        setIsPlanning(false)
      })
  }

  const getSeverityBadgeStyle = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return { background: '#b71c1c', color: '#ffcdd2' }
      case 'WARNING':
        return { background: '#e65100', color: '#ffe0b2' }
      case 'CAUTION':
        return { background: '#f57f17', color: '#fff9c4' }
      default:
        return { background: '#006064', color: '#e0f7fa' }
    }
  }

  return (
    <div className="card" style={{ marginTop: '1.2rem', borderColor: '#37474f' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: '#e0e0e0' }}>EVA Mission Planning Engine</h3>
          <small style={{ color: '#90a4ae' }}>
            Operational timeline, physiological expenditure, and consumables simulation for human traverses
          </small>
        </div>

        <button
          type="button"
          className="mode-btn active"
          onClick={handleSimulateMission}
          disabled={isPlanning}
          style={{ background: '#bf360c', borderColor: '#ff7043' }}
        >
          {isPlanning ? 'Simulating EVA Operations…' : 'Simulate Human EVA'}
        </button>
      </div>

      {/* Mission Simulation Controls */}
      <div
        style={{
          marginTop: '0.8rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          background: '#1a2228',
          padding: '0.75rem',
          borderRadius: '4px',
          border: '1px solid #2e3b43',
        }}
      >
        <div>
          <label htmlFor="mission-profile-select" style={{ fontSize: '0.8rem', color: '#b0bec5', display: 'block', marginBottom: '0.2rem' }}>
            Traverse Route Profile:
          </label>
          <select
            id="mission-profile-select"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            style={{
              background: '#232d34',
              color: '#eceff1',
              border: '1px solid #37474f',
              padding: '0.35rem 0.5rem',
              borderRadius: '3px',
              width: '100%',
              fontSize: '0.85rem',
            }}
          >
            <option value="BALANCED">Balanced Compromise</option>
            <option value="SAFETY_FIRST">Safety-First (Lowest Risk)</option>
            <option value="SCIENCE_FIRST">Science-First (Max Outcrops)</option>
          </select>
        </div>

        <div>
          <label htmlFor="science-stops-input" style={{ fontSize: '0.8rem', color: '#ffd700', display: 'block', marginBottom: '0.2rem' }}>
            Planned Science Stops (15 min each):
          </label>
          <input
            id="science-stops-input"
            type="number"
            min="0"
            max="10"
            value={scienceStops}
            onChange={(e) => setScienceStops(Math.max(0, parseInt(e.target.value) || 0))}
            style={{
              background: '#232d34',
              color: '#eceff1',
              border: '1px solid #37474f',
              padding: '0.35rem 0.5rem',
              borderRadius: '3px',
              width: '100%',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.2rem' }}>
          <input
            type="checkbox"
            id="roundtrip-check"
            checked={isRoundTrip}
            onChange={(e) => setIsRoundTrip(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: '#ff7043' }}
          />
          <label htmlFor="roundtrip-check" style={{ fontSize: '0.85rem', color: '#eceff1', cursor: 'pointer' }}>
            Round-Trip (Return to Base)
          </label>
        </div>
      </div>

      {planError && (
        <div className="card status-error" style={{ marginTop: '0.8rem', padding: '0.6rem' }}>
          {planError}
        </div>
      )}

      {/* Evaluated Mission Plan Results */}
      {missionPlan && (
        <div style={{ marginTop: '1rem' }}>
          {/* Status & Feasibility Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              background: missionPlan.is_feasible ? '#1b5e20' : '#b71c1c',
              padding: '0.6rem 0.9rem',
              borderRadius: '4px',
              color: '#ffffff',
            }}
          >
            <div>
              <strong style={{ fontSize: '1rem', letterSpacing: '0.5px' }}>
                {missionPlan.is_feasible ? 'FEASIBLE EVA MISSION' : 'FEASIBILITY VIOLATION DETECTED'}
              </strong>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                Profile: {missionPlan.selected_route_profile} | Round-Trip Ground Distance:{' '}
                {missionPlan.round_trip_distance_km.toFixed(2)} km (One-Way:{' '}
                {missionPlan.one_way_distance_km.toFixed(2)} km)
              </div>
            </div>

            <span
              style={{
                fontSize: '0.75rem',
                background: 'rgba(0,0,0,0.3)',
                padding: '0.2rem 0.6rem',
                borderRadius: '3px',
                fontWeight: 600,
              }}
            >
              SIMULATION (NOT OPERATIONAL NASA RULES)
            </span>
          </div>

          {/* Operational Timeline Breakdown */}
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#80cbc4', fontSize: '0.95rem' }}>
              Operational Timeline Breakdown (Traversal vs Total EVA Duration)
            </h4>
            <div className="hazard-breakdown-grid">
              <div className="hazard-stat-box">
                <div className="stat-label">Outbound Travel</div>
                <div className="stat-value" style={{ color: '#90caf9' }}>
                  {missionPlan.timeline.outbound_traversal_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Return Travel</div>
                <div className="stat-value" style={{ color: '#90caf9' }}>
                  {missionPlan.timeline.return_traversal_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Total Traversal</div>
                <div className="stat-value" style={{ color: '#64b5f6' }}>
                  {missionPlan.timeline.total_walking_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Science Stops ({missionPlan.timeline.science_stops_count})</div>
                <div className="stat-value" style={{ color: '#ffd700' }}>
                  {missionPlan.timeline.planned_science_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Rest Pauses ({missionPlan.timeline.rest_stops_count})</div>
                <div className="stat-value" style={{ color: '#81c784' }}>
                  {missionPlan.timeline.rest_pauses_minutes.toFixed(0)} min
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Contingency Reserve</div>
                <div className="stat-value" style={{ color: '#ffb74d' }}>
                  {missionPlan.timeline.contingency_reserve_minutes.toFixed(0)} min
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '0.6rem',
                background: '#152026',
                borderLeft: '4px solid #00bcd4',
                padding: '0.6rem 0.8rem',
                borderRadius: '3px',
                fontSize: '0.9rem',
                color: '#e0f7fa',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span>
                <strong>Total Estimated EVA Duration: </strong>
                {missionPlan.timeline.total_eva_duration_hours.toFixed(2)} hours (
                {missionPlan.timeline.total_eva_duration_minutes.toFixed(0)} minutes)
              </span>
              <span style={{ fontSize: '0.8rem', color: '#b2dfdb' }}>
                Flight Limit: 8.0 hours | Margin:{' '}
                {(8.0 - missionPlan.timeline.total_eva_duration_hours).toFixed(2)} hrs
              </span>
            </div>
          </div>

          {/* Consumables Budget & Resource Gauges */}
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#80cbc4', fontSize: '0.95rem' }}>
              Resource Consumables & Physiological Expenditure Proxies
            </h4>
            <div className="hazard-breakdown-grid">
              <div className="hazard-stat-box">
                <div className="stat-label">Oxygen Margin</div>
                <div
                  className="stat-value"
                  style={{
                    color: missionPlan.consumables.o2_margin_pct < 20 ? '#ff8a80' : '#81c784',
                  }}
                >
                  {missionPlan.consumables.o2_margin_pct.toFixed(1)}%
                </div>
                <small style={{ color: '#90a4ae', fontSize: '0.75rem' }}>
                  Used: {missionPlan.consumables.o2_consumed_per_crew_g.toFixed(0)}g /{' '}
                  {missionPlan.consumables.o2_capacity_per_suit_g.toFixed(0)}g
                </small>
              </div>

              <div className="hazard-stat-box">
                <div className="stat-label">Battery Margin</div>
                <div
                  className="stat-value"
                  style={{
                    color: missionPlan.consumables.battery_margin_pct < 20 ? '#ff8a80' : '#81c784',
                  }}
                >
                  {missionPlan.consumables.battery_margin_pct.toFixed(1)}%
                </div>
                <small style={{ color: '#90a4ae', fontSize: '0.75rem' }}>
                  Used: {missionPlan.consumables.battery_energy_consumed_wh.toFixed(0)}Wh /{' '}
                  {missionPlan.consumables.battery_capacity_wh.toFixed(0)}Wh
                </small>
              </div>

              <div className="hazard-stat-box">
                <div className="stat-label">Metabolic Expenditure</div>
                <div className="stat-value" style={{ color: '#ffb74d' }}>
                  {missionPlan.consumables.metabolic_energy_expended_kcal.toFixed(0)} kcal
                </div>
                <small style={{ color: '#90a4ae', fontSize: '0.75rem' }}>
                  Avg Work: {missionPlan.consumables.average_metabolic_power_w.toFixed(0)} Watts
                </small>
              </div>

              <div className="hazard-stat-box">
                <div className="stat-label">Total Crew O2 Draw (2 Crew)</div>
                <div className="stat-value" style={{ color: '#4dd0e1' }}>
                  {missionPlan.consumables.total_o2_consumed_all_crew_g.toFixed(0)} g
                </div>
                <small style={{ color: '#90a4ae', fontSize: '0.75rem' }}>Buddy System Protocol</small>
              </div>
            </div>
          </div>

          {/* Operational Feasibility Warnings */}
          {missionPlan.warnings.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#ffb74d', fontSize: '0.95rem' }}>
                Operational Feasibility & Flight Rules Alerts ({missionPlan.warnings.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {missionPlan.warnings.map((w, idx) => {
                  const badge = getSeverityBadgeStyle(w.severity)
                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#1a1e22',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '4px',
                        borderLeft: `3px solid ${badge.background}`,
                        fontSize: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span
                          style={{
                            background: badge.background,
                            color: badge.color,
                            padding: '0.1rem 0.4rem',
                            borderRadius: '2px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          {w.severity}
                        </span>
                        <strong style={{ color: '#eceff1' }}>{w.code}: </strong>
                        <span style={{ color: '#cfd8dc' }}>{w.message}</span>
                      </div>
                      <div style={{ color: '#90a4ae', fontSize: '0.8rem', paddingLeft: '0.2rem' }}>
                        <em>Remediation: </em>
                        {w.remediation}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Collapsible Assumptions Drawer */}
          <div style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="mode-btn"
              onClick={() => setShowAssumptions(!showAssumptions)}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
            >
              {showAssumptions ? 'Hide Model Assumptions ▲' : 'Inspect Configurable Model Assumptions ▼'}
            </button>

            {showAssumptions && assumptions && (
              <div
                style={{
                  marginTop: '0.6rem',
                  background: '#141a1f',
                  padding: '0.8rem',
                  borderRadius: '4px',
                  border: '1px solid #28343c',
                  fontSize: '0.8rem',
                  color: '#b0bec5',
                }}
              >
                <div style={{ color: '#80cbc4', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Configurable Physiological & Life-Support Equipment Assumptions:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
                  <div>
                    <strong>Crew Physiological:</strong>
                    <div>Crew Count: {assumptions.crew.nominal_crew_count} astronauts</div>
                    <div>Body Mass: {assumptions.crew.body_mass_kg} kg | Suit Mass: {assumptions.crew.suit_mass_kg} kg</div>
                    <div>Basal Power: 120 W | Level Walking Power: {assumptions.crew.nominal_walking_power_w} W</div>
                  </div>

                  <div>
                    <strong>Equipment & Suit:</strong>
                    <div>Suit: {assumptions.equipment.suit_designation ?? 'Prototype'}</div>
                    <div>Usable O2: {assumptions.equipment.total_usable_o2_capacity_g} g per suit</div>
                    <div>Battery Energy: {assumptions.equipment.total_battery_capacity_wh} Wh</div>
                    <div>Life Support Power: {assumptions.equipment.base_life_support_power_w ?? 85} W</div>
                  </div>

                  <div>
                    <strong>Operational Rules:</strong>
                    <div>Walking Speed: {assumptions.timeline.nominal_walking_speed_mps} m/s</div>
                    <div>Science Stop: {assumptions.timeline.science_stop_duration_minutes} min/stop</div>
                    <div>Rest Pause: 10 min every {assumptions.timeline.rest_stop_interval_minutes} min walking</div>
                    <div>Contingency Reserve: {(assumptions.timeline.contingency_reserve_time_fraction * 100).toFixed(0)}%</div>
                  </div>
                </div>

                <div style={{ marginTop: '0.6rem', borderTop: '1px solid #232d34', paddingTop: '0.4rem', color: '#ffb74d' }}>
                  <em>Epistemic Status: </em>
                  HEURISTIC illustrative placeholders. Scenarios are SIMULATED. Never claim operational astronaut safety certification.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

