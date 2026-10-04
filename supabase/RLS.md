# Row Level Security (RLS) Documentation

This outlines the intended active RLS policies across the Eustace database.

## Principles
- **Profiles**: Fully public. Any authenticated user can read any profile.
- **Tasks & Notes**: Strictly private. Users can only access their own.
- **Social Graph**: Bidirectional. Users can read/interact with requests where they are either the requester or the addressee.

## Policies by Table

### `public.profiles`
* **SELECT**: `USING (true)` (Profiles are viewable by all authenticated users)
* **INSERT**: `WITH CHECK (auth.uid() = id)`
* **UPDATE**: `USING (auth.uid() = id)`
* *(Deletions handled by cascading from auth.users)*

### `public.friendships`
* **SELECT**: `USING (auth.uid() = requester_id OR auth.uid() = addressee_id)`
* **INSERT**: `WITH CHECK (auth.uid() = requester_id)`
* **UPDATE**: `USING (auth.uid() = requester_id OR auth.uid() = addressee_id)`
* **DELETE**: `USING (auth.uid() = requester_id OR auth.uid() = addressee_id)`
*(State transitions are additionally locked down by the `enforce_friendship_security` trigger).*

### `public.tasks`
* **SELECT**: `USING (auth.uid() = user_id)`
* **INSERT**: `WITH CHECK (auth.uid() = user_id)`
* **UPDATE**: `USING (auth.uid() = user_id)`
* **DELETE**: `USING (auth.uid() = user_id)`

### `public.task_completions`
* **SELECT**: `USING (auth.uid() = user_id)`
* **INSERT**: `WITH CHECK (auth.uid() = user_id)`
* **DELETE**: `USING (auth.uid() = user_id)`

### `public.daily_data`
* **SELECT**: `USING (auth.uid() = user_id)`
* **INSERT**: `WITH CHECK (auth.uid() = user_id)`
* **UPDATE**: `USING (auth.uid() = user_id)`

### `public.user_preferences`
* **SELECT, INSERT, UPDATE, DELETE**: `USING (auth.uid() = user_id)`

### `public.user_stats`
* **SELECT**: `USING (auth.uid() = user_id OR EXISTS(SELECT 1 FROM friendships WHERE status='accepted' AND (requester_id = auth.uid() AND addressee_id = user_id) OR ...))` (Friends-only viewable)
* **INSERT, UPDATE**: `USING (auth.uid() = user_id)`

## Storage Policies
### Buckets: `profile-images`, `profile-covers`
* **SELECT**: `USING (bucket_id = '[bucket-name]')` (Publicly readable)
* **INSERT, UPDATE, DELETE**: `WITH CHECK (bucket_id = '[bucket-name]' AND auth.uid()::text = (storage.foldername(name))[1])` (Owner only based on path structure)
