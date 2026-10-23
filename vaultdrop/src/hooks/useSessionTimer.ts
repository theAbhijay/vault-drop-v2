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

export function useSessionTimer({ onTimeout, enabled = true }: UseSessionTimerOptions) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(SESSION_DURATION_SECONDS);
  const [isWarning, setIsWarning] = useState<boolean>(false);
  const timeoutFiredRef = useRef<boolean>(false);
  const lastHeartbeatRef = useRef<number>(0);

  // Extend or initialize the session
  const extendSession = useCallback(() => {
    const newExpiry = Date.now() + SESSION_DURATION_SECONDS * 1000;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_STORAGE_KEY, newExpiry.toString());
      sessionStorage.setItem(SESSION_STORAGE_KEY, newExpiry.toString());
    }
    setSecondsRemaining(SESSION_DURATION_SECONDS);
    setIsWarning(false);
    timeoutFiredRef.current = false;
    lastHeartbeatRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    timeoutFiredRef.current = false;

    // Check existing expiry or initialize once
    let stored = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
    let targetExpiry: number;

    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) {
        if (parsed <= Date.now()) {
          // ALREADY EXPIRED! Terminate session immediately
          localStorage.removeItem(SESSION_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          timeoutFiredRef.current = true;
          onTimeout();
          return;
        }
        targetExpiry = parsed;
      } else {
        targetExpiry = Date.now() + SESSION_DURATION_SECONDS * 1000;
        localStorage.setItem(SESSION_STORAGE_KEY, targetExpiry.toString());
        sessionStorage.setItem(SESSION_STORAGE_KEY, targetExpiry.toString());
      }
    } else {
      targetExpiry = Date.now() + SESSION_DURATION_SECONDS * 1000;
      localStorage.setItem(SESSION_STORAGE_KEY, targetExpiry.toString());
      sessionStorage.setItem(SESSION_STORAGE_KEY, targetExpiry.toString());
    }

    const checkAndTick = () => {
      const now = Date.now();
      lastHeartbeatRef.current = now;

      const diffSeconds = Math.floor((targetExpiry - now) / 1000);

      if (diffSeconds <= 0) {
        setSecondsRemaining(0);
        setIsWarning(false);
        if (!timeoutFiredRef.current) {
          timeoutFiredRef.current = true;
          localStorage.removeItem(SESSION_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          onTimeout();
        }
        return;
      }

      setSecondsRemaining(diffSeconds);
      setIsWarning(diffSeconds <= WARNING_THRESHOLD_SECONDS);
    };

    // Immediate initial check
    checkAndTick();

    // High-frequency tick interval
    const interval = setInterval(checkAndTick, 1000);

    // Sleep / Tab Switch Handler: detects if laptop slept or tab was backgrounded for > 5s
    const handleVisibilityOrFocus = () => {
      const now = Date.now();
      const currentStored = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (currentStored) {
        const parsed = parseInt(currentStored, 10);
        if (parsed <= now) {
          // User was away / laptop was in sleep mode!
          localStorage.removeItem(SESSION_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          if (!timeoutFiredRef.current) {
            timeoutFiredRef.current = true;
            onTimeout();
          }
          return;
        }
        targetExpiry = parsed;
      }
      checkAndTick();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // BFCache / History Navigation listener: prevents back button from reviving old session
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        handleVisibilityOrFocus();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [enabled, onTimeout]);

  return {
    secondsRemaining,
    isWarning,
    extendSession,
  };
}
