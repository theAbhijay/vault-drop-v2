'use client';

import React, { useState, useEffect } from 'react';
import { PeacockLoader } from './PeacockLoader';

export function InitialPageLoader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Run for 1.0 second on website opening
    const timer = setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        setVisible(false);
      }, 300); // 300ms fade-out transition
    }, 1000);

    return () => clearTimeout(timer);
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
