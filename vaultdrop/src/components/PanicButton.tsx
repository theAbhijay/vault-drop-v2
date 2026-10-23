'use client';

import { useEffect, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';

interface PanicButtonProps {
  onPanic: () => void;
}

export function PanicButton({ onPanic }: PanicButtonProps) {
  const escCountRef = useRef<number>(0);
  const escTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // onPanic in a ref — identity changes never re-bind the listener.
  const onPanicRef = useRef(onPanic);
  useEffect(() => {
    onPanicRef.current = onPanic;
  }, [onPanic]);

  // Keyboard shortcut: press Escape 3 times rapidly. Escapes consumed by an
  // open modal (scanner, preview, handoff) are ignored so closing dialogs can
  // never trigger a destructive wipe by accident.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.body.dataset.vaultdropModalOpen) return;

      escCountRef.current += 1;
      if (escTimerRef.current) clearTimeout(escTimerRef.current);

      if (escCountRef.current >= 3) {
        escCountRef.current = 0;
        onPanicRef.current();
      } else {
        escTimerRef.current = setTimeout(() => {
          escCountRef.current = 0;
        }, 800);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (escTimerRef.current) clearTimeout(escTimerRef.current);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={onPanic}
        title="Panic Button: Instant 0ms Screen Wipe (Shortcut: Esc 3x)"
        aria-label="Panic wipe: immediately sign out and clear this screen"
        className="group flex items-center gap-2 bg-[#C8102E] hover:bg-[#A00C24] text-white px-4 py-3 rounded-full shadow-lg shadow-[#C8102E]/25 transition-all duration-100 tap-spring cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C8102E]"
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
