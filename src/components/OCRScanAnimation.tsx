import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * A glowing scan-line sweeping down over a subtle 3D wireframe grid, rendered
 * with Three.js. Meant to sit as a transparent overlay on top of the OCR
 * dialog's captured image while it's being analyzed.
 */
export function OCRScanAnimation({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const colorProbeRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const colorProbe = colorProbeRef.current
    if (!container || !colorProbe) return

    // Read the theme's accent color as rendered (oklch -> rgb by the browser)
    // instead of hardcoding a hex that would drift from the theme.
    const accentColor = new THREE.Color().setStyle(getComputedStyle(colorProbe).color)

    const width = container.clientWidth || 1
    const height = container.clientHeight || 1

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000)
    camera.position.z = 100

    const gridSize = Math.max(width, height) * 1.5
    const divisions = Math.max(6, Math.round(gridSize / 24))
    const grid = new THREE.GridHelper(gridSize, divisions, accentColor, accentColor)
    grid.rotation.x = Math.PI / 2
    const gridMaterial = grid.material as THREE.LineBasicMaterial
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.18
    scene.add(grid)

    const beamGroup = new THREE.Group()
    const beamWidth = width * 1.2
    const coreHeight = 3
    const glowHeight = 24

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const core = new THREE.Mesh(new THREE.PlaneGeometry(beamWidth, coreHeight), coreMaterial)
    beamGroup.add(core)

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(beamWidth, glowHeight), glowMaterial)
    beamGroup.add(glow)

    beamGroup.position.z = 1
    scene.add(beamGroup)

    let beamY = height / 2
    let lastTime = performance.now()
    let frameId = 0

    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000
      lastTime = time

      const speed = height / 1.4 // full top-to-bottom sweep in ~1.4s
      beamY -= speed * dt
      if (beamY < -height / 2 - glowHeight) {
        beamY = height / 2 + glowHeight
      }
      beamGroup.position.y = beamY

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const newWidth = entry.contentRect.width || 1
      const newHeight = entry.contentRect.height || 1

      renderer.setSize(newWidth, newHeight)
      camera.left = -newWidth / 2
      camera.right = newWidth / 2
      camera.top = newHeight / 2
      camera.bottom = -newHeight / 2
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      grid.geometry.dispose()
      gridMaterial.dispose()
      core.geometry.dispose()
      coreMaterial.dispose()
      glow.geometry.dispose()
      glowMaterial.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div ref={containerRef} className={className}>
      <span ref={colorProbeRef} className="sr-only text-accent" aria-hidden="true" />
    </div>
  )
}
