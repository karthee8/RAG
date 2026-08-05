'use client';

import * as THREE from 'three';
import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useReducedMotion } from '@/hooks/use-reduced-motion'; // Will implement soon
import { useQualityTier } from '@/hooks/use-quality-tier'; // Will implement soon

// 5 category colors for clusters
export const CATEGORY_COLORS = [
  new THREE.Color('#3b82f6'), // Documents - Blue
  new THREE.Color('#10b981'), // Websites - Green
  new THREE.Color('#ef4444'), // Videos - Red
  new THREE.Color('#a855f7'), // Images - Purple
  new THREE.Color('#f97316'), // Research Papers - Orange
];

const MAX_NODE_COUNT = 300;
const CLUSTER_COUNT = CATEGORY_COLORS.length;

// Static centers for the clusters
export const BASE_CLUSTER_CENTERS = [
  new THREE.Vector3(0, 0, -1),      // Documents (Center)
  new THREE.Vector3(-3.5, 1.5, -2), // Websites (Top Left)
  new THREE.Vector3(3.5, 1.5, -2),  // Videos (Top Right)
  new THREE.Vector3(-3, -2.5, -2),  // Images (Bottom Left)
  new THREE.Vector3(3, -2, -1.5),   // Research Papers (Bottom Right)
];

function ParticleField() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  
  const tier = useQualityTier();
  const reduceMotion = useReducedMotion();
  
  const activeNodeCount = tier === 'minimal' ? 40 : tier === 'reduced' ? 100 : MAX_NODE_COUNT;
  const enablePulses = tier === 'full' && !reduceMotion;
  const enableEdges = tier !== 'minimal';
  
  // Pre-calculate properties for each node
  const particles = useMemo(() => {
    const data = [];
    const colors = new Float32Array(MAX_NODE_COUNT * 3);
    for (let i = 0; i < MAX_NODE_COUNT; i++) {
      const categoryIdx = Math.floor(Math.random() * 5);
      data.push({
        categoryIdx,
        offsetX: (Math.random() - 0.5) * 8,
        offsetY: (Math.random() - 0.5) * 8,
        offsetZ: (Math.random() - 0.5) * 4,
        speedX: Math.random() * 0.2 + 0.1,
        speedY: Math.random() * 0.2 + 0.1,
        speedZ: Math.random() * 0.2 + 0.1,
        phase: Math.random() * Math.PI * 2,
      });
      const c = CATEGORY_COLORS[categoryIdx];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { data, colors };
  }, []);

  const linesData = useMemo(() => {
    const maxEdges = 100;
    const positions = new Float32Array(maxEdges * 2 * 3);
    const colors = new Float32Array(maxEdges * 2 * 3);
    const alphas = new Float32Array(maxEdges * 2);
    const edges = [];
    
    for (let i = 0; i < maxEdges; i++) {
      edges.push({ a: -1, b: -1, currentAlpha: 0, targetAlpha: 0 });
    }
    
    return { maxEdges, positions, colors, alphas, edges };
  }, []);

  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const lastRecompute = useRef(0);
  
  const activePulses = useRef<{center: THREE.Vector3, color: THREE.Color, startTime: number, maxRadius: number}[]>([]);
  const lastPulseTime = useRef(0);
  const nextPulseDelay = useRef(4.0);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    if (!meshRef.current || !linesRef.current) return;
    
    meshRef.current.count = activeNodeCount;
    
    frameCount.current++;
    const now = performance.now();
    if (now - lastTime.current >= 2000) {
      const fps = (frameCount.current * 1000) / (now - lastTime.current);
      console.log(`[Phase 5 FPS] Tier=${tier}, FPS=${fps.toFixed(1)}`);
      frameCount.current = 0;
      lastTime.current = now;
    }

    const time = state.clock.elapsedTime;
    
    const motionMultiplier = reduceMotion ? 0.1 : 1.0;
    
    const cameraAngle = time * (Math.PI * 2 / 60) * motionMultiplier;
    const cameraRadius = 12;
    state.camera.position.x = Math.sin(cameraAngle) * cameraRadius;
    state.camera.position.z = Math.cos(cameraAngle) * cameraRadius;
    state.camera.position.y = Math.sin(cameraAngle * 0.5) * 2;
    state.camera.lookAt(0, 0, -2);
    
    const currentPositions: [number, number, number][] = new Array(activeNodeCount);
    
    for (let i = 0; i < activeNodeCount; i++) {
      const p = particles.data[i];
      const baseCenter = BASE_CLUSTER_CENTERS[p.categoryIdx];
      
      const clusterDriftX = Math.sin(time * 0.2 * motionMultiplier + p.categoryIdx) * 1.5;
      const clusterDriftY = Math.cos(time * 0.25 * motionMultiplier + p.categoryIdx) * 1.5;
      const clusterDriftZ = Math.sin(time * 0.15 * motionMultiplier + p.categoryIdx) * 1.5;
      
      const nodeDriftX = Math.sin(time * p.speedX * motionMultiplier + p.phase);
      const nodeDriftY = Math.cos(time * p.speedY * motionMultiplier + p.phase);
      const nodeDriftZ = Math.sin(time * p.speedZ * motionMultiplier + p.phase);
      
      const x = baseCenter.x + clusterDriftX + p.offsetX + nodeDriftX;
      const y = baseCenter.y + clusterDriftY + p.offsetY + nodeDriftY;
      const z = baseCenter.z + clusterDriftZ + p.offsetZ + nodeDriftZ;
      
      currentPositions[i] = [x, y, z];
    }

    if (enablePulses) {
      if (time - lastPulseTime.current > nextPulseDelay.current) {
        lastPulseTime.current = time;
        nextPulseDelay.current = 4.0 + Math.random() * 2.0;
        
        const sourceIdx = Math.floor(Math.random() * activeNodeCount);
        const sourcePos = new THREE.Vector3(...currentPositions[sourceIdx]);
        const sourceCat = particles.data[sourceIdx].categoryIdx;
        const sourceColor = CATEGORY_COLORS[sourceCat];
        
        activePulses.current.push({
          center: sourcePos,
          color: sourceColor,
          startTime: time,
          maxRadius: 6.0 + Math.random() * 4.0
        });
      }

      activePulses.current = activePulses.current.filter(p => (time - p.startTime) * 3.0 < p.maxRadius + 2.0);
    } else {
      activePulses.current = [];
    }

    const dynamicColors = new Float32Array(MAX_NODE_COUNT * 3);
    
    for (let i = 0; i < activeNodeCount; i++) {
      const baseR = particles.colors[i * 3];
      const baseG = particles.colors[i * 3 + 1];
      const baseB = particles.colors[i * 3 + 2];
      
      let finalR = baseR;
      let finalG = baseG;
      let finalB = baseB;
      let finalScale = 0.05 + (i % 5) * 0.01;

      if (enablePulses) {
        for (const pulse of activePulses.current) {
          const px = currentPositions[i][0] - pulse.center.x;
          const py = currentPositions[i][1] - pulse.center.y;
          const pz = currentPositions[i][2] - pulse.center.z;
          const dist = Math.sqrt(px*px + py*py + pz*pz);
          
          if (dist <= pulse.maxRadius) {
            const wavePos = (time - pulse.startTime) * 3.0;
            const diff = Math.abs(dist - wavePos);
            const thickness = 1.2;
            
            if (diff < thickness) {
              const intensity = Math.pow(1.0 - (diff / thickness), 2);
              finalR += pulse.color.r * intensity * 1.5;
              finalG += pulse.color.g * intensity * 1.5;
              finalB += pulse.color.b * intensity * 1.5;
              finalScale += intensity * 0.02;
            }
          }
        }
      }

      dynamicColors[i * 3] = finalR;
      dynamicColors[i * 3 + 1] = finalG;
      dynamicColors[i * 3 + 2] = finalB;

      dummy.position.set(...currentPositions[i]);
      dummy.scale.set(finalScale, finalScale, finalScale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
      const instanceColorArray = meshRef.current.instanceColor.array as Float32Array;
      instanceColorArray.set(dynamicColors);
    }

    if (enableEdges) {
      if (time - lastRecompute.current > (reduceMotion ? 8.0 : 4.0)) {
        lastRecompute.current = time;
        
        const candidates = [];
        for (let i = 0; i < activeNodeCount; i++) {
          for (let j = i + 1; j < activeNodeCount; j++) {
            const dx = currentPositions[i][0] - currentPositions[j][0];
            const dy = currentPositions[i][1] - currentPositions[j][1];
            const dz = currentPositions[i][2] - currentPositions[j][2];
            const distSq = dx*dx + dy*dy + dz*dz;
            if (distSq < 4.0) {
              candidates.push({ i, j, distSq });
            }
          }
        }
        
        candidates.sort((a, b) => a.distSq - b.distSq);
        const topCandidates = candidates.slice(0, linesData.maxEdges);

        for (let e = 0; e < linesData.maxEdges; e++) {
          const edge = linesData.edges[e];
          if (e < topCandidates.length) {
            const cand = topCandidates[e];
            edge.a = cand.i;
            edge.b = cand.j;
            edge.targetAlpha = 0.5;
          } else {
            edge.targetAlpha = 0;
          }
        }
      }

      if (linesRef.current) {
        const linePositions = linesRef.current.geometry.attributes.position.array as Float32Array;
        const lineColors = linesRef.current.geometry.attributes.color.array as Float32Array;
        const lineAlphas = linesRef.current.geometry.attributes.alpha.array as Float32Array;

      for (let e = 0; e < linesData.maxEdges; e++) {
        const edge = linesData.edges[e];
        edge.currentAlpha += (edge.targetAlpha - edge.currentAlpha) * (reduceMotion ? 0.02 : 0.05);

        const idx = e * 2;
        const v1 = idx * 3;
        const v2 = (idx + 1) * 3;

        if (edge.a !== -1 && edge.b !== -1 && edge.currentAlpha > 0.001) {
          const pA = currentPositions[edge.a];
          const pB = currentPositions[edge.b];
          
          linePositions[v1] = pA[0]; linePositions[v1+1] = pA[1]; linePositions[v1+2] = pA[2];
          linePositions[v2] = pB[0]; linePositions[v2+1] = pB[1]; linePositions[v2+2] = pB[2];

          lineColors[v1] = dynamicColors[edge.a*3]; 
          lineColors[v1+1] = dynamicColors[edge.a*3+1]; 
          lineColors[v1+2] = dynamicColors[edge.a*3+2];
          
          lineColors[v2] = dynamicColors[edge.b*3]; 
          lineColors[v2+1] = dynamicColors[edge.b*3+1]; 
          lineColors[v2+2] = dynamicColors[edge.b*3+2];
        }
        
        lineAlphas[idx] = edge.currentAlpha;
        lineAlphas[idx + 1] = edge.currentAlpha;
      }

        linesRef.current.geometry.attributes.position.needsUpdate = true;
        linesRef.current.geometry.attributes.color.needsUpdate = true;
        linesRef.current.geometry.attributes.alpha.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_NODE_COUNT]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial 
          transparent 
          opacity={0.7} 
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
        <instancedBufferAttribute 
          attach="instanceColor" 
          args={[particles.colors, 3]} 
        />
      </instancedMesh>

      {enableEdges && (
        <lineSegments ref={linesRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linesData.positions, 3]} />
            <bufferAttribute attach="attributes-color" args={[linesData.colors, 3]} />
            <bufferAttribute attach="attributes-alpha" args={[linesData.alphas, 1]} />
          </bufferGeometry>
          <shaderMaterial
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            vertexShader={`
              attribute float alpha;
              attribute vec3 color;
              varying vec3 vColor;
              varying float vAlpha;
              void main() {
                vColor = color;
                vAlpha = alpha;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              varying vec3 vColor;
              varying float vAlpha;
              void main() {
                gl_FragColor = vec4(vColor, vAlpha);
              }
            `}
          />
        </lineSegments>
      )}
    </>
  );
}

import { IngestionCommandNodes } from './ingestion-command-nodes';

export default function KnowledgeUniverseBackground() {
  return (
    <div className="fixed inset-0 -z-10 bg-[#0A0A0F] pointer-events-none">
      <Canvas camera={{ position: [0, 0, 8], fov: 45, near: 0.1, far: 100 }} style={{ pointerEvents: 'auto' }}>
        <React.Suspense fallback={null}>
          <OrbitControls enableZoom={true} enablePan={true} enableRotate={true} />
          <fogExp2 attach="fog" args={['#0A0A0F', 0.03]} />
          <ParticleField />
          <IngestionCommandNodes />
        </React.Suspense>
      </Canvas>
      {/* Interaction Hints */}
      <div className="absolute bottom-32 right-12 flex flex-col gap-2 text-white/50 text-[10px] items-end pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 bg-white/5 backdrop-blur-md">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
           Drag to rotate
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 bg-white/5 backdrop-blur-md">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/></svg>
           Scroll to zoom
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 bg-white/5 backdrop-blur-md">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>
           Click nodes to explore
        </div>
      </div>
    </div>
  );
}
