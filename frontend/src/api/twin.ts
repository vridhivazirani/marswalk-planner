/**
 * API types and client fetchers for the Marswalk Digital Twin backend endpoints.
 */

export interface StudyAreaInfo {
  name: string
  crs_geographic: string
  crs_projected: string
  center: [number, number] // [lat, lon]
  bounds: [[number, number], [number, number]] // [[latMin, lonMin], [latMax, lonMax]]
  grid_dimensions: { width: number; height: number }
  resolution_m: number
  elevation_range_m: { min: number; max: number }
}

export interface LayerMetadata {
  id: string
  name: string
  type: 'raster' | 'vector'
  epistemic_class: string
  url: string
  description: string
}

export interface DigitalTwinLayersResponse {
  study_area: StudyAreaInfo
  layers: LayerMetadata[]
}

export interface ElevationGridResponse {
  rows: number
  cols: number
  step: number
  grid_resolution_m: number
  elev_min_m: number
  elev_max_m: number
  elev_mean_m: number
  elevations: number[][]
}

export async function fetchDigitalTwinLayers(signal?: AbortSignal): Promise<DigitalTwinLayersResponse> {
  const res = await fetch('/api/v1/twin/layers', { signal })
  if (!res.ok) throw new Error(`Failed to load layers: HTTP ${res.status}`)
  return (await res.json()) as DigitalTwinLayersResponse
}

export async function fetchPerseveranceGeoJSON(signal?: AbortSignal): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch('/api/v1/twin/vector/perseverance', { signal })
  if (!res.ok) throw new Error(`Failed to load rover data: HTTP ${res.status}`)
  return (await res.json()) as GeoJSON.FeatureCollection
}

export async function fetchElevationContoursGeoJSON(interval = 50, signal?: AbortSignal): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`/api/v1/twin/vector/contours?interval=${interval}`, { signal })
  if (!res.ok) throw new Error(`Failed to load elevation contours: HTTP ${res.status}`)
  return (await res.json()) as GeoJSON.FeatureCollection
}

export async function fetchElevationGrid(step = 4, signal?: AbortSignal): Promise<ElevationGridResponse> {
  const res = await fetch(`/api/v1/twin/elevation/grid?step=${step}`, { signal })
  if (!res.ok) throw new Error(`Failed to load 3D elevation grid: HTTP ${res.status}`)
  return (await res.json()) as ElevationGridResponse
}

