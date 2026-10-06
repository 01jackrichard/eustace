import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Users } from 'lucide-react';

export function MobileHeader() {
  const { profile } = useAuth();
  
  return (
    <div className="md:hidden fixed top-0 inset-x-0 bg-[#050505]/95 backdrop-blur-xl border-b border-border/60 z-50 px-5 flex items-center justify-between pt-[env(safe-area-inset-top)] h-[calc(56px+env(safe-area-inset-top))]">
      <Link to="/dashboard" className="text-xs font-bold tracking-widest text-textMain uppercase">EUSTACE</Link>
      
      <div className="flex items-center gap-5">
        <Link to="/friends" className="text-textMuted hover:text-textMain transition-colors">
          <Users size={18} strokeWidth={2} />
        </Link>
        <Link to="/settings" className="text-textMuted hover:text-textMain transition-colors">
          <Settings size={18} strokeWidth={2} />
        </Link>
        <Link to="/profile" className="w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center overflow-hidden shrink-0">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-bold text-textMain uppercase">
              {(profile?.display_name || profile?.username || 'U')[0]}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
