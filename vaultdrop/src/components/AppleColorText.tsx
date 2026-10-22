'use client';

import React from 'react';

// Apple Keynote / WWDC / Apple Intelligence Spectral Stops
const APPLE_SPECTRUM = [
  '#0071E3', // Apple Blue
  '#0091FF', // Apple Cyan / Sky
  '#5856D6', // Apple Indigo
  '#AF52DE', // Apple Purple / Violet
  '#FF2D55', // Apple Hot Pink
  '#FF375F', // Apple Coral Rose
  '#FF3B30', // Apple Electric Red
  '#FF9500', // Apple Radiant Orange
  '#FFB340', // Apple Sunset Amber
  '#FFD60A', // Apple Solar Yellow
];

interface AppleColorTextProps {
  text: string;
  className?: string;
  mode?: 'chars' | 'gradient';
  interactive?: boolean;
}

/**
 * AppleColorText renders text in the iconic Apple Intelligence / Keynote rainbow spectrum.
 * - 'chars': assigns calculated chromatic spectral colors to individual characters with subtle spring physics.
 * - 'gradient': uses continuous high-fidelity linear gradient background-clip text.
 */
export function AppleColorText({
  text,
  className = '',
  mode = 'chars',
  interactive = true,
}: AppleColorTextProps) {
  if (mode === 'gradient') {
    return (
      <span
        className={`bg-clip-text text-transparent font-extrabold tracking-tight ${className}`}
        style={{
          backgroundImage:
            'linear-gradient(135deg, #0071E3 0%, #5856D6 20%, #AF52DE 40%, #FF2D55 60%, #FF3B30 75%, #FF9500 90%, #FFD60A 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {text}
      </span>
    );
  }

  // Calculate discrete chromatic position across non-whitespace characters
  const characters = Array.from(text);
  const nonSpaceCount = characters.filter((c) => c.trim().length > 0).length;
  let charIndex = 0;

  return (
    <span className={`inline-block font-extrabold tracking-tight select-none ${className}`}>
      {characters.map((char, i) => {
        if (char === ' ') {
          return <span key={i}> </span>;
        }

        // Interpolate index into the Apple spectrum array
        const ratio = nonSpaceCount > 1 ? charIndex / (nonSpaceCount - 1) : 0;
        const colorIdx = Math.min(
          Math.floor(ratio * (APPLE_SPECTRUM.length - 1) + 0.5),
          APPLE_SPECTRUM.length - 1
        );
        const color = APPLE_SPECTRUM[colorIdx];
        charIndex++;

        return (
          <span
            key={i}
            className={`inline-block transition-transform duration-200 ease-out ${
              interactive ? 'hover:-translate-y-0.5 hover:scale-110 active:scale-95 cursor-default' : ''
            }`}
            style={{
              color: color,
              textShadow: `0 0 16px ${color}25`,
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}
