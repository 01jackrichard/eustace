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
