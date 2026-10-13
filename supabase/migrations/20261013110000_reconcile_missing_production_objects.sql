-- =============================================================================
-- EUSTACE FORWARD REMEDIATION MIGRATION: 20261013110000_reconcile_missing_production_objects.sql
-- Purpose:
--   1. Restore missing RPC `public.check_username_available(target_username text)`
--      with exact boolean return semantics and case-insensitive uniqueness check.
--   2. Restore missing RPC `public.get_suggested_connections(p_limit int DEFAULT 20)`
--      with server-side mutual friend calculation and strict privacy filtering.
--   3. Ensure `public.profiles.timezone` column exists for user-local date modeling.
--   4. Implement user-local date resolution (`public.get_user_local_date`) validating
--      coherent IANA timezones and failing reliably if timezone is missing/invalid.
--   5. Enforce 'scheduled user-local date only' completion invariants via database triggers
--      on `public.task_completions` (immutability, no future/past direct completion toggles)
--      and `public.daily_data` (manual_completion restricted to user-local today while
--      freely permitting notes and reflections across any date).
--   6. Restore missing RPC `public.migrate_user_local_data(payload jsonb)`
--      guaranteeing caller-scoped data ownership, bounded loops, preservation of existing
--      cloud data, and strict rejection of future completions.
--   7. Restore missing RPC `public.delete_user_account()` with comprehensive
--      cascading deletion across storage buckets and auth.users.
--   8. Safely recreate missing `public.user_preferences` table with RLS and owner policy.
-- =============================================================================

-- 1. Username Availability Check (Bypasses RLS visibility so taken private usernames cannot be usurped)
CREATE OR REPLACE FUNCTION public.check_username_available(target_username text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated, service_role;

-- 2. Suggested Connections RPC with Mutual Friend Aggregation
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
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user uuid := auth.uid();
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.get_suggested_connections(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_suggested_connections(int) TO authenticated, service_role;

-- 3. Ensure profiles.timezone column exists for user-local date modeling
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';

-- 4. User-Local Date Resolution Function (Validates IANA Timezone)
CREATE OR REPLACE FUNCTION public.get_user_local_date(p_user_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz text;
  v_local_date date;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine local date: unauthenticated or null user_id';
  END IF;

  SELECT timezone INTO v_tz
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_tz IS NULL OR trim(v_tz) = '' THEN
    RAISE EXCEPTION 'User timezone is not initialized. Please set your timezone in profile settings before logging completions.';
  END IF;

  BEGIN
    v_local_date := (now() AT TIME ZONE v_tz)::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid timezone "%" configured for user profile.', v_tz;
  END;

  RETURN v_local_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_local_date(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_local_date(uuid) TO authenticated, service_role;

-- 5. Completion Date Enforcement Triggers
CREATE OR REPLACE FUNCTION public.enforce_today_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_user_today date;
  v_allow_import text;
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    -- Cascading deletes or internal trigger depth > 1 must pass
    IF pg_trigger_depth() > 1 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_user_id := NEW.user_id;
      IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: completion user_id must match authenticated caller.';
      END IF;

      v_user_today := public.get_user_local_date(v_user_id);
      v_allow_import := current_setting('eustace.allow_historical_import', true);

      IF v_allow_import = 'on' THEN
        -- Legacy import: permits past completions up to user-local today; strictly forbids future dates
        IF NEW.completed_date > v_user_today THEN
          RAISE EXCEPTION 'Future task completions are forbidden (user local date is %, attempted %).', v_user_today, NEW.completed_date;
        END IF;
      ELSE
        -- Interactive completion: eligible only on current user-local date
        IF NEW.completed_date != v_user_today THEN
          RAISE EXCEPTION 'Tasks can only be completed on their scheduled date (expected %, got %).', v_user_today, NEW.completed_date;
        END IF;
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN
      -- Historical completions must not be rewritten
      RAISE EXCEPTION 'Task completion records are immutable and cannot be updated.';

    ELSIF TG_OP = 'DELETE' THEN
      v_user_id := OLD.user_id;
      IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: completion user_id must match authenticated caller.';
      END IF;

      v_user_today := public.get_user_local_date(v_user_id);

      IF OLD.completed_date != v_user_today THEN
        RAISE EXCEPTION 'Past and future task completions are read-only and cannot be undone (current date is %).', v_user_today;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_today_completion ON public.task_completions;
CREATE TRIGGER trigger_enforce_today_completion
BEFORE INSERT OR UPDATE OR DELETE ON public.task_completions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_today_task_completion();

CREATE OR REPLACE FUNCTION public.enforce_today_daily_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_user_today date;
  v_allow_import text;
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_user_id := NEW.user_id;
      IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: daily_data user_id must match authenticated caller.';
      END IF;

      IF NEW.manual_completion = true THEN
        v_user_today := public.get_user_local_date(v_user_id);
        v_allow_import := current_setting('eustace.allow_historical_import', true);

        IF v_allow_import = 'on' THEN
          IF NEW.date > v_user_today THEN
            RAISE EXCEPTION 'Future manual completions are forbidden (user local date is %, attempted %).', v_user_today, NEW.date;
          END IF;
        ELSE
          IF NEW.date != v_user_today THEN
            RAISE EXCEPTION 'Manual completions can only be logged for today (expected %, got %).', v_user_today, NEW.date;
          END IF;
        END IF;
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN
      v_user_id := NEW.user_id;
      IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: daily_data user_id must match authenticated caller.';
      END IF;

      IF OLD.date != NEW.date OR OLD.user_id != NEW.user_id THEN
        RAISE EXCEPTION 'Date and user_id of daily_data cannot be modified.';
      END IF;

      -- Ordinary notes or unrelated reflections on any past or future date proceed freely!
      IF OLD.manual_completion IS DISTINCT FROM NEW.manual_completion THEN
        v_user_today := public.get_user_local_date(v_user_id);
        IF NEW.date != v_user_today THEN
          RAISE EXCEPTION 'Past and future manual completions are read-only (current date is %).', v_user_today;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_today_daily_completion ON public.daily_data;
CREATE TRIGGER trigger_enforce_today_daily_completion
BEFORE INSERT OR UPDATE ON public.daily_data
FOR EACH ROW
EXECUTE FUNCTION public.enforce_today_daily_completion();

-- 6. Cloud Migration RPC with Invariant Guarantees & Existing Data Protection
CREATE OR REPLACE FUNCTION public.migrate_user_local_data(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_task_rec record;
  v_day_key text;
  v_day_val jsonb;
  v_new_id uuid;
  v_task_map jsonb := '{}'::jsonb;
  v_cid text;
  v_mapped_task_id uuid;
  v_task_count int := 0;
  v_day_count int := 0;
  v_user_today date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user timezone and retrieve user local date
  v_user_today := public.get_user_local_date(v_user_id);

  -- Enable session configuration flag to permit historical completion inserts up to user-local today
  PERFORM set_config('eustace.allow_historical_import', 'on', true);

  IF payload->'recurringTasks' IS NOT NULL THEN
    FOR v_task_rec IN SELECT * FROM jsonb_to_recordset(payload->'recurringTasks') AS x(id text, name text, category text, duration text, recurring text, "createdAt" text, description text)
    LOOP
      v_task_count := v_task_count + 1;
      IF v_task_count > 500 THEN
        EXIT;
      END IF;

      -- Reuse existing recurring task if identical definition exists
      SELECT id INTO v_new_id FROM public.tasks 
      WHERE user_id = v_user_id AND name = v_task_rec.name AND recurring = v_task_rec.recurring
      LIMIT 1;

      IF v_new_id IS NULL THEN
        INSERT INTO public.tasks (user_id, name, category, duration, recurring, created_at, description)
        VALUES (v_user_id, v_task_rec.name, v_task_rec.category, v_task_rec.duration, v_task_rec.recurring, COALESCE(NULLIF(v_task_rec."createdAt", '')::date, v_user_today), v_task_rec.description)
        RETURNING id INTO v_new_id;
      END IF;

      v_task_map := jsonb_set(v_task_map, ARRAY[v_task_rec.id], to_jsonb(v_new_id::text));
    END LOOP;
  END IF;

  IF payload->'days' IS NOT NULL THEN
    FOR v_day_key, v_day_val IN SELECT * FROM jsonb_each(payload->'days')
    LOOP
      v_day_count := v_day_count + 1;
      IF v_day_count > 1000 THEN
        EXIT;
      END IF;

      -- 1. Daily Data: preserve existing cloud notes; never set manualCompletion for future dates
      IF (v_day_val->>'note') IS NOT NULL OR (v_day_val->>'manualCompletion')::boolean = true THEN
        INSERT INTO public.daily_data (user_id, date, note, manual_completion)
        VALUES (
          v_user_id,
          v_day_key::date,
          v_day_val->>'note',
          CASE 
            WHEN v_day_key::date <= v_user_today THEN COALESCE((v_day_val->>'manualCompletion')::boolean, false)
            ELSE false 
          END
        )
        ON CONFLICT (user_id, date) DO UPDATE 
        SET note = COALESCE(daily_data.note, EXCLUDED.note),
            manual_completion = CASE 
              WHEN daily_data.manual_completion = true THEN true 
              WHEN EXCLUDED.date <= v_user_today THEN EXCLUDED.manual_completion 
              ELSE false 
            END;
      END IF;

      -- 2. Non-recurring tasks
      IF v_day_val->'tasks' IS NOT NULL THEN
        FOR v_task_rec IN SELECT * FROM jsonb_to_recordset(v_day_val->'tasks') AS x(id text, name text, category text, duration text, recurring text, "createdAt" text, description text)
        LOOP
          INSERT INTO public.tasks (user_id, name, category, duration, recurring, created_at, description)
          VALUES (v_user_id, v_task_rec.name, v_task_rec.category, v_task_rec.duration, 'none', v_day_key::date, v_task_rec.description)
          RETURNING id INTO v_new_id;

          v_task_map := jsonb_set(v_task_map, ARRAY[v_task_rec.id], to_jsonb(v_new_id::text));
        END LOOP;
      END IF;

      -- 3. Completed task records: strictly reject future dates
      IF v_day_key::date <= v_user_today AND v_day_val->'completedTaskIds' IS NOT NULL THEN
        FOR v_cid IN SELECT jsonb_array_elements_text(v_day_val->'completedTaskIds')
        LOOP
          IF v_task_map ? v_cid THEN
            v_mapped_task_id := (v_task_map->>v_cid)::uuid;
            INSERT INTO public.task_completions (user_id, task_id, completed_date)
            VALUES (v_user_id, v_mapped_task_id, v_day_key::date)
            ON CONFLICT (user_id, task_id, completed_date) DO NOTHING;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.migrate_user_local_data(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_user_local_data(jsonb) TO authenticated, service_role;

-- 7. User Self Account Deletion RPC with Storage and Auth Cascades
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Remove user avatars and covers from storage
  DELETE FROM storage.objects 
  WHERE bucket_id IN ('profile-images', 'profile-covers')
    AND (
      owner = v_user_id
      OR (storage.foldername(name))[1] = v_user_id::text
      OR name LIKE (v_user_id::text || '-%')
      OR name LIKE (v_user_id::text || '/%')
    );

  -- 2. Remove user image attachments from private message-images bucket
  DELETE FROM storage.objects
  WHERE bucket_id = 'message-images'
    AND (
      owner = v_user_id
      OR (storage.foldername(name))[1] = v_user_id::text
      OR name IN (
        SELECT m.image_path
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE (c.user1_id = v_user_id OR c.user2_id = v_user_id)
          AND m.image_path IS NOT NULL
      )
    );

  -- 3. Delete from auth.users (cascades via ON DELETE CASCADE to profiles, tasks,
  --    task_completions, daily_data, friendships, preferences, stats, conversations,
  --    conversation_members, messages, notes, and folders)
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated, service_role;

-- 8. User Preferences Table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_notifications boolean DEFAULT false,
  friend_request_notifications boolean DEFAULT true,
  productivity_reminders boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_preferences' AND policyname = 'user_preferences_owner_policy'
  ) THEN
    CREATE POLICY user_preferences_owner_policy ON public.user_preferences
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated, service_role;
