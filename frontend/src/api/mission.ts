import type { LatLon, RouteFeature } from './routing'

export interface CrewAssumptionsDTO {
  nominal_crew_count: number
  body_mass_kg: number
  suit_mass_kg: number
  base_metabolic_rate_w?: number
  nominal_walking_power_w: number
  slope_power_factor_w_per_deg?: number
  o2_consumption_rate_g_per_hour_base?: number
  o2_consumption_rate_g_per_wh?: number
  status?: string
}

export interface EquipmentAssumptionsDTO {
  suit_designation?: string
  total_usable_o2_capacity_g: number
  total_battery_capacity_wh: number
  base_life_support_power_w?: number
  min_o2_reserve_fraction?: number
  min_battery_reserve_fraction?: number
  max_recommended_eva_duration_hours: number
  status?: string
}

export interface TimelineAssumptionsDTO {
  nominal_walking_speed_mps: number
  science_stop_duration_minutes: number
  rest_stop_interval_minutes: number
  rest_stop_duration_minutes?: number
  contingency_reserve_time_fraction: number
  return_journey_fatigue_multiplier?: number
  status?: string
}

export interface MissionPlanningAssumptionsDTO {
  crew: CrewAssumptionsDTO
  equipment: EquipmentAssumptionsDTO
  timeline: TimelineAssumptionsDTO
  notice?: string
}

export interface EVATimelineDTO {
  outbound_traversal_minutes: number
  return_traversal_minutes: number
  total_walking_minutes: number
  planned_science_minutes: number
  science_stops_count: number
  rest_pauses_minutes: number
  rest_stops_count: number
  contingency_reserve_minutes: number
  total_eva_duration_minutes: number
  total_eva_duration_hours: number
  epistemic_class: string
}

export interface ConsumablesBudgetDTO {
  o2_consumed_per_crew_g: number
  total_o2_consumed_all_crew_g: number
  o2_capacity_per_suit_g: number
  o2_remaining_per_suit_g: number
  o2_margin_pct: number
  battery_energy_consumed_wh: number
  battery_capacity_wh: number
  battery_remaining_wh: number
  battery_margin_pct: number
  metabolic_energy_expended_kcal: number
  average_metabolic_power_w: number
  epistemic_class: string
}

export interface MissionFeasibilityWarningDTO {
  severity: 'CRITICAL' | 'WARNING' | 'CAUTION' | 'ADVISORY'
  code: string
  message: string
  remediation: string
}

export interface MissionPlanSummaryDTO {
  mission_id: string
  title: string
  start_location: { lat: number; lon: number; name?: string }
  destination_location: { lat: number; lon: number; name?: string }
  selected_route_profile: string
  one_way_distance_km: number
  round_trip_distance_km: number
  timeline: EVATimelineDTO
  consumables: ConsumablesBudgetDTO
  warnings: MissionFeasibilityWarningDTO[]
  is_feasible: boolean
  epistemic_class: string
  assumptions_used: Record<string, unknown>
  disclaimer: string
}

export interface MissionPlanResponse {
  mission: MissionPlanSummaryDTO
  route_feature: RouteFeature
}

export interface MissionCompareResponse {
  profiles: Record<
    string,
    {
      mission_summary: MissionPlanSummaryDTO
      route_feature: RouteFeature
    }
  >
}

export async function fetchDefaultAssumptions(): Promise<MissionPlanningAssumptionsDTO> {
  const res = await fetch('/api/v1/mission/default-assumptions')
  if (!res.ok) {
    throw new Error(`Failed to load default mission assumptions: ${res.statusText}`)
  }
  return res.json() as Promise<MissionPlanningAssumptionsDTO>
}

export async function planEVAMission(
  start: LatLon,
  destination: LatLon,
  profile: string = 'BALANCED',
  scienceStopsCount: number = 2,
  isRoundTrip: boolean = true,
  crewAssumptions?: Partial<CrewAssumptionsDTO>,
  equipmentAssumptions?: Partial<EquipmentAssumptionsDTO>,
  timelineAssumptions?: Partial<TimelineAssumptionsDTO>,
  algorithm: string = 'astar',
  simplify: boolean = true,
): Promise<MissionPlanResponse> {
  const payload = {
    start,
    destination,
    profile,
    science_stops_count: scienceStopsCount,
    is_round_trip: isRoundTrip,
    crew_assumptions: crewAssumptions,
    equipment_assumptions: equipmentAssumptions,
    timeline_assumptions: timelineAssumptions,
    algorithm,
    simplify,
  }
  const res = await fetch('/api/v1/mission/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errorBody.detail || `Mission planning failed: ${res.statusText}`)
  }
  return res.json() as Promise<MissionPlanResponse>
}

export async function compareMissionProfiles(
  start: LatLon,
  destination: LatLon,
  scienceStopsCount: number = 2,
  isRoundTrip: boolean = true,
  algorithm: string = 'astar',
  simplify: boolean = true,
): Promise<MissionCompareResponse> {
  const payload = {
    start,
    destination,
    science_stops_count: scienceStopsCount,
    is_round_trip: isRoundTrip,
    algorithm,
    simplify,
  }
  const res = await fetch('/api/v1/mission/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errorBody.detail || `Mission profile comparison failed: ${res.statusText}`)
  }
  return res.json() as Promise<MissionCompareResponse>
}
