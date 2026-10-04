-- 1. Add activity_visibility to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activity_visibility text DEFAULT 'private' CHECK (activity_visibility IN ('private', 'friends', 'public'));

-- 2. Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT false,
  friend_request_notifications BOOLEAN DEFAULT true,
  productivity_reminders BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preferences
CREATE POLICY "Users can view their own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();

-- Update RPC to use activity_visibility instead of visibility for productivity check
CREATE OR REPLACE FUNCTION get_public_productivity(target_user_id UUID, target_year INT)
RETURNS jsonb AS $$
DECLARE
  v_activity_visibility text;
  v_is_friend boolean;
BEGIN
  -- 1. Check activity visibility
  SELECT activity_visibility INTO v_activity_visibility FROM profiles WHERE id = target_user_id;
  
  -- 2. Enforce privacy rules
  IF v_activity_visibility = 'private' THEN
     IF auth.uid() != target_user_id THEN
        RETURN '{"error": "private"}'::jsonb;
     END IF;
  END IF;

  IF v_activity_visibility = 'friends' AND auth.uid() != target_user_id THEN
     SELECT EXISTS (
        SELECT 1 FROM friendships 
        WHERE status = 'accepted' 
        AND (
          (requester_id = auth.uid() AND receiver_id = target_user_id) OR 
          (receiver_id = auth.uid() AND requester_id = target_user_id)
        )
     ) INTO v_is_friend;
     
     IF NOT v_is_friend THEN
        RETURN '{"error": "friends_only"}'::jsonb;
     END IF;
  END IF;

  -- 3. Return minimal aggregated data
  RETURN jsonb_build_object(
    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'recurring', recurring, 'description', description, 'created_at', created_at
      )), '[]'::jsonb) 
      FROM tasks WHERE user_id = target_user_id
    ),
    'completions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'task_id', task_id, 'completed_date', completed_date
      )), '[]'::jsonb) 
      FROM task_completions WHERE user_id = target_user_id AND extract(year from completed_date) = target_year
    ),
    'daily_data', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', date, 'manual_completion', manual_completion
      )), '[]'::jsonb) 
      FROM daily_data WHERE user_id = target_user_id AND extract(year from date) = target_year
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
