-- 1. Grant SELECT access to storage objects (REQUIRED by Supabase for uploads to work)
DROP POLICY IF EXISTS "Avatars and covers are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars and covers are publicly accessible" ON storage.objects
FOR SELECT USING ( bucket_id IN ('profile-images', 'profile-covers') );

-- 2. Update upload/modify policies to use modern 'owner_id' column
DROP POLICY IF EXISTS "Users can upload their own avatars and covers" ON storage.objects;
CREATE POLICY "Users can upload their own avatars and covers" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id IN ('profile-images', 'profile-covers') AND
  ( auth.uid() = owner_id OR auth.uid()::text = owner::text OR name LIKE (auth.uid()::text || '-%') )
);

DROP POLICY IF EXISTS "Users can update their own avatars and covers" ON storage.objects;
CREATE POLICY "Users can update their own avatars and covers" ON storage.objects
FOR UPDATE USING (
  bucket_id IN ('profile-images', 'profile-covers') AND
  ( auth.uid() = owner_id OR auth.uid()::text = owner::text OR name LIKE (auth.uid()::text || '-%') )
);

DROP POLICY IF EXISTS "Users can delete their own avatars and covers" ON storage.objects;
CREATE POLICY "Users can delete their own avatars and covers" ON storage.objects
FOR DELETE USING (
  bucket_id IN ('profile-images', 'profile-covers') AND
  ( auth.uid() = owner_id OR auth.uid()::text = owner::text OR name LIKE (auth.uid()::text || '-%') )
);
