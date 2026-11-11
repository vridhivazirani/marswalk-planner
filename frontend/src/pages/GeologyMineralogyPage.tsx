import React, { useState, useEffect } from 'react'
import type { CRISMIndexDTO, CRISMTargetedSceneDTO, GeologicUnitDTO } from '../api/atlas'
import { fetchCRISMIndices, fetchCRISMScenes, fetchGeologyUnits } from '../api/atlas'
import type { DiurnalHourProfileDTO, DustClimatologyPointDTO, ThermalInertiaDTO } from '../api/environmental'
import { fetchDiurnalCycle, fetchDustClimatology, fetchThermalInertia } from '../api/environmental'
import type { CVCandidatesResponse } from '../api/terrain'
import { fetchCVCandidates } from '../api/terrain'

export const GeologyMineralogyPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'CRISM' | 'STRATIGRAPHY' | 'PHYSICS_CV'>('CRISM')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Data states
  const [crismScenes, setCrismScenes] = useState<CRISMTargetedSceneDTO[]>([])
  const [selectedScene, setSelectedScene] = useState<CRISMTargetedSceneDTO | null>(null)
  const [crismIndices, setCrismIndices] = useState<CRISMIndexDTO[]>([])
  const [selectedIdx, setSelectedIdx] = useState<CRISMIndexDTO | null>(null)
  const [geologyUnits, setGeologyUnits] = useState<GeologicUnitDTO[]>([])
  const [selectedUnit, setSelectedUnit] = useState<GeologicUnitDTO | null>(null)

  // Environmental Physics states
  const [diurnalProfiles, setDiurnalProfiles] = useState<DiurnalHourProfileDTO[]>([])
  const [dustPoints, setDustPoints] = useState<DustClimatologyPointDTO[]>([])
  const [thermalInertia, setThermalInertia] = useState<ThermalInertiaDTO | null>(null)
  const [cvCandidates, setCvCandidates] = useState<CVCandidatesResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetchCRISMScenes().catch(() => ({ scenes: [] })),
      fetchCRISMIndices().catch(() => ({ indices: [] })),
      fetchGeologyUnits().catch(() => ({ units: [] })),
      fetchDiurnalCycle(18.45, 180.0, 320.0, 0.4).catch(() => null),
      fetchDustClimatology().catch(() => null),
      fetchThermalInertia(320.0, 0.22).catch(() => null),
      fetchCVCandidates(15).catch(() => null),
    ])
      .then(([scenesRes, indicesRes, geoRes, diurnalRes, dustRes, tiRes, cvRes]) => {
        if (cancelled) return
        if (scenesRes.scenes && scenesRes.scenes.length > 0) {
          setCrismScenes(scenesRes.scenes)
          setSelectedScene(scenesRes.scenes[0])
        }
        if (indicesRes.indices && indicesRes.indices.length > 0) {
          setCrismIndices(indicesRes.indices)
          setSelectedIdx(indicesRes.indices[0])
        }
        if (geoRes.units && geoRes.units.length > 0) {
          setGeologyUnits(geoRes.units)
          setSelectedUnit(geoRes.units[0])
        }
        if (diurnalRes) setDiurnalProfiles(diurnalRes.profiles)
        if (dustRes) setDustPoints(dustRes.cycle_points)
        if (tiRes) setThermalInertia(tiRes)
        if (cvRes) setCvCandidates(cvRes)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page-container" style={{ padding: '1.25rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid #27272a',
          paddingBottom: '1rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.3rem' }}>💎</span>
            <h1 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 700, letterSpacing: '0.04em' }}>
              GEOLOGY & MINERALOGY SUBSYSTEM
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#a1a1aa' }}>
            Authentic MRO CRISM Targeted Spectral Scenes • USGS SIM-3464 Stratigraphic Units • Thermophysical Cycles
          </p>
        </div>

        {/* Epistemic Badges */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              padding: '0.2rem 0.5rem',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '2px',
            }}
          >
            OBSERVED: CRISM Spectra
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              padding: '0.2rem 0.5rem',
              background: 'rgba(234, 179, 8, 0.15)',
              color: '#eab308',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '2px',
            }}
          >
            INTERPRETED: USGS SIM-3464
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              padding: '0.2rem 0.5rem',
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '2px',
            }}
          >
            HEURISTIC: CV Detectors
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #27272a', marginBottom: '1.25rem' }}>
        {[
          { id: 'CRISM', label: 'CRISM HYPERSPECTRAL SCENES & ABSORPTION INDICES', icon: '📡' },
          { id: 'STRATIGRAPHY', label: 'USGS SIM-3464 STRATIGRAPHIC UNITS & SAMPLES', icon: '⛰️' },
          { id: 'PHYSICS_CV', label: 'THERMOPHYSICAL CYCLES & CV CANDIDATE DETECTORS', icon: '🌡️' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              background: activeTab === tab.id ? '#18181b' : 'transparent',
              color: activeTab === tab.id ? '#ffffff' : '#71717a',
              border: '1px solid',
              borderColor: activeTab === tab.id ? '#3f3f46' : 'transparent',
              borderBottom: activeTab === tab.id ? '2px solid #00e5ff' : 'none',
              padding: '0.5rem 0.9rem',
              fontSize: '0.74rem',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              borderRadius: '3px 3px 0 0',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#71717a', fontFamily: 'var(--font-mono)' }}>
          Retrieving authentic planetary mineralogy and spectroscopic records…
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem', background: '#3f1212', border: '1px solid #7f1d1d', color: '#fca5a5', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {!loading && activeTab === 'CRISM' && (
        <div>
          {/* Targeted Scenes Header Grid */}
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.85rem', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              MRO CRISM Targeted Observations at Jezero Crater (PDS Geosciences Node)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.75rem' }}>
              {crismScenes.map((scene) => {
                const isSelected = selectedScene?.scene_id === scene.scene_id
                return (
                  <div
                    key={scene.scene_id}
                    onClick={() => setSelectedScene(scene)}
                    style={{
                      background: isSelected ? '#1c1917' : '#121212',
                      border: isSelected ? '1px solid #00e5ff' : '1px solid #27272a',
                      padding: '0.8rem',
                      borderRadius: '3px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: isSelected ? '#00e5ff' : '#f4f4f5' }}>
                        {scene.scene_id}
                      </span>
                      <span style={{ fontSize: '0.68rem', background: '#27272a', padding: '0.15rem 0.35rem', borderRadius: '2px', color: '#a1a1aa' }}>
                        {scene.product_type}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#d4d4d8', marginBottom: '0.4rem', lineHeight: '1.3' }}>
                      {scene.target_description}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: 'var(--font-mono)' }}>
                      Center: {scene.center_lat}°N, {scene.center_lon}°E • Ls: {scene.solar_longitude_ls}°
                    </div>
                    <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      {scene.primary_minerals_detected.map((min, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '0.64rem',
                            background: 'rgba(0, 229, 255, 0.08)',
                            color: '#22d3ee',
                            padding: '0.1rem 0.35rem',
                            border: '1px solid rgba(0, 229, 255, 0.2)',
                            borderRadius: '2px',
                          }}
                        >
                          {min}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Two-Column Explorer: Indices List vs Diagnostic Spectrum */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.4fr)', gap: '1.25rem' }}>
            {/* Left: CRISM Spectral Absorption Indices */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '0.85rem', color: '#a1a1aa', textTransform: 'uppercase', margin: '0 0 0.25rem 0' }}>
                Diagnostic CRISM Mineral Absorption Indices ({crismIndices.length})
              </h3>
              {crismIndices.map((idx) => {
                const isSelected = selectedIdx?.index_code === idx.index_code
                return (
                  <div
                    key={idx.index_code}
                    onClick={() => setSelectedIdx(idx)}
                    style={{
                      background: isSelected ? '#18181b' : '#0d0d0d',
                      border: isSelected ? '1px solid #38bdf8' : '1px solid #27272a',
                      padding: '0.75rem',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      borderLeft: isSelected ? '3px solid #38bdf8' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#ffffff' }}>
                        {idx.index_code} — {idx.name}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                        {idx.wavelength_microns} µm
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>
                      Target: <strong style={{ color: '#e4e4e7' }}>{idx.target_mineral}</strong>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '0.25rem' }}>
                      {idx.absorption_feature}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Right: Selected Index Detailed Analysis & Synthetic Reflectance Curve */}
            {selectedIdx && (
              <div
                style={{
                  background: '#0f0f11',
                  border: '1px solid #27272a',
                  padding: '1.25rem',
                  borderRadius: '3px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#38bdf8' }}>
                    {selectedIdx.index_code}: {selectedIdx.name}
                  </h3>
                  <span style={{ fontSize: '0.7rem', background: '#27272a', padding: '0.2rem 0.5rem', borderRadius: '2px', color: '#e4e4e7' }}>
                    Band λ = {selectedIdx.wavelength_microns} µm
                  </span>
                </div>

                <div style={{ marginBottom: '1rem', background: '#18181b', padding: '0.75rem', borderRadius: '2px', fontSize: '0.76rem', lineHeight: '1.4' }}>
                  <div style={{ marginBottom: '0.35rem' }}>
                    <strong style={{ color: '#a1a1aa' }}>Mineral Target:</strong>{' '}
                    <span style={{ color: '#f4f4f5' }}>{selectedIdx.target_mineral}</span>
                  </div>
                  <div style={{ marginBottom: '0.35rem' }}>
                    <strong style={{ color: '#a1a1aa' }}>Absorption Mechanism:</strong>{' '}
                    <span style={{ color: '#d4d4d8' }}>{selectedIdx.absorption_feature}</span>
                  </div>
                  <div>
                    <strong style={{ color: '#a1a1aa' }}>Paleoenvironmental Significance:</strong>{' '}
                    <span style={{ color: '#e4e4e7' }}>{selectedIdx.geological_significance}</span>
                  </div>
                </div>

                {/* SVG Absorption Curve Visualization */}
                <h4 style={{ fontSize: '0.76rem', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  Diagnostic Continuum-Removed Absorption Profile (Near-Infrared λ: 0.8–2.6 µm)
                </h4>
                <div style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.75rem', borderRadius: '2px' }}>
                  <svg viewBox="0 0 450 160" style={{ width: '100%', height: 'auto', display: 'block' }}>
                    {/* Grid lines */}
                    <line x1="40" y1="20" x2="40" y2="130" stroke="#27272a" strokeWidth="1" />
                    <line x1="40" y1="130" x2="430" y2="130" stroke="#27272a" strokeWidth="1" />
                    <line x1="40" y1="75" x2="430" y2="75" stroke="#27272a" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="40" y1="20" x2="430" y2="20" stroke="#27272a" strokeDasharray="3,3" strokeWidth="1" />

                    {/* Axis Labels */}
                    <text x="35" y="25" fill="#71717a" fontSize="9" textAnchor="end">1.0</text>
                    <text x="35" y="78" fill="#71717a" fontSize="9" textAnchor="end">0.85</text>
                    <text x="35" y="133" fill="#71717a" fontSize="9" textAnchor="end">0.70</text>

                    <text x="60" y="145" fill="#71717a" fontSize="9" textAnchor="middle">1.0 µm</text>
                    <text x="160" y="145" fill="#71717a" fontSize="9" textAnchor="middle">1.5 µm</text>
                    <text x="260" y="145" fill="#71717a" fontSize="9" textAnchor="middle">2.0 µm</text>
                    <text x="360" y="145" fill="#71717a" fontSize="9" textAnchor="middle">2.5 µm</text>

                    {/* Dynamic Absorption Dip corresponding to selectedIdx.wavelength_microns */}
                    {(() => {
                      const wl = selectedIdx.wavelength_microns
                      // Map wl [0.8, 2.6] to x [40, 420]
                      const dipX = 40 + ((wl - 0.8) / (2.6 - 0.8)) * 380
                      return (
                        <>
                          <path
                            d={`M 40,25 Q 120,28 ${dipX - 45},30 Q ${dipX},115 ${dipX + 45},30 Q 360,28 430,30`}
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="2.5"
                          />
                          {/* Marker at dip center */}
                          <line x1={dipX} y1="20" x2={dipX} y2="130" stroke="#f43f5e" strokeDasharray="2,2" strokeWidth="1" />
                          <circle cx={dipX} cy="115" r="4" fill="#f43f5e" />
                          <text x={dipX} y="15" fill="#f43f5e" fontSize="9" textAnchor="middle" fontWeight="bold">
                            λ = {wl} µm
                          </text>
                        </>
                      )
                    })()}
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#71717a', marginTop: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                    <span>Continuum-Normalized Relative Reflectance R/Rc</span>
                    <span>Wavelength (micrometres)</span>
                  </div>
                </div>

                {/* Epistemic Guardrail Note */}
                <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: '#a1a1aa', borderLeft: '2px solid #eab308', paddingLeft: '0.6rem' }}>
                  <strong>Scientific Epistemics Note:</strong> CRISM summary parameters quantify band depth absorption ratios (e.g. <code>1 - R(λ_band) / R(λ_continuum)</code>). A high parameter score represents an <em>observed spectroscopic band</em>, whereas lithological naming (e.g. &quot;Nontronite Clay Unit&quot;) is an <em>interpreted</em> mineralogical attribution subject to mixed-pixel deconvolution uncertainties.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && activeTab === 'STRATIGRAPHY' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(440px, 1.4fr)', gap: '1.25rem' }}>
          {/* Stratigraphic Formations List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.85rem', color: '#a1a1aa', textTransform: 'uppercase', margin: '0 0 0.25rem 0' }}>
              USGS SIM-3464 Stratigraphic Formations ({geologyUnits.length})
            </h3>
            {geologyUnits.map((u) => {
              const isSelected = selectedUnit?.symbol === u.symbol
              return (
                <div
                  key={u.symbol}
                  onClick={() => setSelectedUnit(u)}
                  style={{
                    background: isSelected ? '#18181b' : '#0d0d0d',
                    border: isSelected ? `1px solid ${u.color_hex}` : '1px solid #27272a',
                    padding: '0.75rem',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    borderLeft: `4px solid ${u.color_hex}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#ffffff' }}>
                      {u.symbol} — {u.name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#a1a1aa' }}>
                      {u.epoch}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#d4d4d8' }}>
                    {u.dominant_lithology}
                  </div>
                  <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {u.key_minerals.slice(0, 3).map((min, i) => (
                      <span key={i} style={{ fontSize: '0.64rem', background: '#27272a', color: '#a1a1aa', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>
                        {min}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Unit Detailed Dossier */}
          {selectedUnit && (
            <div
              style={{
                background: '#0f0f11',
                border: '1px solid #27272a',
                padding: '1.25rem',
                borderRadius: '3px',
                borderTop: `4px solid ${selectedUnit.color_hex}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff' }}>
                    [{selectedUnit.symbol}] {selectedUnit.name}
                  </h3>
                  <div style={{ fontSize: '0.76rem', color: '#a1a1aa', marginTop: '0.2rem' }}>
                    Stratigraphic Epoch: <strong style={{ color: '#e4e4e7' }}>{selectedUnit.epoch}</strong>
                  </div>
                </div>
                <span
                  style={{
                    background: selectedUnit.color_hex,
                    color: '#000000',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '2px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  USGS SIM-3464
                </span>
              </div>

              <div style={{ marginBottom: '1rem', fontSize: '0.76rem', color: '#d4d4d8', lineHeight: '1.45', background: '#18181b', padding: '0.75rem', borderRadius: '2px' }}>
                {selectedUnit.description}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ background: '#141416', padding: '0.6rem', borderRadius: '2px', border: '1px solid #27272a' }}>
                  <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>Traversability Hazard Risk</div>
                  <div style={{ fontSize: '0.76rem', color: '#f43f5e', fontWeight: 600, marginTop: '0.2rem' }}>
                    {selectedUnit.traversability_risk}
                  </div>
                </div>
                <div style={{ background: '#141416', padding: '0.6rem', borderRadius: '2px', border: '1px solid #27272a' }}>
                  <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>EVA Science Priority</div>
                  <div style={{ fontSize: '0.76rem', color: '#10b981', fontWeight: 600, marginTop: '0.2rem' }}>
                    {selectedUnit.eva_science_priority}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.74rem', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Diagnostic Mineral Suite
                </h4>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {selectedUnit.key_minerals.map((m, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(56, 189, 248, 0.1)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '2px',
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '0.74rem', color: '#a1a1aa', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Mars 2020 Perseverance Sample Cores Collected in this Formation
                </h4>
                {selectedUnit.sample_cores_collected && selectedUnit.sample_cores_collected.length > 0 ? (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {selectedUnit.sample_cores_collected.map((sample, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '0.72rem',
                          background: 'rgba(234, 179, 8, 0.15)',
                          color: '#eab308',
                          border: '1px solid rgba(234, 179, 8, 0.3)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '2px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        🧪 {sample}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: '#71717a' }}>No rover drill cores acquired in this specific stratigraphic member.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'PHYSICS_CV' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top: Thermophysical Cycles Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(280px, 1fr)', gap: '1.25rem' }}>
            {/* Diurnal Cycle Chart */}
            <div style={{ background: '#0f0f11', border: '1px solid #27272a', padding: '1rem', borderRadius: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', color: '#f4f4f5' }}>
                  24-Hour Diurnal Surface & Air Temperature Harmonic Cycle
                </h3>
                <span style={{ fontSize: '0.68rem', color: '#a1a1aa', fontFamily: 'var(--font-mono)' }}>
                  Jezero 18.45°N • Ls = 180°
                </span>
              </div>
              <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.72rem', color: '#71717a' }}>
                Two-harmonic planetary energy balance model (Spencer et al.) showing afternoon peak at ~13:30 LTST and cryogenic frost minimum at ~04:30 LTST.
              </p>

              {diurnalProfiles.length > 0 && (
                <div style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.5rem', borderRadius: '2px' }}>
                  <svg viewBox="0 0 480 180" style={{ width: '100%', height: 'auto', display: 'block' }}>
                    {/* Horizontal grid lines */}
                    <line x1="35" y1="20" x2="460" y2="20" stroke="#27272a" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="35" y1="60" x2="460" y2="60" stroke="#27272a" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="35" y1="100" x2="460" y2="100" stroke="#27272a" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="35" y1="140" x2="460" y2="140" stroke="#27272a" strokeDasharray="3,3" strokeWidth="1" />

                    <text x="30" y="24" fill="#71717a" fontSize="8" textAnchor="end">0°C</text>
                    <text x="30" y="64" fill="#71717a" fontSize="8" textAnchor="end">-30°C</text>
                    <text x="30" y="104" fill="#71717a" fontSize="8" textAnchor="end">-60°C</text>
                    <text x="30" y="144" fill="#71717a" fontSize="8" textAnchor="end">-90°C</text>

                    {/* Operational EVA Daylight Window (10:00 to 16:00 LTST) */}
                    <rect x={35 + (10 / 24) * 425} y="15" width={(6 / 24) * 425} height="135" fill="rgba(16, 185, 129, 0.08)" stroke="rgba(16, 185, 129, 0.25)" strokeDasharray="2,2" />
                    <text x={35 + (13 / 24) * 425} y="28" fill="#10b981" fontSize="8" textAnchor="middle" fontWeight="bold">
                      OPTIMAL EVA WINDOW (10:00–16:00)
                    </text>

                    {/* Surface Temperature Polyline (Mapped [-100C, 10C] to [155, 15]) */}
                    {(() => {
                      const tempToY = (t: number) => 155 - ((t - (-100.0)) / (10.0 - (-100.0))) * 140
                      const hourToX = (h: number) => 35 + (h / 23) * 425

                      const surfPoints = diurnalProfiles
                        .map((p, idx) => `${hourToX(idx)},${tempToY(p.surface_temp_c)}`)
                        .join(' ')
                      const airPoints = diurnalProfiles
                        .map((p, idx) => `${hourToX(idx)},${tempToY(p.air_temp_c)}`)
                        .join(' ')

                      return (
                        <>
                          <polyline points={surfPoints} fill="none" stroke="#f43f5e" strokeWidth="2" />
                          <polyline points={airPoints} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3,2" />
                        </>
                      )
                    })()}

                    {/* X axis hours */}
                    {[0, 4, 8, 12, 16, 20, 23].map((hr) => (
                      <text key={hr} x={35 + (hr / 23) * 425} y="165" fill="#71717a" fontSize="8" textAnchor="middle">
                        {hr}:00
                      </text>
                    ))}
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.4rem', fontSize: '0.68rem' }}>
                    <span style={{ color: '#f43f5e', fontWeight: 600 }}>— Ground Surface Temp (°C)</span>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>--- Air Temp at 1.5m (°C)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Thermal Inertia & Trafficability Dossier */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ background: '#0f0f11', border: '1px solid #27272a', padding: '1rem', borderRadius: '3px' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#f4f4f5' }}>
                  Surface Thermal Inertia (MGS TES / THEMIS)
                </h3>
                {thermalInertia && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                        {thermalInertia.thermal_inertia_tiu}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>J m⁻² K⁻¹ s⁻¹/² (TIU)</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#e4e4e7', marginBottom: '0.4rem' }}>
                      <strong>Lithological State:</strong> {thermalInertia.surface_material}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.08)', padding: '0.4rem', borderRadius: '2px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <strong>Trafficability:</strong> {thermalInertia.trafficability_implication}
                    </div>
                  </div>
                )}
              </div>

              {/* Dust Climatology Perihelion Alert */}
              <div style={{ background: '#0f0f11', border: '1px solid #27272a', padding: '1rem', borderRadius: '3px' }}>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: '#f4f4f5' }}>
                  Seasonal Dust Climatology (Ls 0°–360°)
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.72rem', color: '#71717a' }}>
                  Atmospheric dust optical depth (tau) variation across full Martian year ({dustPoints.length} seasonal intervals).
                </p>
                {dustPoints.length > 0 && (
                  <div style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.4rem', borderRadius: '2px', marginBottom: '0.6rem' }}>
                    <svg viewBox="0 0 300 70" style={{ width: '100%', height: 'auto', display: 'block' }}>
                      {/* Storm window highlight */}
                      <rect x={300 * (180 / 360)} y="5" width={300 * (150 / 360)} height="55" fill="rgba(245, 158, 11, 0.12)" />
                      {/* Background tau */}
                      <polyline
                        points={dustPoints.map((p, idx) => `${(idx / (dustPoints.length - 1)) * 290 + 5},${60 - p.tau_background * 15}`).join(' ')}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                      />
                      {/* Regional storm tau */}
                      <polyline
                        points={dustPoints.map((p, idx) => `${(idx / (dustPoints.length - 1)) * 290 + 5},${60 - (p.tau_regional_storm / 2.0) * 45}`).join(' ')}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                      />
                      <text x="5" y="68" fill="#71717a" fontSize="7">Ls 0°</text>
                      <text x={300 * (180 / 360)} y="68" fill="#f59e0b" fontSize="7" fontWeight="bold">Ls 180°</text>
                      <text x="270" y="68" fill="#71717a" fontSize="7">360°</text>
                    </svg>
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.4rem', borderRadius: '2px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                  ⚠️ <strong>Perihelion Storm Window:</strong> Ls 180°–330° exhibits peak regional and global dust storm probability with optical depth tau surging from 0.35 up to 3.5+.
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: Explainable Computer Vision Feature Candidate Detection Panel */}
          {cvCandidates && (
            <div style={{ background: '#0f0f11', border: '1px solid #27272a', padding: '1.25rem', borderRadius: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#ffffff' }}>
                    Computer Vision Geomorphic Candidate Detectors (Strictly HEURISTIC)
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '0.2rem' }}>
                    Physics-based edge filters, shadow-length trigonometry h = L·tan(θ), and Hessian ridge detection.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', background: '#1c1917', color: '#fb923c', border: '1px solid #7c2d12', padding: '0.2rem 0.5rem', borderRadius: '2px' }}>
                    🪨 {cvCandidates.counts.boulders} Boulders Detected
                  </span>
                  <span style={{ fontSize: '0.7rem', background: '#141c14', color: '#4ade80', border: '1px solid #14532d', padding: '0.2rem 0.5rem', borderRadius: '2px' }}>
                    〰️ {cvCandidates.counts.dune_segments} Dune Ridges
                  </span>
                  <span style={{ fontSize: '0.7rem', background: '#171720', color: '#818cf8', border: '1px solid #312e81', padding: '0.2rem 0.5rem', borderRadius: '2px' }}>
                    ⭕ {cvCandidates.counts.craters} Craters
                  </span>
                </div>
              </div>

              {/* Candidates Tables Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
                {/* Boulders Table */}
                <div style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.75rem', borderRadius: '2px' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.78rem', color: '#fb923c', textTransform: 'uppercase' }}>
                    Candidate Boulders with Shadow Trigonometry
                  </h4>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)' }}>
                      <thead>
                        <tr style={{ color: '#71717a', borderBottom: '1px solid #27272a' }}>
                          <th style={{ textAlign: 'left', padding: '0.2rem' }}>ID</th>
                          <th style={{ textAlign: 'right', padding: '0.2rem' }}>Diam</th>
                          <th style={{ textAlign: 'right', padding: '0.2rem' }}>Shadow</th>
                          <th style={{ textAlign: 'right', padding: '0.2rem' }}>Height</th>
                          <th style={{ textAlign: 'right', padding: '0.2rem' }}>Conf</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cvCandidates.boulder_candidates.map((b) => (
                          <tr key={b.candidate_id} style={{ borderBottom: '1px solid #18181b', color: '#d4d4d8' }}>
                            <td style={{ padding: '0.25rem 0.2rem', color: '#fb923c' }}>{b.candidate_id}</td>
                            <td style={{ textAlign: 'right', padding: '0.25rem 0.2rem' }}>{b.estimated_diameter_m}m</td>
                            <td style={{ textAlign: 'right', padding: '0.25rem 0.2rem' }}>{b.shadow_length_m}m</td>
                            <td style={{ textAlign: 'right', padding: '0.25rem 0.2rem', fontWeight: 600, color: '#f43f5e' }}>{b.estimated_height_m}m</td>
                            <td style={{ textAlign: 'right', padding: '0.25rem 0.2rem', color: '#38bdf8' }}>{b.confidence_score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Dune Ridges & Craters Table */}
                <div style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.75rem', borderRadius: '2px' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.78rem', color: '#818cf8', textTransform: 'uppercase' }}>
                    Candidate Impact Craters (Inward Gradient Divergence)
                  </h4>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)' }}>
                      <thead>
                        <tr style={{ color: '#71717a', borderBottom: '1px solid #27272a' }}>
                          <th style={{ textAlign: 'left', padding: '0.2rem' }}>ID</th>
                          <th style={{ textAlign: 'right', padding: '0.2rem' }}>Radius</th>
                          <th style={{ textAlign: 'right', padding: '0.2rem' }}>Depth</th>
                          <th style={{ textAlign: 'right', padding: '0.2rem' }}>Rim Ht</th>
                          <th style={{ textAlign: 'right', padding: '0.2rem' }}>Conf</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cvCandidates.crater_candidates.map((c) => (
                          <tr key={c.candidate_id} style={{ borderBottom: '1px solid #18181b', color: '#d4d4d8' }}>
                            <td style={{ padding: '0.25rem 0.2rem', color: '#818cf8' }}>{c.candidate_id}</td>
                            <td style={{ textAlign: 'right', padding: '0.25rem 0.2rem' }}>{c.radius_m}m</td>
                            <td style={{ textAlign: 'right', padding: '0.25rem 0.2rem', color: '#38bdf8' }}>{c.depth_m}m</td>
                            <td style={{ textAlign: 'right', padding: '0.25rem 0.2rem' }}>+{c.rim_height_m}m</td>
                            <td style={{ textAlign: 'right', padding: '0.25rem 0.2rem', color: '#10b981' }}>{c.confidence_score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
