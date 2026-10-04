-- PRODUCTIVITY_PUBLIC_FIX.sql
-- Updates get_public_productivity to remove receiver_id and privacy checks, 
-- and safely sanitize task descriptions to prevent exposing private notes.

CREATE OR REPLACE FUNCTION public.sanitize_task_description(desc_text text)
RETURNS text AS $$
DECLARE
  parsed jsonb;
BEGIN
  IF desc_text IS NULL OR desc_text = '' THEN
    RETURN '{}';
  END IF;
  
  BEGIN
    parsed := desc_text::jsonb;
    -- Only return fields necessary for the public contribution graph calculations
    RETURN jsonb_build_object(
      'rrule', parsed->'rrule',
      'startDate', parsed->'startDate',
      'endDate', parsed->'endDate',
      'status', parsed->'status',
      'skippedDates', parsed->'skippedDates'
    )::text;
  EXCEPTION WHEN OTHERS THEN
    -- If description is not valid JSON (e.g. legacy plain text note), hide it completely.
    RETURN '{}';
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_public_productivity(target_user_id UUID, target_year INT)
RETURNS jsonb AS $$
BEGIN
  -- Return minimal aggregated data for the contribution graph.
  -- We exclude public.tasks.name, public.tasks.category, and public.daily_data.note to protect private details.
  -- We use sanitize_task_description to ensure only safe recurrence metadata is returned.
  RETURN jsonb_build_object(
    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 
        'recurring', recurring, 
        'description', public.sanitize_task_description(description), 
        'created_at', created_at
      )), '[]'::jsonb) 
      FROM public.tasks WHERE user_id = target_user_id
    ),
    'completions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'task_id', task_id, 
        'completed_date', completed_date
      )), '[]'::jsonb) 
      FROM public.task_completions WHERE user_id = target_user_id AND extract(year from completed_date) = target_year
    ),
    'daily_data', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'date', date, 
        'manual_completion', manual_completion
      )), '[]'::jsonb) 
      FROM public.daily_data WHERE user_id = target_user_id AND extract(year from date) = target_year
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Explicitly manage execution rights
REVOKE ALL ON FUNCTION public.get_public_productivity(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_productivity(UUID, INT) TO authenticated;
