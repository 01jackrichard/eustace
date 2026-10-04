-- This migration creates a secure RPC function to fetch aggregated productivity data
-- for public/friends profiles without exposing private task names or notes.

CREATE OR REPLACE FUNCTION get_public_productivity(target_user_id UUID, target_year INT)
RETURNS jsonb AS $$
DECLARE
  v_visibility text;
  v_is_friend boolean;
BEGIN
  -- 1. Check visibility
  SELECT visibility INTO v_visibility FROM profiles WHERE id = target_user_id;
  
  -- 2. Enforce privacy rules
  IF v_visibility = 'private' THEN
     IF auth.uid() != target_user_id THEN
        RETURN '{"error": "private"}'::jsonb;
     END IF;
  END IF;

  IF v_visibility = 'friends' AND auth.uid() != target_user_id THEN
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
  -- We exclude tasks.name, tasks.category, and daily_data.note.
  -- We include tasks.description only because it stores JSON metadata (like rrule) needed for recurring logic.
  RETURN jsonb_build_object(
    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 
        'recurring', recurring, 
        'description', description, 
        'created_at', created_at
      )), '[]'::jsonb) 
      FROM tasks WHERE user_id = target_user_id
    ),
    'completions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'task_id', task_id, 
        'completed_date', completed_date
      )), '[]'::jsonb) 
      FROM task_completions WHERE user_id = target_user_id AND extract(year from completed_date) = target_year
    ),
    'daily_data', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', date, 
        'manual_completion', manual_completion
      )), '[]'::jsonb) 
      FROM daily_data WHERE user_id = target_user_id AND extract(year from date) = target_year
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
