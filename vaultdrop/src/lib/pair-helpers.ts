import { createClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, supabaseUrl, supabaseAnonKey, exchangeRefreshToken } from './supabase';
import {
  fetchUserProfile,
  establishSessionWindow,
  usernameToInternalEmail,
  validateUsername,
} from './auth-helpers';
import { ConsumedLoginSession, LoginSessionStatus, ResolvedHandoff, UserProfile } from './types';

/**
 * VaultDrop v3 pairing — every operation goes through SECURITY DEFINER RPCs.
 * The workstation never receives identity from a URL: it receives a one-time
 * refresh token that it exchanges for a REAL Supabase session.
 */

/** A pairing token is exactly 64 lowercase hex chars (256-bit, server-generated). */
export function isValidPairToken(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value.trim());
}

export function buildPairUrl(token: string): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/pair?token=${token}`;
}

export function buildHandoffUrl(token: string): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/pair?handoff=${token}`;
}

/** Race a call against a timeout so a dead network can't freeze the UI. */
function withTimeout<T>(promise: PromiseLike<T>, ms = 5000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Network timeout')), ms)),
  ]);
}

function buildDeviceInfo(): string {
  if (typeof navigator === 'undefined') return JSON.stringify({ device: 'unknown' });
  return JSON.stringify({
    ua: navigator.userAgent.slice(0, 140),
    at: new Date().toISOString(),
  });
}

// ==============================================================================
// QR LOGIN (untrusted PC ← phone). See supabase_schema.sql §6.8.
// ==============================================================================

export interface CreatedLoginSession {
  token: string;
  pin: string;
  expiresAt: string;
}

/** Step 1 (PC, anonymous): create the session the QR encodes. */
export async function createLoginSession(): Promise<CreatedLoginSession | null> {
  if (!(isSupabaseConfigured && supabase)) return null;
  try {
    const { data, error } = await withTimeout(supabase.rpc('create_login_session'), 5000);
    if (error) {
      // PGRST202 = RPC not found → the v3 schema has not been deployed to
      // Supabase yet. Surface the reason in the console for diagnosis.
      console.error(
        `[VaultDrop] create_login_session failed (${error.code ?? 'no code'}): ${error.message}`
      );
      return null;
    }
    if (!data?.token) return null;
    return { token: data.token as string, pin: data.pin as string, expiresAt: data.expiresAt as string };
  } catch (err) {
    console.error('[VaultDrop] create_login_session network failure:', err);
    return null;
  }
}

/** Step 2 (PC, ~1s polling): status only — never leaks identity. */
export async function getLoginSessionStatus(token: string): Promise<LoginSessionStatus | null> {
  if (!(isSupabaseConfigured && supabase)) return null;
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_login_session_status', { p_token: token }),
      3000
    );
    if (error || !data) return null;
    return data as LoginSessionStatus;
  } catch {
    return null;
  }
}

/**
 * Step 3 (phone): approve the workstation with the account password.
 *
 * The password is only ever typed on the user's PERSONAL device. A throwaway
 * in-memory Supabase client signs in and mints a dedicated workstation session;
 * its one-time refresh token is deposited for the PC. The phone's own session
 * family is never rotated, and the PC receives an independent real session.
 */
export async function approveLoginSessionWithCredentials(
  token: string,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  if (!(isSupabaseConfigured && supabase)) {
    return { success: false, error: 'VaultDrop is not configured.' };
  }

  const validation = validateUsername(username);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const memoryClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInError } = await memoryClient.auth.signInWithPassword({
    email: usernameToInternalEmail(validation.cleanUsername!),
    password,
  });

  if (signInError || !signInData.session) {
    return { success: false, error: 'Invalid username or password.' };
  }

  const { data: approved, error: rpcError } = await memoryClient.rpc('approve_login_session', {
    p_token: token,
    p_refresh_token: signInData.session.refresh_token,
    p_device_info: buildDeviceInfo(),
  });

  // Deliberately NO signOut on the memory client — its session is the one being
  // handed to the workstation. Dropping the reference is enough; nothing was
  // persisted anywhere.

  if (rpcError || approved !== true) {
    return {
      success: false,
      error: 'This code is invalid, expired, or already used. Refresh the workstation screen and scan again.',
    };
  }

  return { success: true };
}

/** No-camera fallback (phone, authenticated): resolve the 6-char workstation PIN. */
export async function resolveLoginPin(
  pin: string
): Promise<{ token?: string; error?: 'wrong_pin' | 'locked' | 'not_found' | 'not_authenticated' }> {
  if (!(isSupabaseConfigured && supabase)) return { error: 'not_found' };
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('resolve_login_pin', { p_pin: pin.trim().toUpperCase() }),
      4000
    );
    if (error) return { error: 'not_found' };
    if (data?.error) return { error: data.error };
    if (data?.token) return { token: data.token as string };
    return { error: 'not_found' };
  } catch {
    return { error: 'not_found' };
  }
}

/**
 * Step 4 (PC): consume the approved session ONE time and install the real
 * Supabase session locally. Returns the full profile for the dashboard.
 */
export async function completeWorkstationLogin(
  token: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  if (!(isSupabaseConfigured && supabase)) {
    return { success: false, error: 'VaultDrop is not configured.' };
  }

  let consumed: ConsumedLoginSession | null = null;
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('consume_login_session', { p_token: token }),
      5000
    );
    if (error || !data) {
      return { success: false, error: 'The pairing session expired or was already used.' };
    }
    consumed = data as ConsumedLoginSession;
  } catch {
    return { success: false, error: 'Network error while completing login. Try scanning again.' };
  }

  const exchanged = await exchangeRefreshToken(consumed.refreshToken);
  if (!exchanged) {
    return { success: false, error: 'Session handoff failed. Please try again.' };
  }

  const { error: setError } = await supabase.auth.setSession({
    access_token: exchanged.accessToken,
    refresh_token: exchanged.refreshToken,
  });
  if (setError) {
    return { success: false, error: 'Session handoff failed. Please try again.' };
  }

  const profile = await fetchUserProfile(consumed.userId, consumed.username);
  if (!profile) {
    return { success: false, error: 'Account profile unavailable.' };
  }

  establishSessionWindow();
  return { success: true, user: profile };
}

// ==============================================================================
// HANDOFF (logged-in PC → phone). See supabase_schema.sql §6.9.
// The QR carries ONLY an opaque token; resolving it reveals which account to
// sign into — never a session. The phone authenticates with the password on
// the trusted personal device.
// ==============================================================================

export async function createHandoffSession(): Promise<{ token: string; expiresAt: string } | null> {
  if (!(isSupabaseConfigured && supabase)) return null;
  try {
    const { data, error } = await withTimeout(supabase.rpc('create_handoff_session'), 5000);
    if (error || !data?.token) return null;
    return { token: data.token as string, expiresAt: data.expiresAt as string };
  } catch {
    return null;
  }
}

export async function resolveHandoffSession(token: string): Promise<ResolvedHandoff | null> {
  if (!(isSupabaseConfigured && supabase)) return null;
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('resolve_handoff_session', { p_token: token }),
      5000
    );
    if (error || !data?.userId) return null;
    return { userId: data.userId as string, username: data.username as string };
  } catch {
    return null;
  }
}
