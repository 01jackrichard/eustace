import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Calendar, CheckSquare, FileText, BarChart2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function MobileBottomNav() {
  const navItems = [
    { name: 'Home', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Calendar', path: '/calendar', icon: Calendar },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare },
    { name: 'Notes', path: '/notes', icon: FileText },
    { name: 'Stats', path: '/analytics', icon: BarChart2 },
  ];

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 bg-[#050505]/95 backdrop-blur-xl border-t border-border/60 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-2 h-[60px]">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex flex-col items-center justify-center w-16 h-full gap-1 text-[10px] font-medium transition-colors",
              isActive ? "text-textMain" : "text-textMuted hover:text-textMain"
            )}
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} className={cn(isActive && "text-textMain")} />
                <span className="scale-[0.85]">{item.name}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
