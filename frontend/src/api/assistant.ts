/**
 * Marswalk AI Mars Research Assistant and Explain This Map Engine Client.
 */

const API_BASE = '/api/v1'

export interface AssistantCitation {
  product_id: string
  name: string
  doi: string
  authority: string
}

export interface AssistantQueryResponse {
  query: string
  answer: string
  citations: AssistantCitation[]
  suggested_followups: string[]
  epistemic_class: string
  disclaimer: string
}

export interface ExplainMapResponse {
  region_id: string
  region_name: string
  coordinates: { lat: number; lon: number }
  geological_unit: string
  geological_interpretation: string
  topographic_summary: string
  scientific_summary: string
  active_layers: string[]
  epistemic_class: string
  authority: string
  disclaimer: string
}

export interface AssistantContext {
  lat?: number
  lon?: number
  active_region_id?: string
  active_page?: string
  active_layers?: string[]
}

/**
 * Send grounded scientific QA query to backend assistant.
 */
export async function queryMarsAssistant(
  query: string,
  context?: AssistantContext,
): Promise<AssistantQueryResponse> {
  const res = await fetch(`${API_BASE}/assistant/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, context }),
  })
  if (!res.ok) {
    throw new Error(`Assistant query failed: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Request scientific explanation for current map coordinates and active layers.
 */
export async function explainMapViewport(params: {
  lat: number
  lon: number
  region_id?: string
  active_layers?: string[]
}): Promise<ExplainMapResponse> {
  const res = await fetch(`${API_BASE}/assistant/explain-map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: params.lat,
      lon: params.lon,
      region_id: params.region_id ?? 'reg-jezero',
      active_layers: params.active_layers ?? [],
    }),
  })
  if (!res.ok) {
    throw new Error(`Explain map failed: ${res.statusText}`)
  }
  return res.json()
}
