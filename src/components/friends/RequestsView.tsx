import { Link } from 'react-router-dom';
import { Check, X, UserCheck, Send, Clock } from 'lucide-react';
import {
  type Friendship,
  resolveProfileDisplayName,
  getProfileInitials,
} from '../../hooks/useFriends';

interface RequestsViewProps {
  incomingRequests: Friendship[];
  outgoingRequests: Friendship[];
  onAccept: (friendshipId: string) => void;
  onDecline: (friendshipId: string) => void;
  onCancel: (friendshipId: string) => void;
}

export function RequestsView({
  incomingRequests,
  outgoingRequests,
  onAccept,
  onDecline,
  onCancel,
}: RequestsViewProps) {
  return (
    <div className="w-full flex flex-col gap-10 select-none pb-16">
      {/* 1. HEADER */}
      <div className="flex flex-col gap-1.5">
        <h1 className="font-['Philosopher',serif] text-3xl sm:text-4xl font-medium text-[#EDEDED] tracking-tight">
          Friend Requests
        </h1>
        <p className="text-[11px] font-bold tracking-[0.2em] text-[#8E9292] uppercase">
          MANAGE YOUR INCOMING AND OUTGOING INVITATIONS.
        </p>
      </div>

      {/* 2. INCOMING REQUESTS SECTION */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between pb-1 border-b border-[#242828]/60">
          <h2 className="text-xs sm:text-sm font-bold text-[#EDEDED] flex items-center gap-2">
            <UserCheck size={16} className="text-emerald-400" />
            <span>Incoming Requests</span>
            <span className="text-textMuted font-normal">({incomingRequests.length})</span>
          </h2>
        </div>

        {incomingRequests.length === 0 ? (
          <div className="py-12 px-4 rounded-2xl bg-[#101313] border border-[#242828] border-dashed flex flex-col items-center justify-center text-center text-textMuted gap-2">
            <UserCheck size={28} className="text-textMuted/40" />
            <span className="text-xs font-semibold text-[#EDEDED]">No incoming friend requests</span>
            <span className="text-[11px] text-textMuted max-w-xs">
              When others send you connection requests, they will show up here.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {incomingRequests.map((req) => {
              const profile = req.profiles;
              const displayName = resolveProfileDisplayName(profile);
              const initials = getProfileInitials(profile);

              return (
                <div
                  key={req.id}
                  className="bg-[#101313] hover:bg-[#131616] border border-[#242828] hover:border-[#383D3D] rounded-2xl p-4 flex flex-col justify-between gap-4 transition-all"
                >
                  <Link
                    to={`/u/${profile.username}`}
                    className="flex items-start gap-3.5 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#181B1B] border border-[#242828] overflow-hidden flex items-center justify-center shrink-0">
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-textMuted group-hover:text-[#EDEDED] transition-colors">
                          {initials}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-[#EDEDED] group-hover:text-white transition-colors truncate">
                        {displayName}
                      </span>
                      <span className="text-[11px] font-semibold text-[#8E9292] uppercase tracking-wider truncate">
                        @{profile.username}
                      </span>
                      {profile.bio?.trim() ? (
                        <p className="text-xs text-textMuted/80 italic line-clamp-2 mt-1">
                          &ldquo;{profile.bio.trim()}&rdquo;
                        </p>
                      ) : null}
                    </div>
                  </Link>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[#242828]/40">
                    <button
                      type="button"
                      onClick={() => onDecline(req.id)}
                      className="flex-1 py-2 rounded-xl bg-[#161A1A] hover:bg-[#202525] border border-[#242828] text-textMuted hover:text-[#EDEDED] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <X size={14} />
                      <span>Decline</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAccept(req.id)}
                      className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Check size={14} strokeWidth={2.5} />
                      <span>Accept</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. OUTGOING / SENT REQUESTS SECTION */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between pb-1 border-b border-[#242828]/60">
          <h2 className="text-xs sm:text-sm font-bold text-[#EDEDED] flex items-center gap-2">
            <Send size={15} className="text-[#8E9292]" />
            <span>Sent Requests</span>
            <span className="text-textMuted font-normal">({outgoingRequests.length})</span>
          </h2>
        </div>

        {outgoingRequests.length === 0 ? (
          <div className="py-12 px-4 rounded-2xl bg-[#101313] border border-[#242828] border-dashed flex flex-col items-center justify-center text-center text-textMuted gap-2">
            <Clock size={28} className="text-textMuted/40" />
            <span className="text-xs font-semibold text-[#EDEDED]">No outgoing requests</span>
            <span className="text-[11px] text-textMuted max-w-xs">
              When you invite or send connection requests, they will show up here.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {outgoingRequests.map((req) => {
              const profile = req.profiles;
              const displayName = resolveProfileDisplayName(profile);
              const initials = getProfileInitials(profile);

              return (
                <div
                  key={req.id}
                  className="bg-[#101313] border border-[#242828] rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <Link
                    to={`/u/${profile.username}`}
                    className="flex items-center gap-3.5 min-w-0 flex-1 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#181B1B] border border-[#242828] overflow-hidden flex items-center justify-center shrink-0">
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-textMuted group-hover:text-[#EDEDED] transition-colors">
                          {initials}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-[#EDEDED] group-hover:text-white transition-colors truncate">
                        {displayName}
                      </span>
                      <span className="text-[10px] font-semibold text-[#8E9292] uppercase tracking-wider truncate">
                        @{profile.username}
                      </span>
                      <span className="text-[10px] text-emerald-400/80 font-medium mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> Pending approval
                      </span>
                    </div>
                  </Link>

                  <button
                    type="button"
                    onClick={() => onCancel(req.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#161A1A] hover:bg-red-500/10 border border-[#242828] hover:border-red-500/30 text-textMuted hover:text-red-400 text-xs font-medium transition-colors flex items-center gap-1"
                    title="Cancel request"
                  >
                    <X size={13} />
                    <span>Cancel</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestsView;
