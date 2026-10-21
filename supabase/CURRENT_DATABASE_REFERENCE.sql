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
  timezone text DEFAULT 'UTC',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_notifications boolean DEFAULT false,
  friend_request_notifications boolean DEFAULT true,
  productivity_reminders boolean DEFAULT true,
  push_notifications boolean DEFAULT true,
  task_reminders boolean DEFAULT true,
  message_notifications boolean DEFAULT true,
  streak_reminders boolean DEFAULT true,
  system_notifications boolean DEFAULT true,
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
  recurring text DEFAULT 'none' CHECK (recurring IN ('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom')),
  start_time time without time zone DEFAULT NULL,
  reminder_minutes integer DEFAULT NULL CHECK (reminder_minutes IS NULL OR reminder_minutes IN (0, 5, 10, 15, 30, 60)),
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

-- DIRECT MESSAGING SYSTEM
CREATE TABLE public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT conversations_user_order CHECK (user1_id < user2_id),
  CONSTRAINT conversations_no_self CHECK (user1_id != user2_id),
  CONSTRAINT conversations_unique_pair UNIQUE (user1_id, user2_id)
);

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_delivered_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type text NOT NULL DEFAULT 'text',
  text_content text,
  image_path text,
  image_metadata jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_conversations_user1 ON public.conversations(user1_id);
CREATE INDEX idx_conversations_user2 ON public.conversations(user2_id);
CREATE INDEX idx_conversations_last_msg ON public.conversations(last_message_at DESC);
CREATE INDEX idx_conversation_members_user ON public.conversation_members(user_id);
CREATE INDEX idx_messages_conversation_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);

-- NOTIFICATION SYSTEM
CREATE TABLE public.notification_devices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  fcm_token text NOT NULL,
  token_type text DEFAULT 'fid' CHECK (token_type IN ('fid', 'token')),
  device_type text DEFAULT 'web' CHECK (device_type IN ('web', 'mobile', 'tablet', 'desktop')),
  device_name text,
  is_active boolean DEFAULT true NOT NULL,
  last_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT notification_devices_user_fcm_token_unique UNIQUE (user_id, fcm_token)
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('task_reminder', 'message', 'friend_request', 'friend_accepted', 'streak', 'system')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  read_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.task_reminder_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  occurrence_date date NOT NULL,
  reminder_minutes integer NOT NULL,
  sent_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT task_reminder_logs_unique UNIQUE (user_id, task_id, occurrence_date, reminder_minutes)
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

-- Account Deletion RPC with Password Verification (cascades to storage and auth.users)
CREATE OR REPLACE FUNCTION public.delete_user_account(p_password text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_encrypted_pwd text;
  v_provider text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 0. Identity / Reauthentication Verification
  SELECT encrypted_password, raw_app_meta_data->>'provider'
  INTO v_encrypted_pwd, v_provider
  FROM auth.users
  WHERE id = v_user_id;

  IF v_encrypted_pwd IS NOT NULL AND v_encrypted_pwd <> '' AND COALESCE(v_provider, 'email') = 'email' THEN
    IF p_password IS NULL OR trim(p_password) = '' THEN
      RAISE EXCEPTION 'Password verification required to delete account';
    END IF;

    IF crypt(trim(p_password), v_encrypted_pwd) <> v_encrypted_pwd THEN
      RAISE EXCEPTION 'Incorrect password. Account deletion unauthorized.';
    END IF;
  END IF;

  -- 1. Remove user storage objects
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

  -- 3. Delete notes and folders
  DELETE FROM public.notes WHERE user_id = v_user_id;
  DELETE FROM public.folders WHERE user_id = v_user_id;

  -- 4. Delete from auth.users (cascades to profiles, tasks, task_completions, daily_data, friendships, preferences, stats, messages, conversations)
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Messaging Helper: are_friends
CREATE OR REPLACE FUNCTION public.are_friends(u1 uuid, u2 uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = u1 AND addressee_id = u2)
        OR (requester_id = u2 AND addressee_id = u1))
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

-- Messaging RPC: get_or_create_conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(friend_user_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  user1_id uuid,
  user2_id uuid,
  created boolean
) AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_u1 uuid;
  v_u2 uuid;
  v_conv_id uuid;
  v_is_new boolean := false;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF friend_user_id IS NULL OR friend_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Invalid friend user ID';
  END IF;

  IF NOT public.are_friends(v_caller_id, friend_user_id) THEN
    RAISE EXCEPTION 'Cannot start conversation: users are not accepted friends';
  END IF;

  v_u1 := LEAST(v_caller_id, friend_user_id);
  v_u2 := GREATEST(v_caller_id, friend_user_id);

  INSERT INTO public.conversations (user1_id, user2_id, last_message_at, updated_at)
  VALUES (v_u1, v_u2, timezone('utc'::text, now()), timezone('utc'::text, now()))
  ON CONFLICT ON CONSTRAINT conversations_unique_pair 
  DO UPDATE SET updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at, last_delivered_at)
  VALUES 
    (v_conv_id, v_u1, timezone('utc'::text, now()), timezone('utc'::text, now())),
    (v_conv_id, v_u2, timezone('utc'::text, now()), timezone('utc'::text, now()))
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN QUERY SELECT v_conv_id, v_u1, v_u2, (v_is_new);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Messaging RPC: mark_conversation_read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_now timestamp with time zone := timezone('utc'::text, now());
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.conversation_members
  SET last_read_at = v_now,
      last_delivered_at = GREATEST(last_delivered_at, v_now)
  WHERE conversation_id = p_conversation_id 
    AND user_id = v_caller_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Messaging RPC: acknowledge_message_delivery
CREATE OR REPLACE FUNCTION public.acknowledge_message_delivery(p_conversation_id uuid)
RETURNS void AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.conversation_members
  SET last_delivered_at = timezone('utc'::text, now())
  WHERE conversation_id = p_conversation_id 
    AND user_id = v_caller_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Suggested Connections RPC
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
    SELECT CASE 
             WHEN f.requester_id = v_current_user THEN f.addressee_id 
             ELSE f.requester_id 
           END AS friend_id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = v_current_user OR f.addressee_id = v_current_user)
  ),
  excluded_users AS (
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
    SELECT 
      p.id,
      p.username,
      p.display_name,
      p.full_name,
      p.avatar_url,
      p.bio,
      p.cover_image_url
    FROM public.profiles p
    WHERE p.id NOT IN (SELECT user_id FROM excluded_users)
      AND p.visibility = 'public'
  ),
  mutual_counts AS (
    SELECT 
      cp.id,
      COUNT(f.id) AS mutual_count
    FROM candidate_profiles cp
    LEFT JOIN public.friendships f ON (
      f.status = 'accepted' AND (
        (f.requester_id = cp.id AND f.addressee_id IN (SELECT friend_id FROM user_friends))
        OR
        (f.addressee_id = cp.id AND f.requester_id IN (SELECT friend_id FROM user_friends))
      )
    )
    GROUP BY cp.id
  )
  SELECT 
    cp.id,
    cp.username,
    cp.display_name,
    cp.full_name,
    cp.avatar_url,
    cp.bio,
    cp.cover_image_url,
    COALESCE(mc.mutual_count, 0) AS mutual_count
  FROM candidate_profiles cp
  JOIN mutual_counts mc ON mc.id = cp.id
  ORDER BY mc.mutual_count DESC, cp.username ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

-- Grants
GRANT EXECUTE ON FUNCTION public.is_connected_to_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_by_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_profiles(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_productivity(uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_user_local_data(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_message_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_suggested_connections(int) TO authenticated;

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
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

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

-- Conversations RLS
CREATE POLICY "conversations_select_members" ON public.conversations
FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "conversations_insert_members" ON public.conversations
FOR INSERT WITH CHECK (
  (auth.uid() = user1_id OR auth.uid() = user2_id)
  AND public.are_friends(user1_id, user2_id)
  AND user1_id < user2_id
);

CREATE POLICY "conversations_update_members" ON public.conversations
FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Conversation Members RLS
CREATE POLICY "conversation_members_select" ON public.conversation_members
FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_members.conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
  )
);

CREATE POLICY "conversation_members_update_own" ON public.conversation_members
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Messages RLS
CREATE POLICY "messages_select_members" ON public.messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
  )
);

CREATE POLICY "messages_insert_authorized_sender" ON public.messages
FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
      AND public.are_friends(c.user1_id, c.user2_id)
  )
);

-- Message Activity & Read Trigger
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  UPDATE public.conversation_members
  SET last_read_at = NEW.created_at
  WHERE conversation_id = NEW.conversation_id AND user_id = NEW.sender_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trigger_on_new_message ON public.messages;
CREATE TRIGGER trigger_on_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_message();

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
  ('profile-covers', 'profile-covers', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('message-images', 'message-images', false, 500000, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE 
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "Users can upload their own avatars and covers" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own avatars and covers" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own avatars and covers" ON storage.objects;
    DROP POLICY IF EXISTS "message_images_select_members" ON storage.objects;
    DROP POLICY IF EXISTS "message_images_insert_members" ON storage.objects;
    DROP POLICY IF EXISTS "message_images_delete_members" ON storage.objects;
    
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

    CREATE POLICY "message_images_select_members" ON storage.objects
    FOR SELECT TO authenticated USING (
      bucket_id = 'message-images' AND
      EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
      )
    );

    CREATE POLICY "message_images_insert_members" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (
      bucket_id = 'message-images' AND
      EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
          AND public.are_friends(c.user1_id, c.user2_id)
      )
    );

    CREATE POLICY "message_images_delete_members" ON storage.objects
    FOR DELETE TO authenticated USING (
      bucket_id = 'message-images' AND
      (
        auth.uid() = owner OR
        EXISTS (
          SELECT 1 FROM public.conversations c
          WHERE c.id::text = (storage.foldername(name))[1]
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
      )
    );
  END IF;
END $$;

-- Realtime Publication for Direct Messaging
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
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

    INSERT INTO public.profiles (id, username, display_name, full_name, visibility, activity_visibility, timezone)
    VALUES (
      u.id, 
      v_uname, 
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'User'),
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'User'),
      'public',
      'public',
      'UTC'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_preferences (user_id) VALUES (u.id) ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.user_stats (user_id, current_streak) VALUES (u.id, 0) ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;

-- Dynamic Timezone-Aware User Streak Calculation
CREATE OR REPLACE FUNCTION public.calculate_user_streak(target_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_streak int := 0;
  v_user_tz text;
  v_today date;
BEGIN
  IF v_caller_id IS NULL OR target_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = target_user_id
  ) THEN
    RETURN 0;
  END IF;

  IF v_caller_id != target_user_id AND NOT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.requester_id = v_caller_id AND f.addressee_id = target_user_id)
        OR (f.addressee_id = v_caller_id AND f.requester_id = target_user_id)
      )
  ) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(NULLIF(p.timezone, ''), 'UTC') INTO v_user_tz
  FROM public.profiles p
  WHERE p.id = target_user_id;

  BEGIN
    v_today := (timezone(v_user_tz, now()))::date;
  EXCEPTION WHEN OTHERS THEN
    v_today := (timezone('UTC', now()))::date;
  END;

  WITH user_active_dates AS (
    SELECT DISTINCT completed_date AS active_date
    FROM public.task_completions
    WHERE user_id = target_user_id
    UNION
    SELECT DISTINCT date AS active_date
    FROM public.daily_data
    WHERE user_id = target_user_id AND manual_completion = true
    UNION
    SELECT (generate_series(
      (streak_credit_date - (streak_credit_value - 1))::timestamp, 
      streak_credit_date::timestamp, 
      '1 day'::interval
    ))::date AS active_date
    FROM public.user_stats
    WHERE user_id = target_user_id AND streak_credit_value > 0 AND streak_credit_date IS NOT NULL
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
  WHERE streak_end >= v_today - 1
  ORDER BY streak_end DESC
  LIMIT 1;

  RETURN COALESCE(v_streak, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_user_streak(uuid) TO authenticated;

-- Completion Streak Sync Trigger
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




-- NOTIFICATION SYSTEM POLICIES & FUNCTIONS
ALTER TABLE public.notification_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_devices_select_policy ON public.notification_devices
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY notification_devices_insert_policy ON public.notification_devices
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notification_devices_update_policy ON public.notification_devices
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notification_devices_delete_policy ON public.notification_devices
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_insert_policy ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_delete_policy ON public.notifications
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY task_reminder_logs_select_policy ON public.task_reminder_logs
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.register_notification_device(
  p_fcm_token text,
  p_device_type text DEFAULT 'web',
  p_device_name text DEFAULT NULL,
  p_token_type text DEFAULT 'fid'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_device_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller cannot register notification device';
  END IF;
  IF p_fcm_token IS NULL OR trim(p_fcm_token) = '' THEN
    RAISE EXCEPTION 'FCM registration token cannot be empty';
  END IF;
  INSERT INTO public.notification_devices (user_id, fcm_token, token_type, device_type, device_name, is_active, last_seen_at, updated_at)
  VALUES (v_user_id, trim(p_fcm_token), COALESCE(p_token_type, 'fid'), COALESCE(p_device_type, 'web'), p_device_name, true, timezone('utc'::text, now()), timezone('utc'::text, now()))
  ON CONFLICT (user_id, fcm_token) DO UPDATE
  SET is_active = true,
      token_type = COALESCE(EXCLUDED.token_type, public.notification_devices.token_type),
      device_type = COALESCE(EXCLUDED.device_type, public.notification_devices.device_type),
      device_name = COALESCE(EXCLUDED.device_name, public.notification_devices.device_name),
      last_seen_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_device_id;
  RETURN v_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_notification_device(p_fcm_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller cannot unregister notification device';
  END IF;
  UPDATE public.notification_devices
  SET is_active = false, updated_at = timezone('utc'::text, now())
  WHERE user_id = v_user_id AND fcm_token = trim(p_fcm_token);
  RETURN true;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_due_task_reminders(p_window_minutes integer DEFAULT 5)
RETURNS TABLE (
  task_id uuid,
  user_id uuid,
  task_name text,
  occurrence_date date,
  start_time time without time zone,
  reminder_minutes integer,
  user_timezone text,
  fcm_tokens text[],
  devices jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH eligible_tasks AS (
    SELECT 
      t.id AS task_id,
      t.user_id,
      t.name AS task_name,
      t.recurring,
      t.start_time,
      t.reminder_minutes,
      t.created_at AS task_created_date,
      COALESCE(NULLIF(p.timezone, ''), 'UTC') AS user_timezone
    FROM public.tasks t
    JOIN public.profiles p ON p.id = t.user_id
    LEFT JOIN public.user_preferences up ON up.user_id = t.user_id
    WHERE t.reminder_minutes IS NOT NULL
      AND t.start_time IS NOT NULL
      AND (up.push_notifications IS NULL OR up.push_notifications = true)
      AND (up.task_reminders IS NULL OR up.task_reminders = true)
  ),
  active_user_tokens AS (
    SELECT 
      nd.user_id,
      array_agg(DISTINCT nd.fcm_token) AS tokens,
      jsonb_agg(jsonb_build_object('token', nd.fcm_token, 'type', nd.token_type)) AS devices
    FROM public.notification_devices nd
    WHERE nd.is_active = true
    GROUP BY nd.user_id
  ),
  candidate_occurrences AS (
    SELECT 
      et.task_id,
      et.user_id,
      et.task_name,
      (now() AT TIME ZONE et.user_timezone)::date AS current_user_date,
      et.start_time,
      et.reminder_minutes,
      et.user_timezone,
      ((((now() AT TIME ZONE et.user_timezone)::date || ' ' || et.start_time)::timestamp AT TIME ZONE et.user_timezone)
        - (et.reminder_minutes || ' minutes')::interval) AS reminder_time_utc,
      aut.tokens,
      aut.devices
    FROM eligible_tasks et
    JOIN active_user_tokens aut ON aut.user_id = et.user_id
    WHERE 
      (et.recurring != 'none' OR et.task_created_date = (now() AT TIME ZONE et.user_timezone)::date)
  )
  SELECT 
    co.task_id,
    co.user_id,
    co.task_name,
    co.current_user_date AS occurrence_date,
    co.start_time,
    co.reminder_minutes,
    co.user_timezone,
    co.tokens AS fcm_tokens,
    co.devices
  FROM candidate_occurrences co
  WHERE co.reminder_time_utc BETWEEN (now() - (p_window_minutes || ' minutes')::interval) AND (now() + INTERVAL '1 minute')
    AND NOT EXISTS (
      SELECT 1 FROM public.task_completions tc
      WHERE tc.user_id = co.user_id 
        AND tc.task_id = co.task_id 
        AND tc.completed_date = co.current_user_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.task_reminder_logs trl
      WHERE trl.user_id = co.user_id
        AND trl.task_id = co.task_id
        AND trl.occurrence_date = co.current_user_date
        AND trl.reminder_minutes = co.reminder_minutes
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_due_task_reminders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_due_task_reminders(integer) TO service_role;
