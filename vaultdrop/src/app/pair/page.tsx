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
  Smartphone,
} from 'lucide-react';
import { OpenSourceLink } from '@/components/OpenSourceLink';
import { getCurrentUser, loginWithUsername, registerWithUsername } from '@/lib/auth-helpers';
import {
  approveLoginSession,
  signInAndApprove,
  resolveHandoffSession,
  isValidPairToken,
} from '@/lib/pair-helpers';
import { UserProfile } from '@/lib/types';
import { AppleColorText } from '@/components/AppleColorText';
import { PeacockLoader } from '@/components/PeacockLoader';
import { Footer } from '@/components/Footer';

type PairMode =
  | { kind: 'checking' }
  | { kind: 'invalid'; message: string }
  | { kind: 'info' } // no params — generic pairing landing
  | { kind: 'approve'; token: string } // ?token= with a live phone session → ONE TAP
  | { kind: 'auth-approve'; token: string } // ?token= but phone not signed in
  | { kind: 'handoff-login'; username: string } // ?handoff= resolved, password needed
  | { kind: 'approved' };

function PairContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const handoff = searchParams.get('handoff');

  const [mode, setMode] = useState<PairMode>({ kind: 'checking' });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  // Approve-panel password (typed on the trusted personal phone — it mints the
  // workstation's dedicated session; the phone session is never shared).
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Auth form (phone not signed in yet)
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      const current = await getCurrentUser();
      if (!mounted) return;
      setUser(current);

      if (handoff) {
        if (!isValidPairToken(handoff)) {
          setMode({ kind: 'invalid', message: 'This handoff code is malformed. Refresh the code on your PC and scan again.' });
          return;
        }

        // ONE-TIME resolution: reveals which account to open — grants nothing.
        const resolved = await resolveHandoffSession(handoff);
        if (!mounted) return;

        if (!resolved) {
          setMode({
            kind: 'invalid',
            message: 'This one-time handoff code has expired or was already used. Codes live for 2 minutes — show a fresh one on your PC.',
          });
          return;
        }

        if (current && current.id === resolved.userId) {
          // Already signed in as this account — truly instant, zero typing.
          router.push('/');
          return;
        }

        setUsername(resolved.username);
        setMode({ kind: 'handoff-login', username: resolved.username });
        return;
      }

      if (token) {
        if (!isValidPairToken(token)) {
          setMode({ kind: 'invalid', message: 'This pairing code is malformed. Refresh the QR on the PC and scan again.' });
          return;
        }
        setMode(current ? { kind: 'approve', token } : { kind: 'auth-approve', token });
        return;
      }

      setMode({ kind: 'info' });
    })();

    return () => {
      mounted = false;
    };
  }, [token, handoff, router]);

  /** Approve a workstation session — ONE TAP, no password. */
  const handleOneTapApprove = async (targetToken: string) => {
    const minDelay = new Promise((resolve) => setTimeout(resolve, 2000));
    setBusy(true);
    setError(null);

    try {
      const res = await approveLoginSession(targetToken);
      await minDelay;
      if (res.success) {
        setMode({ kind: 'approved' });
      } else {
        setError(res.error || 'Failed to authorize this session.');
      }
    } catch {
      await minDelay;
      setError('An error occurred during pairing.');
    } finally {
      setBusy(false);
    }
  };

  /** Not signed in + ?token= → sign the phone in AND authorize the PC in one step. */
  const handleAuthAndApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.trim().length < 5) {
      setError('Username must be at least 5 characters long.');
      return;
    }
    if (mode.kind !== 'auth-approve') return;

    const minDelay = new Promise((resolve) => setTimeout(resolve, 2000));
    setBusy(true);

    try {
      let signedIn;
      if (isRegisterMode) {
        signedIn = await registerWithUsername(username, password);
      } else {
        signedIn = await loginWithUsername(username, password);
      }

      if (signedIn.success && signedIn.user) {
        setUser(signedIn.user);
        const approveRes = await signInAndApprove(mode.token, username, password);
        await minDelay;
        if (approveRes.success) {
          setMode({ kind: 'approved' });
        } else {
          setMode({ kind: 'approve', token: mode.token });
          setError(approveRes.error || 'Signed in, but the pairing code was rejected. Refresh the PC screen.');
        }
      } else {
        await minDelay;
        setError(signedIn.error || 'Authentication failed.');
      }
    } catch {
      await minDelay;
      setError('Authentication failed. Please check credentials.');
    } finally {
      setBusy(false);
    }
  };

  /** Handoff resolved → sign in on the phone with the account password. */
  const handleHandoffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind !== 'handoff-login') return;
    setError(null);

    const minDelay = new Promise((resolve) => setTimeout(resolve, 2000));
    setBusy(true);

    try {
      const res = await loginWithUsername(mode.username, password);
      await minDelay;
      if (res.success) {
        router.push('/');
      } else {
        setError(res.error || 'Invalid username or password.');
      }
    } catch {
      await minDelay;
      setError('Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
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

      <main className="flex-1 flex items-center justify-center p-4 py-8">{children}</main>

      {busy && (
        <PeacockLoader
          message="Authorizing Workstation..."
          submessage="Performing zero-trace cryptographic handshake"
        />
      )}

      <Footer />
    </div>
  );

  if (mode.kind === 'checking') {
    return (
      <div className="min-h-screen bg-[#F8F3F0]">
        <PeacockLoader
          message="Validating Pairing Code..."
          submessage="Performing zero-trace cryptographic handshake"
        />
      </div>
    );
  }

  if (mode.kind === 'invalid') {
    return shell(
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DCD4] shadow-apple max-w-sm w-full text-center space-y-4 animate-in fade-in">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">Pairing Code Invalid</h2>
        <p className="text-[13px] text-[#6B6B6B] mt-1.5 leading-relaxed">{mode.message}</p>
        <button
          onClick={() => router.push(user ? '/' : '/login')}
          className="w-full py-3.5 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer"
        >
          {user ? 'Return to Dashboard' : 'Open VaultDrop Gateway'}
        </button>
      </div>
    );
  }

  if (mode.kind === 'info') {
    return shell(
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DCD4] shadow-apple max-w-sm w-full text-center space-y-4 animate-in fade-in">
        <div className="w-14 h-14 rounded-2xl bg-[#014BAA]/10 text-[#014BAA] flex items-center justify-center mx-auto">
          <Smartphone className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">Workstation Pairing</h2>
          <p className="text-[13px] text-[#6B6B6B] mt-1.5 leading-relaxed">
            Scan the dynamic QR code displayed on your PC monitor, or use the{' '}
            <span className="font-semibold text-[#014BAA]">Open on Phone</span> button from your PC dashboard.
          </p>
        </div>

        <button
          onClick={() => router.push(user ? '/' : '/login')}
          className="w-full py-3.5 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer"
        >
          {user ? 'Return to Dashboard' : 'Open VaultDrop Gateway'}
        </button>
      </div>
    );
  }

  if (mode.kind === 'approved') {
    return shell(
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#E5DCD4] shadow-apple max-w-md w-full">
        <div className="text-center py-5 space-y-4 animate-in fade-in duration-300">
          <div className="w-18 h-18 bg-emerald-50 text-[#1B8738] rounded-full flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <div>
            <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">Terminal Unlocked!</h2>
            <p className="text-[13px] text-[#6B6B6B] mt-1.5 max-w-xs mx-auto">
              The lab computer has been authorized as{' '}
              <span className="font-semibold text-[#014BAA]">@{user?.username}</span>. You can now put away your phone
              and use the lab PC.
            </p>
          </div>
          <div className="p-3.5 bg-[#F8F3F0] rounded-xl border border-[#E5DCD4] text-[12px] text-[#6B6B6B] text-left">
            <strong>Privacy note:</strong> You never typed your password on the lab keyboard — and this approval
            needed no password at all. The workstation received its own dedicated 30-minute session that dies with
            the tab.
          </div>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer"
          >
            Return to Vault on Phone
          </button>
        </div>
      </div>
    );
  }

  if (mode.kind === 'handoff-login') {
    return shell(
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#E5DCD4] shadow-apple max-w-md w-full space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-[#014BAA]/10 text-[#014BAA] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Smartphone className="w-7 h-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">
            Open Vault for @{mode.username}{' '}
            <AppleColorText text="One-Time Handoff." className="block text-[14px] font-semibold mt-0.5" mode="chars" />
          </h2>
          <p className="text-[13px] text-[#6B6B6B] mt-1">
            You scanned a one-time handoff code from your PC. Confirm your password on your personal phone to open the
            vault here.
          </p>
        </div>

        {error && <div className="p-3 bg-red-50 text-[#C8102E] text-[13px] rounded-xl border border-red-200">{error}</div>}

        <form onSubmit={handleHandoffLogin} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1">Username (pre-filled)</label>
            <div className="relative">
              <User className="w-4 h-4 text-[#9B9B9B] absolute left-3 top-3.5" />
              <input
                type="text"
                readOnly
                value={mode.username}
                className="w-full pl-9 pr-3 py-3 text-[13px] bg-[#E6EEF7] border border-[#E5DCD4] rounded-xl font-mono text-[#014BAA]"
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
                autoFocus
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
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3.5 bg-[#014BAA] hover:bg-[#013A85] text-white text-[13px] font-semibold rounded-xl shadow-apple transition-all tap-spring cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            <span>Open Vault on This Phone</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    );
  }

  if (mode.kind === 'approve') {
    return shell(
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#E5DCD4] shadow-apple max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 bg-[#014BAA]/10 text-[#014BAA] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Laptop className="w-7 h-7" />
          </div>
          <h2 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">
            Authorize Lab PC?{' '}
            <AppleColorText text="One Tap. Zero Trace." className="block text-[14px] font-semibold mt-0.5" mode="chars" />
          </h2>
          <p className="text-[13px] text-[#6B6B6B] mt-1">
            A shared workstation is waiting for your approval. Tap confirm — the PC receives its own dedicated
            30-minute session. No password needed.
          </p>
        </div>

        <div className="p-4 bg-[#F8F3F0] rounded-xl border border-[#E5DCD4] space-y-2.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#6B6B6B]">Account:</span>
            <span className="font-semibold text-[#014BAA]">@{user?.username}</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#6B6B6B]">Workstation Token:</span>
            <span className="font-mono text-[12px] text-[#1A1A1A]">{mode.token.substring(0, 10)}...</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#6B6B6B]">Session Security:</span>
            <span className="text-[#1B8738] font-medium">30m timeout • One-time code</span>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 text-[#C8102E] text-[13px] rounded-xl border border-red-200">{error}</div>}

        <div className="space-y-3">
          <button
            onClick={() => void handleOneTapApprove(mode.token)}
            disabled={busy}
            className="w-full py-4 bg-[#014BAA] hover:bg-[#013A85] text-white text-[15px] font-semibold rounded-2xl shadow-apple transition-all tap-spring cursor-pointer flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            {busy ? 'Authorizing Lab PC...' : 'Authorize Lab PC [Confirm]'}
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 text-[13px] text-[#6B6B6B] hover:text-[#1A1A1A] transition-colors tap-spring cursor-pointer"
          >
            Deny Request
          </button>
        </div>
      </div>
    );
  }

  // mode.kind === 'auth-approve' — phone not signed in yet
  return shell(
    <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#E5DCD4] shadow-apple max-w-md w-full space-y-5">
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

      {error && <div className="p-3 bg-red-50 text-[#C8102E] text-[13px] rounded-xl border border-red-200">{error}</div>}

      <form onSubmit={handleAuthAndApprove} className="space-y-4">
        <div>
          <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1">
            Unique Username <span className="text-[11px] text-[#6B6B6B]">(5–32 characters)</span>
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-[#9B9B9B] absolute left-3 top-3.5" />
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alexander99"
              autoComplete="username"
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
              autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
              className="w-full pl-9 pr-10 py-3 text-[13px] bg-[#F8F3F0]/60 border border-[#E5DCD4] rounded-xl focus:outline-none focus:border-[#014BAA] focus:bg-white transition-all font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3.5 text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors p-0.5 rounded cursor-pointer"
              title={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
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
            setError(null);
          }}
          className="text-[13px] text-[#014BAA] hover:underline font-medium tap-spring cursor-pointer"
        >
          {isRegisterMode ? 'Already have a vault? Log in instead' : "Don't have a vault? Create unique username"}
        </button>
      </div>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F3F0]">
          <PeacockLoader message="Loading Pairing Session..." submessage="Preparing secure workstation bridge" />
        </div>
      }
    >
      <PairContent />
    </Suspense>
  );
}
