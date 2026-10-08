import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) return <Navigate to="/dashboard" replace />;

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');

    if (import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL.trim() === '') {
      setError('Configuration Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing in your .env.local file. Please add your real Supabase credentials to log in.');
      setGoogleLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (error) {
      if (error.message === 'Failed to fetch') {
        setError('Network Error: Failed to fetch. Please verify your VITE_SUPABASE_URL in .env.local is correct.');
      } else {
        setError(error.message);
      }
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Handle missing configuration gracefully
    if (import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL.trim() === '') {
      setError('Configuration Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing in your .env.local file. Please add your real Supabase credentials to log in.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message === 'Failed to fetch') {
        setError('Network Error: Failed to fetch. Please verify your VITE_SUPABASE_URL in .env.local is correct and your internet connection is active.');
      } else {
        setError(error.message);
      }
    }
    else navigate('/dashboard');

    setLoading(false);
  };

  const isUnconfirmedEmail = error.toLowerCase().includes('email not confirmed');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background animate-fade-in">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-textMain mb-2 text-center">Welcome back</h1>
        <p className="text-textMuted text-sm text-center mb-8">Sign in to your Eustace workspace</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-xl mb-6">
            <p className="font-semibold">{error}</p>
            {isUnconfirmedEmail && (
              <div className="mt-3 pt-3 border-t border-red-500/20 flex flex-col gap-2">
                <p className="text-xs text-textMuted">
                  Please check your Gmail or email inbox for your activation link before signing in.
                </p>
                <a
                  href="https://mail.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold rounded-lg transition-colors w-fit"
                >
                  Open Gmail
                </a>
              </div>
            )}
          </div>
        )}

        <button 
          onClick={handleGoogleLogin} 
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

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>

          <button type="submit" disabled={loading || googleLoading} className="w-full bg-textMain text-background hover:bg-white font-semibold py-2.5 rounded-xl mt-4 transition-colors flex justify-center items-center h-11 disabled:opacity-50 disabled:hover:bg-textMain">
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Log In"}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-textMuted">
          Don't have an account? <Link to="/signup" className="text-accent hover:underline">Sign up</Link>
        </div>
      </div>
    </div>
  );
}
