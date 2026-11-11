/**
 * Typed API client for Marswalk Planetary Exploration Atlas (Phase 1).
 * Supports querying the 11-category planetary map catalogue, filtering, and layer metadata.
 */

export type ProductTypeCode = 'SRC' | 'DRV' | 'VEC' | 'INT' | 'SIM'
export type ValidationStatusCode =
  | 'VERIFIED_LOCAL'
  | 'VERIFIED_REMOTE_WMS'
  | 'VERIFIED_REMOTE_WMTS'
  | 'VERIFIED_ARCHIVE'
  | 'CATALOGUED'

export interface AtlasCategorySummary {
  id: string
  title: string
  description: string
  icon: string
  count: number
}

export interface AtlasMapEntry {
  id: string
  canonical_id: string
  name: string
  category: string
  category_name: string
  category_icon: string
  product_type: ProductTypeCode
  epistemic_class: string
  instrument_mission: string
  mission_instrument?: string
  source_organisation: string
  source: string
  product_identifier: string
  doi_or_url: string
  original_spatial_resolution: string
  resolution: string
  processing_resolution: string
  spatial_coverage: string
  coverage: string
  coverage_bounds: [[number, number], [number, number]]
  crs: string
  native_crs?: string
  processing_crs?: string
  display_crs?: string
  vertical_datum: string
  processing_history: string
  processing_status: string
  licence_attribution: string
  validation_status: ValidationStatusCode | string
  known_limitations: string
  caveats_limitations: string
  description: string
  observation_date: string
  layer_id: string | null
  default_enabled: boolean
  tags: string[]
}

export interface AtlasCatalogueResponse {
  total_count: number
  filtered_count: number
  page: number
  page_size: number
  total_pages: number
  entries: AtlasMapEntry[]
  categories: AtlasCategorySummary[]
  active_filters: {
    query: string | null
    category: string | null
    epistemic_class: string | null
    product_type?: string | null
    validation_status?: string | null
    status: string | null
    sort_by?: string | null
    sort_order?: string | null
    page?: number
    page_size?: number
  }
  disclaimer?: string
}

export interface AtlasCategoriesResponse {
  categories: AtlasCategorySummary[]
  total_categories: number
}

export interface AtlasQueryParams {
  query?: string
  category?: string
  epistemic_class?: string
  product_type?: string
  validation_status?: string
  status?: string
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function fetchAtlasCatalogue(params?: AtlasQueryParams): Promise<AtlasCatalogueResponse> {
  const searchParams = new URLSearchParams()
  if (params?.query) searchParams.set('query', params.query)
  if (params?.category && params.category !== 'all') searchParams.set('category', params.category)
  if (params?.epistemic_class && params.epistemic_class !== 'ALL') searchParams.set('epistemic_class', params.epistemic_class)
  if (params?.product_type && params.product_type !== 'ALL') searchParams.set('product_type', params.product_type)
  if (params?.validation_status && params.validation_status !== 'ALL') searchParams.set('validation_status', params.validation_status)
  if (params?.status && params.status !== 'all') searchParams.set('status', params.status)
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.page_size) searchParams.set('page_size', String(params.page_size))
  if (params?.sort_by) searchParams.set('sort_by', params.sort_by)
  if (params?.sort_order) searchParams.set('sort_order', params.sort_order)

  const url = `/api/v1/atlas/catalogue${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch atlas catalogue: ${res.statusText}`)
  }
  return res.json() as Promise<AtlasCatalogueResponse>
}

export async function fetchAtlasCategories(): Promise<AtlasCategoriesResponse> {
  const res = await fetch('/api/v1/atlas/categories')
  if (!res.ok) {
    throw new Error(`Failed to fetch atlas categories: ${res.statusText}`)
  }
  return res.json() as Promise<AtlasCategoriesResponse>
}

export async function fetchMapDetails(mapId: string): Promise<AtlasMapEntry> {
  const res = await fetch(`/api/v1/atlas/maps/${encodeURIComponent(mapId)}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch map details for '${mapId}': ${res.statusText}`)
  }
  return res.json() as Promise<AtlasMapEntry>
}

// ============================================================================
// PHASE 2: GLOBAL MARS ATLAS TYPES AND API CLIENTS
// ============================================================================

export interface GlobalBasemap {
  id: string
  name: string
  service_type: 'WMS' | 'WMTS'
  wms_url?: string
  wms_layers?: string
  wmts_tile_url?: string
  format?: string
  resolution: string
  crs: string
  epistemic_class: string
  description: string
  is_default: boolean
}

export interface PlanetaryFeature {
  id: string
  name: string
  feature_type: string
  lat: number
  lon: number
  diameter_km: number
  elevation_areoid_m: number | null
  description: string
  epistemic_class: string
}

export interface MarsLandingSite {
  id: string
  mission: string
  agency: string
  craft_name: string
  lat: number
  lon: number
  elevation_areoid_m: number
  landing_date: string
  status: string
  target_region: string
  description: string
  epistemic_class: string
}

export interface NavigationTarget {
  id: string
  name: string
  lat: number
  lon: number
  recommended_zoom: number
  scale_tier: 'GLOBAL' | 'REGIONAL' | 'LOCAL'
  bounds: [[number, number], [number, number]]
  description: string
}

export async function fetchGlobalBasemaps(): Promise<{ basemaps: GlobalBasemap[]; count: number; crs: string; authority: string }> {
  const res = await fetch('/api/v1/atlas/global/basemaps')
  if (!res.ok) {
    throw new Error(`Failed to fetch global basemaps: ${res.statusText}`)
  }
  return res.json()
}

export function getGlobalTextureUrl(textureType: 'shaded_relief' | 'color_elevation' | 'blend' | string): string {
  return `/api/v1/atlas/global/texture/${textureType}.png`
}

export async function fetchPlanetaryFeatures(params?: {
  search?: string
  feature_type?: string
  limit?: number
}): Promise<{ features: PlanetaryFeature[]; count: number; total_available?: number; authority: string }> {
  const query = new URLSearchParams()
  if (params?.search) query.set('search', params.search)
  if (params?.feature_type) query.set('feature_type', params.feature_type)
  if (params?.limit) query.set('limit', String(params.limit))

  const qs = query.toString()
  const res = await fetch(`/api/v1/atlas/global/features${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch planetary features: ${res.statusText}`)
  }
  return res.json()
}

export interface GlobalElevationSample {
  lat: number
  lon: number
  elevation_m: number
  scale_tier: 'GLOBAL' | 'REGIONAL' | 'LOCAL'
  resolution_m: number
  epistemic_class: string
  vertical_datum: string
  source_product: string
  canonical_id: string
  coverage_disclosure: string
}

export async function sampleGlobalElevation(lat: number, lon: number): Promise<GlobalElevationSample> {
  const res = await fetch(`/api/v1/atlas/global/elevation-sample?lat=${lat}&lon=${lon}`)
  if (!res.ok) {
    throw new Error(`Failed to sample elevation: ${res.statusText}`)
  }
  return res.json()
}

export interface GlobalGeologicUnitDTO {
  symbol: string
  name: string
  system: string
  epoch: string
  dominant_lithology: string
  color_hex: string
  area_percentage: number
  description: string
  limitations: string
  epistemic_class: string
  authority: string
  doi: string
}

export async function fetchGlobalGeology(): Promise<{
  units: GlobalGeologicUnitDTO[]
  count: number
  authority: string
  scale: string
  epistemic_class: string
}> {
  const res = await fetch('/api/v1/atlas/global/geology')
  if (!res.ok) {
    throw new Error(`Failed to fetch global geology: ${res.statusText}`)
  }
  return res.json()
}

export interface LayerCoverageDTO {
  lat: number
  lon: number
  active_tier: 'GLOBAL' | 'REGIONAL' | 'LOCAL'
  available_tiers: Array<{
    scale_tier: string
    name: string
    resolution: string
    source: string
    epistemic_class: string
  }>
  jezero_focus_available: boolean
}

export async function fetchLayerCoverage(lat: number, lon: number): Promise<LayerCoverageDTO> {
  const res = await fetch(`/api/v1/atlas/global/coverage?lat=${lat}&lon=${lon}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch layer coverage: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchLandingSites(): Promise<{ landing_sites: MarsLandingSite[]; count: number; datum: string }> {
  const res = await fetch('/api/v1/atlas/global/landing-sites')
  if (!res.ok) {
    throw new Error(`Failed to fetch landing sites: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchNavigationTargets(): Promise<{ targets: NavigationTarget[]; count: number }> {
  const res = await fetch('/api/v1/atlas/global/navigation-targets')
  if (!res.ok) {
    throw new Error(`Failed to fetch navigation targets: ${res.statusText}`)
  }
  return res.json()
}

// ============================================================================
// PHASE 3: JEZERO REGIONAL COVERAGE & FOOTPRINTS
// ============================================================================

export interface RegionalFootprintLayer {
  name: string
  product_id: string
  resolution: string
  bounds: [[number, number], [number, number]]
  shape: [number, number]
  epistemic_class: string
  description: string
}

export interface GeologicalContextFeature {
  id: string
  name: string
  type: string
  bounds: [[number, number], [number, number]]
  description: string
}

export interface JezeroRegionalFootprintsResponse {
  center: [number, number]
  crs: string
  analysis_crs: string
  layers: {
    hirise_1m: RegionalFootprintLayer
    ctx_20m: RegionalFootprintLayer
    analysis_grid: RegionalFootprintLayer
  }
  geological_context: GeologicalContextFeature[]
}

export async function fetchJezeroRegionalFootprints(): Promise<JezeroRegionalFootprintsResponse> {
  const res = await fetch('/api/v1/atlas/regional/jezero/footprints')
  if (!res.ok) {
    throw new Error(`Failed to fetch Jezero regional footprints: ${res.statusText}`)
  }
  return res.json()
}

// ============================================================================
// PHASE 5 & 6: GEOLOGY, MINERALOGY, & SURFACE ENVIRONMENTS
// ============================================================================

export interface GeologicUnitDTO {
  symbol: string
  name: string
  epoch: string
  dominant_lithology: string
  key_minerals: string[]
  traversability_risk: string
  eva_science_priority: string
  description: string
  sample_cores_collected: string[]
  color_hex: string
  epistemic_class: string
}

export interface CRISMIndexDTO {
  index_code: string
  name: string
  wavelength_microns: number
  target_mineral: string
  absorption_feature: string
  geological_significance: string
  epistemic_class: string
}

export interface SurfacePropertiesResponse {
  study_area: string
  thermal_inertia: {
    value_tiu: number
    units: string
    source: string
    interpretation: string
    epistemic_class: string
  }
  bolometric_albedo: {
    value: number
    units: string
    source: string
    interpretation: string
    epistemic_class: string
  }
  dust_cover_index: {
    dci_score: number
    classification: string
    source: string
    epistemic_class: string
  }
  diurnal_temperature_model: {
    solar_longitude_deg: number
    min_night_temp_k: number
    max_day_temp_k: number
    mean_temp_k: number
    epistemic_class: string
    disclaimer: string
  }
}

export async function fetchGeologyUnits(): Promise<{ units: GeologicUnitDTO[]; count: number; authority: string; scale: string }> {
  const res = await fetch('/api/v1/atlas/geology/units')
  if (!res.ok) {
    throw new Error(`Failed to fetch geology units: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchCRISMIndices(): Promise<{ indices: CRISMIndexDTO[]; count: number; instrument: string }> {
  const res = await fetch('/api/v1/atlas/geology/crism-indices')
  if (!res.ok) {
    throw new Error(`Failed to fetch CRISM indices: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchSurfaceProperties(): Promise<SurfacePropertiesResponse> {
  const res = await fetch('/api/v1/atlas/environment/surface-properties')
  if (!res.ok) {
    throw new Error(`Failed to fetch surface properties: ${res.statusText}`)
  }
  return res.json()
}

// -----------------------------------------------------------------------------
// MILESTONE 2.2 — JEZERO CRATER REGIONAL ATLAS TYPES & CLIENT
// -----------------------------------------------------------------------------

export interface RegionalStudyArea {
  id: string
  name: string
  region_type: string
  planet: string
  crs_geographic: string
  crs_projected: string
  vertical_datum: string
  center: [number, number]
  bounds: {
    lat_min: number
    lat_max: number
    lon_min: number
    lon_max: number
  }
  dimensions_km: {
    width_km: number
    height_km: number
    diameter_km: number
  }
  basin_coverage_pct?: number
  coverage_percentage_of_basin?: number
  spatial_coverage_notes?: string
  crater_feature_dimensions?: {
    canonical_name: string
    canonical_diameter_km: number
    canonical_center: [number, number]
    canonical_area_km2: number
    authority: string
  }
  geodesy_notes?: {
    project_study_area_center: [number, number]
    raster_bounding_box_center: [number, number]
    canonical_iau_crater_center: [number, number]
    landing_site_center: [number, number]
    coordinate_convention: string
    spatial_extent_disclosure: string
  }
  elevation_range_m: {
    min: number
    max: number
    reference: string
  }
  primary_scientific_facies: string[]
  reference_datum: string
  disclaimer: string
}

export interface RegionalLayerCategory {
  id: string
  name: string
  description: string
  icon: string
  count: number
}

export interface RegionalLayer {
  id: string
  canonical_id: string
  name: string
  category: string
  epistemic_class: string
  resolution_m: number | null
  crs: string
  source: string
  url: string | null
  description: string
  is_default: boolean
  is_raster: boolean
  footprint: [[number, number], [number, number]]
  colormap?: string
  hazard_type?: string
  uncertainty_type?: string
  sigma_z_m?: number
}

export interface RegionalGeologicUnit {
  symbol: string
  official_sim3464_symbol?: string
  alias_symbols?: string[]
  legacy_symbol?: string
  name: string
  formation_name: string
  epoch: string
  dominant_lithology: string
  key_minerals: string[]
  traversability_risk: string
  traversability_risk_heuristic?: string
  eva_science_priority: string
  eva_science_priority_heuristic?: string
  planning_evaluation_caveat?: string
  description: string
  sample_cores_collected?: string[]
  color_hex: string
  boundary_polygon: [number, number][]
  area_km2: number
  epistemic_class: string
  authority?: string
  doi?: string
  map_scale?: string
}

export interface CRISMTargetedObservation {
  product_id: string
  observation_type: string
  nominal_spatial_resolution_m?: number
  projected_spatial_resolution_m?: number
  spatial_resolution_m: number
  spectral_bands?: number
  spectral_sampling_nm?: number
  center_lat: number
  center_lon: number
  bounding_box: [[number, number], [number, number]]
  target_description: string
  spectral_detections: string[]
  processing_level: string
  archive_url: string
  epistemic_class: string
  is_raster?: boolean
  is_footprint?: boolean
  notes: string
}

export interface PerseveranceSampleRecord {
  sample_id: string
  sample_name: string
  sample_type: string
  tube_id?: string
  sol_collected: number
  lat: number
  lon: number
  elevation_areoid_m: number
  target_rock_type: string
  geologic_unit: string
  depot_location: string
  paired_with?: string | null
  notes?: string
}

export interface ElevationTransectPoint {
  index: number
  lat: number
  lon: number
  distance_m: number
  elevation_m: number
  slope_deg: number
  scale_tier: string
  epistemic_class: string
  source_product: string
}

export interface ElevationProfileResult {
  transect: {
    start: [number, number]
    end: [number, number]
    total_distance_m: number
    num_points: number
  }
  summary: {
    elev_min_m: number
    elev_max_m: number
    elev_mean_m: number
    elev_relief_m: number
    total_ascent_m: number
    total_descent_m: number
    max_slope_deg: number
    mean_slope_deg: number
    vertical_datum: string
  }
  points: ElevationTransectPoint[]
}

export interface LayerComparisonResult {
  layer_a: {
    id: string
    name: string
    category: string
    resolution_m: number | null
    epistemic_class: string
  }
  layer_b: {
    id: string
    name: string
    category: string
    resolution_m: number | null
    epistemic_class: string
  }
  can_compare: boolean
  has_spatial_overlap: boolean
  overlap_bounds: [[number, number], [number, number]] | null
  overlap_area_km2: number
  resolution_ratio_a_to_b: number | null
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  name?: string
  features: Array<{
    type: 'Feature'
    geometry: {
      type: string
      coordinates: any
    }
    properties: Record<string, any>
  }>
  total_available?: number
  count?: number
  telemetry_disclaimer?: string
}

export async function fetchRegionalStudyArea(): Promise<RegionalStudyArea> {
  const res = await fetch('/api/v1/atlas/regional/jezero/study-area')
  if (!res.ok) throw new Error(`Failed to fetch study area: ${res.statusText}`)
  return res.json()
}

export async function fetchRegionalCategories(): Promise<{
  categories: RegionalLayerCategory[]
  total_categories: number
  total_layers: number
}> {
  const res = await fetch('/api/v1/atlas/regional/jezero/categories')
  if (!res.ok) throw new Error(`Failed to fetch regional categories: ${res.statusText}`)
  return res.json()
}

export async function fetchRegionalLayers(category?: string): Promise<{
  study_area: string
  count: number
  layers: RegionalLayer[]
}> {
  const url = category
    ? `/api/v1/atlas/regional/jezero/layers?category=${encodeURIComponent(category)}`
    : '/api/v1/atlas/regional/jezero/layers'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch regional layers: ${res.statusText}`)
  return res.json()
}

export async function fetchRegionalGeology(): Promise<{
  authority: string
  scale: string
  epistemic_class: string
  count: number
  units: RegionalGeologicUnit[]
}> {
  const res = await fetch('/api/v1/atlas/regional/jezero/geology')
  if (!res.ok) throw new Error(`Failed to fetch regional geology: ${res.statusText}`)
  return res.json()
}

export async function fetchRegionalGeologyUnit(unitSymbol: string): Promise<RegionalGeologicUnit> {
  const res = await fetch(`/api/v1/atlas/regional/jezero/geology/${encodeURIComponent(unitSymbol)}`)
  if (!res.ok) throw new Error(`Failed to fetch geology unit ${unitSymbol}: ${res.statusText}`)
  return res.json()
}

export async function fetchRegionalCrism(): Promise<{
  instrument: string
  observations_count: number
  observations: CRISMTargetedObservation[]
  spectral_indices: Array<{
    symbol: string
    name: string
    wavelength_um: number
    diagnostic_mineral: string
    formula: string
    epistemic_class: string
  }>
  epistemic_class: string
  notes: string
}> {
  const res = await fetch('/api/v1/atlas/regional/jezero/crism')
  if (!res.ok) throw new Error(`Failed to fetch regional CRISM data: ${res.statusText}`)
  return res.json()
}

export async function fetchRoverTraverse(params?: {
  sol_min?: number
  sol_max?: number
  limit?: number
}): Promise<GeoJSONFeatureCollection> {
  const q = new URLSearchParams()
  if (params?.sol_min !== undefined) q.append('sol_min', params.sol_min.toString())
  if (params?.sol_max !== undefined) q.append('sol_max', params.sol_max.toString())
  if (params?.limit !== undefined) q.append('limit', params.limit.toString())
  const res = await fetch(`/api/v1/atlas/regional/jezero/rover/traverse?${q.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch rover traverse: ${res.statusText}`)
  return res.json()
}

export async function fetchRoverWaypoints(params?: {
  sol_min?: number
  sol_max?: number
  limit?: number
}): Promise<GeoJSONFeatureCollection> {
  const q = new URLSearchParams()
  if (params?.sol_min !== undefined) q.append('sol_min', params.sol_min.toString())
  if (params?.sol_max !== undefined) q.append('sol_max', params.sol_max.toString())
  if (params?.limit !== undefined) q.append('limit', params.limit.toString())
  const res = await fetch(`/api/v1/atlas/regional/jezero/rover/waypoints?${q.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch rover waypoints: ${res.statusText}`)
  return res.json()
}

export async function fetchRoverSamples(): Promise<{
  mission: string
  count: number
  samples: PerseveranceSampleRecord[]
  depot_name: string
  epistemic_class: string
}> {
  const res = await fetch('/api/v1/atlas/regional/jezero/rover/samples')
  if (!res.ok) throw new Error(`Failed to fetch rover samples: ${res.statusText}`)
  return res.json()
}

export async function fetchRegionalElevationSample(
  lat: number,
  lon: number
): Promise<{
  lat: number
  lon: number
  elevation_m: number
  scale_tier: string
  source_product: string
  resolution_m: number
  vertical_datum: string
  epistemic_class: string
  caveat: string
}> {
  const res = await fetch(
    `/api/v1/atlas/regional/jezero/elevation-sample?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
  )
  if (!res.ok) throw new Error(`Failed to sample regional elevation: ${res.statusText}`)
  return res.json()
}

export async function generateElevationProfile(req: {
  start_lat: number
  start_lon: number
  end_lat: number
  end_lon: number
  num_points?: number
}): Promise<ElevationProfileResult> {
  const res = await fetch('/api/v1/atlas/regional/jezero/elevation-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`Failed to generate elevation profile: ${res.statusText}`)
  return res.json()
}

export async function compareRegionalLayers(
  layerA: string,
  layerB: string
): Promise<LayerComparisonResult> {
  const res = await fetch(
    `/api/v1/atlas/regional/jezero/compare?layer_a=${encodeURIComponent(layerA)}&layer_b=${encodeURIComponent(layerB)}`
  )
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Layer comparison failed: ${res.statusText}`)
  }
  return res.json()
}
