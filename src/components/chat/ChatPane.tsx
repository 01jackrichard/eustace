/* eslint-disable react-hooks/exhaustive-deps, react/set-state-in-effect */
import { useState, useRef, useEffect, type UIEvent } from 'react';
import { ArrowLeft, Flame, Loader2, ChevronDown, WifiOff, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useChat } from '../../hooks/useChat';
import { MessageItem } from './MessageItem';
import { DateSeparator } from './DateSeparator';
import { MessageComposer } from './MessageComposer';
import { ImageViewerModal } from './ImageViewerModal';
import type { Profile } from '../../hooks/useFriends';
import { isSameDay } from 'date-fns';

interface ChatPaneProps {
  conversationId: string;
  friendProfile: Profile;
  onBack?: () => void;
}

export function ChatPane({ conversationId, friendProfile, onBack }: ChatPaneProps) {
  const { user } = useAuth();
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    realtimeStatus,
    otherUserLastReadAt,
    otherUserLastDeliveredAt,
    isOtherUserOnline,
    isFriendshipActive,
    loadOlderMessages,
    sendTextMessage,
    sendImageMessage,
    retryFailedMessage
  } = useChat(conversationId, friendProfile);

  const [activeEnlargedImage, setActiveEnlargedImage] = useState<string | null>(null);
  const [showScrollBottomPill, setShowScrollBottomPill] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef(false);
  const prevMessagesLengthRef = useRef(messages.length);

  // Check scroll position to determine if user is reading older history
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isScrolledUp = distanceToBottom > 150;
    isUserScrolledUpRef.current = isScrolledUp;
    setShowScrollBottomPill(isScrolledUp);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowScrollBottomPill(false);
    isUserScrolledUpRef.current = false;
  };

  // Scroll to bottom on initial load or when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (loading) return;

    const isInitial = prevMessagesLengthRef.current === 0 && messages.length > 0;
    const hasNewMessage = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (isInitial) {
      scrollToBottom('auto');
    } else if (hasNewMessage && !isUserScrolledUpRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages, loading]);

  const displayName = friendProfile.display_name || friendProfile.full_name || friendProfile.username;
  const hasStreak = typeof friendProfile.current_streak === 'number' && friendProfile.current_streak > 0;

  return (
    <div className="flex-1 w-full h-full min-w-0 min-h-0 flex flex-col bg-background relative overflow-hidden">
      {/* HEADER */}
      <div className="w-full px-4 py-3 md:px-6 md:py-4 border-b border-border/25 bg-surface/30 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 -ml-1 text-textMuted hover:text-textMain hover:bg-surface/60 rounded-xl transition-colors md:hidden"
              title="Back to conversations"
              aria-label="Back to conversations"
            >
              <ArrowLeft size={18} />
            </button>
          )}

          {/* AVATAR */}
          <div className="w-10 h-10 rounded-full bg-border/20 overflow-hidden shrink-0 flex items-center justify-center border border-border/20">
            {friendProfile.avatar_url ? (
              <img src={friendProfile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-textMuted">
                {displayName.substring(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          {/* NAME & USERNAME */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-textMain truncate leading-tight">
                {displayName}
              </span>
              {hasStreak && (
                <div className="flex items-center gap-0.5 text-accent text-xs font-bold shrink-0">
                  <Flame size={12} />
                  <span>{friendProfile.current_streak}</span>
                </div>
              )}
            </div>
            <span className="text-[10px] text-textMuted/60 font-medium tracking-wide truncate">
              @{friendProfile.username}
            </span>
          </div>
        </div>

        {/* CONNECTION & PRESENCE STATUS BADGE */}
        <div className="flex items-center gap-2 text-[10px] font-medium tracking-wider select-none">
          {realtimeStatus === 'disconnected' ? (
            <span className="flex items-center gap-1.5 text-red-400/80 bg-red-500/10 px-2.5 py-0.5 rounded-full border border-red-500/20">
              <WifiOff size={10} />
              Reconnecting
            </span>
          ) : realtimeStatus === 'connecting' ? (
            <span className="flex items-center gap-1.5 text-amber-400/80 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
              <Loader2 size={10} className="animate-spin" />
              Connecting
            </span>
          ) : isOtherUserOnline ? (
            <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-textMuted/70 bg-surface/40 px-2.5 py-0.5 rounded-full border border-border/25">
              <span className="w-1.5 h-1.5 rounded-full bg-textMuted/40" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* ERROR BANNER IF ANY */}
      {error && (
        <div className="w-full px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs shrink-0">
          Failed to load messages: {error.message}
        </div>
      )}

      {/* MESSAGES HISTORY CONTAINER */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 w-full min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 flex flex-col"
      >
        {/* PAGINATION: LOAD OLDER MESSAGES BUTTON */}
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              onClick={loadOlderMessages}
              disabled={loadingMore}
              className="px-3.5 py-1.5 rounded-full bg-surface/40 hover:bg-surface/80 border border-border/30 text-[10px] font-bold uppercase tracking-wider text-textMuted hover:text-textMain transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <Loader2 size={12} className="animate-spin text-accent" />
                  <span>Loading older...</span>
                </>
              ) : (
                <span>Load older messages</span>
              )}
            </button>
          </div>
        )}

        {/* LOADING SKELETON */}
        {loading && messages.length === 0 ? (
          <div className="space-y-4 my-auto">
            <div className="flex justify-start">
              <div className="w-48 h-12 rounded-2xl bg-surface/30 animate-pulse" />
            </div>
            <div className="flex justify-end">
              <div className="w-56 h-14 rounded-2xl bg-surface/50 animate-pulse" />
            </div>
            <div className="flex justify-start">
              <div className="w-40 h-10 rounded-2xl bg-surface/30 animate-pulse" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          /* EMPTY STATE */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-textMuted gap-3">
            <div className="w-14 h-14 rounded-full bg-surface/40 border border-border/30 flex items-center justify-center">
              <MessageSquare size={22} className="text-textMuted/60" />
            </div>
            <div className="flex flex-col gap-1 max-w-xs">
              <span className="text-sm font-bold text-textMain">Say hello to {displayName}</span>
              <span className="text-xs text-textMuted/70">
                This is the beginning of your direct conversation. Messages and images are encrypted in transit and private to both of you.
              </span>
            </div>
          </div>
        ) : (
          /* MESSAGE LIST WITH DATE SEPARATORS */
          messages.map((msg, idx) => {
            const isOutgoing = msg.sender_id === user?.id;

            // Check if day changed from previous message
            const showDateSeparator =
              idx === 0 ||
              !isSameDay(new Date(msg.created_at), new Date(messages[idx - 1].created_at));

            return (
              <div key={msg.id} className="w-full flex flex-col">
                {showDateSeparator && <DateSeparator date={msg.created_at} />}
                <MessageItem
                  message={msg}
                  isOutgoing={isOutgoing}
                  otherUserLastReadAt={otherUserLastReadAt}
                  otherUserLastDeliveredAt={otherUserLastDeliveredAt}
                  onRetry={retryFailedMessage}
                  onOpenImage={(url) => setActiveEnlargedImage(url)}
                />
              </div>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* FLOATING SCROLL TO BOTTOM PILL */}
      {showScrollBottomPill && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-20 right-6 z-20 px-3 py-1.5 rounded-full bg-surface border border-border/60 text-textMain text-xs font-semibold shadow-xl flex items-center gap-1.5 hover:bg-surface/90 transition-all active:scale-95"
        >
          <span>Latest</span>
          <ChevronDown size={14} />
        </button>
      )}

      {/* COMPOSER ANCHORED AT BOTTOM */}
      <MessageComposer
        onSendMessage={sendTextMessage}
        onSendImage={sendImageMessage}
        disabled={loading}
        isFriendshipActive={isFriendshipActive}
      />

      {/* IMAGE ENLARGE MODAL */}
      <ImageViewerModal
        imageUrl={activeEnlargedImage}
        onClose={() => setActiveEnlargedImage(null)}
      />
    </div>
  );
}
