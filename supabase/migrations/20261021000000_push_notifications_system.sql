-- =============================================================================
-- EUSTACE MIGRATION: 20261021000000_push_notifications_system.sql
-- Purpose:
--   1. Create `public.notification_devices` for multi-device FCM token management.
--   2. Create `public.notifications` for in-app notification inbox and history.
--   3. Create `public.task_reminder_logs` for strict reminder dispatch idempotency.
--   4. Reconcile `public.user_preferences` with granular push notification toggles.
--   5. Add `reminder_minutes` column to `public.tasks` with constraints.
--   6. Implement atomic device registration/deactivation RPCs and due reminder query.
--   7. Configure strict Row Level Security (RLS) ensuring total multi-tenant isolation.
-- =============================================================================

-- 1. Notification Devices Table (Multi-device token storage)
CREATE TABLE IF NOT EXISTS public.notification_devices (
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

CREATE INDEX IF NOT EXISTS idx_notification_devices_user_id ON public.notification_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_devices_active_token ON public.notification_devices(fcm_token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_notification_devices_user_active ON public.notification_devices(user_id, is_active);

-- 2. In-App Notifications History Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('task_reminder', 'message', 'friend_request', 'friend_accepted', 'streak', 'system')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  read_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;

-- 3. Task Reminder Logs (Strict idempotency preventing duplicate reminder dispatch)
CREATE TABLE IF NOT EXISTS public.task_reminder_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  occurrence_date date NOT NULL,
  reminder_minutes integer NOT NULL,
  sent_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT task_reminder_logs_unique UNIQUE (user_id, task_id, occurrence_date, reminder_minutes)
);

CREATE INDEX IF NOT EXISTS idx_task_reminder_logs_user_task ON public.task_reminder_logs(user_id, task_id, occurrence_date);

-- 4. Reconcile user_preferences with Push Notification toggles
CREATE TABLE IF NOT EXISTS public.user_preferences (
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

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_preferences' AND policyname = 'user_preferences_owner_policy'
  ) THEN
    CREATE POLICY user_preferences_owner_policy ON public.user_preferences
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated, service_role;

DO $$ BEGIN
  -- Push notifications master switch
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'push_notifications'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN push_notifications boolean DEFAULT true;
  END IF;

  -- Task reminders toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'task_reminders'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN task_reminders boolean DEFAULT true;
  END IF;

  -- Message notifications toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'message_notifications'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN message_notifications boolean DEFAULT true;
  END IF;

  -- Streak reminders toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'streak_reminders'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN streak_reminders boolean DEFAULT true;
  END IF;

  -- System notifications toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'system_notifications'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN system_notifications boolean DEFAULT true;
  END IF;
END $$;

-- 5. Add reminder_minutes to public.tasks
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'reminder_minutes'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN reminder_minutes integer DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_reminder_minutes_check'
  ) THEN
    ALTER TABLE public.tasks ADD CONSTRAINT tasks_reminder_minutes_check 
      CHECK (reminder_minutes IS NULL OR reminder_minutes IN (0, 5, 10, 15, 30, 60));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_user_reminder ON public.tasks(user_id, reminder_minutes) 
  WHERE reminder_minutes IS NOT NULL;

-- 6. Row Level Security (RLS) Policies
ALTER TABLE public.notification_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reminder_logs ENABLE ROW LEVEL SECURITY;

-- notification_devices policies
DROP POLICY IF EXISTS notification_devices_select_policy ON public.notification_devices;
CREATE POLICY notification_devices_select_policy ON public.notification_devices
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_devices_insert_policy ON public.notification_devices;
CREATE POLICY notification_devices_insert_policy ON public.notification_devices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_devices_update_policy ON public.notification_devices;
CREATE POLICY notification_devices_update_policy ON public.notification_devices
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_devices_delete_policy ON public.notification_devices;
CREATE POLICY notification_devices_delete_policy ON public.notification_devices
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- notifications policies
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;
CREATE POLICY notifications_select_policy ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_insert_policy ON public.notifications;
CREATE POLICY notifications_insert_policy ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_update_policy ON public.notifications;
CREATE POLICY notifications_update_policy ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_delete_policy ON public.notifications;
CREATE POLICY notifications_delete_policy ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- task_reminder_logs policies (User read-only, service_role full)
DROP POLICY IF EXISTS task_reminder_logs_select_policy ON public.task_reminder_logs;
CREATE POLICY task_reminder_logs_select_policy ON public.task_reminder_logs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 7. Secure Functions & RPCs

-- Atomic Device Registration RPC
CREATE OR REPLACE FUNCTION public.register_notification_device(
  p_fcm_token text,
  p_device_type text DEFAULT 'web',
  p_device_name text DEFAULT NULL,
  p_token_type text DEFAULT 'fid'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  INSERT INTO public.notification_devices (
    user_id,
    fcm_token,
    token_type,
    device_type,
    device_name,
    is_active,
    last_seen_at,
    updated_at
  )
  VALUES (
    v_user_id,
    trim(p_fcm_token),
    COALESCE(p_token_type, 'fid'),
    COALESCE(p_device_type, 'web'),
    p_device_name,
    true,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
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

REVOKE ALL ON FUNCTION public.register_notification_device(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_notification_device(text, text, text, text) TO authenticated, service_role;

-- Atomic Device Unregistration RPC
CREATE OR REPLACE FUNCTION public.unregister_notification_device(p_fcm_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller cannot unregister notification device';
  END IF;

  UPDATE public.notification_devices
  SET is_active = false,
      updated_at = timezone('utc'::text, now())
  WHERE user_id = v_user_id
    AND fcm_token = trim(p_fcm_token);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_notification_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unregister_notification_device(text) TO authenticated, service_role;

-- Query due task reminders across users with accurate timezone handling
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
      -- Exact reminder timestamp converted to UTC
      ((((now() AT TIME ZONE et.user_timezone)::date || ' ' || et.start_time)::timestamp AT TIME ZONE et.user_timezone)
        - (et.reminder_minutes || ' minutes')::interval) AS reminder_time_utc,
      aut.tokens,
      aut.devices
    FROM eligible_tasks et
    JOIN active_user_tokens aut ON aut.user_id = et.user_id
    WHERE 
      -- Non-recurring tasks must match current user date or task created date
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
  -- Reminder time is due (between now - window and now + 1 minute)
  WHERE co.reminder_time_utc BETWEEN (now() - (p_window_minutes || ' minutes')::interval) AND (now() + INTERVAL '1 minute')
    -- Has not already been completed today
    AND NOT EXISTS (
      SELECT 1 FROM public.task_completions tc
      WHERE tc.user_id = co.user_id 
        AND tc.task_id = co.task_id 
        AND tc.completed_date = co.current_user_date
    )
    -- Has not already been logged as sent
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

COMMENT ON TABLE public.notification_devices IS 'Registered FCM device tokens for multi-device push delivery.';
COMMENT ON TABLE public.notifications IS 'Persisted in-app notification records and inbox history.';
COMMENT ON TABLE public.task_reminder_logs IS 'Idempotency registry preventing duplicate scheduled reminder dispatches.';
