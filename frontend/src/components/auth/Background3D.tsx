'use client'

import React, { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sparkles, TorusKnot, MeshDistortMaterial, Float } from '@react-three/drei'
import * as THREE from 'three'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

function AnimatedShape() {
  const meshRef = useRef<THREE.Mesh>(null)
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.1
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.15
    }
  })

  const { theme } = useTheme()
  const color = theme === 'dark' ? '#6366f1' : '#3b82f6'

  return (
    <Float speed={2} rotationIntensity={1.5} floatIntensity={2}>
      <TorusKnot ref={meshRef as any} args={[1, 0.3, 128, 32]} scale={1.2}>
        <MeshDistortMaterial 
          color={color} 
          envMapIntensity={1} 
          clearcoat={1} 
          clearcoatRoughness={0.1} 
          metalness={0.5} 
          roughness={0.2} 
          distort={0.4} 
          speed={2} 
          wireframe={true}
        />
      </TorusKnot>
    </Float>
  )
}

function InteractiveDocument({ i, position, rotation }: { i: number, position: [number, number, number], rotation: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const [caught, setCaught] = useState(false)

  useFrame(() => {
    if (meshRef.current && caught) {
      meshRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), 0.1)
      meshRef.current.rotation.x += 0.2
      meshRef.current.rotation.y += 0.2
    }
  })

  return (
    <Float speed={hovered ? 5 : 2} rotationIntensity={hovered ? 4 : 2} floatIntensity={hovered ? 5 : 3}>
      <mesh 
        ref={meshRef}
        position={position} 
        rotation={rotation}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'default' }}
        onClick={(e) => {
          e.stopPropagation()
          if (!caught) {
            setCaught(true)
            toast.success('Caught a floating document! 📄')
            document.body.style.cursor = 'default'
          }
        }}
      >
        <planeGeometry args={[0.6, 0.8]} />
        <meshStandardMaterial 
          color={hovered ? "#3b82f6" : "#ffffff"} 
          emissive={hovered ? "#3b82f6" : "#e2e8f0"}
          emissiveIntensity={hovered ? 1 : 0.6}
          side={THREE.DoubleSide} 
          transparent 
          opacity={caught ? 0 : 0.8}
        />
      </mesh>
    </Float>
  )
}

function FloatingDocuments() {
  const group = useRef<THREE.Group>(null)
  
  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = state.clock.elapsedTime * 0.05
    }
  })

  return (
    <group ref={group}>
      {Array.from({ length: 15 }).map((_, i) => {
        // Deterministic pseudo-random for stable hydration
        const x = (Math.sin(i * 13) * 10)
        const y = (Math.cos(i * 17) * 10)
        const z = (Math.sin(i * 19) * 5) - 2
        const rotX = Math.cos(i * 23) * Math.PI
        const rotY = Math.sin(i * 29) * Math.PI
        
        return <InteractiveDocument key={i} i={i} position={[x, y, z]} rotation={[rotX, rotY, 0]} />
      })}
    </group>
  )
}

export function Background3D({ mode }: { mode: 'login' | 'signup' | 'dashboard' | 'live-auth' }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  
  let sparkleColor = isDark ? '#60a5fa' : '#3b82f6'
  if (mode === 'signup') sparkleColor = isDark ? '#a78bfa' : '#8b5cf6'
  if (mode === 'dashboard') sparkleColor = isDark ? '#10b981' : '#34d399'
  if (mode === 'live-auth') sparkleColor = '#ffffff'

  let opacityClass = 'opacity-60'
  if (mode === 'dashboard') opacityClass = 'opacity-30'
  if (mode === 'live-auth') opacityClass = 'opacity-100'

  return (
    <div className={`absolute inset-0 z-0 ${opacityClass}`}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={mode === 'live-auth' ? 1.5 : 0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        
        {mode !== 'live-auth' && <AnimatedShape />}
        {mode === 'live-auth' && <FloatingDocuments />}
        
        <Sparkles 
          count={mode === 'live-auth' ? 150 : 100} 
          scale={15} 
          size={mode === 'live-auth' ? 4 : 3} 
          speed={0.4} 
          opacity={mode === 'live-auth' ? 0.6 : 0.3} 
          color={sparkleColor} 
        />
      </Canvas>
    </div>
  )
}
