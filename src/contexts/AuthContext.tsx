import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { DataManager } from '../lib/dataManager';

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
  refreshProfile: async () => {},
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

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!error && data) {
      setProfile(data as Profile);
    }
    setLoading(false);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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

    const taskMap = new Map<string, string>(); 

    for (const rt of local.recurringTasks) {
      const { data: insertedTask, error } = await supabase.from('tasks').insert({
        user_id: user.id,
        name: rt.name,
        category: rt.category,
        duration: rt.duration,
        recurring: rt.recurring,
        created_at: rt.createdAt
      }).select('id').single();

      if (insertedTask && !error) {
        taskMap.set(rt.id, insertedTask.id);
      }
    }

    for (const [dateStr, dayData] of Object.entries(local.days)) {
      if (dayData.note || dayData.manualCompletion) {
        await supabase.from('daily_data').insert({
          user_id: user.id,
          date: dateStr,
          note: dayData.note || null,
          manual_completion: dayData.manualCompletion || false
        });
      }

      for (const t of dayData.tasks) {
        const { data: insertedTask, error } = await supabase.from('tasks').insert({
          user_id: user.id,
          name: t.name,
          category: t.category,
          duration: t.duration,
          recurring: 'none',
          created_at: dateStr
        }).select('id').single();
        
        if (insertedTask && !error) {
          taskMap.set(t.id, insertedTask.id);
        }
      }

      for (const oldTaskId of dayData.completedTaskIds) {
        const newTaskId = taskMap.get(oldTaskId);
        if (newTaskId) {
          await supabase.from('task_completions').insert({
            user_id: user.id,
            task_id: newTaskId,
            completed_date: dateStr
          });
        }
      }
    }

    DataManager.clearData();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, checkLocalData, migrateLocalData, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

