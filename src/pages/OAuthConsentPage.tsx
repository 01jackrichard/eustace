import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck, AlertCircle, Check, X, CalendarCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type AuthorizationDetails = {
  client?: {
    name?: string;
    uri?: string;
    logo_uri?: string;
  };
  redirect_uri?: string;
  scope?: string;
};

function safeInternalRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/dashboard';
  }
  return value;
}

export function OAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const authorizationId = searchParams.get('authorization_id');

  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      const currentRequest = window.location.pathname + window.location.search;
      navigate(`/login?redirect=${encodeURIComponent(currentRequest)}`, { replace: true });
      return;
    }

    if (!authorizationId) {
      setError('The authorization request is missing its ID. Return to ChatGPT and try connecting again.');
      setLoading(false);
      return;
    }

    let active = true;

    async function loadAuthorizationDetails() {
      setLoading(true);
      setError(null);

      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId!);

      if (!active) return;

      if (detailsError) {
        setError(detailsError.message || 'Could not load the authorization request.');
      } else {
        setDetails(data as AuthorizationDetails);
      }
      setLoading(false);
    }

    loadAuthorizationDetails();

    return () => {
      active = false;
    };
  }, [authorizationId, authLoading, user, navigate]);

  const decide = async (decision: 'approve' | 'deny') => {
    if (!authorizationId || submitting) return;

    setSubmitting(decision);
    setError(null);

    const result = decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

    if (result.error) {
      setError(result.error.message || `Could not ${decision} this connection.`);
      setSubmitting(null);
      return;
    }

    // Supabase validates the registered client redirect URI and returns the
    // authorization response URL. Do not construct or trust a redirect from
    // a query parameter supplied by the client.
    window.location.assign(result.data.redirect_url);
  };

  const clientName = details?.client?.name || 'ChatGPT';
  const scopes = (details?.scope || '').split(' ').filter(Boolean);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-2xl">
        <header className="border-b border-border/50 px-7 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
              <CalendarCheck size={21} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-textMuted">Eustace security</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-textMain">Connect an application</h1>
            </div>
          </div>
        </header>

        <div className="space-y-6 px-7 py-7">
          {loading || authLoading ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
              <p className="text-sm text-textMuted">Verifying your connection request…</p>
            </div>
          ) : error && !details ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <div className="flex items-center gap-2 font-semibold text-red-400">
                <AlertCircle size={17} /> Authorization unavailable
              </div>
              <p className="mt-2 text-sm leading-6 text-textMuted">{error}</p>
              <Link to="/settings" className="mt-4 inline-block text-sm font-semibold text-accent hover:underline">
                Return to Eustace
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/20 bg-accent/5 text-accent">
                  <ShieldCheck size={29} />
                </div>
                <h2 className="text-lg font-semibold text-textMain">{clientName} wants to connect</h2>
                <p className="text-sm leading-6 text-textMuted">
                  Allow this application to manage tasks in your Eustace account?
                </p>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-textMuted">Signed in as</p>
                <p className="mt-1 break-all text-sm font-semibold text-textMain">{user?.email || 'Your Eustace account'}</p>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-textMuted">Requested access</p>
                {[
                  ['View tasks', 'Read your task titles, dates, recurrence, notes, and completion status.'],
                  ['Create tasks', 'Add new tasks to your Eustace calendar.'],
                  ['Update tasks', 'Edit existing task details and recurrence settings.'],
                  ['Complete tasks', 'Mark tasks complete for your current local day only.'],
                  ['Delete tasks', 'Permanently delete task definitions and their completion history.'],
                ].map(([title, description]) => (
                  <div key={title} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <Check size={12} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-textMain">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-textMuted">{description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {scopes.length > 0 && (
                <p className="text-[11px] leading-5 text-textMuted">
                  OAuth identity scopes requested: {scopes.join(', ')}. Task permissions are enforced by the Eustace MCP service.
                </p>
              )}

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => decide('deny')}
                  disabled={submitting !== null}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-textMuted transition-colors hover:bg-white/5 hover:text-textMain disabled:opacity-50"
                >
                  {submitting === 'deny' ? <Loader2 size={16} className="animate-spin" /> : <X size={15} />}
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => decide('approve')}
                  disabled={submitting !== null}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-textMain text-sm font-semibold text-background transition-colors hover:bg-white disabled:opacity-50"
                >
                  {submitting === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <Check size={15} />}
                  Approve access
                </button>
              </div>

              <p className="text-center text-[11px] leading-5 text-textMuted">
                You can revoke this application’s access later from your Eustace account’s connected-app permissions.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
