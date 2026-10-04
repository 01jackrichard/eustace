-- FRIENDS_FINAL_FIX.sql
-- 
-- WHAT WAS BROKEN:
-- 1. search_users_by_username explicitly excluded 'private' profiles, so they were completely undiscoverable via search.
-- 2. is_connected_to_user mistakenly checked receiver_id (an obsolete column name) instead of addressee_id, causing connection checks to always fail.
-- 3. /u/:username requests to private profiles were blocked entirely by RLS (0 rows returned), causing a false "User Not Found" error instead of a graceful "Private Profile" state.
-- 4. get_friend_profiles from a previous attempt was missing or flawed, preventing incoming requests from resolving the requester's basic profile.
--
-- WHAT THIS FIXES:
-- 1. Corrects `is_connected_to_user` to use `addressee_id`.
-- 2. Modifies `search_users_by_username` to return basic identity fields for ALL users, bypassing visibility restrictions so exact/partial usernames are discoverable.
-- 3. Adds `get_profile_by_username` RPC to fetch profiles safely. It returns basic identity for all users, but returns NULL for sensitive fields (bio, cover_image) if the user is private and not connected.
-- 4. Replaces/ensures `get_friend_profiles` exists for pending friend request cards.

-- 1. Fix is_connected_to_user
CREATE OR REPLACE FUNCTION public.is_connected_to_user(target_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.friendships 
    WHERE (requester_id = auth.uid() AND addressee_id = target_id) 
       OR (addressee_id = auth.uid() AND requester_id = target_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Fix search_users_by_username (Remove visibility != 'private' limitation)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Securely fetch profile for /u/:username without exposing protected fields
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
    -- Protect bio and cover_image if private and not connected
    CASE WHEN p.visibility = 'public' OR p.id = auth.uid() OR public.is_connected_to_user(p.id) THEN p.bio ELSE NULL END,
    p.avatar_url, 
    CASE WHEN p.visibility = 'public' OR p.id = auth.uid() OR public.is_connected_to_user(p.id) THEN p.cover_image_url ELSE NULL END,
    p.visibility
  FROM public.profiles p
  WHERE p.username ILIKE target_username
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Securely fetch minimal profiles for users in a friendship row
CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])
RETURNS TABLE (
  id uuid, username text, display_name text,
  full_name text, avatar_url text, bio text
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.bio
  FROM public.profiles p
  WHERE p.id = ANY(user_ids)
    AND (
      p.id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE (f.requester_id = auth.uid() AND f.addressee_id = p.id)
           OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
