-- =============================================================================
-- EUSTACE MIGRATION: 20261014193000_production_hardening_and_schema_reconciliation.sql
-- Purpose:
--   1. Harden `public.calculate_user_streak` with true user timezone awareness:
--      Derives user's local calendar day from `profiles.timezone` rather than
--      relying on database server UTC `CURRENT_DATE`, preventing streak lapsing
--      for non-UTC users.
--   2. Harden `public.delete_user_account(p_password text DEFAULT NULL)`:
--      Enforces server-side password verification for email/password accounts
--      prior to cascading account and storage deletion.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Timezone-Aware calculate_user_streak RPC
CREATE OR REPLACE FUNCTION public.calculate_user_streak(target_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_streak int := 0;
  v_user_tz text;
  v_today date;
BEGIN
  IF v_caller_id IS NULL OR target_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = target_user_id
  ) THEN
    RETURN 0;
  END IF;

  -- Security: caller must be target user or accepted friend
  IF v_caller_id != target_user_id AND NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = v_caller_id AND f.addressee_id = target_user_id)
        OR (f.addressee_id = v_caller_id AND f.requester_id = target_user_id)
      )
  ) THEN
    RETURN 0;
  END IF;

  -- Resolve user's timezone; fallback to UTC if null or invalid
  SELECT COALESCE(NULLIF(p.timezone, ''), 'UTC') INTO v_user_tz
  FROM public.profiles p
  WHERE p.id = target_user_id;

  BEGIN
    v_today := (timezone(v_user_tz, now()))::date;
  EXCEPTION WHEN OTHERS THEN
    v_today := (timezone('UTC', now()))::date;
  END;

  WITH user_active_dates AS (
    SELECT DISTINCT completed_date AS active_date
    FROM public.task_completions
    WHERE user_id = target_user_id
    UNION
    SELECT DISTINCT date AS active_date
    FROM public.daily_data
    WHERE user_id = target_user_id AND manual_completion = true
    UNION
    SELECT (generate_series(
      (streak_credit_date - (streak_credit_value - 1))::timestamp, 
      streak_credit_date::timestamp, 
      '1 day'::interval
    ))::date AS active_date
    FROM public.user_stats
    WHERE user_id = target_user_id AND streak_credit_value > 0 AND streak_credit_date IS NOT NULL
  ),
  ordered_dates AS (
    SELECT 
      active_date,
      active_date - (ROW_NUMBER() OVER (ORDER BY active_date))::int AS grp
    FROM user_active_dates
  ),
  streaks AS (
    SELECT 
      grp,
      COUNT(*)::int AS streak_length,
      MAX(active_date) AS streak_end
    FROM ordered_dates
    GROUP BY grp
  )
  SELECT streak_length
  INTO v_streak
  FROM streaks
  WHERE streak_end >= v_today - 1
  ORDER BY streak_end DESC
  LIMIT 1;

  RETURN COALESCE(v_streak, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_user_streak(uuid) TO authenticated;

-- 2. Server-side password verified delete_user_account RPC
CREATE OR REPLACE FUNCTION public.delete_user_account(p_password text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_encrypted_pwd text;
  v_provider text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Retrieve provider and encrypted password
  SELECT encrypted_password, raw_app_meta_data->>'provider'
  INTO v_encrypted_pwd, v_provider
  FROM auth.users
  WHERE id = v_user_id;

  -- If user account is email/password based with an encrypted password set
  IF v_encrypted_pwd IS NOT NULL AND v_encrypted_pwd <> '' AND COALESCE(v_provider, 'email') = 'email' THEN
    IF p_password IS NULL OR trim(p_password) = '' THEN
      RAISE EXCEPTION 'Password verification required to delete account';
    END IF;

    IF crypt(trim(p_password), v_encrypted_pwd) <> v_encrypted_pwd THEN
      RAISE EXCEPTION 'Incorrect password. Account deletion unauthorized.';
    END IF;
  END IF;

  -- 1. Remove user avatars and covers from storage
  DELETE FROM storage.objects 
  WHERE bucket_id IN ('profile-images', 'profile-covers')
    AND (
      owner = v_user_id
      OR (storage.foldername(name))[1] = v_user_id::text
      OR name LIKE (v_user_id::text || '-%')
      OR name LIKE (v_user_id::text || '/%')
    );

  -- 2. Remove user image attachments from private message-images bucket
  DELETE FROM storage.objects
  WHERE bucket_id = 'message-images'
    AND (
      owner = v_user_id
      OR (storage.foldername(name))[1] = v_user_id::text
      OR name IN (
        SELECT m.image_path
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE (c.user1_id = v_user_id OR c.user2_id = v_user_id)
          AND m.image_path IS NOT NULL
      )
    );

  -- 3. Delete from auth.users (cascades via ON DELETE CASCADE to all user records)
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account(text) TO authenticated, service_role;
