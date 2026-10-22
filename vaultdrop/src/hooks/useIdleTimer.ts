'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const TIMEOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_THRESHOLD_SECONDS = 60; // 60 seconds warning before auto-logout

interface UseIdleTimerOptions {
  onTimeout: () => void;
  enabled?: boolean;
}

export function useIdleTimer({ onTimeout, enabled = true }: UseIdleTimerOptions) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15 * 60);
  const [isWarning, setIsWarning] = useState<boolean>(false);
  const lastActivityRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSecondsRemaining(15 * 60);
    setIsWarning(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    lastActivityRef.current = Date.now();

    const handleUserActivity = () => {
      // If we are already in the final 60-second warning state, require explicit extend
      if (Date.now() - lastActivityRef.current < TIMEOUT_DURATION_MS - WARNING_THRESHOLD_SECONDS * 1000) {
        lastActivityRef.current = Date.now();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && lastActivityRef.current > 0) {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= TIMEOUT_DURATION_MS) {
          onTimeout();
        } else {
          const remaining = Math.max(0, Math.floor((TIMEOUT_DURATION_MS - elapsed) / 1000));
          setSecondsRemaining(remaining);
          setIsWarning(remaining <= WARNING_THRESHOLD_SECONDS);
        }
      }
    };

    // User activity listeners
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, handleUserActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Heartbeat ticker every second
    timerRef.current = setInterval(() => {
      if (lastActivityRef.current === 0) return;
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, Math.floor((TIMEOUT_DURATION_MS - elapsed) / 1000));

      setSecondsRemaining(remaining);

      if (remaining <= WARNING_THRESHOLD_SECONDS && remaining > 0) {
        setIsWarning(true);
      }

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        onTimeout();
      }
    }, 1000);

    return () => {
      events.forEach(e => window.removeEventListener(e, handleUserActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, onTimeout]);

  return {
    secondsRemaining,
    isWarning,
    extendSession: resetTimer,
  };
}
