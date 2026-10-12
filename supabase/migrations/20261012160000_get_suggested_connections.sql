-- ==============================================================================
-- MIGRATION: 20261012160000_get_suggested_connections.sql
-- PURPOSE:
-- 1. Provide a secure SECURITY DEFINER RPC to discover eligible connections and
--    calculate authentic mutual-friend counts between the authenticated user
--    and candidates without exposing third-party friendship rows under client RLS.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_suggested_connections(p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  full_name text,
  avatar_url text,
  bio text,
  cover_image_url text,
  mutual_count bigint
) AS $$
DECLARE
  v_current_user uuid;
BEGIN
  v_current_user := auth.uid();
  IF v_current_user IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH user_friends AS (
    -- All accepted friends of the current authenticated user
    SELECT CASE 
             WHEN f.requester_id = v_current_user THEN f.addressee_id 
             ELSE f.requester_id 
           END AS friend_id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = v_current_user OR f.addressee_id = v_current_user)
  ),
  excluded_users AS (
    -- Current user themselves + any user with an existing relationship (pending, accepted, etc.)
    SELECT v_current_user AS user_id
    UNION
    SELECT CASE 
             WHEN f.requester_id = v_current_user THEN f.addressee_id 
             ELSE f.requester_id 
           END AS user_id
    FROM public.friendships f
    WHERE (f.requester_id = v_current_user OR f.addressee_id = v_current_user)
      AND f.status IN ('pending', 'accepted')
  ),
  candidate_profiles AS (
    -- Public profiles not in excluded set
    SELECT 
      p.id,
      p.username,
      p.display_name,
      p.full_name,
      p.avatar_url,
      p.bio,
      p.cover_image_url
    FROM public.profiles p
    WHERE p.visibility = 'public'
      AND p.id NOT IN (SELECT e.user_id FROM excluded_users e)
      AND p.username IS NOT NULL
      AND trim(p.username) != ''
  ),
  candidates_with_mutuals AS (
    SELECT 
      cp.id,
      cp.username,
      cp.display_name,
      cp.full_name,
      cp.avatar_url,
      cp.bio,
      cp.cover_image_url,
      COUNT(DISTINCT uf.friend_id)::bigint AS mutual_count
    FROM candidate_profiles cp
    LEFT JOIN public.friendships f2 
      ON f2.status = 'accepted'
      AND (
        (f2.requester_id = cp.id AND f2.addressee_id IN (SELECT friend_id FROM user_friends))
        OR 
        (f2.addressee_id = cp.id AND f2.requester_id IN (SELECT friend_id FROM user_friends))
      )
    LEFT JOIN user_friends uf 
      ON uf.friend_id = CASE WHEN f2.requester_id = cp.id THEN f2.addressee_id ELSE f2.requester_id END
    GROUP BY cp.id, cp.username, cp.display_name, cp.full_name, cp.avatar_url, cp.bio, cp.cover_image_url
  )
  SELECT 
    cwm.id,
    cwm.username,
    cwm.display_name,
    cwm.full_name,
    cwm.avatar_url,
    cwm.bio,
    cwm.cover_image_url,
    cwm.mutual_count
  FROM candidates_with_mutuals cwm
  ORDER BY cwm.mutual_count DESC, cwm.username ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.get_suggested_connections(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_suggested_connections(int) TO authenticated;
