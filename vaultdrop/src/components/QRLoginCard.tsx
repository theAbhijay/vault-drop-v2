'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, ShieldCheck, Smartphone, CheckCircle2 } from 'lucide-react';
import { createPairingSession, checkPairingStatus, consumePairingSession } from '@/lib/pair-helpers';

interface QRLoginCardProps {
  onSuccess: (username: string) => void;
}

export function QRLoginCard({ onSuccess }: QRLoginCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(120);
  const [status, setStatus] = useState<'loading' | 'waiting' | 'refreshing' | 'approved'>('loading');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const activeTokenRef = useRef<string | null>(null);
  const expiryTimestampRef = useRef<number>(Date.now() + 120 * 1000);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tickerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTransitioningRef = useRef<boolean>(false);

  // Complete login on approval
  const completeLogin = useCallback(async (username: string, userId?: string) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (tickerTimerRef.current) clearInterval(tickerTimerRef.current);

    setStatus('approved');

    // Invalidate/consume token on server
    if (activeTokenRef.current) {
      await consumePairingSession(activeTokenRef.current).catch(() => {});
    }

    // Save approved session for lab PC
    const approvedUser = {
      id: userId || `user_${username}`,
      username: username,
      storageCapMb: 50,
      usedBytes: 0,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      accountExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    localStorage.setItem('vaultdrop_session_user', JSON.stringify(approvedUser));

    setTimeout(() => {
      onSuccess(username);
    }, 600);
  }, [onSuccess]);

  // Generates a new session and QR code
  const generateNewQR = useCallback(async (isInitial = false) => {
    if (isTransitioningRef.current) return;

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (tickerTimerRef.current) clearInterval(tickerTimerRef.current);

    if (isInitial) {
      setStatus('loading');
    } else {
      setIsRefreshing(true);
      setStatus('refreshing');
    }

    try {
      const newSession = await createPairingSession();
      activeTokenRef.current = newSession.qrToken;

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const pairUrl = `${origin}/pair?token=${newSession.qrToken}`;

      const dataUrl = await QRCode.toDataURL(pairUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#014BAA',
          light: '#FFFFFF',
        },
      });

      setQrDataUrl(dataUrl);
      expiryTimestampRef.current = Date.now() + 120 * 1000; // Reset to 2 minutes
      setCountdown(120);
      setStatus('waiting');
      setIsRefreshing(false);

      // Start Countdown Ticker
      tickerTimerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((expiryTimestampRef.current - Date.now()) / 1000));
        setCountdown(remaining);

        // When 2 minutes expire: automatically refresh a new code!
        if (remaining <= 0) {
          if (tickerTimerRef.current) clearInterval(tickerTimerRef.current);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          generateNewQR(false);
        }
      }, 1000);

      // Start Polling Loop (checks approval every 1.5s)
      pollTimerRef.current = setInterval(async () => {
        if (!activeTokenRef.current) return;
        const current = await checkPairingStatus(activeTokenRef.current);
        if (current?.status === 'approved') {
          await completeLogin(current.username || 'Student', current.userId);
        }
      }, 1500);

    } catch (err) {
      console.error('Failed to generate QR session:', err);
      // If error occurs, retry after 2 seconds
      setTimeout(() => {
        generateNewQR(false);
      }, 2000);
    }
  }, [completeLogin]);

  useEffect(() => {
    generateNewQR(true);

    // Cross-tab local storage approval listener (for instant local pairing)
    const handleStorageChange = async (e: StorageEvent) => {
      if (activeTokenRef.current && e.key === `vaultdrop_pair_${activeTokenRef.current}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.status === 'approved') {
            await completeLogin(parsed.username || 'Student', parsed.userId);
          }
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (tickerTimerRef.current) clearInterval(tickerTimerRef.current);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [generateNewQR, completeLogin]);

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="flex flex-col items-center text-center">
      {/* QR Canvas Box */}
      <div className="relative p-4 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple mb-5 overflow-hidden">
        {status === 'loading' ? (
          <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-3 bg-[#F8F3F0]/60 rounded-xl">
            <RefreshCw className="w-8 h-8 text-[#014BAA] animate-spin" />
            <p className="text-[13px] text-[#6B6B6B] font-medium">Generating secure QR code...</p>
          </div>
        ) : status === 'approved' ? (
          <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-3 bg-emerald-50 rounded-xl animate-in fade-in duration-300">
            <CheckCircle2 className="w-16 h-16 text-[#1B8738] animate-bounce" />
            <p className="text-[16px] font-semibold text-[#1B8738]">Pairing Approved!</p>
            <p className="text-[13px] text-[#6B6B6B]">Unlocking vault terminal...</p>
          </div>
        ) : (
          <div className="relative">
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="Vaultdrop QR Login"
                className={`w-[280px] h-[280px] rounded-lg transition-opacity duration-300 ${
                  isRefreshing ? 'opacity-40 filter blur-[1px]' : 'opacity-100'
                }`}
              />
            )}

            {isRefreshing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-xs rounded-lg animate-in fade-in">
                <RefreshCw className="w-7 h-7 text-[#014BAA] animate-spin mb-1.5" />
                <span className="text-[12px] font-semibold text-[#014BAA]">Refreshing Code...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auto-Refresh Ticker & Manual Refresh Button */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2 text-[12px] font-mono text-[#6B6B6B] bg-[#F8F3F0] px-3.5 py-1.5 rounded-full border border-[#E5DCD4]">
          <span className="w-2 h-2 rounded-full bg-[#014BAA] animate-ping" />
          <span>Auto-refreshes in {timeString}</span>
        </div>

        <button
          onClick={() => generateNewQR(false)}
          disabled={isRefreshing || status === 'loading'}
          className="p-1.5 bg-[#F8F3F0] hover:bg-[#E6EEF7] text-[#014BAA] rounded-full border border-[#E5DCD4] transition-all tap-spring cursor-pointer"
          title="Refresh QR Code Now"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Instructions */}
      <div className="space-y-2 max-w-sm">
        <div className="flex items-center justify-center gap-2 text-[15px] font-semibold text-[#1A1A1A]">
          <Smartphone className="w-4.5 h-4.5 text-[#014BAA]" />
          <span>Scan with any camera or scanner</span>
        </div>
        <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
          Open your iPhone Camera, Android Camera, or Google Lens. Point it at this screen and tap the link to approve.
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
