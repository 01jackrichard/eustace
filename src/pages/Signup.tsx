import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Mail, ExternalLink, ArrowLeft } from 'lucide-react';

export function Signup() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) return <Navigate to="/dashboard" replace />;

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    setError('');

    if (import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL.trim() === '') {
      setError('Configuration Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing in your .env.local file. Please add your real Supabase credentials to sign up.');
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const cleanUsername = username.toLowerCase().trim();

    if (import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL.trim() === '') {
      setError('Configuration Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing in your .env.local file. Please add your real Supabase credentials to sign up.');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      setLoading(false);
      return;
    }

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setError('Username must be 3-20 characters and contain only letters, numbers, or underscores.');
      setLoading(false);
      return;
    }

    // Check if username exists via SECURITY DEFINER RPC (bypasses RLS visibility)
    let isAvailable = true;
    try {
      const { data: rpcAvailable, error: rpcError } = await supabase.rpc('check_username_available', {
        target_username: cleanUsername
      });
      if (!rpcError && typeof rpcAvailable === 'boolean') {
        isAvailable = rpcAvailable;
      } else {
        // Fallback check
        const { data: existingUser } = await supabase.from('profiles').select('id').eq('username', cleanUsername).maybeSingle();
        if (existingUser) isAvailable = false;
      }
    } catch {
      const { data: existingUser } = await supabase.from('profiles').select('id').eq('username', cleanUsername).maybeSingle();
      if (existingUser) isAvailable = false;
    }

    if (!isAvailable) {
      setError('Username is already taken. Please choose another.');
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          username: cleanUsername,
          full_name: name.trim(),
          name: name.trim()
        }
      }
    });

    if (authError) {
      if (authError.message === 'Failed to fetch') {
        setError('Network Error: Failed to fetch. Please verify your VITE_SUPABASE_URL in .env.local is correct.');
      } else {
        setError(authError.message);
      }
    } else if (authData.user) {
      if (authData.session) {
        // Upsert profile row immediately when session is active
        await supabase.from('profiles').upsert({
          id: authData.user.id,
          username: cleanUsername,
          full_name: name.trim(),
          display_name: name.trim(),
          visibility: 'public',
          activity_visibility: 'public'
        }, { onConflict: 'id' });
        navigate('/dashboard');
      } else {
        // Confirmation email required: show dedicated confirmation view
        setSubmittedEmail(email);
        setEmailSent(true);
      }
    }
    
    setLoading(false);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background animate-fade-in">
        <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <Mail className="w-7 h-7 text-accent" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-textMain mb-3">Check your inbox</h1>
          <p className="text-textMuted text-sm leading-relaxed mb-6">
            We sent a verification link to{' '}
            <span className="text-textMain font-semibold break-all">{submittedEmail}</span>.
            Click the link in your email to activate your Eustace workspace.
          </p>

          <div className="flex flex-col gap-3">
            <a
              href="https://mail.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-textMain text-background hover:bg-white font-semibold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 text-sm"
            >
              Open Gmail <ExternalLink size={16} />
            </a>

            <Link
              to="/login"
              className="w-full bg-background border border-border hover:border-accent/40 text-textMain font-medium py-3 rounded-xl transition-colors flex justify-center items-center gap-2 text-sm"
            >
              <ArrowLeft size={16} /> Back to Log In
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-border/50 text-xs text-textMuted leading-relaxed">
            Didn't receive an email? Check your spam folder or try logging in to resend verification.
          </div>
        </div>
      </div>
    );
  }

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
