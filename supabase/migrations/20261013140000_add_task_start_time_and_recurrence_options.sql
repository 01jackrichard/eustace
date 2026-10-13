-- =============================================================================
-- EUSTACE MIGRATION: 20261013140000_add_task_start_time_and_recurrence_options.sql
-- Purpose:
--   1. Update `public.tasks` check constraint on `recurring` to include 'monthly'
--      and 'yearly' alongside 'none', 'daily', 'weekdays', 'weekly', and 'custom'.
--   2. Add dedicated structured column `start_time time without time zone DEFAULT NULL`
--      to `public.tasks` for accurate time representation without arbitrary strings.
--   3. Maintain 100% backward compatibility for existing tasks where start_time is NULL.
-- =============================================================================

-- 1. Safely expand recurring column check constraint
DO $$ BEGIN
  -- Drop existing constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_recurring_check'
  ) THEN
    ALTER TABLE public.tasks DROP CONSTRAINT tasks_recurring_check;
  END IF;

  -- Add updated check constraint with monthly and yearly
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_recurring_check 
    CHECK (recurring IN ('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly', 'custom'));
END $$;

-- 2. Add structured start_time column
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_time time without time zone DEFAULT NULL;

COMMENT ON COLUMN public.tasks.start_time IS 'Optional scheduled time of day (HH:mm:ss without timezone). NULL indicates an untimed / Anytime task.';
COMMENT ON COLUMN public.tasks.recurring IS 'Recurrence cadence: none (one-off), daily, weekdays, weekly, monthly, yearly, or custom (RRule).';
