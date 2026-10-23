'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Smartphone, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '@/lib/types';

interface MobileHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
}

export function MobileHandoffModal({ isOpen, onClose, user }: MobileHandoffModalProps) {
  const [qrSvg, setQrSvg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !user) return;

    const generateCode = async () => {
      setLoading(true);
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        // Create direct handoff authorization URL for mobile browser
        const handoffUrl = `${origin}/pair?handoff=${encodeURIComponent(user.username)}&uid=${encodeURIComponent(user.id)}`;

        const rawSvg = await QRCode.toString(handoffUrl, {
          type: 'svg',
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });

        const gradientDef = `
          <defs>
            <linearGradient id="appleHandoffGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0071E3" />
              <stop offset="25%" stop-color="#5856D6" />
              <stop offset="50%" stop-color="#AF52DE" />
              <stop offset="75%" stop-color="#FF2D55" />
              <stop offset="100%" stop-color="#FF9500" />
            </linearGradient>
          </defs>
        `;

        const styledSvg = rawSvg
          .replace('<svg ', '<svg class="w-full h-full" ')
          .replace(/(stroke|fill)="#000000"/g, '$1="url(#appleHandoffGrad)"')
          .replace('>', `>${gradientDef}`);

        setQrSvg(styledSvg);
      } catch (err) {
        console.error('Failed to generate mobile handoff QR:', err);
      } finally {
        setLoading(false);
      }
    };

    generateCode();
  }, [isOpen, user]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm bg-white rounded-3xl border border-[#E5DCD4] shadow-apple-lg p-6 sm:p-7 text-center animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-[#6B6B6B] hover:text-[#1A1A1A] hover:bg-[#F8F3F0] rounded-full transition-colors tap-spring cursor-pointer"
          title="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0071E3] to-[#AF52DE] text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <Smartphone className="w-6 h-6 text-white" />
        </div>

        <h3 className="text-[19px] font-bold text-[#1A1A1A] tracking-tight">
          Open on Smartphone
        </h3>
        <p className="text-[13px] text-[#6B6B6B] mt-1 mb-5">
          Scan this QR code with your phone camera to instantly access your vault on mobile without entering credentials!
        </p>

        {/* Apple Gradient QR Container */}
        <div className="relative p-[2.5px] rounded-3xl bg-gradient-to-tr from-[#0071E3] via-[#AF52DE] via-[#FF2D55] to-[#FF9500] shadow-lg shadow-purple-500/10 mb-5 mx-auto w-[240px] h-[240px]">
          <div className="w-full h-full bg-white rounded-[21px] p-3 flex items-center justify-center overflow-hidden">
            {loading ? (
              <div className="animate-pulse text-[13px] text-[#6B6B6B]">Generating QR code...</div>
            ) : (
              <div
                className="w-full h-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[12px] text-[#1B8738] font-medium font-mono">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          <span>Encrypted Handoff • Zero Keystrokes</span>
        </div>
      </div>
    </div>
  );
}
