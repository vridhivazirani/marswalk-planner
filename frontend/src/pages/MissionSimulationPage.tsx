import React from 'react'
import { EVAMissionPlannerPanel } from '../components/EVAMissionPlannerPanel'
import { EnvironmentalScenarioPanel } from '../components/EnvironmentalScenarioPanel'
import type { RouteFeature } from '../api/routing'

interface MissionSimulationPageProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  onRoutesCalculated: (routes: RouteFeature[]) => void
}

export const MissionSimulationPage: React.FC<MissionSimulationPageProps> = ({
  startPoint,
  destPoint,
  onRoutesCalculated,
}) => {
  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
            EVA Mission Simulation & Environmental Operations
          </h2>
          <small style={{ color: 'var(--text-secondary)' }}>
            Physiological Consumables Modeling, Spacesuit Energy, and Atmospheric Suitability
          </small>
        </div>
        <span className="badge badge-simulated">EPISTEMIC: SIMULATED & HEURISTIC</span>
      </div>

      {/* Operational EVA Timeline & Consumables Planner */}
      <EVAMissionPlannerPanel
        startPoint={startPoint}
        destPoint={destPoint}
        onRoutesCalculated={onRoutesCalculated}
      />

      {/* Environmental Scenario Assessment Module */}
      <EnvironmentalScenarioPanel />
    </div>
  )
}

