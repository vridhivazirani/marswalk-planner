import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { DigitalTwinLayersResponse, ElevationGridResponse } from '../api/twin'
import { fetchElevationGrid } from '../api/twin'

interface Map3DProps {
  metadata: DigitalTwinLayersResponse
}

export function MarsMap3D({ metadata }: Map3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [exaggeration, setExaggeration] = useState<number>(2.5)
  const [gridData, setGridData] = useState<ElevationGridResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)

  // Fetch elevation array for 3D terrain reconstruction
  useEffect(() => {
    fetchElevationGrid(4)
      .then((data) => {
        setGridData(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [])

  // Build Three.js 3D WebGL Scene
  useEffect(() => {
    if (!mountRef.current || !gridData) return

    const container = mountRef.current
    const width = container.clientWidth
    const height = container.clientHeight || 550

    // 1. Scene & Camera
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x181310) // Dark Martian ambient sky
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000)
    camera.position.set(0, -350, 280)
    camera.up.set(0, 0, 1) // Z is UP
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // 2. Ambient & Directional Sun Light (simulating Martian oblique illumination)
    const ambientLight = new THREE.AmbientLight(0xffecd0, 0.6)
    scene.add(ambientLight)

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.2)
    sunLight.position.set(-200, -300, 400)
    scene.add(sunLight)

    // 3. Construct 3D Plane Geometry from Decimated ARD DTM
    const { rows, cols, elevations, elev_mean_m } = gridData
    // Map dimensions in 3D scene units
    const planeWidth = 300
    const planeHeight = (rows / cols) * planeWidth

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, cols - 1, rows - 1)
    const posAttr = geometry.attributes.position

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // PlaneGeometry vertex index from top-left to bottom-right
        const idx = r * cols + c
        const rawZ = elevations[r][c]
        // Center heights around local Jezero mean (~ -2480m) to keep mesh near Z=0
        const normalizedZ = (rawZ - elev_mean_m) * 0.2 * exaggeration
        posAttr.setZ(idx, normalizedZ)
      }
    }
    geometry.computeVertexNormals()

    // 4. Texture Draping: Load authentic processed CTX Orthomosaic
    const textureLoader = new THREE.TextureLoader()
    const texture = textureLoader.load('/api/v1/twin/raster/ortho.png')
    texture.colorSpace = THREE.SRGBColorSpace

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.1,
    })

    const mesh = new THREE.Mesh(geometry, material)
    meshRef.current = mesh
    scene.add(mesh)

    // 5. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 6. Interactive Mouse Orbit / Tilt / Zoom Handling
    let isDragging = false
    let prevMouseX = 0
    let prevMouseY = 0

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true
      prevMouseX = e.clientX
      prevMouseY = e.clientY
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      const deltaX = e.clientX - prevMouseX
      const deltaY = e.clientY - prevMouseY
      prevMouseX = e.clientX
      prevMouseY = e.clientY

      // Rotate terrain mesh around Z (heading) and tilt around X
      mesh.rotation.z += deltaX * 0.008
      mesh.rotation.x += deltaY * 0.008
    }

    const onMouseUp = () => {
      isDragging = false
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camera.position.z = Math.max(80, Math.min(800, camera.position.z + e.deltaY * 0.5))
      camera.position.y = Math.max(-800, Math.min(-100, camera.position.y + e.deltaY * 0.6))
      camera.lookAt(0, 0, 0)
    }

    const dom = renderer.domElement
    dom.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    dom.addEventListener('wheel', onWheel, { passive: false })

    // 7. Animation Render Loop
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    // Resize Handler
    const onResize = () => {
      if (!container) return
      const newW = container.clientWidth
      const newH = container.clientHeight || 550
      camera.aspect = newW / newH
      camera.updateProjectionMatrix()
      renderer.setSize(newW, newH)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      dom.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      dom.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
    }
  }, [gridData, exaggeration])

  return (
    <div className="map3d-wrapper">
      <div className="map3d-toolbar">
        <label className="exaggeration-control">
          <strong>Vertical Exaggeration:</strong> {exaggeration.toFixed(1)}x
          <input
            type="range"
            min="0.5"
            max="6.0"
            step="0.5"
            value={exaggeration}
            onChange={(e) => setExaggeration(parseFloat(e.target.value))}
          />
        </label>
        <span className="elevation-stat">
          Elevation: {metadata.study_area.elevation_range_m.min.toFixed(0)}m to{' '}
          {metadata.study_area.elevation_range_m.max.toFixed(0)}m (Areoid)
        </span>
        <span className="interaction-tip">
          🖱 Drag to rotate/tilt · Scroll to zoom
        </span>
      </div>

      {loading && <div className="loading-indicator">Reconstructing 3D Martian terrain mesh…</div>}
      {error && <div className="error-message">Error loading 3D terrain: {error}</div>}

      <div ref={mountRef} className="three-canvas-container" />
    </div>
  )
}

