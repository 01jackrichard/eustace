import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Users, Trophy } from 'lucide-react';

export function MobileHeader() {
  const { profile } = useAuth();
  
  return (
    <div className="md:hidden fixed top-0 inset-x-0 bg-[#050505]/95 backdrop-blur-xl border-b border-border/60 z-50 px-5 flex items-center justify-between pt-[env(safe-area-inset-top)] h-[calc(56px+env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src="/logo.png" alt="Eustace Logo" className="h-5 w-5 object-contain" />
          <span className="text-[10px] md:text-xs font-bold tracking-widest text-textMain uppercase">EUSTACE</span>
        </Link>
      </div>
      
      <div className="flex items-center gap-4">
        <Link to="/friends" aria-label="Friends" className="text-textMuted hover:text-textMain transition-colors">
          <Users size={16} strokeWidth={2} />
        </Link>
        <Link to="/transcend" aria-label="Transcend" className="text-textMuted hover:text-textMain transition-colors">
          <Trophy size={16} strokeWidth={2} />
        </Link>
        <Link to="/settings" aria-label="Settings" className="text-textMuted hover:text-textMain transition-colors">
          <Settings size={16} strokeWidth={2} />
        </Link>
        <Link to="/profile" aria-label="Profile" className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center overflow-hidden shrink-0">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Profile Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[9px] font-bold text-textMain uppercase">
              {(profile?.display_name || profile?.username || 'U')[0]}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
