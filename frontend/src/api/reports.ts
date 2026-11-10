/**
 * Mission Report compilation utilities.
 */

import type { RouteFeature } from './routing'
import type { DynamicReroutePlanDTO } from './emergency'
import type { CandidateTargetFeature } from './science'

export interface MissionReportData {
  reportId: string
  generatedAt: string
  missionTitle: string
  crewCount: number
  startCoordinate: { lat: number; lon: number }
  destCoordinate: { lat: number; lon: number }
  profileName: string
  activeRoute: RouteFeature | null
  emergencyPlan: DynamicReroutePlanDTO | null
  selectedTarget: CandidateTargetFeature | null
  disclaimer: string
}

export function generateMarkdownReport(data: MissionReportData): string {
  const r = data.activeRoute
  const em = data.emergencyPlan
  const t = data.selectedTarget

  return `# MARSWALK PLANNER — MISSION BRIEFING REPORT
**Report ID:** ${data.reportId}  
**Generated At:** ${data.generatedAt}  
**Study Region:** Jezero Crater Western Delta, Mars (IAU_2015:49900)  
**Classification:** Research Decision-Support Prototype / Epistemic: HEURISTIC & SIMULATED  

---

## 1. Executive Mission Summary
- **Mission Name:** ${data.missionTitle}
- **Planned Traversal Profile:** ${data.profileName}
- **Crew Allocation:** ${data.crewCount} Astronauts
- **Base Camp Coordinate:** ${data.startCoordinate.lat.toFixed(5)}°N, ${data.startCoordinate.lon.toFixed(5)}°E
- **Sortie Destination:** ${data.destCoordinate.lat.toFixed(5)}°N, ${data.destCoordinate.lon.toFixed(5)}°E
${t ? `- **Primary Science Target:** #${t.properties.rank}: ${t.properties.name} (${t.properties.primary_science_theme})` : ''}

---

## 2. Planned Traversal Telemetry
${
  r
    ? `
- **Total Route Distance:** ${(r.properties.metrics.total_distance_m / 1000).toFixed(2)} km
- **Estimated Traversal Duration:** ${r.properties.metrics.estimated_duration_minutes.toFixed(0)} minutes
- **Accumulated Path Cost:** ${r.properties.metrics.accumulated_cost.toFixed(1)}
- **Mean Hazard Exposure:** ${(r.properties.metrics.mean_hazard_exposure * 100).toFixed(1)}%
- **Mean Topographic Uncertainty:** ${r.properties.metrics.mean_uncertainty_exposure.toFixed(2)} m
- **Science Return Score:** ${r.properties.metrics.accumulated_science_opportunity.toFixed(1)}
- **Restricted Cells Crossed:** ${r.properties.metrics.restricted_cells_crossed} (Strict Obstacle Avoidance)
`
    : '_No active route planned._'
}

---

## 3. In-Situ Emergency & Contingency Simulation
${
  em
    ? `
- **Contingency Status:** ${em.is_feasible ? (em.is_return_to_base ? 'RETURN-TO-BASE SORTIE' : 'DYNAMIC DETOUR ACTIVE') : 'INACCESSIBLE (ABORT REQUIRED)'}
- **Injected Incident:** ${em.hazard_event.title} (${em.hazard_event.hazard_type})
- **Impact Summary:** ${em.impact.impact_summary}
- **Distance Delta (Δ):** ${(em.metrics_delta.distance_delta_m / 1000).toFixed(2)} km
- **Duration Delta (Δ):** ${em.metrics_delta.duration_delta_minutes.toFixed(1)} min
- **Oxygen Consumed Delta (Δ):** ${em.metrics_delta.o2_consumption_delta_g.toFixed(1)} g per crew
- **Battery Energy Delta (Δ):** ${em.metrics_delta.battery_consumption_delta_wh.toFixed(1)} Wh
- **Tactical Rationale:** ${em.reasoning}
`
    : '_No simulated contingency active; baseline route remains nominal._'
}

---

## 4. Mandatory Safety Disclaimer
> ${data.disclaimer}
`
}

