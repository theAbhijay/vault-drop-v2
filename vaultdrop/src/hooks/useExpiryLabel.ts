'use client';

import { useEffect, useState } from 'react';
import { getExpiryLabel } from '@/lib/file-helpers';

/**
 * Live expiry countdown shared by FileRow and MobileFileCard.
 * Single source of truth — previously duplicated in both components.
 * expiresAt is static per file row, so the lazy initializer is sufficient;
 * the 30s interval keeps the label fresh.
 */
export function useExpiryLabel(expiresAt: string) {
  const [expiry, setExpiry] = useState(() => getExpiryLabel(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setExpiry(getExpiryLabel(expiresAt));
    }, 30 * 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return expiry;
}
