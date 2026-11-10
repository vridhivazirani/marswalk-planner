export interface CostmapWeightsDTO {
  w_terrain: number
  w_hazard: number
  w_uncertainty: number
  w_science: number
}

export interface MissionProfileInfo {
  profile_type: string
  title: string
  description: string
  weights: CostmapWeightsDTO
}

export interface CostmapProfilesResponse {
  profiles: Record<string, MissionProfileInfo>
  active_default: string
}

export interface CostmapInspectionResponse {
  coordinate: { lat: number; lon: number }
  elevation_m?: number | null
  is_blocked: boolean
  combined_cost?: number | null
  cost_multiplier_scale?: string
  individual_components?: {
    c_terrain_difficulty: number
    c_environmental_hazard: number
    c_topographic_uncertainty: number
    c_science_opportunity: number
  }
  weights_applied: CostmapWeightsDTO
  mission_profile: string
  explanation: string
}

export async function fetchCostmapProfiles(): Promise<CostmapProfilesResponse> {
  const res = await fetch('/api/v1/costmap/profiles')
  if (!res.ok) {
    throw new Error(`Failed to fetch costmap profiles: ${res.statusText}`)
  }
  return res.json() as Promise<CostmapProfilesResponse>
}

export async function inspectLocationCost(
  lat: number,
  lon: number,
  profile: string = 'BALANCED',
): Promise<CostmapInspectionResponse> {
  const res = await fetch(
    `/api/v1/costmap/inspect?lat=${lat}&lon=${lon}&profile=${encodeURIComponent(profile)}`
  )
  if (!res.ok) {
    throw new Error(`Failed to inspect cost at (${lat}, ${lon}): ${res.statusText}`)
  }
  return res.json() as Promise<CostmapInspectionResponse>
}

export async function evaluateCustomWeights(
  weights: CostmapWeightsDTO,
): Promise<{ status: string; statistics: Record<string, number | string> }> {
  const res = await fetch('/api/v1/costmap/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weights),
  })
  if (!res.ok) {
    throw new Error(`Failed to evaluate custom weights: ${res.statusText}`)
  }
  return res.json()
}

