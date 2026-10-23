'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Smartphone, ShieldCheck, TriangleAlert, RefreshCw } from 'lucide-react';
import { createHandoffSession, buildHandoffUrl } from '@/lib/pair-helpers';
import { renderChromaticQR } from '@/lib/qr';

interface MobileHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Open on Smartphone" modal (v3 secure handoff).
 *
 * The QR encodes ONLY a server-generated one-time token (2-minute TTL) —
 * never the username or user id. Resolving the token on the phone reveals
 * which account to open; the phone still authenticates with the password on
 * the trusted personal device. A photographed code is worthless after use.
 */
export function MobileHandoffModal({ isOpen, onClose }: MobileHandoffModalProps) {
  const [qrSvg, setQrSvg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(120);

  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Ref indirection for the self-rotating countdown (avoids capturing a
  // not-yet-declared binding inside generateCode).
  const rotateRef = useRef<() => void>(() => {});
  // onClose in a ref: the dashboard re-renders every second (session TTL
  // ticker), and an unstable inline onClose would re-run the modal's
  // lifecycle effect — regenerating the QR every second. Refs break that.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const clearTimer = useCallback(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
  }, []);

  const generateCode = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(false);

    try {
      const session = await createHandoffSession();
      if (!isMountedRef.current) return;

      if (!session) {
        throw new Error('Failed to create handoff session');
      }

      const styledSvg = await renderChromaticQR(buildHandoffUrl(session.token), 'appleHandoffGrad');
      if (!isMountedRef.current) return;

      setQrSvg(styledSvg);
      setLoading(false);

      clearTimer();
      const expiresAt = new Date(session.expiresAt).getTime();
      countdownTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining <= 0) {
          clearTimer();
          rotateRef.current(); // rotate to a fresh one-time code
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to generate mobile handoff QR:', err);
      if (!isMountedRef.current) return;
      setError(true);
      setLoading(false);
    }
  }, [clearTimer]);

  // Keep the rotate ref pointing at the latest generateCode identity.
  useEffect(() => {
    rotateRef.current = () => {
      void generateCode();
    };
  }, [generateCode]);

  // Modal lifecycle: focus management, Escape key, body scroll lock.
  // Runs ONLY when isOpen flips (all deps are stable identities).
  useEffect(() => {
    if (!isOpen) return;

    isMountedRef.current = true;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    // Deferred start so no setState fires synchronously inside the effect body.
    const startTimer = setTimeout(() => {
      void generateCode();
    }, 0);
    document.body.dataset.vaultdropModalOpen = String(
      (Number(document.body.dataset.vaultdropModalOpen) || 0) + 1
    );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      isMountedRef.current = false;
      clearTimer();
      clearTimeout(startTimer);
      window.removeEventListener('keydown', handleKeyDown, true);
      const openCount = Number(document.body.dataset.vaultdropModalOpen || 1) - 1;
      if (openCount <= 0) delete document.body.dataset.vaultdropModalOpen;
      else document.body.dataset.vaultdropModalOpen = String(openCount);
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, generateCode, clearTimer]);

  if (!isOpen) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Open vault on smartphone"
        className="relative w-full max-w-sm bg-white rounded-3xl border border-[#E5DCD4] shadow-apple-lg p-6 sm:p-7 text-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F8F3F0] rounded-full transition-colors tap-spring cursor-pointer"
          title="Close modal"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0071E3] to-[#AF52DE] text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <Smartphone className="w-6 h-6 text-white" />
        </div>

        <h3 className="text-[19px] font-bold text-[#1A1A1A] tracking-tight">Open on Smartphone</h3>
        <p className="text-[13px] text-[#6B6B6B] mt-1 mb-5">
          Scan this one-time code with your phone camera. Already signed in as the same account? Your
          vault opens instantly — otherwise your username is pre-filled and you just confirm your
          password on your phone.
        </p>

        {/* Apple Gradient QR Container */}
        <div className="relative p-[2.5px] rounded-3xl bg-gradient-to-tr from-[#0071E3] via-[#AF52DE] via-[#FF2D55] to-[#FF9500] shadow-lg shadow-purple-500/10 mb-4 mx-auto w-[240px] h-[240px]">
          <div className="w-full h-full bg-white rounded-[21px] p-3 flex items-center justify-center overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-[13px] text-[#6B6B6B]">
                <RefreshCw className="w-6 h-6 animate-spin text-[#014BAA]" />
                <span>Generating one-time code...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 text-[13px] text-[#6B6B6B] px-4">
                <TriangleAlert className="w-8 h-8 text-[#B25000]" />
                <span>Could not create a handoff code.</span>
                <button
                  onClick={() => void generateCode()}
                  className="mt-1 px-4 py-1.5 bg-[#0071E3] hover:bg-[#014BAA] text-white text-[12px] font-semibold rounded-full transition-colors cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            )}
          </div>
        </div>

        {!loading && !error && (
          <div className="mb-3 text-[12px] font-mono text-[#6B6B6B]">
            Code refreshes in {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[12px] text-[#1B8738] font-medium font-mono">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          <span>One-Time Code • Single Use • 2-Minute Expiry</span>
        </div>
      </div>
    </div>
  );
}
