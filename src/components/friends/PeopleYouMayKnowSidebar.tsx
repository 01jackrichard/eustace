import { Link } from 'react-router-dom';
import { Plus, Users, ArrowRight, Check } from 'lucide-react';
import { type SuggestedProfile } from '../../hooks/useSuggestedFriends';

interface PeopleYouMayKnowSidebarProps {
  suggestedUsers: SuggestedProfile[];
  onAddFriend: (userId: string) => void;
  onViewAll: () => void;
  requestedUserIds: Set<string>;
}

export function PeopleYouMayKnowSidebar({
  suggestedUsers,
  onAddFriend,
  onViewAll,
  requestedUserIds,
}: PeopleYouMayKnowSidebarProps) {
  const visibleUsers = suggestedUsers.slice(0, 4);

  return (
    <div className="w-full bg-[#101313] border border-[#242828] rounded-xl p-3.5 sm:p-4 flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs sm:text-sm font-bold text-[#EDEDED] flex items-center gap-1.5">
          <span>People You May Know</span>
          <span className="text-textMuted font-normal">({suggestedUsers.length})</span>
        </h3>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
        >
          <span>View all</span>
          <ArrowRight size={12} />
        </button>
      </div>

      {/* Suggested List or Compact Empty State */}
      {visibleUsers.length === 0 ? (
        <div className="py-2.5 px-3 rounded-lg bg-[#0D0F0F] border border-[#1E2222] text-center text-xs text-textMuted/70 font-medium">
          No suggestions right now
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visibleUsers.map((user) => {
            const displayName = user.display_name || user.full_name || user.username;
            const initials = displayName.substring(0, 2).toUpperCase();
            const isRequested = requestedUserIds.has(user.id);

            return (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 p-1.5 rounded-lg hover:bg-white/[0.02] transition-colors"
              >
                {/* User info */}
                <Link
                  to={`/u/${user.username}`}
                  className="flex items-center gap-2.5 min-w-0 flex-1 group"
                >
                  <div className="w-9 h-9 rounded-full bg-[#181B1B] border border-[#242828] overflow-hidden flex items-center justify-center shrink-0">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-textMuted group-hover:text-[#EDEDED] transition-colors">
                        {initials}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-[#EDEDED] group-hover:text-white transition-colors truncate">
                      {displayName}
                    </span>
                    <span className="text-[10px] font-semibold text-[#8E9292] uppercase tracking-wider truncate">
                      @{user.username}
                    </span>
                    {user.mutualCount > 0 ? (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-400/90 mt-0.5">
                        <Users size={10} />
                        <span>
                          {user.mutualCount} mutual {user.mutualCount === 1 ? 'friend' : 'friends'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-textMuted/60 mt-0.5">Eustace Member</span>
                    )}
                  </div>
                </Link>

                {/* Add button / Requested state */}
                <div className="shrink-0">
                  {isRequested ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">
                      <Check size={11} />
                      <span>Sent</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAddFriend(user.id)}
                      className="w-7 h-7 rounded-lg bg-[#161A1A] hover:bg-[#202525] border border-[#242828] hover:border-[#383D3D] text-[#EDEDED] flex items-center justify-center transition-all shadow-sm"
                      title="Add Friend"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PeopleYouMayKnowSidebar;
