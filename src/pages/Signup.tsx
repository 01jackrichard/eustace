import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function Signup() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) return <Navigate to="/dashboard" replace />;

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      setLoading(false);
      return;
    }

    // Check if username exists
    const { data: existingUser } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
    if (existingUser) {
      setError('Username is already taken.');
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          username,
          full_name: name,
          name
        }
      }
    });

    if (authError) {
      setError(authError.message);
    } else if (authData.user) {
      if (authData.session) {
        // Fallback upsert in case trigger is pending
        await supabase.from('profiles').upsert({
          id: authData.user.id,
          username,
          full_name: name,
          display_name: name,
          visibility: 'public',
          activity_visibility: 'public'
        }, { onConflict: 'id' });
        navigate('/dashboard');
      } else {
        // Confirmation email required by Supabase auth configuration
        setError('Please check your email to confirm your account before logging in.');
      }
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background animate-fade-in">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-textMain mb-2 text-center">Create account</h1>
        <p className="text-textMuted text-sm text-center mb-8">Join Eustace to organize your life</p>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-6">{error}</div>}

        <button 
          onClick={handleGoogleSignup} 
          disabled={googleLoading || loading}
          className="w-full bg-background border border-border hover:border-accent/50 text-textMain font-semibold py-2.5 rounded-xl transition-colors flex justify-center items-center h-11 gap-3 disabled:opacity-50"
        >
          {googleLoading ? (
            <Loader2 className="animate-spin w-5 h-5" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/60"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
            <span className="bg-surface px-4 text-textMuted/50">Or</span>
          </div>
        </div>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>

          <button type="submit" disabled={loading || googleLoading} className="w-full bg-textMain text-background hover:bg-white font-semibold py-2.5 rounded-xl mt-4 transition-colors flex justify-center items-center h-11 disabled:opacity-50 disabled:hover:bg-textMain">
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Sign Up"}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-textMuted">
          Already have an account? <Link to="/login" className="text-accent hover:underline">Log in</Link>
        </div>
      </div>
    </div>
  );
}
