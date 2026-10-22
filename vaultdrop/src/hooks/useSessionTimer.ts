'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Expanded session duration: 30 minutes (1800 seconds)
const SESSION_DURATION_SECONDS = 30 * 60;
// Warning shows during the final 2 minutes (120 seconds)
const WARNING_THRESHOLD_SECONDS = 120;
const SESSION_STORAGE_KEY = 'vaultdrop_session_expiry';

interface UseSessionTimerOptions {
  onTimeout: () => void;
  enabled?: boolean;
}

export function useSessionTimer({ onTimeout, enabled = true }: UseSessionTimerOptions) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(SESSION_DURATION_SECONDS);
  const [isWarning, setIsWarning] = useState<boolean>(false);
  const timeoutCalledRef = useRef<boolean>(false);

  // Initialize or fetch persistent session expiry timestamp
  const getOrCreateExpiry = useCallback((): number => {
    if (typeof window === 'undefined') return Date.now() + SESSION_DURATION_SECONDS * 1000;
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const exp = parseInt(stored, 10);
      if (!isNaN(exp) && exp > Date.now()) {
        return exp;
      }
    }
    const newExpiry = Date.now() + SESSION_DURATION_SECONDS * 1000;
    sessionStorage.setItem(SESSION_STORAGE_KEY, newExpiry.toString());
    return newExpiry;
  }, []);

  // Extend session by 30 minutes
  const extendSession = useCallback(() => {
    const newExpiry = Date.now() + SESSION_DURATION_SECONDS * 1000;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, newExpiry.toString());
    }
    setSecondsRemaining(SESSION_DURATION_SECONDS);
    setIsWarning(false);
    timeoutCalledRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    timeoutCalledRef.current = false;
    let targetExpiry = getOrCreateExpiry();

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((targetExpiry - Date.now()) / 1000));
      setSecondsRemaining(diff);

      if (diff <= WARNING_THRESHOLD_SECONDS && diff > 0) {
        setIsWarning(true);
      } else if (diff > WARNING_THRESHOLD_SECONDS) {
        setIsWarning(false);
      }

      if (diff <= 0 && !timeoutCalledRef.current) {
        timeoutCalledRef.current = true;
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
        onTimeout();
      }
    };

    // Run initial tick
    updateTimer();

    // High-precision interval ticker
    const interval = setInterval(updateTimer, 1000);

    // Tab visibility listener: when student switches back to this tab, immediately check
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        targetExpiry = getOrCreateExpiry();
        updateTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, getOrCreateExpiry, onTimeout]);

  return {
    secondsRemaining,
    isWarning,
    extendSession,
  };
}
