-- =============================================================================
-- EUSTACE MIGRATION: 20261013130000_enforce_profile_visibility_rls_and_rpc.sql
-- Purpose:
--   1. Remove the blanket authenticated `SELECT` policy on `public.profiles`
--      (`"Profiles are viewable by all authenticated users."` with `USING (true)`)
--      and any legacy `SELECT` policy aliases without touching `INSERT` or
--      `UPDATE` ownership policies (`profiles_insert_own`, `profiles_update_own`,
--      `profiles_insert_policy`, `profiles_update_policy`).
--   2. Create a narrowly scoped `SELECT` policy (`profiles_select_policy`) on
--      `public.profiles` for `authenticated` users that permits:
--        - Users to read their own profile (`auth.uid() = id`),
--        - Authenticated users to read profiles with `visibility = 'public'`,
--        - Accepted friends to read profiles with `visibility = 'friends'`,
--        - No direct row access to other users' `private` profiles or to
--          `friends`-only profiles across `pending`, `declined`, or `cancelled`
--          friend requests.
--   3. Replace `public.get_profile_by_username(target_username text)` in-place
--      (preserving its exact live parameter signature and 8-column `RETURNS TABLE`
--      shape) so that:
--        - `public` profiles remain accessible to `anon` and `authenticated`,
--        - `friends` profiles are accessible only to their owner or `accepted`
--          friends,
--        - `private` profiles are accessible only to their owner,
--        - `activity_visibility` remains independent of `visibility`.
-- =============================================================================

-- 1. Replace blanket SELECT policy on public.profiles (preserve INSERT/UPDATE policies)
DROP POLICY IF EXISTS "Profiles are viewable by all authenticated users." ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by all users" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR visibility = 'public'
  OR (
    visibility = 'friends'
    AND EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = auth.uid() AND f.addressee_id = public.profiles.id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = public.profiles.id)
        )
    )
  )
);

-- 2. Enforce profile visibility in public.get_profile_by_username(target_username text)
DROP FUNCTION IF EXISTS public.get_profile_by_username(text);
CREATE OR REPLACE FUNCTION public.get_profile_by_username(target_username text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  full_name text,
  bio text,
  avatar_url text,
  cover_image_url text,
  visibility text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_clean_username text := lower(trim(COALESCE(target_username, '')));
BEGIN
  IF v_clean_username = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.full_name,
    p.bio,
    p.avatar_url,
    p.cover_image_url,
    p.visibility
  FROM public.profiles p
  WHERE lower(p.username) = v_clean_username
    AND (
      p.visibility = 'public'
      OR (v_caller_id IS NOT NULL AND p.id = v_caller_id)
      OR (
        v_caller_id IS NOT NULL
        AND p.visibility = 'friends'
        AND EXISTS (
          SELECT 1
          FROM public.friendships f
          WHERE f.status = 'accepted'
            AND (
              (f.requester_id = v_caller_id AND f.addressee_id = p.id)
              OR (f.addressee_id = v_caller_id AND f.requester_id = p.id)
            )
        )
      )
    )
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO anon, authenticated, service_role;
