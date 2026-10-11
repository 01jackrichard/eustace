import { useState } from 'react';
import { Search, MessageSquare, Flame, ImageIcon, UserPlus } from 'lucide-react';
import { formatDistanceToNow, isToday, format } from 'date-fns';
import { cn } from '../../lib/utils';
import type { ConversationItem } from '../../hooks/useConversations';
import type { Profile } from '../../hooks/useFriends';

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string, friend: Profile) => void;
  acceptedFriends: { id: string; profiles: Profile }[];
  onStartWithFriend: (friendId: string, friend: Profile) => void;
  loading?: boolean;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  acceptedFriends,
  onStartWithFriend,
  loading = false
}: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = (c.friend.display_name || c.friend.full_name || '').toLowerCase();
    const uname = (c.friend.username || '').toLowerCase();
    return name.includes(q) || uname.includes(q);
  });

  const formatActivityTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isToday(d)) {
        return format(d, 'h:mm a');
      }
      return formatDistanceToNow(d, { addSuffix: false });
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-background border-r border-border/40 select-none min-h-0 overflow-hidden">
      {/* INBOX HEADER & SEARCH */}
      <div className="w-full p-4 border-b border-border/25 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold tracking-[0.15em] text-textMain uppercase">Messages</h2>
            {conversations.length > 0 && (
              <span className="text-[10px] font-mono text-textMuted/60">({conversations.length})</span>
            )}
          </div>
          <button
            onClick={() => setShowNewChatModal(true)}
            className="p-1.5 rounded-lg text-textMuted hover:text-textMain hover:bg-surface/60 transition-colors"
            title="Start new conversation with a friend"
            aria-label="Start new conversation"
          >
            <UserPlus size={16} />
          </button>
        </div>

        <div className="relative w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter conversations..."
            className="w-full bg-surface/30 border border-border/30 focus:border-border/70 focus:bg-surface/50 text-xs text-textMain rounded-xl pl-9 pr-3 py-2 outline-none transition-all placeholder:text-textMuted/50"
          />
        </div>
      </div>

      {/* CONVERSATION LIST */}
      <div className="flex-1 w-full min-h-0 overflow-y-auto divide-y divide-border/10">
        {loading && conversations.length === 0 ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-3 p-2 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-surface/60" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-surface/60 rounded w-1/3" />
                  <div className="h-2.5 bg-surface/40 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-center text-textMuted gap-3">
            <MessageSquare size={28} className="text-textMuted/40" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-textMain">No conversations found</span>
              <span className="text-[11px] text-textMuted max-w-[200px]">
                {search ? 'No conversations match your search.' : 'Choose an accepted friend to start messaging.'}
              </span>
            </div>
            {!search && acceptedFriends.length > 0 && (
              <button
                onClick={() => setShowNewChatModal(true)}
                className="mt-2 px-3 py-1.5 bg-surface border border-border/40 hover:border-textMuted text-[10px] font-bold uppercase tracking-wider text-textMain rounded-xl transition-colors"
              >
                Select a friend
              </button>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === selectedConversationId;
            const displayName = conv.friend.display_name || conv.friend.full_name || conv.friend.username;
            const hasStreak = typeof conv.friend.current_streak === 'number' && conv.friend.current_streak > 0;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id, conv.friend)}
                className={cn(
                  'flex items-center gap-3 p-3.5 cursor-pointer transition-colors group relative',
                  isSelected
                    ? 'bg-surface/80 border-l-2 border-l-accent'
                    : 'hover:bg-surface/30 border-l-2 border-l-transparent'
                )}
              >
                {/* AVATAR */}
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-border/20 overflow-hidden flex items-center justify-center border border-border/20">
                    {conv.friend.avatar_url ? (
                      <img src={conv.friend.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-textMuted">
                        {displayName.substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {hasStreak && (
                    <div className="absolute -bottom-1 -right-1 bg-background border border-border/40 rounded-full p-0.5 flex items-center">
                      <Flame size={10} className="text-accent" />
                    </div>
                  )}
                </div>

                {/* TEXT PREVIEW */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-textMain truncate group-hover:text-white transition-colors">
                      {displayName}
                    </span>
                    <span className="text-[10px] text-textMuted/60 shrink-0 font-medium">
                      {formatActivityTime(conv.lastMessageAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'text-[11px] truncate',
                        conv.unreadCount > 0
                          ? 'text-textMain font-semibold'
                          : 'text-textMuted/70 group-hover:text-textMuted font-medium'
                      )}
                    >
                      {conv.lastMessage?.messageType === 'image' ? (
                        <span className="flex items-center gap-1 text-accent">
                          <ImageIcon size={12} /> Photo
                        </span>
                      ) : (
                        conv.lastMessage?.textContent || 'Started conversation'
                      )}
                    </span>

                    {/* UNREAD BADGE */}
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 px-1.5 py-0.5 min-w-[18px] text-[10px] font-bold text-background bg-accent rounded-full text-center leading-none flex items-center justify-center">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: START CHAT WITH ACCEPTED FRIEND */}
      {showNewChatModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowNewChatModal(false)}
        >
          <div
            className="w-full max-w-md bg-surface border border-border/50 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/20 pb-3">
              <h3 className="text-sm font-bold tracking-widest text-textMain uppercase">Select a Friend</h3>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="text-textMuted hover:text-textMain p-1 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {acceptedFriends.length === 0 ? (
                <div className="text-center py-8 text-xs text-textMuted">
                  No accepted friends yet. Add friends from the Connections tab.
                </div>
              ) : (
                acceptedFriends.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => {
                      onStartWithFriend(f.profiles.id, f.profiles);
                      setShowNewChatModal(false);
                    }}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface/80 cursor-pointer transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-border/20 overflow-hidden flex items-center justify-center shrink-0">
                      {f.profiles.avatar_url ? (
                        <img src={f.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-textMuted">
                          {(f.profiles.display_name || f.profiles.username)?.substring(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-textMain truncate">
                        {f.profiles.display_name || f.profiles.full_name || f.profiles.username}
                      </span>
                      <span className="text-[10px] text-textMuted truncate">@{f.profiles.username}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
