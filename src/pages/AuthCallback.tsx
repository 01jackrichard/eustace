import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    async function handleAuth() {
      try {
        // Check current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (session) {
          if (mounted) {
            setStatus('success');
            setTimeout(() => {
              if (mounted) navigate('/dashboard', { replace: true });
            }, 800);
          }
          return;
        }

        // Listen for session exchange
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (!mounted) return;
          if (event === 'SIGNED_IN' && session) {
            setStatus('success');
            setTimeout(() => {
              if (mounted) navigate('/dashboard', { replace: true });
            }, 800);
          } else if (event === 'USER_UPDATED' && session) {
            setStatus('success');
            setTimeout(() => {
              if (mounted) navigate('/dashboard', { replace: true });
            }, 800);
          }
        });

        // Timeout fallback after 6 seconds
        const timeout = setTimeout(() => {
          if (mounted && status === 'verifying') {
            setStatus('error');
            setErrorMessage('Session verification timed out. Please try logging in directly.');
          }
        }, 6000);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      } catch (err: any) {
        if (mounted) {
          setStatus('error');
          setErrorMessage(err.message || 'Failed to complete authentication.');
        }
      }
    }

    handleAuth();

    return () => {
      mounted = false;
    };
  }, [navigate, status]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background animate-fade-in">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-2xl text-center">
        {status === 'verifying' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-10 h-10 animate-spin text-accent" />
            <h1 className="text-xl font-bold text-textMain tracking-tight">Verifying your account</h1>
            <p className="text-textMuted text-xs leading-relaxed max-w-xs">
              Confirming your security credentials and preparing your workspace...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
            <h1 className="text-xl font-bold text-textMain tracking-tight">Account verified</h1>
            <p className="text-textMuted text-xs leading-relaxed max-w-xs">
              Redirecting you to your dashboard...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <h1 className="text-xl font-bold text-textMain tracking-tight">Authentication Notice</h1>
            <p className="text-textMuted text-xs leading-relaxed max-w-xs mb-2">
              {errorMessage}
            </p>
            <Link
              to="/login"
              className="px-6 py-2.5 bg-textMain text-background hover:bg-white text-xs font-bold tracking-widest uppercase rounded-xl transition-colors"
            >
              Go to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
