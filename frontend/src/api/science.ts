export interface CandidateTargetFeature {
  type: 'Feature'
  id: string
  geometry: {
    type: 'Point'
    coordinates: [number, number, number] // [lon, lat, elev]
  }
  properties: {
    target_id: string
    name: string
    rank: number
    composite_score: number
    primary_science_theme: string
    breakdown: {
      mineralogy: number
      diversity: number
      layered_features: number
      delta_context: number
      rover_proximity: number
      confidence: number
    }
    epistemic_class: string
    rationale: string
    safety_caveat: string
    life_inference_warning: string
  }
}

export interface ScienceTargetsGeoJSON {
  type: 'FeatureCollection'
  name: string
  crs: {
    type: string
    properties: { name: string }
  }
  features: CandidateTargetFeature[]
}

export interface ScienceInspectionResponse {
  coordinate: { lat: number; lon: number }
  elevation_m?: number | null
  composite_opportunity_score: number
  epistemic_class: string
  explanation: string
  disclaimers: {
    life_inference: string
    rover_safety: string
  }
}

export interface ScientificObjectiveDTO {
  id: string
  number: number
  title: string
  description: string
  scientific_hypothesis: string
  diagnostic_spectral_indices: string[]
  supporting_instruments: string[]
  target_geological_units: string[]
  candidate_target_ids: string[]
  primary_investigation_methods: string[]
  epistemic_class: string
  disclaimer: string
}

export interface ScientificObjectivesResponse {
  count: number
  objectives: ScientificObjectiveDTO[]
}

export async function fetchScientificObjectives(): Promise<ScientificObjectivesResponse> {
  const res = await fetch('/api/v1/science/objectives')
  if (!res.ok) {
    throw new Error(`Failed to fetch scientific objectives: ${res.statusText}`)
  }
  return res.json() as Promise<ScientificObjectivesResponse>
}

export async function fetchScienceTargets(): Promise<ScienceTargetsGeoJSON> {
  const res = await fetch('/api/v1/science/targets')
  if (!res.ok) {
    throw new Error(`Failed to fetch science targets: ${res.statusText}`)
  }
  return res.json() as Promise<ScienceTargetsGeoJSON>
}

export async function inspectLocationScience(
  lat: number,
  lon: number,
): Promise<ScienceInspectionResponse> {
  const res = await fetch(`/api/v1/science/inspect?lat=${lat}&lon=${lon}`)
  if (!res.ok) {
    throw new Error(`Failed to inspect science at (${lat}, ${lon}): ${res.statusText}`)
  }
  return res.json() as Promise<ScienceInspectionResponse>
}

