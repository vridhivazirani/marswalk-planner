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

