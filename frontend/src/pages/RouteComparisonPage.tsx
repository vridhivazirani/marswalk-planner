import React from 'react'
import { MultiObjectiveComparisonPanel } from '../components/MultiObjectiveComparisonPanel'
import type { RouteFeature } from '../api/routing'

interface RouteComparisonPageProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  onUpdateCoordinates: (start: { lat: number; lon: number }, dest: { lat: number; lon: number }) => void
  onRoutesCalculated: (routes: RouteFeature[]) => void
}

export const RouteComparisonPage: React.FC<RouteComparisonPageProps> = ({
  startPoint,
  destPoint,
  onUpdateCoordinates,
  onRoutesCalculated,
}) => {
  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f28c52', fontSize: '1.3rem' }}>
            Multi-Objective Route Comparison & Trade-Off Analysis
          </h2>
          <small style={{ color: '#a89f97' }}>
            Comparative Evaluation of Safety-First, Science-First, and Balanced Traversal Options
          </small>
        </div>
        <span className="badge badge-derived">PARETO MULTI-OBJECTIVE</span>
      </div>

      <MultiObjectiveComparisonPanel
        startPoint={startPoint}
        destPoint={destPoint}
        onUpdateCoordinates={onUpdateCoordinates}
        onRoutesCalculated={onRoutesCalculated}
      />
    </div>
  )
}

