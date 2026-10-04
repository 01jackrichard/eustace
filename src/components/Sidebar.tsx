import { NavLink } from 'react-router-dom';
import { LayoutDashboard, User as UserIcon, Calendar, CheckSquare, BarChart2, Users, Settings, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { useState } from 'react';

export function Sidebar() {
  const { user, profile, signOut } = useAuth();
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Calendar', path: '/calendar', icon: Calendar },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare },
    { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    { name: 'Friends', path: '/friends', icon: Users },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-background border-r border-border/60 hidden md:flex flex-col z-40">
      <div className="p-6 pb-4">
        <h1 className="text-sm font-bold tracking-widest text-textMain uppercase">EUSTACE</h1>
      </div>

      <nav className="flex-1 px-4 flex flex-col gap-0.5 overflow-y-auto mt-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group",
              isActive 
                ? "bg-surface text-textMain border-border/40 shadow-sm" 
                : "text-textMuted hover:text-textMain hover:bg-surface/50 border-transparent"
            )}
          >
            <item.icon size={16} className={cn("transition-colors", "group-hover:text-accent", "text-textMuted")} />
            {item.name}
          </NavLink>
        ))}

        <div className="mt-auto mb-4 border-t border-border/50 pt-4 flex flex-col gap-1">
          <NavLink
            to="/profile"
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group border",
              isActive 
                ? "bg-surface text-textMain border-border/40 shadow-sm" 
                : "text-textMuted hover:text-textMain hover:bg-surface/50 border-transparent"
            )}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-4 h-4 rounded-full object-cover" />
            ) : (
              <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center shrink-0">
                <UserIcon size={10} />
              </div>
            )}
            <span className="truncate">{profile?.username ? '@' + profile.username : 'Complete Profile'}</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group",
              isActive 
                ? "bg-surface text-textMain border-border/40 shadow-sm" 
                : "text-textMuted hover:text-textMain hover:bg-surface/50 border-transparent"
            )}
          >
            <Settings size={16} className="text-textMuted group-hover:text-textMain transition-colors" />
            Settings
          </NavLink>
        </div>
      </nav>

      <div className="p-4 relative">
        <button 
          onClick={() => setShowAccountMenu(!showAccountMenu)}
          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-surface/50 transition-colors text-left group"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile?.display_name || profile?.full_name || ""} className="w-8 h-8 rounded-full border border-border/50 object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-surface border border-border/50 flex items-center justify-center text-xs font-bold text-textMain">
                {(profile?.display_name || profile?.full_name)?.substring(0, 1).toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold text-textMain truncate leading-tight">{(profile?.display_name || profile?.full_name)}</span>
              <span className="text-xs text-textMuted truncate">{user?.email}</span>
            </div>
          </div>
          <ChevronDown size={14} className="text-textMuted group-hover:text-textMain transition-colors" />
        </button>

        {showAccountMenu && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-pop">
            <button 
              onClick={signOut}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

