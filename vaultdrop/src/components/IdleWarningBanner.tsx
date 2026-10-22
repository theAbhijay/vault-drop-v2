'use client';

import { Clock, ShieldAlert } from 'lucide-react';

interface IdleWarningBannerProps {
  secondsRemaining: number;
  onExtend: () => void;
  onLogout: () => void;
}

export function IdleWarningBanner({ secondsRemaining, onExtend, onLogout }: IdleWarningBannerProps) {
  const min = Math.floor(secondsRemaining / 60);
  const sec = secondsRemaining % 60;
  const timeFormatted = `${min}:${sec.toString().padStart(2, '0')}`;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 transition-transform duration-300 ease-out">
      <div className="bg-[#1A1A1A] text-white p-4 sm:p-5 rounded-2xl shadow-2xl border border-white/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#C8102E]/20 text-[#C8102E] rounded-xl flex-shrink-0">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-[15px] font-semibold tracking-tight text-white flex items-center gap-2">
              Session Expiring Soon
              <span className="text-[13px] bg-[#C8102E] text-white px-2 py-0.5 rounded-lg font-mono">
                {timeFormatted}
              </span>
            </h4>
            <p className="text-[13px] text-[#9B9B9B] mt-0.5">
              Vault will automatically lock to protect your files on this shared PC.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onExtend}
            className="px-4 py-2.5 text-[13px] font-semibold bg-[#014BAA] hover:bg-[#013A85] text-white rounded-xl transition-all tap-spring cursor-pointer shadow-apple"
          >
            Extend (+30m)
          </button>
          <button
            onClick={onLogout}
            className="p-2.5 text-[13px] text-[#9B9B9B] hover:text-white transition-colors tap-spring cursor-pointer"
            title="Lock Now"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
