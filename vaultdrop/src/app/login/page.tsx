'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Shield, 
  QrCode, 
  KeyRound, 
  ArrowRight, 
  User, 
  Lock, 
  AlertCircle, 
  Sparkles,
  ShieldCheck,
  Clock,
  HardDrive,
  Eye,
  FileArchive,
  Flame,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { QRLoginCard } from '@/components/QRLoginCard';
import { OpenSourceLink } from '@/components/OpenSourceLink';
import { AppleColorText } from '@/components/AppleColorText';
import { loginWithUsername, registerWithUsername, getCurrentUser } from '@/lib/auth-helpers';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');

  const [activeTab, setActiveTab] = useState<'qr' | 'password'>('qr');
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already logged in and not coming from panic/timeout, redirect to dashboard
    if (!reason && getCurrentUser()) {
      router.push('/');
    }
  }, [reason, router]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (username.trim().length <= 5) {
      setError('Username must be at least 6 characters long.');
      setLoading(false);
      return;
    }

    try {
      let res;
      if (isRegister) {
        res = await registerWithUsername(username, password);
      } else {
        res = await loginWithUsername(username, password);
      }

      if (res.success) {
        router.push('/');
      } else {
        setError(res.error || 'Authentication failed.');
      }
    } catch {
      setError('An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F3F0] flex flex-col justify-between selection:bg-[#014BAA] selection:text-white">
      {/* 1. Frosted Glass Top Bar */}
      <header className="sticky top-0 z-40 glass-surface border-b border-[#E5DCD4]/80 px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#014BAA] flex items-center justify-center text-white shadow-apple">
              <Shield className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[17px] font-bold tracking-tight text-[#014BAA]">Vaultdrop</span>
                <AppleColorText text="like Apple." className="text-[11px] font-semibold ml-1 hidden sm:inline-block" mode="chars" />
              </div>
              <span className="text-[11px] text-[#6B6B6B] block -mt-0.5 font-mono">v1.0 • Ephemeral File Vault</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <OpenSourceLink />

            <div className="hidden sm:flex items-center gap-2 text-[13px] text-[#6B6B6B] bg-white px-3.5 py-1.5 rounded-full border border-[#E5DCD4] shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-[#1A1A1A]">Shared Terminal Mode Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Content Grid (Left, Center, Right) */}
      <main className="max-w-7xl w-full mx-auto px-4 md:px-8 py-8 md:py-12 flex-1 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
          
          {/* LEFT COLUMN: What is Vaultdrop? */}
          <div className="lg:col-span-3 space-y-5 order-2 lg:order-1">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#014BAA]/10 text-[#014BAA] text-[12px] font-semibold tracking-wide uppercase font-mono">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Crafted <AppleColorText text="like Apple." className="normal-case text-[12px]" mode="chars" /></span>
              </div>
              <h2 className="text-[23px] font-bold text-[#1A1A1A] tracking-tight leading-snug">
                Private File Vault for <AppleColorText text="Public Labs." mode="chars" />
              </h2>
              <p className="text-[14px] text-[#6B6B6B] leading-relaxed">
                Shared computer labs force students to log into personal accounts just to print or grab one file — exposing credentials to keyloggers, cached sessions, and shoulder surfers.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-4 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-1.5">
                <div className="flex items-center gap-2 text-[14px] font-bold text-[#1A1A1A]">
                  <ShieldCheck className="w-4.5 h-4.5 text-[#014BAA]" />
                  <span>Zero Keystrokes on PC</span>
                </div>
                <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
                  Never type your password on a shared keyboard. Scan the screen QR with your phone camera to log in with zero trace.
                </p>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-1.5">
                <div className="flex items-center gap-2 text-[14px] font-bold text-[#1A1A1A]">
                  <Clock className="w-4.5 h-4.5 text-[#014BAA]" />
                  <span>24-Hour Auto-Delete</span>
                </div>
                <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
                  Every uploaded file self-destructs after 24 hours. Nothing is left behind on the shared computer.
                </p>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-1.5">
                <div className="flex items-center gap-2 text-[14px] font-bold text-[#1A1A1A]">
                  <Flame className="w-4.5 h-4.5 text-[#014BAA]" />
                  <span>5-Day Account Purge</span>
                </div>
                <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
                  Accounts and all file data dissolve automatically after 5 days, keeping storage free and completely clutter-free.
                </p>
              </div>
            </div>
          </div>

          {/* CENTER COLUMN: Interactive Login Card */}
          <div className="lg:col-span-6 w-full max-w-lg mx-auto order-1 lg:order-2">
            {/* Notice Banners */}
            {reason === 'timeout' && (
              <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-[13px] text-amber-800">
                <AlertCircle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0" />
                <span>Vault locked automatically after 30 minutes of inactivity for your security.</span>
              </div>
            )}
            {reason === 'panic' && (
              <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-[13px] text-red-800">
                <Shield className="w-4.5 h-4.5 text-red-600 flex-shrink-0" />
                <span>Panic Wipe triggered. All local session tokens cleared immediately.</span>
              </div>
            )}

            {/* Auth Box */}
            <div className="bg-white rounded-3xl border border-[#E5DCD4] shadow-apple-lg p-6 sm:p-8">
              {/* Method Selector Tabs */}
              <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#F8F3F0] rounded-2xl border border-[#E5DCD4] mb-6">
                <button
                  onClick={() => {
                    setActiveTab('qr');
                    setError(null);
                  }}
                  className={`py-2.5 px-3 text-[13px] font-semibold rounded-xl transition-all tap-spring flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'qr'
                      ? 'bg-white text-[#014BAA] shadow-sm'
                      : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>QR Code (Lab PC)</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('password');
                    setError(null);
                  }}
                  className={`py-2.5 px-3 text-[13px] font-semibold rounded-xl transition-all tap-spring flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'password'
                      ? 'bg-white text-[#014BAA] shadow-sm'
                      : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
                  }`}
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Username Login</span>
                </button>
              </div>

              {/* Tab 1: QR Code Flow */}
              {activeTab === 'qr' ? (
                <QRLoginCard onSuccess={() => router.push('/')} />
              ) : (
                /* Tab 2: Direct Username & Password */
                <div className="space-y-5">
                  <div className="text-center">
                    <h3 className="text-[18px] font-bold text-[#1A1A1A] tracking-tight">
                      {isRegister ? 'Create Your Vault' : 'Sign In With Username'}
                    </h3>
                    <p className="text-[13px] text-[#6B6B6B] mt-1">
                      {isRegister
                        ? 'No email required. Just choose a unique username and password.'
                        : 'Access your private ephemeral storage vault.'}
                    </p>
                  </div>

                  {error && (
                    <div className="p-3.5 bg-red-50 text-[#C8102E] text-[13px] rounded-xl border border-red-200">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1">
                        Username <span className="text-[11px] text-[#6B6B6B]">(6+ characters)</span>
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-[#9B9B9B] absolute left-3 top-3.5" />
                        <input
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g. janesmith24"
                          className="w-full pl-9 pr-3 py-3 text-[13px] bg-[#F8F3F0]/60 border border-[#E5DCD4] rounded-xl focus:outline-none focus:border-[#014BAA] focus:bg-white transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1">Password</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#9B9B9B] absolute left-3 top-3.5" />
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-9 pr-3 py-3 text-[13px] bg-[#F8F3F0]/60 border border-[#E5DCD4] rounded-xl focus:outline-none focus:border-[#014BAA] focus:bg-white transition-all"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer flex items-center justify-center gap-2 mt-2"
                    >
                      <span>{isRegister ? 'Create Unique Vault' : 'Open Vault'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegister(!isRegister);
                        setError(null);
                      }}
                      className="text-[13px] text-[#014BAA] hover:underline font-medium tap-spring cursor-pointer"
                    >
                      {isRegister ? 'Already registered? Log in' : "Don't have a vault? Create unique username"}
                    </button>
                  </div>

                  {/* 5-Day Auto-Purge Information */}
                  <div className="p-3.5 bg-[#F8F3F0] rounded-xl border border-[#E5DCD4] flex items-start gap-2.5 text-[12px] text-[#6B6B6B]">
                    <Sparkles className="w-4.5 h-4.5 text-[#014BAA] flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Free Tier Auto-Purge:</strong> Accounts and all associated files are permanently purged every 5 days to keep this service 100% free with zero clutter.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Key Features & Protections */}
          <div className="lg:col-span-3 space-y-5 order-3">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#1B8738] text-[12px] font-semibold tracking-wide uppercase font-mono border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                Defense in Depth
              </div>
              <h2 className="text-[23px] font-bold text-[#1A1A1A] tracking-tight leading-snug">
                Shared Terminals. <AppleColorText text="Zero Trace." mode="chars" />
              </h2>
              <p className="text-[14px] text-[#6B6B6B] leading-relaxed">
                Every feature is designed to solve a specific shared computer threat: keyloggers, forgotten logins, and unclosed tabs.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-4 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-1.5">
                <div className="flex items-center gap-2 text-[14px] font-bold text-[#1A1A1A]">
                  <HardDrive className="w-4.5 h-4.5 text-[#014BAA]" />
                  <span>20 MB Limit • 50 MB Cap</span>
                </div>
                <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
                  Generous headroom for PDFs, code files, and photos, while eliminating video abuse on the free tier.
                </p>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-1.5">
                <div className="flex items-center gap-2 text-[14px] font-bold text-[#1A1A1A]">
                  <Eye className="w-4.5 h-4.5 text-[#014BAA]" />
                  <span>In-Browser Preview & ZIP</span>
                </div>
                <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
                  Verify PDFs, code, and images in a clean Apple modal without downloading. Bulk-export files as a `.zip` in one click.
                </p>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-1.5">
                <div className="flex items-center gap-2 text-[14px] font-bold text-[#C8102E]">
                  <Shield className="w-4.5 h-4.5 text-[#C8102E]" />
                  <span>Instant Panic Button</span>
                </div>
                <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
                  Press <kbd className="px-1.5 py-0.5 bg-black/5 rounded text-[11px] font-mono font-bold">Esc 3x</kbd> or tap the red shield button to incinerate the session in 0ms if someone walks by.
                </p>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* 3. Refined Footer */}
      <footer className="max-w-7xl w-full mx-auto px-4 md:px-8 py-5 text-center text-[12px] text-[#9B9B9B] border-t border-[#E5DCD4]/60">
        Vaultdrop Cryptographic Engine • 24h file auto-destruction • 30 min session timeout • 100% Free Ephemeral Vault
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F3F0] flex items-center justify-center">
          <p className="text-[13px] text-[#6B6B6B]">Loading login...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
