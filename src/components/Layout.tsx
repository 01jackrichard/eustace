import { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
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

  // Profile setup intercept for OAuth users
  if (!profile) {
    return <ProfileSetupFlow onComplete={refreshProfile} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/* Mobile nav could go here */}
      <main className="md:pl-64 flex flex-col min-h-screen">
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function ProfileSetupFlow({ onComplete }: { onComplete: () => Promise<void> }) {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [name, setName] = useState(user?.user_metadata?.full_name || user?.user_metadata?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedUsername = useDebounce(username, 500);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  const validateUsername = (u: string) => {
    return /^[a-zA-Z0-9_]{3,20}$/.test(u);
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
      const { data } = await supabase.from('profiles').select('id').eq('username', debouncedUsername).single();
      if (data) {
        setUsernameStatus('taken');
      } else {
        setUsernameStatus('available');
      }
    }
    checkUsername();
  }, [debouncedUsername]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (usernameStatus !== 'available' || !name.trim()) return;

    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      username: username.trim(),
      full_name: name.trim(),
      display_name: name.trim(),
      avatar_url: user?.user_metadata?.avatar_url || null,
      visibility: 'public'
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
    } else {
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
