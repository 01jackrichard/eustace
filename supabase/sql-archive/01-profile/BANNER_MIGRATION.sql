-- Add cover_image_url to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Create the profile-covers storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-covers', 'profile-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to profile-covers
CREATE POLICY "Public profiles covers are viewable by everyone."
ON storage.objects FOR SELECT
USING ( bucket_id = 'profile-covers' );

-- Allow users to upload their own covers
CREATE POLICY "Users can upload their own covers."
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-covers' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to update their own covers
CREATE POLICY "Users can update their own covers."
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile-covers' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own covers
CREATE POLICY "Users can delete their own covers."
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profile-covers' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
