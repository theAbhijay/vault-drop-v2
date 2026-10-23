'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ShieldCheck, Smartphone, CheckCircle2, TriangleAlert } from 'lucide-react';
import {
  createLoginSession,
  getLoginSessionStatus,
  buildPairUrl,
  completeWorkstationLogin,
} from '@/lib/pair-helpers';
import { renderChromaticQR } from '@/lib/qr';
import { UserProfile } from '@/lib/types';

interface QRLoginCardProps {
  onSuccess: (user: UserProfile) => void;
}

const POLL_INTERVAL_MS = 1500;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Workstation-side QR login card (v3 zero-trust flow):
 *  1. create_login_session() → server-generated 256-bit token
 *  2. QR encodes ONLY the opaque token
 *  3. 1.5s status polling (status only — no identity leaks)
 *  4. On approval: consume_login_session() hands back a ONE-TIME refresh token
 *     which is exchanged for a REAL Supabase session (RLS fully effective).
 *     The phone approves with a single tap — no password entry anywhere.
 */
export function QRLoginCard({ onSuccess }: QRLoginCardProps) {
  const [qrSvg, setQrSvg] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(120);
  const [status, setStatus] = useState<'loading' | 'waiting' | 'refreshing' | 'approved' | 'error'>('loading');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const activeTokenRef = useRef<string | null>(null);
  const expiryTimestampRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransitioningRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const generationRef = useRef<number>(0);
  const generationFailuresRef = useRef<number>(0);
  // Ref indirection so the self-rotating timers always invoke the LATEST
  // generateNewQR identity instead of capturing a not-yet-declared binding.
  const rotateRef = useRef<() => void>(() => {});

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (tickerTimerRef.current) clearInterval(tickerTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // onSuccess in a ref — identity changes must never restart the QR cycle.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (tickerTimerRef.current) clearInterval(tickerTimerRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    pollTimerRef.current = null;
    tickerTimerRef.current = null;
    retryTimerRef.current = null;
  }, []);

  const completeLogin = useCallback(async () => {
    if (isTransitioningRef.current || !activeTokenRef.current) return;
    isTransitioningRef.current = true;
    clearTimers();
    setStatus('approved');

    const token = activeTokenRef.current;
    activeTokenRef.current = null;

    const result = await completeWorkstationLogin(token);
    if (!isMountedRef.current) return;

    if (result.success && result.user) {
      setTimeout(() => {
        if (isMountedRef.current) onSuccessRef.current(result.user!);
      }, 600);
    } else {
      // Consume failed (expired/replayed) — fall back to a fresh QR.
      isTransitioningRef.current = false;
      setStatus('error');
    }
  }, [clearTimers]);

  // Generate a new login session + chromatic QR. Guards against races with a
  // generation id, backs off on failure, and shows a real error state after
  // repeated failures instead of looping forever.
  const generateNewQR = useCallback(
    async (isInitial = false) => {
      if (isTransitioningRef.current || !isMountedRef.current) return;

      const generation = ++generationRef.current;
      clearTimers();

      if (isInitial) {
        setStatus('loading');
      } else {
        setIsRefreshing(true);
        setStatus('refreshing');
      }

      try {
        const session = await createLoginSession();
        if (!isMountedRef.current || generation !== generationRef.current) return;

        if (!session) {
          throw new Error('Failed to create pairing session');
        }

        activeTokenRef.current = session.token;
        generationFailuresRef.current = 0;

        const styledSvg = await renderChromaticQR(buildPairUrl(session.token));
        if (!isMountedRef.current || generation !== generationRef.current) return;

        setQrSvg(styledSvg);
        expiryTimestampRef.current = new Date(session.expiresAt).getTime();
        setCountdown(Math.max(0, Math.ceil((expiryTimestampRef.current - Date.now()) / 1000)));
        setStatus('waiting');
        setIsRefreshing(false);

        // Countdown ticker — auto-refresh the code when the 2-minute window ends
        tickerTimerRef.current = setInterval(() => {
          const remaining = Math.max(0, Math.ceil((expiryTimestampRef.current - Date.now()) / 1000));
          setCountdown(remaining);
          if (remaining <= 0) {
            if (tickerTimerRef.current) clearInterval(tickerTimerRef.current);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            rotateRef.current();
          }
        }, 1000);

        // Approval polling — captures the token before the await and ignores
        // stale responses after a rotation.
        let consecutiveFailures = 0;
        pollTimerRef.current = setInterval(async () => {
          const tokenAtTick = activeTokenRef.current;
          if (!tokenAtTick) return;

          let current;
          try {
            current = await getLoginSessionStatus(tokenAtTick);
            consecutiveFailures = 0;
          } catch {
            current = null;
          }

          if (
            !isMountedRef.current ||
            isTransitioningRef.current ||
            activeTokenRef.current !== tokenAtTick
          ) {
            return;
          }

          if (!current) {
            consecutiveFailures += 1;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              // Network troubles: keep showing the code, but stop hammering.
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            return;
          }

          if (current.status === 'approved') {
            void completeLogin();
          } else if (current.status === 'unknown' || current.status === 'expired') {
            // Session vanished server-side (purge or consumed elsewhere): rotate.
            rotateRef.current();
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        console.error('Failed to generate QR session:', err);
        if (!isMountedRef.current || generation !== generationRef.current) return;

        // Bounded retry with backoff — after repeated failures show a real
        // error state instead of spinning forever. The most common cause is
        // the v3 database schema not being deployed to Supabase yet.
        generationFailuresRef.current += 1;
        if (generationFailuresRef.current >= 2) {
          setStatus('error');
          setIsRefreshing(false);
          return;
        }

        retryTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && !isTransitioningRef.current) rotateRef.current();
        }, 2500);
      }
    },
    [clearTimers, completeLogin]
  );

  // Keep the rotate ref pointing at the latest generateNewQR identity.
  useEffect(() => {
    rotateRef.current = () => {
      void generateNewQR(false);
    };
  }, [generateNewQR]);

  useEffect(() => {
    // Deferred start so no setState fires synchronously inside the effect body.
    const startTimer = setTimeout(() => {
      void generateNewQR(true);
    }, 0);
    return () => {
      clearTimeout(startTimer);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="flex flex-col items-center text-center">
      {/* QR Canvas Box with Apple Chromatic Glow & Frame */}
      <div className="relative p-[2.5px] rounded-3xl bg-gradient-to-tr from-[#0071E3] via-[#AF52DE] via-[#FF2D55] to-[#FF9500] shadow-xl shadow-purple-500/10 mb-5">
        <div className="relative p-3.5 bg-white rounded-[21px] overflow-hidden">
          {status === 'loading' ? (
            <div className="w-[260px] h-[260px] flex flex-col items-center justify-center gap-3 bg-[#F8F3F0]/60 rounded-xl">
              <RefreshCw className="w-8 h-8 text-[#014BAA] animate-spin" />
              <p className="text-[13px] text-[#6B6B6B] font-medium">Generating secure QR code...</p>
            </div>
          ) : status === 'approved' ? (
            <div className="w-[260px] h-[260px] flex flex-col items-center justify-center gap-3 bg-emerald-50 rounded-xl animate-in fade-in duration-300">
              <CheckCircle2 className="w-16 h-16 text-[#1B8738] animate-bounce" />
              <p className="text-[16px] font-semibold text-[#1B8738]">Pairing Approved!</p>
              <p className="text-[13px] text-[#6B6B6B]">Unlocking vault terminal...</p>
            </div>
          ) : status === 'error' ? (
            <div className="w-[260px] h-[260px] flex flex-col items-center justify-center gap-3 bg-amber-50 rounded-xl px-5">
              <TriangleAlert className="w-10 h-10 text-[#B25000]" />
              <p className="text-[14px] font-semibold text-[#1A1A1A]">Could not reach VaultDrop</p>
              <p className="text-[11px] text-[#6B6B6B] text-center leading-relaxed">
                Check your connection, and make sure the latest <span className="font-mono">supabase_schema.sql</span> has
                been run in your Supabase SQL Editor (see the browser console for the exact reason).
              </p>
              <button
                onClick={() => {
                  generationFailuresRef.current = 0;
                  void generateNewQR(false);
                }}
                className="mt-1 px-4 py-2 bg-[#0071E3] hover:bg-[#014BAA] text-white text-[13px] font-semibold rounded-full transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="relative w-[260px] h-[260px] flex items-center justify-center">
              {qrSvg && (
                <div
                  className={`w-full h-full rounded-lg transition-opacity duration-300 ${
                    isRefreshing ? 'opacity-40 filter blur-[1px]' : 'opacity-100'
                  }`}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              )}

              {/* Center Logo Badge */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 rounded-xl bg-white/95 backdrop-blur-xs shadow-md border border-[#E5DCD4] flex items-center justify-center p-1">
                  <div className="w-full h-full rounded-lg bg-gradient-to-tr from-[#0071E3] to-[#AF52DE] flex items-center justify-center text-white">
                    <ShieldCheck className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>

              {isRefreshing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs rounded-lg animate-in fade-in">
                  <RefreshCw className="w-7 h-7 text-[#014BAA] animate-spin mb-1.5" />
                  <span className="text-[12px] font-semibold text-[#014BAA]">Refreshing Code...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Auto-Refresh Ticker & Manual Refresh */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="flex items-center gap-2 text-[12px] font-mono text-[#6B6B6B] bg-[#F8F3F0] px-3.5 py-1.5 rounded-full border border-[#E5DCD4]">
          <span className="w-2 h-2 rounded-full bg-[#014BAA] animate-ping" />
          <span>Auto-refreshes in {timeString}</span>
        </div>

        <button
          onClick={() => void generateNewQR(false)}
          disabled={isRefreshing || status === 'loading' || status === 'approved'}
          className="p-1.5 bg-[#F8F3F0] hover:bg-[#E6EEF7] text-[#014BAA] rounded-full border border-[#E5DCD4] transition-all tap-spring cursor-pointer"
          title="Refresh QR Code Now"
          aria-label="Refresh QR code now"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Instructions */}
      <div className="space-y-2 max-w-sm">
        <div className="flex items-center justify-center gap-2 text-[15px] font-semibold text-[#1A1A1A]">
          <Smartphone className="w-4.5 h-4.5 text-[#014BAA]" />
          <span>Instant Phone Unlock</span>
        </div>
        <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
          Open VaultDrop on your smartphone and scan this code — tap Approve and this terminal unlocks
          instantly. Zero keystrokes on this keyboard.
        </p>
      </div>

      {/* Zero Keystroke Security Footer */}
      <div className="mt-5 pt-4 border-t border-[#E5DCD4]/70 w-full flex items-center justify-center gap-2 text-[12px] text-[#1B8738] font-medium">
        <ShieldCheck className="w-4.5 h-4.5 flex-shrink-0" />
        <span>Zero keys typed on this keyboard • 100% Keylogger Proof</span>
      </div>
    </div>
  );
}
