/* eslint-disable react-compiler/react-compiler, react/purity, react-hooks/exhaustive-deps, react/set-state-in-effect */
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Loader2,
  Check,
  X,
  Search,
  UserPlus,
  Flame,
  ArrowRight,
  MessageSquare,
  Users
} from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useDebounce } from '../hooks/useDebounce';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { useFriends, type Profile } from '../hooks/useFriends';
import { useConversations } from '../hooks/useConversations';
import { ConversationList } from '../components/chat/ConversationList';
import { ChatPane } from '../components/chat/ChatPane';
import { SmoothInput } from '../components/ui/SmoothInput';
import { showErrorToast } from '../lib/toast';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } }
};

export function FriendsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    user,
    incomingRequests,
    outgoingRequests,
    acceptedFriends,
    loading: friendsLoading,
    error: friendsError,
    handleAddFriend,
    handleAccept,
    handleDecline,
    handleCancel,
    getFriendshipStatus
  } = useFriends();

  const {
    conversations,
    loading: conversationsLoading,
    totalUnreadCount,
    openConversationWithFriend,
    markAsRead
  } = useConversations();

  // Active sub-tab in Friends: 'connections' or 'messages'
  const initialTab = searchParams.get('tab') === 'messages' || searchParams.get('chat') ? 'messages' : 'connections';
  const [activeTab, setActiveTab] = useState<'connections' | 'messages'>(initialTab);

  // Selected conversation ID and selected friend profile
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null);
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  // Search in Connections tab
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 400);

  const handledChatParamRef = useRef<string | null>(null);

  // Handle URL deep-linking: ?chat=<friendId> or ?conversationId=<id>
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
          // Transition URL from ?chat= to ?conversationId= to permanently prevent re-trigger loop
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

  // Search users in Connections tab
  useEffect(() => {
    let active = true;
    const performSearch = async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const { data, error: searchErr } = await supabase
          .from('profiles')
          .select('id, username, display_name, full_name, avatar_url, bio')
          .ilike('username', `%${debouncedSearch}%`)
          .neq('id', user?.id)
          .eq('visibility', 'public')
          .limit(10);
        if (searchErr) throw searchErr;
        if (active) setSearchResults(data || []);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        if (active) setIsSearching(false);
      }
    };
    performSearch();
    return () => {
      active = false;
    };
  }, [debouncedSearch, user?.id]);

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

  if (friendsLoading && conversationsLoading && !user) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  // Find the selected conversation item and friend profile with multiple fallbacks
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const activeFriendProfile =
    selectedConversation?.friend ||
    selectedFriend ||
    acceptedFriends.find((f) => f.profiles.id === searchParams.get('chat'))?.profiles ||
    null;

  return (
    <div className="flex-1 w-full flex flex-col h-full min-h-0 bg-background overflow-hidden">
      {/* TOP SUB-TAB NAVIGATION */}
      <div className={cn(
        "px-4 md:px-8 pt-4 pb-2 border-b border-border/20 flex items-center justify-between shrink-0 bg-background/80 backdrop-blur-sm z-20",
        activeTab === 'messages' && selectedConversationId ? 'hidden md:flex' : 'flex'
      )}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab('connections');
              setSearchParams({});
            }}
            className={cn(
              'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all duration-200 select-none',
              activeTab === 'connections'
                ? 'bg-surface text-textMain border border-border/50 shadow-sm'
                : 'text-textMuted hover:text-textMain hover:bg-surface/40'
            )}
          >
            <Users size={14} />
            <span>Connections</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('messages');
              setSearchParams({ tab: 'messages' });
            }}
            className={cn(
              'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all duration-200 select-none relative',
              activeTab === 'messages'
                ? 'bg-surface text-textMain border border-border/50 shadow-sm'
                : 'text-textMuted hover:text-textMain hover:bg-surface/40'
            )}
          >
            <MessageSquare size={14} />
            <span>Messages</span>
            {totalUnreadCount > 0 && (
              <span className="px-1.5 py-0.2 min-w-[18px] text-[10px] font-bold text-background bg-accent rounded-full text-center leading-tight">
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      {activeTab === 'connections' ? (
        /* CONNECTIONS TAB: FRIENDS LIST, SEARCH & REQUESTS */
        <div className="flex-1 overflow-y-auto">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-col max-w-[1200px] w-full mx-auto p-4 md:p-8 lg:p-12 gap-10 md:gap-14 pb-24"
          >
            {/* HEADER & SEARCH */}
            <motion.div variants={itemVariants} className="flex flex-col gap-6 max-w-2xl w-full mt-2">
              <div className="flex flex-col gap-1.5">
                <h1 className="text-3xl md:text-4xl font-black text-textMain tracking-tight">FRIENDS</h1>
                <p className="text-[10px] md:text-xs font-bold text-textMuted tracking-widest uppercase">
                  Build your circle. Stay consistent.
                </p>
              </div>

              <div className="relative w-full">
                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-textMuted" />
                <SmoothInput
                  type="text"
                  placeholder="Find a friend by username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                  className="w-full bg-surface/40 hover:bg-surface/60 border border-border/40 focus:border-border/80 focus:bg-surface/80 text-sm md:text-base text-textMain rounded-2xl pl-12 pr-12 py-3.5 md:py-4 outline-none transition-all placeholder:text-textMuted/60"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain p-1 transition-colors"
                  >
                    {isSearching ? <Loader2 size={16} className="animate-spin text-textMuted" /> : <X size={16} />}
                  </button>
                )}

                <AnimatePresence>
                  {searchQuery.length > 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="absolute top-[calc(100%+8px)] left-0 right-0 bg-surface/95 backdrop-blur-xl border border-border/50 rounded-2xl p-2 shadow-2xl z-30 flex flex-col gap-1 max-h-[300px] overflow-y-auto"
                    >
                      {!isSearching && searchResults.length === 0 ? (
                        <div className="p-6 text-center text-xs font-bold text-textMuted">No users found.</div>
                      ) : (
                        searchResults.map((res) => {
                          const displayName = res.display_name || res.full_name;
                          const status = getFriendshipStatus(res.id);
                          return (
                            <div
                              key={res.id}
                              className="flex items-center justify-between p-2 md:p-3 hover:bg-surface/60 rounded-xl transition-colors group"
                            >
                              <Link
                                to={`/u/${res.username}`}
                                className="flex items-center gap-3 md:gap-4 min-w-0 flex-1 outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                <div className="w-10 h-10 rounded-full bg-border/20 overflow-hidden shrink-0 flex items-center justify-center group-hover:scale-105 transition-transform">
                                  {res.avatar_url ? (
                                    <img src={res.avatar_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs font-bold text-textMuted">
                                      {displayName?.substring(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-bold text-textMain truncate group-hover:text-white transition-colors">
                                    {displayName}
                                  </span>
                                  <span className="text-[10px] text-textMuted font-medium uppercase tracking-wider truncate">
                                    @{res.username}
                                  </span>
                                </div>
                              </Link>

                              <div className="shrink-0 ml-4 flex items-center">
                                {status === 'none' && (
                                  <button
                                    onClick={() => handleAddFriend(res.id)}
                                    className="p-2 md:px-4 md:py-2 text-textMain hover:bg-white hover:text-background bg-surface border border-border/40 rounded-full md:rounded-xl transition-colors flex items-center gap-2"
                                    title="Add Friend"
                                  >
                                    <UserPlus size={14} />
                                    <span className="hidden md:inline text-[10px] font-bold tracking-widest uppercase">
                                      Add
                                    </span>
                                  </button>
                                )}
                                {status === 'sent' && (
                                  <span className="text-[9px] font-bold tracking-widest uppercase text-textMuted/50 px-2 md:px-4">
                                    Requested
                                  </span>
                                )}
                                {status === 'received' && (
                                  <span className="text-[9px] font-bold tracking-widest uppercase text-accent px-2 md:px-4">
                                    Check
                                  </span>
                                )}
                                {status === 'friends' && (
                                  <button
                                    onClick={() => handleStartMessageWithFriend(res.id, res)}
                                    className="px-3 py-1.5 bg-surface border border-border/40 hover:border-accent text-textMain hover:text-accent rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                                  >
                                    <MessageSquare size={12} />
                                    <span>Message</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {friendsError && (
              <motion.div
                variants={itemVariants}
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm max-w-2xl"
              >
                Failed to load connections: {friendsError.message}
              </motion.div>
            )}

            {/* PENDING REQUESTS */}
            {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
              <motion.div variants={itemVariants} className="flex flex-col gap-5 w-full">
                <h2 className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-textMuted">
                  Pending Requests
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {incomingRequests.map((req) => {
                    const displayName = req.profiles.display_name || req.profiles.full_name;
                    return (
                      <div
                        key={req.id}
                        className="flex flex-col justify-between p-4 bg-surface/30 border border-border/40 rounded-2xl gap-4 group hover:bg-surface/50 hover:border-border/60 transition-colors"
                      >
                        <Link
                          to={`/u/${req.profiles.username}`}
                          className="flex items-center gap-4 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
                        >
                          <div className="w-12 h-12 rounded-full bg-border/20 flex shrink-0 items-center justify-center overflow-hidden">
                            {req.profiles.avatar_url ? (
                              <img src={req.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-sm font-bold text-textMuted">
                                {displayName?.substring(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-textMain truncate">{displayName}</span>
                            <span className="text-[10px] text-textMuted font-medium uppercase tracking-wider truncate">
                              @{req.profiles.username}
                            </span>
                          </div>
                        </Link>
                        <div className="flex items-center gap-2 mt-auto pt-1">
                          <button
                            onClick={() => handleDecline(req.id)}
                            className="px-4 py-2 bg-surface border border-border/40 hover:border-textMuted text-textMuted hover:text-textMain text-[10px] font-bold tracking-widest uppercase rounded-xl transition-colors"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => handleAccept(req.id)}
                            className="flex-1 py-2 bg-textMain hover:bg-white text-background text-[10px] font-bold tracking-widest uppercase rounded-xl transition-colors flex justify-center items-center gap-1.5"
                          >
                            <Check size={14} /> Accept
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {outgoingRequests.map((req) => {
                    const displayName = req.profiles.display_name || req.profiles.full_name;
                    return (
                      <div
                        key={req.id}
                        className="flex items-center justify-between p-4 bg-surface/10 border border-border/20 rounded-2xl gap-4 opacity-80 hover:opacity-100 transition-all hover:bg-surface/20"
                      >
                        <Link
                          to={`/u/${req.profiles.username}`}
                          className="flex items-center gap-4 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg flex-1"
                        >
                          <div className="w-10 h-10 rounded-full bg-border/20 flex shrink-0 items-center justify-center overflow-hidden">
                            {req.profiles.avatar_url ? (
                              <img src={req.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-textMuted">
                                {displayName?.substring(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-textMain/80 truncate">{displayName}</span>
                            <span className="text-[10px] text-accent/80 font-medium uppercase tracking-wider truncate">
                              Requested
                            </span>
                          </div>
                        </Link>
                        <button
                          onClick={() => handleCancel(req.id)}
                          className="p-2 text-textMuted hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors shrink-0"
                          title="Cancel Request"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ACCEPTED FRIENDS */}
            <motion.div variants={itemVariants} className="flex flex-col gap-5 w-full">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-textMuted">
                  Your Friends{' '}
                  {acceptedFriends.length > 0 && (
                    <span className="text-textMuted/50">({acceptedFriends.length})</span>
                  )}
                </h2>
              </div>

              {acceptedFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-20 px-4 bg-surface/10 border border-border/20 rounded-3xl border-dashed w-full max-w-2xl">
                  <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-5">
                    <UserPlus size={24} className="text-textMuted" />
                  </div>
                  <span className="text-base font-bold text-textMain mb-2">No friends yet</span>
                  <span className="text-xs md:text-sm text-textMuted max-w-[260px]">
                    Search for a username above to start building your circle.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 w-full">
                  {acceptedFriends.map((friend) => {
                    const displayName = friend.profiles.display_name || friend.profiles.full_name;
                    const streakVal = friend.profiles.current_streak;
                    const hasStreak = typeof streakVal === 'number' && streakVal > 0;

                    return (
                      <div
                        key={friend.id}
                        className="flex flex-col p-4 md:p-5 bg-surface/20 hover:bg-surface/40 border border-border/30 hover:border-border/60 rounded-2xl transition-all duration-300 group relative overflow-hidden"
                      >
                        <Link
                          to={`/u/${friend.profiles.username}`}
                          className="flex items-start gap-4 mb-6 outline-none"
                        >
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-border/20 overflow-hidden flex items-center justify-center shrink-0 border border-border/10 group-hover:border-border/40 transition-colors duration-300">
                            {friend.profiles.avatar_url ? (
                              <img
                                src={friend.profiles.avatar_url}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            ) : (
                              <span className="text-sm md:text-base font-bold text-textMuted group-hover:text-textMain transition-colors duration-300">
                                {displayName?.substring(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col flex-1 min-w-0 pt-0.5">
                            <span className="text-sm md:text-base font-bold text-textMain tracking-tight truncate group-hover:text-white transition-colors duration-300">
                              {displayName}
                            </span>
                            <span className="text-[10px] md:text-[11px] text-textMuted font-medium uppercase tracking-wider truncate">
                              @{friend.profiles.username}
                            </span>
                          </div>
                        </Link>

                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/10">
                          <div className="flex items-center gap-1.5">
                            <Flame
                              size={14}
                              className={cn('transition-colors', hasStreak ? 'text-accent' : 'text-textMuted/30')}
                            />
                            {streakVal === null || streakVal === undefined ? (
                              <span className="text-xs font-bold text-textMuted/40">-</span>
                            ) : (
                              <span
                                className={cn(
                                  'text-xs md:text-sm font-bold tabular-nums transition-colors',
                                  hasStreak ? 'text-textMain' : 'text-textMuted/50'
                                )}
                              >
                                {streakVal} {streakVal === 1 ? 'DAY' : 'DAYS'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStartMessageWithFriend(friend.profiles.id, friend.profiles)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-accent border border-border/30 hover:border-accent text-textMain hover:text-background rounded-xl transition-all shadow-sm"
                              title="Send Message"
                            >
                              <MessageSquare size={13} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Message</span>
                            </button>

                            <Link
                              to={`/u/${friend.profiles.username}`}
                              className="p-1.5 text-textMuted hover:text-textMain rounded-lg transition-colors"
                              title="View Profile"
                            >
                              <ArrowRight size={14} />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        </div>
      ) : (
        /* MESSAGES TAB: TWO-PANE DESKTOP / SINGLE-PANE MOBILE DIRECT MESSAGING WORKSPACE */
        <div className="flex-1 w-full flex overflow-hidden min-h-0">
          {/* DESKTOP TWO-PANE & MOBILE VIEW */}
          {/* LEFT PANE: CONVERSATION LIST (Hidden on mobile if a conversation is selected) */}
          <div
            className={cn(
              'w-full md:w-80 lg:w-96 shrink-0 h-full flex flex-col min-h-0',
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

          {/* RIGHT PANE: SELECTED CONVERSATION CHAT PANE (Hidden on mobile if no conversation is selected) */}
          <div
            className={cn(
              'flex-1 w-full h-full min-w-0 min-h-0 bg-background flex flex-col',
              !selectedConversationId ? 'hidden md:flex' : 'flex'
            )}
          >
            {isOpeningChat && !selectedConversationId ? (
              <div className="flex-1 w-full flex flex-col items-center justify-center p-8 text-center text-textMuted gap-3 select-none">
                <Loader2 size={32} className="animate-spin text-accent" />
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
              /* DESKTOP EMPTY STATE WHEN NO CONVERSATION IS CURRENTLY SELECTED */
              <div className="flex-1 w-full flex flex-col items-center justify-center p-8 text-center text-textMuted gap-4 select-none">
                <div className="w-16 h-16 rounded-full bg-surface/30 border border-border/30 flex items-center justify-center">
                  <MessageSquare size={28} className="text-textMuted/50" />
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  <span className="text-sm font-bold text-textMain tracking-wide uppercase">
                    Your Messages
                  </span>
                  <span className="text-xs text-textMuted leading-relaxed">
                    Select a conversation from the left to read messages, or click Message on any of your accepted friends.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
