-- =============================================================================
-- EUSTACE MIGRATION: 20261013123000_harden_calculate_user_streak_privacy.sql
-- Purpose:
--   1. Harden `public.calculate_user_streak(target_user_id uuid)` so it
--      requires an authenticated caller (`auth.uid()`) who is either the
--      target user themselves or an `accepted` friend of the target user in
--      `public.friendships`.
--   2. Return `0` for unauthenticated callers, missing target profiles, or
--      unauthorized callers (strangers, pending/declined/cancelled requests)
--      without revealing the target user's streak.
--   3. Preserve the exact function signature (`target_user_id uuid`), `int`
--      return type, `STABLE SECURITY DEFINER`, `SET search_path = ''`,
--      schema-qualified references, and existing streak calculation body.
--   4. Explicitly revoke execution from `PUBLIC` and `anon`, and grant
--      `EXECUTE` only to `authenticated`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_user_streak(target_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_streak int := 0;
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
  WHERE streak_end >= CURRENT_DATE - 1
  ORDER BY streak_end DESC
  LIMIT 1;

  RETURN COALESCE(v_streak, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_user_streak(uuid) TO authenticated;
