CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])
RETURNS TABLE (
  id uuid, username text, display_name text,
  full_name text, avatar_url text, bio text, current_streak int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.bio,
    CASE 
      WHEN p.id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.friendships f 
        WHERE f.status = 'accepted' 
          AND ((f.requester_id = auth.uid() AND f.addressee_id = p.id) 
            OR (f.addressee_id = auth.uid() AND f.requester_id = p.id))
      ) THEN public.calculate_user_streak(p.id)
      ELSE 0
    END as current_streak
  FROM public.profiles p
  WHERE p.id = ANY(user_ids)
    AND (
      p.id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM public.friendships f 
        WHERE (f.status = 'accepted' OR f.status = 'pending')
          AND ((f.requester_id = auth.uid() AND f.addressee_id = p.id) 
            OR (f.addressee_id = auth.uid() AND f.requester_id = p.id))
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
