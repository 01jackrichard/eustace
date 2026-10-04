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
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // Check if username exists
    const { data: existingUser } = await supabase.from('profiles').select('id').eq('username', username).single();
    if (existingUser) {
      setError('Username is already taken.');
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    
    if (authError) {
      setError(authError.message);
    } else if (authData.user) {
      // Create profile
      await supabase.from('profiles').insert({
        id: authData.user.id,
        username,
        full_name: name,
        visibility: 'public'
      });
      navigate('/dashboard');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background animate-fade-in py-12">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-textMain mb-2 text-center">Create account</h1>
        <p className="text-textMuted text-sm text-center mb-8">Start building your productive year</p>
        
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-6">{error}</div>}
        
        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required pattern="^[a-zA-Z0-9_]{3,15}$" title="Alphanumeric and underscores, 3-15 chars" className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider text-textMuted mb-1.5 uppercase">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:border-accent/50 outline-none transition-colors" />
          </div>
          
          <button type="submit" disabled={loading} className="w-full bg-textMain text-background hover:bg-white font-semibold py-2.5 rounded-xl mt-4 transition-colors flex justify-center items-center h-11">
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
