import { Link } from 'react-router-dom';
import { Check, X, ArrowRight } from 'lucide-react';
import {
  type Friendship,
  resolveProfileDisplayName,
  getProfileInitials,
} from '../../hooks/useFriends';

interface PendingRequestsSidebarProps {
  incomingRequests: Friendship[];
  onAccept: (friendshipId: string) => void;
  onDecline: (friendshipId: string) => void;
  onViewAll: () => void;
}

export function PendingRequestsSidebar({
  incomingRequests,
  onAccept,
  onDecline,
  onViewAll,
}: PendingRequestsSidebarProps) {
  const visibleRequests = incomingRequests.slice(0, 4);

  return (
    <div className="w-full bg-[#101313] border border-[#242828] rounded-xl p-3.5 sm:p-4 flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs sm:text-sm font-bold text-[#EDEDED] flex items-center gap-1.5">
          <span>Pending Requests</span>
          <span className="text-textMuted font-normal">({incomingRequests.length})</span>
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

      {/* Requests List or Compact Empty State */}
      {visibleRequests.length === 0 ? (
        <div className="py-2.5 px-3 rounded-lg bg-[#0D0F0F] border border-[#1E2222] text-center text-xs text-textMuted/70 font-medium">
          No incoming requests
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visibleRequests.map((req) => {
            const profile = req.profiles;
            const displayName = resolveProfileDisplayName(profile);
            const initials = getProfileInitials(profile);

            return (
              <div
                key={req.id}
                className="flex items-center justify-between gap-3 p-1.5 rounded-lg hover:bg-white/[0.02] transition-colors"
              >
                {/* User info */}
                <Link
                  to={`/u/${profile.username}`}
                  className="flex items-center gap-2.5 min-w-0 flex-1 group"
                >
                  <div className="w-9 h-9 rounded-full bg-[#181B1B] border border-[#242828] overflow-hidden flex items-center justify-center shrink-0">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
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
                      @{profile.username}
                    </span>
                  </div>
                </Link>

                {/* Actions: Accept (Emerald) & Decline */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAccept(req.id)}
                    className="w-7 h-7 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center font-bold transition-all shadow-sm"
                    title="Accept request"
                  >
                    <Check size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecline(req.id)}
                    className="w-7 h-7 rounded-lg bg-[#161A1A] hover:bg-[#202525] border border-[#242828] text-textMuted hover:text-white flex items-center justify-center transition-all"
                    title="Decline request"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PendingRequestsSidebar;
