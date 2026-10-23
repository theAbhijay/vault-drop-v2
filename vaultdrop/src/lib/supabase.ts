import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Clean any accidental /rest/v1/ suffix or trailing slashes
const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-supabase-url') &&
    !supabaseUrl.includes('your-project.supabase.co')
);

/**
 * Zero-trace session storage adapter.
 *
 * VaultDrop's threat model is the shared/public workstation: nothing may
 * outlive the tab. `sessionStorage` keeps the auth session alive across
 * reloads inside the tab (so uploads survive a refresh) but is wiped when
 * the tab closes, by the 30-minute TTL, and by the Panic wipe.
 */
function createTabScopedStorage(): Storage {
  const memory = new Map<string, string>();

  return {
    get length() {
      if (typeof sessionStorage === 'undefined') return memory.size;
      return sessionStorage.length;
    },
    clear() {
      if (typeof sessionStorage === 'undefined') return memory.clear();
      sessionStorage.clear();
    },
    getItem(key: string) {
      if (typeof sessionStorage === 'undefined') return memory.get(key) ?? null;
      return sessionStorage.getItem(key);
    },
    key(index: number) {
      if (typeof sessionStorage === 'undefined') return Array.from(memory.keys())[index] ?? null;
      return sessionStorage.key(index);
    },
    removeItem(key: string) {
      if (typeof sessionStorage === 'undefined') return memory.delete(key);
      sessionStorage.removeItem(key);
    },
    setItem(key: string, value: string) {
      if (typeof sessionStorage === 'undefined') return memory.set(key, value);
      sessionStorage.setItem(key, value);
    },
  } as Storage;
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: createTabScopedStorage(),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * Exchange a one-time refresh token (delivered via the QR login broker) for a
 * full Supabase session. Used by the workstation after consume_login_session().
 * The workstation holds the session for its 30-minute lifetime only — it never
 * refreshes afterwards, so the phone's own session family is never rotated.
 */
export async function exchangeRefreshToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; userId: string } | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.access_token || !data?.refresh_token || !data?.user?.id) return null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userId: data.user.id,
    };
  } catch {
    return null;
  }
}

export { supabaseUrl, supabaseAnonKey };
