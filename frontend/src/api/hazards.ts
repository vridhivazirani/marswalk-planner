export interface LocationHazardInspection {
  coordinate: { lat: number; lon: number }
  status?: string
  elevation_m?: number | null
  is_passable: boolean
  hard_restriction_code: string | null
  overall_hazard_score?: number
  individual_hazards?: {
    slope_hazard: number
    roughness_hazard: number
    boulder_hazard: number
    sand_hazard: number
    crater_hazard: number
    unknown_hazard: number
  }
  epistemic_source?: string
  confidence?: number
  explanation: string
}

export async function inspectLocationHazard(
  lat: number,
  lon: number,
): Promise<LocationHazardInspection> {
  const res = await fetch(`/api/v1/hazards/inspect?lat=${lat}&lon=${lon}`)
  if (!res.ok) {
    throw new Error(`Failed to inspect hazard at (${lat}, ${lon}): ${res.statusText}`)
  }
  return res.json() as Promise<LocationHazardInspection>
}

