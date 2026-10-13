/* eslint-disable react-compiler/react-compiler, react/purity, react-hooks/exhaustive-deps, react/set-state-in-effect */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useFriends, type Profile, resolveProfileDisplayName } from '../hooks/useFriends';
import { useConversations } from '../hooks/useConversations';
import { usePresence } from '../hooks/usePresence';
import { useSuggestedFriends } from '../hooks/useSuggestedFriends';
import { ConversationList } from '../components/chat/ConversationList';
import { ChatPane } from '../components/chat/ChatPane';
import { showErrorToast } from '../lib/toast';
import { cn } from '../lib/utils';

// Redesigned Friends Hub Components
import { FriendsTopNav, type FriendsTab } from '../components/friends/FriendsTopNav';
import { ConnectionsHero } from '../components/friends/ConnectionsHero';
import { ConnectionsSummaryRow } from '../components/friends/ConnectionsSummaryRow';
import {
  FriendsControls,
  type FriendSortOption,
  type FriendStatusFilter,
  type FriendViewMode,
} from '../components/friends/FriendsControls';
import { FriendCard } from '../components/friends/FriendCard';
import { PendingRequestsSidebar } from '../components/friends/PendingRequestsSidebar';
import { PeopleYouMayKnowSidebar } from '../components/friends/PeopleYouMayKnowSidebar';
import { FindPeopleModal } from '../components/friends/FindPeopleModal';
import { RequestsView } from '../components/friends/RequestsView';

export function FriendsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Data Hooks
  const {
    user,
    profile,
    friendships,
    incomingRequests,
    outgoingRequests,
    acceptedFriends,
    loading: friendsLoading,
    error: friendsError,
    handleAddFriend,
    handleAccept,
    handleDecline,
    handleCancel,
    handleRemoveFriend,
    getFriendshipStatus,
  } = useFriends();

  const {
    conversations,
    loading: conversationsLoading,
    totalUnreadCount,
    openConversationWithFriend,
    markAsRead,
  } = useConversations();

  const currentUsername = profile?.username || user?.user_metadata?.username;
  const { isUserOnline } = usePresence(user?.id);
  const {
    suggested: suggestedUsers,
    excludeUser,
  } = useSuggestedFriends(user?.id, currentUsername, friendships);

  // 2. Tab Navigation
  const tabParam = searchParams.get('tab');
  const initialTab: FriendsTab =
    tabParam === 'messages' || searchParams.get('chat')
      ? 'messages'
      : tabParam === 'requests'
      ? 'requests'
      : 'connections';

  const [activeTab, setActiveTab] = useState<FriendsTab>(initialTab);

  // Sync tab with URL search params if changed externally
  useEffect(() => {
    if (tabParam === 'messages' && activeTab !== 'messages') {
      setActiveTab('messages');
    } else if (tabParam === 'requests' && activeTab !== 'requests') {
      setActiveTab('requests');
    } else if (!tabParam && !searchParams.get('chat') && activeTab !== 'connections') {
      setActiveTab('connections');
    }
  }, [tabParam, searchParams]);

  const handleTabChange = (newTab: FriendsTab) => {
    setActiveTab(newTab);
    if (newTab === 'connections') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: newTab }, { replace: true });
    }
  };

  // 3. Search & Discovery Modal State
  const [topSearchQuery, setTopSearchQuery] = useState('');
  const [isFindPeopleOpen, setIsFindPeopleOpen] = useState(false);
  const [requestedUserIds, setRequestedUserIds] = useState<Set<string>>(new Set());

  // 4. Friends List Controls State
  const [friendsSearchQuery, setFriendsSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<FriendSortOption>('recent');
  const [viewMode, setViewMode] = useState<FriendViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<FriendStatusFilter>('all');

  // 5. Messaging / Chat State
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const handledChatParamRef = useRef<string | null>(null);

  // Deep-linking URL handler: ?chat=<friendId> or ?conversationId=<id>
  useEffect(() => {
    const chatFriendId = searchParams.get('chat') || searchParams.get('friendId');
    const convIdParam = searchParams.get('conversationId');

    if (convIdParam) {
      setSelectedConversationId(convIdParam);
      const foundConv = conversations.find((c) => c.id === convIdParam);
      if (foundConv) {
        setSelectedFriend(foundConv.friend);
      }
    } else if (chatFriendId && user) {
      if (handledChatParamRef.current === chatFriendId) {
        return;
      }
      handledChatParamRef.current = chatFriendId;

      setActiveTab('messages');
      const friendProfile = acceptedFriends.find((f) => f.profiles.id === chatFriendId)?.profiles;
      if (friendProfile) {
        setSelectedFriend(friendProfile);
      }
      setIsOpeningChat(true);
      openConversationWithFriend(chatFriendId)
        .then((convId) => {
          setSelectedConversationId(convId);
          setSearchParams({ tab: 'messages', conversationId: convId }, { replace: true });
        })
        .catch((err) => {
          console.error('Could not open conversation from URL param:', err);
          showErrorToast(err, 'Failed to open conversation.', 'open_chat_error');
        })
        .finally(() => {
          setIsOpeningChat(false);
        });
    }
  }, [searchParams, user, openConversationWithFriend, acceptedFriends, conversations, setSearchParams]);

  // Mark selected conversation as read
  useEffect(() => {
    if (selectedConversationId) {
      markAsRead(selectedConversationId);
    }
  }, [selectedConversationId, markAsRead]);

  // Open Direct Message With Friend
  const handleStartMessageWithFriend = async (friendId: string, friendProfile?: Profile) => {
    try {
      setActiveTab('messages');
      const targetProfile = friendProfile || acceptedFriends.find((f) => f.profiles.id === friendId)?.profiles || null;
      if (targetProfile) {
        setSelectedFriend(targetProfile);
      }
      setIsOpeningChat(true);
      const convId = await openConversationWithFriend(friendId);
      setSelectedConversationId(convId);
      handledChatParamRef.current = friendId;
      setSearchParams({ tab: 'messages', conversationId: convId }, { replace: true });
    } catch (err: any) {
      console.error('Failed to open chat with friend:', err);
      showErrorToast(err, 'Could not start conversation with this friend.', 'start_chat_error');
    } finally {
      setIsOpeningChat(false);
    }
  };

  // Add friend handler with optimistic feedback and suggestion reconciliation
  const handleSendFriendRequest = async (targetUserId: string) => {
    if (requestedUserIds.has(targetUserId)) return;
    setRequestedUserIds((prev) => new Set(prev).add(targetUserId));
    excludeUser(targetUserId);
    await handleAddFriend(targetUserId);
  };

  // 6. Online / Offline Counts & Filtered Friends
  const onlineCount = useMemo(() => {
    return acceptedFriends.filter((f) => isUserOnline(f.profiles.id)).length;
  }, [acceptedFriends, isUserOnline]);

  const offlineCount = useMemo(() => {
    return Math.max(0, acceptedFriends.length - onlineCount);
  }, [acceptedFriends.length, onlineCount]);

  const filteredFriends = useMemo(() => {
    let list = [...acceptedFriends];

    // Filter by search query
    if (friendsSearchQuery.trim()) {
      const q = friendsSearchQuery.trim().toLowerCase();
      list = list.filter((f) => {
        const name = resolveProfileDisplayName(f.profiles, '').toLowerCase();
        const fullName = (f.profiles.full_name || '').toLowerCase();
        const username = (f.profiles.username || '').toLowerCase();
        const bio = (f.profiles.bio || '').toLowerCase();
        return name.includes(q) || fullName.includes(q) || username.includes(q) || bio.includes(q);
      });
    }

    // Filter by status (all / online / offline)
    if (statusFilter === 'online') {
      list = list.filter((f) => isUserOnline(f.profiles.id));
    } else if (statusFilter === 'offline') {
      list = list.filter((f) => !isUserOnline(f.profiles.id));
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'streak') {
        const streakA = a.profiles.current_streak ?? 0;
        const streakB = b.profiles.current_streak ?? 0;
        return streakB - streakA;
      }
      if (sortBy === 'username') {
        const nameA = resolveProfileDisplayName(a.profiles, a.profiles.username || '');
        const nameB = resolveProfileDisplayName(b.profiles, b.profiles.username || '');
        return nameA.localeCompare(nameB);
      }
      // 'recent': prioritize online users first, then by friendship created_at descending
      const onlineA = isUserOnline(a.profiles.id) ? 1 : 0;
      const onlineB = isUserOnline(b.profiles.id) ? 1 : 0;
      if (onlineA !== onlineB) return onlineB - onlineA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return list;
  }, [acceptedFriends, friendsSearchQuery, statusFilter, sortBy, isUserOnline]);

  if (friendsLoading && conversationsLoading && !user) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0A0A0A]">
        <Loader2 className="animate-spin text-emerald-400" size={32} />
      </div>
    );
  }

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const activeFriendProfile =
    selectedConversation?.friend ||
    selectedFriend ||
    acceptedFriends.find((f) => f.profiles.id === searchParams.get('chat'))?.profiles ||
    null;

  return (
    <div className="flex-1 w-full flex flex-col h-full min-h-0 bg-[#0A0A0A] overflow-hidden select-none">
      {/* 1. TOP SUB-NAV BAR (Always present) */}
      <FriendsTopNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        pendingRequestsCount={incomingRequests.length}
        unreadMessagesCount={totalUnreadCount}
        searchQuery={topSearchQuery}
        onSearchChange={(q) => {
          setTopSearchQuery(q);
          if (q.trim().length > 0 && !isFindPeopleOpen) {
            setIsFindPeopleOpen(true);
          }
        }}
        onOpenFindPeople={() => setIsFindPeopleOpen(true)}
      />

      {/* 2. MAIN CONTENT AREA ACCORDING TO ACTIVE TAB */}
      {activeTab === 'connections' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 md:py-5 flex flex-col">
            {/* HERO SECTION */}
            <ConnectionsHero />

            {/* 4 SUMMARY METRIC TILES */}
            <ConnectionsSummaryRow
              connectedFriendsCount={acceptedFriends.length}
              pendingRequestsCount={incomingRequests.length}
              peopleYouMayKnowCount={suggestedUsers.length}
              username={currentUsername}
              onSelectFriends={() => {
                setStatusFilter('all');
                setFriendsSearchQuery('');
              }}
              onSelectRequests={() => handleTabChange('requests')}
              onSelectDiscover={() => setIsFindPeopleOpen(true)}
            />

            {/* ERROR NOTIFICATION IF ANY */}
            {friendsError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                Could not refresh connections: {friendsError.message}
              </div>
            )}

            {/* MAIN TWO-COLUMN LAYOUT (~70% FRIENDS GRID / ~30% RIGHT SIDEBAR) */}
            <div className="w-full flex flex-col lg:flex-row items-start gap-5 lg:gap-6 pb-12">
              {/* LEFT COLUMN: FRIENDS CONTROLS & CARDS */}
              <div className="flex-1 min-w-0 w-full">
                {/* Search, Sort, Grid/List & Status Filter Pills */}
                <FriendsControls
                  searchQuery={friendsSearchQuery}
                  onSearchChange={setFriendsSearchQuery}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  totalCount={acceptedFriends.length}
                  onlineCount={onlineCount}
                  offlineCount={offlineCount}
                />

                {/* Friend Cards View */}
                {filteredFriends.length === 0 ? (
                  <div className="w-full py-12 px-4 bg-[#101313] border border-[#242828] border-dashed rounded-xl flex flex-col items-center justify-center text-center text-textMuted gap-2">
                    <span className="text-sm font-semibold text-[#EDEDED]">
                      {acceptedFriends.length === 0
                        ? 'No connections yet'
                        : 'No friends match this filter'}
                    </span>
                    <span className="text-xs text-textMuted max-w-sm">
                      {acceptedFriends.length === 0
                        ? 'Connect with fellow productivity seekers to share momentum and track streaks.'
                        : 'Try searching with another name or resetting the status filter.'}
                    </span>
                    {acceptedFriends.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setIsFindPeopleOpen(true)}
                        className="mt-2 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg transition-all shadow-sm"
                      >
                        + Find People to Add
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className={cn(
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 md:grid-cols-2 gap-3.5'
                        : 'flex flex-col gap-2'
                    )}
                  >
                    {filteredFriends.map((friendship) => (
                      <FriendCard
                        key={friendship.id}
                        friendship={friendship}
                        isOnline={isUserOnline(friendship.profiles.id)}
                        viewMode={viewMode}
                        onMessage={handleStartMessageWithFriend}
                        onRemoveFriend={handleRemoveFriend}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* RIGHT SIDEBAR: STICKY ON DESKTOP, NEVER SCROLLS OUT OF VIEW */}
              <aside className="w-full lg:w-80 xl:w-88 shrink-0 flex flex-col gap-3.5 lg:sticky lg:top-4 self-start max-h-[calc(100vh-100px)] lg:overflow-y-auto pr-0.5">
                {/* 1. Pending Requests Panel */}
                <PendingRequestsSidebar
                  incomingRequests={incomingRequests}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                  onViewAll={() => handleTabChange('requests')}
                />

                {/* 2. People You May Know Panel */}
                <PeopleYouMayKnowSidebar
                  suggestedUsers={suggestedUsers}
                  onAddFriend={handleSendFriendRequest}
                  onViewAll={() => setIsFindPeopleOpen(true)}
                  requestedUserIds={requestedUserIds}
                />
              </aside>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 py-4 md:py-6 flex flex-col">
            <RequestsView
              incomingRequests={incomingRequests}
              outgoingRequests={outgoingRequests}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onCancel={handleCancel}
            />
          </div>
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="flex-1 w-full flex overflow-hidden min-h-0">
          {/* LEFT PANE: CONVERSATION LIST (Hidden on mobile when a chat is selected) */}
          <div
            className={cn(
              'w-full md:w-80 lg:w-96 shrink-0 h-full flex flex-col min-h-0 border-r border-[#242828]/60 bg-[#0A0A0A]',
              selectedConversationId ? 'hidden md:flex' : 'flex'
            )}
          >
            <ConversationList
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={(id, friend) => {
                setSelectedConversationId(id);
                setSelectedFriend(friend);
                setSearchParams({ tab: 'messages', conversationId: id });
              }}
              acceptedFriends={acceptedFriends}
              onStartWithFriend={(id, friend) => handleStartMessageWithFriend(id, friend)}
              loading={conversationsLoading}
            />
          </div>

          {/* RIGHT PANE: SELECTED CONVERSATION CHAT PANE */}
          <div
            className={cn(
              'flex-1 w-full h-full min-w-0 min-h-0 bg-[#080909] flex flex-col',
              !selectedConversationId ? 'hidden md:flex' : 'flex'
            )}
          >
            {isOpeningChat && !selectedConversationId ? (
              <div className="flex-1 w-full flex flex-col items-center justify-center p-8 text-center text-textMuted gap-3 select-none">
                <Loader2 size={32} className="animate-spin text-emerald-400" />
                <span className="text-sm font-medium">Opening conversation...</span>
              </div>
            ) : selectedConversationId && activeFriendProfile ? (
              <ChatPane
                key={selectedConversationId}
                conversationId={selectedConversationId}
                friendProfile={activeFriendProfile}
                onBack={() => {
                  setSelectedConversationId(null);
                  setSelectedFriend(null);
                  setSearchParams({ tab: 'messages' });
                }}
              />
            ) : (
              /* EMPTY CHAT SELECTION STATE */
              <div className="flex-1 w-full flex flex-col items-center justify-center p-8 text-center text-textMuted gap-4 select-none">
                <div className="w-16 h-16 rounded-full bg-[#101313] border border-[#242828] flex items-center justify-center">
                  <Loader2 size={24} className="text-textMuted/40" />
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  <span className="text-sm font-bold text-[#EDEDED] tracking-wide uppercase">
                    Your Messages
                  </span>
                  <span className="text-xs text-textMuted leading-relaxed">
                    Select a conversation from the list or start a chat from your connections.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. FIND PEOPLE DISCOVERY MODAL */}
      <FindPeopleModal
        isOpen={isFindPeopleOpen}
        onClose={() => {
          setIsFindPeopleOpen(false);
          setTopSearchQuery('');
        }}
        currentUserId={user?.id}
        currentUsername={currentUsername}
        friendships={friendships}
        suggestedUsers={suggestedUsers}
        onAddFriend={handleSendFriendRequest}
        onAcceptRequest={handleAccept}
        onMessageFriend={handleStartMessageWithFriend}
        getFriendshipStatus={getFriendshipStatus}
      />
    </div>
  );
}

export default FriendsPage;
