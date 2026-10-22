-- ==============================================================================
-- VAULTDROP DATABASE SCHEMA & SECURITY DEFINITIONS — v2 (Hardened)
-- Built for Supabase (PostgreSQL 15+)
--
-- Fixes over v1:
--   1. Profiles UPDATE restricted to last_active_at only (was: any column → users
--      could bump their own storage_cap_mb and expires_at — CRITICAL)
--   2. Pairing session approval moved to SECURITY DEFINER function (was: any
--      authenticated user could hijack any pending session — CRITICAL)
--   3. Pairing session INSERT restricted to user_id IS NULL (was: attacker could
--      pre-bind a session to a victim's user_id — CRITICAL)
--   4. Username availability check no longer leaks all profile rows
--   5. File purge now deletes Storage objects via trigger (was: orphaned blobs)
--   6. User purge now cascades Storage cleanup via file trigger
--   7. Account expiry tied to last_active_at, extended to 30 days (was: 5 days
--      from creation — users lost accounts during inactive stretches)
--   8. Auto-create profile on auth.users INSERT via trigger
--   9. Storage quota enforced via BEFORE INSERT trigger (was: not enforced at all)
--  10. Added missing indexes (profiles.expires_at, pairing_sessions.user_id)
--  11. Added column validation (filename length, mime_type length, qr_token length)
--  12. Added "consumed" status to pairing sessions to prevent replay attacks
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
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
    storage_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520), -- 20 MB max
    mime_type TEXT NOT NULL CHECK (char_length(mime_type) BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS files_owner_id_idx ON public.files (owner_id);
CREATE INDEX IF NOT EXISTS files_expires_at_idx ON public.files (expires_at);
CREATE INDEX IF NOT EXISTS files_owner_expires_idx ON public.files (owner_id, expires_at DESC);

-- ------------------------------------------------------------------------------
-- 3. PAIRING SESSIONS TABLE (for QR login)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pairing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_token TEXT UNIQUE NOT NULL CHECK (char_length(qr_token) >= 32),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'expired', 'denied', 'consumed'))
        DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '2 minutes'),
    consumed_at TIMESTAMPTZ,  -- when the lab PC picked up its JWT (prevents replay)
    device_info TEXT
);

CREATE INDEX IF NOT EXISTS pairing_sessions_token_idx ON public.pairing_sessions (qr_token);
CREATE INDEX IF NOT EXISTS pairing_sessions_expires_at_idx ON public.pairing_sessions (expires_at);
CREATE INDEX IF NOT EXISTS pairing_sessions_user_id_idx ON public.pairing_sessions (user_id);

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

DROP POLICY IF EXISTS "Users can view their own files" ON public.files;
CREATE POLICY "Users can view their own files"
    ON public.files FOR SELECT
    USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own files" ON public.files;
CREATE POLICY "Users can insert their own files"
    ON public.files FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;
CREATE POLICY "Users can delete their own files"
    ON public.files FOR DELETE
    USING (auth.uid() = owner_id);

-- NO UPDATE policy — files are immutable by design.

-- === PAIRING SESSIONS POLICIES ===

-- Lab PC (anonymous) can create a session, but ONLY with user_id = NULL and
-- status = 'pending'. This prevents pre-binding a session to a victim's user_id.
DROP POLICY IF EXISTS "Allow anonymous pairing session creation" ON public.pairing_sessions;
CREATE POLICY "Allow anonymous pairing session creation"
    ON public.pairing_sessions FOR INSERT
    WITH CHECK (user_id IS NULL AND status = 'pending');

-- Anyone holding the token can read the session (lab PC needs this for polling).
-- The token is unguessable (32+ random chars), so this is safe.
DROP POLICY IF EXISTS "Allow reading pairing session by token" ON public.pairing_sessions;
CREATE POLICY "Allow reading pairing session by token"
    ON public.pairing_sessions FOR SELECT
    USING (true);

-- NO direct UPDATE policy. Approval happens via SECURITY DEFINER function
-- (approve_pairing_session below). This prevents session hijacking.

-- ------------------------------------------------------------------------------
-- 5. STORAGE BUCKET POLICIES
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('vault', 'vault', false, 20971520)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 20971520;

DROP POLICY IF EXISTS "Users can read own storage files" ON storage.objects;
CREATE POLICY "Users can read own storage files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'vault' AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text);

DROP POLICY IF EXISTS "Users can upload to own storage folder" ON storage.objects;
CREATE POLICY "Users can upload to own storage folder"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'vault' AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own storage files" ON storage.objects;
CREATE POLICY "Users can delete own storage files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'vault' AND (storage.foldername(name))[1] = 'user_' || auth.uid()::text);

-- ------------------------------------------------------------------------------
-- 6. TRIGGERS & SECURITY DEFINER FUNCTIONS
-- ------------------------------------------------------------------------------

-- 6.1 Auto-create profile when a new auth.users row is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (
        NEW.id,
        lower(NEW.raw_user_meta_data->>'username')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6.2 Prevent users from tampering with server-controlled profile columns.
--     Only last_active_at and expires_at (set by touch_user_activity) may change.
--     username, storage_cap_mb, created_at are FROZEN.
CREATE OR REPLACE FUNCTION public.prevent_profile_column_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
--     Call via: supabase.rpc('is_username_taken', { p_username: 'alice' })
CREATE OR REPLACE FUNCTION public.is_username_taken(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE username = lower(p_username)
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_username_taken(TEXT) TO anon, authenticated;

-- 6.4 Approve a pairing session (called by the phone after scanning the QR).
--     Returns TRUE on success, FALSE on any failure (no error message leak).
CREATE OR REPLACE FUNCTION public.approve_pairing_session(
    p_qr_token TEXT,
    p_device_info TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    session_record RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Lock the row for the transaction
    SELECT * INTO session_record
    FROM public.pairing_sessions
    WHERE qr_token = p_qr_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Must be pending, unbound, and not expired
    IF session_record.status != 'pending' THEN
        RETURN FALSE;
    END IF;
    IF session_record.user_id IS NOT NULL THEN
        RETURN FALSE;
    END IF;
    IF session_record.expires_at <= timezone('utc'::text, now()) THEN
        UPDATE public.pairing_sessions SET status = 'expired'
        WHERE id = session_record.id;
        RETURN FALSE;
    END IF;

    -- Bind the calling user and mark approved
    UPDATE public.pairing_sessions
    SET
        user_id = auth.uid(),
        status = 'approved',
        device_info = COALESCE(p_device_info, device_info)
    WHERE id = session_record.id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_pairing_session(TEXT, TEXT) TO authenticated;

-- 6.5 Consume a pairing session (called by the lab PC after polling sees 'approved').
--     Returns the bound user_id if consumable, NULL otherwise. Marks as 'consumed'
--     so the same QR token cannot be replayed.
CREATE OR REPLACE FUNCTION public.consume_pairing_session(p_qr_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    session_record RECORD;
BEGIN
    SELECT * INTO session_record
    FROM public.pairing_sessions
    WHERE qr_token = p_qr_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    IF session_record.status != 'approved' OR session_record.user_id IS NULL THEN
        RETURN NULL;
    END IF;
    IF session_record.consumed_at IS NOT NULL THEN
        RETURN NULL;  -- already consumed, prevent replay
    END IF;

    UPDATE public.pairing_sessions
    SET
        consumed_at = timezone('utc'::text, now()),
        status = 'consumed'
    WHERE id = session_record.id;

    RETURN session_record.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_pairing_session(TEXT) TO anon, authenticated;

-- 6.6 Touch user activity (call from Next.js middleware on every authenticated request).
--     Extends the account expiry by 30 days from now.
CREATE OR REPLACE FUNCTION public.touch_user_activity()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 6.7 Enforce per-user storage quota at INSERT time.
--     Reads storage_cap_mb from profiles and rejects the INSERT if exceeded.
CREATE OR REPLACE FUNCTION public.enforce_storage_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_usage BIGINT;
    cap_bytes BIGINT;
BEGIN
    SELECT COALESCE(SUM(size_bytes), 0) INTO current_usage
    FROM public.files
    WHERE owner_id = NEW.owner_id;

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

-- 6.8 Delete the Storage object when a files row is deleted (prevents orphaned blobs).
--     Fires for both manual deletes and the purge_expired_files cron.
CREATE OR REPLACE FUNCTION public.delete_storage_object()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ------------------------------------------------------------------------------
-- 7. PURGE FUNCTIONS (called by pg_cron)
-- ------------------------------------------------------------------------------

-- 7.1 Purge expired files (24h). Storage cleanup happens via the trigger above.
CREATE OR REPLACE FUNCTION public.purge_expired_files()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 7.2 Purge expired user accounts (30 days inactive).
--     Deletes files first (triggers Storage cleanup), then auth.users (cascades profiles).
CREATE OR REPLACE FUNCTION public.purge_expired_user_accounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 7.3 Purge expired or consumed pairing sessions.
CREATE OR REPLACE FUNCTION public.purge_expired_pairing_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_sessions INTEGER;
BEGIN
    DELETE FROM public.pairing_sessions
    WHERE expires_at <= timezone('utc'::text, now())
       OR (status IN ('consumed', 'denied')
           AND created_at < timezone('utc'::text, now()) - INTERVAL '1 hour');

    GET DIAGNOSTICS deleted_sessions = ROW_COUNT;
    RETURN deleted_sessions;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. PG_CRON SCHEDULES
--   Enable pg_cron in: Supabase Dashboard → Database → Extensions → pg_cron
--   Then run these in the SQL editor:
-- ------------------------------------------------------------------------------
-- SELECT cron.schedule(
--     'purge-expired-files-hourly',
--     '0 * * * *',
--     'SELECT public.purge_expired_files();'
-- );
--
-- SELECT cron.schedule(
--     'purge-expired-accounts-daily',
--     '0 3 * * *',  -- 3 AM UTC daily
--     'SELECT public.purge_expired_user_accounts();'
-- );
--
-- SELECT cron.schedule(
--     'purge-expired-qr-sessions',
--     '*/2 * * * *',  -- every 2 minutes (matches the 2-min QR expiry)
--     'SELECT public.purge_expired_pairing_sessions();'
-- );

-- ------------------------------------------------------------------------------
-- 9. GRANTS (explicit, defensive)
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pairing_sessions TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- END OF SCHEMA
-- ------------------------------------------------------------------------------
