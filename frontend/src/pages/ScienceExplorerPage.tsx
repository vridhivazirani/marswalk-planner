import React, { useState, useEffect } from 'react'
import type { CandidateTargetFeature } from '../api/science'
import { fetchScienceTargets } from '../api/science'

interface ScienceExplorerPageProps {
  onSelectTargetForRouting: (target: CandidateTargetFeature) => void
}

export const ScienceExplorerPage: React.FC<ScienceExplorerPageProps> = ({
  onSelectTargetForRouting,
}) => {
  const [targets, setTargets] = useState<CandidateTargetFeature[]>([])
  const [selectedTarget, setSelectedTarget] = useState<CandidateTargetFeature | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchScienceTargets()
      .then((data) => {
        setTargets(data.features)
        if (data.features.length > 0) {
          setSelectedTarget(data.features[0])
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [])

  return (
    <div className="page-container">
      {/* Header */}
      <div className="twin-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f28c52', fontSize: '1.3rem' }}>
            Scientific Opportunity Engine
          </h2>
          <small style={{ color: '#a89f97' }}>
            Ranked Candidate Science Targets • CRISM Spectral Mineralogy & Stratigraphic Outcrops
          </small>
        </div>
        <span className="badge badge-science">6 RANKED CANDIDATES</span>
      </div>

      {loading && <div className="card">Loading scientific opportunity candidates from backend…</div>}
      {error && <div className="card status-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(380px, 1.4fr)', gap: '1rem' }}>
        {/* Targets List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {targets.map((tgt) => {
            const isSelected = selectedTarget?.properties.target_id === tgt.properties.target_id
            return (
              <div
                key={tgt.properties.target_id}
                className="card"
                onClick={() => setSelectedTarget(tgt)}
                style={{
                  cursor: 'pointer',
                  padding: '0.8rem',
                  borderLeft: '4px solid #ffd700',
                  background: isSelected ? '#222014' : '#161a1e',
                  borderColor: isSelected ? '#ffd700' : '#28343e',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffd700' }}>
                    #{tgt.properties.rank}: {tgt.properties.name}
                  </span>
                  <span className="badge-target-rank">
                    SCORE: {(tgt.properties.composite_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#ce93d8', marginTop: '0.2rem' }}>
                  Theme: {tgt.properties.primary_science_theme}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#90a4ae', marginTop: '0.2rem' }}>
                  Location: {tgt.geometry.coordinates[1].toFixed(5)}°N, {tgt.geometry.coordinates[0].toFixed(5)}°E
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Target Deep Dossier */}
        {selectedTarget && (
          <div className="card" style={{ padding: '1rem', background: '#171c22', border: '1px solid #ffd700' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #28343e', paddingBottom: '0.6rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#ffd700', fontSize: '1.2rem' }}>
                  #{selectedTarget.properties.rank}: {selectedTarget.properties.name}
                </h3>
                <small style={{ color: '#ce93d8' }}>
                  Theme: {selectedTarget.properties.primary_science_theme} | Epistemic: {selectedTarget.properties.epistemic_class}
                </small>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onSelectTargetForRouting(selectedTarget)}
                style={{ background: '#ffd700', color: '#120e0c', fontWeight: 700, padding: '0.4rem 0.8rem' }}
              >
                🧭 Route to Target
              </button>
            </div>

            {/* Score Breakdown Grid */}
            <div className="hazard-breakdown-grid" style={{ marginTop: '0.8rem' }}>
              <div className="hazard-stat-box">
                <div className="stat-label">Mineralogy</div>
                <div className="stat-value" style={{ color: '#ffd700' }}>
                  {(selectedTarget.properties.breakdown.mineralogy * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Diversity</div>
                <div className="hazard-value" style={{ color: '#81c784' }}>
                  {(selectedTarget.properties.breakdown.diversity * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Layered Strata</div>
                <div className="hazard-value" style={{ color: '#64b5f6' }}>
                  {(selectedTarget.properties.breakdown.layered_features * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Delta Context</div>
                <div className="hazard-value" style={{ color: '#ffb74d' }}>
                  {(selectedTarget.properties.breakdown.delta_context * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Rover Proximity</div>
                <div className="hazard-value" style={{ color: '#ff8a80' }}>
                  {(selectedTarget.properties.breakdown.rover_proximity * 100).toFixed(0)}%
                </div>
              </div>
              <div className="hazard-stat-box">
                <div className="stat-label">Confidence</div>
                <div className="hazard-value" style={{ color: '#ba68c8' }}>
                  {(selectedTarget.properties.breakdown.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Scientific Rationale */}
            <div className="hazard-explanation-box" style={{ borderLeftColor: '#ffd700', marginTop: '0.8rem' }}>
              <strong>Scientific Rationale: </strong>
              {selectedTarget.properties.rationale}
            </div>

            {/* Strict Epistemic Warnings */}
            <div className="notice-warning" style={{ marginTop: '0.6rem' }}>
              <strong>Notice: </strong>
              {selectedTarget.properties.life_inference_warning}
            </div>

            <div className="notice-warning" style={{ borderLeftColor: '#f44336', marginTop: '0.4rem' }}>
              <strong>Safety Caveat: </strong>
              {selectedTarget.properties.safety_caveat}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

