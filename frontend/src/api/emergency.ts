/**
 * TypeScript API client and interfaces for Marswalk Emergency Response and Dynamic Rerouting Engine.
 */

import type { RouteFeature } from './routing'

export interface SimulatedHazardDTO {
  event_id: string
  hazard_type: string
  title: string
  description: string
  center_lat: number
  center_lon: number
  radius_m: number
  is_hard_restriction: boolean
  cost_multiplier: number
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE'
  epistemic_class: string
  created_at_ltst: string
  disclaimer: string
}

export interface HazardImpactDTO {
  is_route_affected: boolean
  affected_waypoints_count: number
  total_waypoints_count: number
  first_affected_km: number | null
  last_affected_km: number | null
  affected_segment_length_m: number
  destination_blocked: boolean
  crew_in_hazard_zone: boolean
  impact_summary: string
  epistemic_class: string
}

export interface EmergencyMetricsDeltaDTO {
  distance_delta_m: number
  duration_delta_minutes: number
  cost_delta: number
  hazard_exposure_delta: number
  timeline_delta_minutes: number
  o2_consumption_delta_g: number
  battery_consumption_delta_wh: number
}

export interface DynamicReroutePlanDTO {
  event_id: string
  original_route: RouteFeature
  rerouted_route: RouteFeature | null
  is_feasible: boolean
  is_return_to_base: boolean
  crew_location: { lat: number; lon: number }
  hazard_event: SimulatedHazardDTO
  impact: HazardImpactDTO
  reasoning: string
  metrics_delta: EmergencyMetricsDeltaDTO
  mission_warnings: Array<{
    severity: string
    code: string
    message: string
    remediation: string
  }>
  epistemic_class: string
  disclaimer: string
  geojson: {
    type: 'FeatureCollection'
    features: Array<{
      type: 'Feature'
      id: string
      properties: Record<string, unknown>
      geometry: {
        type: string
        coordinates: unknown
      }
    }>
  }
}

export interface EmergencySimulationRequestDTO {
  start_lat: number
  start_lon: number
  dest_lat: number
  dest_lon: number
  profile_name?: string
  crew_progress_pct?: number
  custom_crew_lat?: number
  custom_crew_lon?: number
  scenario_id?: string
  custom_hazard?: Partial<SimulatedHazardDTO>
}

/**
 * Fetch the 6 authentic curated emergency contingency scenarios.
 */
export async function fetchCuratedEmergencyScenarios(): Promise<SimulatedHazardDTO[]> {
  const res = await fetch('/api/v1/emergency/scenarios')
  if (!res.ok) {
    throw new Error(`Failed to load emergency scenarios: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Simulate a hazard incident and calculate dynamic reroute or mission replan.
 */
export async function simulateEmergencyIncident(
  req: EmergencySimulationRequestDTO,
): Promise<DynamicReroutePlanDTO> {
  const res = await fetch('/api/v1/emergency/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Emergency simulation failed: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Execute immediate emergency return-to-base abort from current crew location.
 */
export async function abortEmergencyToBase(
  startLat: number,
  startLon: number,
  crewLat: number,
  crewLon: number,
): Promise<DynamicReroutePlanDTO> {
  const res = await fetch('/api/v1/emergency/abort-to-base', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_lat: startLat,
      start_lon: startLon,
      crew_lat: crewLat,
      crew_lon: crewLon,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Emergency abort failed: ${res.statusText}`)
  }
  return res.json()
}

