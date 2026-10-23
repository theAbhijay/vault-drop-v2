import { supabase, isSupabaseConfigured } from './supabase';
import { PairingSession, UserProfile } from './types';

const MOCK_PAIRING_PREFIX = 'vaultdrop_pair_';

/**
 * Generate a cryptographically secure random token (64 hex characters, length >= 32).
 */
export function generatePairToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper to race any PromiseLike against a timeout to prevent hanging network calls.
 */
function withTimeout<T>(promise: PromiseLike<T>, ms = 3500): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Network timeout')), ms)),
  ]);
}

/**
 * Create a new pairing session on the lab PC.
 * Enforces schema constraints: user_id IS NULL, status = 'pending', qr_token >= 32 chars.
 * Guaranteed never to hang — fails gracefully to local session if cloud is unreachable.
 */
export async function createPairingSession(): Promise<PairingSession> {
  const token = generatePairToken();
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutes

  if (isSupabaseConfigured && supabase) {
    try {
      const res = await withTimeout(
        supabase
          .from('pairing_sessions')
          .insert({
            qr_token: token,
            user_id: null,
            status: 'pending',
            expires_at: expiresAt,
          })
          .select()
          .single()
      );

      const { data, error } = res;

      if (!error && data) {
        return {
          id: data.id,
          qrToken: data.qr_token,
          status: data.status,
          createdAt: data.created_at,
          expiresAt: data.expires_at,
        };
      }
    } catch (err) {
      console.warn('createPairingSession cloud call failed or timed out, falling back to local:', err);
    }
  }

  // Fallback (Local development or instant offline fallback)
  const session: PairingSession = {
    id: `local_pair_${token}`,
    qrToken: token,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(`${MOCK_PAIRING_PREFIX}${token}`, JSON.stringify(session));
  }

  return session;
}

/**
 * Look up a pairing session token by short PIN (first 6 characters of token).
 * Allows users without Google Lens or camera access to pair instantly via PIN.
 */
export async function findTokenByPin(pin: string): Promise<string | null> {
  const cleanPin = pin.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (cleanPin.length < 4) return null;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('pairing_sessions')
        .select('qr_token, expires_at, status')
        .ilike('qr_token', `${cleanPin}%`)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        if (new Date(data.expires_at).getTime() > Date.now()) {
          return data.qr_token;
        }
      }
    } catch {
      // ignore
    }
  }

  // Fallback (Local development)
  if (typeof window !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(MOCK_PAIRING_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const session: PairingSession = JSON.parse(raw);
            if (
              session.qrToken.toLowerCase().startsWith(cleanPin) &&
              session.status === 'pending' &&
              new Date(session.expiresAt).getTime() > Date.now()
            ) {
              return session.qrToken;
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }

  return null;
}

/**
 * Check the status of a pairing session (polled by the lab PC).
 */
export async function checkPairingStatus(token: string): Promise<PairingSession | null> {
  if (isSupabaseConfigured && supabase) {
    try {
      const res = await withTimeout(
        supabase
          .from('pairing_sessions')
          .select('id, qr_token, status, created_at, expires_at, user_id, consumed_at, device_info')
          .eq('qr_token', token)
          .maybeSingle(),
        2500
      );

      const { data, error } = res;

      if (!error && data) {
        const isExpired = new Date(data.expires_at).getTime() <= Date.now();
        let currentStatus = data.status as PairingSession['status'];
        if (isExpired && currentStatus === 'pending') {
          currentStatus = 'expired';
        }

        let username: string | undefined;
        let boundUserId = data.user_id;

        // 1. Direct metadata extraction from device_info (always readable by anonymous PC terminal)
        if (data.device_info) {
          try {
            const meta = JSON.parse(data.device_info);
            if (meta.username && meta.username.toLowerCase() !== 'student') {
              username = meta.username;
            }
            if (meta.userId) {
              boundUserId = meta.userId;
            }
          } catch {
            // ignore non-JSON device_info
          }
        }

        // 2. Fallback query to profiles if user_id exists
        if (!username && data.user_id) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', data.user_id)
              .maybeSingle();
            if (profile?.username && profile.username.toLowerCase() !== 'student') {
              username = profile.username;
            }
          } catch {
            // ignore
          }
        }

        return {
          id: data.id,
          qrToken: data.qr_token,
          status: currentStatus,
          createdAt: data.created_at,
          expiresAt: data.expires_at,
          consumedAt: data.consumed_at,
          userId: boundUserId,
          username,
        };
      }
    } catch {
      // ignore timeout
    }
  }

  // Fallback (Local development)
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(`${MOCK_PAIRING_PREFIX}${token}`);
    if (!raw) return null;
    try {
      const session: PairingSession = JSON.parse(raw);
      if (new Date(session.expiresAt).getTime() <= Date.now() && session.status === 'pending') {
        session.status = 'expired';
      }
      return session;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Approve a pairing session from the smartphone node.
 * Binds authentic user credentials into PostgreSQL pairing session.
 */
export async function approvePairingSession(
  token: string,
  user: UserProfile,
  deviceInfo = 'Mobile Scanner'
): Promise<{ success: boolean; error?: string }> {
  const metadataString = JSON.stringify({
    username: user.username,
    userId: user.id,
    device: deviceInfo,
    approvedAt: new Date().toISOString(),
  });

  if (isSupabaseConfigured && supabase) {
    try {
      const res = await withTimeout(
        supabase.rpc('approve_pairing_session', {
          p_qr_token: token,
          p_device_info: metadataString,
        }),
        4000
      );

      const { data, error } = res;

      if (!error && data === true) {
        return { success: true };
      }
      if (error) {
        return { success: false, error: error.message };
      }
    } catch (err) {
      console.warn('approvePairingSession cloud call error:', err);
    }
  }

  // Fallback (Local development)
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(`${MOCK_PAIRING_PREFIX}${token}`);
    if (!raw) {
      return { success: false, error: 'Pairing session not found or expired.' };
    }

    try {
      const session: PairingSession = JSON.parse(raw);
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        return { success: false, error: 'QR Code has expired. Please refresh the PC screen.' };
      }

      session.status = 'approved';
      session.userId = user.id;
      session.username = user.username;
      session.deviceInfo = metadataString;

      localStorage.setItem(`${MOCK_PAIRING_PREFIX}${token}`, JSON.stringify(session));
      return { success: true };
    } catch {
      return { success: false, error: 'Invalid pairing session data.' };
    }
  }

  return { success: false, error: 'Storage environment unavailable' };
}

/**
 * Consume a pairing session on the lab PC.
 * Calls hardened v2 RPC function `consume_pairing_session(p_qr_token)` to prevent replay attacks.
 */
export async function consumePairingSession(token: string): Promise<string | null> {
  if (isSupabaseConfigured && supabase) {
    try {
      const res = await withTimeout(
        supabase.rpc('consume_pairing_session', {
          p_qr_token: token,
        }),
        3000
      );

      const { data, error } = res;

      if (!error && data) {
        return data as string;
      }
    } catch {
      // ignore
    }
  }

  // Fallback (Local development)
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(`${MOCK_PAIRING_PREFIX}${token}`);
    if (!raw) return null;
    try {
      const session: PairingSession = JSON.parse(raw);
      if (session.status === 'approved' && !session.consumedAt) {
        session.consumedAt = new Date().toISOString();
        session.status = 'consumed';
        localStorage.setItem(`${MOCK_PAIRING_PREFIX}${token}`, JSON.stringify(session));
        return session.userId || 'local_user';
      }
    } catch {
      return null;
    }
  }

  return null;
}
