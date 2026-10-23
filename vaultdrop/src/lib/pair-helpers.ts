import { supabase, isSupabaseConfigured, exchangeRefreshToken } from './supabase';
import { fetchUserProfile, establishSessionWindow, validateUsername, usernameToInternalEmail } from './auth-helpers';
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

/**
 * Normalize a server timestamp to an offset-anchored ISO string. A naive
 * value (no "Z" / "+00:00") would be parsed by JS as LOCAL time — wrong by
 * the user's UTC offset — so anchor anything naive to UTC explicitly.
 */
function normalizeServerTimestamp(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) return trimmed;
  return `${trimmed}Z`;
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
    return {
      token: data.token as string,
      expiresAt: normalizeServerTimestamp(data.expiresAt),
    };
  } catch (err) {
    console.error('[VaultDrop] create_login_session network failure:', err);
    return null;
  }
}

/** Step 2 (PC, ~1.5s polling): status only — never leaks identity. */
export async function getLoginSessionStatus(token: string): Promise<LoginSessionStatus | null> {
  if (!(isSupabaseConfigured && supabase)) return null;
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_login_session_status', { p_token: token }),
      3000
    );
    if (error || !data) return null;
    const status = data as LoginSessionStatus;
    if (status.expiresAt) {
      return { ...status, expiresAt: normalizeServerTimestamp(status.expiresAt) };
    }
    return status;
  } catch {
    return null;
  }
}

/**
 * Step 3 (phone): approve the workstation with ONE TAP — no password.
 *
 * The phone must simply BE signed in (its own personal device). We deposit
 * the phone's CURRENT session refresh token via the one-time broker; the
 * workstation exchanges it for its own short-lived session and never
 * refreshes afterwards (its 30-minute TTL ends first).
 *
 * Token-chain reconciliation: after the workstation consumes the deposited
 * token (rotating it), we refresh this phone's session INSIDE GoTrue's
 * refresh-token reuse grace — both devices then hold the same successor
 * token, so the phone stays signed in. Best-effort and failure-safe.
 */
export async function approveLoginSession(token: string): Promise<{ success: boolean; error?: string }> {
  if (!(isSupabaseConfigured && supabase)) {
    return { success: false, error: 'VaultDrop is not configured.' };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session?.refresh_token) {
    return { success: false, error: 'You are not signed in on this phone.' };
  }

  const { data: approved, error: rpcError } = await supabase.rpc('approve_login_session', {
    p_token: token,
    p_refresh_token: session.refresh_token,
    p_device_info: buildDeviceInfo(),
  });

  if (rpcError || approved !== true) {
    return {
      success: false,
      error: 'This code is invalid, expired, or already used. Refresh the workstation screen and scan again.',
    };
  }

  // Background reconciliation — never blocks the approval UI.
  void (async () => {
    try {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const status = await getLoginSessionStatus(token);
        // 'unknown' = row deleted → the workstation consumed the token.
        // 'expired' = window lapsed; refreshing is then just a normal rotation.
        if (!status || status.status === 'unknown' || status.status === 'expired') break;
      }
      await supabase.auth.refreshSession();
    } catch {
      // Best effort: worst case this phone re-authenticates on its next visit.
    }
  })();

  return { success: true };
}

/**
 * Sign-in + approve in one step (phone was NOT signed in when it scanned).
 * The username/password are typed on the personal phone only — after this
 * first sign-in, every future QR approval is a single tap.
 */
export async function signInAndApprove(
  token: string,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  if (!(isSupabaseConfigured && supabase)) {
    return { success: false, error: 'VaultDrop is not configured.' };
  }

  const validation = validateUsername(username);
  if (!validation.valid || !validation.cleanUsername) {
    return { success: false, error: validation.error };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToInternalEmail(validation.cleanUsername!),
    password,
  });
  if (error) {
    return { success: false, error: 'Invalid username or password.' };
  }

  return approveLoginSession(token);
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
    return { token: data.token as string, expiresAt: normalizeServerTimestamp(data.expiresAt) };
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
