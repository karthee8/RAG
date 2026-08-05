'use client';

import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { BASE_CLUSTER_CENTERS, CATEGORY_COLORS } from './knowledge-universe-background';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const CLUSTER_LABELS = [
  { title: 'Documents', subtitle: '132 chunks' },
  { title: 'Websites', subtitle: '87 chunks' },
  { title: 'Videos', subtitle: '45 chunks' },
  { title: 'Images', subtitle: '38 chunks' },
  { title: 'Research Papers', subtitle: '56 chunks' },
];

export function IngestionCommandNodes() {
  const groupRef = useRef<THREE.Group>(null);
  const reduceMotion = useReducedMotion();

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;
    const motionMultiplier = reduceMotion ? 0.1 : 1.0;

    groupRef.current.children.forEach((child, idx) => {
      const baseCenter = BASE_CLUSTER_CENTERS[idx];
      if (!baseCenter) return;
      
      const clusterDriftX = Math.sin(time * 0.2 * motionMultiplier + idx) * 1.5;
      const clusterDriftY = Math.cos(time * 0.25 * motionMultiplier + idx) * 1.5;
      const clusterDriftZ = Math.sin(time * 0.15 * motionMultiplier + idx) * 1.5;

      child.position.set(
        baseCenter.x + clusterDriftX,
        baseCenter.y + clusterDriftY,
        baseCenter.z + clusterDriftZ
      );
    });
  });

  return (
    <group ref={groupRef}>
      {CLUSTER_LABELS.map((label, idx) => {
        const color = CATEGORY_COLORS[idx];
        return (
          <group key={label.title}>
            {/* Inner Core */}
            <mesh position={[0, 0, 0]}>
              <sphereGeometry args={[0.2, 32, 32]} />
              <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={1}
              />
            </mesh>
            
            {/* Outer Glow */}
            <mesh position={[0, 0, 0]}>
              <sphereGeometry args={[0.9, 32, 32]} />
              <meshBasicMaterial 
                color={color} 
                transparent 
                opacity={0.15}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            <pointLight position={[0, 0, 0]} color={color} distance={5} intensity={2} />

            {/* Icon inside (Using Unicode or Text) */}
            <Text
              position={[0, 0, 0.3]}
              fontSize={0.2}
              color="#FFFFFF"
              anchorX="center"
              anchorY="middle"
            >
              {idx === 0 ? '📄' : idx === 1 ? '🔗' : idx === 2 ? '▶️' : idx === 3 ? '🖼️' : '📚'}
            </Text>

            {/* Title */}
            <Text
              position={[0, -0.6, 0.3]}
              fontSize={0.2}
              color="#FFFFFF"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.015}
              outlineColor="#000000"
            >
              {label.title}
            </Text>
            
            {/* Subtitle */}
            <Text
              position={[0, -0.85, 0.3]}
              fontSize={0.12}
              color="#AAAAAA"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.015}
              outlineColor="#000000"
            >
              {label.subtitle}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
