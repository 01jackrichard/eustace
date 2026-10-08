import { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { cn } from '../lib/utils';

export function ProtectedLayout() {
  const { user, profile, loading, refreshProfile } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <ProfileSetupFlow onComplete={refreshProfile} />;
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Sidebar />
      <MobileHeader />
      
      <main className="flex-1 flex flex-col md:pl-64 pt-[calc(56px+env(safe-area-inset-top))] pb-[calc(60px+env(safe-area-inset-bottom))] md:pt-0 md:pb-0 min-h-[100dvh]">
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}

function ProfileSetupFlow({ onComplete }: { onComplete: () => Promise<void> }) {
  const { user } = useAuth();
  const [username, setUsername] = useState((user?.user_metadata?.username as string) || '');
  const [name, setName] = useState(user?.user_metadata?.full_name || user?.user_metadata?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedUsername = useDebounce(username.toLowerCase().trim(), 400);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  const validateUsername = (u: string) => {
    return /^[a-z0-9_]{3,20}$/.test(u);
  };

  useEffect(() => {
    async function checkUsername() {
      if (!debouncedUsername) {
        setUsernameStatus('idle');
        return;
      }
      if (!validateUsername(debouncedUsername)) {
        setUsernameStatus('invalid');
        return;
      }
      setUsernameStatus('checking');

      let isAvailable = true;
      try {
        const { data: rpcAvailable, error: rpcError } = await supabase.rpc('check_username_available', {
          target_username: debouncedUsername
        });
        if (!rpcError && typeof rpcAvailable === 'boolean') {
          isAvailable = rpcAvailable;
        } else {
          const { data: existingUser } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', debouncedUsername)
            .maybeSingle();
          if (existingUser && existingUser.id !== user?.id) {
            isAvailable = false;
          }
        }
      } catch {
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', debouncedUsername)
          .maybeSingle();
        if (existingUser && existingUser.id !== user?.id) {
          isAvailable = false;
        }
      }

      setUsernameStatus(isAvailable ? 'available' : 'taken');
    }
    checkUsername();
  }, [debouncedUsername, user?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanUsername = username.toLowerCase().trim();
    if (!name.trim() || !validateUsername(cleanUsername)) return;

    setSaving(true);
    setError(null);

    // Final pre-flight availability check
    try {
      const { data: rpcAvailable, error: rpcError } = await supabase.rpc('check_username_available', {
        target_username: cleanUsername
      });
      if (!rpcError && rpcAvailable === false) {
        setError('Username is already taken. Please choose another.');
        setUsernameStatus('taken');
        setSaving(false);
        return;
      }
    } catch {
      // Proceed to DB upsert which enforces DB-level unique index
    }

    const { error: insertError } = await supabase.from('profiles').upsert({
      id: user.id,
      username: cleanUsername,
      full_name: name.trim(),
      display_name: name.trim(),
      avatar_url: user?.user_metadata?.avatar_url || null,
      visibility: 'public'
    }, { onConflict: 'id' });

    if (insertError) {
      if (insertError.message.toLowerCase().includes('unique') || insertError.message.toLowerCase().includes('duplicate')) {
        setError('This username is already taken. Please choose another.');
        setUsernameStatus('taken');
      } else {
        setError(insertError.message);
      }
      setSaving(false);
    } else {
      await supabase.from('user_preferences').upsert({ user_id: user.id }, { onConflict: 'user_id' });
      await supabase.from('user_stats').upsert({ user_id: user.id, current_streak: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });
      await onComplete();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background animate-fade-in">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-textMain mb-2 text-center">Complete your profile</h1>
        <p className="text-textMuted text-sm text-center mb-8">Choose a username to enter Eustace</p>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-6">{error}</div>}

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Display Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" 
              placeholder="How should we call you?"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required 
              className={cn(
                "w-full bg-background border rounded-xl px-4 py-2.5 text-sm outline-none transition-colors",
                usernameStatus === 'invalid' ? "border-red-500/50 focus:border-red-500" :
                usernameStatus === 'taken' ? "border-red-500/50 focus:border-red-500" :
                usernameStatus === 'available' ? "border-green-500/50 focus:border-green-500" :
                "border-border focus:border-accent/50"
              )}
              placeholder="e.g. john_doe"
            />
            <div className="mt-1.5 h-4 flex items-center">
              {usernameStatus === 'checking' && <span className="text-xs text-textMuted flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Checking...</span>}
              {usernameStatus === 'available' && <span className="text-xs text-green-500">Username available</span>}
              {usernameStatus === 'taken' && <span className="text-xs text-red-500">Username is already taken</span>}
              {usernameStatus === 'invalid' && <span className="text-xs text-red-500">3-20 letters, numbers, or underscores</span>}
            </div>
          </div>

          <button 
            type="submit" 
            disabled={saving || usernameStatus !== 'available' || !name.trim()} 
            className="w-full bg-textMain text-background hover:bg-white font-semibold py-2.5 rounded-xl mt-4 transition-colors flex justify-center items-center h-11 disabled:opacity-50 disabled:hover:bg-textMain"
          >
            {saving ? <Loader2 className="animate-spin w-5 h-5" /> : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
