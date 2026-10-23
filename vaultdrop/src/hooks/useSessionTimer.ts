'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Strict 30-minute session lifetime (1800 seconds)
export const SESSION_DURATION_SECONDS = 30 * 60;
// Warning banner displays during final 2 minutes
export const WARNING_THRESHOLD_SECONDS = 120;
export const SESSION_STORAGE_KEY = 'vaultdrop_session_expiry';

interface UseSessionTimerOptions {
  onTimeout: () => void;
  enabled?: boolean;
}

/**
 * Hard wall-clock session expiry (30 min), stored in sessionStorage ONLY.
 *
 * The tick always reads the CURRENT stored expiry — never a stale closure
 * value — so `extendSession` (same tab or another tab via the storage event)
 * takes effect on the very next second.
 */
export function useSessionTimer({ onTimeout, enabled = true }: UseSessionTimerOptions) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(SESSION_DURATION_SECONDS);
  const [isWarning, setIsWarning] = useState<boolean>(false);
  const timeoutFiredRef = useRef<boolean>(false);

  // Keep the callback in a ref so identity changes never re-run the effect
  // (and never reset the countdown).
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const readStoredExpiry = useCallback((): number | null => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = parseInt(stored, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, []);

  const writeStoredExpiry = useCallback((value: number) => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(SESSION_STORAGE_KEY, value.toString());
  }, []);

  // Extend or initialize the session
  const extendSession = useCallback(() => {
    const newExpiry = Date.now() + SESSION_DURATION_SECONDS * 1000;
    writeStoredExpiry(newExpiry);
    setSecondsRemaining(SESSION_DURATION_SECONDS);
    setIsWarning(false);
    timeoutFiredRef.current = false;
  }, [writeStoredExpiry]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    timeoutFiredRef.current = false;

    // Initialize if missing; inherit if already running (e.g. refresh in tab)
    if (readStoredExpiry() === null) {
      writeStoredExpiry(Date.now() + SESSION_DURATION_SECONDS * 1000);
    }

    const fireTimeout = () => {
      if (timeoutFiredRef.current) return;
      timeoutFiredRef.current = true;
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      onTimeoutRef.current();
    };

    // ALWAYS read the live stored value — extendSession (any tab) applies next tick.
    const checkAndTick = () => {
      const target = readStoredExpiry();

      if (target === null) {
        // Another context cleared the session (logout/panic in this tab's storage)
        fireTimeout();
        return;
      }

      const diffSeconds = Math.floor((target - Date.now()) / 1000);

      if (diffSeconds <= 0) {
        setSecondsRemaining(0);
        setIsWarning(false);
        fireTimeout();
        return;
      }

      setSecondsRemaining(diffSeconds);
      setIsWarning(diffSeconds <= WARNING_THRESHOLD_SECONDS);
    };

    checkAndTick();
    const interval = setInterval(checkAndTick, 1000);

    // Cross-tab sync: another tab extending/clearing updates this tab instantly.
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SESSION_STORAGE_KEY || e.key === null) checkAndTick();
    };

    // Sleep / tab switch / BFCache revival: re-read storage immediately.
    const handleResurface = () => checkAndTick();
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) checkAndTick();
    };

    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleResurface);
    window.addEventListener('focus', handleResurface);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleResurface);
      window.removeEventListener('focus', handleResurface);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [enabled, readStoredExpiry, writeStoredExpiry]);

  return {
    secondsRemaining,
    isWarning,
    extendSession,
  };
}
