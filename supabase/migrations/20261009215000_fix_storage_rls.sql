DO $block$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    
    DROP POLICY IF EXISTS "Users can upload their own avatars and covers" ON storage.objects;
    DROP POLICY IF EXISTS "Users can update their own avatars and covers" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own avatars and covers" ON storage.objects;
    
    -- Modern Supabase Storage uses owner_id for the UUID
    CREATE POLICY "Users can upload their own avatars and covers" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id IN ('profile-images', 'profile-covers') AND
      (
        auth.uid() = owner_id OR
        auth.uid() = owner OR
        (storage.foldername(name))[1] = auth.uid()::text OR
        name LIKE (auth.uid()::text || '-%')
      )
    );

    CREATE POLICY "Users can update their own avatars and covers" ON storage.objects
    FOR UPDATE USING (
      bucket_id IN ('profile-images', 'profile-covers') AND
      (
        auth.uid() = owner_id OR
        auth.uid() = owner OR
        (storage.foldername(name))[1] = auth.uid()::text OR
        name LIKE (auth.uid()::text || '-%')
      )
    );

    CREATE POLICY "Users can delete their own avatars and covers" ON storage.objects
    FOR DELETE USING (
      bucket_id IN ('profile-images', 'profile-covers') AND
      (
        auth.uid() = owner_id OR
        auth.uid() = owner OR
        (storage.foldername(name))[1] = auth.uid()::text OR
        name LIKE (auth.uid()::text || '-%')
      )
    );

  END IF;
END $block$;
