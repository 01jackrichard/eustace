-- ==============================================================================
-- MIGRATION: 20261008000000_auth_friends_streak_remediation.sql
-- PURPOSE:
-- 1. Create SECURITY DEFINER RPC `check_username_available` to bypass RLS blind spots.
-- 2. Ensure `friendships_update` and `friendships_delete` policies are applied on `public.friendships`.
-- 3. Update `enforce_friendship_security` trigger to guarantee requester cancel and addressee decline transitions.
-- 4. Ensure `user_stats` has an RLS policy allowing accepted friends to view stats.
-- ==============================================================================

-- 1. Username Availability Check (Bypasses RLS visibility so taken private usernames cannot be usurped)
CREATE OR REPLACE FUNCTION public.check_username_available(target_username text)
RETURNS boolean AS $$
DECLARE
  v_clean text;
BEGIN
  v_clean := lower(trim(COALESCE(target_username, '')));
  IF v_clean = '' OR length(v_clean) < 3 OR length(v_clean) > 20 THEN
    RETURN false;
  END IF;

  -- Verify characters: lowercase alphanumeric and underscore only
  IF v_clean !~ '^[a-z0-9_]{3,20}$' THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE lower(username) = v_clean
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;

-- 2. Friendship RLS Policies: Explicit UPDATE and DELETE
DROP POLICY IF EXISTS "friendships_update" ON public.friendships;
CREATE POLICY "friendships_update" ON public.friendships 
FOR UPDATE USING (
  auth.uid() = requester_id OR auth.uid() = addressee_id
);

DROP POLICY IF EXISTS "friendships_delete" ON public.friendships;
CREATE POLICY "friendships_delete" ON public.friendships 
FOR DELETE USING (
  auth.uid() = requester_id OR auth.uid() = addressee_id
);

-- 3. Friendship Transition Safety Trigger Enhancement
CREATE OR REPLACE FUNCTION public.enforce_friendship_security() RETURNS trigger AS $$
DECLARE
    current_uid uuid;
BEGIN
    current_uid := auth.uid();

    IF TG_OP = 'INSERT' THEN
        IF NEW.status != 'pending' THEN
            RAISE EXCEPTION 'Friendship requests must be initiated in pending status.';
        END IF;
        IF NEW.requester_id = NEW.addressee_id THEN
            RAISE EXCEPTION 'Cannot friend oneself.';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE validations
    IF OLD.requester_id IS DISTINCT FROM NEW.requester_id THEN RAISE EXCEPTION 'Cannot modify requester_id.'; END IF;
    IF OLD.addressee_id IS DISTINCT FROM NEW.addressee_id THEN RAISE EXCEPTION 'Cannot modify addressee_id.'; END IF;
    IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'Cannot modify created_at.'; END IF;
    
    IF OLD.status IS DISTINCT FROM NEW.status AND current_uid IS NOT NULL THEN
        IF OLD.status = 'pending' THEN
            -- Requester can cancel their pending request
            IF current_uid = OLD.requester_id AND NEW.status != 'cancelled' THEN 
                RAISE EXCEPTION 'Requester can only cancel pending request.'; 
            END IF;
            -- Addressee can accept or decline incoming request
            IF current_uid = OLD.addressee_id AND NEW.status NOT IN ('accepted', 'declined') THEN 
                RAISE EXCEPTION 'Addressee can only accept or decline.'; 
            END IF;
        ELSIF OLD.status IN ('declined', 'cancelled') THEN
            -- Requester can re-request by transitioning back to pending
            IF current_uid = OLD.requester_id AND NEW.status = 'pending' THEN
                RETURN NEW;
            ELSE
                RAISE EXCEPTION 'Cannot change status after it has been %.', OLD.status;
            END IF;
        ELSE
            RAISE EXCEPTION 'Cannot change status after it has been %.', OLD.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS friendships_security_trigger ON public.friendships;
CREATE TRIGGER friendships_security_trigger 
BEFORE INSERT OR UPDATE ON public.friendships 
FOR EACH ROW EXECUTE PROCEDURE public.enforce_friendship_security();

-- 4. User Stats Friends RLS Policy (Defense-in-depth for direct client reads)
DROP POLICY IF EXISTS "user_stats_friends_read" ON public.user_stats;
CREATE POLICY "user_stats_friends_read" ON public.user_stats
FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = user_stats.user_id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = user_stats.user_id))
  )
);

-- 5. Dynamic User Streak Computation Function
CREATE OR REPLACE FUNCTION public.calculate_user_streak(target_user_id uuid)
RETURNS int AS $$
DECLARE
  v_streak int := 0;
BEGIN
  WITH user_active_dates AS (
    SELECT DISTINCT completed_date AS active_date
    FROM public.task_completions
    WHERE user_id = target_user_id
    UNION
    SELECT DISTINCT date AS active_date
    FROM public.daily_data
    WHERE user_id = target_user_id AND manual_completion = true
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_user_streak(uuid) TO authenticated;

-- 6. Trigger to Synchronize User Stats on Task Completions & Daily Data
CREATE OR REPLACE FUNCTION public.sync_user_streak_on_completion()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
  v_streak int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      v_streak := public.calculate_user_streak(OLD.user_id);
      INSERT INTO public.user_stats (user_id, current_streak, updated_at)
      VALUES (OLD.user_id, v_streak, now())
      ON CONFLICT (user_id)
      DO UPDATE SET current_streak = EXCLUDED.current_streak, updated_at = EXCLUDED.updated_at;
    END IF;
    v_user_id := NEW.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    v_streak := public.calculate_user_streak(v_user_id);

    INSERT INTO public.user_stats (user_id, current_streak, updated_at)
    VALUES (v_user_id, v_streak, now())
    ON CONFLICT (user_id)
    DO UPDATE SET 
      current_streak = EXCLUDED.current_streak,
      updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_sync_user_streak_completions ON public.task_completions;
CREATE TRIGGER trigger_sync_user_streak_completions
AFTER INSERT OR UPDATE OR DELETE ON public.task_completions
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_streak_on_completion();

DROP TRIGGER IF EXISTS trigger_sync_user_streak_daily ON public.daily_data;
CREATE TRIGGER trigger_sync_user_streak_daily
AFTER INSERT OR UPDATE OR DELETE ON public.daily_data
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_streak_on_completion();

-- 7. Update get_friend_profiles with Dynamic Streak Calculation Fallback
CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])
RETURNS TABLE (
  id uuid, username text, display_name text,
  full_name text, avatar_url text, bio text, current_streak int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, p.username, p.display_name, p.full_name, p.avatar_url,
    CASE 
      WHEN p.id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.friendships f 
        WHERE f.status = 'accepted' 
          AND ((f.requester_id = auth.uid() AND f.addressee_id = p.id) 
            OR (f.addressee_id = auth.uid() AND f.requester_id = p.id))
      ) THEN p.bio
      ELSE ''
    END as bio,
    CASE 
      WHEN p.id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.friendships f 
        WHERE f.status = 'accepted' 
          AND ((f.requester_id = auth.uid() AND f.addressee_id = p.id) 
            OR (f.addressee_id = auth.uid() AND f.requester_id = p.id))
      ) THEN COALESCE(NULLIF(s.current_streak, 0), public.calculate_user_streak(p.id), 0)
      ELSE 0
    END as current_streak
  FROM public.profiles p
  LEFT JOIN public.user_stats s ON s.user_id = p.id
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

REVOKE ALL ON FUNCTION public.get_friend_profiles(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friend_profiles(uuid[]) TO authenticated;

-- 8. Backfill User Stats for Existing Users
INSERT INTO public.user_stats (user_id, current_streak, updated_at)
SELECT 
  p.id,
  public.calculate_user_streak(p.id),
  now()
FROM public.profiles p
ON CONFLICT (user_id)
DO UPDATE SET 
  current_streak = EXCLUDED.current_streak,
  updated_at = EXCLUDED.updated_at;
