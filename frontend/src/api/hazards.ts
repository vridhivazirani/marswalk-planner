export interface EvidenceDimensionsDTO {
  terrain_derivative_reliability?: number | null
  optical_imagery_reliability?: number | null
  spatial_resolution_adequacy?: number | null
  source_coverage?: string
  optical_imagery_source?: string
  detector_applicability?: string[]
  unresolved_evidence?: string[]
  unquantified_uncertainty_components?: string[]
  calibration_status?: string
}

export interface LocationHazardInspection {
  coordinate: { lat: number; lon: number }
  status?: string
  elevation_m?: number | null
  is_passable: boolean
  hard_restriction_code: string | null
  hard_restriction_codes?: string[]
  hazard_classification?: string
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
  confidence?: number | null
  legacy_confidence_deprecated?: boolean
  data_reliability_index?: number | null
  data_reliability_level?: string
  detection_reliability_index?: number | null
  detection_reliability_level?: string
  nominal_vertical_precision_m?: number | null
  uncertainty_precision_status?: string
  evidence_dimensions?: EvidenceDimensionsDTO
  property_epistemic_classes?: Record<string, string>
  data_confidence?: number | null
  data_confidence_level?: string
  detection_confidence?: number | null
  detection_confidence_level?: string
  spatial_uncertainty_m?: number | null
  resolution_class?: string
  epistemic_class?: string
  uncertainty_profile?: {
    coordinate: { lat: number; lon: number }
    source_dataset: string
    resolution_class: string
    data_reliability_index: number | null
    data_reliability_level: string
    detection_reliability_index: number | null
    detection_reliability_level: string
    nominal_vertical_precision_m: number | null
    precision_tier_label: string
    uncertainty_precision_status: string
    evidence_dimensions?: EvidenceDimensionsDTO
    property_epistemic_classes?: Record<string, string>
    data_confidence_score?: number | null
    data_confidence_level?: string
    detection_confidence_score?: number | null
    detection_confidence_level?: string
    spatial_uncertainty_m?: number | null
    epistemic_class: string
    is_unknown: boolean
    hazard_classification: string
    restriction_codes: string[]
    reasoning: string
  }
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

