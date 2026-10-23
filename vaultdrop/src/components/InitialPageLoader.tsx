'use client';

import React, { useState, useEffect } from 'react';
import { PeacockLoader } from './PeacockLoader';

export function InitialPageLoader() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const alreadyShown = sessionStorage.getItem('vaultdrop_initial_loader_shown');
      if (alreadyShown) {
        return;
      }
      sessionStorage.setItem('vaultdrop_initial_loader_shown', 'true');
      setVisible(true);

      const timer = setTimeout(() => {
        setFading(true);
        setTimeout(() => {
          setVisible(false);
        }, 300); // 300ms fade-out transition
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ease-out ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <PeacockLoader
        message="Initializing VaultDrop..."
        submessage="Zero-Trace Ephemeral Protocol"
      />
    </div>
  );
}
