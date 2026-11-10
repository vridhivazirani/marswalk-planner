import React from 'react'
import { EmergencyResponsePanel } from '../components/EmergencyResponsePanel'
import type { DynamicReroutePlanDTO } from '../api/emergency'

interface EmergencyOperationsPageProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  activeProfile: string
  onPlanUpdated: (plan: DynamicReroutePlanDTO | null) => void
}

export const EmergencyOperationsPage: React.FC<EmergencyOperationsPageProps> = ({
  startPoint,
  destPoint,
  activeProfile,
  onPlanUpdated,
}) => {
  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f28c52', fontSize: '1.3rem' }}>
            Emergency Response & Dynamic Rerouting Operations
          </h2>
          <small style={{ color: '#a89f97' }}>
            In-Situ Contingency Injection, Route Severance Detection & Return-to-Base Replanning
          </small>
        </div>
        <span className="badge badge-alert">CONTINGENCY PROTOCOLS ACTIVE</span>
      </div>

      <EmergencyResponsePanel
        startPoint={startPoint}
        destPoint={destPoint}
        activeProfile={activeProfile}
        onPlanUpdated={onPlanUpdated}
      />
    </div>
  )
}

