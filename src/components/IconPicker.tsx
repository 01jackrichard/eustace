import { useState } from 'react';
import * as Icons from 'lucide-react';
import { cn } from '../lib/utils';

export const ICON_CATEGORIES = [
  {
    name: 'Study & Knowledge',
    icons: ['BookOpen', 'Brain', 'GraduationCap', 'Library', 'NotebookPen', 'Pencil', 'Languages', 'Calculator', 'Lightbulb']
  },
  {
    name: 'Work & Technology',
    icons: ['Laptop', 'Code', 'Terminal', 'BriefcaseBusiness', 'Monitor', 'FileText', 'Target', 'FolderKanban']
  },
  {
    name: 'Health & Fitness',
    icons: ['Dumbbell', 'Activity', 'Footprints', 'Bike', 'HeartPulse', 'PersonStanding', 'Moon', 'Sun', 'Coffee', 'Droplets']
  },
  {
    name: 'Daily Life',
    icons: ['House', 'Utensils', 'Bed', 'Bath', 'Pill', 'ShoppingBasket', 'Wallet', 'CalendarDays']
  },
  {
    name: 'Hobbies & Personal',
    icons: ['Gamepad2', 'Music', 'Headphones', 'Camera', 'Palette', 'Trophy', 'Puzzle', 'Timer', 'Clock', 'Sparkles']
  },
  {
    name: 'General',
    icons: ['CheckCircle2', 'ListTodo', 'Star', 'Zap', 'Flag', 'Circle', 'Bookmark']
  }
];

interface IconPickerProps {
  selectedIcon: string | null;
  onSelect: (iconName: string) => void;
  onClose: () => void;
}

export function IconPicker({ selectedIcon, onSelect, onClose }: IconPickerProps) {
  const [search, setSearch] = useState('');

  const filteredCategories = ICON_CATEGORIES.map(cat => ({
    ...cat,
    icons: cat.icons.filter(icon => icon.toLowerCase().includes(search.toLowerCase()))
  })).filter(cat => cat.icons.length > 0);

  return (
    <div className="fixed inset-0 z-[110] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-surface border border-border/60 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col h-[70vh] md:h-[600px] animate-in slide-in-from-bottom-4 duration-200" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-4 border-b border-border/40 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-textMain tracking-wide uppercase">Select Icon</h3>
            <button onClick={onClose} className="p-1.5 text-textMuted hover:text-textMain hover:bg-white/5 rounded-lg transition-colors">
              <Icons.X size={18} />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              type="text"
              placeholder="Search icons..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-background border border-border/60 rounded-xl py-2 pl-9 pr-4 text-sm font-medium text-textMain placeholder:text-textMuted/50 focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>
        </div>

        {/* Icons */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
          {filteredCategories.map(cat => (
            <div key={cat.name}>
              <div className="text-[10px] font-bold tracking-[0.2em] text-textMuted uppercase mb-3 px-1">{cat.name}</div>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {cat.icons.map(iconName => {
                  const Icon = (Icons as any)[iconName];
                  if (!Icon) return null;
                  const isSelected = selectedIcon === iconName;
                  
                  return (
                    <button
                      key={iconName}
                      onClick={() => onSelect(iconName)}
                      title={iconName}
                      className={cn(
                        "aspect-square rounded-xl flex items-center justify-center transition-all",
                        isSelected 
                          ? "bg-accent/20 border-2 border-accent text-accent shadow-sm" 
                          : "border-2 border-transparent bg-background/50 hover:bg-white/5 text-textMuted hover:text-textMain"
                      )}
                    >
                      <Icon size={22} strokeWidth={isSelected ? 2.5 : 2} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredCategories.length === 0 && (
            <div className="py-12 text-center text-sm font-medium text-textMuted">
              No icons found for "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
