'use client';

import React from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import { useDeviceMode, DeviceMode } from '@/hooks/useDeviceMode';

interface DeviceModePillProps {
  className?: string;
  onModeChange?: (mode: DeviceMode) => void;
}

export function DeviceModePill({ className = '', onModeChange }: DeviceModePillProps) {
  const { deviceMode, isMounted, switchMode } = useDeviceMode();

  if (!isMounted) return null;

  const handleSelect = (mode: DeviceMode) => {
    switchMode(mode);
    if (onModeChange) onModeChange(mode);
  };

  return (
    <div
      className={`inline-flex items-center p-1 bg-[#F8F3F0] rounded-full border border-[#E5DCD4] shadow-xs ${className}`}
      role="group"
      aria-label="Device View Switcher"
    >
      <button
        type="button"
        onClick={() => handleSelect('pc')}
        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[12px] font-semibold transition-all tap-spring cursor-pointer ${
          deviceMode === 'pc'
            ? 'bg-white text-[#014BAA] shadow-xs'
            : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
        }`}
        title="Switch to Lab PC Terminal Experience"
      >
        <Laptop className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">PC</span>
      </button>

      <button
        type="button"
        onClick={() => handleSelect('mobile')}
        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[12px] font-semibold transition-all tap-spring cursor-pointer ${
          deviceMode === 'mobile'
            ? 'bg-white text-[#014BAA] shadow-xs'
            : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
        }`}
        title="Switch to Smartphone Vault Experience"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Phone</span>
      </button>
    </div>
  );
}
