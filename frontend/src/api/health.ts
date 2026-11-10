/**
 * Minimal typed client for the backend health endpoint.
 * In Phase 4 this will be replaced by a client generated from the backend OpenAPI schema.
 */

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  disclaimer: string
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', { signal })
  if (!response.ok) {
    throw new Error(`Backend responded with HTTP ${response.status}`)
  }
  return (await response.json()) as HealthResponse
}

