'use client';

import { useState, useEffect } from 'react';

export type DeviceMode = 'pc' | 'mobile';

export function useDeviceMode() {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('pc');
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);

    const checkDevice = () => {
      // Check saved manual preference in session
      if (typeof window !== 'undefined') {
        const saved = sessionStorage.getItem('vaultdrop_device_override') as DeviceMode | null;
        if (saved === 'pc' || saved === 'mobile') {
          setDeviceMode(saved);
          return;
        }
      }

      // Screen width check (< 768px is Mobile / Phone)
      const isSmallScreen = window.innerWidth < 768;
      setDeviceMode(isSmallScreen ? 'mobile' : 'pc');
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  const switchMode = (mode: DeviceMode) => {
    setDeviceMode(mode);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('vaultdrop_device_override', mode);
    }
  };

  const resetMode = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('vaultdrop_device_override');
      const isSmallScreen = window.innerWidth < 768;
      setDeviceMode(isSmallScreen ? 'mobile' : 'pc');
    }
  };

  return {
    deviceMode,
    isMobile: deviceMode === 'mobile',
    isPC: deviceMode === 'pc',
    isMounted,
    switchMode,
    resetMode,
  };
}
