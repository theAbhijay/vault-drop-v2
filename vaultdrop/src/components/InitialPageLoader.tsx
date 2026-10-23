'use client';

import React, { useState, useEffect } from 'react';
import { PeacockLoader } from './PeacockLoader';

export function InitialPageLoader() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const alreadyShown = sessionStorage.getItem('vaultdrop_initial_loader_shown');
    if (alreadyShown) return;

    sessionStorage.setItem('vaultdrop_initial_loader_shown', 'true');

    // Deferred start (rAF) so no setState fires synchronously inside the effect.
    const startId = requestAnimationFrame(() => setVisible(true));
    const fadeTimer = setTimeout(() => {
      setFading(true);
      setTimeout(() => setVisible(false), 300); // 300ms fade-out transition
    }, 1000);

    return () => {
      cancelAnimationFrame(startId);
      clearTimeout(fadeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ease-out ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <PeacockLoader message="Initializing VaultDrop..." submessage="Zero-Trace Ephemeral Protocol" />
    </div>
  );
}
