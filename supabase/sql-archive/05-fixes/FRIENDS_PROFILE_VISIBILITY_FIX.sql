-- FRIENDS_PROFILE_VISIBILITY_FIX.sql
-- 
-- WHAT WAS BROKEN:
-- 1. search_users_by_username explicitly excluded 'private' profiles, preventing discovery.
-- 2. is_connected_to_user checked receiver_id (an obsolete column) instead of addressee_id, causing connection checks to always fail.
-- 3. /u/:username requests to private profiles were blocked entirely by RLS (0 rows returned), causing a false "User Not Found" error instead of a graceful "Private Profile" state.
-- 4. Pending incoming friend requests showed as (unknown) because RLS blocked retrieving the requester's basic info.
--
-- FIX ARCHITECTURE:
-- We fix the access model at the database layer using SECURITY DEFINER RPCs for discovery and minimal safe profile retrieval, bypassing visibility-based RLS blocks, while strictly enforcing visibility within the RPCs themselves to protect sensitive fields (bio, cover_image).

-- 1. Fix is_connected_to_user to use addressee_id
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

-- 2. Allow discovering any user by username (Remove visibility != 'private' limitation)
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
-- This ensures the UI gets the basic identity and visibility state instead of 0 rows (USER NOT FOUND).
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
