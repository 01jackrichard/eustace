-- 1. Add streak credit columns to user_stats (safe to run multiple times)
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS streak_credit_value integer DEFAULT 0;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS streak_credit_date date;

-- 2. Update the streak calculation function to virtually inject these credited dates
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
  WHERE streak_end >= CURRENT_DATE - 1
  ORDER BY streak_end DESC
  LIMIT 1;

  RETURN COALESCE(v_streak, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_user_streak(uuid) TO authenticated;


