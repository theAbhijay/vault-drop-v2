'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, Laptop, CheckCircle2, AlertTriangle, ArrowRight, Lock, User, Check } from 'lucide-react';
import { getCurrentUser, loginWithUsername, registerWithUsername } from '@/lib/auth-helpers';
import { approvePairingSession } from '@/lib/pair-helpers';
import { UserProfile } from '@/lib/types';

function PairContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [approved, setApproved] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fallback login form states if phone user is not already logged in
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
  }, []);

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

  if (!token) {
    return (
      <div className="min-h-screen bg-[#F8F3F0] flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl border border-[#E5DCD4] shadow-apple max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-[#C8102E] mx-auto mb-3" />
          <h2 className="text-[19px] font-bold text-[#1A1A1A]">Missing Token</h2>
          <p className="text-[13px] text-[#6B6B6B] mt-1 mb-4">
            No valid workstation token found. Please scan the QR code on the lab PC monitor.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3 bg-[#014BAA] text-white text-[13px] font-semibold rounded-xl tap-spring"
          >
            Go to Vaultdrop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F3F0] flex items-center justify-center p-4">
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
          /* User is already logged in on phone -> Option 2 One-Tap "Authorize Lab PC? [Confirm]" */
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-[#014BAA]/10 text-[#014BAA] rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Laptop className="w-7 h-7" />
              </div>
              <h2 className="text-[20px] font-bold text-[#1A1A1A] tracking-tight">Authorize Lab PC?</h2>
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
                {isRegisterMode ? 'Create Vault & Unlock' : 'Sign In to Authorize'}
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
