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

export interface DiagnosticHealthResponse {
  status: 'ok' | 'degraded'
  service: string
  version: string
  geospatial_engine: {
    rasterio: { installed: boolean; version: string }
    pyproj: { installed: boolean; version: string }
    geodesy_standard: string
    vertical_datum: string
  }
  data_lake: Record<
    string,
    {
      available: boolean
      path: string
      size_bytes: number
    }
  >
  catalogue: {
    total_verified_products: number
    epistemic_classes_supported: string[]
  }
  disclaimer: string
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', { signal })
  if (!response.ok) {
    throw new Error(`Backend responded with HTTP ${response.status}`)
  }
  return (await response.json()) as HealthResponse
}

export async function fetchHealthDiagnostic(signal?: AbortSignal): Promise<DiagnosticHealthResponse> {
  const response = await fetch('/api/v1/health/diagnostic', { signal })
  if (!response.ok) {
    throw new Error(`Backend diagnostic responded with HTTP ${response.status}`)
  }
  return (await response.json()) as DiagnosticHealthResponse
}

