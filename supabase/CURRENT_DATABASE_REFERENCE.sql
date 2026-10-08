-- ==========================================
-- EUSTACE: CURRENT DATABASE REFERENCE
-- ==========================================
-- This represents the consolidated final architecture.

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ==========================================
-- 2. TABLES
-- ==========================================

-- PROFILE SYSTEM
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  username text UNIQUE,
  display_name text,
  full_name text,
  bio text,
  avatar_url text,
  cover_image_url text,
  visibility text DEFAULT 'public' CHECK (visibility IN ('private', 'friends', 'public')),
  activity_visibility text DEFAULT 'public' CHECK (activity_visibility IN ('private', 'friends', 'public')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_notifications boolean DEFAULT false,
  friend_request_notifications boolean DEFAULT true,
  productivity_reminders boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.user_stats (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- FRIEND SYSTEM
CREATE TABLE public.friendships (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  requester_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  addressee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT friendships_no_self_friend CHECK (requester_id != addressee_id)
);
CREATE UNIQUE INDEX friendships_unique_active_pair_idx ON public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
) WHERE status IN ('pending', 'accepted');

-- PRODUCTIVITY SYSTEM
CREATE TABLE public.tasks (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  duration text,
  recurring text DEFAULT 'none' CHECK (recurring IN ('none', 'daily', 'weekdays', 'weekly', 'custom')),
  created_at date NOT NULL DEFAULT current_date,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.task_completions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  completed_date date NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, task_id, completed_date)
);

CREATE TABLE public.daily_data (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  note text,
  manual_completion boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, date)
);

-- NOTES & FOLDERS SYSTEM
CREATE TABLE public.folders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.notes (
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

-- ==========================================
-- 3. FUNCTIONS & RPCs
-- ==========================================

-- Friend Check (requires accepted status)
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

-- Check Username Available (SECURITY DEFINER to check across private and public profiles safely)
CREATE OR REPLACE FUNCTION public.check_username_available(target_username text)
RETURNS boolean AS $$
DECLARE
  v_clean text;
BEGIN
  v_clean := lower(trim(COALESCE(target_username, '')));
  IF v_clean = '' OR length(v_clean) < 3 OR length(v_clean) > 20 THEN
    RETURN false;
  END IF;

  IF v_clean !~ '^[a-z0-9_]{3,20}$' THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE lower(username) = v_clean
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Profile Lookup (available to anon and authenticated)
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
    AND (
      p.visibility = 'public' 
      OR p.id = auth.uid() 
      OR (p.visibility = 'friends' AND public.is_connected_to_user(p.id))
    )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Search Users (respects visibility, enforces min length and pagination limit)
CREATE OR REPLACE FUNCTION public.search_users_by_username(search_query text)
RETURNS TABLE (
  id uuid, username text, display_name text,
  full_name text, avatar_url text, visibility text
) AS $$
DECLARE
  v_cleaned text;
BEGIN
  v_cleaned := trim(search_query);
  IF length(v_cleaned) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.visibility
  FROM public.profiles p
  WHERE p.username ILIKE v_cleaned
    AND (p.visibility = 'public' OR p.id = auth.uid())
  LIMIT 25;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Get Friend Profiles (checks friendship before revealing; masks streak/bio if only pending)
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
      ) THEN COALESCE(s.current_streak, 0)
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

-- Public Productivity Fetcher (sanitized, server-side privacy check, sargable date bounds)
CREATE OR REPLACE FUNCTION public.get_public_productivity(target_user_id UUID, target_year INT)
RETURNS jsonb AS $$
DECLARE
  v_visibility text;
  v_activity_visibility text;
  v_is_friend boolean;
  v_caller_id uuid;
  v_start_date date;
  v_end_date date;
BEGIN
  v_caller_id := auth.uid();
  v_start_date := make_date(target_year, 1, 1);
  v_end_date := make_date(target_year, 12, 31);

  SELECT visibility, activity_visibility 
  INTO v_visibility, v_activity_visibility 
  FROM public.profiles 
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  IF v_caller_id IS NOT NULL AND v_caller_id = target_user_id THEN
    -- Self-access
  ELSE
    v_is_friend := false;
    IF v_caller_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.friendships 
        WHERE status = 'accepted'
          AND ((requester_id = v_caller_id AND addressee_id = target_user_id) 
            OR (addressee_id = v_caller_id AND requester_id = target_user_id))
      ) INTO v_is_friend;
    END IF;

    IF v_activity_visibility = 'private' THEN
      RETURN jsonb_build_object('error', 'private');
    ELSIF v_activity_visibility = 'friends' AND NOT v_is_friend THEN
      RETURN jsonb_build_object('error', 'friends_only');
    END IF;
  END IF;

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
          AND completed_date >= v_start_date
          AND completed_date <= v_end_date
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
        AND date >= v_start_date
        AND date <= v_end_date
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Local Storage Cloud Migration RPC (with deduplication and sanity bounds)
CREATE OR REPLACE FUNCTION public.migrate_user_local_data(payload jsonb)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_task_rec record;
  v_day_key text;
  v_day_val jsonb;
  v_new_id uuid;
  v_task_map jsonb := '{}'::jsonb;
  v_cid text;
  v_mapped_task_id uuid;
  v_task_count int := 0;
  v_day_count int := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF payload->'recurringTasks' IS NOT NULL THEN
    FOR v_task_rec IN SELECT * FROM jsonb_to_recordset(payload->'recurringTasks') AS x(id text, name text, category text, duration text, recurring text, "createdAt" text, description text)
    LOOP
      v_task_count := v_task_count + 1;
      IF v_task_count > 500 THEN
        EXIT;
      END IF;

      -- Check if matching recurring task already exists
      SELECT id INTO v_new_id FROM public.tasks 
      WHERE user_id = v_user_id AND name = v_task_rec.name AND recurring = v_task_rec.recurring
      LIMIT 1;

      IF v_new_id IS NULL THEN
        INSERT INTO public.tasks (user_id, name, category, duration, recurring, created_at, description)
        VALUES (v_user_id, v_task_rec.name, v_task_rec.category, v_task_rec.duration, v_task_rec.recurring, COALESCE(NULLIF(v_task_rec."createdAt", '')::date, CURRENT_DATE), v_task_rec.description)
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

      IF (v_day_val->>'note') IS NOT NULL OR (v_day_val->>'manualCompletion')::boolean = true THEN
        INSERT INTO public.daily_data (user_id, date, note, manual_completion)
        VALUES (v_user_id, v_day_key::date, v_day_val->>'note', COALESCE((v_day_val->>'manualCompletion')::boolean, false))
        ON CONFLICT (user_id, date) DO UPDATE 
        SET note = EXCLUDED.note, manual_completion = EXCLUDED.manual_completion;
      END IF;

      IF v_day_val->'tasks' IS NOT NULL THEN
        FOR v_task_rec IN SELECT * FROM jsonb_to_recordset(v_day_val->'tasks') AS x(id text, name text, category text, duration text, recurring text, "createdAt" text, description text)
        LOOP
          INSERT INTO public.tasks (user_id, name, category, duration, recurring, created_at, description)
          VALUES (v_user_id, v_task_rec.name, v_task_rec.category, v_task_rec.duration, 'none', v_day_key::date, v_task_rec.description)
          RETURNING id INTO v_new_id;

          v_task_map := jsonb_set(v_task_map, ARRAY[v_task_rec.id], to_jsonb(v_new_id::text));
        END LOOP;
      END IF;

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

-- Account Deletion RPC (cascades to storage and auth.users)
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Remove user storage objects
  DELETE FROM storage.objects 
  WHERE bucket_id IN ('profile-images', 'profile-covers')
    AND (owner = v_user_id OR (storage.foldername(name))[1] = v_user_id::text);

  -- 2. Delete notes and folders
  DELETE FROM public.notes WHERE user_id = v_user_id;
  DELETE FROM public.folders WHERE user_id = v_user_id;

  -- 3. Delete from auth.users (cascades to profiles, tasks, task_completions, daily_data, friendships, preferences, stats)
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grants
GRANT EXECUTE ON FUNCTION public.is_connected_to_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_by_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_profiles(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_productivity(uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_user_local_data(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- ==========================================
-- 4. TRIGGERS
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_updated_at() RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER daily_data_updated_at BEFORE UPDATE ON public.daily_data FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER friendships_updated_at BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Friendship Transition Safety Trigger (enforces INSERT status and valid state transitions)
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
            IF current_uid = OLD.requester_id AND NEW.status != 'cancelled' THEN 
                RAISE EXCEPTION 'Requester can only cancel pending request.'; 
            END IF;
            IF current_uid = OLD.addressee_id AND NEW.status NOT IN ('accepted', 'declined') THEN 
                RAISE EXCEPTION 'Addressee can only accept or decline.'; 
            END IF;
        ELSIF OLD.status IN ('declined', 'cancelled') THEN
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

-- Auth Signup Trigger (handles username collision)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  v_username text;
  v_full_name text;
BEGIN
  v_username := LOWER(TRIM(COALESCE(new.raw_user_meta_data->>'username', '')));
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');

  IF v_username = '' THEN
    v_username := 'user_' || SUBSTRING(REPLACE(new.id::text, '-', ''), 1, 10);
  END IF;

  -- Handle collision gracefully
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) THEN
    v_username := v_username || '_' || SUBSTRING(REPLACE(new.id::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.profiles (
    id, username, display_name, full_name, visibility, activity_visibility
  ) VALUES (
    new.id, v_username, v_full_name, v_full_name, 'public', 'public'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id) 
  VALUES (new.id) 
  ON CONFLICT (user_id) DO NOTHING;

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

-- ==========================================
-- 5. RLS POLICIES
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Profile visibility-respecting policy
CREATE POLICY "profiles_select_policy" ON public.profiles 
FOR SELECT USING (
  visibility = 'public' 
  OR auth.uid() = id 
  OR (visibility = 'friends' AND public.is_connected_to_user(id))
);

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "tasks_owner" ON public.tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "task_completions_select" ON public.task_completions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "task_completions_insert" ON public.task_completions FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
);
CREATE POLICY "task_completions_update" ON public.task_completions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "task_completions_delete" ON public.task_completions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "daily_data_owner" ON public.daily_data FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "friendships_select" ON public.friendships FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "friendships_insert" ON public.friendships FOR INSERT WITH CHECK (
  auth.uid() = requester_id AND 
  status = 'pending'
);
CREATE POLICY "friendships_update" ON public.friendships FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "friendships_delete" ON public.friendships FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "user_preferences_owner" ON public.user_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_stats_owner" ON public.user_stats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_stats_friends_read" ON public.user_stats FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = user_stats.user_id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = user_stats.user_id))
  )
);

CREATE POLICY "folders_owner" ON public.folders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notes_owner" ON public.notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND
  (folder_id IS NULL OR EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_id AND f.user_id = auth.uid()))
);

-- Note Folder Ownership Trigger (defense in depth)
CREATE OR REPLACE FUNCTION public.enforce_note_folder_ownership() RETURNS trigger AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.folders WHERE id = NEW.folder_id AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Referenced folder must belong to the same user.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS notes_folder_ownership_trigger ON public.notes;
CREATE TRIGGER notes_folder_ownership_trigger
BEFORE INSERT OR UPDATE ON public.notes
FOR EACH ROW EXECUTE PROCEDURE public.enforce_note_folder_ownership();

-- ==========================================
-- 6. INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS task_completions_user_date_idx ON public.task_completions(user_id, completed_date);
CREATE INDEX IF NOT EXISTS task_completions_task_id_idx ON public.task_completions(task_id);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships(addressee_id);
CREATE INDEX IF NOT EXISTS notes_user_id_updated_idx ON public.notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_folder_id_idx ON public.notes(folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS profiles_username_trgm_idx ON public.profiles USING gin (username gin_trgm_ops);

-- ==========================================
-- 7. STORAGE BUCKETS & POLICIES
-- ==========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES 
  ('profile-images', 'profile-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('profile-covers', 'profile-covers', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE 
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "Users can upload their own avatars and covers" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own avatars and covers" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own avatars and covers" ON storage.objects;
    
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

-- ==========================================
-- 8. BACKFILL EXISTING USERS
-- ==========================================
DO $$
DECLARE
  u record;
  v_uname text;
BEGIN
  FOR u IN SELECT id, raw_user_meta_data FROM auth.users LOOP
    v_uname := LOWER(TRIM(COALESCE(u.raw_user_meta_data->>'username', '')));
    IF v_uname = '' THEN
      v_uname := 'user_' || SUBSTRING(REPLACE(u.id::text, '-', ''), 1, 10);
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_uname AND id != u.id) THEN
      v_uname := v_uname || '_' || SUBSTRING(REPLACE(u.id::text, '-', ''), 1, 6);
    END IF;

    INSERT INTO public.profiles (id, username, display_name, full_name, visibility, activity_visibility)
    VALUES (
      u.id, 
      v_uname, 
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'User'),
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'User'),
      'public',
      'public'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_preferences (user_id) VALUES (u.id) ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.user_stats (user_id, current_streak) VALUES (u.id, 0) ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;

