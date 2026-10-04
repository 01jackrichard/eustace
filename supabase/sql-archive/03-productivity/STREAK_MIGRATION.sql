-- ==============================================================================
-- EUSTACE STREAK MIGRATION (V2 - SECURE DATA LAYER)
-- Creates a dedicated user_stats table strictly protected by friends-only RLS
-- ==============================================================================

DO $$
BEGIN
    -- 1. Remove the insecure column from profiles if it was created during testing
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_streak') THEN
        ALTER TABLE public.profiles DROP COLUMN current_streak;
    END IF;

    -- 2. Create the secure stats table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_stats') THEN
        CREATE TABLE public.user_stats (
            user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
            current_streak integer DEFAULT 0,
            updated_at timestamp with time zone default timezone('utc'::text, now()) not null
        );
        
        ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
        
        -- Policy 1: Users can manage their own stats
        CREATE POLICY "Users can manage their own stats" ON public.user_stats
            FOR ALL USING (auth.uid() = user_id);
            
        -- Policy 2: Accepted friends can view stats.
        -- Uses addressee_id (from FRIENDS_MIGRATION V3). 
        -- If you have not run V3, change addressee_id to receiver_id here.
        CREATE POLICY "Accepted friends can view stats" ON public.user_stats
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.friendships 
                    WHERE status = 'accepted' 
                    AND (
                        (requester_id = auth.uid() AND addressee_id = user_stats.user_id) OR 
                        (addressee_id = auth.uid() AND requester_id = user_stats.user_id)
                    )
                )
            );
            
        -- Trigger for updated_at
        CREATE TRIGGER user_stats_updated_at BEFORE UPDATE ON public.user_stats 
            FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
            
        -- Enable realtime
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_stats'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.user_stats;
        END IF;
    END IF;
END $$;
