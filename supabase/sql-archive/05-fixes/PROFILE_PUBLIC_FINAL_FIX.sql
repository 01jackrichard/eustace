-- PROFILE_PUBLIC_FINAL_FIX.sql
--
-- WHAT THIS DOES:
-- 1. Updates all existing profiles to have visibility = 'public'.
-- 2. Modifies the RLS SELECT policy on `public.profiles` so any authenticated user can read profile rows.
-- 3. Simplifies `get_profile_by_username` to unconditionally return all profile fields since privacy modes are removed.
-- 4. Retains `get_friend_profiles` and `search_users_by_username` but ensures they don't filter or obscure data based on visibility.
--
-- Note: This only makes the profile (name, bio, avatar, banner) public. Private tasks and notes remain protected by their respective RLS policies.

-- 1. Normalize existing visibility values
UPDATE public.profiles
SET visibility = 'public';

-- 2. Fix Profiles RLS correctly
-- Drop all existing conflicting SELECT policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Friends can view friends profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view public or connected profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by all authenticated users." ON public.profiles;

-- Create the single, clear SELECT policy for profiles
CREATE POLICY "Profiles are viewable by all authenticated users."
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- 3. Simplify get_profile_by_username
-- Now it simply returns the profile fields since everything is public.
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
) AS $$
BEGIN
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
  WHERE p.username ILIKE target_username
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.get_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO authenticated;

-- 4. Simplify search_users_by_username
-- No visibility filtering is needed anymore.
CREATE OR REPLACE FUNCTION public.search_users_by_username(search_query text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  full_name text,
  avatar_url text,
  visibility text
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.visibility
  FROM public.profiles p
  WHERE p.username ILIKE search_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.search_users_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users_by_username(text) TO authenticated;

-- 5. Ensure get_friend_profiles still works cleanly (though now redundant with the new RLS, keeping it prevents breaking frontend hooks)
CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])
RETURNS TABLE (
  id uuid, username text, display_name text,
  full_name text, avatar_url text, bio text
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.bio
  FROM public.profiles p
  WHERE p.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.get_friend_profiles(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friend_profiles(uuid[]) TO authenticated;
