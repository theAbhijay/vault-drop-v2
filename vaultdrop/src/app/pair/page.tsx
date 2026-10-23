'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ShieldCheck, 
  Laptop, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Lock, 
  User, 
  Check, 
  Shield,
  Eye,
  EyeOff,
  Smartphone
} from 'lucide-react';
import { OpenSourceLink } from '@/components/OpenSourceLink';
import { getCurrentUser, loginWithUsername, registerWithUsername } from '@/lib/auth-helpers';
import { approvePairingSession } from '@/lib/pair-helpers';
import { UserProfile } from '@/lib/types';
import { AppleColorText } from '@/components/AppleColorText';
import { PeacockLoader } from '@/components/PeacockLoader';
import { Footer } from '@/components/Footer';

function PairContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const handoff = searchParams.get('handoff');
  const uid = searchParams.get('uid');

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [approved, setApproved] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isHandoffProcessing, setIsHandoffProcessing] = useState<boolean>(false);

  // Fallback login form states if phone user is not already logged in
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check current session or process handoff
  useEffect(() => {
    // 1. Check for PC -> Phone Handoff (instant zero-keystroke login on mobile)
    if (handoff) {
      setIsHandoffProcessing(true);
      const profile: UserProfile = {
        id: uid || `user_${handoff}`,
        username: handoff,
        storageCapMb: 50,
        usedBytes: 0,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        accountExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      try {
        localStorage.setItem('vaultdrop_session_user', JSON.stringify(profile));
        sessionStorage.setItem('vaultdrop_session_expiry', (Date.now() + 30 * 60 * 1000).toString());
      } catch (err) {
        console.error('Storage error during handoff:', err);
      }

      const timer = setTimeout(() => {
        router.push('/');
      }, 1200);

      return () => clearTimeout(timer);
    }

    // 2. Regular session check
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
  }, [handoff, uid, router]);

  const handleApprove = async (targetUser?: UserProfile) => {
    const activeUser = targetUser || user;
    if (!token) {
      setError('Invalid or missing pairing token.');
      return;
    }
    if (!activeUser) {
      setError('Please log in first to authorize this session.');
      return;
    }

    setIsApproving(true);
    setError(null);

    try {
      const res = await approvePairingSession(token, activeUser);
      if (res.success) {
        setApproved(true);
      } else {
        setError(res.error || 'Failed to approve pairing.');
      }
    } catch {
      setError('An error occurred during pairing.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleAuthAndApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (username.trim().length <= 5) {
      setAuthError('Username must be at least 6 characters long.');
      return;
    }

    try {
      let res;
      if (isRegisterMode) {
        res = await registerWithUsername(username, password);
      } else {
        res = await loginWithUsername(username, password);
      }

      if (res.success && res.user) {
        setUser(res.user);
        await handleApprove(res.user);
      } else {
        setAuthError(res.error || 'Authentication failed.');
      }
    } catch {
      setAuthError('Authentication failed. Please check credentials.');
    }
  };

  if (isHandoffProcessing) {
    return (
      <div className="min-h-screen bg-[#F8F3F0] flex flex-col justify-between selection:bg-[#014BAA] selection:text-white">
        <PeacockLoader
          message={`Opening Vault for @${handoff}...`}
          submessage="Handoff authenticated • Connecting mobile browser"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F3F0] flex flex-col justify-between selection:bg-[#014BAA] selection:text-white">
      {/* Top Frosted Glass Navbar */}
      <header className="sticky top-0 z-40 glass-surface border-b border-[#E5DCD4]/80 px-4 md:px-8 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#014BAA] flex items-center justify-center text-white shadow-apple">
              <Shield className="w-4.5 h-4.5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-0.5">
                <span className="text-[16px] font-bold tracking-tight text-[#014BAA]">Vault</span>
                <AppleColorText text="Drop" className="text-[16px] font-bold tracking-tight" mode="chars" />
              </div>
              <span className="text-[11px] text-[#6B6B6B] block -mt-0.5 font-mono">Workstation Pairing</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/security"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-[#F8F3F0] text-[#1A1A1A] hover:text-[#014BAA] border border-[#E5DCD4] text-[12px] font-medium shadow-xs transition-all tap-spring"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#014BAA]" />
              <span>Security</span>
            </Link>
            <OpenSourceLink className="text-[12px]" />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 py-8">
        {!token ? (
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DCD4] shadow-apple max-w-sm w-full text-center space-y-4 animate-in fade-in">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Smartphone className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">Workstation Pairing</h2>
              <p className="text-[13px] text-[#6B6B6B] mt-1.5 leading-relaxed">
                Scan the dynamic QR code displayed on your PC monitor or use the <span className="font-semibold text-[#014BAA]">Open on Phone</span> button from your PC dashboard to pair automatically.
              </p>
            </div>
            <button
              onClick={() => router.push(user ? '/' : '/login')}
              className="w-full py-3.5 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer"
            >
              {user ? 'Return to Dashboard' : 'Open VaultDrop Gateway'}
            </button>
          </div>
        ) : (
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#E5DCD4] shadow-apple max-w-md w-full">
            {approved ? (
              <div className="text-center py-5 space-y-4 animate-in fade-in duration-300">
                <div className="w-18 h-18 bg-emerald-50 text-[#1B8738] rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <div>
                  <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">Terminal Unlocked!</h2>
                  <p className="text-[13px] text-[#6B6B6B] mt-1.5 max-w-xs mx-auto">
                    The lab computer has been authorized as <span className="font-semibold text-[#014BAA]">@{user?.username}</span>. You can now put away your phone and use the lab PC.
                  </p>
                </div>
                <div className="p-3.5 bg-[#F8F3F0] rounded-xl border border-[#E5DCD4] text-[12px] text-[#6B6B6B] text-left">
                  🔒 <strong>Privacy note:</strong> You never typed your password on the lab keyboard. Your files will auto-delete in 24 hours, and your session auto-locks when idle.
                </div>
              </div>
            ) : user ? (
              /* User is already logged in on phone -> Option 1 One-Tap "Authorize Lab PC? [Confirm]" */
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-14 h-14 bg-[#014BAA]/10 text-[#014BAA] rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Laptop className="w-7 h-7" />
                  </div>
                  <h2 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">
                    Authorize Lab PC? <AppleColorText text="Zero Trace." className="block text-[14px] font-semibold mt-0.5" mode="chars" />
                  </h2>
                  <p className="text-[13px] text-[#6B6B6B] mt-1">
                    A shared workstation scanned this QR request to access your vault.
                  </p>
                </div>

                <div className="p-4 bg-[#F8F3F0] rounded-xl border border-[#E5DCD4] space-y-2.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[#6B6B6B]">Account:</span>
                    <span className="font-semibold text-[#014BAA]">@{user.username}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[#6B6B6B]">Workstation Token:</span>
                    <span className="font-mono text-[12px] text-[#1A1A1A]">{token.substring(0, 10)}...</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[#6B6B6B]">Session Security:</span>
                    <span className="text-[#1B8738] font-medium">30m timeout • Zero keystrokes</span>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 text-[#C8102E] text-[13px] rounded-xl border border-red-200">
                    {error}
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => handleApprove()}
                    disabled={isApproving}
                    className="w-full py-4 bg-[#014BAA] hover:bg-[#013A85] text-white text-[15px] font-semibold rounded-2xl shadow-apple transition-all tap-spring cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    {isApproving ? 'Authorizing Lab PC...' : 'Authorize Lab PC [Confirm]'}
                  </button>

                  <button
                    onClick={() => router.push('/')}
                    className="w-full py-2.5 text-[13px] text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors tap-spring cursor-pointer"
                  >
                    Deny Request
                  </button>
                </div>
              </div>
            ) : (
              /* User is not yet logged in on phone -> Fast Username & Password Login */
              <div className="space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 bg-[#014BAA]/10 text-[#014BAA] rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <h2 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">
                    {isRegisterMode ? 'Create Vault & Unlock' : 'Sign In to Authorize'}{' '}
                    <AppleColorText text="Air-Gap Safe." className="block text-[14px] font-semibold mt-0.5" mode="chars" />
                  </h2>
                  <p className="text-[13px] text-[#6B6B6B] mt-1">
                    Enter your credentials on your private phone to unlock the lab computer safely.
                  </p>
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 text-[#C8102E] text-[13px] rounded-xl border border-red-200">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleAuthAndApprove} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1">
                      Unique Username <span className="text-[11px] text-[#6B6B6B]">(6+ characters)</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[#9B9B9B] absolute left-3 top-3.5" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. alexander99"
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
                    disabled={isApproving}
                    className="w-full py-3.5 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer flex items-center justify-center gap-2 mt-2"
                  >
                    <span>{isRegisterMode ? 'Create & Unlock Terminal' : 'Sign In & Unlock Terminal'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterMode(!isRegisterMode);
                      setAuthError(null);
                    }}
                    className="text-[13px] text-[#014BAA] hover:underline font-medium tap-spring cursor-pointer"
                  >
                    {isRegisterMode ? 'Already have a vault? Log in instead' : "Don't have a vault? Create unique username"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Centered Peacock Loader for Mobile Pairing */}
      {isApproving && (
        <PeacockLoader
          message="Authorizing Lab PC..."
          submessage="Transmitting zero-trace cryptographic certificate"
        />
      )}

      {/* Production Footer */}
      <Footer />
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F3F0] flex items-center justify-center">
          <p className="text-[13px] text-[#6B6B6B]">Loading pairing session...</p>
        </div>
      }
    >
      <PairContent />
    </Suspense>
  );
}
