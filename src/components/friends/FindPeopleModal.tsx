import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, UserPlus, Users, MessageSquare, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useDebounce } from '../../hooks/useDebounce';
import { type Profile, type Friendship } from '../../hooks/useFriends';
import { type SuggestedProfile } from '../../hooks/useSuggestedFriends';

interface FindPeopleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  currentUsername?: string;
  friendships: Friendship[];
  suggestedUsers: SuggestedProfile[];
  onAddFriend: (userId: string) => Promise<void> | void;
  onAcceptRequest: (friendshipId: string) => void;
  onMessageFriend: (friendId: string, profile: Profile) => void;
  getFriendshipStatus: (userId: string) => 'you' | 'none' | 'friends' | 'sent' | 'received';
}

export function FindPeopleModal({
  isOpen,
  onClose,
  currentUserId,
  currentUsername,
  friendships,
  suggestedUsers,
  onAddFriend,
  onAcceptRequest,
  onMessageFriend,
  getFriendshipStatus,
}: FindPeopleModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [inFlightUserIds, setInFlightUserIds] = useState<Set<string>>(new Set());
  const [optimisticSentIds, setOptimisticSentIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounce(searchQuery, 350);

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setOptimisticSentIds(new Set());
    onClose();
  };

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Search profiles in database
  useEffect(() => {
    let active = true;
    async function searchProfiles() {
      if (!debouncedSearch || debouncedSearch.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const cleanQuery = debouncedSearch.trim().toLowerCase().replace(/^@+/, '');
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, full_name, avatar_url, bio, cover_image_url')
          .neq('id', currentUserId || '')
          .eq('visibility', 'public')
          .or(`username.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%`)
          .limit(20);

        if (error) throw error;
        if (active) {
          // Strictly exclude current user
          const filtered = (data || []).filter((p) => {
            if (!p || !p.id || !p.username) return false;
            if (p.id === currentUserId) return false;
            if (currentUsername && p.username.toLowerCase() === currentUsername.toLowerCase()) return false;
            return true;
          });
          setSearchResults(filtered);
        }
      } catch (err) {
        console.error('Search error in FindPeopleModal:', err);
      } finally {
        if (active) setIsSearching(false);
      }
    }

    searchProfiles();
    return () => {
      active = false;
    };
  }, [debouncedSearch, currentUserId, currentUsername]);

  if (!isOpen) return null;

  // Filter suggested users to strictly exclude current user
  const sanitizedSuggested = suggestedUsers.filter((p) => {
    if (!p || !p.id || !p.username) return false;
    if (p.id === currentUserId) return false;
    if (currentUsername && p.username.toLowerCase() === currentUsername.toLowerCase()) return false;
    return true;
  });

  const displayList = debouncedSearch.trim().length >= 2 ? searchResults : sanitizedSuggested;

  const handleAddClick = async (userId: string) => {
    if (inFlightUserIds.has(userId) || optimisticSentIds.has(userId)) return;
    setInFlightUserIds((prev) => new Set(prev).add(userId));
    setOptimisticSentIds((prev) => new Set(prev).add(userId));
    try {
      await onAddFriend(userId);
    } finally {
      setInFlightUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-[#0D0F0F] border border-[#242828] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3.5 border-b border-[#242828] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#EDEDED]">Find People</h2>
            <p className="text-[11px] text-textMuted">Search and discover connections on Eustace</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 rounded-lg bg-[#141717] hover:bg-[#1E2323] border border-[#242828] text-textMuted hover:text-[#EDEDED] flex items-center justify-center transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search Bar Input */}
        <div className="p-3 border-b border-[#242828]/60 bg-[#101313]">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              type="text"
              autoFocus
              placeholder="Search by username or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#141717] hover:bg-[#181C1C] focus:bg-[#181C1C] border border-[#242828] focus:border-emerald-500/50 text-xs text-[#EDEDED] rounded-xl pl-9 pr-8 py-2 outline-none transition-all placeholder:text-textMuted/60"
            />
            {isSearching ? (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-[#EDEDED]"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
        </div>

        {/* User Results List */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 divide-y divide-[#242828]/30">
          {displayList.length === 0 ? (
            <div className="py-12 text-center text-textMuted flex flex-col items-center justify-center gap-2">
              <Users size={24} className="text-textMuted/40" />
              <span className="text-xs font-semibold">
                {searchQuery ? 'No matching people found.' : 'No suggested people available right now.'}
              </span>
            </div>
          ) : (
            displayList.map((person) => {
              const displayName = person.display_name || person.full_name || person.username;
              const initials = displayName.substring(0, 2).toUpperCase();
              let status = getFriendshipStatus(person.id);
              if (optimisticSentIds.has(person.id)) {
                status = 'sent';
              }
              const mutualCount = (person as SuggestedProfile).mutualCount;

              // Find incoming friendship record if received
              const incomingRel =
                status === 'received'
                  ? friendships.find(
                      (f) =>
                        (f.requester_id === person.id && f.addressee_id === currentUserId) ||
                        (f.addressee_id === person.id && f.requester_id === currentUserId)
                    )
                  : null;

              return (
                <div
                  key={person.id}
                  className="pt-1.5 pb-1.5 first:pt-0 flex items-center justify-between gap-3 hover:bg-white/[0.02] p-1.5 rounded-xl transition-colors"
                >
                  <Link
                    to={`/u/${person.username}`}
                    onClick={onClose}
                    className="flex items-center gap-3 min-w-0 flex-1 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#181B1B] border border-[#242828] overflow-hidden flex items-center justify-center shrink-0">
                      {person.avatar_url ? (
                        <img src={person.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-textMuted group-hover:text-[#EDEDED] transition-colors">
                          {initials}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-[#EDEDED] group-hover:text-white transition-colors truncate">
                        {displayName}
                      </span>
                      <span className="text-[10px] font-semibold text-[#8E9292] uppercase tracking-wider truncate">
                        @{person.username}
                      </span>
                      {typeof mutualCount === 'number' && mutualCount > 0 ? (
                        <span className="text-[10px] text-emerald-400 font-medium">
                          {mutualCount} mutual {mutualCount === 1 ? 'friend' : 'friends'}
                        </span>
                      ) : null}
                    </div>
                  </Link>

                  {/* Actions by friendship status */}
                  <div className="shrink-0">
                    {status === 'none' && (
                      <button
                        type="button"
                        onClick={() => handleAddClick(person.id)}
                        disabled={inFlightUserIds.has(person.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                      >
                        <UserPlus size={12} />
                        <span>Add</span>
                      </button>
                    )}

                    {status === 'sent' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                        <Check size={11} />
                        <span>Requested</span>
                      </span>
                    )}

                    {status === 'received' && (
                      <button
                        type="button"
                        onClick={() => incomingRel && onAcceptRequest(incomingRel.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-sm"
                      >
                        <Check size={12} strokeWidth={2.5} />
                        <span>Accept</span>
                      </button>
                    )}

                    {status === 'friends' && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onMessageFriend(person.id, person);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161A1A] hover:bg-[#1E2323] border border-[#262B2B] text-[#EDEDED] text-xs font-semibold rounded-lg transition-all"
                      >
                        <MessageSquare size={12} className="text-textMuted" />
                        <span>Message</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default FindPeopleModal;
