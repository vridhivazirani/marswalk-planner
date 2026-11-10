import { useEffect, useState } from 'react'
import { fetchHealth, type HealthResponse } from '../api/health'

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string }

/** Shows whether the FastAPI backend is reachable. Performs no scientific computation. */
export function BackendStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((health) => setState({ kind: 'ok', health }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => controller.abort()
  }, [])

  return (
    <section className="card" aria-live="polite">
      <h2>Backend connection</h2>
      {state.kind === 'loading' && <p>Checking backend…</p>}
      {state.kind === 'ok' && (
        <p className="status-ok">
          Connected to {state.health.service} v{state.health.version}
        </p>
      )}
      {state.kind === 'error' && (
        <p className="status-error">
          Backend not reachable ({state.message}). Start it with{' '}
          <code>uvicorn app.main:app --reload --port 8000</code> inside <code>backend/</code>.
        </p>
      )}
    </section>
  )
}

