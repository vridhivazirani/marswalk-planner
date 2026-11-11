/**
 * Typed API client for Marswalk Advanced Terrain Intelligence (Phase 2).
 * Strictly preserves coordinate reference systems (IAU_2015:49900 planetocentric)
 * and epistemic classifications.
 */

export interface TerrainClassDetail {
  id: number
  name: string
  code: string
  description: string
  traversability: string
  speed_factor: number
  hazard_risk: string
  color_hex: string
}

export interface TerrainClassesResponse {
  classes: TerrainClassDetail[]
  class_names: Record<string, string>
  count: number
  epistemic_class: string
}

export interface TerrainLayerCatalogItem {
  id: string
  name: string
  file: string
  resolution_m: number
  data_type: string
  unit: string
  epistemic_class: string
  method: string
  description: string
  has_visualization: boolean
  visualization_url: string | null
}

export interface TerrainLayersCatalogResponse {
  dataset_id: string
  name: string
  study_area: string
  projection: {
    geographic_crs: string
    projected_crs: string
    resolution_m: number
    grid_dimensions: { width: number; height: number }
  }
  high_res_coverage_percent: number
  layers: Record<string, TerrainLayerCatalogItem>
  classes: Record<string, TerrainClassDetail>
}

export interface LayerStatItem {
  layer_id: string
  name: string
  units: string
  min_val: number | null
  max_val: number | null
  mean_val: number | null
  method: string
  source_layer: string
  epistemic_class: string
}

export interface BoulderCandidateSummary {
  candidate_count_pixels: number
  mean_score_on_candidates: number
  max_score: number
  sun_azimuth_deg: number
  method: string
  epistemic_class: string
}

export interface TerrainStatisticsResponse {
  grid_name: string
  total_analyzed_cells: number
  layers: Record<string, LayerStatItem>
  class_distribution: Record<string, number>
  boulder_candidate_summary?: BoulderCandidateSummary
}

export interface CandidateBoulderObject {
  candidate_id: string
  row: number
  col: number
  area_pixels: number
  estimated_diameter_m: number
  score: number
  bbox: [number, number, number, number]
}

export interface Local1mMicroAnalysis {
  is_available: boolean
  message?: string
  window_radius_m: number
  window_size_pixels: [number, number]
  native_resolution_m: number
  elevation: {
    center_m: number
    min_m: number
    max_m: number
    mean_m: number
    local_relief_m: number
  }
  metrics_1m: {
    slope_deg: { mean: number | null; max: number | null; p90: number | null }
    tri_roughness_m: { mean: number | null; max: number | null }
    surface_roughness_m: { mean: number | null }
    local_relief_m: { mean: number | null }
    vector_ruggedness_measure: { mean: number | null }
    curvatures_1_per_m: {
      profile_mean: number
      planform_mean: number
      mean_curvature: number
    }
  }
  candidate_boulders: {
    total_candidate_cells: number
    discrete_objects_found: number
    top_candidates: CandidateBoulderObject[]
  }
  transects_1m: {
    west_to_east_elev_m: number[]
    south_to_north_elev_m: number[]
    sample_step_m: number
  }
  epistemic: {
    elevation: string
    derivatives: string
    boulders: string
  }
}

export interface MultiResInspectResult {
  coordinate: {
    lat: number
    lon: number
    projected_x_m: number
    projected_y_m: number
    crs_geographic: string
    crs_projected: string
  }
  high_resolution_available: boolean
  regional_analysis_20m: {
    is_valid: boolean
    reason?: string
    elevation_m: number | null
    slope_deg: number | null
    tri_m: number | null
    terrain_class?: TerrainClassDetail
    confidence_score?: number
    source_product?: string
    source_resolution_m?: number
    cell_size_m?: number
  }
  local_micro_analysis_1m: Local1mMicroAnalysis | null
  provenance_and_metadata: {
    regional_source: string
    high_res_source: string
    resampling_policy: string
    disclaimer: string
  }
}

export async function fetchTerrainClasses(): Promise<TerrainClassesResponse> {
  const res = await fetch('/api/v1/terrain/classes')
  if (!res.ok) {
    throw new Error(`Failed to fetch terrain classes: ${res.statusText}`)
  }
  return res.json() as Promise<TerrainClassesResponse>
}

export async function fetchTerrainLayers(): Promise<TerrainLayersCatalogResponse> {
  const res = await fetch('/api/v1/terrain/layers')
  if (!res.ok) {
    throw new Error(`Failed to fetch terrain layers catalog: ${res.statusText}`)
  }
  return res.json() as Promise<TerrainLayersCatalogResponse>
}

export async function fetchTerrainStatistics(): Promise<TerrainStatisticsResponse> {
  const res = await fetch('/api/v1/terrain/statistics')
  if (!res.ok) {
    throw new Error(`Failed to fetch terrain statistics: ${res.statusText}`)
  }
  return res.json() as Promise<TerrainStatisticsResponse>
}

export async function inspectTerrainPoint(
  lat: number,
  lon: number,
  includeLocal1m: boolean = true,
  windowRadiusM: number = 60.0,
): Promise<MultiResInspectResult> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    include_local_1m: includeLocal1m.toString(),
    window_radius_m: windowRadiusM.toString(),
  })
  const res = await fetch(`/api/v1/terrain/inspect?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to inspect coordinate (${lat}, ${lon}): ${res.statusText}`)
  }
  return res.json() as Promise<MultiResInspectResult>
}

export function getTerrainRasterUrl(layerId: string): string {
  return `/api/v1/terrain/raster/${layerId}.png`
}

export interface TransectPoint {
  sample_index: number
  distance_m: number
  distance_km: number
  lat: number
  lon: number
  elevation_m: number | null
  slope_deg: number | null
  terrain_class_id: number | null
  terrain_class_name: string
  has_hirise_coverage: boolean
}

export interface TerrainTransectSummary {
  start: { lat: number; lon: number }
  destination: { lat: number; lon: number }
  total_distance_m: number
  total_distance_km: number
  elevation_gain_m: number
  elevation_loss_m: number
  min_elevation_m: number | null
  max_elevation_m: number | null
  max_slope_deg: number | null
  mean_slope_deg: number | null
  hirise_fraction: number
}

export interface TerrainTransectResponse {
  transect_summary: TerrainTransectSummary
  points: TransectPoint[]
  datum: string
  crs: string
  epistemic_class: string
}

export async function fetchTerrainTransectProfile(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number,
  numSamples: number = 100,
): Promise<TerrainTransectResponse> {
  const res = await fetch('/api/v1/terrain/transect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_lat: startLat,
      start_lon: startLon,
      dest_lat: destLat,
      dest_lon: destLon,
      num_samples: numSamples,
    }),
  })
  if (!res.ok) {
    throw new Error(`Failed to compute terrain transect: ${res.statusText}`)
  }
  return res.json() as Promise<TerrainTransectResponse>
}

export interface BoulderCandidateDTO {
  candidate_id: string
  row: number
  col: number
  estimated_diameter_m: number
  shadow_length_m: number
  estimated_height_m: number
  confidence_score: number
  sun_azimuth_deg: number
  sun_elevation_deg: number
  epistemic_class: string
}

export interface DuneCrestSegmentDTO {
  segment_id: string
  center_row: number
  center_col: number
  length_m: number
  orientation_deg: number
  crest_sharpness: number
  estimated_slipface_aspect_deg: number
  epistemic_class: string
}

export interface CraterCandidateDTO {
  candidate_id: string
  center_row: number
  center_col: number
  radius_m: number
  depth_m: number
  rim_height_m: number
  depth_to_diameter_ratio: number
  circularity: number
  confidence_score: number
  epistemic_class: string
}

export interface CVCandidatesResponse {
  boulder_candidates: BoulderCandidateDTO[]
  dune_crest_segments: DuneCrestSegmentDTO[]
  crater_candidates: CraterCandidateDTO[]
  counts: {
    boulders: number
    dune_segments: number
    craters: number
  }
  methods: {
    boulder_height: string
    dune_ridges: string
    crater_depressions: string
  }
  epistemic_class: string
}

export async function fetchCVCandidates(limit = 50): Promise<CVCandidatesResponse> {
  const res = await fetch(`/api/v1/terrain/cv/candidates?limit=${limit}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch CV candidates: ${res.statusText}`)
  }
  return res.json() as Promise<CVCandidatesResponse>
}

