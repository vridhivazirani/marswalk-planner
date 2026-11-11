export interface EnvironmentalScenarioInputDTO {
  scenario_id: string
  title: string
  description: string
  data_origin: 'HISTORICAL_OBSERVED' | 'CLIMATE_MODELED' | 'USER_SCENARIO'
  air_temperature_c: number
  ground_temperature_c: number
  solar_irradiance_w_per_m2: number
  dust_optical_depth_tau: number
  wind_speed_mps: number
  wind_gust_mps: number
  operational_window_start_ltst: string
  operational_window_end_ltst: string
  operational_window_hours: number
  season_solar_longitude_ls_deg?: number | null
  source_reference: string
  source_time_period: string
  epistemic_class: string
}

export interface EnvironmentalSuitabilityScoreDTO {
  overall_suitability_score: number
  overall_suitability_pct: number
  thermal_score: number
  solar_illumination_score: number
  dust_opacity_score: number
  wind_aerodynamic_score: number
  suitability_category: 'OPTIMAL' | 'ACCEPTABLE' | 'MARGINAL' | 'HAZARDOUS'
  epistemic_class: string
}

export interface EnvironmentalAssessmentReportDTO {
  scenario: EnvironmentalScenarioInputDTO
  suitability: EnvironmentalSuitabilityScoreDTO
  warnings: string[]
  weights_applied: Record<string, number>
  data_availability_notice: string
  safety_disclaimer: string
  general_disclaimer: string
}

export interface EnvironmentalWeightsDTO {
  w_thermal: number
  w_solar: number
  w_dust: number
  w_wind: number
}

export interface DataSourceProvenanceDTO {
  product_id: string
  title: string
  organization: string
  coverage: string
  measured_parameters: string[]
  epistemic_class: string
  caveats: string
}

export interface DataSourcesResponse {
  sources: DataSourceProvenanceDTO[]
}

export async function fetchEnvironmentalSources(): Promise<DataSourceProvenanceDTO[]> {
  const res = await fetch('/api/v1/environmental/sources')
  if (!res.ok) {
    throw new Error(`Failed to load environmental data sources: ${res.statusText}`)
  }
  const data = (await res.json()) as DataSourcesResponse
  return data.sources
}

export async function fetchCuratedEnvironmentalScenarios(): Promise<EnvironmentalScenarioInputDTO[]> {
  const res = await fetch('/api/v1/environmental/scenarios')
  if (!res.ok) {
    throw new Error(`Failed to load curated environmental scenarios: ${res.statusText}`)
  }
  const data = (await res.json()) as { scenarios: EnvironmentalScenarioInputDTO[] }
  return data.scenarios
}

export async function assessEnvironmentalScenario(
  scenario: EnvironmentalScenarioInputDTO,
  weights?: EnvironmentalWeightsDTO,
): Promise<EnvironmentalAssessmentReportDTO> {
  const res = await fetch('/api/v1/environmental/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, weights }),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errorBody.detail || `Environmental assessment failed: ${res.statusText}`)
  }
  return res.json() as Promise<EnvironmentalAssessmentReportDTO>
}

export async function compareEnvironmentalScenarios(
  scenarios: EnvironmentalScenarioInputDTO[],
  weights?: EnvironmentalWeightsDTO,
): Promise<EnvironmentalAssessmentReportDTO[]> {
  const res = await fetch('/api/v1/environmental/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarios, weights }),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errorBody.detail || `Environmental comparison failed: ${res.statusText}`)
  }
  const data = (await res.json()) as { comparisons: EnvironmentalAssessmentReportDTO[] }
  return data.comparisons
}

export interface DiurnalHourProfileDTO {
  ltst_hour: number
  surface_temp_c: number
  air_temp_c: number
  solar_flux_w_m2: number
  eva_suitability_flag: boolean
}

export interface DiurnalCycleResponse {
  latitude_deg: number
  season_ls_deg: number
  thermal_inertia_tiu: number
  dust_tau: number
  profiles: DiurnalHourProfileDTO[]
  epistemic_class: string
}

export interface DustClimatologyPointDTO {
  solar_longitude_ls_deg: number
  season_name: string
  tau_background: number
  tau_regional_storm: number
  tau_global_storm: number
  storm_probability_pct: number
}

export interface DustClimatologyResponse {
  cycle_points: DustClimatologyPointDTO[]
  storm_season_range_ls: [number, number]
  epistemic_class: string
}

export interface ThermalInertiaDTO {
  thermal_inertia_tiu: number
  albedo: number
  surface_material: string
  trafficability_implication: string
  epistemic_class: string
}

export async function fetchDiurnalCycle(
  latitudeDeg = 18.45,
  seasonLsDeg = 180.0,
  thermalInertiaTiu = 320.0,
  dustTau = 0.4,
): Promise<DiurnalCycleResponse> {
  const params = new URLSearchParams({
    latitude_deg: latitudeDeg.toString(),
    season_ls_deg: seasonLsDeg.toString(),
    thermal_inertia_tiu: thermalInertiaTiu.toString(),
    dust_tau: dustTau.toString(),
  })
  const res = await fetch(`/api/v1/environmental/diurnal-cycle?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch diurnal cycle: ${res.statusText}`)
  }
  return res.json() as Promise<DiurnalCycleResponse>
}

export async function fetchDustClimatology(): Promise<DustClimatologyResponse> {
  const res = await fetch('/api/v1/environmental/dust-climatology')
  if (!res.ok) {
    throw new Error(`Failed to fetch dust climatology: ${res.statusText}`)
  }
  return res.json() as Promise<DustClimatologyResponse>
}

export async function fetchThermalInertia(
  tiu = 320.0,
  albedo = 0.22,
): Promise<ThermalInertiaDTO> {
  const params = new URLSearchParams({
    tiu: tiu.toString(),
    albedo: albedo.toString(),
  })
  const res = await fetch(`/api/v1/environmental/thermal-inertia?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch thermal inertia: ${res.statusText}`)
  }
  return res.json() as Promise<ThermalInertiaDTO>
}


