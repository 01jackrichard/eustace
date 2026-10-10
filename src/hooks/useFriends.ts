import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateStreakFromDates } from '../lib/dataManager';
import toast from 'react-hot-toast';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  full_name: string;
  avatar_url: string;
  bio: string;
  current_streak?: number | null;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  profiles: Profile;
};

export type DetailedError = {
  message: string;
  code?: string;
  details?: string;
  query?: string;
};

export function useFriends() {
  const { user, profile } = useAuth();
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DetailedError | null>(null);
  const [myStreak, setMyStreak] = useState<number | null>(null);

  

  const fetchFriendships = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      if (user) {
        const { data: myStats } = await supabase.rpc('calculate_user_streak', { target_user_id: user.id });
        setMyStreak(typeof myStats === 'number' ? myStats : 0);
      }

      const { data: rels, error: relsError } = await supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .neq('status', 'cancelled')
        .neq('status', 'declined');

      if (relsError) throw { ...relsError, query: "friendships.select()" };

      if (!rels || rels.length === 0) {
        setFriendships([]);
        setLoading(false);
        return;
      }

      const otherUserIds = rels.map(r => r.requester_id === user.id ? r.addressee_id : r.requester_id);

      const { data: profiles, error: profileError } = await supabase.rpc('get_friend_profiles', {
        user_ids: otherUserIds
      });

      let resolvedProfiles = profiles;
      const needsStatsFallback = profileError || (profiles && profiles.length > 0 && typeof profiles[0].current_streak === 'undefined');

      if (needsStatsFallback) {
        if (profileError) {
          console.warn('[FRIENDS] get_friend_profiles RPC failed, falling back to direct query:', profileError.message);
        }

        const [fallbackProfilesRes, fallbackStatsRes] = await Promise.all([
          profileError ? supabase
            .from('profiles')
            .select('id, username, display_name, full_name, avatar_url, bio')
            .in('id', otherUserIds) : Promise.resolve({ data: profiles, error: null }),
          supabase
            .from('user_stats')
            .select('user_id, current_streak')
            .in('user_id', otherUserIds)
        ]);

        const statsMap = new Map((fallbackStatsRes.data || []).map(s => [s.user_id, s.current_streak]));
        resolvedProfiles = (fallbackProfilesRes.data || []).map((p: any) => {
          let streak = p.current_streak;
          if (typeof streak === 'undefined') {
            if (fallbackStatsRes.error) {
              streak = null;
            } else {
              streak = statsMap.has(p.id) ? statsMap.get(p.id) : 0;
            }
          }
          return {
            ...p,
            current_streak: streak
          };
        });
      } else if (profiles) {
        resolvedProfiles = profiles.map((p: any) => ({
          ...p,
          current_streak: p.current_streak ?? 0
        }));
      }

      const combined: Friendship[] = [];
      for (const r of rels) {
        const otherId = r.requester_id === user.id ? r.addressee_id : r.requester_id;
        const prof = resolvedProfiles?.find((p: any) => p.id === otherId);
        if (prof) {
          combined.push({ ...r, profiles: prof });
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
  }, [user, profile]);

  useEffect(() => {
    fetchFriendships();
    if (!user) return;

    const channel = supabase
      .channel(`friendships_changes_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${user.id}` }, () => fetchFriendships())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` }, () => fetchFriendships())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stats' }, () => fetchFriendships())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchFriendships]);

  const handleAddFriend = async (targetUserId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('friendships')
        .insert({ requester_id: user.id, addressee_id: targetUserId, status: 'pending' });

      if (error) {
        const { error: updateError } = await supabase
          .from('friendships')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`);
        if (updateError) throw error;
      }
      toast.success('Friend request sent');
      fetchFriendships();
    } catch (err: any) {
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
        const { error: delError } = await supabase
          .from('friendships')
          .delete()
          .eq('id', friendshipId);
        if (delError) throw delError;
      }
      toast.success('Friend request cancelled');
      fetchFriendships();
    } catch (err: any) {
      toast.error('Failed to cancel friend request');
    }
  };

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
    ...acceptedFriends.map(f => ({ ...f.profiles }))
  ].sort((a, b) => {
    const valA = a.current_streak ?? -1;
    const valB = b.current_streak ?? -1;
    if (valA !== valB) return valB - valA;
    return (a.display_name || a.username).localeCompare(b.display_name || b.username);
  });

  const getFriendshipStatus = (otherUserId: string) => {
    if (user?.id === otherUserId) return 'you';
    const rel = friendships.find(f => f.requester_id === otherUserId || f.addressee_id === otherUserId);
    if (!rel) return 'none';
    if (rel.status === 'accepted') return 'friends';
    if (rel.status === 'pending') return rel.requester_id === user?.id ? 'sent' : 'received';
    return 'none';
  };

  return {
    user,
    profile,
    friendships,
    incomingRequests,
    outgoingRequests,
    acceptedFriends,
    leaderboardUsers,
    myStreak,
    loading,
    error,
    fetchFriendships,
    handleAddFriend,
    handleAccept,
    handleDecline,
    handleCancel,
    getFriendshipStatus
  };
}





