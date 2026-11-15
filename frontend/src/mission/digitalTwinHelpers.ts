import type { CostmapInspectionResponse } from '../api/costmap.ts'
import type { LocationHazardInspection } from '../api/hazards.ts'
import type { CandidateTargetFeature, ScienceInspectionResponse } from '../api/science.ts'
import type { MultiResInspectResult } from '../api/terrain.ts'
import type {
  EpistemicClassTag,
  MarsCoordinate,
  MissionObservationCategory,
  MissionObservationRecord,
  MissionScienceTargetRef,
  MissionSortieWaypoint,
} from '../types/mission.ts'
import { normalizeCoordinate, normalizeEastLon } from './missionModel.ts'

export { normalizeEastLon }

export const CV_SYNTHETIC_DEMO_DISCLOSURE =
  'SYNTHETIC_DEMO_WINDOW: These CV candidates are computed on an illustrative 100×100 synthetic test patch (terrain.py /cv/candidates) to demonstrate detector math — they are NOT observed detections on real Jezero HiRISE imagery.'

export const CANONICAL_MARS_CRS = 'IAU_2015:49900'
export const SCIENCE_TARGETS_DATASET_ID = 'jezero_western_delta_20m_science_targets.json'
export const SCIENCE_TARGETS_PROVENANCE =
  'Jezero Western Delta Ranked Target Catalog (IAU_2015:49900)'

const VALID_EPISTEMIC_CLASSES = new Set<EpistemicClassTag>([
  'OBSERVED',
  'DERIVED',
  'INTERPRETED',
  'PREDICTED',
  'HEURISTIC',
  'SIMULATED',
  'UNKNOWN',
])

export function toEpistemicClassTag(value: string | undefined | null): EpistemicClassTag {
  const upper = (value ?? '').trim().toUpperCase() as EpistemicClassTag
  return VALID_EPISTEMIC_CLASSES.has(upper) ? upper : 'UNKNOWN'
}

export function normalizeMarsCoordinate(coord: MarsCoordinate): MarsCoordinate {
  return normalizeCoordinate(coord)
}

export function coordinatesApproximatelyEqual(
  a: MarsCoordinate,
  b: MarsCoordinate,
  toleranceDeg: number = 1e-5,
): boolean {
  const lonA = normalizeEastLon(a.lon)
  const lonB = normalizeEastLon(b.lon)
  if (!Number.isFinite(lonA) || !Number.isFinite(lonB)) return false
  return Math.abs(a.lat - b.lat) <= toleranceDeg && Math.abs(lonA - lonB) <= toleranceDeg
}

/**
 * Verify a coordinate lies inside an explicit lat/lon bounding box.
 * Fails closed (false) if bounds are missing or undefined.
 */
export function isInsideBounds(
  coord: MarsCoordinate,
  bounds?: [[number, number], [number, number]] | null,
): boolean {
  if (!bounds) return false
  const [[latMin, lonMin], [latMax, lonMax]] = bounds
  const lon = normalizeEastLon(coord.lon)
  return (
    Number.isFinite(coord.lat) &&
    Number.isFinite(lon) &&
    coord.lat >= latMin &&
    coord.lat <= latMax &&
    lon >= lonMin &&
    lon <= lonMax
  )
}

export function formatMarsCoordinate(coord: MarsCoordinate, digits: number = 5): string {
  const normLon = normalizeEastLon(coord.lon)
  const eps = 0.5 * Math.pow(10, -digits)
  const safeLat = Math.abs(coord.lat) < eps ? 0 : coord.lat
  const safeLon = Math.abs(normLon) < eps ? 0 : normLon
  const latHem = safeLat < 0 ? 'S' : 'N'
  const lonHem = safeLon < 0 ? 'W' : 'E'
  return `${Math.abs(safeLat).toFixed(digits)}°${latHem}, ${Math.abs(safeLon).toFixed(digits)}°${lonHem}`
}

export interface HazardInspectionSummary {
  isOutOfBounds: boolean
  hasMissingElevationOrNoData: boolean
  isUnresolvedResolutionOnly: boolean
  isPassable: boolean
  canPlaceEvaPoint: boolean
  statusBadgeLabel: string
  epistemicClass: EpistemicClassTag
  propertyEpistemicSummary: string
  elevationLabel: string
  overallHazardLabel: string
  slopeHazardLabel: string
  roughnessHazardLabel: string
  boulderHazardLabel: string
  sandHazardLabel: string
  dataReliabilityLabel: string
  detectionReliabilityLabel: string
  verticalPrecisionLabel: string
  sourceLabel: string
  resolutionClassLabel: string
  costSummaryLabel: string
  scienceScoreLabel: string
  restrictionCodes: string[]
  explanationText: string
}

function formatPctOrUnknown(val: number | undefined | null, blockedUnknown: boolean): string {
  if (blockedUnknown || val === undefined || val === null || !Number.isFinite(val) || val < 0) {
    return 'UNKNOWN (NoData)'
  }
  return `${(val * 100).toFixed(0)}%`
}

export function summarizeHazardInspection(
  hazard: LocationHazardInspection | null,
  cost?: CostmapInspectionResponse | null,
  terrain?: MultiResInspectResult | null,
  science?: ScienceInspectionResponse | null,
): HazardInspectionSummary | null {
  if (!hazard) return null

  const codes = new Set<string>(hazard.hard_restriction_codes ?? [])
  if (hazard.hard_restriction_code) {
    for (const part of hazard.hard_restriction_code.split('+')) {
      if (part) codes.add(part)
    }
  }

  const isOutOfBounds = hazard.status === 'OUT_OF_BOUNDS' || codes.has('OUT_OF_STUDY_AREA')
  const elev = hazard.elevation_m
  const hasMissingElevation = elev === undefined || elev === null || !Number.isFinite(elev) || elev <= -9000
  const isNoData =
    isOutOfBounds ||
    codes.has('NO_DATA_UNKNOWN') ||
    hazard.uncertainty_profile?.is_unknown === true ||
    hasMissingElevation

  const isUnresolvedResolutionOnly = codes.has('UNRESOLVED_RESOLUTION_HAZARD')
  const isPassable = !isNoData && Boolean(hazard.is_passable) && !(cost?.is_blocked ?? false)
  const canPlaceEvaPoint = !isOutOfBounds && !codes.has('NO_DATA_UNKNOWN') && !hasMissingElevation

  let statusBadgeLabel = 'PASSABLE TERRAIN'
  if (isOutOfBounds) {
    statusBadgeLabel = 'OUT OF BOUNDS — UNMAPPED (IMPASSABLE BY DEFAULT)'
  } else if (codes.has('NO_DATA_UNKNOWN') || hasMissingElevation) {
    statusBadgeLabel = 'NO DATA / UNKNOWN — IMPASSABLE BY DEFAULT'
  } else if (!isPassable) {
    statusBadgeLabel = `IMPASSABLE (${Array.from(codes).join(' + ') || 'HARD_RESTRICTION'})`
  }

  const epistemicClass = toEpistemicClassTag(
    isOutOfBounds ? 'UNKNOWN' : (hazard.epistemic_class ?? hazard.uncertainty_profile?.epistemic_class),
  )

  const propEntries = Object.entries(hazard.property_epistemic_classes ?? {})
  const propertyEpistemicSummary =
    propEntries.length > 0
      ? propEntries.map(([k, v]) => `${k}:${v}`).join(' · ')
      : `Overall: ${epistemicClass}`

  const dataRel = hazard.data_reliability_index ?? hazard.data_confidence
  const dataRelLvl = hazard.data_reliability_level ?? hazard.data_confidence_level ?? 'UNVERIFIED'
  const detRel = hazard.detection_reliability_index ?? hazard.detection_confidence
  const detRelLvl =
    hazard.detection_reliability_level ?? hazard.detection_confidence_level ?? 'UNVERIFIED'
  const nomPrec = hazard.nominal_vertical_precision_m ?? hazard.spatial_uncertainty_m

  const elevText = hasMissingElevation
    ? 'UNMAPPED (NoData)'
    : `${elev.toFixed(1)} m (Mars Areoid)`

  const slopeDegText =
    !isNoData &&
    terrain?.regional_analysis_20m?.is_valid &&
    terrain.regional_analysis_20m.slope_deg !== null
      ? ` (${terrain.regional_analysis_20m.slope_deg.toFixed(1)}°)`
      : ''

  const triText =
    !isNoData &&
    terrain?.regional_analysis_20m?.is_valid &&
    terrain.regional_analysis_20m.tri_m !== null
      ? ` (TRI ${terrain.regional_analysis_20m.tri_m.toFixed(2)} m)`
      : ''

  const overallHazardLabel = isNoData
    ? 'UNKNOWN (Missing Data — Never Assumed Safe)'
    : hazard.overall_hazard_score !== undefined && Number.isFinite(hazard.overall_hazard_score)
      ? `${(hazard.overall_hazard_score * 100).toFixed(0)}%`
      : 'UNKNOWN'

  const costSummaryLabel = isOutOfBounds
    ? 'OUT OF BOUNDS (BLOCKED)'
    : !cost
      ? 'Not queried'
      : cost.is_blocked || cost.combined_cost === null || cost.combined_cost === undefined
        ? `HARD BLOCKED (${cost.mission_profile})`
        : `${cost.combined_cost.toFixed(2)}x multiplier (${cost.mission_profile})`

  const scienceScoreLabel =
    isOutOfBounds || !science || !Number.isFinite(science.composite_opportunity_score)
      ? isOutOfBounds
        ? 'OUT OF BOUNDS'
        : 'Unavailable'
      : `${(science.composite_opportunity_score * 100).toFixed(1)}% (${science.epistemic_class})`

  return {
    isOutOfBounds,
    hasMissingElevationOrNoData: isNoData,
    isUnresolvedResolutionOnly,
    isPassable,
    canPlaceEvaPoint,
    statusBadgeLabel,
    epistemicClass,
    propertyEpistemicSummary,
    elevationLabel: elevText,
    overallHazardLabel,
    slopeHazardLabel: `${formatPctOrUnknown(hazard.individual_hazards?.slope_hazard, isNoData)}${slopeDegText}`,
    roughnessHazardLabel: `${formatPctOrUnknown(hazard.individual_hazards?.roughness_hazard, isNoData)}${triText}`,
    boulderHazardLabel: formatPctOrUnknown(hazard.individual_hazards?.boulder_hazard, isNoData),
    sandHazardLabel: formatPctOrUnknown(hazard.individual_hazards?.sand_hazard, isNoData),
    dataReliabilityLabel:
      !isNoData && dataRel !== null && dataRel !== undefined && Number.isFinite(dataRel)
        ? `${dataRel.toFixed(2)} [${dataRelLvl}] (uncalibrated ordinal index)`
        : 'UNKNOWN / UNMAPPED',
    detectionReliabilityLabel:
      !isNoData && detRel !== null && detRel !== undefined && Number.isFinite(detRel)
        ? `${detRel.toFixed(2)} [${detRelLvl}] (uncalibrated ordinal index)`
        : 'UNKNOWN / UNMAPPED',
    verticalPrecisionLabel:
      !isNoData && nomPrec !== null && nomPrec !== undefined && Number.isFinite(nomPrec)
        ? `${nomPrec.toFixed(2)} m nominal tier (${hazard.uncertainty_precision_status ?? 'PROVISIONAL_UNVERIFIED'})`
        : 'UNKNOWN (not calibrated ±1σ)',
    sourceLabel: isOutOfBounds
      ? 'Outside Jezero Western Delta Raster Coverage'
      : (hazard.epistemic_source ??
          hazard.evidence_dimensions?.source_coverage ??
          'Unknown Source'),
    resolutionClassLabel: isOutOfBounds
      ? 'UNMAPPED'
      : (hazard.resolution_class ?? 'UNKNOWN'),
    costSummaryLabel,
    scienceScoreLabel,
    restrictionCodes: Array.from(codes),
    explanationText: hazard.explanation || 'No explanation provided by inspection service.',
  }
}

export function featureToMissionTargetRef(
  feature: CandidateTargetFeature,
  regionId: string = 'reg-jezero',
  activeMissionRegionId?: string | null,
): MissionScienceTargetRef {
  const [lon, lat, elev] = feature.geometry.coordinates
  const trimmedActive = activeMissionRegionId?.trim()
  return {
    targetId: feature.properties.target_id,
    name: feature.properties.name,
    coordinate: normalizeMarsCoordinate({ lat, lon }),
    regionId,
    ...(trimmedActive && trimmedActive !== regionId ? { activeMissionRegionId: trimmedActive } : {}),
    coordinateRef: CANONICAL_MARS_CRS,
    elevationM: Number.isFinite(elev) ? elev : null,
    primaryTheme: feature.properties.primary_science_theme,
    compositeScore: feature.properties.composite_score,
    epistemicClass: toEpistemicClassTag(feature.properties.epistemic_class),
    sourceDataset: SCIENCE_TARGETS_DATASET_ID,
    provenance: SCIENCE_TARGETS_PROVENANCE,
  }
}

export function featureToSortieWaypoint(
  feature: CandidateTargetFeature,
  regionId: string = 'reg-jezero',
  notes?: string | null,
): MissionSortieWaypoint {
  const [lon, lat, elev] = feature.geometry.coordinates
  const normalized = normalizeMarsCoordinate({ lat, lon })
  const trimmedNote = notes?.trim()
  return {
    id: feature.properties.target_id,
    lat: normalized.lat,
    lon: normalized.lon,
    name: feature.properties.name,
    regionId,
    coordinateRef: CANONICAL_MARS_CRS,
    elevationM: Number.isFinite(elev) ? elev : null,
    primaryTheme: feature.properties.primary_science_theme,
    compositeScore: feature.properties.composite_score,
    epistemicClass: toEpistemicClassTag(feature.properties.epistemic_class),
    sourceDataset: SCIENCE_TARGETS_DATASET_ID,
    provenance: SCIENCE_TARGETS_PROVENANCE,
    ...(trimmedNote ? { notes: trimmedNote } : {}),
  }
}

export function buildObservationFromInspection(params: {
  id?: string
  coordinate: MarsCoordinate
  category: MissionObservationCategory
  label: string
  note?: string
  regionId: string
  hazard: LocationHazardInspection | null
  target?: CandidateTargetFeature | null
  sourceDataset?: string | null
  recordedAt?: string
}): MissionObservationRecord {
  const coord = normalizeMarsCoordinate(params.coordinate)
  const trimmedNote = params.note?.trim() ?? ''
  const userNote = trimmedNote.length > 0 ? trimmedNote : null

  const derivedParts: string[] = []
  let hazSummary: HazardInspectionSummary | null = null

  if (params.target) {
    derivedParts.push(
      `Target ${params.target.properties.target_id} (${params.target.properties.primary_science_theme}, score ${(params.target.properties.composite_score * 100).toFixed(1)}%)`,
    )
  }
  if (params.hazard) {
    hazSummary = summarizeHazardInspection(params.hazard)
    if (hazSummary) {
      derivedParts.push(
        `Elev: ${hazSummary.elevationLabel} | Source: ${hazSummary.sourceLabel} | Passability: ${hazSummary.statusBadgeLabel}`,
      )
    }
  }

  const derivedSummary = derivedParts.length > 0 ? derivedParts.join(' | ') : null
  const epistemicClass: EpistemicClassTag = params.target
    ? toEpistemicClassTag(params.target.properties.epistemic_class)
    : params.hazard
      ? toEpistemicClassTag(
          params.hazard.status === 'OUT_OF_BOUNDS'
            ? 'UNKNOWN'
            : params.hazard.epistemic_class,
        )
      : 'UNKNOWN'

  const resolvedSourceDataset =
    params.sourceDataset ??
    (params.target
      ? SCIENCE_TARGETS_DATASET_ID
      : hazSummary && !hazSummary.isOutOfBounds && !hazSummary.hasMissingElevationOrNoData
        ? hazSummary.sourceLabel
        : null)

  const resolvedProvenance = params.target
    ? SCIENCE_TARGETS_PROVENANCE
    : params.hazard
      ? hazSummary?.isOutOfBounds
        ? 'Outside Jezero Digital Twin Study Footprint (fail-closed)'
        : `${hazSummary?.sourceLabel ?? 'Unknown'} (${hazSummary?.resolutionClassLabel ?? 'UNKNOWN'})`
      : null

  const summary =
    userNote && derivedSummary
      ? `${userNote} — [${params.regionId}] ${derivedSummary}`
      : userNote
        ? `${userNote} — [${params.regionId}] ${formatMarsCoordinate(coord)} (No inspection telemetry)`
        : derivedSummary
          ? `[${params.regionId}] ${derivedSummary}`
          : `[${params.regionId}] Coord: ${formatMarsCoordinate(coord)} (Uninspected / UNKNOWN)`

  const timestamp = params.recordedAt ?? new Date().toISOString()
  return {
    id: params.id ?? `obs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    category: params.category,
    label: params.label.trim() || `Observation @ ${formatMarsCoordinate(coord, 3)}`,
    coordinate: coord,
    summary,
    userNote,
    derivedSummary,
    regionId: params.regionId,
    sourceDataset: resolvedSourceDataset,
    provenance: resolvedProvenance,
    targetId: params.target?.properties.target_id ?? null,
    hazardClassification: params.hazard?.hazard_classification ?? null,
    resolutionClass: params.hazard ? (hazSummary?.resolutionClassLabel ?? null) : null,
    epistemicClass,
    recordedAt: timestamp,
  }
}

export interface CoordinateOverwriteCheck {
  role: 'baseCamp' | 'destination'
  willOverwrite: boolean
  existingCoordinate: MarsCoordinate | null
  proposedCoordinate: MarsCoordinate
}

export function checkCoordinateOverwrite(
  role: 'baseCamp' | 'destination',
  existingCoordinate: MarsCoordinate | null,
  proposedCoordinate: MarsCoordinate,
): CoordinateOverwriteCheck {
  const normProposed = normalizeMarsCoordinate(proposedCoordinate)
  if (!existingCoordinate) {
    return {
      role,
      willOverwrite: false,
      existingCoordinate: null,
      proposedCoordinate: normProposed,
    }
  }
  const same = coordinatesApproximatelyEqual(existingCoordinate, normProposed, 1e-5)
  return {
    role,
    willOverwrite: !same,
    existingCoordinate,
    proposedCoordinate: normProposed,
  }
}
