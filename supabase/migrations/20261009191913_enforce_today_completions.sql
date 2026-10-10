-- 1. Create a trigger function to strictly enforce the 'today only' rule for direct completion toggles.
CREATE OR REPLACE FUNCTION public.enforce_today_task_completion() RETURNS trigger AS $$
BEGIN
  -- We only restrict API requests (authenticated users)
  IF current_setting('role', true) = 'authenticated' THEN
    
    -- If trigger depth > 1, this is a cascading operation (e.g. user deleted a task, triggering ON DELETE CASCADE)
    -- We MUST allow cascades so we don't break legitimate task/account deletions.
    IF pg_trigger_depth() > 1 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    -- For direct inserts (marking a task complete)
    IF TG_OP = 'INSERT' THEN
      IF NEW.completed_date != CURRENT_DATE THEN
        RAISE EXCEPTION 'Tasks can only be completed on their scheduled date.';
      END IF;
      
    -- For direct deletes (marking a task incomplete)
    ELSIF TG_OP = 'DELETE' THEN
      IF OLD.completed_date != CURRENT_DATE THEN
        RAISE EXCEPTION 'Past and future task completions are read-only and cannot be undone.';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2. Attach the trigger to task_completions
DROP TRIGGER IF EXISTS trigger_enforce_today_completion ON public.task_completions;
CREATE TRIGGER trigger_enforce_today_completion
BEFORE INSERT OR DELETE ON public.task_completions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_today_task_completion();

-- 3. Also restrict daily_data manual_completion toggles to today only, to prevent bypassing streaks
CREATE OR REPLACE FUNCTION public.enforce_today_daily_completion() RETURNS trigger AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'INSERT' THEN
      -- If they are trying to insert a true manual_completion for a past date
      IF NEW.manual_completion = true AND NEW.date != CURRENT_DATE THEN
        RAISE EXCEPTION 'Manual completions can only be logged for today.';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      -- If they are changing the manual_completion state for a past date (but allow note updates)
      IF OLD.manual_completion IS DISTINCT FROM NEW.manual_completion AND NEW.date != CURRENT_DATE THEN
        RAISE EXCEPTION 'Past manual completions are read-only.';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_today_daily_completion ON public.daily_data;
CREATE TRIGGER trigger_enforce_today_daily_completion
BEFORE INSERT OR UPDATE ON public.daily_data
FOR EACH ROW
EXECUTE FUNCTION public.enforce_today_daily_completion();
