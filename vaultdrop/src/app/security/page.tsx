'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Shield, 
  ShieldCheck, 
  Lock, 
  Flame, 
  Clock, 
  QrCode, 
  HardDrive, 
  AlertTriangle, 
  ArrowLeft, 
  CheckCircle2, 
  EyeOff, 
  KeyRound,
  FileText
} from 'lucide-react';
import { AppleColorText } from '@/components/AppleColorText';
import { OpenSourceLink } from '@/components/OpenSourceLink';
import { Footer } from '@/components/Footer';

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#F8F3F0] flex flex-col justify-between selection:bg-[#014BAA] selection:text-white">
      {/* 1. Header Navigation */}
      <header className="sticky top-0 z-40 glass-surface border-b border-[#E5DCD4]/80 px-4 md:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-xl bg-[#014BAA] flex items-center justify-center text-white shadow-apple">
              <Shield className="w-4.5 h-4.5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-0.5">
                <span className="text-[16px] font-bold tracking-tight text-[#014BAA]">Vault</span>
                <AppleColorText text="Drop" className="text-[16px] font-bold tracking-tight" mode="chars" />
              </div>
              <span className="text-[11px] text-[#6B6B6B] block -mt-0.5 font-mono">Security Whitepaper</span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <OpenSourceLink />
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#014BAA] hover:bg-[#013A85] text-white text-[12px] font-semibold shadow-sm transition-all tap-spring"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back to</span>
              <span>Vault</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Main Content */}
      <main className="max-w-4xl w-full mx-auto px-4 md:px-8 py-8 md:py-12 space-y-10 flex-1">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#1B8738] text-[12px] font-semibold tracking-wide uppercase font-mono border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero-Trust Architectural Model
          </div>
          <h1 className="text-[28px] sm:text-[34px] font-bold text-[#1A1A1A] tracking-tight leading-tight">
            Security Engineered for <AppleColorText text="Shared Terminals." mode="chars" />
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[#6B6B6B] max-w-2xl mx-auto leading-relaxed">
            Public university labs and cyber terminals are inherently hostile environments. VaultDrop was engineered with mathematical guarantees to eliminate keyloggers, session persistence, and data leakage.
          </p>
        </div>

        {/* Threat Comparison Grid */}
        <div className="bg-white rounded-3xl border border-[#E5DCD4] shadow-apple overflow-hidden">
          <div className="px-6 py-4 bg-[#F8F3F0]/60 border-b border-[#E5DCD4]">
            <h3 className="text-[16px] font-bold text-[#1A1A1A]">Workstation Threat Model Breakdown</h3>
            <p className="text-[12px] text-[#6B6B6B] mt-0.5">How traditional workarounds catastrophically expose students</p>
          </div>

          <div className="divide-y divide-[#E5DCD4]/60">
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[14px] font-bold text-[#1A1A1A]">WhatsApp / Telegram Web</span>
                <p className="text-[12px] text-[#6B6B6B]">Exposes your entire personal chat history, photos, and messages to whoever sits at that computer next.</p>
              </div>
              <span className="px-3 py-1 bg-red-50 text-[#C8102E] text-[11px] font-mono font-bold rounded-full border border-red-200 self-start sm:self-auto flex-shrink-0">
                Catastrophic Privacy Leak
              </span>
            </div>

            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[14px] font-bold text-[#1A1A1A]">Google Drive / Gmail</span>
                <p className="text-[12px] text-[#6B6B6B]">Saves persistent authentication cookies, syncs passwords, and leaves your Google account active in the browser.</p>
              </div>
              <span className="px-3 py-1 bg-red-50 text-[#C8102E] text-[11px] font-mono font-bold rounded-full border border-red-200 self-start sm:self-auto flex-shrink-0">
                Persistent Account Hijacking
              </span>
            </div>

            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[14px] font-bold text-[#1A1A1A]">USB Flash Drives</span>
                <p className="text-[12px] text-[#6B6B6B]">Shared lab computers silently infect thumb drives with shortcut viruses, autorun worms, and ransomware.</p>
              </div>
              <span className="px-3 py-1 bg-red-50 text-[#C8102E] text-[11px] font-mono font-bold rounded-full border border-red-200 self-start sm:self-auto flex-shrink-0">
                Hardware Malware Infection
              </span>
            </div>

            <div className="p-5 bg-emerald-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-[#014BAA]">VaultDrop Ephemeral Vault</span>
                  <span className="px-2 py-0.5 bg-[#014BAA]/10 text-[#014BAA] text-[10px] font-bold rounded-full font-mono">RECOMMENDED</span>
                </div>
                <p className="text-[12px] text-[#1A1A1A]">Zero keystrokes on lab hardware. Files self-destruct in 24 hours. Instant Panic Wipe with 0ms memory erasure.</p>
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-[#1B8738] text-[11px] font-mono font-bold rounded-full border border-emerald-300 self-start sm:self-auto flex-shrink-0">
                Zero Attack Surface
              </span>
            </div>
          </div>
        </div>

        {/* The 4 Architectural Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-2">
            <div className="w-9 h-9 rounded-xl bg-[#014BAA]/10 text-[#014BAA] flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <h4 className="text-[15px] font-bold text-[#1A1A1A]">Option 2 QR Handshake</h4>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              Lab monitors display a 120-second dynamic QR code. Your personal phone camera scans and authorizes the workstation via atomic PostgreSQL row locking. You never type a character on the lab keyboard.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-2">
            <div className="w-9 h-9 rounded-xl bg-[#014BAA]/10 text-[#014BAA] flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <h4 className="text-[15px] font-bold text-[#1A1A1A]">30-Minute Auto-Seal</h4>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              If you walk away and forget to close the browser, an inactivity timer automatically shreds active tokens and locks the vault after 30 minutes, preventing anyone from stealing your files.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-2">
            <div className="w-9 h-9 rounded-xl bg-red-50 text-[#C8102E] flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <h4 className="text-[15px] font-bold text-[#1A1A1A]">Esc 3x Panic Incinerator</h4>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              Pressing <kbd className="px-1.5 py-0.5 bg-black/5 rounded text-[11px] font-mono font-bold">Escape</kbd> three times in rapid succession instantly purges memory, invalidates JWT tokens, and navigates away in 0ms.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-2">
            <div className="w-9 h-9 rounded-xl bg-[#014BAA]/10 text-[#014BAA] flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <h4 className="text-[15px] font-bold text-[#1A1A1A]">24-Hour File Destruction</h4>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              Every file uploaded is governed by strict database triggers. When a file expires or is deleted, its S3 storage object is wiped immediately, leaving zero orphaned data behind.
            </p>
          </div>
        </div>

        {/* Return to Action */}
        <div className="text-center pt-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#014BAA] hover:bg-[#013A85] text-white text-[14px] font-semibold rounded-2xl shadow-apple transition-all tap-spring"
          >
            <span>Open VaultDrop Gateway</span>
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </Link>
        </div>
      </main>

      {/* 3. Footer */}
      <Footer />
    </div>
  );
}
