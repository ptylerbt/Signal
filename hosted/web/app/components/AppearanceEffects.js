'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

const BASE_FONT_PX = 18;

// Applies the signed-in user's saved accessibility settings (font scale,
// high contrast) to the whole document. Renders nothing — just an effect.
export default function AppearanceEffects() {
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        document.documentElement.style.fontSize = `${BASE_FONT_PX * (data.fontScale || 1)}px`;
        document.documentElement.dataset.contrast = data.highContrast ? 'high' : 'normal';
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  return null;
}
