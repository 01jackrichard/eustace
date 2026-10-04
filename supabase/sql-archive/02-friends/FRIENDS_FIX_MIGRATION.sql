-- FRIENDS FIX MIGRATION
-- This safely updates the RLS policies and adds necessary secure helpers for the Friends system.

-- 1. Secure helper to check if a user is connected (pending or accepted) to the current user
-- This avoids recursive RLS policy issues.
CREATE OR REPLACE FUNCTION public.is_connected_to_user(target_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.friendships 
    WHERE (requester_id = auth.uid() AND receiver_id = target_id) 
       OR (receiver_id = auth.uid() AND requester_id = target_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update profiles SELECT policy to allow viewing profiles of connected users
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Friends can view friends profiles" ON public.profiles;

CREATE POLICY "Users can view public or connected profiles" ON public.profiles FOR SELECT USING (
  visibility = 'public' OR 
  auth.uid() = id OR
  public.is_connected_to_user(id)
);

-- 3. Secure helper for searching users by username
-- This allows searching for users without exposing private profiles, bypassing the restrictive SELECT policy.
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
  WHERE p.username ILIKE search_query
  AND p.visibility != 'private';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
