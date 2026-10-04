-- FRIENDS PROFILES FIX
-- Fixes two issues introduced by FRIENDS_FIX_MIGRATION.sql:
-- 1. is_connected_to_user used wrong column (receiver_id → addressee_id)
-- 2. Adds a SECURITY DEFINER RPC to safely fetch profiles of friendship participants
--    regardless of their profile visibility setting.

-- ── Fix 1: Correct is_connected_to_user (column was receiver_id, now addressee_id) ──
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

-- ── Fix 2: New RPC to fetch profiles of users in a friendship with the caller ──
-- This bypasses visibility RLS for participants of a friendship row.
-- A pending request MUST show the requester's name/avatar to the recipient.
CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  full_name text,
  avatar_url text,
  bio text
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
