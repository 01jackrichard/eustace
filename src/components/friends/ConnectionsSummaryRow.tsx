import { Users, BarChart2, UserCheck, UserPlus, ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface ConnectionsSummaryRowProps {
  connectedFriendsCount: number;
  pendingRequestsCount: number;
  peopleYouMayKnowCount: number;
  username?: string;
  onSelectFriends: () => void;
  onSelectRequests: () => void;
  onSelectDiscover: () => void;
}

export function ConnectionsSummaryRow({
  connectedFriendsCount,
  pendingRequestsCount,
  peopleYouMayKnowCount,
  username,
  onSelectFriends,
  onSelectRequests,
  onSelectDiscover,
}: ConnectionsSummaryRowProps) {
  const [copiedInvite, setCopiedInvite] = useState(false);

  const handleInviteClick = () => {
    const inviteUrl = username
      ? `${window.location.origin}/u/${username}`
      : `${window.location.origin}/signup`;

    navigator.clipboard
      .writeText(inviteUrl)
      .then(() => {
        setCopiedInvite(true);
        toast.success('Personal profile invite link copied to clipboard!');
        setTimeout(() => setCopiedInvite(false), 2500);
      })
      .catch(() => {
        toast.error('Could not copy invite link');
      });
  };

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 select-none mb-4">
      {/* 1. CONNECTED FRIENDS */}
      <button
        type="button"
        onClick={onSelectFriends}
        className="bg-[#101313] hover:bg-[#141717] border border-[#242828] hover:border-[#383D3D] rounded-xl p-3 sm:p-3.5 flex items-center justify-between text-left transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-textMuted group-hover:text-[#EDEDED] transition-colors shrink-0">
            <Users size={16} />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-bold text-[#EDEDED] tracking-tight tabular-nums leading-none mb-0.5">
              {connectedFriendsCount}
            </div>
            <div className="text-[11px] text-textMuted font-medium">
              Connected Friends
            </div>
          </div>
        </div>
        <ArrowRight size={14} className="text-textMuted/40 group-hover:text-[#EDEDED] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
      </button>

      {/* 2. PENDING REQUESTS */}
      <button
        type="button"
        onClick={onSelectRequests}
        className="bg-[#101313] hover:bg-[#141717] border border-[#242828] hover:border-[#383D3D] rounded-xl p-3 sm:p-3.5 flex items-center justify-between text-left transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-textMuted group-hover:text-[#EDEDED] transition-colors shrink-0">
            <BarChart2 size={16} />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-bold text-[#EDEDED] tracking-tight tabular-nums leading-none mb-0.5">
              {pendingRequestsCount}
            </div>
            <div className="text-[11px] text-textMuted font-medium">
              Pending Requests
            </div>
          </div>
        </div>
        <ArrowRight size={14} className="text-textMuted/40 group-hover:text-[#EDEDED] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
      </button>

      {/* 3. PEOPLE YOU MAY KNOW */}
      <button
        type="button"
        onClick={onSelectDiscover}
        className="bg-[#101313] hover:bg-[#141717] border border-[#242828] hover:border-[#383D3D] rounded-xl p-3 sm:p-3.5 flex items-center justify-between text-left transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-textMuted group-hover:text-[#EDEDED] transition-colors shrink-0">
            <UserCheck size={16} />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-bold text-[#EDEDED] tracking-tight tabular-nums leading-none mb-0.5">
              {peopleYouMayKnowCount}
            </div>
            <div className="text-[11px] text-textMuted font-medium">
              People You May Know
            </div>
          </div>
        </div>
        <ArrowRight size={14} className="text-textMuted/40 group-hover:text-[#EDEDED] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
      </button>

      {/* 4. INVITE FRIENDS */}
      <button
        type="button"
        onClick={handleInviteClick}
        className="bg-[#101313] hover:bg-[#141717] border border-[#242828] hover:border-[#383D3D] rounded-xl p-3 sm:p-3.5 flex items-center justify-between text-left transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            {copiedInvite ? <Check size={16} /> : <UserPlus size={16} />}
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold text-[#EDEDED] tracking-tight leading-snug mb-0.5">
              {copiedInvite ? 'Link Copied!' : 'Invite Friends'}
            </div>
            <div className="text-[10px] text-textMuted font-medium leading-tight truncate">
              Share Eustace with people you know.
            </div>
          </div>
        </div>
        <ArrowRight size={14} className="text-textMuted/40 group-hover:text-[#EDEDED] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
      </button>
    </div>
  );
}

export default ConnectionsSummaryRow;
