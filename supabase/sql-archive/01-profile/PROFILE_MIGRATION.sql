-- ==============================================================================
-- EUSTACE PROFILE MIGRATION
-- Safe, idempotent migration for adding display_name, bio, and avatar storage
-- ==============================================================================

-- 1 & 2. Safely add columns if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'display_name') THEN
        ALTER TABLE public.profiles ADD COLUMN display_name text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'bio') THEN
        ALTER TABLE public.profiles ADD COLUMN bio text;
    END IF;
END $$;

-- 3. Ensure username is TEXT (safe to run regardless)
ALTER TABLE public.profiles ALTER COLUMN username TYPE text;

-- 4. Safely add UNIQUE constraint to username if it doesn't already exist
DO $$
DECLARE
    constraint_exists boolean;
BEGIN
    -- Check if a unique constraint already covers the username column
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE t.relname = 'profiles'
          AND a.attname = 'username'
          AND c.contype = 'u'
    ) INTO constraint_exists;

    IF NOT constraint_exists THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
    END IF;
END $$;

-- 5. Create storage bucket safely (using ON CONFLICT)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile-images', 'profile-images', true) 
ON CONFLICT (id) DO NOTHING;

-- 6. Create storage RLS policies safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Avatar images are publicly accessible' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING ( bucket_id = 'profile-images' );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can upload an avatar' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Anyone can upload an avatar" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'profile-images' AND auth.uid() = owner );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can update their own avatar' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Anyone can update their own avatar" ON storage.objects FOR UPDATE WITH CHECK ( bucket_id = 'profile-images' AND auth.uid() = owner );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can delete their own avatar' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Anyone can delete their own avatar" ON storage.objects FOR DELETE USING ( bucket_id = 'profile-images' AND auth.uid() = owner );
    END IF;
END $$;
