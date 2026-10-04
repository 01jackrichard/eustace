-- ==============================================================================
-- EUSTACE FRIENDS MIGRATION (V3)
-- Safe, idempotent migration for friendships table and RLS
-- ==============================================================================

DO $$
BEGIN
    -- 1. Create friendships if it doesn't exist entirely
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'friendships') THEN
        CREATE TABLE public.friendships (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            requester_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
            addressee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
            status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
            created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
            updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
        );
        ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
    END IF;

    -- 2. Rename receiver_id to addressee_id if the legacy column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'friendships' AND column_name = 'receiver_id') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'friendships' AND column_name = 'addressee_id') THEN
        ALTER TABLE public.friendships RENAME COLUMN receiver_id TO addressee_id;
    END IF;

    -- 3. Safely check for duplicates before applying unique constraint
    IF EXISTS (
        SELECT 1 
        FROM public.friendships 
        GROUP BY least(requester_id, addressee_id), greatest(requester_id, addressee_id) 
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate friendship relationships detected. Please manually resolve duplicate pairs before applying the unique index.';
    END IF;

    -- 4. Apply proper unique constraint/index
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'friendships_unique_pair_idx'
    ) THEN
        -- Drop the legacy exact-order unique constraint if it exists
        DECLARE
            r record;
        BEGIN
            FOR r IN 
                SELECT c.conname 
                FROM pg_constraint c
                JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attnum = c.conkey[1]
                JOIN pg_attribute a2 ON a2.attrelid = c.conrelid AND a2.attnum = c.conkey[2]
                WHERE c.conrelid = 'public.friendships'::regclass 
                  AND c.contype = 'u' 
                  AND array_length(c.conkey, 1) = 2
                  AND ((a1.attname = 'requester_id' AND a2.attname = 'addressee_id') OR 
                       (a1.attname = 'addressee_id' AND a2.attname = 'requester_id'))
            LOOP
                EXECUTE 'ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
            END LOOP;
        END;
        
        -- Create the expression index for bidirectional uniqueness
        CREATE UNIQUE INDEX friendships_unique_pair_idx ON public.friendships (
            least(requester_id, addressee_id),
            greatest(requester_id, addressee_id)
        );
    END IF;

    -- 5. Add 'cancelled' to status check constraint idempotently
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint c
        WHERE c.conrelid = 'public.friendships'::regclass 
          AND c.contype = 'c' 
          AND pg_get_constraintdef(c.oid) ILIKE '%cancelled%'
    ) THEN
        -- Drop old status constraints safely
        DECLARE
            r record;
        BEGIN
            FOR r IN 
                SELECT conname FROM pg_constraint 
                WHERE conrelid = 'public.friendships'::regclass 
                  AND contype = 'c' 
                  AND pg_get_constraintdef(oid) ILIKE '%status%'
                  AND pg_get_constraintdef(oid) NOT ILIKE '%cancelled%'
            LOOP
                EXECUTE 'ALTER TABLE public.friendships DROP CONSTRAINT ' || quote_ident(r.conname);
            END LOOP;
        END;
        
        ALTER TABLE public.friendships ADD CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'));
    END IF;

    -- 6. Add self-friend prevention idempotently
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conrelid = 'public.friendships'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) ILIKE '%requester_id <> addressee_id%'
    ) THEN
        ALTER TABLE public.friendships ADD CONSTRAINT friendships_no_self_friend CHECK (requester_id != addressee_id);
    END IF;

END $$;

-- 7. Trigger to enforce immutable fields and valid status transitions
CREATE OR REPLACE FUNCTION public.enforce_friendship_security()
RETURNS trigger AS $$
DECLARE
    current_uid uuid;
BEGIN
    -- 1. Enforce immutability of core fields
    IF OLD.requester_id IS DISTINCT FROM NEW.requester_id THEN
        RAISE EXCEPTION 'Cannot modify requester_id after creation.';
    END IF;
    IF OLD.addressee_id IS DISTINCT FROM NEW.addressee_id THEN
        RAISE EXCEPTION 'Cannot modify addressee_id after creation.';
    END IF;
    IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'Cannot modify created_at after creation.';
    END IF;

    -- 2. Get the authenticated user ID (works in Supabase API contexts)
    current_uid := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;

    -- 3. Enforce valid status transitions
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- If running in a background service role or without auth, current_uid might be null.
        -- We apply strict rules if current_uid is present (i.e. normal API usage).
        IF current_uid IS NOT NULL THEN
            IF OLD.status = 'pending' THEN
                IF current_uid = OLD.requester_id THEN
                    IF NEW.status != 'cancelled' THEN
                        RAISE EXCEPTION 'Requester can only cancel a pending request.';
                    END IF;
                ELSIF current_uid = OLD.addressee_id THEN
                    IF NEW.status NOT IN ('accepted', 'declined') THEN
                        RAISE EXCEPTION 'Addressee can only accept or decline a pending request.';
                    END IF;
                ELSE
                    RAISE EXCEPTION 'Unauthorized status transition.';
                END IF;
            ELSE
                RAISE EXCEPTION 'Cannot change status after it has been %.', OLD.status;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS friendships_security_trigger ON public.friendships;
-- Clean up old trigger from previous iterations if it exists
DROP TRIGGER IF EXISTS friendships_prevent_participants_update ON public.friendships;

CREATE TRIGGER friendships_security_trigger
    BEFORE UPDATE ON public.friendships
    FOR EACH ROW EXECUTE PROCEDURE public.enforce_friendship_security();

-- 8. RLS Policies
DO $$
BEGIN
    -- Ensure RLS is enabled
    ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

    -- Drop old policies to cleanly recreate them
    DROP POLICY IF EXISTS "Users can view their friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can insert friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can update friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can delete friendships" ON public.friendships;

    -- SELECT: users can see rows where they are requester or addressee
    CREATE POLICY "Users can view their friendships" 
        ON public.friendships FOR SELECT 
        USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

    -- INSERT: users can only create requests where they are the requester
    CREATE POLICY "Users can insert friendships" 
        ON public.friendships FOR INSERT 
        WITH CHECK (auth.uid() = requester_id);

    -- UPDATE: users can attempt to update rows they are involved in.
    -- The trigger enforce_friendship_security() guarantees they follow strict state machine rules.
    CREATE POLICY "Users can update friendships" 
        ON public.friendships FOR UPDATE 
        USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
    
    -- DELETE: users can delete relationships they are involved in (e.g. unfriending)
    CREATE POLICY "Users can delete friendships" 
        ON public.friendships FOR DELETE 
        USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
END $$;

-- 9. Enable Realtime for friendships safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
    END IF;
EXCEPTION WHEN undefined_object THEN
    -- If supabase_realtime publication doesn't exist, ignore
END $$;
