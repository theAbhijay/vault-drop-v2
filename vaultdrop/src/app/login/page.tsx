'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
  EyeOff,
  Flame,
  ChevronRight
} from 'lucide-react';
import { QRLoginCard } from '@/components/QRLoginCard';
import { OpenSourceLink } from '@/components/OpenSourceLink';
import { AppleColorText } from '@/components/AppleColorText';
import { PeacockLoader } from '@/components/PeacockLoader';
import { Footer } from '@/components/Footer';
import { redirectToGoogleLens, GOOGLE_LENS_INTENT_URL } from '@/lib/google-lens';
import { loginWithUsername, registerWithUsername, getCurrentUser, logoutUser } from '@/lib/auth-helpers';

type GatewayTab = 'qr' | 'password';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');

  const [activeTab, setActiveTab] = useState<GatewayTab>('qr');
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Mobile Device Detection for Scene 1
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);

  // Auto-dismissing alerts
  const [showPanicAlert, setShowPanicAlert] = useState<boolean>(reason === 'panic');
  const [showTimeoutAlert, setShowTimeoutAlert] = useState<boolean>(reason === 'timeout');
  const [showNavAlert, setShowNavAlert] = useState<boolean>(reason === 'back_navigation');

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      setIsMobileDevice(isMobileUA || (typeof window !== 'undefined' && window.innerWidth < 768));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Panic Wipe Alert: Strictly disappears after 10 seconds per user request
  useEffect(() => {
    if (reason === 'panic') {
      setShowPanicAlert(true);
      const timer = setTimeout(() => {
        setShowPanicAlert(false);
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/login');
        }
      }, 10000); // 10 seconds auto-dismiss
      return () => clearTimeout(timer);
    }
  }, [reason]);

  useEffect(() => {
    if (reason) {
      logoutUser();
    } else if (getCurrentUser()) {
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

    const minDelay = new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      let res;
      if (isRegister) {
        res = await registerWithUsername(username, password);
      } else {
        res = await loginWithUsername(username, password);
      }

      await minDelay; // Guarantee 2s peacock loading screen

      if (res.success) {
        router.push('/');
      } else {
        setError(res.error || 'Authentication failed.');
      }
    } catch {
      await minDelay;
      setError('An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F3F0] flex flex-col justify-between selection:bg-[#014BAA] selection:text-white overflow-x-hidden">
      {/* 1. Frosted Glass Top Navigation Bar */}
      <header className="sticky top-0 z-40 glass-surface border-b border-[#E5DCD4]/80 px-4 sm:px-6 md:px-8 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Brand Logo */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-[#014BAA] flex items-center justify-center text-white shadow-apple">
              <Shield className="w-4.5 h-4.5 sm:w-5 sm:h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-0.5">
                <span className="text-[16px] sm:text-[17px] font-bold tracking-tight text-[#014BAA]">Vault</span>
                <AppleColorText text="Drop" className="text-[16px] sm:text-[17px] font-bold tracking-tight" mode="chars" />
              </div>
              <span className="text-[10px] sm:text-[11px] text-[#6B6B6B] block -mt-0.5 font-mono">v1.0 • Ephemeral File Vault</span>
            </div>
          </div>

          {/* Right Header Navigation & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/security"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-[#F8F3F0] text-[#1A1A1A] hover:text-[#014BAA] border border-[#E5DCD4] text-[12px] font-medium shadow-xs transition-all tap-spring"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#014BAA]" />
              <span>Security</span>
            </Link>

            <OpenSourceLink />
          </div>
        </div>
      </header>

      {/* 2. Main Hero: Focused Center Gateway Box */}
      <main className="max-w-4xl w-full mx-auto px-4 py-8 sm:py-12 flex-1 flex flex-col items-center justify-center">
        {/* Hero Title */}
        <div className="text-center space-y-2 mb-6 sm:mb-8 max-w-lg mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#014BAA]/10 text-[#014BAA] text-[11px] sm:text-[12px] font-semibold tracking-wide uppercase font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Zero-Trace Ephemeral Gateway</span>
          </div>
          <h1 className="text-[24px] sm:text-[30px] font-bold text-[#1A1A1A] tracking-tight leading-snug">
            Unlock Your Vault on <AppleColorText text="Any Terminal." mode="chars" />
          </h1>
          <p className="text-[13px] sm:text-[14px] text-[#6B6B6B] leading-relaxed">
            Scan with your smartphone for zero-keystroke entry, or authenticate directly with your username and password.
          </p>
        </div>

        {/* Notice Banners (with auto-dismiss for panic wipe) */}
        {showTimeoutAlert && (
          <div className="w-full max-w-md mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-[13px] text-amber-800 animate-in fade-in">
            <AlertCircle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0" />
            <span>Vault sealed automatically after 30 minutes of inactivity for your protection.</span>
          </div>
        )}
        {showPanicAlert && (
          <div className="w-full max-w-md mb-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-[13px] text-red-800 animate-in fade-in">
            <Shield className="w-4.5 h-4.5 text-red-600 flex-shrink-0" />
            <span>Panic Wipe triggered. All local session tokens incinerated immediately.</span>
          </div>
        )}
        {showNavAlert && (
          <div className="w-full max-w-md mb-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-[13px] text-red-800 animate-in fade-in">
            <Shield className="w-4.5 h-4.5 text-red-600 flex-shrink-0" />
            <span>Session Terminated. Browser navigation detected — vault sealed immediately for security.</span>
          </div>
        )}

        {/* THE CENTER GATEWAY BOX */}
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5DCD4] shadow-apple-lg p-5 sm:p-7 transition-all duration-300">
          {/* Gateway Mode Switcher: 2 Clean Options */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F8F3F0] rounded-2xl border border-[#E5DCD4] mb-6">
            {/* Tab 1: QR Code Login */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('qr');
                setError(null);
              }}
              className={`py-2.5 px-3 text-[12px] sm:text-[13px] font-semibold rounded-xl transition-all tap-spring flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'qr'
                  ? 'bg-white text-[#014BAA] shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Code</span>
            </button>

            {/* Tab 2: Username & Password */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('password');
                setError(null);
              }}
              className={`py-2.5 px-3 text-[12px] sm:text-[13px] font-semibold rounded-xl transition-all tap-spring flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'password'
                  ? 'bg-white text-[#014BAA] shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Username & Password</span>
            </button>
          </div>

          {/* TAB 1: QR Code Flow (Adaptive for Scene 1: Smartphone vs PC) */}
          {activeTab === 'qr' && (
            <div key="tab-qr" className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out">
              {isMobileDevice ? (
                /* Scene 1: Smartphone Login Screen -> Blurred Mock QR with Scan Box */
                <div className="space-y-4 text-center">
                  <div className="relative w-full max-w-[280px] h-[280px] mx-auto rounded-3xl overflow-hidden border border-[#E5DCD4] bg-[#F8F3F0] flex items-center justify-center p-4">
                    {/* Blurred Mock Background QR */}
                    <div className="absolute inset-0 flex items-center justify-center filter blur-[6px] opacity-30 select-none pointer-events-none scale-105">
                      <div className="w-48 h-48 bg-gradient-to-tr from-[#0071E3] via-[#AF52DE] to-[#FF9500] rounded-2xl flex items-center justify-center text-white">
                        <QrCode className="w-36 h-36" />
                      </div>
                    </div>

                    {/* Centered Overlay Action Box for Scene 1 (Direct Google Lens Redirect) */}
                    <div className="relative z-10 bg-white/95 backdrop-blur-md rounded-2xl border border-[#E5DCD4] shadow-apple p-5 space-y-3 max-w-[240px]">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0071E3] to-[#AF52DE] text-white flex items-center justify-center mx-auto shadow-sm">
                        <Sparkles className="w-6 h-6" />
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-[15px] font-bold text-[#1A1A1A] tracking-tight">Log In via QR</h4>
                        <p className="text-[11px] text-[#6B6B6B] leading-tight">
                          Open Google Lens to scan the QR code displayed inside your PC vault
                        </p>
                      </div>

                      <a
                        href={GOOGLE_LENS_INTENT_URL}
                        onClick={redirectToGoogleLens}
                        className="w-full py-2.5 px-3 bg-[#014BAA] hover:bg-[#013A85] text-white text-[12px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Open Google Lens</span>
                      </a>
                    </div>
                  </div>

                  <p className="text-[12px] text-[#6B6B6B] max-w-xs mx-auto">
                    Already logged in on your PC? Tap above to open Google Lens and scan your PC monitor QR code!
                  </p>
                </div>
              ) : (
                /* PC Monitor: Real Sharp Chromatic QR Code */
                <QRLoginCard onSuccess={() => router.push('/')} />
              )}
            </div>
          )}

          {/* TAB 2: Username & Password Direct Flow */}
          {activeTab === 'password' && (
            <div 
              key={isRegister ? 'register-mode' : 'login-mode'} 
              className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out"
            >
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
                <div className="p-3.5 bg-red-50 text-[#C8102E] text-[13px] rounded-xl border border-red-200 animate-in fade-in">
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
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-3 text-[13px] bg-[#F8F3F0]/60 border border-[#E5DCD4] rounded-xl focus:outline-none focus:border-[#014BAA] focus:bg-white transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors p-0.5 rounded cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
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
            </div>
          )}
        </div>
      </main>

      {/* 3. Centered Peacock Loader (guaranteed 2s minimum duration during login) */}
      {loading && (
        <PeacockLoader
          message={isRegister ? 'Creating Secure Vault...' : 'Unlocking VaultDrop...'}
          submessage={isRegister ? 'Configuring zero-trace encrypted storage' : 'Verifying credentials & session security'}
        />
      )}

      {/* 4. Rich Information Section */}
      <section className="max-w-5xl w-full mx-auto px-4 sm:px-6 md:px-8 py-12 border-t border-[#E5DCD4]/70 space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-[22px] sm:text-[26px] font-bold text-[#1A1A1A] tracking-tight">
            Engineered Specifically for <AppleColorText text="Public Computers." mode="chars" />
          </h2>
          <p className="text-[13px] sm:text-[14px] text-[#6B6B6B] max-w-xl mx-auto">
            Traditional tools leak data on shared college terminals. Here is how VaultDrop isolates your files and protects your identity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-[#014BAA]">
              <ShieldCheck className="w-5 h-5 text-[#014BAA]" />
              <span>Zero Keystrokes on PC</span>
            </div>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              Never type your password on a public keyboard. Scan the screen QR with your phone camera to log in with zero trace.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-[#014BAA]">
              <Clock className="w-5 h-5 text-[#014BAA]" />
              <span>24-Hour File Auto-Destruction</span>
            </div>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              Every uploaded file self-destructs after 24 hours. Nothing lingers on the shared workstation or server.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-[#014BAA]">
              <HardDrive className="w-5 h-5 text-[#014BAA]" />
              <span>50 MB Storage Cap • In-Browser Sandbox</span>
            </div>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              Generous headroom for PDFs, code files, and photos. Verify files in a secure sandboxed modal without saving to the lab hard drive.
            </p>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-[#E5DCD4] shadow-apple space-y-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-[#C8102E]">
              <Flame className="w-5 h-5 text-[#C8102E]" />
              <span>Instant Esc 3x Panic Wipe</span>
            </div>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              Press <kbd className="px-1.5 py-0.5 bg-black/5 rounded text-[11px] font-mono font-bold">Esc 3x</kbd> or click the red shield button to immediately incinerate the session in 0ms if someone approaches.
            </p>
          </div>
        </div>

        <div className="text-center pt-2">
          <Link
            href="/security"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#014BAA] hover:underline tap-spring"
          >
            <span>Read full Security & Threat Model Whitepaper</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* 5. Production Footer */}
      <Footer />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F3F0] flex items-center justify-center">
          <p className="text-[13px] text-[#6B6B6B]">Loading VaultDrop...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
