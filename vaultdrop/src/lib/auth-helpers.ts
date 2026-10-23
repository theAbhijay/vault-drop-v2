import { supabase, isSupabaseConfigured } from './supabase';
import { UserProfile } from './types';

const MOCK_STORAGE_KEY_USER = 'vaultdrop_session_user';
const MOCK_STORAGE_KEY_USERS = 'vaultdrop_mock_users';

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

/**
 * Check if a username is already taken.
 * Uses the hardened v2 RPC function `is_username_taken(p_username)` to prevent row leakage.
 */
export async function checkUsernameTaken(username: string): Promise<boolean> {
  const validation = validateUsername(username);
  if (!validation.valid || !validation.cleanUsername) return false;

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('is_username_taken', {
      p_username: validation.cleanUsername,
    });
    if (error) {
      console.warn('RPC is_username_taken notice:', error.message);
      return false;
    }
    return Boolean(data);
  }

  // Fallback (Local Dev)
  if (typeof window !== 'undefined') {
    const usersJson = localStorage.getItem(MOCK_STORAGE_KEY_USERS);
    const users = usersJson ? JSON.parse(usersJson) : {};
    return Boolean(users[validation.cleanUsername]);
  }

  return false;
}

/**
 * Register a new user with unique username and password.
 * Aligns with v2 database trigger `handle_new_user()` which reads metadata->'username'.
 */
export async function registerWithUsername(
  username: string,
  password: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const validation = validateUsername(username);
  if (!validation.valid || !validation.cleanUsername) {
    return { success: false, error: validation.error };
  }

  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  const cleanUsername = validation.cleanUsername;

  // Supabase Cloud Environment
  if (isSupabaseConfigured && supabase) {
    // 1. Check availability via secure zero-leak RPC
    const isTaken = await checkUsernameTaken(cleanUsername);
    if (isTaken) {
      return { success: false, error: 'Username is already taken. Please choose another.' };
    }

    const internalEmail = usernameToInternalEmail(cleanUsername);

    // 2. Sign up in Supabase Auth passing username in user_metadata
    // The Postgres trigger `on_auth_user_created` creates the profile row automatically!
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: internalEmail,
      password: password,
      options: {
        data: {
          username: cleanUsername,
        },
      },
    });

    if (authError) {
      if (authError.message.toLowerCase().includes('email signups are disabled')) {
        return {
          success: false,
          error:
            'Supabase Setup: "Allow new users to sign up" is disabled in your Supabase project. In your Supabase Dashboard: go to Authentication -> Providers -> Email, turn ON "Allow new users to sign up", turn OFF "Confirm email", and click Save.',
        };
      }
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: 'Failed to create user account.' };
    }

    // Check if user identity already existed or email confirmation is required
    if (authData.user.identities && authData.user.identities.length === 0) {
      return {
        success: false,
        error: 'Username already registered. Please sign in or choose a different username.',
      };
    }

    // Ensure active session if Supabase did not attach one to signUp
    if (!authData.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: password,
      });

      if (signInErr && signInErr.message.toLowerCase().includes('email not confirmed')) {
        return {
          success: false,
          error:
            'Account created, but Email Confirmation is enabled in Supabase. In Supabase Dashboard -> Authentication -> Providers -> Email, scroll to the top, toggle OFF "Confirm email", and save.',
        };
      }
    }

    // 3. Touch user activity to initialize 30-day active timer
    try {
      await supabase.rpc('touch_user_activity');
    } catch {
      // ignore
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const profile: UserProfile = {
      id: authData.user.id,
      username: cleanUsername,
      storageCapMb: 50,
      usedBytes: 0,
      createdAt: now,
      lastActiveAt: now,
      accountExpiresAt: expiresAt,
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(MOCK_STORAGE_KEY_USER, JSON.stringify(profile));
    }

    return { success: true, user: profile };
  }

  // Fallback (Local Development without Supabase keys)
  if (typeof window !== 'undefined') {
    const usersJson = localStorage.getItem(MOCK_STORAGE_KEY_USERS);
    const users = usersJson ? JSON.parse(usersJson) : {};

    if (users[cleanUsername]) {
      return { success: false, error: 'Username is already taken.' };
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    users[cleanUsername] = {
      username: cleanUsername,
      password,
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
    };

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
    return { success: true, user: profile };
  }

  return { success: false, error: 'Storage environment unavailable' };
}

/**
 * Log in with username and password.
 * Calls `touch_user_activity` on success to refresh the 30-day active session window.
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

    // Refresh 30-day active lifecycle
    try {
      await supabase.rpc('touch_user_activity');
    } catch {
      // ignore
    }

    // Fetch profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    const profile: UserProfile = {
      id: authData.user.id,
      username: profileData?.username || cleanUsername,
      storageCapMb: profileData?.storage_cap_mb || 50,
      usedBytes: 0,
      createdAt: profileData?.created_at || new Date().toISOString(),
      lastActiveAt: profileData?.last_active_at || new Date().toISOString(),
      accountExpiresAt: profileData?.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(MOCK_STORAGE_KEY_USER, JSON.stringify(profile));
    }

    return { success: true, user: profile };
  }

  // Fallback (Local development)
  if (typeof window !== 'undefined') {
    const usersJson = localStorage.getItem(MOCK_STORAGE_KEY_USERS);
    const users = usersJson ? JSON.parse(usersJson) : {};
    const existing = users[cleanUsername];

    if (!existing || existing.password !== password) {
      return { success: false, error: 'Invalid username or password.' };
    }

    existing.lastActiveAt = new Date().toISOString();
    existing.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(MOCK_STORAGE_KEY_USERS, JSON.stringify(users));

    const profile: UserProfile = {
      id: `local_user_${cleanUsername}`,
      username: cleanUsername,
      storageCapMb: 50,
      usedBytes: 0,
      createdAt: existing.createdAt,
      lastActiveAt: existing.lastActiveAt,
      accountExpiresAt: existing.expiresAt,
    };

    localStorage.setItem(MOCK_STORAGE_KEY_USER, JSON.stringify(profile));
    return { success: true, user: profile };
  }

  return { success: false, error: 'Storage environment unavailable' };
}

/**
 * Get current authenticated user profile.
 */
export function getCurrentUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(MOCK_STORAGE_KEY_USER);
  if (!data) return null;
  try {
    const user: UserProfile = JSON.parse(data);
    // Check if account has passed its 30-day expiration
    if (new Date(user.accountExpiresAt).getTime() <= Date.now()) {
      logoutUser();
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

/**
 * Log out user: clears state and tokens.
 */
export async function logoutUser(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut().catch(() => {});
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(MOCK_STORAGE_KEY_USER);
    sessionStorage.removeItem('vaultdrop_session_expiry');
    document.cookie = 'vaultdrop_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
  }
}
