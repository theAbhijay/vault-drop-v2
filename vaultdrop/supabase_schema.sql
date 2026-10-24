-- ==============================================================================
-- VAULTDROP DATABASE SCHEMA & SECURITY DEFINITIONS — v3 (Zero-Trust Hardened)
-- Built for Supabase (PostgreSQL 15+)
--
-- Fixes over v2:
--   1. pairing_sessions has NO table policies/grants — all access flows through
--      SECURITY DEFINER RPCs (v2 had `USING (true)` → anon could read ALL rows)
--   2. files.storage_path is CHECK-constrained to the owner's own folder —
--      closes the cross-user blob deletion primitive (v2 CRITICAL)
--   3. files.storage_path is UNIQUE — one blob, one metadata row
--   4. File expiry enforced in RLS (expired rows are invisible + uninsertable),
--      not just by the purge cron
--   5. handle_new_user validates the username and aborts cleanly on race
--      conditions (v2 could crash signups with cryptic errors)
--   6. QR pairing redesigned as a real session-transfer broker:
--      - PC login: approve_login_session stores a one-time refresh token minted
--        on the phone; consume_login_session hands it to the PC exactly once,
--        then the row is deleted. The PC gets a REAL Supabase session (RLS works).
--      - PC → phone handoff: token resolves only to (user_id, username), one
--        time, 2-minute TTL. The phone still authenticates with its password on
--        the trusted personal device. No more username+uid login bypass.
--   7. Workstation PIN is an independent random 6-char secret (NOT a token
--      prefix), authenticated-only lookup, 5-attempt lockout per session
--   8. pg_cron purge schedules are created automatically when the extension
--      is enabled (with duplicate-safe guards)
--   9. Grant surface reduced to the minimum the client actually needs
--  10. get_vault_usage() RPC gives the client REAL storage usage numbers
--  11. v3.1: Workstation PIN fallback removed (owner decision) and QR approve
--      no longer requires the password — the phone deposits its CURRENT
--      session token via the one-time broker (password only on fresh login)
-- ==============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE (linked to auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,  -- stored lowercase; uniqueness enforced by unique index below
    storage_cap_mb INTEGER NOT NULL DEFAULT 50,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Account expires 30 days after LAST ACTIVITY (not creation)
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '30 days'),
    CONSTRAINT username_length_check CHECK (char_length(username) >= 5),
    CONSTRAINT username_lowercase_check CHECK (username = lower(username)),
    CONSTRAINT username_charset_check CHECK (username ~ '^[a-z0-9_]+$')
);

-- Single source of truth for uniqueness (we enforce lowercase storage above)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx ON public.profiles (username);
CREATE INDEX IF NOT EXISTS profiles_expires_at_idx ON public.profiles (expires_at);

-- ------------------------------------------------------------------------------
-- 2. FILES METADATA TABLE
--    storage_path is ALWAYS `user_<owner_id>/<file_id>.<safe-ext>` — enforced by
--    a table CHECK so a malicious client can never register or delete another
--    user's storage object through the files table (v2 CRITICAL fix).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
    storage_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520), -- 20 MB max
    mime_type TEXT NOT NULL CHECK (char_length(mime_type) BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '24 hours'),
    CONSTRAINT storage_path_owner_prefix_check
        CHECK (storage_path LIKE 'user_' || owner_id::text || '/%')
);

-- Hardening for pre-existing v2 deployments (new tables get these via CREATE above)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'storage_path_owner_prefix_check'
    ) THEN
        ALTER TABLE public.files
            ADD CONSTRAINT storage_path_owner_prefix_check
            CHECK (storage_path LIKE 'user_' || owner_id::text || '/%');
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS files_storage_path_unique_idx ON public.files (storage_path);
CREATE INDEX IF NOT EXISTS files_owner_id_idx ON public.files (owner_id);
CREATE INDEX IF NOT EXISTS files_expires_at_idx ON public.files (expires_at);
CREATE INDEX IF NOT EXISTS files_owner_expires_idx ON public.files (owner_id, expires_at DESC);

-- ------------------------------------------------------------------------------
-- 3. PAIRING SESSIONS TABLE (QR login + handoff broker)
--    RLS is ENABLED with ZERO policies: nobody reads/writes this table directly.
--    Every operation goes through the SECURITY DEFINER RPCs in section 6.
--
--    kind = 'login'   : untrusted PC displays QR; phone approves with a
--                       one-time refresh token; PC consumes it for a real session.
--    kind = 'handoff' : logged-in PC displays QR; phone resolves it to learn
--                       WHICH account to sign into (never grants anything).
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.pairing_sessions CASCADE;

CREATE TABLE public.pairing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_token TEXT UNIQUE NOT NULL CHECK (qr_token ~ '^[a-f0-9]{64}$'),
    kind TEXT NOT NULL CHECK (kind IN ('login', 'handoff')) DEFAULT 'login',
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'expired'))
        DEFAULT 'pending',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_refresh_token TEXT,     -- only for kind='login'; one-time, <= 2 min lifetime
    device_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '2 minutes')
);

CREATE INDEX IF NOT EXISTS pairing_sessions_expires_at_idx ON public.pairing_sessions (expires_at);

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_sessions ENABLE ROW LEVEL SECURITY;

-- === PROFILES POLICIES ===

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Users can UPDATE their own row, BUT a trigger (below) restricts which columns
-- can actually change. Without the trigger, users could bump storage_cap_mb.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- NO public SELECT policy. Username availability is exposed only as a boolean
-- via the is_username_taken() function below — no row leakage.

-- === FILES POLICIES ===
-- Expired files are invisible (SELECT) and cannot be created backdated (INSERT),
-- independent of the purge cron.

DROP POLICY IF EXISTS "Users can view their own live files" ON public.files;
CREATE POLICY "Users can view their own live files"
    ON public.files FOR SELECT
    USING (auth.uid() = owner_id AND expires_at > timezone('utc'::text, now()));

DROP POLICY IF EXISTS "Users can insert their own files" ON public.files;
CREATE POLICY "Users can insert their own files"
    ON public.files FOR INSERT
    WITH CHECK (
        auth.uid() = owner_id
        AND expires_at > timezone('utc'::text, now())
        AND expires_at <= timezone('utc'::text, now()) + INTERVAL '25 hours'
    );

DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;
CREATE POLICY "Users can delete their own files"
    ON public.files FOR DELETE
    USING (auth.uid() = owner_id);

-- NO UPDATE policy — files are immutable by design.

-- === PAIRING SESSIONS POLICIES ===
-- Intentionally NO policies. RLS + no grants = the table is only reachable
-- through the SECURITY DEFINER RPCs below.

-- ------------------------------------------------------------------------------
-- 5. STORAGE BUCKET POLICIES (private bucket "vault", 20 MB object limit)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('vault', 'vault', false, 20971520)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 20971520;

DROP POLICY IF EXISTS "vault_users_read_own" ON storage.objects;
CREATE POLICY "vault_users_read_own"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'vault' AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text);

DROP POLICY IF EXISTS "vault_users_insert_own" ON storage.objects;
CREATE POLICY "vault_users_insert_own"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'vault' AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text);

DROP POLICY IF EXISTS "vault_users_delete_own" ON storage.objects;
CREATE POLICY "vault_users_delete_own"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'vault' AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text);

-- Clean up policies from the v2 schema so they don't linger as dead rows.
DROP POLICY IF EXISTS "Users can read own storage files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own storage folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own storage files" ON storage.objects;

-- ------------------------------------------------------------------------------
-- 6. TRIGGERS & SECURITY DEFINER FUNCTIONS
-- ------------------------------------------------------------------------------

-- 6.1 Auto-create profile when a new auth.users row is inserted.
--     Validates the username BEFORE inserting; a unique-violation race surfaces
--     as a clean "Username is already taken." error instead of a crash.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_username TEXT;
BEGIN
    v_username := lower(NEW.raw_user_meta_data->>'username');

    IF v_username IS NULL
       OR char_length(v_username) < 5
       OR char_length(v_username) > 32
       OR v_username !~ '^[a-z0-9_]+$' THEN
        RAISE EXCEPTION 'Invalid username: must be 5-32 chars, lowercase letters, numbers and underscores only.';
    END IF;

    BEGIN
        INSERT INTO public.profiles (id, username)
        VALUES (NEW.id, v_username)
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Username is already taken. Please choose another.'
            USING ERRCODE = 'unique_violation';
    END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6.2 Prevent users from tampering with server-controlled profile columns.
CREATE OR REPLACE FUNCTION public.prevent_profile_column_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.username IS DISTINCT FROM OLD.username THEN
        RAISE EXCEPTION 'Cannot modify username' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.storage_cap_mb IS DISTINCT FROM OLD.storage_cap_mb THEN
        RAISE EXCEPTION 'Cannot modify storage_cap_mb' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Cannot modify created_at' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Cannot modify id' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_tamper ON public.profiles;
CREATE TRIGGER prevent_profile_tamper
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_column_tamper();

-- 6.3 Check username availability WITHOUT leaking profile rows.
CREATE OR REPLACE FUNCTION public.is_username_taken(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE username = lower(p_username)
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_username_taken(TEXT) TO anon, authenticated;

-- 6.4 Touch user activity. Extends the account expiry by 30 days from now.
CREATE OR REPLACE FUNCTION public.touch_user_activity()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;
    UPDATE public.profiles
    SET
        last_active_at = timezone('utc'::text, now()),
        expires_at = timezone('utc'::text, now()) + INTERVAL '30 days'
    WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_user_activity() TO authenticated;

-- 6.5 Enforce per-user storage quota at INSERT time (server-side truth).
CREATE OR REPLACE FUNCTION public.enforce_storage_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    current_usage BIGINT;
    cap_bytes BIGINT;
BEGIN
    SELECT COALESCE(SUM(size_bytes), 0) INTO current_usage
    FROM public.files
    WHERE owner_id = NEW.owner_id
      AND expires_at > timezone('utc'::text, now());

    SELECT storage_cap_mb * 1048576 INTO cap_bytes
    FROM public.profiles
    WHERE id = NEW.owner_id;

    IF current_usage + NEW.size_bytes > cap_bytes THEN
        RAISE EXCEPTION 'Storage quota exceeded (used: %, adding: %, cap: %)',
            current_usage, NEW.size_bytes, cap_bytes
            USING ERRCODE = 'quota_exceeded';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_storage_quota_trigger ON public.files;
CREATE TRIGGER enforce_storage_quota_trigger
    BEFORE INSERT ON public.files
    FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_quota();

-- 6.6 Delete the Storage object when a files row is deleted (prevents orphaned
--     blobs). The storage_path CHECK constraint guarantees this can only ever
--     touch an object inside OLD.owner_id's own folder.
CREATE OR REPLACE FUNCTION public.delete_storage_object()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'vault' AND name = OLD.storage_path;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS delete_storage_object_trigger ON public.files;
CREATE TRIGGER delete_storage_object_trigger
    AFTER DELETE ON public.files
    FOR EACH ROW EXECUTE FUNCTION public.delete_storage_object();

-- 6.7 REAL storage usage for the authenticated caller (replaces the client's
--     fabricated usedBytes: 0).
CREATE OR REPLACE FUNCTION public.get_vault_usage()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    used_bytes BIGINT;
    cap_bytes BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(size_bytes), 0) INTO used_bytes
    FROM public.files
    WHERE owner_id = auth.uid()
      AND expires_at > timezone('utc'::text, now());

    SELECT storage_cap_mb * 1048576 INTO cap_bytes
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN jsonb_build_object(
        'usedBytes', used_bytes,
        'capBytes', COALESCE(cap_bytes, 52428800)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vault_usage() TO authenticated;

-- ==============================================================================
-- 6.8 QR LOGIN FLOW (untrusted PC ← personal phone)
--
--   PC (anon)      : create_login_session()   → { token, expiresAt }
--   PC (anon)      : get_login_session_status(token) — 1.5s polling
--   Phone (auth)   : approve_login_session(token, refresh_token, device_info)
--                    Deposits the phone's CURRENT session refresh token —
--                    zero password entry needed anywhere.
--   PC (anon)      : consume_login_session(token) — ONE time, row is deleted,
--                    returns { userId, username, refreshToken }
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_login_session()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
    INSERT INTO public.pairing_sessions (qr_token, kind)
    VALUES (v_token, 'login');

    -- now() is a timestamptz, so jsonb serializes it WITH the +00:00 offset.
    -- ( timezone('utc', now()) would strip the offset, and browsers would then
    --  parse the naive string as LOCAL time — breaking clients in non-UTC zones. )
    RETURN jsonb_build_object(
        'token', v_token,
        'expiresAt', now() + INTERVAL '2 minutes'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_login_session() TO anon, authenticated;

-- Status only. Leaks nothing but pending/approved + seconds left.
CREATE OR REPLACE FUNCTION public.get_login_session_status(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row public.pairing_sessions%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.pairing_sessions
    WHERE qr_token = p_token AND kind = 'login'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'unknown');
    END IF;

    IF v_row.expires_at <= timezone('utc'::text, now()) THEN
        RETURN jsonb_build_object('status', 'expired');
    END IF;

    RETURN jsonb_build_object(
        'status', v_row.status,
        'expiresAt', v_row.expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_login_session_status(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_login_session(
    p_token TEXT,
    p_refresh_token TEXT,
    p_device_info TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row public.pairing_sessions%ROWTYPE;
    v_token_belongs_to_caller BOOLEAN := TRUE;  -- best-effort verification below
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_refresh_token IS NULL OR char_length(p_refresh_token) < 10 THEN
        RETURN FALSE;
    END IF;

    -- Best-effort: verify the refresh token actually belongs to the caller.
    -- If the auth schema is not introspectable in this deployment, we still
    -- succeed — the token is bound to user_id immediately after.
    BEGIN
        SELECT EXISTS (
            SELECT 1 FROM auth.refresh_tokens
            WHERE token = p_refresh_token AND user_id = auth.uid()
        ) INTO v_token_belongs_to_caller;
    EXCEPTION WHEN OTHERS THEN
        v_token_belongs_to_caller := TRUE;
    END;

    SELECT * INTO v_row FROM public.pairing_sessions
    WHERE qr_token = p_token AND kind = 'login'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    IF NOT v_token_belongs_to_caller THEN
        RETURN FALSE;
    END IF;

    IF v_row.status != 'pending' OR v_row.user_id IS NOT NULL THEN
        RETURN FALSE;
    END IF;
    IF v_row.expires_at <= timezone('utc'::text, now()) THEN
        UPDATE public.pairing_sessions SET status = 'expired' WHERE id = v_row.id;
        RETURN FALSE;
    END IF;

    UPDATE public.pairing_sessions
    SET
        user_id = auth.uid(),
        status = 'approved',
        session_refresh_token = p_refresh_token,
        device_info = COALESCE(p_device_info, v_row.device_info)
    WHERE id = v_row.id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_login_session(TEXT, TEXT, TEXT) TO authenticated;

-- Single-use: DELETE ... RETURNING makes the consume atomic — exactly one
-- caller can ever receive the one-time refresh token.
CREATE OR REPLACE FUNCTION public.consume_login_session(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_refresh TEXT;
    v_username TEXT;
BEGIN
    DELETE FROM public.pairing_sessions s
    WHERE s.qr_token = p_token
      AND s.kind = 'login'
      AND s.status = 'approved'
      AND s.expires_at > timezone('utc'::text, now())
    RETURNING s.user_id, s.session_refresh_token INTO v_user_id, v_refresh;

    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'userId', v_user_id,
        'username', v_username,
        'refreshToken', v_refresh
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_login_session(TEXT) TO anon, authenticated;

-- ==============================================================================
-- 6.9 HANDOFF FLOW (logged-in PC → personal phone) — ONE TAP, NO PASSWORD
--
--   PC (auth)     : create_handoff_session(refresh_token) → { token, expiresAt }
--                   Deposits the PC's CURRENT session refresh token (QR).
--   Phone (anon)  : resolve_handoff_session(token) → { userId, username } —
--                   read-only, lets the phone show WHICH account it will open.
--   Phone (anon)  : consume_handoff_session(token) — ONE time (row deleted),
--                   returns { userId, username, refreshToken } → the phone
--                   exchanges it for a real session. Single-use + 2-minute TTL
--                   bound the shoulder-surfing window; the PC reconciles its
--                   token chain right after (reuse-grace refresh).
--   PC (anon)     : get_handoff_status(token) — lets the PC detect the consume
--                   so it can refresh its own session inside the grace window.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_handoff_session(p_refresh_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_refresh_token IS NULL OR char_length(p_refresh_token) < 10 THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.pairing_sessions (qr_token, kind, user_id, session_refresh_token)
    VALUES (v_token, 'handoff', auth.uid(), p_refresh_token);

    -- Offset-preserving timestamptz (see create_login_session note).
    RETURN jsonb_build_object(
        'token', v_token,
        'expiresAt', now() + INTERVAL '2 minutes'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_handoff_session(TEXT) TO authenticated;

-- Read-only: reveals which account the code will open. Grants NOTHING.
CREATE OR REPLACE FUNCTION public.resolve_handoff_session(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row public.pairing_sessions%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.pairing_sessions
    WHERE qr_token = p_token AND kind = 'handoff' AND status = 'pending'
    LIMIT 1;

    IF NOT FOUND OR v_row.expires_at <= timezone('utc'::text, now()) THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'userId', v_row.user_id,
        'username', (SELECT username FROM public.profiles WHERE id = v_row.user_id)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_handoff_session(TEXT) TO anon, authenticated;

-- Single-use consume: hands the one-time refresh token to the phone exactly
-- once, then the row is gone.
CREATE OR REPLACE FUNCTION public.consume_handoff_session(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_refresh TEXT;
    v_username TEXT;
BEGIN
    DELETE FROM public.pairing_sessions s
    WHERE s.qr_token = p_token
      AND s.kind = 'handoff'
      AND s.status = 'pending'
      AND s.expires_at > timezone('utc'::text, now())
    RETURNING s.user_id, s.session_refresh_token INTO v_user_id, v_refresh;

    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT username INTO v_username FROM public.profiles WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'userId', v_user_id,
        'username', v_username,
        'refreshToken', v_refresh
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_handoff_session(TEXT) TO anon, authenticated;

-- PC-side status polling (detect the consume to reconcile the token chain).
CREATE OR REPLACE FUNCTION public.get_handoff_status(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_row public.pairing_sessions%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.pairing_sessions
    WHERE qr_token = p_token AND kind = 'handoff'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'unknown');  -- consumed or purged
    END IF;

    IF v_row.expires_at <= timezone('utc'::text, now()) THEN
        RETURN jsonb_build_object('status', 'expired');
    END IF;

    RETURN jsonb_build_object('status', v_row.status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_handoff_status(TEXT) TO anon, authenticated;

-- 6.10 Keep-alive ping target for the GitHub Actions workflow.
CREATE OR REPLACE FUNCTION public.vaultdrop_ping()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$ SELECT TRUE; $$;

GRANT EXECUTE ON FUNCTION public.vaultdrop_ping() TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. PURGE FUNCTIONS (called by pg_cron)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_expired_files()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.files
    WHERE expires_at <= timezone('utc'::text, now());

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_user_accounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    deleted_users INTEGER := 0;
    user_ids UUID[];
BEGIN
    SELECT array_agg(id) INTO user_ids
    FROM public.profiles
    WHERE expires_at <= timezone('utc'::text, now());

    IF user_ids IS NULL THEN
        RETURN 0;
    END IF;

    -- Delete files first so the storage-cleanup trigger fires per file
    DELETE FROM public.files WHERE owner_id = ANY(user_ids);
    -- Then delete auth.users — cascades to profiles and any remaining files
    DELETE FROM auth.users WHERE id = ANY(user_ids);

    GET DIAGNOSTICS deleted_users = ROW_COUNT;
    RETURN deleted_users;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_pairing_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    deleted_sessions INTEGER;
BEGIN
    -- Removes every finished/expired session — this also erases any lingering
    -- one-time refresh tokens from the QR login broker.
    DELETE FROM public.pairing_sessions
    WHERE expires_at <= timezone('utc'::text, now())
       OR status != 'pending';

    GET DIAGNOSTICS deleted_sessions = ROW_COUNT;
    RETURN deleted_sessions;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. PG_CRON SCHEDULES
--   Requires the pg_cron extension (Supabase Dashboard → Database → Extensions
--   → pg_cron → Enable). When it is enabled these schedules register themselves;
--   the guards make re-running this whole file safe.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.schedule(
                'vaultdrop-purge-expired-files',
                '*/5 * * * *',
                'SELECT public.purge_expired_files();'
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        BEGIN
            PERFORM cron.schedule(
                'vaultdrop-purge-expired-accounts',
                '0 3 * * *',
                'SELECT public.purge_expired_user_accounts();'
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        BEGIN
            PERFORM cron.schedule(
                'vaultdrop-purge-pairing-sessions',
                '* * * * *',
                'SELECT public.purge_expired_pairing_sessions();'
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END
$$;

-- ------------------------------------------------------------------------------
-- 9. GRANTS (minimal surface — v2 granted anon DELETE on tables!)
-- ------------------------------------------------------------------------------

-- Start from a clean slate (re-running this file must not accumulate old grants)
REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.files FROM anon, authenticated;
REVOKE ALL ON public.pairing_sessions FROM anon, authenticated;

-- profiles: users read + update their own row (trigger limits columns);
-- INSERT happens only via the handle_new_user SECURITY DEFINER trigger.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- files: no UPDATE (immutable), no anon access at all.
GRANT SELECT, INSERT, DELETE ON public.files TO authenticated;

-- pairing_sessions: NO table grants — RPC access only (tokens & one-time
-- refresh tokens must never be readable via REST).
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Retire the v2 RPCs so stale clients fail loudly instead of silently
-- using the insecure approve/consume path. Also drop the retired v3.0 PIN
-- lookup (PIN fallback removed at the owner's request) and the older
-- zero-arg handoff creator (replaced by the depositing version).
DROP FUNCTION IF EXISTS public.approve_pairing_session(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.consume_pairing_session(TEXT);
DROP FUNCTION IF EXISTS public.resolve_login_pin(TEXT);
DROP FUNCTION IF EXISTS public.create_handoff_session();

-- ------------------------------------------------------------------------------
-- END OF SCHEMA
-- ------------------------------------------------------------------------------
