-- ==============================================================================
-- MIGRATION: 20261011120000_messaging_reliability_and_presence.sql
-- DESCRIPTION: Reliability, Duplicate-Key Race Prevention, Delivery Acknowledgements & Presence
-- SAFE & IDEMPOTENT: Preserves existing data, conversations, and messages without data loss
-- ==============================================================================

-- 1. Ensure conversation_members has last_delivered_at column
ALTER TABLE public.conversation_members 
ADD COLUMN IF NOT EXISTS last_delivered_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Backfill last_delivered_at if null
UPDATE public.conversation_members 
SET last_delivered_at = COALESCE(last_read_at, created_at, now()) 
WHERE last_delivered_at IS NULL;

-- 2. Enhanced get_or_create_conversation RPC
-- Completely eliminates duplicate-key violation: uses ON CONFLICT ON CONSTRAINT conversations_unique_pair
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

  -- Security: verify accepted friendship
  IF NOT public.are_friends(v_caller_id, friend_user_id) THEN
    RAISE EXCEPTION 'Cannot start conversation: users are not accepted friends';
  END IF;

  -- Deterministic canonical user order (user1_id < user2_id)
  v_u1 := LEAST(v_caller_id, friend_user_id);
  v_u2 := GREATEST(v_caller_id, friend_user_id);

  -- Atomic upsert: guaranteed race-condition safe against concurrent inserts
  INSERT INTO public.conversations (user1_id, user2_id, last_message_at, updated_at)
  VALUES (v_u1, v_u2, timezone('utc'::text, now()), timezone('utc'::text, now()))
  ON CONFLICT ON CONSTRAINT conversations_unique_pair 
  DO UPDATE SET updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_conv_id;

  -- Ensure member records exist for both users
  INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at, last_delivered_at)
  VALUES 
    (v_conv_id, v_u1, timezone('utc'::text, now()), timezone('utc'::text, now())),
    (v_conv_id, v_u2, timezone('utc'::text, now()), timezone('utc'::text, now()))
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN QUERY SELECT v_conv_id, v_u1, v_u2, (v_is_new);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;

-- 3. Secure RPC: acknowledge_message_delivery
-- Called by recipient client to confirm message delivery (two gray ticks)
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

REVOKE ALL ON FUNCTION public.acknowledge_message_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_message_delivery(uuid) TO authenticated;

-- 4. Update mark_conversation_read to synchronize last_delivered_at
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

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
