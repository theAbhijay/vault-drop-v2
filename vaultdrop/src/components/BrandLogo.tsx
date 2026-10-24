import React from 'react';

/**
 * VaultDrop brand mark — pixel-for-pixel the same artwork as the favicon
 * (src/app/icon.svg): dark glass squircle, Apple spectral shield outline,
 * droplet vault core with keyhole.
 */
export function BrandLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="VaultDrop logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0071E3" />
          <stop offset="30%" stopColor="#5856D6" />
          <stop offset="55%" stopColor="#AF52DE" />
          <stop offset="75%" stopColor="#FF2D55" />
          <stop offset="100%" stopColor="#FF9500" />
        </linearGradient>
        <linearGradient id="brandGlass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#181B22" />
          <stop offset="100%" stopColor="#090B0F" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#brandGlass)" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />

      <path
        d="M32 10 L48 17 V30 C48 40.5 41.5 48.5 32 53 C22.5 48.5 16 40.5 16 30 V17 Z"
        fill="none"
        stroke="url(#brandGrad)"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      <path
        d="M32 12.5 L45.5 18.5 V30 C45.5 39 40 46 32 50 C24 46 18.5 39 18.5 30 V18.5 Z"
        fill="url(#brandGrad)"
        fillOpacity="0.12"
      />

      <path
        d="M32 20 C27 26 25 29 25 33 C25 37 28 40 32 40 C36 40 39 37 39 33 C39 29 37 26 32 20 Z"
        fill="url(#brandGrad)"
      />

      <circle cx="32" cy="32" r="3" fill="#FFFFFF" />
      <path d="M30.5 33.5 H33.5 L34 37 H30 Z" fill="#FFFFFF" />
    </svg>
  );
}
