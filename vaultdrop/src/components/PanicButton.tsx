'use client';

import { useEffect, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';

interface PanicButtonProps {
  onPanic: () => void;
}

export function PanicButton({ onPanic }: PanicButtonProps) {
  const escCountRef = useRef<number>(0);
  const escTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcut: Press Escape 3 times rapidly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escCountRef.current += 1;
        if (escTimerRef.current) clearTimeout(escTimerRef.current);

        if (escCountRef.current >= 3) {
          onPanic();
        } else {
          escTimerRef.current = setTimeout(() => {
            escCountRef.current = 0;
          }, 800);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (escTimerRef.current) clearTimeout(escTimerRef.current);
    };
  }, [onPanic]);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={onPanic}
        title="Panic Button: Instant 0ms Screen Wipe (Shortcut: Esc 3x)"
        className="group flex items-center gap-2 bg-[#C8102E] hover:bg-[#A00C24] text-white px-4 py-3 rounded-full shadow-lg shadow-[#C8102E]/25 transition-all duration-100 tap-spring cursor-pointer focus:outline-none"
      >
        <ShieldAlert className="w-4 h-4 text-white" />
        <span className="text-[13px] font-semibold tracking-wide uppercase pr-1">Panic Wipe</span>
        <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded font-mono hidden group-hover:inline-block">
          Esc 3x
        </span>
      </button>
    </div>
  );
}
