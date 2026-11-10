import React, { useState } from 'react'
import type { RouteFeature } from '../api/routing'
import type { DynamicReroutePlanDTO } from '../api/emergency'
import type { CandidateTargetFeature } from '../api/science'
import { generateMarkdownReport } from '../api/reports'

interface MissionReportsPageProps {
  startPoint: { lat: number; lon: number }
  destPoint: { lat: number; lon: number }
  activeProfile: string
  activeRoute: RouteFeature | null
  emergencyPlan: DynamicReroutePlanDTO | null
  selectedTarget: CandidateTargetFeature | null
}

export const MissionReportsPage: React.FC<MissionReportsPageProps> = ({
  startPoint,
  destPoint,
  activeProfile,
  activeRoute,
  emergencyPlan,
  selectedTarget,
}) => {
  const [missionTitle, setMissionTitle] = useState<string>('Jezero Western Delta Reconnaissance Sortie 1')
  const [crewCount, setCrewCount] = useState<number>(2)
  const [reportId] = useState<string>(() => `MARSWALK-REP-${Date.now().toString().slice(-6)}`)
  const [generatedAt] = useState<string>(() => new Date().toISOString())

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

  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f28c52', fontSize: '1.3rem' }}>
            Mission Briefing & Telemetry Reports
          </h2>
          <small style={{ color: '#a89f97' }}>
            Official Traversal Dossiers, Consumables Audits & Contingency Records
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn-primary" onClick={handleDownloadMarkdown}>
            📥 Export Markdown (.md)
          </button>
          <button type="button" className="btn-secondary" onClick={handleDownloadJSON}>
            💾 Export Telemetry (.json)
          </button>
        </div>
      </div>

      {/* Report Configuration Bar */}
      <div className="card" style={{ padding: '0.8rem 1rem', background: '#161c22', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#cfd8dc' }}>Mission Title:</span>
            <input
              type="text"
              value={missionTitle}
              onChange={(e) => setMissionTitle(e.target.value)}
              style={{
                background: '#232b32',
                color: '#fff',
                border: '1px solid #37474f',
                padding: '0.35rem 0.6rem',
                borderRadius: '3px',
                width: '340px',
                fontSize: '0.85rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#cfd8dc' }}>Crew Allocation:</span>
            <select
              value={crewCount}
              onChange={(e) => setCrewCount(parseInt(e.target.value, 10))}
              style={{
                background: '#232b32',
                color: '#fff',
                border: '1px solid #37474f',
                padding: '0.35rem 0.6rem',
                borderRadius: '3px',
                fontSize: '0.85rem',
              }}
            >
              <option value={1}>1 Astronaut (Solo Exploration)</option>
              <option value={2}>2 Astronauts (Nominal Buddy Pair)</option>
              <option value={3}>3 Astronauts (Field Science Team)</option>
              <option value={4}>4 Astronauts (Full Sortie Crew)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Formatted Report Preview */}
      <div
        className="card"
        style={{
          padding: '1.5rem',
          background: '#12161b',
          border: '1px solid #283440',
          fontFamily: 'monospace',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          color: '#d1d5db',
          fontSize: '0.85rem',
        }}
      >
        {markdownContent}
      </div>
    </div>
  )
}
