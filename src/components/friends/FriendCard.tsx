import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, MoreHorizontal, User, Copy, UserMinus, Flame, Check } from 'lucide-react';
import { type Friendship, type Profile } from '../../hooks/useFriends';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

interface FriendCardProps {
  friendship: Friendship;
  isOnline: boolean;
  viewMode?: 'grid' | 'list';
  onMessage: (friendId: string, profile: Profile) => void;
  onRemoveFriend: (friendshipId: string) => void;
}

export function FriendCard({
  friendship,
  isOnline,
  viewMode = 'grid',
  onMessage,
  onRemoveFriend,
}: FriendCardProps) {
  const profile = friendship.profiles;
  const displayName = profile.display_name || profile.full_name || profile.username || 'Friend';
  const username = profile.username || 'user';
  const initials = (profile.display_name || profile.username || 'F').substring(0, 2).toUpperCase();
  const cleanBio = profile.bio?.trim();
  const hasBio = Boolean(cleanBio && cleanBio.length > 0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close overflow menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setConfirmRemove(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyLink = () => {
    const profileUrl = `${window.location.origin}/u/${username}`;
    navigator.clipboard
      .writeText(profileUrl)
      .then(() => {
        setCopiedLink(true);
        toast.success(`Copied @${username}'s profile link`);
        setTimeout(() => {
          setCopiedLink(false);
          setMenuOpen(false);
        }, 1500);
      })
      .catch(() => {
        toast.error('Could not copy link');
      });
  };

  const streak = profile.current_streak;
  const hasStreak = typeof streak === 'number' && streak > 0;

  // -------------------------------------------------------------
  // LIST VIEW LAYOUT
  // -------------------------------------------------------------
  if (viewMode === 'list') {
    return (
      <div className="w-full bg-[#101313] hover:bg-[#131616] border border-[#242828] hover:border-[#383D3D] rounded-xl p-3 flex items-center justify-between gap-3 transition-all duration-200 group">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Avatar with live status dot */}
          <Link to={`/u/${username}`} className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-[#161818] border border-[#242828] overflow-hidden flex items-center justify-center">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-textMuted">{initials}</span>
              )}
            </div>
            <span
              className={cn(
                'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#101313]',
                isOnline ? 'bg-emerald-400' : 'bg-[#555C5C]'
              )}
            />
          </Link>

          {/* Name, handle, bio */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                to={`/u/${username}`}
                className="text-xs sm:text-sm font-bold text-[#EDEDED] hover:text-white truncate transition-colors"
              >
                {displayName}
              </Link>
              <span className="text-[10px] sm:text-[11px] font-medium text-textMuted uppercase tracking-wider shrink-0">
                @{username}
              </span>
              {hasStreak && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                  <Flame size={11} /> {streak}d
                </span>
              )}
            </div>
            {hasBio && (
              <p className="text-[11px] text-textMuted/80 italic truncate mt-0.5" title={cleanBio}>
                &ldquo;{cleanBio}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onMessage(profile.id, profile)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161A1A] hover:bg-[#1E2323] border border-[#262B2B] hover:border-[#383D3D] text-[#EDEDED] text-xs font-semibold rounded-lg transition-all"
          >
            <MessageSquare size={13} className="text-textMuted" />
            <span>Message</span>
          </button>

          {/* Overflow Menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 bg-[#161A1A] hover:bg-[#1E2323] border border-[#262B2B] text-textMuted hover:text-[#EDEDED] rounded-lg transition-colors"
              title="More actions"
            >
              <MoreHorizontal size={14} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-44 py-1 bg-[#141717] border border-[#242828] rounded-xl shadow-2xl z-30 flex flex-col">
                <Link
                  to={`/u/${username}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-textMuted hover:text-[#EDEDED] hover:bg-white/[0.04] transition-colors"
                >
                  <User size={13} />
                  <span>View Profile</span>
                </Link>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-textMuted hover:text-[#EDEDED] hover:bg-white/[0.04] transition-colors"
                >
                  {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedLink ? 'Copied Link' : 'Copy Profile Link'}</span>
                </button>
                <div className="h-[1px] bg-[#242828] my-1" />
                {confirmRemove ? (
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveFriend(friendship.id);
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-left text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors font-semibold"
                  >
                    <UserMinus size={13} />
                    <span>Confirm Remove</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="flex items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <UserMinus size={13} />
                    <span>Remove Friend</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REFINED GRID VIEW CARD (76–82px COVER, ~200–225px TOTAL HEIGHT)
  // -------------------------------------------------------------
  return (
    <div className="w-full bg-[#101313] hover:bg-[#121515] border border-[#242828] hover:border-[#333838] rounded-xl overflow-hidden flex flex-col transition-all duration-200 group relative">
      {/* 1. SHALLOW COVER REGION (Target 70–100px: Exactly 78px on mobile, 82px on desktop) */}
      <div className="w-full h-[78px] sm:h-[82px] relative overflow-hidden shrink-0 bg-[#141717]">
        {profile.cover_image_url ? (
          <img
            src={profile.cover_image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          /* Restrained, consistent dark charcoal/slate fallback texture */
          <div className="w-full h-full bg-gradient-to-r from-[#141717] via-[#181C1C] to-[#141717] opacity-90 border-b border-[#242828]/30" />
        )}

        {/* Subtle shadow gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#101313] via-transparent to-black/25 pointer-events-none" />

        {/* Presence Badge (Top-Right Corner) */}
        <div className="absolute top-2 right-2.5 z-10">
          {isOnline ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 backdrop-blur-md border border-emerald-500/30 text-emerald-400 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Online</span>
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/70 backdrop-blur-md border border-white/10 text-textMuted shadow-sm">
              <span>Offline</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. IDENTITY & CONTENT REGION */}
      <div className="px-3.5 sm:px-4 pb-3 sm:pb-3.5 pt-0 flex flex-col flex-1">
        {/* Header row with overlapping avatar */}
        <div className="flex items-start justify-between -mt-6 mb-1.5">
          {/* Overlapping avatar */}
          <Link
            to={`/u/${username}`}
            className="relative w-12 h-12 rounded-full bg-[#161818] border-2 border-[#101313] shadow-md overflow-hidden flex items-center justify-center shrink-0 group/avatar focus:outline-none"
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={displayName}
                className="w-full h-full object-cover group-hover/avatar:scale-105 transition-transform"
              />
            ) : (
              <span className="text-xs font-bold text-textMuted group-hover/avatar:text-[#EDEDED] transition-colors">
                {initials}
              </span>
            )}
          </Link>

          {/* Genuine Streak badge if available */}
          {hasStreak && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md mt-1 shrink-0">
              <Flame size={11} />
              <span>{streak}d</span>
            </div>
          )}
        </div>

        {/* Name and handle */}
        <div className="flex flex-col min-w-0 mb-1.5">
          <Link
            to={`/u/${username}`}
            className="text-xs sm:text-sm font-bold text-[#EDEDED] hover:text-white truncate transition-colors leading-tight"
          >
            {displayName}
          </Link>
          <span className="text-[10px] sm:text-[11px] font-semibold text-[#8E9292] uppercase tracking-wider truncate mt-0.5">
            @{username}
          </span>
        </div>

        {/* Bio quote (rendered if present; balanced container preserves uniform grid alignment without generic fallback quotes) */}
        <div className="min-h-[18px] mb-2.5 flex-1">
          {hasBio ? (
            <p className="text-[11px] text-textMuted/80 italic line-clamp-1 leading-snug" title={cleanBio}>
              &ldquo;{cleanBio}&rdquo;
            </p>
          ) : null}
        </div>

        {/* 3. ACTION FOOTER (BOTTOM RIGHT) */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#242828]/40 mt-auto">
          {/* Message button */}
          <button
            type="button"
            onClick={() => onMessage(profile.id, profile)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#161A1A] hover:bg-[#1E2323] border border-[#262B2B] hover:border-[#383D3D] text-[#EDEDED] text-xs font-semibold rounded-lg transition-all"
          >
            <MessageSquare size={12} className="text-textMuted" />
            <span>Message</span>
          </button>

          {/* Compact overflow menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 bg-[#161A1A] hover:bg-[#1E2323] border border-[#262B2B] text-textMuted hover:text-[#EDEDED] rounded-lg transition-colors"
              title="More options"
            >
              <MoreHorizontal size={13} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 bottom-[calc(100%+6px)] w-40 py-1 bg-[#141717] border border-[#242828] rounded-xl shadow-2xl z-30 flex flex-col">
                <Link
                  to={`/u/${username}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-textMuted hover:text-[#EDEDED] hover:bg-white/[0.04] transition-colors"
                >
                  <User size={12} />
                  <span>View Profile</span>
                </Link>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-textMuted hover:text-[#EDEDED] hover:bg-white/[0.04] transition-colors"
                >
                  {copiedLink ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedLink ? 'Copied Link' : 'Copy Link'}</span>
                </button>
                <div className="h-[1px] bg-[#242828] my-1" />
                {confirmRemove ? (
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveFriend(friendship.id);
                      setMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors font-semibold"
                  >
                    <UserMinus size={12} />
                    <span>Confirm</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <UserMinus size={12} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FriendCard;
