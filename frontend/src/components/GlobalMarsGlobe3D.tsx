import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  fetchGlobalBasemaps,
  fetchPlanetaryFeatures,
  fetchLandingSites,
  sampleGlobalElevation,
  getGlobalTextureUrl,
  type GlobalBasemap,
  type PlanetaryFeature,
  type MarsLandingSite,
  type GlobalElevationSample,
} from '../api/atlas'

// -----------------------------------------------------------------------------
// GEODETIC CONSTANTS & COORDINATE TRANSFORMATIONS (IAU 2015 MARS SPHERE)
// -----------------------------------------------------------------------------
const MARS_RADIUS_KM = 3396.19
const GLOBE_RADIUS = 100.0 // Three.js scene units

/**
 * Convert planetocentric latitude [-90, 90] and east-positive longitude [-180, 180]
 * to 3D Cartesian coordinates on the Three.js Mars sphere.
 * Longitude convention: East is positive. Texture UV maps longitude [-180, 180] to [0, 1].
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = GLOBE_RADIUS,
  altitudeOffset: number = 0.0
): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180.0
  const theta = (lon * Math.PI) / 180.0
  const r = radius + altitudeOffset

  // In Three.js spherical mapping with Y as North:
  // x = R * cos(phi) * cos(theta)
  // y = R * sin(phi)
  // z = -R * cos(phi) * sin(theta)
  const x = r * Math.cos(phi) * Math.cos(theta)
  const y = r * Math.sin(phi)
  const z = -r * Math.cos(phi) * Math.sin(theta)

  return new THREE.Vector3(x, y, z)
}

/**
 * Convert 3D Cartesian coordinates on the Three.js Mars sphere back to
 * planetocentric latitude [-90, 90] and east-positive longitude [-180, 180].
 */
function vector3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  if (r === 0) return { lat: 0, lon: 0 }

  const lat = Math.asin(Math.max(-1.0, Math.min(1.0, v.y / r))) * (180.0 / Math.PI)
  let lon = Math.atan2(-v.z, v.x) * (180.0 / Math.PI)

  // Normalize lon to [-180, 180)
  lon = lon % 360.0
  if (lon >= 180.0) lon -= 360.0
  if (lon < -180.0) lon += 360.0

  return { lat, lon }
}

interface GlobalMarsGlobe3DProps {
  onEnterJezero?: () => void
  onEnterRegion?: (regionId: string) => void
  onSelectCoordinates?: (coords: { lat: number; lon: number }) => void
}

function getRegionIdForEntity(name: string): string | null {
  const n = name.toLowerCase()
  if (n.includes('jezero')) return 'reg-jezero'
  if (n.includes('gale')) return 'reg-gale'
  if (n.includes('valles marineris')) return 'reg-valles-marineris'
  if (n.includes('olympus')) return 'reg-olympus-mons'
  if (n.includes('tharsis')) return 'reg-tharsis'
  if (n.includes('hellas')) return 'reg-hellas'
  if (n.includes('utopia')) return 'reg-utopia'
  if (n.includes('elysium')) return 'reg-elysium'
  if (n.includes('arcadia')) return 'reg-arcadia'
  if (n.includes('gusev')) return 'reg-gusev'
  if (n.includes('north polar') || n.includes('boreum')) return 'reg-north-polar'
  if (n.includes('south polar') || n.includes('australe')) return 'reg-south-polar'
  return null
}

export function GlobalMarsGlobe3D({
  onEnterJezero,
  onEnterRegion,
  onSelectCoordinates,
}: GlobalMarsGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const globeMeshRef = useRef<THREE.Mesh | null>(null)
  const markersGroupRef = useRef<THREE.Group | null>(null)
  const graticuleGroupRef = useRef<THREE.Group | null>(null)
  const jezeroHighlightGroupRef = useRef<THREE.Group | null>(null)
  const atmosphereMeshRef = useRef<THREE.Mesh | null>(null)

  // Remote data state
  const [_basemaps, setBasemaps] = useState<GlobalBasemap[]>([])
  const [activeTextureType, setActiveTextureType] = useState<
    'shaded_relief' | 'color_elevation' | 'blend'
  >('shaded_relief')
  const [features, setFeatures] = useState<PlanetaryFeature[]>([])
  const [landingSites, setLandingSites] = useState<MarsLandingSite[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Layer Visibility Toggles
  const [showFeatures, setShowFeatures] = useState<boolean>(true)
  const [showLandingSites, setShowLandingSites] = useState<boolean>(true)
  const [showGraticule, setShowGraticule] = useState<boolean>(true)
  const [showJezeroHighlight, setShowJezeroHighlight] = useState<boolean>(true)
  const [showAtmosphere, setShowAtmosphere] = useState<boolean>(true)
  const [autoRotate, setAutoRotate] = useState<boolean>(false)

  // Feature Search & Selection
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<Array<PlanetaryFeature | MarsLandingSite>>([])
  const [selectedEntity, setSelectedEntity] = useState<
    { type: 'feature'; data: PlanetaryFeature } | { type: 'landing'; data: MarsLandingSite } | null
  >(null)

  // Real-time Pointer Telemetry & Elevation Sampling
  const [pointerCoords, setPointerCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [elevationSample, setElevationSample] = useState<GlobalElevationSample | null>(null)
  const [samplingLoading, setSamplingLoading] = useState<boolean>(false)
  const [subSpacecraftPoint, setSubSpacecraftPoint] = useState<{ lat: number; lon: number; altKm: number }>({
    lat: 0,
    lon: 0,
    altKm: Math.round(MARS_RADIUS_KM * 2.5),
  })

  // Raycasting for interactive marker & sphere hovering
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const mousePosRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const hoverTooltipRef = useRef<{
    name: string
    category: string
    lat: number
    lon: number
    elev?: number | null
  } | null>(null)
  const [hoverInfo, setHoverInfo] = useState<{
    name: string
    category: string
    lat: number
    lon: number
    elev?: number | null
  } | null>(null)

  // Camera Fly-To animation state
  const isFlyingRef = useRef<boolean>(false)
  const flyStartTimeRef = useRef<number>(0)
  const flyStartPosRef = useRef<THREE.Vector3>(new THREE.Vector3())
  const flyEndPosRef = useRef<THREE.Vector3>(new THREE.Vector3())
  const flyDurationMsRef = useRef<number>(1200)

  // ---------------------------------------------------------------------------
  // 1. LOAD BACKEND CATALOG DATA
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    async function loadData() {
      try {
        const [basemapRes, featureRes, landingRes] = await Promise.all([
          fetchGlobalBasemaps(),
          fetchPlanetaryFeatures({ limit: 50 }),
          fetchLandingSites(),
        ])
        if (cancelled) return
        setBasemaps(basemapRes.basemaps || [])
        setFeatures(featureRes.features)
        setLandingSites(landingRes.landing_sites)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load planetary globe data')
        setLoading(false)
      }
    }
    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  // ---------------------------------------------------------------------------
  // 2. INITIALIZE THREE.JS SCENE, MARS SPHERE & ORBITCONTROLS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mountRef.current) return
    const container = mountRef.current
    const width = container.clientWidth
    const height = container.clientHeight || 700

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x060608) // Deep aerospace black
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 3000)
    // Initial camera position viewing Jezero / Syrtis Major sector (lon ~70°E, lat ~20°N)
    const initCamPos = latLonToVector3(20.0, 70.0, GLOBE_RADIUS * 2.8)
    camera.position.copy(initCamPos)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.rotateSpeed = 0.65
    controls.zoomSpeed = 0.95
    controls.minDistance = GLOBE_RADIUS * 1.15 // Close zoom without clipping
    controls.maxDistance = GLOBE_RADIUS * 5.0  // Deep global view
    controls.autoRotate = false
    controls.autoRotateSpeed = 0.5
    controlsRef.current = controls

    // Ambient and Directional Lighting (Sunlight on Mars)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65)
    scene.add(ambientLight)

    const sunLight = new THREE.DirectionalLight(0xfff5ea, 1.8)
    sunLight.position.set(300, 150, 250)
    scene.add(sunLight)

    // Subtle opposite rim light for night-side planetary silhouette
    const rimLight = new THREE.DirectionalLight(0x406080, 0.45)
    rimLight.position.set(-300, -100, -250)
    scene.add(rimLight)

    // Construct Mars Sphere Mesh (64x64 segments)
    const sphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64)
    const textureLoader = new THREE.TextureLoader()
    const texture = textureLoader.load(getGlobalTextureUrl('shaded_relief'))
    texture.colorSpace = THREE.SRGBColorSpace

    const sphereMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.88,
      metalness: 0.05,
    })

    const globeMesh = new THREE.Mesh(sphereGeometry, sphereMaterial)
    globeMesh.name = 'MarsSphere'
    scene.add(globeMesh)
    globeMeshRef.current = globeMesh

    // Subtle atmospheric haze sphere (Radius + 1.2%)
    const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.015, 48, 48)
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    })
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    scene.add(atmosphereMesh)
    atmosphereMeshRef.current = atmosphereMesh

    // Groups for markers, graticule, and Jezero highlight
    const markersGroup = new THREE.Group()
    scene.add(markersGroup)
    markersGroupRef.current = markersGroup

    const graticuleGroup = new THREE.Group()
    scene.add(graticuleGroup)
    graticuleGroupRef.current = graticuleGroup

    const jezeroHighlightGroup = new THREE.Group()
    scene.add(jezeroHighlightGroup)
    jezeroHighlightGroupRef.current = jezeroHighlightGroup

    // -------------------------------------------------------------------------
    // RENDER LOOP
    // -------------------------------------------------------------------------
    let animId: number
    const animate = (time: number) => {
      animId = requestAnimationFrame(animate)

      // Handle Smooth Fly-To Camera Lerp
      if (isFlyingRef.current && cameraRef.current && controlsRef.current) {
        const elapsed = time - flyStartTimeRef.current
        const progress = Math.min(1.0, elapsed / flyDurationMsRef.current)
        // Smooth cubic easing
        const ease =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2

        cameraRef.current.position.lerpVectors(
          flyStartPosRef.current,
          flyEndPosRef.current,
          ease
        )
        controlsRef.current.target.set(0, 0, 0)
        controlsRef.current.update()

        if (progress >= 1.0) {
          isFlyingRef.current = false
        }
      } else {
        controls.update()
      }

      // Update Sub-Spacecraft Point (Camera Nadir)
      if (cameraRef.current) {
        const camPos = cameraRef.current.position
        const nadir = vector3ToLatLon(camPos)
        const distUnits = camPos.length()
        const altKm = Math.round((distUnits / GLOBE_RADIUS - 1.0) * MARS_RADIUS_KM)
        setSubSpacecraftPoint({
          lat: Number(nadir.lat.toFixed(2)),
          lon: Number(nadir.lon.toFixed(2)),
          altKm: Math.max(0, altKm),
        })
      }

      renderer.render(scene, camera)
    }
    animId = requestAnimationFrame(animate)

    // Resize Observer
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return
      const w = container.clientWidth
      const h = container.clientHeight || 700
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      controls.dispose()
      renderer.dispose()
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  // ---------------------------------------------------------------------------
  // 3. UPDATE GLOBE TEXTURE ON BASEMAP CHANGE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!globeMeshRef.current) return
    const loader = new THREE.TextureLoader()
    loader.load(
      getGlobalTextureUrl(activeTextureType),
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        if (globeMeshRef.current) {
          const mat = globeMeshRef.current.material as THREE.MeshStandardMaterial
          mat.map = texture
          mat.needsUpdate = true
        }
      },
      undefined,
      (err) => {
        console.warn('Failed to load global texture:', err)
      }
    )
  }, [activeTextureType])

  // ---------------------------------------------------------------------------
  // 4. AUTO-ROTATION CONTROLLER
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate
    }
  }, [autoRotate])

  // ---------------------------------------------------------------------------
  // 5. CONSTRUCT PLANETARY GRATICULE (LAT/LON GRID)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const group = graticuleGroupRef.current
    if (!group) return
    while (group.children.length > 0) {
      group.remove(group.children[0])
    }

    if (!showGraticule) return

    const graticuleRadius = GLOBE_RADIUS * 1.002

    // Parallels every 30° (-60, -30, 0, 30, 60)
    const latBands = [-60, -30, 0, 30, 60]
    latBands.forEach((lat) => {
      const isEquator = lat === 0
      const pts: THREE.Vector3[] = []
      for (let lon = -180; lon <= 180; lon += 3) {
        pts.push(latLonToVector3(lat, lon, graticuleRadius))
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts)
      const mat = new THREE.LineBasicMaterial({
        color: isEquator ? 0xf59e0b : 0x52525b, // Amber for Equator, zinc for others
        transparent: true,
        opacity: isEquator ? 0.75 : 0.35,
        linewidth: isEquator ? 2 : 1,
      })
      const line = new THREE.Line(geom, mat)
      group.add(line)
    })

    // Meridians every 45°
    for (let lon = -180; lon < 180; lon += 45) {
      const isPrime = lon === 0
      const pts: THREE.Vector3[] = []
      for (let lat = -88; lat <= 88; lat += 2) {
        pts.push(latLonToVector3(lat, lon, graticuleRadius))
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts)
      const mat = new THREE.LineBasicMaterial({
        color: isPrime ? 0x06b6d4 : 0x52525b, // Cyan for Prime Meridian
        transparent: true,
        opacity: isPrime ? 0.75 : 0.35,
        linewidth: isPrime ? 2 : 1,
      })
      const line = new THREE.Line(geom, mat)
      group.add(line)
    }
  }, [showGraticule])

  // ---------------------------------------------------------------------------
  // 6. JEZERO CRATER HIGH-RESOLUTION FOOTPRINT HIGHLIGHT
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const group = jezeroHighlightGroupRef.current
    if (!group) return
    while (group.children.length > 0) {
      group.remove(group.children[0])
    }

    if (!showJezeroHighlight) return

    const r = GLOBE_RADIUS * 1.004

    // Bounding Box of CTX 6m mosaic / 20m DTM (31.93 x 30.24 km)
    // [18.21103, 77.16047] to [18.72119, 77.69918]
    const latMin = 18.21103
    const latMax = 18.72119
    const lonMin = 77.16047
    const lonMax = 77.69918

    const rectPoints: THREE.Vector3[] = []
    // Bottom edge
    for (let l = lonMin; l <= lonMax; l += 0.05) rectPoints.push(latLonToVector3(latMin, l, r))
    // Right edge
    for (let a = latMin; a <= latMax; a += 0.05) rectPoints.push(latLonToVector3(a, lonMax, r))
    // Top edge
    for (let l = lonMax; l >= lonMin; l -= 0.05) rectPoints.push(latLonToVector3(latMax, l, r))
    // Left edge
    for (let a = latMax; a >= latMin; a -= 0.05) rectPoints.push(latLonToVector3(a, lonMin, r))

    const geom = new THREE.BufferGeometry().setFromPoints(rectPoints)
    const mat = new THREE.LineBasicMaterial({
      color: 0x22d3ee, // Bright cyan
      linewidth: 2,
    })
    const footprintLine = new THREE.LineLoop(geom, mat)
    group.add(footprintLine)

    // Center Pulsing Marker
    const centerPos = latLonToVector3(18.4485, 77.4320, r + 0.1)
    const dotGeom = new THREE.RingGeometry(0.5, 1.4, 24)
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
    })
    const dotMesh = new THREE.Mesh(dotGeom, dotMat)
    dotMesh.position.copy(centerPos)
    dotMesh.lookAt(0, 0, 0)
    group.add(dotMesh)
  }, [showJezeroHighlight])

  // ---------------------------------------------------------------------------
  // 7. BUILD INTERACTIVE 3D FEATURE & MISSION MARKERS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const group = markersGroupRef.current
    if (!group) return
    while (group.children.length > 0) {
      group.remove(group.children[0])
    }

    const markerRadius = GLOBE_RADIUS * 1.008

    // A. IAU Planetary Features
    if (showFeatures) {
      features.forEach((feat) => {
        const pos = latLonToVector3(feat.lat, feat.lon, markerRadius)
        // Ring marker
        const ringGeom = new THREE.RingGeometry(0.7, 1.3, 16)
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8, // Sky blue
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        })
        const ringMesh = new THREE.Mesh(ringGeom, ringMat)
        ringMesh.position.copy(pos)
        ringMesh.lookAt(0, 0, 0)
        ringMesh.userData = { type: 'feature', data: feat }
        group.add(ringMesh)
      })
    }

    // B. Historical & Active Landing Sites
    if (showLandingSites) {
      landingSites.forEach((site) => {
        const pos = latLonToVector3(site.lat, site.lon, markerRadius + 0.1)
        // Diamond / Circle for landing craft
        const siteGeom = new THREE.CircleGeometry(1.2, 6) // Hexagonal appearance
        const siteMat = new THREE.MeshBasicMaterial({
          color: site.status.includes('Active') ? 0x4ade80 : 0xf59e0b, // Green for active, amber for inactive
          side: THREE.DoubleSide,
        })
        const siteMesh = new THREE.Mesh(siteGeom, siteMat)
        siteMesh.position.copy(pos)
        siteMesh.lookAt(0, 0, 0)
        siteMesh.userData = { type: 'landing', data: site }
        group.add(siteMesh)
      })
    }
  }, [features, landingSites, showFeatures, showLandingSites])

  // ---------------------------------------------------------------------------
  // 8. CAMERA FLY-TO ANIMATION HELPER
  // ---------------------------------------------------------------------------
  const flyToCoordinates = useCallback((lat: number, lon: number, distanceUnits: number = GLOBE_RADIUS * 1.95) => {
    if (!cameraRef.current || !controlsRef.current) return
    const targetDir = latLonToVector3(lat, lon, distanceUnits)

    flyStartPosRef.current.copy(cameraRef.current.position)
    flyEndPosRef.current.copy(targetDir)
    flyStartTimeRef.current = performance.now()
    isFlyingRef.current = true
  }, [])

  // ---------------------------------------------------------------------------
  // 9. POINTER RAYCASTING (HOVER & REAL-TIME COORDINATES)
  // ---------------------------------------------------------------------------
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!mountRef.current || !cameraRef.current || !sceneRef.current || !globeMeshRef.current) {
        return
      }

      const rect = mountRef.current.getBoundingClientRect()
      mousePosRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mousePosRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current)

      // 1. Test Marker Intersections First
      if (markersGroupRef.current) {
        const markerIntersects = raycasterRef.current.intersectObjects(
          markersGroupRef.current.children,
          false
        )
        if (markerIntersects.length > 0) {
          const hit = markerIntersects[0].object.userData
          if (hit.type === 'feature') {
            const f = hit.data as PlanetaryFeature
            hoverTooltipRef.current = {
              name: f.name,
              category: f.feature_type,
              lat: f.lat,
              lon: f.lon,
              elev: f.elevation_areoid_m,
            }
            setHoverInfo(hoverTooltipRef.current)
            return
          }
          if (hit.type === 'landing') {
            const s = hit.data as MarsLandingSite
            hoverTooltipRef.current = {
              name: `${s.mission} (${s.craft_name})`,
              category: `Landing Site • ${s.status}`,
              lat: s.lat,
              lon: s.lon,
              elev: s.elevation_areoid_m,
            }
            setHoverInfo(hoverTooltipRef.current)
            return
          }
        }
      }

      setHoverInfo(null)

      // 2. Test Sphere Surface Intersection
      const sphereIntersects = raycasterRef.current.intersectObject(globeMeshRef.current, false)
      if (sphereIntersects.length > 0) {
        const point = sphereIntersects[0].point
        const { lat, lon } = vector3ToLatLon(point)
        const coords = { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) }
        setPointerCoords(coords)

        if (onSelectCoordinates) {
          onSelectCoordinates(coords)
        }
      }
    },
    [onSelectCoordinates]
  )

  // ---------------------------------------------------------------------------
  // 10. POINTER CLICK HANDLER (FEATURE SELECTION)
  // ---------------------------------------------------------------------------
  const handleGlobeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!mountRef.current || !cameraRef.current || !globeMeshRef.current) return
      const rect = mountRef.current.getBoundingClientRect()
      mousePosRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mousePosRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current)

      // Test markers
      if (markersGroupRef.current) {
        const markerIntersects = raycasterRef.current.intersectObjects(
          markersGroupRef.current.children,
          false
        )
        if (markerIntersects.length > 0) {
          const hit = markerIntersects[0].object.userData
          if (hit.type === 'feature') {
            const f = hit.data as PlanetaryFeature
            setSelectedEntity({ type: 'feature', data: f })
            flyToCoordinates(f.lat, f.lon)
            return
          }
          if (hit.type === 'landing') {
            const s = hit.data as MarsLandingSite
            setSelectedEntity({ type: 'landing', data: s })
            flyToCoordinates(s.lat, s.lon)
            return
          }
        }
      }

      // Test clicking on globe surface to sample elevation
      const sphereIntersects = raycasterRef.current.intersectObject(globeMeshRef.current, false)
      if (sphereIntersects.length > 0) {
        const point = sphereIntersects[0].point
        const { lat, lon } = vector3ToLatLon(point)
        setSamplingLoading(true)
        sampleGlobalElevation(lat, lon)
          .then((sample) => {
            setElevationSample(sample)
            setSamplingLoading(false)
          })
          .catch(() => setSamplingLoading(false))
      }
    },
    [flyToCoordinates]
  )

// -----------------------------------------------------------------------------
// COORDINATE PARSING UTILITY
// -----------------------------------------------------------------------------
function parseCoordinates(input: string): { lat: number; lon: number } | null {
  const trimmed = input.trim()
  // Pattern: e.g. "18.45N, 77.45E" or "18.45, 77.45" or "-14.5, 175.5" or "18.45 N 77.45 E"
  const cardinalRegex = /^([+-]?\d+(?:\.\d+)?)\s*([NSns])?[,\s]+([+-]?\d+(?:\.\d+)?)\s*([EWew])?$/
  const m = trimmed.match(cardinalRegex)
  if (m) {
    let lat = parseFloat(m[1])
    const latDir = m[2]?.toUpperCase()
    let lon = parseFloat(m[3])
    const lonDir = m[4]?.toUpperCase()

    if (latDir === 'S') lat = -Math.abs(lat)
    if (latDir === 'N') lat = Math.abs(lat)
    if (lonDir === 'W') lon = -Math.abs(lon)
    if (lonDir === 'E') lon = Math.abs(lon)

    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon }
    }
  }
  return null
}

  // ---------------------------------------------------------------------------
  // 11. SEARCH AUTOCOMPLETE & EXECUTION
  // ---------------------------------------------------------------------------
  const [parsedCoord, setParsedCoord] = useState<{ lat: number; lon: number } | null>(null)

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    const coord = parseCoordinates(query)
    setParsedCoord(coord)

    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const q = query.toLowerCase().trim()
    const matchedFeatures = features.filter(
      (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
    )
    const matchedSites = landingSites.filter(
      (s) =>
        s.mission.toLowerCase().includes(q) ||
        s.craft_name.toLowerCase().includes(q) ||
        s.target_region.toLowerCase().includes(q)
    )
    setSearchResults([...matchedFeatures, ...matchedSites].slice(0, 8))
  }

  const handleSelectSearchResult = (item: PlanetaryFeature | MarsLandingSite) => {
    if ('feature_type' in item) {
      setSelectedEntity({ type: 'feature', data: item })
    } else {
      setSelectedEntity({ type: 'landing', data: item })
    }
    flyToCoordinates(item.lat, item.lon)
    setSearchResults([])
    setSearchQuery('')
  }

  const handleResetCamera = () => {
    flyToCoordinates(20.0, 70.0, GLOBE_RADIUS * 2.8)
    setSelectedEntity(null)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#060608',
        color: '#f4f4f5',
        fontFamily: 'var(--font-mono, monospace)',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid #27272a',
      }}
    >
      {/* =========================================================================
          TOP COMMAND HEADER & BREADCRUMBS
          ========================================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 1rem',
          background: '#0d0d11',
          borderBottom: '1px solid #27272a',
          fontSize: '0.75rem',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#22d3ee',
                boxShadow: '0 0 8px #22d3ee',
              }}
            />
            <span style={{ color: '#ffffff', letterSpacing: '0.05em' }}>
              GLOBAL MARS EXPLORER (3D SPHERICAL GLOBE)
            </span>
          </div>
          <span style={{ color: '#52525b' }}>•</span>
          <span style={{ color: '#a1a1aa' }}>IAU_2015:49900 SPHERE (R = 3,396.19 km)</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            style={{
              background: autoRotate ? '#22d3ee' : '#18181b',
              color: autoRotate ? '#000000' : '#d4d4d8',
              border: '1px solid #3f3f46',
              padding: '0.25rem 0.6rem',
              borderRadius: '2px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Toggle ambient planetary rotation"
          >
            {autoRotate ? '⏸ STOP ORBIT' : '⟳ AUTO-ORBIT'}
          </button>

          <button
            onClick={handleResetCamera}
            style={{
              background: '#18181b',
              color: '#d4d4d8',
              border: '1px solid #3f3f46',
              padding: '0.25rem 0.6rem',
              borderRadius: '2px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Reset globe camera orientation"
          >
            ⌖ RESET VIEW
          </button>

          {/* Quick jump to Jezero Crater Regional Atlas */}
          <button
            onClick={onEnterJezero}
            style={{
              background: '#22d3ee',
              color: '#000000',
              border: 'none',
              padding: '0.25rem 0.75rem',
              borderRadius: '2px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Transition into Jezero Crater Regional Atlas (Milestone 2.2)"
          >
            <span>🪐</span>
            <span>JEZERO REGIONAL ATLAS (31.9 × 30.2 km) →</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN WORKSPACE (LEFT CONTROLS + CENTER GLOBE + RIGHT DOSSIER)
          ========================================================================= */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* --- LEFT PANEL: SEARCH & LAYER CONTROLS --- */}
        <div
          style={{
            width: '320px',
            background: '#0d0d11',
            borderRight: '1px solid #27272a',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10,
            overflowY: 'auto',
          }}
        >
          {/* Feature Search Box */}
          <div style={{ padding: '0.75rem', borderBottom: '1px solid #27272a' }}>
            <div style={{ fontSize: '0.7rem', color: '#a1a1aa', marginBottom: '0.35rem', fontWeight: 700 }}>
              PLANETARY FEATURE SEARCH
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search feature, crater, or coords (18.45N, 77.45E)..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (parsedCoord) {
                      flyToCoordinates(parsedCoord.lat, parsedCoord.lon)
                      setSearchResults([])
                      setSearchQuery('')
                      setParsedCoord(null)
                    } else if (searchResults.length > 0) {
                      handleSelectSearchResult(searchResults[0])
                    }
                  }
                }}
                style={{
                  width: '100%',
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  color: '#ffffff',
                  padding: '0.4rem 0.6rem',
                  fontSize: '0.75rem',
                  fontFamily: 'inherit',
                  borderRadius: '2px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {(searchResults.length > 0 || parsedCoord) && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#18181b',
                    border: '1px solid #3f3f46',
                    marginTop: '2px',
                    maxHeight: '240px',
                    overflowY: 'auto',
                    zIndex: 50,
                  }}
                >
                  {parsedCoord && (
                    <div
                      onClick={() => {
                        flyToCoordinates(parsedCoord.lat, parsedCoord.lon)
                        setSearchResults([])
                        setSearchQuery('')
                        setParsedCoord(null)
                      }}
                      style={{
                        padding: '0.5rem 0.6rem',
                        background: '#0e2b3d',
                        borderBottom: '1px solid #22d3ee',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        color: '#38bdf8',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span>📍</span>
                      <span>
                        FLY TO COORDINATES: {parsedCoord.lat > 0 ? `${parsedCoord.lat.toFixed(2)}°N` : `${Math.abs(parsedCoord.lat).toFixed(2)}°S`},{' '}
                        {parsedCoord.lon > 0 ? `${parsedCoord.lon.toFixed(2)}°E` : `${Math.abs(parsedCoord.lon).toFixed(2)}°W`}
                      </span>
                    </div>
                  )}

                  {searchResults.map((item) => {
                    const isFeat = 'feature_type' in item
                    const name = isFeat ? item.name : `${item.mission} (${item.craft_name})`
                    const subtitle = isFeat ? item.feature_type : `Landing Site • ${item.status}`
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSearchResult(item)}
                        style={{
                          padding: '0.4rem 0.6rem',
                          borderBottom: '1px solid #27272a',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#27272a'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <div style={{ color: '#22d3ee', fontWeight: 600 }}>{name}</div>
                        <div style={{ color: '#71717a', fontSize: '0.65rem' }}>{subtitle}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick Planetary Jump Links */}
          <div style={{ padding: '0.75rem', borderBottom: '1px solid #27272a' }}>
            <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginBottom: '0.4rem', fontWeight: 700 }}>
              MAJOR GEOGRAPHICAL DESTINATIONS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
              {[
                { name: 'Jezero Crater', lat: 18.44, lon: 77.45, highlight: true },
                { name: 'Olympus Mons', lat: 18.65, lon: -133.80 },
                { name: 'Valles Marineris', lat: -13.80, lon: -59.20 },
                { name: 'Gale Crater', lat: -5.37, lon: 137.44 },
                { name: 'Hellas Planitia', lat: -42.40, lon: 70.50 },
                { name: 'Tharsis Rise', lat: 0.00, lon: -100.00 },
                { name: 'Elysium Planitia', lat: 3.00, lon: 154.70 },
                { name: 'Arcadia Planitia', lat: 47.20, lon: -171.30 },
                { name: 'North Polar Cap', lat: 88.00, lon: 0.00 },
                { name: 'South Polar Cap', lat: -85.00, lon: 0.00 },
              ].map((dest) => (
                <button
                  key={dest.name}
                  onClick={() => {
                    const match = features.find((f) => f.name.toLowerCase().includes(dest.name.toLowerCase().slice(0, 5)))
                    if (match) {
                      setSelectedEntity({ type: 'feature', data: match })
                    }
                    flyToCoordinates(dest.lat, dest.lon)
                  }}
                  style={{
                    background: dest.highlight ? '#164e63' : '#18181b',
                    color: dest.highlight ? '#22d3ee' : '#d4d4d8',
                    border: `1px solid ${dest.highlight ? '#22d3ee' : '#27272a'}`,
                    padding: '0.3rem 0.4rem',
                    fontSize: '0.68rem',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontWeight: dest.highlight ? 700 : 500,
                  }}
                >
                  {dest.name}
                </button>
              ))}
            </div>
          </div>

          {/* Layer Manager */}
          <div style={{ padding: '0.75rem', borderBottom: '1px solid #27272a' }}>
            <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginBottom: '0.5rem', fontWeight: 700 }}>
              GLOBAL BASEMAP TEXTURE
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {[
                {
                  id: 'shaded_relief',
                  name: 'MOLA Shaded Relief (B&W)',
                  desc: 'Authentic 4ppd analytical hillshade (315°/45°)',
                },
                {
                  id: 'color_elevation',
                  name: 'MOLA Color Topography',
                  desc: 'Hypsometric elevation tint (-8.1km to +21.1km)',
                },
                {
                  id: 'blend',
                  name: 'MOLA Shaded Blend',
                  desc: 'Analytical relief fused with elevation colors',
                },
              ].map((opt) => (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    padding: '0.35rem 0.5rem',
                    background: activeTextureType === opt.id ? '#18181b' : 'transparent',
                    border: `1px solid ${activeTextureType === opt.id ? '#3f3f46' : 'transparent'}`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="basemap"
                    checked={activeTextureType === opt.id}
                    onChange={() => setActiveTextureType(opt.id as any)}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#ffffff', fontWeight: 600 }}>{opt.name}</div>
                    <div style={{ fontSize: '0.63rem', color: '#71717a' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Overlays and Graticule Toggles */}
          <div style={{ padding: '0.75rem', borderBottom: '1px solid #27272a' }}>
            <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginBottom: '0.5rem', fontWeight: 700 }}>
              PLANETARY OVERLAYS & GRATICULE
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.72rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ color: '#38bdf8' }}>IAU Planetary Features ({features.length})</span>
                <input
                  type="checkbox"
                  checked={showFeatures}
                  onChange={(e) => setShowFeatures(e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ color: '#f59e0b' }}>Historical Landing Sites ({landingSites.length})</span>
                <input
                  type="checkbox"
                  checked={showLandingSites}
                  onChange={(e) => setShowLandingSites(e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ color: '#22d3ee' }}>Jezero High-Res Footprint</span>
                <input
                  type="checkbox"
                  checked={showJezeroHighlight}
                  onChange={(e) => setShowJezeroHighlight(e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ color: '#a1a1aa' }}>Coordinate Graticule (Lat/Lon)</span>
                <input
                  type="checkbox"
                  checked={showGraticule}
                  onChange={(e) => setShowGraticule(e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ color: '#71717a' }}>Atmospheric Limb Scatter</span>
                <input
                  type="checkbox"
                  checked={showAtmosphere}
                  onChange={(e) => setShowAtmosphere(e.target.checked)}
                />
              </label>
            </div>
          </div>

          {/* Authentic Mission Locations Directory */}
          <div style={{ padding: '0.75rem', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginBottom: '0.4rem', fontWeight: 700 }}>
              VERIFIED SURFACE MISSIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {landingSites.map((site) => (
                <div
                  key={site.id}
                  onClick={() => {
                    setSelectedEntity({ type: 'landing', data: site })
                    flyToCoordinates(site.lat, site.lon)
                  }}
                  style={{
                    padding: '0.35rem 0.5rem',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>{site.mission}</span>
                    <span
                      style={{
                        fontSize: '0.6rem',
                        color: site.status.includes('Active') ? '#4ade80' : '#71717a',
                      }}
                    >
                      {site.status.includes('Active') ? '● ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div style={{ color: '#a1a1aa', fontSize: '0.62rem' }}>
                    {site.target_region} • {site.lat > 0 ? `${site.lat}°N` : `${Math.abs(site.lat)}°S`},{' '}
                    {site.lon > 0 ? `${site.lon}°E` : `${Math.abs(site.lon)}°W`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* --- CENTER: INTERACTIVE 3D WEBGL GLOBE CANVAS --- */}
        <div
          ref={mountRef}
          onPointerMove={handlePointerMove}
          onClick={handleGlobeClick}
          style={{
            flex: 1,
            height: '100%',
            position: 'relative',
            cursor: 'grab',
          }}
        >
          {loading && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(13, 13, 17, 0.9)',
                border: '1px solid #3f3f46',
                padding: '1rem 2rem',
                color: '#ffffff',
                fontSize: '0.8rem',
                zIndex: 40,
                textAlign: 'center',
              }}
            >
              <div style={{ marginBottom: '0.5rem', color: '#22d3ee', fontWeight: 700 }}>
                LOADING MARS PLANETARY GLOBE...
              </div>
              <div style={{ fontSize: '0.7rem', color: '#71717a' }}>
                Streaming MOLA altimetry texture & planetary gazetteer
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#7f1d1d',
                color: '#fecaca',
                padding: '0.5rem 1rem',
                fontSize: '0.75rem',
                zIndex: 40,
              }}
            >
              {error}
            </div>
          )}

          {/* Hover Tooltip Overlay */}
          {hoverInfo && (
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid #38bdf8',
                padding: '0.4rem 0.8rem',
                borderRadius: '2px',
                fontSize: '0.75rem',
                color: '#ffffff',
                pointerEvents: 'none',
                zIndex: 30,
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ fontWeight: 700, color: '#38bdf8' }}>{hoverInfo.name}</div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                {hoverInfo.category} • {hoverInfo.lat.toFixed(2)}°, {hoverInfo.lon.toFixed(2)}°
                {hoverInfo.elev !== undefined && hoverInfo.elev !== null ? ` • ${hoverInfo.elev} m` : ''}
              </div>
            </div>
          )}

          {/* Compass / Orientation Compass Overlay */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(13, 13, 17, 0.85)',
              border: '1px solid #27272a',
              padding: '0.4rem 0.6rem',
              borderRadius: '2px',
              fontSize: '0.68rem',
              color: '#d4d4d8',
              pointerEvents: 'none',
              zIndex: 20,
              textAlign: 'right',
            }}
          >
            <div>SUB-SPACECRAFT POINT (NADIR)</div>
            <div style={{ color: '#22d3ee', fontWeight: 700 }}>
              {subSpacecraftPoint.lat >= 0 ? `${subSpacecraftPoint.lat}°N` : `${Math.abs(subSpacecraftPoint.lat)}°S`},{' '}
              {subSpacecraftPoint.lon >= 0 ? `${subSpacecraftPoint.lon}°E` : `${Math.abs(subSpacecraftPoint.lon)}°W`}
            </div>
            <div style={{ fontSize: '0.62rem', color: '#71717a' }}>ALTITUDE: {subSpacecraftPoint.altKm.toLocaleString()} km</div>
          </div>
        </div>

        {/* --- RIGHT PANEL: SELECTED ENTITY DOSSIER & REGIONAL TRANSITION --- */}
        {selectedEntity && (
          <div
            style={{
              width: '320px',
              background: '#0d0d11',
              borderLeft: '1px solid #27272a',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10,
              overflowY: 'auto',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#a1a1aa', fontWeight: 700 }}>
                {selectedEntity.type === 'feature' ? 'PLANETARY FEATURE DOSSIER' : 'SURFACE MISSION DOSSIER'}
              </span>
              <button
                onClick={() => setSelectedEntity(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#71717a',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                ✕
              </button>
            </div>

            {selectedEntity.type === 'feature' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.72rem' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>
                    {selectedEntity.data.name}
                  </div>
                  <div style={{ color: '#71717a', fontSize: '0.68rem' }}>
                    {selectedEntity.data.feature_type}
                  </div>
                </div>

                <div style={{ background: '#18181b', padding: '0.5rem', border: '1px solid #27272a', borderRadius: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#71717a' }}>COORDINATES</span>
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>
                      {selectedEntity.data.lat}°N, {selectedEntity.data.lon}°E
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#71717a' }}>DIAMETER</span>
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>
                      {selectedEntity.data.diameter_km.toLocaleString()} km
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#71717a' }}>MOLA ELEVATION</span>
                    <span style={{ color: '#22d3ee', fontWeight: 600 }}>
                      {selectedEntity.data.elevation_areoid_m !== null
                        ? `${selectedEntity.data.elevation_areoid_m.toLocaleString()} m`
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#71717a', fontSize: '0.65rem', marginBottom: '0.2rem', fontWeight: 700 }}>
                    GEOMORPHIC DESCRIPTION
                  </div>
                  <div style={{ color: '#d4d4d8', lineHeight: 1.4, fontSize: '0.7rem' }}>
                    {selectedEntity.data.description}
                  </div>
                </div>

                {/* Regional Transition CTA for Features */}
                {(() => {
                  const matchedReg = getRegionIdForEntity(selectedEntity.data.name)
                  if (matchedReg) {
                    const isJezero = matchedReg === 'reg-jezero'
                    return (
                      <div style={{ marginTop: '1rem', borderTop: '1px solid #27272a', paddingTop: '1rem' }}>
                        <div style={{ color: '#22d3ee', fontSize: '0.68rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                          {isJezero ? 'HIGH-RESOLUTION REGIONAL DATA ACTIVE' : 'REGIONAL EXPLORATION DOSSIER AVAILABLE'}
                        </div>
                        <div style={{ color: '#a1a1aa', fontSize: '0.65rem', lineHeight: 1.35, marginBottom: '0.75rem' }}>
                          {isJezero
                            ? 'Descent into Level 2: 6m CTX controlled mosaic, 20m photogrammetric DTM, USGS SIM-3464 geological formations, MRO CRISM mineralogy, and Perseverance traverse telemetry.'
                            : `Explore the regional scientific dossier, geological setting, elevation span, and verified orbital datasets for ${selectedEntity.data.name}.`}
                        </div>
                        <button
                          onClick={() => {
                            if (onEnterRegion) {
                              onEnterRegion(matchedReg)
                            } else if (onEnterJezero) {
                              onEnterJezero()
                            }
                          }}
                          style={{
                            width: '100%',
                            background: '#22d3ee',
                            color: '#000000',
                            border: 'none',
                            padding: '0.55rem',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                          }}
                        >
                          <span>🪐</span>
                          <span>{isJezero ? 'ENTER JEZERO REGIONAL ATLAS →' : `ENTER ${selectedEntity.data.name.toUpperCase()} DOSSIER →`}</span>
                        </button>
                      </div>
                    )
                  }
                  return (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid #27272a', paddingTop: '1rem' }}>
                      <div style={{ color: '#71717a', fontSize: '0.65rem', lineHeight: 1.35 }}>
                        Global MOLA altimetry (463m) and orbital imagery active for this quadrant.
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.72rem' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
                    {selectedEntity.data.mission}
                  </div>
                  <div style={{ color: '#71717a', fontSize: '0.68rem' }}>
                    {selectedEntity.data.craft_name} • {selectedEntity.data.agency}
                  </div>
                </div>

                <div style={{ background: '#18181b', padding: '0.5rem', border: '1px solid #27272a', borderRadius: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#71717a' }}>TARGET REGION</span>
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>{selectedEntity.data.target_region}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#71717a' }}>LANDING DATE</span>
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>{selectedEntity.data.landing_date}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#71717a' }}>STATUS</span>
                    <span style={{ color: selectedEntity.data.status.includes('Active') ? '#4ade80' : '#f59e0b', fontWeight: 600 }}>
                      {selectedEntity.data.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#71717a' }}>COORDINATES</span>
                    <span style={{ color: '#22d3ee', fontWeight: 600 }}>
                      {selectedEntity.data.lat}°N, {selectedEntity.data.lon}°E
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#71717a', fontSize: '0.65rem', marginBottom: '0.2rem', fontWeight: 700 }}>
                    MISSION OBJECTIVE
                  </div>
                  <div style={{ color: '#d4d4d8', lineHeight: 1.4, fontSize: '0.7rem' }}>
                    {selectedEntity.data.description}
                  </div>
                </div>

                {(() => {
                  const regId = getRegionIdForEntity(selectedEntity.data.target_region || selectedEntity.data.mission)
                  if (regId) {
                    return (
                      <button
                        onClick={() => {
                          if (onEnterRegion) {
                            onEnterRegion(regId)
                          } else if (onEnterJezero) {
                            onEnterJezero()
                          }
                        }}
                        style={{
                          width: '100%',
                          marginTop: '1rem',
                          background: '#22d3ee',
                          color: '#000000',
                          border: 'none',
                          padding: '0.55rem',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        EXPLORE {selectedEntity.data.target_region.toUpperCase()} REGIONAL DOSSIER →
                      </button>
                    )
                  }
                  return null
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          BOTTOM TELEMETRY & SCALE HUD BAR
          ========================================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 1rem',
          background: '#0d0d11',
          borderTop: '1px solid #27272a',
          fontSize: '0.7rem',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <span style={{ color: '#71717a' }}>CURSOR: </span>
            <span style={{ color: '#ffffff', fontWeight: 600 }}>
              {pointerCoords
                ? `${pointerCoords.lat >= 0 ? `${pointerCoords.lat.toFixed(4)}°N` : `${Math.abs(pointerCoords.lat).toFixed(4)}°S`}, ${pointerCoords.lon >= 0 ? `${pointerCoords.lon.toFixed(4)}°E` : `${Math.abs(pointerCoords.lon).toFixed(4)}°W`}`
                : 'HOVER OVER MARS GLOBE'}
            </span>
          </div>

          <div>
            <span style={{ color: '#71717a' }}>ELEVATION: </span>
            <span style={{ color: '#22d3ee', fontWeight: 600 }}>
              {samplingLoading
                ? 'SAMPLING MOLA...'
                : elevationSample
                ? `${elevationSample.elevation_m.toLocaleString()} m (${elevationSample.scale_tier})`
                : 'CLICK TO SAMPLE MOLA'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <span style={{ color: '#71717a' }}>ACTIVE TEXTURE: </span>
            <span style={{ color: '#ffffff' }}>
              {activeTextureType === 'shaded_relief'
                ? 'MOLA Shaded Relief (B&W)'
                : activeTextureType === 'color_elevation'
                ? 'MOLA Planetary Elevation'
                : 'MOLA Shaded Blend'}
            </span>
          </div>
          <span style={{ color: '#52525b' }}>|</span>
          <div style={{ color: '#71717a' }}>
            VERTICAL DATUM: <span style={{ color: '#ffffff' }}>Mars Areoid (R = 3,396,000 m)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
