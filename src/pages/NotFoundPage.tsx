import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background text-textMain flex flex-col items-center justify-center p-6 selection:bg-accent/30 selection:text-white">
      <div className="w-full max-w-md bg-surface border border-border/80 rounded-2xl p-8 shadow-2xl text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-xl bg-surfaceHover border border-border/80 flex items-center justify-center mb-6 text-accent">
          <Compass className="w-6 h-6" />
        </div>

        <div className="text-xs font-mono font-bold tracking-[0.25em] text-accent uppercase mb-2">
          404 ERROR
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-textMain mb-3">
          Page Not Found
        </h1>

        <p className="text-xs text-textMuted leading-relaxed mb-8 max-w-xs">
          The requested path does not exist in this workspace. You may have followed an outdated or broken link.
        </p>

        <Link
          to="/dashboard"
          className="w-full py-2.5 px-4 bg-textMain text-background hover:bg-white text-xs font-bold tracking-wider uppercase rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Return to Dashboard
        </Link>
      </div>

      <div className="mt-8 text-[11px] font-mono text-textMuted/40 uppercase tracking-widest">
        EUSTACE / PRODUCTIVITY SYSTEMS
      </div>
    </div>
  );
}
