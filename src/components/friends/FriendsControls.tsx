import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, LayoutGrid, List } from 'lucide-react';
import { cn } from '../../lib/utils';

export type FriendSortOption = 'recent' | 'username' | 'streak';
export type FriendStatusFilter = 'all' | 'online' | 'offline';
export type FriendViewMode = 'grid' | 'list';

interface FriendsControlsProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: FriendSortOption;
  onSortChange: (sort: FriendSortOption) => void;
  viewMode: FriendViewMode;
  onViewModeChange: (mode: FriendViewMode) => void;
  statusFilter: FriendStatusFilter;
  onStatusFilterChange: (filter: FriendStatusFilter) => void;
  totalCount: number;
  onlineCount: number;
  offlineCount: number;
}

const sortLabels: Record<FriendSortOption, string> = {
  recent: 'Recently active',
  username: 'Username',
  streak: 'Streak',
};

export function FriendsControls({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  statusFilter,
  onStatusFilterChange,
  totalCount,
  onlineCount,
  offlineCount,
}: FriendsControlsProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Close sort menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="w-full flex flex-col gap-3 select-none mb-5">
      {/* 1. TOP ROW: SEARCH & CONTROLS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Left: Search your friends */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
          <input
            type="text"
            placeholder="Search your friends..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#101313] hover:bg-[#141717] focus:bg-[#141717] border border-[#242828] focus:border-[#383D3D] text-xs text-[#EDEDED] rounded-xl pl-9 pr-3 py-2 outline-none transition-all placeholder:text-textMuted/60"
          />
        </div>

        {/* Right: Sort by & View Mode */}
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          {/* Sort By Dropdown */}
          <div className="relative flex items-center gap-1.5" ref={sortRef}>
            <span className="text-xs text-textMuted font-medium">Sort by</span>
            <button
              type="button"
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#101313] hover:bg-[#141717] border border-[#242828] text-xs font-semibold text-[#EDEDED] transition-colors"
            >
              <span>{sortLabels[sortBy]}</span>
              <ChevronDown size={13} className={cn('text-textMuted transition-transform', sortOpen && 'rotate-180')} />
            </button>

            {sortOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-36 py-1 bg-[#141717] border border-[#242828] rounded-xl shadow-xl z-30 flex flex-col">
                {(['recent', 'username', 'streak'] as FriendSortOption[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      onSortChange(option);
                      setSortOpen(false);
                    }}
                    className={cn(
                      'px-3 py-1.5 text-left text-xs transition-colors',
                      sortBy === option
                        ? 'text-emerald-400 bg-emerald-500/10 font-semibold'
                        : 'text-textMuted hover:text-[#EDEDED] hover:bg-white/[0.04]'
                    )}
                  >
                    {sortLabels[option]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grid / List View Toggle */}
          <div className="flex items-center p-0.5 bg-[#101313] border border-[#242828] rounded-lg">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'grid'
                  ? 'bg-[#1C2020] text-[#EDEDED] shadow-sm'
                  : 'text-textMuted hover:text-[#EDEDED]'
              )}
              title="Grid View"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'list'
                  ? 'bg-[#1C2020] text-[#EDEDED] shadow-sm'
                  : 'text-textMuted hover:text-[#EDEDED]'
              )}
              title="List View"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. BOTTOM ROW: FRIENDS LABEL & FILTER PILLS */}
      <div className="flex items-center justify-between pt-1">
        {/* Section title */}
        <div className="text-[11px] font-bold tracking-[0.2em] text-[#8E9292] uppercase">
          FRIENDS <span className="text-[#8E9292]/70 font-normal">({totalCount})</span>
        </div>

        {/* Status Filter Pills: All | Online | Offline */}
        <div className="flex items-center gap-1.5">
          {/* All */}
          <button
            type="button"
            onClick={() => onStatusFilterChange('all')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all',
              statusFilter === 'all'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-[#101313] hover:bg-[#141717] text-textMuted border border-[#242828]'
            )}
          >
            <span>All</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold leading-tight',
                statusFilter === 'all'
                  ? 'bg-emerald-400 text-black'
                  : 'bg-white/[0.06] text-textMuted'
              )}
            >
              {totalCount}
            </span>
          </button>

          {/* Online */}
          <button
            type="button"
            onClick={() => onStatusFilterChange('online')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all',
              statusFilter === 'online'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-[#101313] hover:bg-[#141717] text-textMuted border border-[#242828]'
            )}
          >
            <span>Online</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold leading-tight',
                statusFilter === 'online'
                  ? 'bg-emerald-400 text-black'
                  : 'bg-white/[0.06] text-textMuted'
              )}
            >
              {onlineCount}
            </span>
          </button>

          {/* Offline */}
          <button
            type="button"
            onClick={() => onStatusFilterChange('offline')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all',
              statusFilter === 'offline'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-[#101313] hover:bg-[#141717] text-textMuted border border-[#242828]'
            )}
          >
            <span>Offline</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold leading-tight',
                statusFilter === 'offline'
                  ? 'bg-emerald-400 text-black'
                  : 'bg-white/[0.06] text-textMuted'
              )}
            >
              {offlineCount}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default FriendsControls;
