import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  fetchGlobalBasemaps,
  fetchPlanetaryFeatures,
  fetchLandingSites,
  fetchNavigationTargets,
  sampleGlobalElevation,
  fetchGlobalGeology,
  fetchLayerCoverage,
  type GlobalBasemap,
  type PlanetaryFeature,
  type MarsLandingSite,
  type NavigationTarget,
  type GlobalElevationSample,
  type GlobalGeologicUnitDTO,
  type LayerCoverageDTO,
} from '../api/atlas'

interface GlobalMarsMapProps {
  onEnterJezero?: () => void
  onSelectCoordinates?: (coords: { lat: number; lon: number }) => void
}

export function GlobalMarsMap({ onEnterJezero, onSelectCoordinates }: GlobalMarsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const activeTileLayerRef = useRef<L.TileLayer | L.TileLayer.WMS | null>(null)
  const featuresLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const landingSitesGroupRef = useRef<L.LayerGroup | null>(null)
  const geologyLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const jezeroPolygonRef = useRef<L.Rectangle | null>(null)
  const clickMarkerRef = useRef<L.CircleMarker | null>(null)

  // Remote data state
  const [basemaps, setBasemaps] = useState<GlobalBasemap[]>([])
  const [selectedBasemapId, setSelectedBasemapId] = useState<string>('mola_shaded_relief')
  const [basemapOpacity, setBasemapOpacity] = useState<number>(1.0)
  const [features, setFeatures] = useState<PlanetaryFeature[]>([])
  const [landingSites, setLandingSites] = useState<MarsLandingSite[]>([])
  const [navTargets, setNavTargets] = useState<NavigationTarget[]>([])
  const [geologyUnits, setGeologyUnits] = useState<GlobalGeologicUnitDTO[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Overlay visibility toggles
  const [showFeatures, setShowFeatures] = useState<boolean>(true)
  const [showLandingSites, setShowLandingSites] = useState<boolean>(true)
  const [showGeology, setShowGeology] = useState<boolean>(false)
  const [geologyOpacity, setGeologyOpacity] = useState<number>(0.65)
  const [showJezeroBounds, setShowJezeroBounds] = useState<boolean>(true)

  // Telemetry HUD & Sampling
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [elevationSample, setElevationSample] = useState<GlobalElevationSample | null>(null)
  const [coverageData, setCoverageData] = useState<LayerCoverageDTO | null>(null)
  const [samplingLoading, setSamplingLoading] = useState<boolean>(false)
  const [selectedEntity, setSelectedEntity] = useState<PlanetaryFeature | MarsLandingSite | GlobalGeologicUnitDTO | null>(null)

  // Search & Navigation input state
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<Array<PlanetaryFeature | MarsLandingSite>>([])
  const [coordInputLat, setCoordInputLat] = useState<string>('')
  const [coordInputLon, setCoordInputLon] = useState<string>('')
  const [coordError, setCoordError] = useState<string | null>(null)

  // UI Drawer / Info Panels
  const [showInfoPanel, setShowInfoPanel] = useState<boolean>(false)
  const [showLegend, setShowLegend] = useState<boolean>(true)
  const [currentZoom, setCurrentZoom] = useState<number>(3)
  const [tileStats, setTileStats] = useState<{ total: number; loaded: number; failed: number }>({
    total: 0,
    loaded: 0,
    failed: 0,
  })

  // Load backend catalog data
  useEffect(() => {
    let cancelled = false
    async function loadData() {
      try {
        const [basemapRes, featureRes, landingRes, targetRes, geoRes] = await Promise.all([
          fetchGlobalBasemaps(),
          fetchPlanetaryFeatures(),
          fetchLandingSites(),
          fetchNavigationTargets(),
          fetchGlobalGeology(),
        ])
        if (cancelled) return
        setBasemaps(basemapRes.basemaps || [])
        setFeatures(featureRes.features)
        setLandingSites(landingRes.landing_sites)
        setNavTargets(targetRes.targets)
        setGeologyUnits(geoRes.units)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load planetary atlas data')
        setLoading(false)
      }
    }
    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  // Handle elevation & coverage sampling at coordinates
  const handleSampleAtCoords = useCallback(async (lat: number, lon: number) => {
    setSamplingLoading(true)
    try {
      const [elev, cov] = await Promise.all([
        sampleGlobalElevation(lat, lon),
        fetchLayerCoverage(lat, lon),
      ])
      setElevationSample(elev)
      setCoverageData(cov)
    } catch {
      // Non-fatal if sample fails
    } finally {
      setSamplingLoading(false)
    }
  }, [])

  // Initialize Global Leaflet Map in Mars Plate Carrée CRS (EPSG:4326)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    // Mars Equirectangular Projection on IAU 2015 Sphere (R = 3,396,190 m)
    const map = L.map(mapContainerRef.current, {
      crs: L.CRS.EPSG4326,
      center: [18.4485, 77.4320], // Default centered on Jezero Crater region
      zoom: 3,
      minZoom: 1,
      maxZoom: 12,
      attributionControl: false,
      worldCopyJump: false,
    })

    // Track zoom level
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom())
    })

    // Track mouse coordinates in Mars canonical frame
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      let lon = e.latlng.lng % 360
      if (lon > 180) lon -= 360
      if (lon < -180) lon += 360
      setCursorCoords({ lat: e.latlng.lat, lon })
    })

    map.on('mouseout', () => {
      setCursorCoords(null)
    })

    // Click handler for elevation sampling & pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      let lon = e.latlng.lng % 360
      if (lon > 180) lon -= 360
      if (lon < -180) lon += 360

      // Update click marker
      if (clickMarkerRef.current) {
        clickMarkerRef.current.setLatLng(e.latlng)
      } else {
        clickMarkerRef.current = L.circleMarker(e.latlng, {
          radius: 5,
          color: '#ffffff',
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 0.8,
        }).addTo(map)
      }

      handleSampleAtCoords(e.latlng.lat, lon)
      onSelectCoordinates?.({ lat: e.latlng.lat, lon })
    })

    // Create layer groups
    const featGroup = L.layerGroup().addTo(map)
    const landGroup = L.layerGroup().addTo(map)
    const geoGroup = L.layerGroup().addTo(map)
    featuresLayerGroupRef.current = featGroup
    landingSitesGroupRef.current = landGroup
    geologyLayerGroupRef.current = geoGroup

    // Add Jezero study area highlight polygon
    const jezeroBounds: [[number, number], [number, number]] = [
      [18.39180, 77.34370],
      [18.58953, 77.46584],
    ]
    const jezeroRect = L.rectangle(jezeroBounds, {
      color: '#ffffff',
      weight: 2,
      dashArray: '5, 5',
      fillColor: '#ffffff',
      fillOpacity: 0.08,
    }).addTo(map)

    jezeroRect.bindTooltip(
      '<div style="font-family: monospace; font-size: 11px; font-weight: bold; color: #fff;">MARSWALK DIGITAL TWIN<br/><span style="color: #a3a3a3; font-weight: normal;">1m HiRISE & 20m Aligned Analysis Grid</span></div>',
      { permanent: false, direction: 'top', className: 'mars-mono-tooltip' }
    )

    jezeroPolygonRef.current = jezeroRect
    mapInstanceRef.current = map

    // Ensure Leaflet correctly calculates container dimensions
    const resizeTimer = setTimeout(() => {
      map.invalidateSize()
    }, 150)

    // Initial elevation sample at Jezero
    handleSampleAtCoords(18.4485, 77.4320)

    return () => {
      clearTimeout(resizeTimer)
      map.remove()
      mapInstanceRef.current = null
    }
  }, [handleSampleAtCoords, onSelectCoordinates])

  // Update Basemap Layer when selection or opacity changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || basemaps.length === 0) return

    const selected = basemaps.find((b) => b.id === selectedBasemapId) || basemaps[0]
    if (!selected) return

    // Remove old layer
    if (activeTileLayerRef.current) {
      map.removeLayer(activeTileLayerRef.current)
      activeTileLayerRef.current = null
    }

    const attachTileEvents = (tileLayer: L.TileLayer | L.TileLayer.WMS) => {
      tileLayer.on('tileloadstart', () => {
        setTileStats((prev) => ({ ...prev, total: prev.total + 1 }))
      })
      tileLayer.on('tileload', () => {
        setTileStats((prev) => ({ ...prev, loaded: prev.loaded + 1 }))
      })
      tileLayer.on('tileerror', () => {
        setTileStats((prev) => ({ ...prev, failed: prev.failed + 1 }))
      })
    }

    if (selected.service_type === 'WMS' && selected.wms_url && selected.wms_layers) {
      // USGS Astrogeology OpenGIS WMS
      const wmsLayer = L.tileLayer.wms(selected.wms_url, {
        layers: selected.wms_layers,
        format: selected.format || 'image/jpeg',
        transparent: false,
        version: '1.1.1',
        maxNativeZoom: 7,
        maxZoom: 16,
        bounds: [[-90, -180], [90, 180]],
        opacity: basemapOpacity,
      }).addTo(map)
      attachTileEvents(wmsLayer)
      activeTileLayerRef.current = wmsLayer
    } else if (selected.service_type === 'WMTS' && selected.wmts_tile_url) {
      // NASA Trek WMTS tile server
      const wmtsLayer = L.tileLayer(selected.wmts_tile_url, {
        maxNativeZoom: 7,
        maxZoom: 16,
        noWrap: false,
        bounds: [[-90, -180], [90, 180]],
        tms: false,
        opacity: basemapOpacity,
      }).addTo(map)
      attachTileEvents(wmtsLayer)
      activeTileLayerRef.current = wmtsLayer
    }
  }, [selectedBasemapId, basemaps, basemapOpacity])

  // Render IAU Planetary Features overlay
  useEffect(() => {
    const group = featuresLayerGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!showFeatures) return

    features.forEach((feat) => {
      const customIcon = L.divIcon({
        className: 'custom-feature-marker',
        html: `
          <div style="display: flex; align-items: center; gap: 4px; background: rgba(17, 17, 17, 0.90); border: 1px solid #737373; padding: 2px 6px; border-radius: 2px; white-space: nowrap; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">
            <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
            <span style="font-family: monospace; font-size: 10px; color: #f5f5f5; font-weight: 600;">${feat.name}</span>
          </div>
        `,
        iconSize: [80, 20],
        iconAnchor: [40, 10],
      })

      const marker = L.marker([feat.lat, feat.lon], { icon: customIcon })
      marker.on('click', () => {
        setSelectedEntity(feat)
        handleSampleAtCoords(feat.lat, feat.lon)
      })

      const elevText = feat.elevation_areoid_m !== null
        ? `${feat.elevation_areoid_m > 0 ? '+' : ''}${Math.round(feat.elevation_areoid_m).toLocaleString()} m`
        : 'N/A'

      marker.bindPopup(`
        <div style="background: #181818; color: #f5f5f5; padding: 8px; font-family: monospace; font-size: 11px; border: 1px solid #303030; min-width: 220px;">
          <div style="font-weight: bold; font-size: 12px; margin-bottom: 4px; border-bottom: 1px solid #303030; padding-bottom: 2px;">
            ${feat.name}
          </div>
          <div style="color: #a3a3a3; margin-bottom: 4px;">${feat.feature_type}</div>
          <div style="margin-bottom: 2px;"><span style="color: #737373;">Coords:</span> ${feat.lat.toFixed(2)}°N, ${feat.lon.toFixed(2)}°E</div>
          <div style="margin-bottom: 2px;"><span style="color: #737373;">Diameter:</span> ${feat.diameter_km} km</div>
          <div style="margin-bottom: 4px;"><span style="color: #737373;">Elevation (MOLA):</span> ${elevText}</div>
          <div style="font-size: 10px; color: #a3a3a3; line-height: 1.3;">${feat.description}</div>
        </div>
      `, { className: 'mars-dark-popup' })

      group.addLayer(marker)
    })
  }, [features, showFeatures, handleSampleAtCoords])

  // Render Historical Landing Sites overlay
  useEffect(() => {
    const group = landingSitesGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!showLandingSites) return

    landingSites.forEach((site) => {
      const isActive = site.status.toLowerCase().includes('active')
      const customIcon = L.divIcon({
        className: 'custom-landing-marker',
        html: `
          <div style="display: flex; align-items: center; gap: 4px; background: rgba(9, 9, 9, 0.92); border: 1px solid ${isActive ? '#ffffff' : '#525252'}; padding: 2px 6px; border-radius: 2px; white-space: nowrap; cursor: pointer;">
            <div style="width: 6px; height: 6px; border: 1px solid #ffffff; background: ${isActive ? '#ffffff' : 'transparent'};"></div>
            <span style="font-family: monospace; font-size: 9px; color: ${isActive ? '#ffffff' : '#a3a3a3'}; font-weight: ${isActive ? 'bold' : 'normal'};">
              ${site.mission}
            </span>
          </div>
        `,
        iconSize: [80, 20],
        iconAnchor: [40, 10],
      })

      const marker = L.marker([site.lat, site.lon], { icon: customIcon })
      marker.on('click', () => {
        setSelectedEntity(site)
        handleSampleAtCoords(site.lat, site.lon)
      })

      marker.bindPopup(`
        <div style="background: #181818; color: #f5f5f5; padding: 8px; font-family: monospace; font-size: 11px; border: 1px solid #303030; min-width: 240px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #303030; padding-bottom: 2px; margin-bottom: 4px;">
            <span style="font-weight: bold; font-size: 12px;">${site.craft_name}</span>
            <span style="font-size: 9px; padding: 1px 4px; background: ${isActive ? '#ffffff' : '#303030'}; color: ${isActive ? '#000000' : '#a3a3a3'}; font-weight: bold;">${site.status}</span>
          </div>
          <div style="color: #a3a3a3; margin-bottom: 2px;"><span style="color: #737373;">Agency:</span> ${site.agency}</div>
          <div style="margin-bottom: 2px;"><span style="color: #737373;">Target:</span> ${site.target_region}</div>
          <div style="margin-bottom: 2px;"><span style="color: #737373;">Landed:</span> ${site.landing_date}</div>
          <div style="margin-bottom: 4px;"><span style="color: #737373;">Datum Elev:</span> ${Math.round(site.elevation_areoid_m).toLocaleString()} m</div>
          <div style="font-size: 10px; color: #a3a3a3; line-height: 1.3;">${site.description}</div>
        </div>
      `, { className: 'mars-dark-popup' })

      group.addLayer(marker)
    })
  }, [landingSites, showLandingSites, handleSampleAtCoords])

  // Render USGS SIM-3292 Global Geology Regions
  useEffect(() => {
    const group = geologyLayerGroupRef.current
    if (!group) return
    group.clearLayers()

    if (!showGeology) return

    // Canonical representative bounding boxes for USGS SIM-3292 global units
    const globalGeologyProvinces = [
      {
        unit: 'lAv',
        bounds: [[12.0, -145.0], [25.0, -120.0]] as [[number, number], [number, number]],
        title: 'Olympus Mons Volcanic Construct (lAv)',
      },
      {
        unit: 'eAv',
        bounds: [[-12.0, -135.0], [15.0, -95.0]] as [[number, number], [number, number]],
        title: 'Tharsis Montes Volcanic Plateau (eAv)',
      },
      {
        unit: 'ABb',
        bounds: [[50.0, -180.0], [80.0, 180.0]] as [[number, number], [number, number]],
        title: 'Vastitas Borealis Lowland Formation (ABb)',
      },
      {
        unit: 'lApi',
        bounds: [[82.0, -180.0], [90.0, 180.0]] as [[number, number], [number, number]],
        title: 'Planum Boreum Permanent Ice Cap (lApi)',
      },
      {
        unit: 'lHv',
        bounds: [[0.0, 55.0], [20.0, 85.0]] as [[number, number], [number, number]],
        title: 'Syrtis Major Planum Volcanic Plateau (lHv)',
      },
      {
        unit: 'eHt',
        bounds: [[-18.0, -90.0], [0.0, -30.0]] as [[number, number], [number, number]],
        title: 'Valles Marineris & Circum-Chryse Chaos (eHt)',
      },
      {
        unit: 'mNh',
        bounds: [[-60.0, -180.0], [-10.0, 180.0]] as [[number, number], [number, number]],
        title: 'Noachian Southern Cratered Highlands (mNh)',
      },
      {
        unit: 'lHch',
        bounds: [[-50.0, 50.0], [-30.0, 95.0]] as [[number, number], [number, number]],
        title: 'Hellas Impact Basin Floor Unit (lHch)',
      },
    ]

    globalGeologyProvinces.forEach((prov) => {
      const u = geologyUnits.find((unit) => unit.symbol === prov.unit)
      const color = u ? u.color_hex : '#8c564b'

      const rect = L.rectangle(prov.bounds, {
        color: color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: geologyOpacity * 0.45,
        dashArray: '4, 4',
      })

      rect.on('click', () => {
        if (u) {
          setSelectedEntity(u)
        }
      })

      rect.bindTooltip(
        `<div style="font-family: monospace; font-size: 10px;"><b>${prov.title}</b><br/>USGS SIM-3292 Stratigraphy</div>`,
        { permanent: false, direction: 'center', className: 'mars-mono-tooltip' }
      )

      group.addLayer(rect)
    })
  }, [showGeology, geologyOpacity, geologyUnits])

  // Toggle Jezero highlight polygon
  useEffect(() => {
    if (!jezeroPolygonRef.current || !mapInstanceRef.current) return
    if (showJezeroBounds) {
      jezeroPolygonRef.current.addTo(mapInstanceRef.current)
    } else {
      mapInstanceRef.current.removeLayer(jezeroPolygonRef.current)
    }
  }, [showJezeroBounds])

  // Navigation target fly-to handler
  const handleFlyToTarget = (target: NavigationTarget) => {
    const map = mapInstanceRef.current
    if (!map) return
    map.flyToBounds(target.bounds, {
      duration: 1.5,
      padding: [40, 40],
    })
    handleSampleAtCoords(target.lat, target.lon)
  }

  // Focus directly onto Jezero Crater
  const handleFocusJezero = () => {
    const map = mapInstanceRef.current
    if (!map) return
    map.flyTo([18.4485, 77.4320], 11, { duration: 1.5 })
    handleSampleAtCoords(18.4485, 77.4320)
  }

  // Search feature input handler
  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const q = query.toLowerCase().trim()
    const matchingFeats = features.filter((f) => f.name.toLowerCase().includes(q))
    const matchingSites = landingSites.filter(
      (s) => s.craft_name.toLowerCase().includes(q) || s.mission.toLowerCase().includes(q)
    )
    setSearchResults([...matchingFeats, ...matchingSites].slice(0, 8))
  }

  // Select search result
  const handleSelectSearchResult = (item: PlanetaryFeature | MarsLandingSite) => {
    const map = mapInstanceRef.current
    if (!map) return
    map.flyTo([item.lat, item.lon], 7, { duration: 1.5 })
    setSelectedEntity(item)
    handleSampleAtCoords(item.lat, item.lon)
    setSearchQuery('name' in item ? item.name : item.craft_name)
    setSearchResults([])
  }

  // Coordinate manual jump
  const handleJumpToCoords = (e: React.FormEvent) => {
    e.preventDefault()
    setCoordError(null)
    const lat = parseFloat(coordInputLat)
    const lon = parseFloat(coordInputLon)

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setCoordError('Latitude must be between -90° and +90°')
      return
    }
    if (isNaN(lon)) {
      setCoordError('Longitude must be a valid number')
      return
    }

    let normLon = lon % 360
    if (normLon > 180) normLon -= 360
    if (normLon < -180) normLon += 360

    const map = mapInstanceRef.current
    if (!map) return

    map.flyTo([lat, normLon], 7, { duration: 1.5 })
    handleSampleAtCoords(lat, normLon)
  }

  const activeBasemap = basemaps.find((b) => b.id === selectedBasemapId)

  return (
    <div className="global-mars-map-wrapper">
      {/* Top Aerospace Control Bar */}
      <div className="global-mars-map-header">
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono font-bold tracking-wider text-white uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            GLOBAL MARS ATLAS (IAU_2015:49900)
          </span>
          <span className="text-[11px] font-mono text-[#737373]">|</span>
          <span className="text-[11px] font-mono text-[#a3a3a3]">
            Datum: MOLA Areoid • R = 3,396,190 m
          </span>
        </div>

        {/* Search by feature or keyword */}
        <div className="relative max-w-xs w-full hidden md:block">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search crater, volcano, lander..."
            className="w-full bg-[#181818] border border-[#303030] rounded px-2.5 py-1 text-xs text-white placeholder-[#737373] focus:outline-none focus:border-white font-mono"
          />
          {searchResults.length > 0 && (
            <div className="absolute top-8 left-0 w-full bg-[#181818] border border-[#303030] rounded shadow-2xl z-[1500] max-h-60 overflow-y-auto font-mono text-xs divide-y divide-[#262626]">
              {searchResults.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectSearchResult(item)}
                  className="px-3 py-1.5 hover:bg-[#262626] cursor-pointer flex justify-between items-center"
                >
                  <span className="text-white">
                    {'craft_name' in item ? item.craft_name : item.name}
                  </span>
                  <span className="text-[10px] text-[#737373]">
                    {item.lat.toFixed(1)}°, {item.lon.toFixed(1)}°
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Planetary Navigation Targets */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-md py-1">
          <button
            onClick={handleFocusJezero}
            className="px-2 py-1 text-[11px] font-mono bg-[#202020] hover:bg-white hover:text-black border border-[#303030] rounded transition-colors text-white font-semibold flex items-center gap-1 shrink-0"
            title="Focus camera on Jezero Crater Western Delta"
          >
            🎯 JEZERO
          </button>
          {navTargets
            .filter((t) => t.id !== 'nav-jezero-delta')
            .map((target) => (
              <button
                key={target.id}
                onClick={() => handleFlyToTarget(target)}
                className="px-2 py-1 text-[11px] font-mono bg-[#181818] hover:bg-[#262626] border border-[#303030] rounded text-[#a3a3a3] hover:text-white transition-colors shrink-0"
              >
                {target.name.split(' ')[0]}
              </button>
            ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowInfoPanel(!showInfoPanel)}
            className={`px-2.5 py-1 text-xs font-mono border rounded transition-colors ${
              showInfoPanel ? 'bg-white text-black border-white' : 'bg-[#181818] text-[#a3a3a3] border-[#303030] hover:text-white'
            }`}
          >
            PROVENANCE
          </button>

          {onEnterJezero && (
            <button
              onClick={onEnterJezero}
              className="px-3 py-1 text-xs font-mono font-bold bg-white text-black hover:bg-[#e5e5e5] rounded flex items-center gap-1.5 transition-colors shrink-0 shadow"
            >
              ENTER JEZERO TWIN →
            </button>
          )}
        </div>
      </div>

      {/* Main Map Canvas and Floating Panels */}
      <div className="global-mars-map-canvas-container">
        <div ref={mapContainerRef} className="global-mars-map-canvas" />

        {/* Top-Left Basemap & Layer Control Box */}
        <div className="global-map-panel global-map-panel-top-left space-y-3">
          <div className="flex items-center justify-between border-b border-[#262626] pb-2">
            <span className="font-bold text-white uppercase tracking-wider">PLANETARY BASEMAP</span>
            {activeBasemap && (
              <span className="text-[10px] px-1.5 py-0.5 border border-[#303030] rounded text-[#a3a3a3]">
                {activeBasemap.epistemic_class}
              </span>
            )}
          </div>

          {/* Basemap Selection */}
          <div className="space-y-1">
            <label className="text-[10px] text-[#737373] uppercase tracking-wider block">
              Layer Source:
            </label>
            <select
              value={selectedBasemapId}
              onChange={(e) => {
                setSelectedBasemapId(e.target.value)
                setTileStats({ total: 0, loaded: 0, failed: 0 })
              }}
              className="w-full bg-[#111111] border border-[#303030] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-white transition-colors cursor-pointer"
            >
              {basemaps.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {/* Basemap Opacity Slider */}
            <div className="flex items-center justify-between pt-1 text-[10px] text-[#737373]">
              <span>Opacity:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={basemapOpacity}
                  onChange={(e) => setBasemapOpacity(parseFloat(e.target.value))}
                  className="w-24 accent-white cursor-pointer"
                />
                <span className="text-white w-7 text-right">{Math.round(basemapOpacity * 100)}%</span>
              </div>
            </div>

            {activeBasemap && (
              <div className="text-[10px] text-[#a3a3a3] mt-1 line-clamp-2 leading-relaxed">
                {activeBasemap.description}
              </div>
            )}
          </div>

          {/* Layer Overlays Toggles */}
          <div className="border-t border-[#262626] pt-2 space-y-2">
            <div className="text-[10px] text-[#737373] uppercase tracking-wider">Planetary Overlays:</div>

            <label className="flex items-center justify-between cursor-pointer hover:text-white transition-colors">
              <span className="text-[#a3a3a3] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white inline-block"></span>
                IAU Features (Craters/Mons)
              </span>
              <input
                type="checkbox"
                checked={showFeatures}
                onChange={(e) => setShowFeatures(e.target.checked)}
                className="accent-white cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:text-white transition-colors">
              <span className="text-[#a3a3a3] flex items-center gap-1.5">
                <span className="w-2 h-2 border border-white inline-block"></span>
                Historical Landing Sites
              </span>
              <input
                type="checkbox"
                checked={showLandingSites}
                onChange={(e) => setShowLandingSites(e.target.checked)}
                className="accent-white cursor-pointer"
              />
            </label>

            <div className="space-y-1">
              <label className="flex items-center justify-between cursor-pointer hover:text-white transition-colors">
                <span className="text-[#a3a3a3] flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#8c564b] inline-block"></span>
                  USGS SIM-3292 Geology
                </span>
                <input
                  type="checkbox"
                  checked={showGeology}
                  onChange={(e) => setShowGeology(e.target.checked)}
                  className="accent-white cursor-pointer"
                />
              </label>
              {showGeology && (
                <div className="flex items-center justify-between pl-3.5 text-[10px] text-[#737373]">
                  <span>Overlay:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={geologyOpacity}
                      onChange={(e) => setGeologyOpacity(parseFloat(e.target.value))}
                      className="w-20 accent-white cursor-pointer"
                    />
                    <span className="text-white w-6 text-right">{Math.round(geologyOpacity * 100)}%</span>
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between cursor-pointer hover:text-white transition-colors">
              <span className="text-[#a3a3a3] flex items-center gap-1.5">
                <span className="w-2 h-2 border border-dashed border-white inline-block"></span>
                Jezero Study Bounding Box
              </span>
              <input
                type="checkbox"
                checked={showJezeroBounds}
                onChange={(e) => setShowJezeroBounds(e.target.checked)}
                className="accent-white cursor-pointer"
              />
            </label>
          </div>

          {/* Coordinate Jump Form */}
          <div className="border-t border-[#262626] pt-2">
            <form onSubmit={handleJumpToCoords} className="space-y-1.5">
              <div className="text-[10px] text-[#737373] uppercase tracking-wider">Coordinate Jump:</div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={coordInputLat}
                  onChange={(e) => setCoordInputLat(e.target.value)}
                  placeholder="Lat (°N)"
                  className="bg-[#111111] border border-[#303030] rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none focus:border-white font-mono"
                />
                <input
                  type="text"
                  value={coordInputLon}
                  onChange={(e) => setCoordInputLon(e.target.value)}
                  placeholder="Lon (°E)"
                  className="bg-[#111111] border border-[#303030] rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none focus:border-white font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-[#202020] hover:bg-white hover:text-black border border-[#303030] rounded py-1 text-[10px] font-semibold tracking-wider uppercase transition-colors"
              >
                GO TO COORDINATES
              </button>
              {coordError && (
                <div className="text-[10px] text-red-400">{coordError}</div>
              )}
            </form>
          </div>
        </div>

        {/* Selected Entity Inspector Card (Slide up from bottom-left) */}
        {selectedEntity && (
          <div className="global-map-panel global-map-panel-bottom-left">
            <div className="flex items-center justify-between border-b border-[#262626] pb-2 mb-2">
              <span className="font-bold text-white truncate">
                {'craft_name' in selectedEntity
                  ? selectedEntity.craft_name
                  : 'symbol' in selectedEntity
                  ? `${selectedEntity.symbol}: ${selectedEntity.name}`
                  : selectedEntity.name}
              </span>
              <button
                onClick={() => setSelectedEntity(null)}
                className="text-[#737373] hover:text-white text-sm leading-none px-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 text-[11px] text-[#a3a3a3]">
              {'craft_name' in selectedEntity ? (
                <>
                  <div><span className="text-[#737373]">Mission:</span> {selectedEntity.mission} ({selectedEntity.agency})</div>
                  <div><span className="text-[#737373]">Status:</span> <span className="text-white font-semibold">{selectedEntity.status}</span></div>
                  <div><span className="text-[#737373]">Landed:</span> {selectedEntity.landing_date}</div>
                  <div><span className="text-[#737373]">Region:</span> {selectedEntity.target_region}</div>
                  <div><span className="text-[#737373]">Datum Elev:</span> {Math.round(selectedEntity.elevation_areoid_m).toLocaleString()} m</div>
                </>
              ) : 'symbol' in selectedEntity ? (
                <>
                  <div><span className="text-[#737373]">System:</span> {selectedEntity.system} ({selectedEntity.epoch})</div>
                  <div><span className="text-[#737373]">Lithology:</span> {selectedEntity.dominant_lithology}</div>
                  <div><span className="text-[#737373]">Coverage:</span> ~{selectedEntity.area_percentage}% of planet</div>
                  <div><span className="text-[#737373]">Epistemic:</span> <span className="text-amber-300">{selectedEntity.epistemic_class}</span></div>
                  <div className="text-[10px] text-[#737373] pt-1">Caveat: {selectedEntity.limitations}</div>
                </>
              ) : (
                <>
                  <div><span className="text-[#737373]">Type:</span> {selectedEntity.feature_type}</div>
                  <div><span className="text-[#737373]">Diameter:</span> {selectedEntity.diameter_km} km</div>
                  <div>
                    <span className="text-[#737373]">Elevation:</span>{' '}
                    {selectedEntity.elevation_areoid_m !== null
                      ? `${selectedEntity.elevation_areoid_m > 0 ? '+' : ''}${Math.round(selectedEntity.elevation_areoid_m).toLocaleString()} m`
                      : 'N/A'}
                  </div>
                </>
              )}
              <div className="pt-2 border-t border-[#262626] text-[10px] text-[#737373] leading-relaxed">
                {selectedEntity.description}
              </div>
            </div>
          </div>
        )}

        {/* Floating Topographic Elevation Legend & Sampling HUD (Top-Right) */}
        <div className="global-map-panel global-map-panel-top-right space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#262626] pb-1.5">
            <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>⛰️</span> ELEVATION & SAMPLING
            </span>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="text-[10px] text-[#737373] hover:text-white"
            >
              {showLegend ? 'HIDE' : 'SHOW'}
            </button>
          </div>

          {showLegend && (
            <>
              {/* Dynamic Color Scale Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-[#737373]">
                  <span>-8,200 m (Hellas)</span>
                  <span>0 m (Datum)</span>
                  <span>+21,287 m (Olympus)</span>
                </div>
                <div
                  className="w-full h-3 rounded"
                  style={{
                    background:
                      'linear-gradient(to right, #000033 0%, #0000aa 15%, #00ffff 30%, #00aa00 45%, #ffff00 65%, #aa0000 85%, #ffffff 100%)',
                  }}
                />
                <div className="text-[9px] text-[#737373] text-center">
                  MOLA Areoid Gravitational Datum (R_ref = 3,396,000 m)
                </div>
              </div>

              {/* Live Multi-Scale Elevation Reading */}
              <div className="bg-[#111111] border border-[#262626] rounded p-2 space-y-1 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-[#737373]">Sampled Point:</span>
                  <span className="text-white font-bold">
                    {elevationSample
                      ? `${elevationSample.elevation_m > 0 ? '+' : ''}${elevationSample.elevation_m.toLocaleString()} m`
                      : samplingLoading
                      ? 'SAMPLING...'
                      : 'CLICK MAP TO SAMPLE'}
                  </span>
                </div>

                {elevationSample && (
                  <>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[#737373]">Scale Tier:</span>
                      <span
                        className={`font-semibold px-1 rounded ${
                          elevationSample.scale_tier === 'LOCAL'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : elevationSample.scale_tier === 'REGIONAL'
                            ? 'bg-blue-950 text-blue-300 border border-blue-800'
                            : 'bg-[#202020] text-[#a3a3a3]'
                        }`}
                      >
                        {elevationSample.scale_tier} ({elevationSample.resolution_m < 1000 ? `${elevationSample.resolution_m}m` : `${Math.round(elevationSample.resolution_m / 1000)}km`})
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[#737373]">Epistemic Class:</span>
                      <span className="text-white">{elevationSample.epistemic_class}</span>
                    </div>

                    <div className="text-[10px] text-[#737373] pt-1 border-t border-[#202020] leading-relaxed">
                      {elevationSample.coverage_disclosure}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Scale Disclosure Warning & Tile Cache Telemetry */}
          <div className="border-t border-[#262626] pt-1.5 flex justify-between items-center text-[10px] text-[#737373]">
            <span>Zoom Level: {currentZoom}</span>
            <span className="text-[#a3a3a3]">
              {currentZoom <= 5
                ? 'Scale: Planetary (15km/px)'
                : currentZoom <= 9
                ? 'Scale: Regional (~200m/px)'
                : 'Scale: Local Footprint (<20m/px)'}
            </span>
          </div>

          {/* Real Tile Pipeline Telemetry */}
          <div className="pt-1 flex items-center justify-between text-[9px] font-mono border-t border-[#1f1f1f]">
            <span className="text-[#737373]">TILES:</span>
            <span className={tileStats.failed > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {tileStats.loaded}/{tileStats.total} LOADED
              {tileStats.failed > 0 && ` (${tileStats.failed} RETRIED)`}
            </span>
          </div>
        </div>

        {/* Dataset Provenance Drawer Modal */}
        {showInfoPanel && (
          <div className="global-map-provenance-drawer space-y-3">
            <div className="flex items-center justify-between border-b border-[#262626] pb-2">
              <span className="font-bold text-white uppercase tracking-wider">DATASET PROVENANCE</span>
              <button
                onClick={() => setShowInfoPanel(false)}
                className="text-[#737373] hover:text-white"
              >
                ✕
              </button>
            </div>

            {activeBasemap ? (
              <div className="space-y-2 text-[11px] text-[#a3a3a3]">
                <div><span className="text-[#737373]">Layer Name:</span> <span className="text-white font-semibold">{activeBasemap.name}</span></div>
                <div><span className="text-[#737373]">Service Type:</span> {activeBasemap.service_type}</div>
                <div><span className="text-[#737373]">Resolution:</span> {activeBasemap.resolution}</div>
                <div><span className="text-[#737373]">Native CRS:</span> {activeBasemap.crs}</div>
                <div><span className="text-[#737373]">Epistemic Class:</span> <span className="text-white">{activeBasemap.epistemic_class}</span></div>
                <div><span className="text-[#737373]">Host Portal:</span> USGS Astrogeology / NASA Trek Services</div>
                <div className="pt-2 border-t border-[#262626] text-[10px] text-[#737373] leading-relaxed">
                  {activeBasemap.description}
                </div>
                <div className="text-[10px] text-amber-400/90 pt-1">
                  ⚠️ Note: Zooming will not interpolate new topographic or visual resolution beyond native flight archive post spacing.
                </div>
              </div>
            ) : (
              <div className="text-[#737373]">No layer selected.</div>
            )}
          </div>
        )}

        {/* Live Coordinate & Telemetry HUD (Bottom-Right) */}
        <div className="global-map-panel global-map-panel-bottom-right">
          <div>
            <span className="text-[#737373]">LAT:</span>{' '}
            <span className="text-white font-bold">
              {cursorCoords ? `${cursorCoords.lat >= 0 ? '+' : ''}${cursorCoords.lat.toFixed(4)}°` : '--.----°'}
            </span>
          </div>
          <div>
            <span className="text-[#737373]">LON:</span>{' '}
            <span className="text-white font-bold">
              {cursorCoords ? `${cursorCoords.lon >= 0 ? '+' : ''}${cursorCoords.lon.toFixed(4)}°` : '--.----°'}
            </span>
          </div>
          {coverageData && (
            <div className="border-l border-[#303030] pl-3 text-white font-semibold">
              TIER: {coverageData.active_tier}
            </div>
          )}
          <div className="border-l border-[#303030] pl-3 text-[#737373]">
            IAU_2015:49900
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="absolute inset-0 bg-[#090909]/80 backdrop-blur-sm flex items-center justify-center z-[1100] font-mono text-sm text-[#a3a3a3]">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>STREAMING PLANETARY ATLAS DATA...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1100] bg-[#181818] border border-red-800 text-red-300 px-4 py-2 rounded font-mono text-xs shadow-lg">
            ⚠️ {error}
          </div>
        )}
      </div>
    </div>
  )
}
