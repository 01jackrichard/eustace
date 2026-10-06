-- =========================================================================
-- EUSTACE: CONSOLIDATED SECURITY, PRIVACY & INTEGRITY REMEDIATION
-- Migration Date: 2026-10-06
-- =========================================================================

-- 1. Ensure Notes & Folders Tables Exist
CREATE TABLE IF NOT EXISTS public.folders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    title text NOT NULL DEFAULT 'Untitled',
    content text DEFAULT '',
    folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
    tags text[] DEFAULT '{}',
    is_pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'folders_owner_policy') THEN
        CREATE POLICY folders_owner_policy ON public.folders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'notes_owner_policy') THEN
        CREATE POLICY notes_owner_policy ON public.notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 2. FIX CRIT-01: Cross-User Foreign-Key Injection in task_completions
DROP POLICY IF EXISTS "Users can insert their own task completions" ON public.task_completions;
DROP POLICY IF EXISTS "task_completions_insert" ON public.task_completions;
CREATE POLICY "task_completions_insert" ON public.task_completions
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.tasks t 
    WHERE t.id = task_id AND t.user_id = auth.uid()
  )
);

-- 3. FIX MED-06: Accurate Friendship Verification RPC
CREATE OR REPLACE FUNCTION public.is_connected_to_user(target_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.friendships 
    WHERE status = 'accepted'
      AND ((requester_id = auth.uid() AND addressee_id = target_id) 
        OR (addressee_id = auth.uid() AND requester_id = target_id))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.is_connected_to_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_connected_to_user(uuid) TO authenticated;

-- 4. FIX CRIT-02 & CRIT-03: Sanitized Public Productivity RPC with Server-Side Privacy Checks
CREATE OR REPLACE FUNCTION public.get_public_productivity(target_user_id UUID, target_year INT)
RETURNS jsonb AS $$
DECLARE
  v_visibility text;
  v_activity_visibility text;
  v_is_friend boolean;
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();

  -- Get target user's visibility configuration
  SELECT visibility, activity_visibility 
  INTO v_visibility, v_activity_visibility 
  FROM public.profiles 
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- Self-access is always permitted
  IF v_caller_id IS NOT NULL AND v_caller_id = target_user_id THEN
    -- Fall-through to data return
  ELSE
    -- Check friendship status
    v_is_friend := false;
    IF v_caller_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.friendships 
        WHERE status = 'accepted'
          AND ((requester_id = v_caller_id AND addressee_id = target_user_id) 
            OR (addressee_id = v_caller_id AND requester_id = target_user_id))
      ) INTO v_is_friend;
    END IF;

    -- Enforce activity visibility restrictions
    IF v_activity_visibility = 'private' THEN
      RETURN jsonb_build_object('error', 'private');
    ELSIF v_activity_visibility = 'friends' AND NOT v_is_friend THEN
      RETURN jsonb_build_object('error', 'friends_only');
    END IF;
  END IF;

  -- Return MINIMIZED data: Only daily completion counts and manual completions
  -- NEVER expose task UUIDs, task names, descriptions, or recurring rrules publicly
  RETURN jsonb_build_object(
    'completions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', completed_date,
        'count', cnt
      )), '[]'::jsonb)
      FROM (
        SELECT completed_date, count(*) as cnt
        FROM public.task_completions
        WHERE user_id = target_user_id 
          AND extract(year from completed_date) = target_year
        GROUP BY completed_date
      ) agg
    ),
    'daily_data', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', date, 
        'manual_completion', manual_completion
      )), '[]'::jsonb)
      FROM public.daily_data 
      WHERE user_id = target_user_id 
        AND extract(year from date) = target_year
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execution to anon and authenticated for public profiles
REVOKE ALL ON FUNCTION public.get_public_productivity(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_productivity(UUID, INT) TO anon, authenticated;

-- 5. FIX CRIT-03: Enable Public Profile Lookup for Anonymous and Authenticated
CREATE OR REPLACE FUNCTION public.get_profile_by_username(target_username text)
RETURNS TABLE (
  id uuid, username text, display_name text, full_name text,
  bio text, avatar_url text, cover_image_url text, visibility text, activity_visibility text
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.bio, p.avatar_url, p.cover_image_url, p.visibility, p.activity_visibility
  FROM public.profiles p
  WHERE p.username ILIKE target_username
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.get_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO anon, authenticated;

-- 6. FIX HIGH-05: Harden Friend Profiles Lookup
CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])
RETURNS TABLE (
  id uuid, username text, display_name text,
  full_name text, avatar_url text, bio text, current_streak int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.bio,
    COALESCE(s.current_streak, 0) as current_streak
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

-- 7. FIX HIGH-02: Atomic Profile Creation Trigger on Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  v_username text;
  v_full_name text;
BEGIN
  v_username := LOWER(TRIM(COALESCE(new.raw_user_meta_data->>'username', '')));
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');

  -- Generate fallback username if not provided (e.g. OAuth signup)
  IF v_username = '' THEN
    v_username := 'user_' || SUBSTRING(REPLACE(new.id::text, '-', ''), 1, 10);
  END IF;

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    full_name,
    visibility,
    activity_visibility
  ) VALUES (
    new.id,
    v_username,
    v_full_name,
    v_full_name,
    'public',
    'public'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Initialize preferences
  INSERT INTO public.user_preferences (user_id) 
  VALUES (new.id) 
  ON CONFLICT (user_id) DO NOTHING;

  -- Initialize stats
  INSERT INTO public.user_stats (user_id, current_streak) 
  VALUES (new.id, 0) 
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 8. FIX HIGH-03: Atomic Transactional LocalStorage Cloud Migration RPC
CREATE OR REPLACE FUNCTION public.migrate_user_local_data(payload jsonb)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_task_rec record;
  v_day_key text;
  v_day_val jsonb;
  v_old_id text;
  v_new_id uuid;
  v_task_map jsonb := '{}'::jsonb;
  v_cid text;
  v_mapped_task_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Insert recurring tasks
  IF payload->'recurringTasks' IS NOT NULL THEN
    FOR v_task_rec IN SELECT * FROM jsonb_to_recordset(payload->'recurringTasks') AS x(id text, name text, category text, duration text, recurring text, "createdAt" text, description text)
    LOOP
      INSERT INTO public.tasks (user_id, name, category, duration, recurring, created_at, description)
      VALUES (v_user_id, v_task_rec.name, v_task_rec.category, v_task_rec.duration, v_task_rec.recurring, COALESCE(v_task_rec."createdAt"::date, CURRENT_DATE), v_task_rec.description)
      RETURNING id INTO v_new_id;

      v_task_map := jsonb_set(v_task_map, ARRAY[v_task_rec.id], to_jsonb(v_new_id::text));
    END LOOP;
  END IF;

  -- 2. Process daily data & specific tasks
  IF payload->'days' IS NOT NULL THEN
    FOR v_day_key, v_day_val IN SELECT * FROM jsonb_each(payload->'days')
    LOOP
      -- Insert or update daily_data
      IF (v_day_val->>'note') IS NOT NULL OR (v_day_val->>'manualCompletion')::boolean = true THEN
        INSERT INTO public.daily_data (user_id, date, note, manual_completion)
        VALUES (v_user_id, v_day_key::date, v_day_val->>'note', COALESCE((v_day_val->>'manualCompletion')::boolean, false))
        ON CONFLICT (user_id, date) DO UPDATE 
        SET note = EXCLUDED.note, manual_completion = EXCLUDED.manual_completion;
      END IF;

      -- Insert specific day tasks
      IF v_day_val->'tasks' IS NOT NULL THEN
        FOR v_task_rec IN SELECT * FROM jsonb_to_recordset(v_day_val->'tasks') AS x(id text, name text, category text, duration text, recurring text, "createdAt" text, description text)
        LOOP
          INSERT INTO public.tasks (user_id, name, category, duration, recurring, created_at, description)
          VALUES (v_user_id, v_task_rec.name, v_task_rec.category, v_task_rec.duration, 'none', v_day_key::date, v_task_rec.description)
          RETURNING id INTO v_new_id;

          v_task_map := jsonb_set(v_task_map, ARRAY[v_task_rec.id], to_jsonb(v_new_id::text));
        END LOOP;
      END IF;

      -- Insert completed tasks
      IF v_day_val->'completedTaskIds' IS NOT NULL THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.migrate_user_local_data(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_user_local_data(jsonb) TO authenticated;

-- 9. FIX HIGH-04: User Self Account Deletion RPC
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete from profiles (cascades to tasks, completions, daily_data, friendships, preferences, stats)
  DELETE FROM public.profiles WHERE id = v_user_id;
  -- Delete notes and folders
  DELETE FROM public.notes WHERE user_id = v_user_id;
  DELETE FROM public.folders WHERE user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- 10. FIX HIGH-07: Add Critical Missing Performance Indexes
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS task_completions_user_date_idx ON public.task_completions(user_id, completed_date);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships(addressee_id);
CREATE INDEX IF NOT EXISTS notes_user_id_updated_idx ON public.notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_folder_id_idx ON public.notes(folder_id);

-- 11. FIX HIGH-06: Storage RLS Fix (Support both flat prefix and subfolder path keys)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "Anyone can upload an avatar" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can update their own avatar" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can delete their own avatar" ON storage.objects;
    
    CREATE POLICY "Users can upload their own avatars and covers" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id IN ('profile-images', 'profile-covers') AND
      (
        auth.uid() = owner OR
        (storage.foldername(name))[1] = auth.uid()::text OR
        name LIKE (auth.uid()::text || '-%')
      )
    );

    CREATE POLICY "Users can update their own avatars and covers" ON storage.objects
    FOR UPDATE USING (
      bucket_id IN ('profile-images', 'profile-covers') AND
      (
        auth.uid() = owner OR
        (storage.foldername(name))[1] = auth.uid()::text OR
        name LIKE (auth.uid()::text || '-%')
      )
    );

    CREATE POLICY "Users can delete their own avatars and covers" ON storage.objects
    FOR DELETE USING (
      bucket_id IN ('profile-images', 'profile-covers') AND
      (
        auth.uid() = owner OR
        (storage.foldername(name))[1] = auth.uid()::text OR
        name LIKE (auth.uid()::text || '-%')
      )
    );
  END IF;
END $$;
