-- ==============================================================================
-- MIGRATION: 20261011000000_direct_messaging_system.sql
-- DESCRIPTION: Production Direct Messaging (1-on-1) between Accepted Friends
-- INCLUDES: Conversations, Conversation Members, Messages, Storage & RLS Security
-- SAFE & IDEMPOTENT: Updates existing tables seamlessly without data loss
-- ==============================================================================

-- 1. Helper function: are_friends (Enforces accepted friendship)
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

REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;

-- 2. Conversations Table (Create or Upgrade)
CREATE TABLE IF NOT EXISTS public.conversations (
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

-- Ensure last_message_at exists if conversations table already existed
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone DEFAULT timezone('utc'::text, now());
UPDATE public.conversations SET last_message_at = COALESCE(updated_at, created_at, now()) WHERE last_message_at IS NULL;

-- 3. Conversation Members Table (tracks per-user read timestamps)
CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

-- Backfill conversation_members for any existing conversations
INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at)
SELECT id, user1_id, created_at FROM public.conversations
ON CONFLICT (conversation_id, user_id) DO NOTHING;

INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at)
SELECT id, user2_id, created_at FROM public.conversations
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- 4. Messages Table (Create or Upgrade)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type text NOT NULL DEFAULT 'text',
  text_content text,
  image_path text,
  image_metadata jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist if table was created in an earlier migration
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_path text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_metadata jsonb;

-- Sync legacy media columns if they existed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'media_url') THEN
    UPDATE public.messages SET image_path = media_url WHERE image_path IS NULL AND media_url IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'media_type') THEN
    UPDATE public.messages SET message_type = media_type WHERE message_type IS NULL AND media_type IS NOT NULL;
  END IF;
END $$;

-- 5. Indexes for fast lookups & pagination
CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON public.conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON public.conversations(user2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON public.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON public.conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);

-- 6. Trigger: update conversation activity and sender read state on message insert
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

-- 7. Secure Atomic RPC: get_or_create_conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(friend_user_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  user1_id uuid,
  user2_id uuid,
  created boolean
) AS $$
DECLARE
  v_caller_id uuid;
  v_u1 uuid;
  v_u2 uuid;
  v_conv_id uuid;
  v_created boolean := false;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF friend_user_id IS NULL OR friend_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Invalid friend user ID';
  END IF;

  -- Security boundary: verify accepted friendship
  IF NOT public.are_friends(v_caller_id, friend_user_id) THEN
    RAISE EXCEPTION 'Cannot start conversation: users are not accepted friends';
  END IF;

  v_u1 := LEAST(v_caller_id, friend_user_id);
  v_u2 := GREATEST(v_caller_id, friend_user_id);

  -- Check existing conversation
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE public.conversations.user1_id = v_u1 AND public.conversations.user2_id = v_u2;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (user1_id, user2_id, last_message_at)
    VALUES (v_u1, v_u2, now())
    ON CONFLICT (user1_id, user2_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_conv_id;

    v_created := true;

    INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at)
    VALUES
      (v_conv_id, v_u1, now()),
      (v_conv_id, v_u2, now())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  ELSE
    -- Ensure member rows exist
    INSERT INTO public.conversation_members (conversation_id, user_id, last_read_at)
    VALUES
      (v_conv_id, v_u1, now()),
      (v_conv_id, v_u2, now())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_conv_id, v_u1, v_u2, v_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;

-- 8. Secure RPC: mark_conversation_read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.conversation_members
  SET last_read_at = timezone('utc'::text, now())
  WHERE conversation_id = p_conversation_id AND user_id = v_caller_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- 9. Row Level Security Policies
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations RLS
DROP POLICY IF EXISTS "conversations_select_members" ON public.conversations;
CREATE POLICY "conversations_select_members" ON public.conversations
FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "conversations_insert_members" ON public.conversations;
CREATE POLICY "conversations_insert_members" ON public.conversations
FOR INSERT WITH CHECK (
  (auth.uid() = user1_id OR auth.uid() = user2_id)
  AND public.are_friends(user1_id, user2_id)
  AND user1_id < user2_id
);

DROP POLICY IF EXISTS "conversations_update_members" ON public.conversations;
CREATE POLICY "conversations_update_members" ON public.conversations
FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Conversation Members RLS
DROP POLICY IF EXISTS "conversation_members_select" ON public.conversation_members;
CREATE POLICY "conversation_members_select" ON public.conversation_members
FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_members.conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "conversation_members_update_own" ON public.conversation_members;
CREATE POLICY "conversation_members_update_own" ON public.conversation_members
FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Messages RLS
DROP POLICY IF EXISTS "messages_select_members" ON public.messages;
CREATE POLICY "messages_select_members" ON public.messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "messages_insert_authorized_sender" ON public.messages;
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

-- 10. Storage Bucket Configuration (message-images)
-- Strictly Private, 500,000 bytes max file size (500 KB decimal limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-images',
  'message-images',
  false,
  500000,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 500000,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS Policies
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "message_images_select_members" ON storage.objects;
    DROP POLICY IF EXISTS "message_images_insert_members" ON storage.objects;
    DROP POLICY IF EXISTS "message_images_delete_members" ON storage.objects;

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

-- 11. Realtime Publication
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
