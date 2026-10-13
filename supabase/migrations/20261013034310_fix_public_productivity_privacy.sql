-- =============================================================================
-- EUSTACE MIGRATION: 20261013000000_fix_public_productivity_privacy.sql
-- Purpose:
--   1. Align `public.profiles.visibility` column default to `'public'` (without
--      mutating existing `visibility` values or constraints) and safely ensure
--      `public.profiles.activity_visibility` exists with a `'public'` default
--      and validated check constraint (`'private'`, `'friends'`, `'public'`).
--   2. Replace `public.get_public_productivity(target_user_id UUID, target_year INT)`
--      in-place (preserving exact signature and `jsonb` return type) with a
--      visibility-aware, sargable implementation that returns only minimal
--      aggregated daily completion counts and manual-completion dates.
--   3. Revoke default `PUBLIC` execution and explicitly grant `EXECUTE` to
--      `anon`, `authenticated`, and `service_role`.
-- =============================================================================

-- 1. Align `profiles.visibility` default and ensure `profiles.activity_visibility` exists
ALTER TABLE public.profiles ALTER COLUMN visibility SET DEFAULT 'public';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activity_visibility text DEFAULT 'public';

ALTER TABLE public.profiles
  ALTER COLUMN activity_visibility SET DEFAULT 'public';

UPDATE public.profiles
SET activity_visibility = 'public'
WHERE activity_visibility IS NULL;

DO $$
DECLARE
  v_has_valid_constraint boolean := false;
  v_con record;
  v_def text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE activity_visibility IS NOT NULL
      AND activity_visibility NOT IN ('private', 'friends', 'public')
  ) THEN
    RAISE EXCEPTION
      'Existing public.profiles rows contain unexpected activity_visibility values outside (private, friends, public).';
  END IF;

  FOR v_con IN
    SELECT c.oid, c.conname, pg_catalog.pg_get_constraintdef(c.oid) AS condef
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_catalog.pg_attribute a
      ON a.attrelid = t.oid
     AND a.attname = 'activity_visibility'
     AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.contype = 'c'
      AND (
        (a.attnum IS NOT NULL AND a.attnum = ANY(c.conkey))
        OR pg_catalog.pg_get_constraintdef(c.oid) ILIKE '%activity_visibility%'
      )
  LOOP
    v_def := lower(regexp_replace(v_con.condef, '\s+', ' ', 'g'));

    IF v_def IN (
      'check ((activity_visibility = any (array[''private''::text, ''friends''::text, ''public''::text])))',
      'check (activity_visibility = any (array[''private''::text, ''friends''::text, ''public''::text]))',
      'check ((activity_visibility in (''private'', ''friends'', ''public'')))',
      'check (activity_visibility in (''private'', ''friends'', ''public''))'
    ) THEN
      v_has_valid_constraint := true;
    ELSE
      RAISE EXCEPTION
        'Unexpected CHECK constraint "%" on public.profiles.activity_visibility: %',
        v_con.conname, v_con.condef;
    END IF;
  END LOOP;

  IF NOT v_has_valid_constraint THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_activity_visibility_check
      CHECK (activity_visibility IN ('private', 'friends', 'public'));
  END IF;
END $$;

-- 2. Replace `public.get_public_productivity` with hardened, visibility-aware implementation
CREATE OR REPLACE FUNCTION public.get_public_productivity(target_user_id UUID, target_year INT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_visibility text;
  v_activity_visibility text;
  v_is_friend boolean := false;
  v_is_self boolean := false;
  v_start_date date;
  v_end_date date;
  v_completions jsonb;
  v_daily_data jsonb;
BEGIN
  IF target_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  SELECT
    COALESCE(p.visibility, 'public'),
    COALESCE(p.activity_visibility, 'public')
  INTO v_visibility, v_activity_visibility
  FROM public.profiles p
  WHERE p.id = target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  v_is_self := (v_caller_id IS NOT NULL AND v_caller_id = target_user_id);

  IF NOT v_is_self THEN
    IF v_caller_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.requester_id = v_caller_id AND f.addressee_id = target_user_id)
            OR (f.requester_id = target_user_id AND f.addressee_id = v_caller_id)
          )
      ) INTO v_is_friend;
    END IF;

    IF v_visibility = 'private' OR v_activity_visibility = 'private' THEN
      RETURN jsonb_build_object('error', 'private');
    END IF;

    IF (v_visibility = 'friends' OR v_activity_visibility = 'friends') AND NOT v_is_friend THEN
      RETURN jsonb_build_object('error', 'friends_only');
    END IF;
  END IF;

  IF target_year IS NULL OR target_year < 1900 OR target_year > 2100 THEN
    RETURN jsonb_build_object(
      'completions', '[]'::jsonb,
      'daily_data', '[]'::jsonb
    );
  END IF;

  v_start_date := make_date(target_year, 1, 1);
  v_end_date := make_date(target_year, 12, 31);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', tc.completed_date,
    'count', tc.cnt
  ) ORDER BY tc.completed_date), '[]'::jsonb)
  INTO v_completions
  FROM (
    SELECT completed_date, COUNT(*)::int AS cnt
    FROM public.task_completions
    WHERE user_id = target_user_id
      AND completed_date >= v_start_date
      AND completed_date <= v_end_date
    GROUP BY completed_date
  ) tc;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', d.date,
    'manual_completion', d.manual_completion
  ) ORDER BY d.date), '[]'::jsonb)
  INTO v_daily_data
  FROM public.daily_data d
  WHERE d.user_id = target_user_id
    AND d.date >= v_start_date
    AND d.date <= v_end_date
    AND d.manual_completion IS TRUE;

  RETURN jsonb_build_object(
    'completions', v_completions,
    'daily_data', v_daily_data
  );
END;
$$;

-- 3. Set explicit function execution privileges
REVOKE ALL ON FUNCTION public.get_public_productivity(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_productivity(UUID, INT) TO anon, authenticated, service_role;
