/**
 * AIMarsResearchAssistant component.
 * Grounded planetary research assistant and "Explain This Map" assistant.
 * Fully compliant with AGENTS.md: authentic citations, epistemic tagging, and disclaimer.
 */

import { useState } from 'react'
import {
  queryMarsAssistant,
  explainMapViewport,
  type AssistantCitation,
  type AssistantContext,
} from '../api/assistant'

interface AIMarsResearchAssistantProps {
  currentContext?: AssistantContext
}

const PRESET_QUERIES = [
  'What CRISM minerals and clays are detected in Jezero Crater?',
  'Explain the geologic formations and rock units in Jezero',
  'Tell me about Gale Crater region',
  'What is the diurnal temperature swing and dust opacity?',
  'How is metabolic power and oxygen consumable calculated for EVA?',
]

export function AIMarsResearchAssistant({ currentContext }: AIMarsResearchAssistantProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputQuery, setInputQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [epistemicClass, setEpistemicClass] = useState<string | null>(null)
  const [citations, setCitations] = useState<AssistantCitation[]>([])
  const [followups, setFollowups] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleAsk = async (queryText: string) => {
    if (!queryText.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await queryMarsAssistant(queryText, currentContext)
      setAnswer(res.answer)
      setEpistemicClass(res.epistemic_class)
      setCitations(res.citations)
      setFollowups(res.suggested_followups)
      setInputQuery('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant query failed')
    } finally {
      setLoading(false)
    }
  }

  const handleExplainMap = async () => {
    setLoading(true)
    setError(null)
    try {
      const lat = currentContext?.lat ?? 18.4485
      const lon = currentContext?.lon ?? 77.4320
      const regionId = currentContext?.active_region_id ?? 'reg-jezero'
      const layers = currentContext?.active_layers ?? []
      const res = await explainMapViewport({ lat, lon, region_id: regionId, active_layers: layers })
      setAnswer(res.scientific_summary)
      setEpistemicClass(res.epistemic_class)
      setCitations([
        {
          product_id: 'USGS-SIM-3464',
          name: 'Geologic Map of Jezero Crater and Nili Planum',
          doi: 'https://doi.org/10.3133/sim3464',
          authority: res.authority,
        },
      ])
      setFollowups([
        'What drill cores were extracted at these coordinates?',
        'What is the slope hazard at these coordinates?',
        'Show diurnal thermal profile for this site',
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Map explanation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-lg shadow-cyan-950/50 border border-cyan-400/40 transition-all hover:scale-105 active:scale-95 text-xs tracking-wider uppercase font-mono"
          aria-label="Open AI Mars Research Assistant"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>AI Mars Assistant</span>
        </button>
      ) : (
        <div className="w-[440px] max-h-[640px] flex flex-col rounded-xl bg-slate-900 border border-cyan-500/40 shadow-2xl shadow-black/80 backdrop-blur-md overflow-hidden text-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300 font-mono">
                Marswalk AI Research Assistant
              </h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-slate-800 transition"
              aria-label="Close Assistant"
            >
              ✕
            </button>
          </div>

          {/* Quick Actions Bar */}
          <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-mono">GROUNDED PLANETARY QA</span>
            <button
              onClick={handleExplainMap}
              disabled={loading}
              className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>Explain Map View</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="p-4 overflow-y-auto max-h-[440px] space-y-3 text-xs leading-relaxed">
            {/* Disclaimer pill */}
            <div className="p-2 rounded bg-amber-950/20 border border-amber-600/30 text-[10px] text-amber-300/80">
              Research & education decision-support model. Grounded strictly in authentic PDS/USGS datasets. Not certified for flight operations.
            </div>

            {/* Answer Display */}
            {answer ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">RESEARCH BRIEFING:</span>
                  {epistemicClass && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/40">
                      {epistemicClass}
                    </span>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-200">
                  {answer}
                </div>

                {/* Citations */}
                {citations.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Authoritative Citations:
                    </div>
                    {citations.map((c, i) => (
                      <div
                        key={i}
                        className="p-2 rounded bg-slate-950/50 border border-slate-800/80 flex flex-col gap-0.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between font-mono text-cyan-400">
                          <span>{c.product_id}</span>
                          <span className="text-[9px] text-slate-400">{c.authority}</span>
                        </div>
                        <div className="text-slate-300 font-medium">{c.name}</div>
                        {c.doi && (
                          <a
                            href={c.doi}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-cyan-400 hover:underline truncate"
                          >
                            {c.doi}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Followups */}
                {followups.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Suggested Follow-Ups:
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {followups.map((f, i) => (
                        <button
                          key={i}
                          onClick={() => handleAsk(f)}
                          className="text-left px-2.5 py-1.5 rounded bg-slate-800/50 hover:bg-slate-800 text-[11px] text-slate-300 hover:text-cyan-300 border border-slate-700/50 transition"
                        >
                          → {f}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Preset Questions */
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-slate-400">
                  Select a research query to explore Marswalk verified databases:
                </div>
                <div className="flex flex-col gap-1.5">
                  {PRESET_QUERIES.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleAsk(q)}
                      disabled={loading}
                      className="text-left px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-[11px] text-slate-300 hover:text-cyan-300 border border-slate-700/40 transition disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="p-2 rounded bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-slate-950/90 border-t border-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleAsk(inputQuery)
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask assistant about geology, climate, or terrain..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="submit"
                disabled={loading || !inputQuery.trim()}
                className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono disabled:opacity-40 transition"
              >
                {loading ? '...' : 'Ask'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
