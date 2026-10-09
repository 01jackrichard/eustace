import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { DataManager, calculateStreakFromDates } from '../lib/dataManager';

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  full_name?: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  visibility: 'private' | 'friends' | 'public';
  current_streak?: number;
};

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  checkLocalData: () => boolean;
  migrateLocalData: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  checkLocalData: () => false,
  migrateLocalData: async () => {},
  refreshProfile: async () => {}
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const [profileRes, statsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('user_stats').select('current_streak').eq('user_id', userId).maybeSingle()
      ]);

      if (!profileRes.error && profileRes.data) {
        let currentStreak = statsRes.data?.current_streak ?? 0;

        if (currentStreak === 0) {
          const { data: completions } = await supabase
            .from('task_completions')
            .select('completed_date')
            .eq('user_id', userId)
            .order('completed_date', { ascending: false })
            .limit(30);

          if (completions && completions.length > 0) {
            currentStreak = calculateStreakFromDates(completions.map(c => c.completed_date));
            if (currentStreak > 0) {
              supabase.from('user_stats').upsert({ user_id: userId, current_streak: currentStreak }).then();
            }
          }
        }

        setProfile({
          ...profileRes.data,
          current_streak: currentStreak
        } as Profile);
      }
    } catch (err) {
      console.warn('[AUTH] Error fetching user profile and stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const signOut = async () => {
    try {
      DataManager.clearData();
      sessionStorage.clear();
      setUser(null);
      setProfile(null);
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[AUTH] Error during sign out:', err);
    }
  };

  const checkLocalData = () => {
    const data = localStorage.getItem('productivity-tracker-data');
    if (!data) return false;
    try {
      const parsed = JSON.parse(data);
      return Object.keys(parsed?.days || {}).length > 0;
    } catch {
      return false;
    }
  };

  const migrateLocalData = async () => {
    if (!user) return;
    const local = DataManager.loadData();
    if (!local || Object.keys(local.days).length === 0) return;

    try {
      const { data: result, error: rpcError } = await supabase.rpc('migrate_user_local_data', {
        payload: local
      });

      if (!rpcError && result?.success) {
        DataManager.clearData();
        return;
      }
    } catch (err) {
      console.warn('[MIGRATION] Atomic RPC migration failed, maintaining local backup:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, checkLocalData, migrateLocalData, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

