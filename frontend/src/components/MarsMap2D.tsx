import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { DigitalTwinLayersResponse } from '../api/twin'
import { fetchPerseveranceGeoJSON } from '../api/twin'
import type { CandidateTargetFeature } from '../api/science'
import { fetchScienceTargets } from '../api/science'
import type { RouteFeature } from '../api/routing'
import type { DynamicReroutePlanDTO } from '../api/emergency'

interface Map2DProps {
  metadata: DigitalTwinLayersResponse
  activeLayers: Record<string, boolean>
  routes?: RouteFeature[]
  emergencyPlan?: DynamicReroutePlanDTO | null
  onLayerToggle: (layerId: string) => void
  onHoverCoords: (coords: { lat: number; lon: number } | null) => void
  onSelectCoords?: (coords: { lat: number; lon: number }) => void
  onSelectTarget?: (target: CandidateTargetFeature) => void
}

export function MarsMap2D({
  metadata,
  activeLayers,
  routes = [],
  emergencyPlan = null,
  onLayerToggle,
  onHoverCoords,
  onSelectCoords,
  onSelectTarget,
}: Map2DProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const rasterOverlaysRef = useRef<Record<string, L.ImageOverlay>>({})
  const vectorLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const scienceTargetsGroupRef = useRef<L.LayerGroup | null>(null)
  const routesLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const emergencyLayerGroupRef = useRef<L.LayerGroup | null>(null)
  const roverFetchedRef = useRef(false)
  const targetsFetchedRef = useRef(false)

  // Initialize Leaflet Map using Plate Carrée / Equirectangular CRS (L.CRS.EPSG4326 for Mars lat/lon)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const { center, bounds } = metadata.study_area

    // L.CRS.EPSG4326 operates in direct equirectangular lat/lon coordinates.
    // On the Mars sphere, degrees map directly to the canonical IAU_2015:49900 planetocentric frame.
    const map = L.map(mapContainerRef.current, {
      crs: L.CRS.EPSG4326,
      center: [center[0], center[1]],
      zoom: 13,
      minZoom: 10,
      maxZoom: 18,
      attributionControl: false,
    })

    // Study area bounding rectangle boundary
    const boundsRect = L.rectangle(bounds, {
      color: '#00e5ff',
      weight: 2,
      dashArray: '5, 5',
      fill: false,
    }).addTo(map)

    map.fitBounds(boundsRect.getBounds(), { padding: [20, 20] })

    // Track cursor location in authentic Mars coordinates
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      onHoverCoords({ lat: e.latlng.lat, lon: e.latlng.lng })
    })

    map.on('mouseout', () => {
      onHoverCoords(null)
    })

    // Click handler to inspect hazard and science at coordinate
    map.on('click', (e: L.LeafletMouseEvent) => {
      onSelectCoords?.({ lat: e.latlng.lat, lon: e.latlng.lng })
    })

    // Vector group for rover path
    const vecGroup = L.layerGroup().addTo(map)
    vectorLayerGroupRef.current = vecGroup

    // Layer group for ranked science opportunity targets
    const sciGroup = L.layerGroup().addTo(map)
    scienceTargetsGroupRef.current = sciGroup

    // Layer group for planned traversal routes
    const routeGroup = L.layerGroup().addTo(map)
    routesLayerGroupRef.current = routeGroup

    // Layer group for emergency reroutes and simulated hazard overlays
    const emergGroup = L.layerGroup().addTo(map)
    emergencyLayerGroupRef.current = emergGroup

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [metadata, onHoverCoords, onSelectCoords])

  // Manage raster overlay visibility (Ortho, Elevation Colormap, Hazard, Science)
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const bounds: L.LatLngBoundsExpression = metadata.study_area.bounds

    metadata.layers.forEach((layer) => {
      if (layer.type !== 'raster') return

      const isActive = activeLayers[layer.id]
      let overlay = rasterOverlaysRef.current[layer.id]

      if (isActive) {
        if (!overlay) {
          overlay = L.imageOverlay(layer.url, bounds, {
            opacity: layer.id === 'ortho_imagery' ? 1.0 : 0.75,
            interactive: false,
          })
          rasterOverlaysRef.current[layer.id] = overlay
        }
        if (!map.hasLayer(overlay)) {
          overlay.addTo(map)
        }
      } else if (overlay && map.hasLayer(overlay)) {
        map.removeLayer(overlay)
      }
    })
  }, [metadata, activeLayers])

  // Manage authentic Perseverance rover vectors
  useEffect(() => {
    const map = mapInstanceRef.current
    const vecGroup = vectorLayerGroupRef.current
    if (!map || !vecGroup) return

    const showRover = activeLayers['perseverance_traverse']
    if (showRover) {
      if (!roverFetchedRef.current) {
        fetchPerseveranceGeoJSON()
          .then((data) => {
            vecGroup.clearLayers()
            const geoLayer = L.geoJSON(data, {
              style: (feature) => {
                if (feature?.geometry.type === 'LineString') {
                  return {
                    color: '#ffab00',
                    weight: 3,
                    opacity: 0.95,
                    dashArray: '7, 6',
                  }
                }
                return {}
              },
              pointToLayer: (feature, latlng) => {
                const sol = feature.properties?.sol ?? '?'
                return L.circleMarker(latlng, {
                  radius: 4,
                  fillColor: '#ffd600',
                  color: '#212121',
                  weight: 1,
                  opacity: 1,
                  fillOpacity: 0.9,
                }).bindTooltip(
                  `🤖 Perseverance Sol ${sol} (Historical Robotic Traverse - Observed | Elev: ${feature.properties?.elev_geoid ?? '?'}m)`
                )
              },
            })
            vecGroup.addLayer(geoLayer)
            roverFetchedRef.current = true
          })
          .catch((err: unknown) => {
            console.error('Failed loading rover layer:', err)
          })
      } else if (!map.hasLayer(vecGroup)) {
        map.addLayer(vecGroup)
      }
    } else if (map.hasLayer(vecGroup)) {
      map.removeLayer(vecGroup)
    }
  }, [activeLayers])

  // Manage Ranked Science Targets
  useEffect(() => {
    const map = mapInstanceRef.current
    const sciGroup = scienceTargetsGroupRef.current
    if (!map || !sciGroup) return

    if (!targetsFetchedRef.current) {
      fetchScienceTargets()
        .then((data) => {
          sciGroup.clearLayers()
          data.features.forEach((feature) => {
            const [lon, lat, elev] = feature.geometry.coordinates
            const marker = L.circleMarker([lat, lon], {
              radius: 8,
              fillColor: '#ffd700',
              color: '#1a1412',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.95,
            })
            marker.bindTooltip(
              `<strong>#${feature.properties.rank} ${feature.properties.name}</strong><br/>Score: ${(feature.properties.composite_score * 100).toFixed(1)}% | Elev: ${elev.toFixed(1)}m`
            )
            marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e)
              onSelectTarget?.(feature)
              onSelectCoords?.({ lat, lon })
            })
            sciGroup.addLayer(marker)
          })
          targetsFetchedRef.current = true
        })
        .catch((err: unknown) => {
          console.error('Failed loading science targets:', err)
        })
    }
  }, [onSelectCoords, onSelectTarget])

  // Render planned traversal routes
  useEffect(() => {
    const map = mapInstanceRef.current
    const routeGroup = routesLayerGroupRef.current
    if (!map || !routeGroup) return

    routeGroup.clearLayers()
    if (!routes || routes.length === 0) return

    const colorMap: Record<string, string> = {
      SAFETY_FIRST: '#00e5ff',
      SCIENCE_FIRST: '#ffd700',
      BALANCED: '#00e676',
    }

    routes.forEach((route) => {
      const coords: L.LatLngExpression[] = route.geometry.coordinates.map((c) => [c[1], c[0]])
      const prof = route.properties.profile_name
      const color = colorMap[prof] || '#e040fb'

      const polyline = L.polyline(coords, {
        color,
        weight: 4,
        opacity: 0.9,
      }).bindTooltip(
        `<strong>${prof.replace('_', ' ')} Route</strong><br/>` +
          `Distance: ${(route.properties.metrics.total_distance_m / 1000).toFixed(2)} km | ` +
          `Duration: ${route.properties.metrics.estimated_duration_minutes.toFixed(0)} min`
      )
      routeGroup.addLayer(polyline)
    })
  }, [routes])

  // Render simulated hazard zones, crew position, and dynamic alternative routes
  useEffect(() => {
    const map = mapInstanceRef.current
    const emergGroup = emergencyLayerGroupRef.current
    if (!map || !emergGroup) return

    emergGroup.clearLayers()
    if (!emergencyPlan) return

    // 1. Render Simulated Hazard Zone
    const hz = emergencyPlan.hazard_event
    const hazardCircle = L.circle([hz.center_lat, hz.center_lon], {
      radius: hz.radius_m,
      color: hz.is_hard_restriction ? '#f44336' : '#ffa726',
      fillColor: hz.is_hard_restriction ? '#d32f2f' : '#ff9800',
      fillOpacity: 0.35,
      weight: 2,
      dashArray: '5, 5',
    }).bindTooltip(
      `<strong>⚠️ SIMULATED CONTINGENCY: ${hz.title}</strong><br/>` +
        `Type: ${hz.hazard_type} | Severity: ${hz.severity}<br/>` +
        `Restriction: ${hz.is_hard_restriction ? 'IMPASSABLE BARRIER' : `${hz.cost_multiplier}x Traversal Drag`}<br/>` +
        `Radius: ${hz.radius_m.toFixed(0)}m`
    )
    emergGroup.addLayer(hazardCircle)

    // 2. Render Crew Location Marker
    const crew = emergencyPlan.crew_location
    const crewMarker = L.circleMarker([crew.lat, crew.lon], {
      radius: 8,
      color: '#ffffff',
      fillColor: '#00e5ff',
      fillOpacity: 0.95,
      weight: 2,
    }).bindTooltip(
      `<strong>Astronaut Crew Location</strong><br/>` +
        `Coord: ${crew.lat.toFixed(5)}°N, ${crew.lon.toFixed(5)}°E<br/>` +
        `Status: ${emergencyPlan.impact.crew_in_hazard_zone ? '⚠️ WITHIN HAZARD ZONE' : 'Field Position'}`
    )
    emergGroup.addLayer(crewMarker)

    // 3. Render Rerouted Route Line
    if (emergencyPlan.rerouted_route) {
      const coords: L.LatLngExpression[] = emergencyPlan.rerouted_route.geometry.coordinates.map(
        (c) => [c[1], c[0]],
      )
      const rerouteLine = L.polyline(coords, {
        color: emergencyPlan.is_return_to_base ? '#ff1744' : '#ff6d00',
        weight: 5,
        opacity: 0.95,
        dashArray: emergencyPlan.is_return_to_base ? '8, 6' : undefined,
      }).bindTooltip(
        `<strong>${
          emergencyPlan.is_return_to_base
            ? '🚨 EMERGENCY RETURN-TO-BASE'
            : '🔄 DYNAMIC REROUTED PATH'
        }</strong><br/>` +
          `Distance: ${(
            emergencyPlan.rerouted_route.properties.metrics.total_distance_m / 1000
          ).toFixed(2)} km | ` +
          `Duration: ${emergencyPlan.rerouted_route.properties.metrics.estimated_duration_minutes.toFixed(
            0,
          )} min`
      )
      emergGroup.addLayer(rerouteLine)
    }
  }, [emergencyPlan])

  return (
    <div className="map2d-wrapper">
      <div ref={mapContainerRef} className="leaflet-map-canvas" />

      {/* Map Traversal & Footprint Legend */}
      <div
        className="map-traversal-legend"
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          zIndex: 1000,
          background: 'rgba(17, 24, 39, 0.92)',
          border: '1px solid #374151',
          borderRadius: '6px',
          padding: '0.5rem 0.75rem',
          fontSize: '0.75rem',
          color: '#e5e7eb',
          pointerEvents: 'auto',
          maxWidth: '330px',
          lineHeight: 1.4,
          backdropFilter: 'blur(4px)',
        }}
      >
        <div style={{ fontWeight: 600, color: '#f28c52', marginBottom: '0.3rem', letterSpacing: '0.5px' }}>
          TRAVERSAL & COVERAGE GUIDE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span style={{ display: 'inline-block', width: '20px', height: '0px', borderTop: '2px dashed #00e5ff' }} />
          <span>20m DTM Study Boundary (Analysis Extent)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span style={{ display: 'inline-block', width: '20px', height: '0px', borderTop: '3px solid #00e676' }} />
          <span>Planned EVA Route (Strictly Inside Footprint)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span style={{ display: 'inline-block', width: '20px', height: '0px', borderTop: '3px dashed #ffab00' }} />
          <span>Perseverance Traverse (Observed, Extends West)</span>
        </div>
        <div
          style={{
            fontSize: '0.7rem',
            color: '#9ca3af',
            marginTop: '0.3rem',
            borderTop: '1px solid #374151',
            paddingTop: '0.3rem',
          }}
        >
          Terrain outside cyan boundary is unmapped regional basin (NoData — EVA entry prohibited).
        </div>
      </div>

      {/* Layer Control Panel */}
      <div className="layer-control-panel">
        <h3>Exploration Layers</h3>
        {metadata.layers.map((layer) => (
          <label key={layer.id} className="layer-checkbox-label">
            <input
              type="checkbox"
              checked={!!activeLayers[layer.id]}
              onChange={() => onLayerToggle(layer.id)}
            />
            <span className="layer-title">{layer.name}</span>
            <span className={`badge badge-${layer.epistemic_class.toLowerCase()}`}>
              {layer.epistemic_class}
            </span>
          </label>
        ))}
        <div className="layer-legend-note">
          CRS: {metadata.study_area.crs_geographic} (Mars 2015 Sphere)
        </div>
      </div>
    </div>
  )
}
