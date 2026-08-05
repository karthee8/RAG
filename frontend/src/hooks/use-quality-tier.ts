'use client';

import { useState, useEffect } from 'react';

type QualityTier = 'full' | 'reduced' | 'minimal';

export function useQualityTier(): QualityTier {
  const [tier, setTier] = useState<QualityTier>('full');

  useEffect(() => {
    // Check session cache
    const cached = sessionStorage.getItem('aether_quality_tier') as QualityTier;
    if (cached) {
      setTier(cached);
      return;
    }

    // Probe performance
    let frameCount = 0;
    let startTime = performance.now();
    let isProbing = true;

    const probe = () => {
      if (!isProbing) return;
      frameCount++;
      const now = performance.now();
      const elapsed = now - startTime;
      
      if (elapsed >= 2000) {
        const fps = (frameCount * 1000) / elapsed;
        let determinedTier: QualityTier = 'full';
        if (fps < 30) determinedTier = 'minimal';
        else if (fps < 55) determinedTier = 'reduced';
        
        setTier(determinedTier);
        sessionStorage.setItem('aether_quality_tier', determinedTier);
        isProbing = false;
      } else {
        requestAnimationFrame(probe);
      }
    };

    requestAnimationFrame(probe);

    return () => {
      isProbing = false;
    };
  }, []);

  return tier;
}
