import { Users, MessageSquare, UserCheck, Search, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

export type FriendsTab = 'connections' | 'messages' | 'requests';

interface FriendsTopNavProps {
  activeTab: FriendsTab;
  onTabChange: (tab: FriendsTab) => void;
  pendingRequestsCount: number;
  unreadMessagesCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenFindPeople: () => void;
}

export function FriendsTopNav({
  activeTab,
  onTabChange,
  pendingRequestsCount,
  unreadMessagesCount,
  searchQuery,
  onSearchChange,
  onOpenFindPeople,
}: FriendsTopNavProps) {
  return (
    <header className="w-full px-4 md:px-8 py-3.5 border-b border-[#242828]/60 bg-[#0A0A0A]/95 backdrop-blur-md flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0 z-30 select-none">
      {/* 1. LEFT: TABS (Connections | Messages | Requests) */}
      <nav className="flex items-center gap-1 p-1 bg-[#101313] border border-[#242828] rounded-xl self-start sm:self-auto">
        {/* Connections Tab */}
        <button
          type="button"
          onClick={() => onTabChange('connections')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all relative',
            activeTab === 'connections'
              ? 'bg-[#181B1B] text-[#EDEDED] shadow-sm'
              : 'text-textMuted hover:text-[#EDEDED] hover:bg-white/[0.03]'
          )}
        >
          <Users size={14} className={activeTab === 'connections' ? 'text-emerald-400' : 'text-textMuted'} />
          <span>Connections</span>
          {activeTab === 'connections' && (
            <span className="absolute -bottom-1 left-3 right-3 h-[2px] bg-emerald-500 rounded-full" />
          )}
        </button>

        {/* Messages Tab */}
        <button
          type="button"
          onClick={() => onTabChange('messages')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all relative',
            activeTab === 'messages'
              ? 'bg-[#181B1B] text-[#EDEDED] shadow-sm'
              : 'text-textMuted hover:text-[#EDEDED] hover:bg-white/[0.03]'
          )}
        >
          <MessageSquare size={14} className={activeTab === 'messages' ? 'text-emerald-400' : 'text-textMuted'} />
          <span>Messages</span>
          {unreadMessagesCount > 0 && (
            <span className="px-1.5 py-0.2 min-w-[17px] text-[10px] font-bold text-black bg-emerald-400 rounded-full text-center leading-tight">
              {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
            </span>
          )}
          {activeTab === 'messages' && (
            <span className="absolute -bottom-1 left-3 right-3 h-[2px] bg-emerald-500 rounded-full" />
          )}
        </button>

        {/* Requests Tab */}
        <button
          type="button"
          onClick={() => onTabChange('requests')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all relative',
            activeTab === 'requests'
              ? 'bg-[#181B1B] text-[#EDEDED] shadow-sm'
              : 'text-textMuted hover:text-[#EDEDED] hover:bg-white/[0.03]'
          )}
        >
          <UserCheck size={14} className={activeTab === 'requests' ? 'text-emerald-400' : 'text-textMuted'} />
          <span>Requests</span>
          {pendingRequestsCount > 0 && (
            <span className="w-4 h-4 text-[10px] font-bold text-black bg-emerald-400 rounded-full flex items-center justify-center leading-none">
              {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
            </span>
          )}
          {activeTab === 'requests' && (
            <span className="absolute -bottom-1 left-3 right-3 h-[2px] bg-emerald-500 rounded-full" />
          )}
        </button>
      </nav>

      {/* 2. RIGHT: SEARCH INPUT & FIND PEOPLE BUTTON */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1 sm:w-60 md:w-64">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
          <input
            type="text"
            placeholder="Search users or friends..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#101313] hover:bg-[#141717] focus:bg-[#141717] border border-[#242828] focus:border-emerald-500/50 text-xs text-[#EDEDED] rounded-xl pl-9 pr-3 py-1.5 outline-none transition-all placeholder:text-textMuted/60"
          />
        </div>

        <button
          type="button"
          onClick={onOpenFindPeople}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors shrink-0"
        >
          <Plus size={14} />
          <span>Find People</span>
        </button>
      </div>
    </header>
  );
}
export default FriendsTopNav;
