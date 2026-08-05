'use client';

import { useState, useEffect } from 'react';

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Check local storage setting first
    const override = localStorage.getItem('aether_reduce_motion');
    if (override === 'true') {
      setReducedMotion(true);
      return;
    } else if (override === 'false') {
      setReducedMotion(false);
      return;
    }

    // Fall back to OS preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      const currentOverride = localStorage.getItem('aether_reduce_motion');
      if (currentOverride === null) {
        setReducedMotion(e.matches);
      }
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return reducedMotion;
}
