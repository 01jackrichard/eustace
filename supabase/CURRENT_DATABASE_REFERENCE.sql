-- ==========================================
-- EUSTACE: CURRENT DATABASE REFERENCE
-- ==========================================
-- This file is DOCUMENTATION ONLY. 
-- DO NOT execute this file directly against production. 
-- It represents the consolidated final architecture.

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ==========================================
-- 2. TABLES
-- ==========================================

-- PROFILE SYSTEM
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  username text UNIQUE,
  display_name text,
  full_name text, -- legacy fallback
  bio text,
  avatar_url text,
  cover_image_url text,
  visibility text DEFAULT 'public' CHECK (visibility IN ('private', 'friends', 'public')),
  activity_visibility text DEFAULT 'private' CHECK (activity_visibility IN ('private', 'friends', 'public')),
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
CREATE UNIQUE INDEX friendships_unique_pair_idx ON public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

-- PRODUCTIVITY SYSTEM
CREATE TABLE public.tasks (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text, -- JSON TaskMetadata
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


-- ==========================================
-- 3. FUNCTIONS & RPCs
-- ==========================================

-- Friend Check
CREATE OR REPLACE FUNCTION public.is_connected_to_user(target_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.friendships 
    WHERE (requester_id = auth.uid() AND addressee_id = target_id) 
       OR (addressee_id = auth.uid() AND requester_id = target_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Profile Lookup
CREATE OR REPLACE FUNCTION public.get_profile_by_username(target_username text)
RETURNS TABLE (
  id uuid, username text, display_name text, full_name text,
  bio text, avatar_url text, cover_image_url text, visibility text
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.bio, p.avatar_url, p.cover_image_url, p.visibility
  FROM public.profiles p
  WHERE p.username ILIKE target_username
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Search Users
CREATE OR REPLACE FUNCTION public.search_users_by_username(search_query text)
RETURNS TABLE (
  id uuid, username text, display_name text,
  full_name text, avatar_url text, visibility text
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.visibility
  FROM public.profiles p
  WHERE p.username ILIKE search_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Get Friends
CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])
RETURNS TABLE (
  id uuid, username text, display_name text,
  full_name text, avatar_url text, bio text
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.full_name, p.avatar_url, p.bio
  FROM public.profiles p
  WHERE p.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Safe Description Parser
CREATE OR REPLACE FUNCTION public.sanitize_task_description(desc_text text)
RETURNS text AS $$
DECLARE
  parsed jsonb;
BEGIN
  IF desc_text IS NULL OR desc_text = '' THEN RETURN '{}'; END IF;
  BEGIN
    parsed := desc_text::jsonb;
    RETURN jsonb_build_object(
      'rrule', parsed->'rrule', 'startDate', parsed->'startDate',
      'endDate', parsed->'endDate', 'status', parsed->'status',
      'skippedDates', parsed->'skippedDates'
    )::text;
  EXCEPTION WHEN OTHERS THEN RETURN '{}'; END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = '';

-- Public Productivity Fetcher
CREATE OR REPLACE FUNCTION public.get_public_productivity(target_user_id UUID, target_year INT)
RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'tasks', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'recurring', recurring, 'description', public.sanitize_task_description(description), 'created_at', created_at)), '[]'::jsonb) FROM public.tasks WHERE user_id = target_user_id),
    'completions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('task_id', task_id, 'completed_date', completed_date)), '[]'::jsonb) FROM public.task_completions WHERE user_id = target_user_id AND extract(year from completed_date) = target_year),
    'daily_data', (SELECT COALESCE(jsonb_agg(jsonb_build_object('date', date, 'manual_completion', manual_completion)), '[]'::jsonb) FROM public.daily_data WHERE user_id = target_user_id AND extract(year from date) = target_year)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revokes/Grants
REVOKE ALL ON FUNCTION public.is_connected_to_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_connected_to_user(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO authenticated;
REVOKE ALL ON FUNCTION public.search_users_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_users_by_username(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_friend_profiles(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_friend_profiles(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_public_productivity(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_productivity(uuid, int) TO authenticated;


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

-- Friendship Transition Safety
CREATE OR REPLACE FUNCTION public.enforce_friendship_security() RETURNS trigger AS $$
DECLARE
    current_uid uuid;
BEGIN
    IF OLD.requester_id IS DISTINCT FROM NEW.requester_id THEN RAISE EXCEPTION 'Cannot modify requester_id.'; END IF;
    IF OLD.addressee_id IS DISTINCT FROM NEW.addressee_id THEN RAISE EXCEPTION 'Cannot modify addressee_id.'; END IF;
    IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'Cannot modify created_at.'; END IF;
    
    current_uid := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    IF OLD.status IS DISTINCT FROM NEW.status AND current_uid IS NOT NULL THEN
        IF OLD.status = 'pending' THEN
            IF current_uid = OLD.requester_id AND NEW.status != 'cancelled' THEN RAISE EXCEPTION 'Requester can only cancel.'; END IF;
            IF current_uid = OLD.addressee_id AND NEW.status NOT IN ('accepted', 'declined') THEN RAISE EXCEPTION 'Addressee can only accept or decline.'; END IF;
        ELSE
            RAISE EXCEPTION 'Cannot change status after it has been %.', OLD.status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER friendships_security_trigger BEFORE UPDATE ON public.friendships FOR EACH ROW EXECUTE PROCEDURE public.enforce_friendship_security();


-- ==========================================
-- 5. RLS POLICIES (See RLS.md for full map)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by all authenticated users." ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Tasks, Completions, Daily Data, Preferences are all USING (auth.uid() = user_id)
-- Friendships uses USING (auth.uid() = requester_id OR auth.uid() = addressee_id)


-- ==========================================
-- 6. STORAGE BUCKETS
-- ==========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-images', 'profile-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-covers', 'profile-covers', true) ON CONFLICT DO NOTHING;

-- Storage Policies omitted for brevity (covered in RLS.md)

-- ==========================================
-- 7. REALTIME
-- ==========================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
