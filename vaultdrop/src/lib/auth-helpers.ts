import { supabase, isSupabaseConfigured } from './supabase';
import { UserProfile } from './types';

/**
 * VaultDrop session rules (single source of truth):
 *  - Workstation session TTL: 30 minutes, enforced client-side AND backed by the
 *    server-side Supabase session (validated via auth.getUser() on every mount).
 *  - Account lifecycle: 7 days after last activity, enforced in Postgres.
 *  - Nothing that grants access is ever written to localStorage. The auth
 *    session lives in sessionStorage (tab-scoped) and dies with the tab.
 */

export const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_EXPIRY_KEY = 'vaultdrop_session_expiry';
const MOCK_STORAGE_KEY_USER = 'vaultdrop_session_user'; // legacy v2 key, purged on logout
const MOCK_STORAGE_KEY_USERS = 'vaultdrop_mock_users';

/** Local-dev mock mode is ONLY available in development builds. */
export const isMockMode =
  !isSupabaseConfigured && process.env.NODE_ENV === 'development';

/**
 * Validates username strictly against schema constraints:
 * - Length: 5 to 32 characters
 * - Lowercase alphanumeric and underscores only: ^[a-z0-9_]+$
 */
export function validateUsername(username: string): { valid: boolean; error?: string; cleanUsername?: string } {
  const trimmed = username.trim().toLowerCase();

  if (trimmed.length < 5) {
    return { valid: false, error: 'Username must be at least 5 characters long.' };
  }
  if (trimmed.length > 32) {
    return { valid: false, error: 'Username cannot exceed 32 characters.' };
  }
  if (!/^[a-z0-9_]+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain lowercase letters, numbers, and underscores.' };
  }

  return { valid: true, cleanUsername: trimmed };
}

/**
 * Generates internal synthetic email address for Supabase Auth.
 * Supabase Auth requires an internal email, but users exclusively see and use their username.
 */
export function usernameToInternalEmail(username: string): string {
  return `${username.trim().toLowerCase()}@vaultdrop.com`;
}

/** Start the local 30-minute session window (sessionStorage only — zero trace). */
export function establishSessionWindow(): void {
  if (typeof window === 'undefined') return;
  const expiry = (Date.now() + SESSION_TTL_MS).toString();
  sessionStorage.setItem(SESSION_EXPIRY_KEY, expiry);
  // Purge legacy v2 artifacts that used to live in localStorage.
  localStorage.removeItem(MOCK_STORAGE_KEY_USER);
  localStorage.removeItem(SESSION_EXPIRY_KEY);
}

/** Cheap synchronous guard used by timers. Full validation is `getCurrentUser()` (async). */
export function isSessionWindowValid(): boolean {
  if (typeof window === 'undefined') return false;
  const exp = sessionStorage.getItem(SESSION_EXPIRY_KEY);
  if (!exp) return false;
  const ts = parseInt(exp, 10);
  return !Number.isNaN(ts) && ts > Date.now();
}

/**
 * Check if a username is already taken (hardened zero-leak RPC).
 */
export async function checkUsernameTaken(username: string): Promise<boolean> {
  const validation = validateUsername(username);
  if (!validation.valid || !validation.cleanUsername) return false;

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('is_username_taken', {
      p_username: validation.cleanUsername,
    });
    if (error) return false;
    return Boolean(data);
  }

  if (isMockMode && typeof window !== 'undefined') {
    try {
      const users = JSON.parse(localStorage.getItem(MOCK_STORAGE_KEY_USERS) || '{}');
      return Boolean(users[validation.cleanUsername]);
    } catch {
      return false;
    }
  }

  return false;
}

function parseMockUsers(): Record<string, { username: string; password: string; createdAt: string; expiresAt: string }> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(MOCK_STORAGE_KEY_USERS) || '{}');
  } catch {
    return {};
  }
}

/**
 * Register a new user with unique username and password.
 */
export async function registerWithUsername(
  username: string,
  password: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const validation = validateUsername(username);
  if (!validation.valid || !validation.cleanUsername) {
    return { success: false, error: validation.error };
  }

  if (password.length < 5) {
    return { success: false, error: 'Password must be at least 5 characters long.' };
  }

  const cleanUsername = validation.cleanUsername;

  // Supabase Cloud Environment
  if (isSupabaseConfigured && supabase) {
    const isTaken = await checkUsernameTaken(cleanUsername);
    if (isTaken) {
      return { success: false, error: 'Username is already taken. Please choose another.' };
    }

    const internalEmail = usernameToInternalEmail(cleanUsername);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: internalEmail,
      password: password,
      options: { data: { username: cleanUsername } },
    });

    if (authError) {
      const message = authError.message.toLowerCase();
      if (message.includes('email signups are disabled')) {
        return {
          success: false,
          error:
            'Supabase Setup: "Allow new users to sign up" is disabled. In your Supabase Dashboard: Authentication → Providers → Email, turn ON "Allow new users to sign up", turn OFF "Confirm email", and click Save.',
        };
      }
      if (message.includes('username')) {
        return { success: false, error: 'Username is already taken. Please choose another.' };
      }
      if (message.includes('at least') && message.includes('character')) {
        return {
          success: false,
          error:
            'Your Supabase project enforces a longer minimum password. Lower "Minimum password length" to 5 in Supabase Dashboard → Authentication → Policies, then try again.',
        };
      }
      // Never surface raw internal errors to end users.
      return { success: false, error: 'Registration failed. Please try again.' };
    }

    if (!authData.user) {
      return { success: false, error: 'Failed to create user account.' };
    }

    if (authData.user.identities && authData.user.identities.length === 0) {
      return { success: false, error: 'Username is already registered. Please sign in or choose a different username.' };
    }

    // Ensure an active session even if Supabase did not attach one to signUp
    if (!authData.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: password,
      });
      if (signInErr) {
        if (signInErr.message.toLowerCase().includes('email not confirmed')) {
          return {
            success: false,
            error:
              'Account created, but Email Confirmation is enabled in Supabase. In Supabase Dashboard → Authentication → Providers → Email, toggle OFF "Confirm email", and save.',
          };
        }
        return { success: false, error: 'Account created. Please sign in.' };
      }
    }

    try {
      await supabase.rpc('touch_user_activity');
    } catch {
      // non-fatal
    }

    const profile = await fetchUserProfile(authData.user.id, cleanUsername);
    if (!profile) {
      return { success: false, error: 'Account created, but the profile could not be loaded. Please sign in.' };
    }

    establishSessionWindow();
    return { success: true, user: profile };
  }

  // Local development mock (dev builds only)
  if (isMockMode && typeof window !== 'undefined') {
    const users = parseMockUsers();
    if (users[cleanUsername]) {
      return { success: false, error: 'Username is already taken.' };
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    users[cleanUsername] = { username: cleanUsername, password, createdAt: now, expiresAt };
    localStorage.setItem(MOCK_STORAGE_KEY_USERS, JSON.stringify(users));

    const profile: UserProfile = {
      id: `local_user_${cleanUsername}`,
      username: cleanUsername,
      storageCapMb: 50,
      usedBytes: 0,
      createdAt: now,
      lastActiveAt: now,
      accountExpiresAt: expiresAt,
    };
    localStorage.setItem(MOCK_STORAGE_KEY_USER, JSON.stringify(profile));

    establishSessionWindow();
    return { success: true, user: profile };
  }

  return { success: false, error: 'VaultDrop is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
}

/** Fetch the authoritative profile row for a user (RLS-scoped to the caller). */
export async function fetchUserProfile(userId: string, fallbackUsername?: string): Promise<UserProfile | null> {
  if (!(isSupabaseConfigured && supabase)) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, storage_cap_mb, created_at, last_active_at, expires_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    username: data.username || fallbackUsername || '',
    storageCapMb: data.storage_cap_mb ?? 50,
    usedBytes: 0, // real usage comes from getVaultUsage(); filled by the dashboard
    createdAt: data.created_at,
    lastActiveAt: data.last_active_at,
    accountExpiresAt: data.expires_at,
  };
}

/**
 * Log in with username and password.
 */
export async function loginWithUsername(
  username: string,
  password: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const validation = validateUsername(username);
  if (!validation.valid || !validation.cleanUsername) {
    return { success: false, error: validation.error };
  }

  const cleanUsername = validation.cleanUsername;

  if (isSupabaseConfigured && supabase) {
    const internalEmail = usernameToInternalEmail(cleanUsername);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: internalEmail,
      password: password,
    });

    if (authError || !authData.user) {
      return { success: false, error: 'Invalid username or password.' };
    }

    try {
      await supabase.rpc('touch_user_activity');
    } catch {
      // non-fatal
    }

    const profile = await fetchUserProfile(authData.user.id, cleanUsername);
    if (!profile) {
      // A session without a profile is not usable — sign back out.
      await supabase.auth.signOut().catch(() => {});
      return { success: false, error: 'Account profile unavailable. Please contact support.' };
    }

    if (new Date(profile.accountExpiresAt).getTime() <= Date.now()) {
      await supabase.auth.signOut().catch(() => {});
      return { success: false, error: 'This account has expired (7 days of inactivity).' };
    }

    establishSessionWindow();
    return { success: true, user: profile };
  }

  // Local development mock
  if (isMockMode && typeof window !== 'undefined') {
    const users = parseMockUsers();
    const existing = users[cleanUsername];
    if (!existing || existing.password !== password) {
      return { success: false, error: 'Invalid username or password.' };
    }

    const now = new Date().toISOString();
    existing.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(MOCK_STORAGE_KEY_USERS, JSON.stringify(users));

    establishSessionWindow();
    return {
      success: true,
      user: {
        id: `local_user_${cleanUsername}`,
        username: cleanUsername,
        storageCapMb: 50,
        usedBytes: 0,
        createdAt: existing.createdAt,
        lastActiveAt: now,
        accountExpiresAt: existing.expiresAt,
      },
    };
  }

  return { success: false, error: 'VaultDrop is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
}

/** In-memory cache so repeated navigation doesn't re-hit auth.getUser() within a mount cycle. */
let cachedUser: UserProfile | null = null;

/**
 * Get the current authenticated user — SERVER-VALIDATED.
 *
 * The Supabase session must be alive (auth.getUser() round-trips the JWT) AND
 * the local 30-minute window must be unexpired AND the account lifecycle must
 * be intact. A forged localStorage blob grants nothing: there is nothing left
 * in localStorage to forge.
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  if (typeof window === 'undefined') return null;

  if (!isSessionWindowValid()) {
    return null;
  }

  if (isSupabaseConfigured && supabase) {
    const { data: authData, error } = await supabase.auth.getUser();
    if (error || !authData?.user) {
      return null;
    }

    if (cachedUser?.id === authData.user.id) return cachedUser;

    const profile = await fetchUserProfile(authData.user.id);
    if (!profile) return null;

    if (new Date(profile.accountExpiresAt).getTime() <= Date.now()) {
      await logoutUser();
      return null;
    }

    cachedUser = profile;
    return profile;
  }

  // Local development mock
  if (isMockMode) {
    try {
      const raw = localStorage.getItem(MOCK_STORAGE_KEY_USER);
      if (!raw) return null;
      const user: UserProfile = JSON.parse(raw);
      if (new Date(user.accountExpiresAt).getTime() <= Date.now()) return null;
      return user;
    } catch {
      return null;
    }
  }

  return null;
}

/** Clear any cached profile (call after logout / panic). */
export function clearCachedUser(): void {
  cachedUser = null;
}

/**
 * Log out user: revokes the server session and clears every VaultDrop trace.
 */
export async function logoutUser(): Promise<void> {
  clearCachedUser();
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut().catch(() => {});
  }
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
    // Legacy v2 keys (localStorage) must not survive on shared workstations.
    localStorage.removeItem(MOCK_STORAGE_KEY_USER);
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    // Purge leftover local-dev pairing/file mock data.
    if (process.env.NODE_ENV === 'development') {
      localStorage.removeItem(MOCK_STORAGE_KEY_USERS);
    }
  }
}

/**
 * PANIC WIPE: synchronous, maximal teardown for emergencies.
 * Clears all storage surfaces and cache before the redirect happens.
 */
export function panicWipe(): void {
  clearCachedUser();
  if (isSupabaseConfigured && supabase) {
    void supabase.auth.signOut().catch(() => {});
  }
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.clear();
      localStorage.removeItem(MOCK_STORAGE_KEY_USER);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
      localStorage.removeItem(MOCK_STORAGE_KEY_USERS);
    } catch {
      // storage may be unavailable (private mode) — nothing else to do
    }
  }
}
