import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loader2, Check, X, Search } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { calculateStreakFromDates } from '../lib/dataManager';

type Profile = {
  id: string;
  username: string;
  display_name: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  current_streak?: number;
};

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  profiles: Profile;
};

type DetailedError = {
  message: string;
  code?: string;
  details?: string;
  query?: string;
};

export function FriendsPage() {
  const { user, profile } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<DetailedError | null>(null);

  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DetailedError | null>(null);
  const [myStreak, setMyStreak] = useState<number>(profile?.current_streak || 0);

  useEffect(() => {
    if (profile?.current_streak !== undefined && profile.current_streak > 0) {
      setMyStreak(profile.current_streak);
    }
  }, [profile?.current_streak]);

  const fetchFriendships = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      // Step A: Load user's own streak with multi-layer resilience
      let userStreak = profile?.current_streak || 0;
      if (userStreak === 0 && user) {
        const { data: myStats } = await supabase
          .from('user_stats')
          .select('current_streak')
          .eq('user_id', user.id)
          .maybeSingle();

        if (myStats?.current_streak && myStats.current_streak > 0) {
          userStreak = myStats.current_streak;
        } else {
          const { data: recentCompletions } = await supabase
            .from('task_completions')
            .select('completed_date')
            .eq('user_id', user.id)
            .order('completed_date', { ascending: false })
            .limit(30);

          if (recentCompletions && recentCompletions.length > 0) {
            userStreak = calculateStreakFromDates(
              recentCompletions.map(c => c.completed_date)
            );
            if (userStreak > 0) {
              supabase.from('user_stats').upsert({ user_id: user.id, current_streak: userStreak }).then();
            }
          }
        }
      }
      setMyStreak(userStreak);

      // Layer 1: Load friendship rows. Column is addressee_id
      const { data: rels, error: relsError } = await supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .neq('status', 'cancelled')
        .neq('status', 'declined');

      if (relsError) throw { ...relsError, query: "friendships.select().or('requester_id,addressee_id')" };

      if (!rels || rels.length === 0) {
        setFriendships([]);
        setLoading(false);
        return;
      }

      // Layer 2: Determine the other user's ID for each row
      const otherUserIds = rels.map(r => r.requester_id === user.id ? r.addressee_id : r.requester_id);

      // Layer 3: Use get_friend_profiles RPC (SECURITY DEFINER)
      const { data: profiles, error: profileError } = await supabase.rpc('get_friend_profiles', {
        user_ids: otherUserIds
      });

      // If the RPC doesn't exist yet or errors, fall back to direct query (joining user_stats)
      let resolvedProfiles = profiles;
      if (profileError) {
        console.warn('[FRIENDS] get_friend_profiles RPC failed, falling back to direct query:', profileError.message);
        const [fallbackProfilesRes, fallbackStatsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, username, display_name, full_name, avatar_url, bio')
            .in('id', otherUserIds),
          supabase
            .from('user_stats')
            .select('user_id, current_streak')
            .in('user_id', otherUserIds)
        ]);

        const statsMap = new Map((fallbackStatsRes.data || []).map(s => [s.user_id, s.current_streak]));
        resolvedProfiles = (fallbackProfilesRes.data || []).map((p: any) => ({
          ...p,
          current_streak: statsMap.get(p.id) || 0
        }));
      }

      const combined: Friendship[] = [];

      for (const r of rels) {
        const otherId = r.requester_id === user.id ? r.addressee_id : r.requester_id;
        const prof = resolvedProfiles?.find((p: any) => p.id === otherId);

        if (prof) {
          const current_streak = prof.current_streak || 0;
          combined.push({ ...r, profiles: { ...prof, current_streak } });
        } else {
          console.warn('[FRIENDS] Profile row missing for user', otherId);
        }
      }

      setFriendships(combined);

    } catch (err: any) {
      console.error('[FRIENDS] Fatal error:', err);
      setError({
        message: err.message || 'Unknown error loading friends.',
        code: err.code,
        details: err.details || err.hint,
        query: err.query
      });
    } finally {
      setLoading(false);
    }
  }, [user, profile?.current_streak]);

  useEffect(() => {
    fetchFriendships();

    if (!user) return;

    // Realtime updates for friendship changes and user stats updates
    const channel = supabase
      .channel(`friendships_changes_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${user.id}` }, () => fetchFriendships())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` }, () => fetchFriendships())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stats' }, () => fetchFriendships())
      .subscribe((_status, err) => {
        if (err) console.warn('[FRIENDS] Realtime error (non-fatal):', err);
      });

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchFriendships]);

  useEffect(() => {
    async function performSearch() {
      if (!debouncedSearch.trim()) {
        setSearchResults([]);
        setSearchLoading(false);
        setSearchError(null);
        return;
      }
      setSearchLoading(true);
      setSearchError(null);
      // Normalize: lowercase, trim, remove leading @
      const cleanQuery = debouncedSearch.trim().toLowerCase().replace(/^@+/, '');



      try {
        const { data, error } = await supabase.rpc('search_users_by_username', { search_query: `%${cleanQuery}%` });



        if (error) {
          // Fallback to direct query if RPC doesn't exist yet
          console.warn('[FRIENDS] RPC search failed, falling back to direct query', error);
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('profiles')
            .select('id, username, display_name, full_name, avatar_url, bio, visibility')
            .ilike('username', `%${cleanQuery}%`)
            .limit(10);

          if (fallbackError) throw { ...fallbackError, query: "profiles.select().ilike('username', ...)" };

          if (fallbackData) {
            setSearchResults(fallbackData);
          }
        } else if (data) {
          setSearchResults(data);
        }
      } catch (err: any) {
        console.error('[FRIENDS] Search error:', err);
        setSearchError({ message: err.message || 'Error executing search.', code: err.code, details: err.details, query: err.query });
      } finally {
        setSearchLoading(false);
      }
    }
    performSearch();
  }, [debouncedSearch]);

  const handleAddFriend = async (targetUserId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('friendships')
        .insert({ requester_id: user.id, addressee_id: targetUserId, status: 'pending' });

      if (error) {
        // If row was previously declined/cancelled, attempt re-request
        const { error: updateError } = await supabase
          .from('friendships')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`);

        if (updateError) throw error;
      }
      toast.success('Friend request sent');
      fetchFriendships();
    } catch (err: any) {
      console.error('[FRIENDS] Add Friend Error:', err);
      toast.error('Could not send friend request');
    }
  };

  const handleAccept = async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);

      if (error) throw error;
      toast.success('Friend request accepted');
      fetchFriendships();
    } catch (err: any) {
      console.error('[FRIENDS] Accept Error:', err);
      toast.error('Failed to accept friend request');
    }
  };

  const handleDecline = async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);

      if (error) throw error;
      toast.success('Friend request declined');
      fetchFriendships();
    } catch (err: any) {
      console.error('[FRIENDS] Decline Error:', err);
      toast.error('Failed to decline friend request');
    }
  };

  const handleCancel = async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);

      if (error) {
        // Fallback delete if update policy differs
        const { error: delError } = await supabase
          .from('friendships')
          .delete()
          .eq('id', friendshipId);
        if (delError) throw delError;
      }
      toast.success('Friend request cancelled');
      fetchFriendships();
    } catch (err: any) {
      console.error('[FRIENDS] Cancel Error:', err);
      toast.error('Failed to cancel friend request');
    }
  };

  // Determine relationship state for a given user ID
  const getFriendshipStatus = (otherUserId: string) => {
    if (user?.id === otherUserId) return 'you';
    const rel = friendships.find(f => f.requester_id === otherUserId || f.addressee_id === otherUserId);
    if (!rel) return 'none';
    if (rel.status === 'accepted') return 'friends';
    if (rel.status === 'pending') {
      return rel.requester_id === user?.id ? 'sent' : 'received';
    }
    return 'none';
  };

  // ─── Loading State ────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-textMuted gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <p className="text-[10px] tracking-widest uppercase font-bold">Loading Friends</p>
      </div>
    );
  }

  // ─── Error State (with full diagnostic output) ────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-6 animate-fade-in px-4">
        <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-red-500">Notice</div>
        <div className="flex flex-col gap-2 w-full max-w-lg items-center">
          <h2 className="text-2xl font-black text-textMain tracking-tighter uppercase">Unable to load friends</h2>
          <p className="text-sm font-medium text-textMuted leading-relaxed">
            We encountered an issue loading your social connections. Please try again in a moment.
          </p>
        </div>
        <button onClick={() => { setLoading(true); fetchFriendships(); }}
          className="px-6 py-3 mt-4 bg-white/5 hover:bg-white/10 text-xs font-bold tracking-[0.2em] uppercase text-white transition-colors rounded-full border border-white/10">
          Try Again
        </button>
      </div>
    );
  }

  // ─── Derived lists — using correct column: addressee_id ─
  const incomingRequests = friendships.filter(f => f.status === 'pending' && f.addressee_id === user?.id);
  const outgoingRequests = friendships.filter(f => f.status === 'pending' && f.requester_id === user?.id);
  const acceptedFriends = friendships.filter(f => f.status === 'accepted');

  const leaderboardUsers = [
    ...(user && profile ? [{
      id: user.id,
      username: profile.username || '',
      display_name: profile.display_name || '',
      full_name: profile.full_name || '',
      avatar_url: profile.avatar_url || '',
      bio: profile.bio || '',
      current_streak: myStreak
    }] : []),
    ...acceptedFriends.map(f => ({ ...f.profiles, current_streak: f.profiles.current_streak || 0 }))
  ].sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0));

  return (
    <div className="max-w-4xl mx-auto w-full pt-8 md:pt-12 pb-32 px-4 md:px-8 animate-fade-in flex flex-col gap-16">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-textMain tracking-tighter uppercase mb-4">Friends</h1>
        <p className="text-textMuted text-sm font-medium">Find people. Build your circle.</p>
      </div>

      {/* SEARCH */}
      <div className="flex flex-col gap-4">
        <div className="relative w-full">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted"><Search size={18} /></span>
          <input
            type="text"
            className="w-full bg-surface border border-border/30 rounded-xl py-4 pl-12 pr-4 text-sm font-bold text-textMain focus:outline-none focus:border-accent transition-colors"
            placeholder="Search by @username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchLoading && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-textMuted"><Loader2 size={16} className="animate-spin" /></span>
          )}
        </div>

        {searchQuery.trim() !== '' && (
          <div className="flex flex-col gap-2 bg-surface/50 border border-border/20 p-4 rounded-xl">
            <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase mb-2">Search Results</span>
            {searchError ? (
              <div className="text-xs font-mono text-red-400 p-2 bg-red-500/10 rounded border border-red-500/20">
                Search Error: {searchError.message}
              </div>
            ) : searchResults.length === 0 && !searchLoading ? (
              <span className="text-sm font-medium text-textMuted">No users found for "{searchQuery}"</span>
            ) : (
              <div className="flex flex-col gap-3">
                {searchResults.map(res => {
                  const displayName = res.display_name || res.full_name;
                  const relStatus = getFriendshipStatus(res.id);
                  const relRow = friendships.find(f => f.requester_id === res.id || f.addressee_id === res.id);
                  return (
                    <div key={res.id} className="flex items-center justify-between">
                      <Link to={`/u/${res.username}`} className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-full bg-border/20 overflow-hidden flex items-center justify-center border border-transparent group-hover:border-accent/50 transition-colors">
                          {res.avatar_url
                            ? <img src={res.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            : <span className="text-xs font-bold text-textMuted">{displayName?.substring(0, 2).toUpperCase()}</span>}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-textMain tracking-tight">{displayName}</span>
                          <span className="text-[10px] text-textMuted font-medium uppercase tracking-widest">@{res.username}</span>
                        </div>
                      </Link>
                      {relStatus === 'you' && <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase">YOU</span>}
                      {relStatus === 'friends' && <span className="text-[10px] font-bold tracking-widest text-accent uppercase flex items-center gap-1"><Check size={12} /> FRIENDS</span>}
                      {relStatus === 'sent' && <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase">REQUEST SENT</span>}
                      {relStatus === 'received' && (
                        <button onClick={() => relRow && handleAccept(relRow.id)}
                          className="px-3 py-1.5 bg-accent text-background text-[10px] font-bold tracking-widest uppercase rounded flex items-center gap-1">
                          <Check size={12} /> ACCEPT
                        </button>
                      )}
                      {relStatus === 'none' && (
                        <button onClick={() => handleAddFriend(res.id)}
                          className="px-4 py-1.5 border border-border/30 hover:border-textMuted text-[10px] font-bold tracking-widest uppercase text-textMain transition-colors rounded">
                          ADD FRIEND
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* STREAK LEADERBOARD */}
      <div className="flex flex-col gap-6">
        <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted">Streak Leaderboard</span>
        {leaderboardUsers.length === 0 ? (
          <div className="text-xs font-bold text-textMuted/50 tracking-widest uppercase py-4">No data.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {leaderboardUsers.map((lbUser, idx) => {
              const displayName = lbUser.display_name || lbUser.full_name;
              return (
                <div key={lbUser.id} className="flex items-center justify-between p-4 border border-border/10 rounded-xl bg-surface/30">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-black text-textMuted w-4">{idx + 1}</span>
                    <div className="w-10 h-10 rounded-full bg-border/20 overflow-hidden flex items-center justify-center shrink-0">
                      {lbUser.avatar_url
                        ? <img src={lbUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                        : <span className="text-xs font-bold text-textMuted">{displayName?.substring(0, 2).toUpperCase()}</span>}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-textMain tracking-tight">{displayName}</span>
                      <span className="text-[10px] text-textMuted font-medium tracking-widest uppercase">@{lbUser.username}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xl md:text-2xl font-bold text-textMain tracking-tighter leading-tight uppercase">{lbUser.current_streak} DAYS</span>
                    <span className="text-[9px] font-bold tracking-[0.2em] text-textMuted uppercase">CURRENT STREAK</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-full h-px bg-border/20" />

      {/* FRIEND REQUESTS */}
      <div className="flex flex-col gap-6">
        <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted">Friend Requests</span>
        {incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
          <div className="text-xs font-bold text-textMuted/50 tracking-widest uppercase py-4">No pending requests.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {incomingRequests.map(req => {
              const displayName = req.profiles.display_name || req.profiles.full_name;
              return (
                <div key={req.id} className="flex items-center justify-between p-4 bg-surface border border-border/30 rounded-xl">
                  <Link to={`/u/${req.profiles.username}`} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-border/20 overflow-hidden flex items-center justify-center shrink-0">
                      {req.profiles.avatar_url
                        ? <img src={req.profiles.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                        : <span className="text-xs font-bold text-textMuted">{displayName?.substring(0, 2).toUpperCase()}</span>}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-textMain tracking-tight">{displayName}</span>
                      <span className="text-[10px] text-textMuted font-medium uppercase tracking-widest">@{req.profiles.username}</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleDecline(req.id)} className="p-2 text-textMuted hover:text-red-400 transition-colors rounded-full hover:bg-red-400/10">
                      <X size={16} />
                    </button>
                    <button onClick={() => handleAccept(req.id)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold tracking-widest uppercase text-white transition-colors rounded-full flex items-center gap-2">
                      <Check size={12} className="text-accent" /> ACCEPT
                    </button>
                  </div>
                </div>
              );
            })}
            {outgoingRequests.map(req => {
              const displayName = req.profiles.display_name || req.profiles.full_name;
              return (
                <div key={req.id} className="flex items-center justify-between p-4 border border-border/20 rounded-xl">
                  <Link to={`/u/${req.profiles.username}`} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-border/20 overflow-hidden flex items-center justify-center shrink-0">
                      {req.profiles.avatar_url
                        ? <img src={req.profiles.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                        : <span className="text-xs font-bold text-textMuted">{displayName?.substring(0, 2).toUpperCase()}</span>}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-textMain tracking-tight">{displayName}</span>
                      <span className="text-[10px] text-textMuted font-medium tracking-widest uppercase">@{req.profiles.username}</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold tracking-widest text-textMuted uppercase hidden sm:inline">REQUEST SENT</span>
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="px-3 py-1.5 border border-red-500/30 hover:border-red-500/60 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold tracking-widest uppercase rounded-full transition-colors flex items-center gap-1.5"
                    >
                      <X size={12} /> CANCEL
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FRIENDS LIST */}
      <div className="flex flex-col gap-6">
        <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-textMuted">Your Friends</span>
        {acceptedFriends.length === 0 ? (
          <div className="text-xs font-bold text-textMuted/50 tracking-widest uppercase py-8 flex flex-col gap-2">
            <span>Your circle is empty.</span>
            <span>Find someone by username to get started.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {acceptedFriends.map(friend => {
              const displayName = friend.profiles.display_name || friend.profiles.full_name;
              return (
                <Link to={`/u/${friend.profiles.username}`} key={friend.id}
                  className="flex flex-col p-6 border border-border/30 rounded-xl hover:bg-surface/30 transition-colors group">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-border/20 overflow-hidden flex items-center justify-center shrink-0 border border-border/50 group-hover:border-accent/50 transition-colors">
                      {friend.profiles.avatar_url
                        ? <img src={friend.profiles.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                        : <span className="text-sm font-bold text-textMuted">{displayName?.substring(0, 2).toUpperCase()}</span>}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-textMain tracking-tight">{displayName}</span>
                      <span className="text-[10px] text-accent font-medium tracking-widest uppercase">@{friend.profiles.username}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-auto">
                    <div className="flex flex-col">
                      <span className="text-lg font-black tracking-tighter text-textMain">{friend.profiles.current_streak || 0}</span>
                      <span className="text-[9px] font-bold tracking-widest uppercase text-textMuted">STREAK</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
