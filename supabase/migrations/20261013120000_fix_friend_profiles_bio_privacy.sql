-- =============================================================================
-- EUSTACE MIGRATION: 20261013120000_fix_friend_profiles_bio_privacy.sql
-- Purpose:
--   1. Remediate the `public.get_friend_profiles(uuid[])` biography disclosure
--      regression introduced in `20261010000000_dynamic_friend_streaks.sql`,
--      where `p.bio` was returned unmasked for `pending` friendship rows.
--   2. Preserve the exact function signature and `RETURNS TABLE` schema while
--      returning a profile's real `bio` only to the profile owner
--      (`p.id = auth.uid()`) or an `accepted` friend, and returning `''` for
--      `pending` or otherwise unaccepted relationships.
--   3. Preserve `SECURITY DEFINER`, `SET search_path = ''`, and fully
--      schema-qualified table and function references.
--   4. Explicitly revoke execution from `PUBLIC` and `anon`, and grant
--      `EXECUTE` only to `authenticated` and `service_role`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  full_name text,
  avatar_url text,
  bio text,
  current_streak int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL OR user_ids IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.full_name,
    p.avatar_url,
    CASE
      WHEN p.id = v_caller_id OR EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.requester_id = v_caller_id AND f.addressee_id = p.id)
            OR (f.addressee_id = v_caller_id AND f.requester_id = p.id)
          )
      ) THEN p.bio
      ELSE ''
    END AS bio,
    CASE
      WHEN p.id = v_caller_id OR EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.requester_id = v_caller_id AND f.addressee_id = p.id)
            OR (f.addressee_id = v_caller_id AND f.requester_id = p.id)
          )
      ) THEN COALESCE(public.calculate_user_streak(p.id), 0)
      ELSE 0
    END AS current_streak
  FROM public.profiles p
  WHERE p.id = ANY(user_ids)
    AND (
      p.id = v_caller_id
      OR EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE (f.status = 'accepted' OR f.status = 'pending')
          AND (
            (f.requester_id = v_caller_id AND f.addressee_id = p.id)
            OR (f.addressee_id = v_caller_id AND f.requester_id = p.id)
          )
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_profiles(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friend_profiles(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_friend_profiles(uuid[]) TO authenticated, service_role;
