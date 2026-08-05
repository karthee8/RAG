'use client'

import React, { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useTheme } from 'next-themes'

const PARTICLE_COUNT = 250
const MAX_DISTANCE = 2.0
const MAX_LINES = 4000

function ParticleNetwork({ isDark }: { isDark: boolean }) {
  const pointsRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const { mouse, viewport } = useThree()

  // Initialize particles
  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      temp.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 8
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02,
          (Math.random() - 0.5) * 0.02
        ),
        mass: Math.random() * 0.5 + 0.1
      })
    }
    return temp
  }, [])

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3)
    const col = new Float32Array(PARTICLE_COUNT * 3)
    return [pos, col]
  }, [])

  const [linePositions, lineColors] = useMemo(() => {
    return [new Float32Array(MAX_LINES * 6), new Float32Array(MAX_LINES * 6)]
  }, [])

  const baseColor = useMemo(() => isDark ? new THREE.Color('#3b82f6') : new THREE.Color('#93c5fd'), [isDark])
  const highlightColor = useMemo(() => isDark ? new THREE.Color('#8b5cf6') : new THREE.Color('#c4b5fd'), [isDark])
  const cursorColor = useMemo(() => isDark ? new THREE.Color('#06b6d4') : new THREE.Color('#67e8f9'), [isDark])

  useFrame((state, delta) => {
    if (!pointsRef.current || !linesRef.current) return

    // Convert mouse to world coords roughly
    const mouseWorld = new THREE.Vector3(
      (mouse.x * viewport.width) / 2,
      (mouse.y * viewport.height) / 2,
      0
    )

    let lineIndex = 0

    // Adjust delta to prevent massive jumps if tab is inactive
    const dt = Math.min(delta, 0.1)

    // Update positions and velocities
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p1 = particles[i]
      
      // Mouse interaction (repel)
      const distToMouse = p1.position.distanceTo(mouseWorld)
      if (distToMouse < 4) {
        const dir = p1.position.clone().sub(mouseWorld).normalize()
        p1.velocity.add(dir.multiplyScalar(0.015))
      }

      // Constrain inside box (bounce)
      const boxSizeX = 10
      const boxSizeY = 10
      const boxSizeZ = 4
      
      if (p1.position.x > boxSizeX) { p1.position.x = boxSizeX; p1.velocity.x *= -0.5 }
      if (p1.position.x < -boxSizeX) { p1.position.x = -boxSizeX; p1.velocity.x *= -0.5 }
      if (p1.position.y > boxSizeY) { p1.position.y = boxSizeY; p1.velocity.y *= -0.5 }
      if (p1.position.y < -boxSizeY) { p1.position.y = -boxSizeY; p1.velocity.y *= -0.5 }
      if (p1.position.z > boxSizeZ) { p1.position.z = boxSizeZ; p1.velocity.z *= -0.5 }
      if (p1.position.z < -boxSizeZ) { p1.position.z = -boxSizeZ; p1.velocity.z *= -0.5 }

      // Friction
      p1.velocity.multiplyScalar(0.98)
      
      // Default slow movement to keep them alive
      if (p1.velocity.lengthSq() < 0.0001) {
        p1.velocity.add(new THREE.Vector3((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01))
      }

      // Base orbital drift
      p1.velocity.x += Math.sin(state.clock.elapsedTime * 0.1 + p1.position.y) * 0.0005
      p1.velocity.y += Math.cos(state.clock.elapsedTime * 0.1 + p1.position.x) * 0.0005

      p1.position.addScaledVector(p1.velocity, dt * 60)

      positions[i * 3] = p1.position.x
      positions[i * 3 + 1] = p1.position.y
      positions[i * 3 + 2] = p1.position.z

      // Set particle color based on Z depth
      const depthRatio = Math.max(0, Math.min(1, (p1.position.z + boxSizeZ) / (boxSizeZ * 2)))
      const pColor = baseColor.clone().lerp(highlightColor, depthRatio)
      
      if (distToMouse < 5) {
        pColor.lerp(cursorColor, 1 - (distToMouse / 5))
      }

      colors[i * 3] = pColor.r
      colors[i * 3 + 1] = pColor.g
      colors[i * 3 + 2] = pColor.b

      // Calculate connections
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const p2 = particles[j]
        const dist = p1.position.distanceTo(p2.position)
        
        if (dist < MAX_DISTANCE) {
          // Add attraction force
          const force = (MAX_DISTANCE - dist) * 0.0005
          const dir = p2.position.clone().sub(p1.position).normalize().multiplyScalar(force)
          p1.velocity.add(dir.multiplyScalar(p2.mass * dt * 60))
          p2.velocity.sub(dir.multiplyScalar(p1.mass * dt * 60))

          // Draw line if we have space in buffer
          if (lineIndex < MAX_LINES) {
            linePositions[lineIndex * 6] = p1.position.x
            linePositions[lineIndex * 6 + 1] = p1.position.y
            linePositions[lineIndex * 6 + 2] = p1.position.z
            linePositions[lineIndex * 6 + 3] = p2.position.x
            linePositions[lineIndex * 6 + 4] = p2.position.y
            linePositions[lineIndex * 6 + 5] = p2.position.z

            const alpha = 1.0 - (dist / MAX_DISTANCE)
            lineColors[lineIndex * 6] = pColor.r * alpha
            lineColors[lineIndex * 6 + 1] = pColor.g * alpha
            lineColors[lineIndex * 6 + 2] = pColor.b * alpha
            
            // For the second point, we could sample its color, but interpolating the first is usually fine for short lines
            lineColors[lineIndex * 6 + 3] = pColor.r * alpha
            lineColors[lineIndex * 6 + 4] = pColor.g * alpha
            lineColors[lineIndex * 6 + 5] = pColor.b * alpha

            lineIndex++
          }
        }
      }
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true
    pointsRef.current.geometry.attributes.color.needsUpdate = true
    
    linesRef.current.geometry.attributes.position.needsUpdate = true
    linesRef.current.geometry.attributes.color.needsUpdate = true
    linesRef.current.geometry.setDrawRange(0, lineIndex * 2)
  })

  // We need additive blending for dark mode, normal for light mode
  const materialProps = {
    vertexColors: true,
    transparent: true,
    opacity: isDark ? 0.8 : 0.4,
    blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false
  }

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={colors} itemSize={3} args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={isDark ? 0.18 : 0.12} {...materialProps} sizeAttenuation={true} />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={MAX_LINES * 2} array={linePositions} itemSize={3} args={[linePositions, 3]} />
          <bufferAttribute attach="attributes-color" count={MAX_LINES * 2} array={lineColors} itemSize={3} args={[lineColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial {...materialProps} linewidth={1} />
      </lineSegments>
    </group>
  )
}

export function DynamicBackground() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null
  
  const isDark = resolvedTheme === 'dark'

  return (
    <div className="absolute inset-0 z-0 pointer-events-none opacity-100 transition-opacity duration-1000">
      <Canvas camera={{ position: [0, 0, 7], fov: 60 }} dpr={[1, 2]}>
        <color attach="background" args={[isDark ? '#080808' : '#fafafa']} />
        <ParticleNetwork isDark={isDark} />
      </Canvas>
    </div>
  )
}
