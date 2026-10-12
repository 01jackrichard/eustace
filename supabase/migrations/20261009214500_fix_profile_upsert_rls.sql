-- 1. Allow users to UPDATE their own profile
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);

-- 2. Allow users to INSERT their own profile
-- Required for Supabase .upsert() to pass RLS even when updating an existing row
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles 
FOR INSERT WITH CHECK (auth.uid() = id);
