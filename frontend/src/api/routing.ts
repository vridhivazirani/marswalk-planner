export interface LatLon {
  lat: number
  lon: number
}

export interface RouteMetricsDTO {
  total_distance_m: number
  accumulated_cost: number
  estimated_duration_minutes: number
  mean_hazard_exposure: number
  mean_uncertainty_exposure: number
  accumulated_science_opportunity: number
  mean_science_opportunity: number
  restricted_cells_crossed: number
  unknown_cells_crossed: number
}

export interface RouteFeature {
  type: 'Feature'
  id: string
  geometry: {
    type: 'LineString'
    coordinates: [number, number, number][] // [lon, lat, elev]
  }
  properties: {
    route_id: string
    profile_name: string
    algorithm: string
    is_simplified: boolean
    crs: string
    metrics: RouteMetricsDTO
    disclaimer: string
  }
}

export interface RouteSuiteResponse {
  type: 'FeatureCollection'
  name: string
  features: RouteFeature[]
  comparison: Record<string, RouteMetricsDTO>
}

export interface MissionPreferencesDTO {
  safety_importance: number
  science_importance: number
  efficiency_importance: number
}

export interface RouteComparisonSummaryDTO {
  route_id: string
  profile_name: string
  primary_optimization_objective: string
  key_trade_off: string
  length_km: number
  estimated_duration_min: number
  mean_hazard_exposure_pct: number
  mean_uncertainty_m: number
  accumulated_science_score: number
  mean_science_score: number
  accumulated_cost: number
  preference_utility_score: number
  rank_under_preferences: number
}

export interface MultiObjectiveComparisonDTO {
  start: LatLon
  destination: LatLon
  preferences_applied: MissionPreferencesDTO
  routes: RouteComparisonSummaryDTO[]
  trade_off_analysis: string[]
  no_universal_optimal_notice: string
}

export interface MultiObjectiveResponse {
  type: 'FeatureCollection'
  name: string
  features: RouteFeature[]
  comparison: MultiObjectiveComparisonDTO
}

export interface ExplorationScenarioDTO {
  scenario_id: string
  title: string
  description: string
  start: { lat: number; lon: number; name?: string }
  destination: { lat: number; lon: number; name?: string }
  suggested_preferences: MissionPreferencesDTO
}

export interface ExplorationScenariosResponse {
  scenarios: ExplorationScenarioDTO[]
}

export async function planRoute(
  start: LatLon,
  destination: LatLon,
  profile: string = 'BALANCED',
  algorithm: string = 'astar',
  simplify: boolean = true,
): Promise<RouteFeature> {
  const res = await fetch('/api/v1/routing/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, destination, profile, algorithm, simplify }),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errorBody.detail || `Routing failed: ${res.statusText}`)
  }
  return res.json() as Promise<RouteFeature>
}

export async function planRouteSuite(
  start: LatLon,
  destination: LatLon,
  algorithm: string = 'astar',
  simplify: boolean = true,
): Promise<RouteSuiteResponse> {
  const res = await fetch('/api/v1/routing/suite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, destination, algorithm, simplify }),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errorBody.detail || `Comparative route suite failed: ${res.statusText}`)
  }
  return res.json() as Promise<RouteSuiteResponse>
}

export async function compareRoutes(
  start: LatLon,
  destination: LatLon,
  preferences?: MissionPreferencesDTO,
  algorithm: string = 'astar',
  simplify: boolean = true,
): Promise<MultiObjectiveResponse> {
  const res = await fetch('/api/v1/routing/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, destination, preferences, algorithm, simplify }),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errorBody.detail || `Route comparison failed: ${res.statusText}`)
  }
  return res.json() as Promise<MultiObjectiveResponse>
}

export async function fetchExplorationScenarios(): Promise<ExplorationScenarioDTO[]> {
  const res = await fetch('/api/v1/routing/scenarios')
  if (!res.ok) {
    throw new Error(`Failed to load exploration scenarios: ${res.statusText}`)
  }
  const data = (await res.json()) as ExplorationScenariosResponse
  return data.scenarios
}
