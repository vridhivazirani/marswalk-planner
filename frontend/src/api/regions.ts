/**
 * Marswalk Planetary Exploration Atlas — Multi-Region Registry API Client.
 */

export interface RegionBoundingBox {
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
}

export interface RegionDimensions {
  width_km: number
  height_km: number
  diameter_km: number | null
  area_km2: number
}

export interface ElevationRange {
  min_elevation_m: number
  max_elevation_m: number
  datum: string
}

export interface RegionMissionRef {
  mission_name: string
  spacecraft: string
  landing_date: string
  status: string
  coordinates: [number, number]
}

export interface RegionDatasetRef {
  product_id: string
  name: string
  instrument_mission: string
  resolution: string
  storage_type: 'VERIFIED_LOCAL' | 'VERIFIED_REMOTE'
  epistemic_class: string
  source_portal: string
  coverage_type: string
}

export interface RegionMetadata {
  id: string
  name: string
  canonical_feature_name: string
  physiographic_province: string
  geological_setting: string
  formation_period: string
  center: [number, number]
  bounds: RegionBoundingBox
  dimensions: RegionDimensions
  elevation_range: ElevationRange
  missions: RegionMissionRef[]
  has_local_digital_twin: boolean
  local_twin_page_id?: string | null
  available_datasets: RegionDatasetRef[]
  scientific_highlights: string[]
  epistemic_class: string
}

export interface RegionSummaryDTO {
  id: string
  name: string
  canonical_feature_name: string
  physiographic_province: string
  formation_period: string
  center: [number, number]
  has_local_digital_twin: boolean
  missions_count: number
  datasets_count: number
}

export interface RegionsListResponse {
  total_regions: number
  regions: RegionSummaryDTO[]
}

/**
 * Fetch summary metadata for all 12 priority Martian exploration regions.
 */
export async function fetchRegions(signal?: AbortSignal): Promise<RegionsListResponse> {
  const res = await fetch('/api/v1/regions', { signal })
  if (!res.ok) {
    throw new Error(`Failed to fetch regions list: HTTP ${res.status}`)
  }
  return (await res.json()) as RegionsListResponse
}

/**
 * Fetch complete scientific metadata dossier for a specific Martian region.
 */
export async function fetchRegionDossier(regionId: string, signal?: AbortSignal): Promise<RegionMetadata> {
  const res = await fetch(`/api/v1/regions/${regionId}`, { signal })
  if (!res.ok) {
    throw new Error(`Failed to fetch region dossier for '${regionId}': HTTP ${res.status}`)
  }
  return (await res.json()) as RegionMetadata
}

/**
 * Find which priority region encloses the given coordinates.
 */
export async function lookupRegionByCoords(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<RegionMetadata | null> {
  const res = await fetch(`/api/v1/regions/lookup/coordinates?lat=${lat}&lon=${lon}`, { signal })
  if (!res.ok) {
    throw new Error(`Failed to lookup region for coords (${lat}, ${lon}): HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.id ? (data as RegionMetadata) : null
}
