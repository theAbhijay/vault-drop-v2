'use client';

import React from 'react';

interface PeacockLoaderProps {
  message?: string;
  submessage?: string;
}

export function PeacockLoader({
  message = 'Securing session...',
  submessage = 'Connecting to VaultDrop cryptographic engine',
}: PeacockLoaderProps) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      aria-label="Loading" 
      role="status" 
      aria-live="polite"
    >
      <div className="relative bg-[#0B0E14] text-white p-7 sm:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center justify-center max-w-xs sm:max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
        {/* Peacock Dot Wave Container */}
        <div className="relative w-[240px] sm:w-[260px] h-[64px] flex items-center justify-center my-2">
          <style jsx>{`
            .peacock-dot {
              position: absolute;
              top: 50%;
              width: 22px;
              height: 22px;
              margin-top: -11px;
              margin-left: -11px;
              border-radius: 50%;
              will-change: transform;
              animation: peacockBounce 1.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
            }

            .dot-1 { left: 9%;  background: #FFB81C; animation-delay: 0s; }
            .dot-2 { left: 25%; background: #FF6A13; animation-delay: 0.1s; }
            .dot-3 { left: 41%; background: #E2231A; animation-delay: 0.2s; }
            .dot-4 { left: 57%; background: #7B2C8E; animation-delay: 0.3s; }
            .dot-5 { left: 73%; background: #0067B1; animation-delay: 0.4s; }
            .dot-6 { left: 89%; background: #00A651; animation-delay: 0.5s; }

            @keyframes peacockBounce {
              0%, 100% {
                transform: translateY(0) scale(1);
                opacity: 0.85;
              }
              50% {
                transform: translateY(-28px) scale(1.08);
                opacity: 1;
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .peacock-dot { animation: none; }
            }
          `}</style>

          <span className="peacock-dot dot-1" />
          <span className="peacock-dot dot-2" />
          <span className="peacock-dot dot-3" />
          <span className="peacock-dot dot-4" />
          <span className="peacock-dot dot-5" />
          <span className="peacock-dot dot-6" />
        </div>

        {/* Informative Label */}
        <div className="text-center mt-2 space-y-1">
          <p className="text-[15px] font-semibold text-white tracking-tight">
            {message}
          </p>
          <p className="text-[12px] text-white/60 font-mono">
            {submessage}
          </p>
        </div>
      </div>
    </div>
  );
}
