import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  fetchRegionalStudyArea,
  fetchRegionalCategories,
  fetchRegionalLayers,
  fetchRegionalGeology,
  fetchRegionalCrism,
  fetchRoverTraverse,
  fetchRoverWaypoints,
  fetchRoverSamples,
  fetchRegionalElevationSample,
  generateElevationProfile,
  compareRegionalLayers,
  type RegionalStudyArea,
  type RegionalLayerCategory,
  type RegionalLayer,
  type RegionalGeologicUnit,
  type CRISMTargetedObservation,
  type PerseveranceSampleRecord,
  type ElevationProfileResult,
  type LayerComparisonResult,
  type GeoJSONFeatureCollection,
} from '../api/atlas'
import {
  fetchRegions,
  fetchRegionDossier,
  type RegionSummaryDTO,
  type RegionMetadata,
} from '../api/regions'

interface RegionalMarsMapProps {
  onBackToGlobal?: () => void
  onEnterLocalTwin?: () => void
  initialRegionId?: string
}

export function RegionalMarsMap({
  onBackToGlobal,
  onEnterLocalTwin,
  initialRegionId = 'reg-jezero',
}: RegionalMarsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  // Raster Layer references
  const ctxRasterLayerRef = useRef<L.ImageOverlay | null>(null)
  const dtmRasterLayerRef = useRef<L.ImageOverlay | null>(null)

  // Vector Layer groups
  const geologyGroupRef = useRef<L.LayerGroup | null>(null)
  const crismGroupRef = useRef<L.LayerGroup | null>(null)
  const roverTraverseGroupRef = useRef<L.LayerGroup | null>(null)
  const roverWaypointsGroupRef = useRef<L.LayerGroup | null>(null)
  const sampleCoresGroupRef = useRef<L.LayerGroup | null>(null)
  const footprintsGroupRef = useRef<L.LayerGroup | null>(null)
  const transectLineRef = useRef<L.Polyline | null>(null)

  // Data states
  const [regionsList, setRegionsList] = useState<RegionSummaryDTO[]>([])
  const [selectedRegionId, setSelectedRegionId] = useState<string>(initialRegionId)
  const [activeRegionDossier, setActiveRegionDossier] = useState<RegionMetadata | null>(null)
  const [loadingRegionDossier, setLoadingRegionDossier] = useState<boolean>(false)

  const [_studyArea, setStudyArea] = useState<RegionalStudyArea | null>(null)
  const [categories, setCategories] = useState<RegionalLayerCategory[]>([])
  const [layers, setLayers] = useState<RegionalLayer[]>([])
  const [geologyUnits, setGeologyUnits] = useState<RegionalGeologicUnit[]>([])
  const [crismObs, setCrismObs] = useState<CRISMTargetedObservation[]>([])
  const [sampleCores, setSampleCores] = useState<PerseveranceSampleRecord[]>([])
  const [traverseData, setTraverseData] = useState<GeoJSONFeatureCollection | null>(null)
  const [waypointsData, setWaypointsData] = useState<GeoJSONFeatureCollection | null>(null)

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Active Category & Layer Controls
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    reg_ctx_mosaic: true,
    reg_ctx_20m_dtm: false,
    reg_usgs_geology: true,
    reg_crism_observations: true,
    reg_m20_traverse: true,
    reg_m20_waypoints: false,
    reg_m20_samples: true,
    reg_hirise_footprint: true,
  })
  const [layerOpacity, setLayerOpacity] = useState<Record<string, number>>({
    reg_ctx_mosaic: 1.0,
    reg_ctx_20m_dtm: 0.65,
    reg_usgs_geology: 0.55,
    reg_crism_observations: 0.8,
  })

  // Rover Sol Filter Slider (Sols 14–2022, 45.25 km total traverse)
  const [solRange, setSolRange] = useState<number>(2022)
  const [maxAvailableSol, setMaxAvailableSol] = useState<number>(2022)

  // Selected Entity inspection drawer
  const [selectedEntity, setSelectedEntity] = useState<{
    type: 'geology' | 'crism' | 'sample' | 'layer' | 'waypoint'
    data: any
  } | null>(null)

  // Elevation point sampling
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [elevationSample, setElevationSample] = useState<{
    elevation_m: number
    scale_tier: string
    source_product: string
  } | null>(null)
  const [isSampling, setIsSampling] = useState<boolean>(false)

  // Transect Profile Tool State
  const [isProfilingActive, setIsProfilingActive] = useState<boolean>(false)
  const [profilePoints, setProfilePoints] = useState<[number, number][]>([])
  const [elevationProfile, setElevationProfile] = useState<ElevationProfileResult | null>(null)
  const [profileLoading, setProfileLoading] = useState<boolean>(false)

  // Layer Comparison State
  const [showCompareTool, setShowCompareTool] = useState<boolean>(false)
  const [compareLayerA, setCompareLayerA] = useState<string>('reg_ctx_mosaic')
  const [compareLayerB, setCompareLayerB] = useState<string>('reg_ctx_20m_dtm')
  const [compareResult, setCompareResult] = useState<LayerComparisonResult | null>(null)

  // Load all initial regional data
  useEffect(() => {
    let cancelled = false
    async function initRegionalAtlas() {
      try {
        const [
          studyAreaRes,
          catsRes,
          layersRes,
          geoRes,
          crismRes,
          samplesRes,
          travRes,
          wpRes,
        ] = await Promise.all([
          fetchRegionalStudyArea(),
          fetchRegionalCategories(),
          fetchRegionalLayers(),
          fetchRegionalGeology(),
          fetchRegionalCrism(),
          fetchRoverSamples(),
          fetchRoverTraverse({ sol_min: 0, sol_max: 1200, limit: 1000 }),
          fetchRoverWaypoints({ sol_min: 0, sol_max: 1200, limit: 200 }),
        ])

        if (cancelled) return

        setStudyArea(studyAreaRes)
        setCategories(catsRes.categories)
        setLayers(layersRes.layers)
        setGeologyUnits(geoRes.units)
        setCrismObs(crismRes.observations)
        setSampleCores(samplesRes.samples)
        setTraverseData(travRes)
        setWaypointsData(wpRes)

        // Find max sol in traverse
        let maxSol = 1100
        travRes.features.forEach((f) => {
          if (f.properties?.sol && f.properties.sol > maxSol) {
            maxSol = f.properties.sol
          }
        })
        setMaxAvailableSol(maxSol)
        setSolRange(maxSol)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load regional Jezero data')
        setLoading(false)
      }
    }

    initRegionalAtlas()
    return () => {
      cancelled = true
    }
  }, [])

  // Load regions list on mount
  useEffect(() => {
    fetchRegions()
      .then((res) => setRegionsList(res.regions || []))
      .catch((err) => console.warn('Failed to load regions list:', err))
  }, [])

  // Sync selectedRegionId when initialRegionId changes (React render phase state adjustment)
  const [prevInitialId, setPrevInitialId] = useState(initialRegionId)
  if (initialRegionId !== prevInitialId) {
    setPrevInitialId(initialRegionId)
    setSelectedRegionId(initialRegionId)
    if (initialRegionId !== 'reg-jezero') {
      setLoadingRegionDossier(true)
    }
  }

  // Load region dossier when selectedRegionId changes and is not Jezero
  useEffect(() => {
    if (selectedRegionId === 'reg-jezero') {
      return
    }
    let cancelled = false
    fetchRegionDossier(selectedRegionId)
      .then((dossier) => {
        if (!cancelled) {
          setActiveRegionDossier(dossier)
          setLoadingRegionDossier(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Failed to fetch region dossier:', err)
          setLoadingRegionDossier(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedRegionId])

  const handleSelectRegion = (id: string) => {
    setSelectedRegionId(id)
    if (id === 'reg-jezero') {
      setActiveRegionDossier(null)
      setLoadingRegionDossier(false)
    } else {
      setLoadingRegionDossier(true)
    }
  }

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    // Center on Jezero Basin [18.4485, 77.4320] in Mars Plate Carrée CRS
    const map = L.map(mapContainerRef.current, {
      crs: L.CRS.EPSG4326,
      center: [18.4485, 77.4320],
      zoom: 11,
      minZoom: 8,
      maxZoom: 16,
      zoomControl: false,
      attributionControl: false,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Global Mars MOLA background context tile layer with smooth oversampling and bounds clamping
    L.tileLayer(
      'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg',
      {
        maxNativeZoom: 7,
        maxZoom: 16,
        noWrap: false,
        bounds: [[-90, -180], [90, 180]],
        opacity: 0.75,
      }
    ).addTo(map)

    // Authentic Georeferenced ARD Local Digital Twin Raster Bounds (7.2km x 11.7km)
    const localTwinBounds: L.LatLngBoundsExpression = [
      [18.39180, 77.34370],
      [18.58953, 77.46584],
    ]

    // Regional USGS SIM-3464 Geologic Map Context Bounds (~31.8km x 30.2km)
    const regionalContextBounds: L.LatLngBoundsExpression = [
      [18.21103, 77.16047],
      [18.72119, 77.69898],
    ]

    // Regional Context Boundary Outline
    L.rectangle(regionalContextBounds, {
      color: '#525252',
      weight: 1,
      dashArray: '3, 4',
      fill: false,
      interactive: false,
    }).addTo(map)

    // Local Western Delta Twin Boundary Outline
    L.rectangle(localTwinBounds, {
      color: '#38bdf8',
      weight: 1.5,
      dashArray: '4, 4',
      fillColor: '#38bdf8',
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(map)

    // CTX 6m Orthomosaic Image Overlay (placed at exact georeferenced ARD bounds)
    const ctxOverlay = L.imageOverlay('/api/v1/twin/raster/ortho.png', localTwinBounds, {
      opacity: 1.0,
      interactive: false,
    }).addTo(map)
    ctxRasterLayerRef.current = ctxOverlay

    // CTX 20m DTM Hillshade/Elevation Overlay (placed at exact georeferenced ARD bounds)
    const dtmOverlay = L.imageOverlay('/api/v1/twin/raster/elevation.png', localTwinBounds, {
      opacity: 0.0,
      interactive: false,
    }).addTo(map)
    dtmRasterLayerRef.current = dtmOverlay

    // Initialize layer groups
    geologyGroupRef.current = L.layerGroup().addTo(map)
    crismGroupRef.current = L.layerGroup().addTo(map)
    roverTraverseGroupRef.current = L.layerGroup().addTo(map)
    roverWaypointsGroupRef.current = L.layerGroup().addTo(map)
    sampleCoresGroupRef.current = L.layerGroup().addTo(map)
    footprintsGroupRef.current = L.layerGroup().addTo(map)

    // Fit map bounds initially to regional context
    map.fitBounds(regionalContextBounds)

    // Track cursor movement for telemetry HUD
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng })
    })

    // Click handler for elevation sampling & transect profiling
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng

      // Sample point elevation
      setIsSampling(true)
      try {
        const sample = await fetchRegionalElevationSample(lat, lng)
        setElevationSample(sample)
      } catch {
        // silent fallback
      } finally {
        setIsSampling(false)
      }
    })

    mapInstanceRef.current = map

    const resizeTimer = setTimeout(() => {
      map.invalidateSize()
    }, 150)

    return () => {
      clearTimeout(resizeTimer)
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Handle Transect Profile Point Collection
  const handleMapProfileClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!isProfilingActive) return
      const clicked: [number, number] = [e.latlng.lat, e.latlng.lng]

      setProfilePoints((prev) => {
        if (prev.length >= 2) {
          return [clicked]
        }
        if (prev.length === 1) {
          setProfileLoading(true)
        }
        return [...prev, clicked]
      })
    },
    [isProfilingActive]
  )

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (isProfilingActive) {
      map.on('click', handleMapProfileClick)
    } else {
      map.off('click', handleMapProfileClick)
    }

    return () => {
      map.off('click', handleMapProfileClick)
    }
  }, [isProfilingActive, handleMapProfileClick])

  // Draw Transect Line on Map when profile points change
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (transectLineRef.current) {
      transectLineRef.current.remove()
      transectLineRef.current = null
    }

    if (profilePoints.length === 2) {
      const line = L.polyline(profilePoints, {
        color: '#ffffff',
        weight: 3,
        dashArray: '4, 6',
      }).addTo(map)
      transectLineRef.current = line

      // Fetch profile data from backend
      generateElevationProfile({
        start_lat: profilePoints[0][0],
        start_lon: profilePoints[0][1],
        end_lat: profilePoints[1][0],
        end_lon: profilePoints[1][1],
        num_points: 60,
      })
        .then((res) => {
          setElevationProfile(res)
          setProfileLoading(false)
        })
        .catch(() => {
          setProfileLoading(false)
        })
    }
  }, [profilePoints])

  // Update Raster Overlays Opacity
  useEffect(() => {
    if (ctxRasterLayerRef.current) {
      const visible = activeLayers.reg_ctx_mosaic ?? true
      ctxRasterLayerRef.current.setOpacity(visible ? (layerOpacity.reg_ctx_mosaic ?? 1.0) : 0)
    }
    if (dtmRasterLayerRef.current) {
      const visible = activeLayers.reg_ctx_20m_dtm ?? false
      dtmRasterLayerRef.current.setOpacity(visible ? (layerOpacity.reg_ctx_20m_dtm ?? 0.65) : 0)
    }
  }, [activeLayers, layerOpacity])

  // Render Geological Polygons (USGS SIM-3464)
  useEffect(() => {
    const group = geologyGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!activeLayers.reg_usgs_geology || geologyUnits.length === 0) return

    const opacity = layerOpacity.reg_usgs_geology ?? 0.55

    geologyUnits.forEach((unit) => {
      const polygon = L.polygon(unit.boundary_polygon, {
        color: unit.color_hex,
        fillColor: unit.color_hex,
        fillOpacity: opacity,
        weight: 1.5,
      })

      polygon.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedEntity({ type: 'geology', data: unit })
      })

      const sym = unit.official_sim3464_symbol || unit.symbol
      const legacy = unit.legacy_symbol || unit.alias_symbols?.[0]
      polygon.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px; font-weight: bold;">
          ${sym}${legacy && legacy !== sym ? ` [alias ${legacy}]` : ''}: ${unit.name}
        </div>`,
        { sticky: true, className: 'leaflet-tooltip-dark' }
      )

      polygon.addTo(group)
    })
  }, [activeLayers.reg_usgs_geology, layerOpacity.reg_usgs_geology, geologyUnits])

  // Render CRISM Targeted Observation Footprints
  useEffect(() => {
    const group = crismGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!activeLayers.reg_crism_observations || crismObs.length === 0) return

    crismObs.forEach((obs) => {
      const bounds: L.LatLngBoundsExpression = [
        [obs.bounding_box[0][0], obs.bounding_box[0][1]],
        [obs.bounding_box[1][0], obs.bounding_box[1][1]],
      ]

      const rect = L.rectangle(bounds, {
        color: '#00d2ff',
        fillColor: '#00d2ff',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '3, 4',
      })

      rect.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedEntity({ type: 'crism', data: obs })
      })

      rect.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>CRISM ${obs.product_id}</strong><br/>
          ${obs.target_description}
        </div>`,
        { sticky: true, className: 'leaflet-tooltip-dark' }
      )

      rect.addTo(group)
    })
  }, [activeLayers.reg_crism_observations, crismObs])

  // Render Perseverance Rover Traverse (filtered by solRange)
  useEffect(() => {
    const group = roverTraverseGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!activeLayers.reg_m20_traverse || !traverseData) return

    // Filter features up to solRange
    const filteredFeatures = traverseData.features.filter((f) => {
      const sol = f.properties?.sol
      return sol !== undefined && sol <= solRange
    })

    const geoJsonLayer = L.geoJSON(
      {
        type: 'FeatureCollection',
        features: filteredFeatures,
      } as any,
      {
        style: () => ({
          color: '#ffffff',
          weight: 2.5,
          opacity: 0.9,
        }),
      }
    )

    geoJsonLayer.addTo(group)
  }, [activeLayers.reg_m20_traverse, traverseData, solRange])

  // Render Perseverance Rover Waypoints
  useEffect(() => {
    const group = roverWaypointsGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!activeLayers.reg_m20_waypoints || !waypointsData) return

    const filtered = waypointsData.features.filter((f) => {
      const sol = f.properties?.sol
      return sol !== undefined && sol <= solRange
    })

    filtered.forEach((f) => {
      const coords = f.geometry.coordinates
      const marker = L.circleMarker([coords[1], coords[0]], {
        radius: 3,
        color: '#ffffff',
        fillColor: '#000000',
        fillOpacity: 1,
        weight: 1.5,
      })

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedEntity({ type: 'waypoint', data: f.properties })
      })

      marker.addTo(group)
    })
  }, [activeLayers.reg_m20_waypoints, waypointsData, solRange])

  // Render Perseverance Sample Cores & Three Forks Depot
  useEffect(() => {
    const group = sampleCoresGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!activeLayers.reg_m20_samples || sampleCores.length === 0) return

    sampleCores.forEach((sample) => {
      const isDepot = sample.depot_location.includes('Three Forks')
      const marker = L.circleMarker([sample.lat, sample.lon], {
        radius: isDepot ? 6 : 5,
        color: isDepot ? '#00e5ff' : '#ffd700',
        fillColor: isDepot ? '#003344' : '#443300',
        fillOpacity: 0.9,
        weight: 2,
      })

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedEntity({ type: 'sample', data: sample })
      })

      marker.bindTooltip(
        `<div style="font-family: monospace; font-size: 11px;">
          <strong>${sample.sample_id} (${sample.sample_name})</strong><br/>
          Sol ${sample.sol_collected} • ${sample.target_rock_type}<br/>
          <span style="color: ${isDepot ? '#00e5ff' : '#ffd700'}">${sample.depot_location}</span>
        </div>`,
        { sticky: true, className: 'leaflet-tooltip-dark' }
      )

      marker.addTo(group)
    })
  }, [activeLayers.reg_m20_samples, sampleCores])

  // Render Coverage Footprints (e.g. HiRISE 1m DTM Boundary)
  useEffect(() => {
    const group = footprintsGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!activeLayers.reg_hirise_footprint) return

    // HiRISE DTM boundary box
    const hiriseBounds: L.LatLngBoundsExpression = [
      [18.39209, 77.3437],
      [18.58953, 77.46579],
    ]

    const rect = L.rectangle(hiriseBounds, {
      color: '#ffffff',
      fillColor: '#ffffff',
      fillOpacity: 0.05,
      weight: 2,
      dashArray: '6, 6',
    })

    rect.bindTooltip(
      `<div style="font-family: monospace; font-size: 11px;">
        <strong>HiRISE 1m DTM Coverage Footprint</strong><br/>
        Spatial bounds: 18.39°N–18.59°N, 77.34°E–77.47°E<br/>
        <span style="color: #4ade80;">Authentic Sub-Meter Terrain Data</span>
      </div>`,
      { sticky: true, className: 'leaflet-tooltip-dark' }
    )

    rect.addTo(group)
  }, [activeLayers.reg_hirise_footprint])

  // Run Layer Comparison calculation
  const handleRunComparison = async () => {
    try {
      const res = await compareRegionalLayers(compareLayerA, compareLayerB)
      setCompareResult(res)
    } catch {
      setCompareResult(null)
    }
  }

  // Predefined transect profiles
  const applyPresetTransect = (start: [number, number], end: [number, number]) => {
    setProfileLoading(true)
    setProfilePoints([start, end])
    setIsProfilingActive(true)
  }

  const toggleLayer = (layerId: string) => {
    setActiveLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }))
  }

  const updateOpacity = (layerId: string, value: number) => {
    setLayerOpacity((prev) => ({ ...prev, [layerId]: value }))
  }

  if (error) {
    return (
      <div className="p-6 bg-[#090909] border border-red-900/50 text-red-300 font-mono text-sm">
        <div className="text-red-400 font-bold mb-2">REGIONAL ATLAS LOAD ERROR</div>
        <div>{error}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-3 py-1.5 bg-neutral-800 border border-neutral-700 text-xs text-white uppercase tracking-wider hover:bg-neutral-700"
        >
          RELOAD ATLAS
        </button>
      </div>
    )
  }

  return (
    <div className="regional-mars-map-wrapper">
      {/* TOP REGIONAL HEADER & MULTI-SCALE BREADCRUMBS */}
      <div className="regional-mars-map-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Breadcrumbs */}
          <button
            onClick={onBackToGlobal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: '#181818',
              border: '1px solid #303030',
              color: '#d4d4d4',
              padding: '0.25rem 0.55rem',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
            }}
            title="Return to Global Mars Atlas"
          >
            <span>🌐</span>
            <span>GLOBAL ATLAS</span>
          </button>
          <span style={{ color: '#404040' }}>/</span>

          {/* Region Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: '#a3a3a3', fontWeight: 700 }}>REGION:</span>
            <select
              value={selectedRegionId}
              onChange={(e) => handleSelectRegion(e.target.value)}
              style={{
                background: '#141414',
                border: '1px solid #3f3f46',
                color: '#ffffff',
                fontSize: '0.74rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.2rem 0.4rem',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              {regionsList.length > 0 ? (
                regionsList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.has_local_digital_twin ? '★' : ''}
                  </option>
                ))
              ) : (
                <option value="reg-jezero">Jezero Crater (Western Basin & Delta) ★</option>
              )}
            </select>
          </div>

          {selectedRegionId === 'reg-jezero' && (
            <>
              <span style={{ color: '#404040' }}>/</span>
              <button
                onClick={onEnterLocalTwin}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: '#202020',
                  border: '1px solid #404040',
                  color: '#ffffff',
                  padding: '0.25rem 0.55rem',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                }}
                title="Dive into 1m Local Digital Twin"
              >
                <span>🔭</span>
                <span>LOCAL DIGITAL TWIN (1m) →</span>
              </button>
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.72rem',
            color: '#a3a3a3',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              background: '#181818',
              padding: '0.2rem 0.5rem',
              border: '1px solid #303030',
            }}
          >
            CRS: <span style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>IAU_2015:49900</span>
          </div>
          <div
            style={{
              background: '#181818',
              padding: '0.2rem 0.5rem',
              border: '1px solid #303030',
            }}
          >
            DATUM: <span style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>MOLA Areoid</span>
          </div>
          {selectedRegionId === 'reg-jezero' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                onClick={() => setIsProfilingActive(!isProfilingActive)}
                style={{
                  padding: '0.25rem 0.6rem',
                  border: isProfilingActive ? '1px solid #ffffff' : '1px solid #404040',
                  background: isProfilingActive ? '#ffffff' : '#181818',
                  color: isProfilingActive ? '#000000' : '#f5f5f5',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                📐 {isProfilingActive ? 'EXIT TRANSECT' : 'ELEVATION TRANSECT'}
              </button>
              <button
                onClick={() => setShowCompareTool(!showCompareTool)}
                style={{
                  padding: '0.25rem 0.6rem',
                  border: showCompareTool ? '1px solid #ffffff' : '1px solid #404040',
                  background: showCompareTool ? '#ffffff' : '#181818',
                  color: showCompareTool ? '#000000' : '#f5f5f5',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                ⚖️ {showCompareTool ? 'HIDE COMPARISON' : 'LAYER COMPARISON'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CONDITIONAL BODY: JEZERO 16-LAYER DIGITAL TWIN vs MULTI-REGION SCIENTIFIC DOSSIER */}
      {selectedRegionId !== 'reg-jezero' ? (
        <div
          style={{
            flex: 1,
            background: '#0a0a0d',
            padding: '1.5rem',
            overflowY: 'auto',
            color: '#f4f4f5',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {loadingRegionDossier && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#a1a1aa' }}>
              Loading scientific exploration dossier...
            </div>
          )}

          {!loadingRegionDossier && activeRegionDossier && (
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              {/* Region Hero Banner */}
              <div
                style={{
                  background: '#121217',
                  border: '1px solid #27272a',
                  borderRadius: '4px',
                  padding: '1.25rem 1.5rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                      <span className="badge badge-observed">
                        {activeRegionDossier.canonical_feature_name.toUpperCase()}
                      </span>
                      <span className="badge badge-derived">
                        GEODESY: IAU_2015:49900
                      </span>
                      <span className="badge badge-interpreted">
                        ERA: {activeRegionDossier.formation_period}
                      </span>
                    </div>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.3rem 0', color: '#ffffff' }}>
                      {activeRegionDossier.name}
                    </h2>
                    <div style={{ fontSize: '0.78rem', color: '#a1a1aa' }}>
                      Physiographic Province: <strong style={{ color: '#ffffff' }}>{activeRegionDossier.physiographic_province}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={onBackToGlobal}
                      style={{
                        background: '#18181b',
                        color: '#ffffff',
                        border: '1px solid #3f3f46',
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span>🪐</span>
                      <span>FLY TO ON 3D MARS GLOBE</span>
                    </button>
                    <button
                      onClick={() => setSelectedRegionId('reg-jezero')}
                      style={{
                        background: '#22d3ee',
                        color: '#000000',
                        border: 'none',
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span>🛰️</span>
                      <span>OPEN JEZERO DIGITAL TWIN (16 LAYERS)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 Telemetry Metrics Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ background: '#121217', border: '1px solid #27272a', padding: '1rem', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#a1a1aa', fontWeight: 700, marginBottom: '0.3rem' }}>
                    CENTER COORDINATES & BOUNDS
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                    {activeRegionDossier.center[0] > 0 ? `${activeRegionDossier.center[0].toFixed(2)}°N` : `${Math.abs(activeRegionDossier.center[0]).toFixed(2)}°S`},{' '}
                    {activeRegionDossier.center[1] > 0 ? `${activeRegionDossier.center[1].toFixed(2)}°E` : `${Math.abs(activeRegionDossier.center[1]).toFixed(2)}°W`}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '0.3rem' }}>
                    Lat: [{activeRegionDossier.bounds.lat_min}°, {activeRegionDossier.bounds.lat_max}°] • Lon: [{activeRegionDossier.bounds.lon_min}°, {activeRegionDossier.bounds.lon_max}°]
                  </div>
                </div>

                <div style={{ background: '#121217', border: '1px solid #27272a', padding: '1rem', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#a1a1aa', fontWeight: 700, marginBottom: '0.3rem' }}>
                    REGIONAL EXTENT & AREA
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                    {activeRegionDossier.dimensions.width_km.toLocaleString()} × {activeRegionDossier.dimensions.height_km.toLocaleString()} km
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '0.3rem' }}>
                    Total Study Area: {activeRegionDossier.dimensions.area_km2.toLocaleString()} km²
                    {activeRegionDossier.dimensions.diameter_km ? ` (D = ${activeRegionDossier.dimensions.diameter_km} km)` : ''}
                  </div>
                </div>

                <div style={{ background: '#121217', border: '1px solid #27272a', padding: '1rem', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#a1a1aa', fontWeight: 700, marginBottom: '0.3rem' }}>
                    AREOID TOPOGRAPHY SPAN
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                    {activeRegionDossier.elevation_range.min_elevation_m > 0 ? `+${activeRegionDossier.elevation_range.min_elevation_m}m` : `${activeRegionDossier.elevation_range.min_elevation_m}m`} to{' '}
                    {activeRegionDossier.elevation_range.max_elevation_m > 0 ? `+${activeRegionDossier.elevation_range.max_elevation_m}m` : `${activeRegionDossier.elevation_range.max_elevation_m}m`}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '0.3rem' }}>
                    Vertical Datum: Mars Gravitational Areoid
                  </div>
                </div>

                <div style={{ background: '#121217', border: '1px solid #27272a', padding: '1rem', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#a1a1aa', fontWeight: 700, marginBottom: '0.3rem' }}>
                    SURFACE MISSIONS & DATASETS
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                    {activeRegionDossier.missions.length} Missions • {activeRegionDossier.available_datasets.length} Products
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '0.3rem' }}>
                    {activeRegionDossier.missions.map((m) => m.spacecraft).join(', ') || 'No landed robotic assets to date'}
                  </div>
                </div>
              </div>

              {/* Two Column Detailed Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Left Column: Geology & Highlights */}
                <div style={{ background: '#121217', border: '1px solid #27272a', padding: '1.25rem', borderRadius: '4px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>
                    GEOLOGICAL SETTING & STRATIGRAPHY
                  </h3>
                  <p style={{ fontSize: '0.78rem', lineHeight: '1.6', color: '#d4d4d8', marginBottom: '1.2rem' }}>
                    {activeRegionDossier.geological_setting}
                  </p>

                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>
                    PRIMARY SCIENTIFIC OBJECTIVES & HIGHLIGHTS
                  </h3>
                  <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.76rem', color: '#d4d4d8', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {activeRegionDossier.scientific_highlights.map((item, idx) => (
                      <li key={idx} style={{ lineHeight: '1.5' }}>
                        {item}
                      </li>
                    ))}
                  </ul>

                  {activeRegionDossier.missions.length > 0 && (
                    <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid #27272a' }}>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.6rem' }}>
                        ROBOTIC EXPLORATION ASSETS
                      </h3>
                      {activeRegionDossier.missions.map((m, idx) => (
                        <div key={idx} style={{ fontSize: '0.74rem', color: '#a1a1aa', marginBottom: '0.3rem' }}>
                          <strong style={{ color: '#ffffff' }}>{m.spacecraft}</strong> ({m.mission_name}) • Landed: {m.landing_date} •{' '}
                          <span style={{ color: m.status.includes('Active') ? '#22c55e' : '#a1a1aa' }}>{m.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Available Datasets */}
                <div style={{ background: '#121217', border: '1px solid #27272a', padding: '1.25rem', borderRadius: '4px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>
                    AVAILABLE PLANETARY DATASETS ({activeRegionDossier.available_datasets.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {activeRegionDossier.available_datasets.map((ds) => (
                      <div
                        key={ds.product_id}
                        style={{
                          background: '#18181b',
                          border: '1px solid #27272a',
                          padding: '0.75rem',
                          borderRadius: '2px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff' }}>{ds.name}</span>
                          <span className={`badge ${ds.storage_type === 'VERIFIED_LOCAL' ? 'badge-observed' : 'badge-derived'}`} style={{ fontSize: '0.65rem' }}>
                            {ds.storage_type}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#a1a1aa', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                          <span>ID: <code style={{ color: '#ffffff' }}>{ds.product_id}</code></span>
                          <span>Resolution: <strong style={{ color: '#ffffff' }}>{ds.resolution}</strong></span>
                          <span>Instrument: {ds.instrument_mission}</span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', marginTop: '0.25rem' }}>
                          Portal: {ds.source_portal} • Scope: {ds.coverage_type}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* MAIN REGIONAL WORKSPACE: SIDEBAR + MAP + BOTTOM PANELS */}
          <div className="regional-mars-map-body">
        {/* LEFT CONTROL PANEL: 8-CATEGORY LAYER REGISTRY & ROVER TIMELINE */}
        <div className="regional-mars-sidebar">
          {/* Category Filter Tabs */}
          <div className="p-3 border-b border-neutral-800 bg-[#141414]">
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-mono mb-2">
              REGIONAL LAYER CATEGORIES
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-[#181818] border border-neutral-700 text-xs px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-white font-mono"
            >
              <option value="all">All 8 Regional Categories ({layers.length} Layers)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name} ({cat.count})
                </option>
              ))}
            </select>
          </div>

          {/* Active Layers List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs">
            {/* Base Imagery Layer Card */}
            {(selectedCategory === 'all' || selectedCategory === 'base-imagery') && (
              <div className="bg-[#181818] border border-neutral-800 p-2.5 rounded-none space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center space-x-1.5">
                    <span>📷</span>
                    <span>CTX 6m Orthomosaic</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={activeLayers.reg_ctx_mosaic ?? true}
                    onChange={() => toggleLayer('reg_ctx_mosaic')}
                    className="accent-white cursor-pointer"
                  />
                </div>
                <div className="text-[10px] text-neutral-400">
                  USGS TRN Project • 6m Native Surface Reflectance
                </div>
                {activeLayers.reg_ctx_mosaic && (
                  <div className="flex items-center space-x-2 pt-1 text-[10px] text-neutral-400">
                    <span>Opacity</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={layerOpacity.reg_ctx_mosaic ?? 1.0}
                      onChange={(e) => updateOpacity('reg_ctx_mosaic', parseFloat(e.target.value))}
                      className="w-full accent-white"
                    />
                    <span>{Math.round((layerOpacity.reg_ctx_mosaic ?? 1.0) * 100)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Elevation / DTM Layer Card */}
            {(selectedCategory === 'all' || selectedCategory === 'elevation-topography') && (
              <div className="bg-[#181818] border border-neutral-800 p-2.5 rounded-none space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center space-x-1.5">
                    <span>⛰️</span>
                    <span>CTX 20m DTM (Elevation)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={activeLayers.reg_ctx_20m_dtm ?? false}
                    onChange={() => toggleLayer('reg_ctx_20m_dtm')}
                    className="accent-white cursor-pointer"
                  />
                </div>
                <div className="text-[10px] text-neutral-400">
                  Photogrammetric DTM • Mars Areoid Reference Datum
                </div>
                {activeLayers.reg_ctx_20m_dtm && (
                  <div className="flex items-center space-x-2 pt-1 text-[10px] text-neutral-400">
                    <span>Opacity</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={layerOpacity.reg_ctx_20m_dtm ?? 0.65}
                      onChange={(e) => updateOpacity('reg_ctx_20m_dtm', parseFloat(e.target.value))}
                      className="w-full accent-white"
                    />
                    <span>{Math.round((layerOpacity.reg_ctx_20m_dtm ?? 0.65) * 100)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Geological Mapping (USGS SIM-3464) */}
            {(selectedCategory === 'all' || selectedCategory === 'geological-mapping') && (
              <div className="bg-[#181818] border border-neutral-800 p-2.5 rounded-none space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center space-x-1.5">
                    <span>🗺️</span>
                    <span>USGS Geology (SIM-3464)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={activeLayers.reg_usgs_geology ?? true}
                    onChange={() => toggleLayer('reg_usgs_geology')}
                    className="accent-white cursor-pointer"
                  />
                </div>
                <div className="text-[10px] text-neutral-400">
                  Sun & Stack (2020) • 1:75,000 Stratigraphic Formations
                </div>
                {activeLayers.reg_usgs_geology && (
                  <>
                    <div className="flex items-center space-x-2 pt-1 text-[10px] text-neutral-400">
                      <span>Opacity</span>
                      <input
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={layerOpacity.reg_usgs_geology ?? 0.55}
                        onChange={(e) =>
                          updateOpacity('reg_usgs_geology', parseFloat(e.target.value))
                        }
                        className="w-full accent-white"
                      />
                      <span>{Math.round((layerOpacity.reg_usgs_geology ?? 0.55) * 100)}%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 pt-1">
                      {geologyUnits.map((u) => {
                        const sym = u.official_sim3464_symbol || u.symbol
                        const alias = u.legacy_symbol || u.alias_symbols?.[0]
                        return (
                          <button
                            key={u.symbol}
                            onClick={() => setSelectedEntity({ type: 'geology', data: u })}
                            className="flex items-center space-x-1 p-1 bg-[#202020] border border-neutral-700 hover:border-neutral-400 text-left"
                            title={`${sym} (${u.name}) — Legacy code: ${alias || 'none'}`}
                          >
                            <span
                              className="w-2.5 h-2.5 shrink-0"
                              style={{ backgroundColor: u.color_hex }}
                            />
                            <span className="text-[9px] text-neutral-300 font-bold truncate">
                              {sym}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* CRISM Mineralogy */}
            {(selectedCategory === 'all' || selectedCategory === 'mineralogical-data') && (
              <div className="bg-[#181818] border border-neutral-800 p-2.5 rounded-none space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center space-x-1.5">
                    <span>🔬</span>
                    <span>CRISM Mineral Footprints</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={activeLayers.reg_crism_observations ?? true}
                    onChange={() => toggleLayer('reg_crism_observations')}
                    className="accent-white cursor-pointer"
                  />
                </div>
                <div className="text-[10px] text-neutral-400">
                  Targeted Hyperspectral Cubes • Clay, Olivine, Carbonate
                </div>
                {activeLayers.reg_crism_observations && (
                  <div className="space-y-1 pt-1">
                    {crismObs.map((obs) => (
                      <button
                        key={obs.product_id}
                        onClick={() => setSelectedEntity({ type: 'crism', data: obs })}
                        className="w-full text-left text-[10px] p-1.5 bg-[#202020] border border-neutral-800 hover:border-neutral-500 text-neutral-300 flex items-center justify-between"
                      >
                        <span className="font-bold text-cyan-400">{obs.product_id}</span>
                        <span className="text-[9px] text-neutral-400 truncate max-w-[140px]">
                          {obs.target_description}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Perseverance Rover Exploration */}
            {(selectedCategory === 'all' || selectedCategory === 'rover-exploration') && (
              <div className="bg-[#181818] border border-neutral-800 p-2.5 rounded-none space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center space-x-1.5">
                    <span>🤖</span>
                    <span>Perseverance Traverse & Depot</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={activeLayers.reg_m20_traverse ?? true}
                    onChange={() => toggleLayer('reg_m20_traverse')}
                    className="accent-white cursor-pointer"
                  />
                </div>

                {/* Sol Range Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-neutral-400">
                    <span>EXPLORATION TIMELINE</span>
                    <span className="text-white font-bold">SOL {solRange}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxAvailableSol}
                    step={10}
                    value={solRange}
                    onChange={(e) => setSolRange(parseInt(e.target.value))}
                    className="w-full accent-white"
                  />
                  <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                    <span>Landing (Sol 0)</span>
                    <span>Current (~Sol {maxAvailableSol})</span>
                  </div>
                </div>

                {/* Sub-toggles for waypoints & sample cores */}
                <div className="pt-1 border-t border-neutral-800 space-y-1.5 text-[11px]">
                  <label className="flex items-center justify-between cursor-pointer text-neutral-300">
                    <span>Localization Waypoints</span>
                    <input
                      type="checkbox"
                      checked={activeLayers.reg_m20_waypoints ?? false}
                      onChange={() => toggleLayer('reg_m20_waypoints')}
                      className="accent-white"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer text-neutral-300">
                    <span>Sample Cores & Depot ({sampleCores.length})</span>
                    <input
                      type="checkbox"
                      checked={activeLayers.reg_m20_samples ?? true}
                      onChange={() => toggleLayer('reg_m20_samples')}
                      className="accent-white"
                    />
                  </label>
                  <div className="text-[9px] text-neutral-500 pt-1 leading-tight border-t border-neutral-900">
                    Localization: Visual odometry & HiRISE image registration (Sols 14–2022, 45.25 km). No GPS.
                  </div>
                </div>
              </div>
            )}

            {/* Coverage & Footprints */}
            {(selectedCategory === 'all' || selectedCategory === 'coverage-uncertainty') && (
              <div className="bg-[#181818] border border-neutral-800 p-2.5 rounded-none space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center space-x-1.5">
                    <span>🛡️</span>
                    <span>HiRISE 1m DTM Footprint</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={activeLayers.reg_hirise_footprint ?? true}
                    onChange={() => toggleLayer('reg_hirise_footprint')}
                    className="accent-white cursor-pointer"
                  />
                </div>
                <div className="text-[10px] text-neutral-400">
                  Delta Mosaic Spatial Boundary • 1.0m Pixel Resolution
                </div>
              </div>
            )}
          </div>

          {/* Non-operational robotic disclaimer */}
          <div className="p-2.5 bg-[#141414] border-t border-neutral-800 text-[9px] font-mono text-neutral-500 leading-tight">
            ⚠️ <strong>EPISTEMIC NOTICE:</strong> Rover telemetry represents robotic exploration.
            Traverse history does not certify operational astronaut safety.
          </div>
        </div>

        {/* CENTER / LEAFLET MAP CANVAS */}
        <div className="regional-mars-canvas-container">
          <div ref={mapContainerRef} className="regional-mars-canvas" />

          {/* Loading Overlay */}
          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1200,
                background: 'rgba(9, 9, 9, 0.85)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  border: '2px solid #ffffff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '1rem',
                }}
              />
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#f5f5f5',
                }}
              >
                INITIALIZING JEZERO REGIONAL GEOSPATIAL INTELLIGENCE SYSTEM...
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  color: '#737373',
                  marginTop: '0.25rem',
                }}
              >
                Loading CTX 6m Mosaics, USGS SIM-3464 Formations, CRISM Spectra & M20 Telemetry
              </div>
            </div>
          )}

          {/* TELEMETRY HUD (TOP-RIGHT) */}
          <div className="global-map-panel global-map-panel-top-right">
            <div className="text-neutral-400 text-[10px] uppercase tracking-wider flex justify-between items-center border-b border-neutral-800 pb-1">
              <span>TELEMETRY HUD</span>
              <span className="text-emerald-400">● LIVE</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">CURSOR LAT:</span>
              <span className="text-white font-bold">
                {cursorCoords ? `${cursorCoords.lat.toFixed(5)}°N` : '--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">CURSOR LON:</span>
              <span className="text-white font-bold">
                {cursorCoords ? `${cursorCoords.lon.toFixed(5)}°E` : '--'}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-neutral-800">
              <span className="text-neutral-500">ELEVATION:</span>
              <span className="text-cyan-400 font-bold">
                {elevationSample ? `${elevationSample.elevation_m.toFixed(1)} m` : '--'}
              </span>
            </div>
            {elevationSample && (
              <div className="text-[9px] text-neutral-400 pt-0.5">
                SRC: {elevationSample.source_product} ({elevationSample.scale_tier})
              </div>
            )}
            {isSampling && (
              <div className="text-[9px] text-neutral-400 animate-pulse">
                Querying multi-scale DTM rasters...
              </div>
            )}
          </div>

          {/* TRANSECT PROFILING INSTRUCTION BANNER */}
          {isProfilingActive && (
            <div className="global-map-panel global-map-panel-top-left">
              <div className="font-bold text-white uppercase flex items-center justify-between">
                <span>📐 TRANSECT PROFILE MEASUREMENT</span>
                <button
                  onClick={() => {
                    setIsProfilingActive(false)
                    setProfilePoints([])
                    setElevationProfile(null)
                  }}
                  className="text-neutral-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="text-[11px] text-neutral-300">
                {profileLoading && (
                  <span className="text-cyan-400 animate-pulse">
                    Sampling multi-scale DTMs and computing cross-section...
                  </span>
                )}
                {!profileLoading && profilePoints.length === 0 && 'Click map to define transect START coordinate.'}
                {!profileLoading && profilePoints.length === 1 && 'Click map to define transect END coordinate.'}
                {!profileLoading && profilePoints.length === 2 && 'Transect profile generated.'}
              </div>

              {/* Quick Presets */}
              <div className="pt-2 border-t border-neutral-800 space-y-1">
                <div className="text-[10px] text-neutral-500 uppercase">Scientific Presets:</div>
                <div className="grid grid-cols-1 gap-1">
                  <button
                    onClick={() => applyPresetTransect([18.42, 77.36], [18.46, 77.44])}
                    className="text-[10px] text-left p-1 bg-[#181818] border border-neutral-800 hover:border-neutral-500 text-neutral-300"
                  >
                    • Kodiak Remnant Butte → Crater Floor (Máaz)
                  </button>
                  <button
                    onClick={() => applyPresetTransect([18.39, 77.33], [18.45, 77.41])}
                    className="text-[10px] text-left p-1 bg-[#181818] border border-neutral-800 hover:border-neutral-500 text-neutral-300"
                  >
                    • Neretva Gorge Inflow Chute → Delta Front Scarp
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LAYER COMPARISON OVERLAY TOOL */}
          {showCompareTool && (
            <div className="global-map-panel global-map-panel-bottom-left" style={{ width: '380px' }}>
              <div className="flex items-center justify-between font-bold text-white uppercase border-b border-neutral-800 pb-1.5">
                <span>⚖️ REGIONAL LAYER COMPARISON</span>
                <button
                  onClick={() => setShowCompareTool(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-neutral-400 text-[10px] mb-1">LAYER A (LEFT):</div>
                  <select
                    value={compareLayerA}
                    onChange={(e) => setCompareLayerA(e.target.value)}
                    className="w-full bg-[#181818] border border-neutral-700 text-neutral-200 p-1 font-mono text-[10px]"
                  >
                    <option value="reg_ctx_mosaic">CTX 6m Orthomosaic</option>
                    <option value="reg_ctx_20m_dtm">CTX 20m DTM</option>
                    <option value="reg_hirise_1m_dtm">HiRISE 1m DTM</option>
                  </select>
                </div>
                <div>
                  <div className="text-neutral-400 text-[10px] mb-1">LAYER B (RIGHT):</div>
                  <select
                    value={compareLayerB}
                    onChange={(e) => setCompareLayerB(e.target.value)}
                    className="w-full bg-[#181818] border border-neutral-700 text-neutral-200 p-1 font-mono text-[10px]"
                  >
                    <option value="reg_ctx_20m_dtm">CTX 20m DTM</option>
                    <option value="reg_hirise_1m_dtm">HiRISE 1m DTM</option>
                    <option value="reg_ctx_mosaic">CTX 6m Orthomosaic</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleRunComparison}
                className="w-full py-1 bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200"
              >
                COMPARE SPATIAL OVERLAP
              </button>

              {compareResult && (
                <div className="p-2 bg-[#181818] border border-neutral-800 text-[10px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">OVERLAP STATUS:</span>
                    <span
                      className={
                        compareResult.has_spatial_overlap ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {compareResult.has_spatial_overlap ? 'VALID SPATIAL OVERLAP' : 'NO OVERLAP'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">OVERLAP AREA:</span>
                    <span className="text-white">{compareResult.overlap_area_km2} km²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">RESOLUTION RATIO (A:B):</span>
                    <span className="text-white">
                      {compareResult.resolution_ratio_a_to_b ?? 'N/A'}x
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RIGHT-SIDE ENTITY INSPECTION DRAWER */}
          {selectedEntity && (
            <div className="global-map-provenance-drawer">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="font-bold text-white uppercase tracking-wider">
                  {selectedEntity.type === 'geology' && 'GEOLOGIC FORMATION'}
                  {selectedEntity.type === 'crism' && 'CRISM SPECTRAL DATA'}
                  {selectedEntity.type === 'sample' && 'SAMPLE CORE RECORD'}
                  {selectedEntity.type === 'waypoint' && 'ROVER WAYPOINT'}
                </span>
                <button
                  onClick={() => setSelectedEntity(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Geological Unit Details */}
              {selectedEntity.type === 'geology' && (
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-3.5 h-3.5 border border-white shrink-0"
                      style={{ backgroundColor: selectedEntity.data.color_hex }}
                    />
                    <div>
                      <div className="font-bold text-white text-sm">
                        {selectedEntity.data.official_sim3464_symbol || selectedEntity.data.symbol}: {selectedEntity.data.name}
                      </div>
                      {selectedEntity.data.alias_symbols && selectedEntity.data.alias_symbols.length > 0 && (
                        <div className="text-[10px] text-neutral-400">
                          Legacy draft aliases: {selectedEntity.data.alias_symbols.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-neutral-400">
                    Formation: <span className="text-white">{selectedEntity.data.formation_name}</span>
                  </div>
                  <div className="text-neutral-400">
                    Epoch: <span className="text-white">{selectedEntity.data.epoch}</span>
                  </div>
                  <div className="text-neutral-400">
                    Area: <span className="text-white">{selectedEntity.data.area_km2} km²</span>
                  </div>
                  <div className="pt-1 border-t border-neutral-800">
                    <span className="text-neutral-500 uppercase text-[10px]">Dominant Lithology</span>
                    <div className="text-neutral-200 mt-0.5">
                      {selectedEntity.data.dominant_lithology}
                    </div>
                  </div>
                  <div>
                    <span className="text-neutral-500 uppercase text-[10px]">Key Diagnostic Minerals</span>
                    <ul className="list-disc list-inside text-cyan-300 mt-0.5 space-y-0.5">
                      {selectedEntity.data.key_minerals.map((m: string) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-neutral-500 uppercase text-[10px]">Traversability Risk (Marswalk Heuristic)</span>
                    <div className="text-amber-300 mt-0.5">
                      {selectedEntity.data.traversability_risk_heuristic || selectedEntity.data.traversability_risk}
                    </div>
                  </div>
                  <div>
                    <span className="text-neutral-500 uppercase text-[10px]">EVA Science Priority (Marswalk Heuristic)</span>
                    <div className="text-emerald-400 mt-0.5">
                      {selectedEntity.data.eva_science_priority_heuristic || selectedEntity.data.eva_science_priority}
                    </div>
                    {selectedEntity.data.planning_evaluation_caveat && (
                      <div className="text-[10px] text-neutral-400 italic mt-1 leading-tight">
                        {selectedEntity.data.planning_evaluation_caveat}
                      </div>
                    )}
                  </div>
                  {selectedEntity.data.sample_cores_collected && selectedEntity.data.sample_cores_collected.length > 0 && (
                    <div>
                      <span className="text-neutral-500 uppercase text-[10px]">
                        Perseverance Samples Collected
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedEntity.data.sample_cores_collected.map((c: string) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 bg-[#202020] border border-neutral-700 text-white text-[10px]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CRISM Details */}
              {selectedEntity.type === 'crism' && (
                <div className="space-y-2 text-[11px]">
                  <div className="font-bold text-cyan-400 text-sm">
                    {selectedEntity.data.product_id}
                  </div>
                  <div className="text-neutral-400">
                    Type: <span className="text-white">{selectedEntity.data.observation_type}</span>
                  </div>
                  <div className="text-neutral-400">
                    Resolution:{' '}
                    <span className="text-white">
                      {selectedEntity.data.projected_spatial_resolution_m
                        ? `${selectedEntity.data.projected_spatial_resolution_m} m/px projected (nominal ${selectedEntity.data.nominal_spatial_resolution_m || selectedEntity.data.spatial_resolution_m} m/px)`
                        : `${selectedEntity.data.spatial_resolution_m} m/px`}
                    </span>
                  </div>
                  <div className="text-neutral-400">
                    Spectral Channels:{' '}
                    <span className="text-white">545 bands (VNIR 0.36–1.05 µm, IR 1.0–3.92 µm)</span>
                  </div>
                  <div className="text-neutral-400">
                    Target:{' '}
                    <span className="text-white">{selectedEntity.data.target_description}</span>
                  </div>
                  <div className="pt-1 border-t border-neutral-800">
                    <span className="text-neutral-500 uppercase text-[10px]">
                      Aqueous Spectral Signatures
                    </span>
                    <ul className="list-disc list-inside text-cyan-300 mt-0.5 space-y-1">
                      {selectedEntity.data.spectral_detections.map((s: string) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="pt-2 text-[10px] text-neutral-500">
                    Pipeline: {selectedEntity.data.processing_level}
                  </div>
                  {selectedEntity.data.notes && (
                    <div className="text-[10px] text-neutral-400 italic">
                      {selectedEntity.data.notes}
                    </div>
                  )}
                  <a
                    href={selectedEntity.data.archive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 px-2.5 py-1 bg-[#181818] border border-neutral-700 text-neutral-300 hover:text-white text-[10px] uppercase"
                  >
                    View in PDS Geosciences Archive ↗
                  </a>
                </div>
              )}

              {/* Sample Core Details */}
              {selectedEntity.type === 'sample' && (
                <div className="space-y-2 text-[11px]">
                  <div className="font-bold text-amber-400 text-sm">
                    {selectedEntity.data.sample_id}: {selectedEntity.data.sample_name}
                  </div>
                  {selectedEntity.data.tube_id && (
                    <div className="text-neutral-400">
                      Hardware ID: <span className="text-white">{selectedEntity.data.tube_id}</span>
                    </div>
                  )}
                  <div className="text-neutral-400">
                    Sol Collected: <span className="text-white">{selectedEntity.data.sol_collected}</span>
                  </div>
                  <div className="text-neutral-400">
                    Rock Type: <span className="text-white">{selectedEntity.data.target_rock_type}</span>
                  </div>
                  <div className="text-neutral-400">
                    Unit: <span className="text-white">{selectedEntity.data.geologic_unit}</span>
                  </div>
                  <div className="text-neutral-400">
                    Elevation:{' '}
                    <span className="text-white">
                      {selectedEntity.data.elevation_areoid_m.toFixed(1)} m
                    </span>
                  </div>
                  <div className="p-2 bg-[#181818] border border-neutral-800">
                    <span className="text-neutral-500 uppercase text-[10px]">Cache / Depot Location</span>
                    <div className="text-cyan-400 font-bold mt-0.5">
                      {selectedEntity.data.depot_location}
                    </div>
                    {selectedEntity.data.paired_with && (
                      <div className="text-[10px] text-neutral-400 mt-1">
                        Paired with: <span className="text-cyan-300">{selectedEntity.data.paired_with}</span>
                      </div>
                    )}
                    {selectedEntity.data.notes && (
                      <div className="text-[10px] text-neutral-400 italic mt-1 leading-tight">
                        {selectedEntity.data.notes}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ELEVATION TRANSECT CROSS-SECTION PROFILE DRAWER */}
      {elevationProfile && (
        <div className="h-44 bg-[#111111] border-t border-neutral-800 px-4 py-2.5 flex flex-col font-mono text-xs z-20">
          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-800 text-[11px]">
            <div className="flex items-center space-x-3">
              <span className="font-bold text-white">TOPOGRAPHIC ELEVATION TRANSECT</span>
              <span className="text-neutral-400">
                Length: {Math.round(elevationProfile.transect.total_distance_m)} m (
                {elevationProfile.transect.num_points} samples)
              </span>
              <span className="text-neutral-400">
                Min: {elevationProfile.summary.elev_min_m} m • Max:{' '}
                {elevationProfile.summary.elev_max_m} m • Relief:{' '}
                {elevationProfile.summary.elev_relief_m} m
              </span>
              <span className="text-neutral-400">
                Ascent: {elevationProfile.summary.total_ascent_m} m • Descent:{' '}
                {elevationProfile.summary.total_descent_m} m
              </span>
            </div>
            <button
              onClick={() => setElevationProfile(null)}
              className="text-neutral-400 hover:text-white"
            >
              ✕ CLOSE
            </button>
          </div>

          {/* SVG Elevation Cross-Section Graph */}
          <div className="flex-1 w-full pt-1.5 relative">
            <svg className="w-full h-full overflow-visible">
              {(() => {
                const pts = elevationProfile.points
                if (pts.length < 2) return null
                const minElev = elevationProfile.summary.elev_min_m
                const maxElev = elevationProfile.summary.elev_max_m
                const range = maxElev - minElev || 1
                const maxDist = elevationProfile.transect.total_distance_m || 1

                const pointsStr = pts
                  .map((p) => {
                    const xPercent = (p.distance_m / maxDist) * 100
                    const yPercent = 90 - ((p.elevation_m - minElev) / range) * 80
                    return `${xPercent}%,${yPercent}%`
                  })
                  .join(' ')

                return (
                  <>
                    <polyline
                      fill="none"
                      stroke="#00e5ff"
                      strokeWidth="2"
                      points={pointsStr}
                    />
                    <polygon
                      fill="rgba(0, 229, 255, 0.15)"
                      points={`0%,100% ${pointsStr} 100%,100%`}
                    />
                  </>
                )
              })()}
            </svg>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
