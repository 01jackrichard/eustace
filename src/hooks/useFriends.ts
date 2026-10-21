import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { notificationService } from '../services/notificationService';
import toast from 'react-hot-toast';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  full_name: string;
  avatar_url: string;
  bio?: string | null;
  cover_image_url?: string;
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

export function formatUsernameAsDisplayName(username?: string | null): string {
  if (!username || typeof username !== 'string') return '';
  const cleaned = username.trim().replace(/^@+/, '');
  if (!cleaned || cleaned.toLowerCase() === 'user') return '';

  return cleaned
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .map((segment) =>
      /[a-zA-Z]/.test(segment)
        ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
        : segment
    )
    .join(' ');
}

export function resolveProfileDisplayName(
  profile?: {
    display_name?: string | null;
    full_name?: string | null;
    username?: string | null;
  } | null,
  fallback = 'Friend'
): string {
  const rawDisplay = typeof profile?.display_name === 'string' ? profile.display_name.trim() : '';
  if (rawDisplay && rawDisplay.toLowerCase() !== 'friend') {
    return rawDisplay;
  }

  const rawFull = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
  if (rawFull && rawFull.toLowerCase() !== 'friend') {
    return rawFull;
  }

  const fromUsername = formatUsernameAsDisplayName(profile?.username);
  if (fromUsername) {
    return fromUsername;
  }

  return fallback;
}

export function getProfileInitials(
  profile?: {
    display_name?: string | null;
    full_name?: string | null;
    username?: string | null;
  } | null
): string {
  const resolved = resolveProfileDisplayName(profile, '');
  const source = resolved || (profile?.username || '').replace(/^@+/, '').trim() || 'FR';
  return source.substring(0, 2).toUpperCase();
}

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

      // Fetch authoritative profiles directly from public.profiles so authentic bio and cover_image_url
      // are never stripped, masked, or missing, alongside streak data from RPC or user_stats
      const [directProfilesRes, rpcProfilesRes, statsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, display_name, full_name, avatar_url, bio, cover_image_url')
          .in('id', otherUserIds),
        supabase.rpc('get_friend_profiles', { user_ids: otherUserIds }).then(
          (res) => res,
          () => ({ data: null, error: true })
        ),
        supabase
          .from('user_stats')
          .select('user_id, current_streak')
          .in('user_id', otherUserIds)
      ]);

      const directProfiles: any[] = directProfilesRes.data || [];
      const rpcProfiles: any[] = (rpcProfilesRes && !rpcProfilesRes.error && rpcProfilesRes.data) || [];
      const statsMap = new Map<string, number | null>((statsRes.data || []).map((s: any) => [s.user_id, s.current_streak]));
      const rpcStreakMap = new Map<string, number | null>(rpcProfiles.map((p: any) => [p.id, p.current_streak]));
      const directMap = new Map<string, any>(directProfiles.map((p: any) => [p.id, p]));
      const rpcMap = new Map<string, any>(rpcProfiles.map((p: any) => [p.id, p]));

      const resolvedProfiles: Profile[] = otherUserIds
        .map((id): Profile | null => {
          const direct = directMap.get(id);
          const rpc = rpcMap.get(id);
          if (!direct && !rpc) return null;

          const base = direct || rpc;
          let streak: number | null = null;
          if (rpcStreakMap.has(id) && typeof rpcStreakMap.get(id) === 'number') {
            streak = rpcStreakMap.get(id)!;
          } else if (statsMap.has(id)) {
            streak = statsMap.get(id) ?? null;
          } else if (typeof base?.current_streak === 'number') {
            streak = base.current_streak;
          } else {
            streak = 0;
          }

          const rawUsername = (direct?.username || rpc?.username || 'user').trim();
          const rawDisplayName = (direct?.display_name || rpc?.display_name || '').trim();
          const rawFullName = (direct?.full_name || rpc?.full_name || '').trim();

          return {
            id,
            username: rawUsername,
            display_name: resolveProfileDisplayName({
              display_name: rawDisplayName,
              full_name: rawFullName,
              username: rawUsername,
            }),
            full_name: rawFullName,
            avatar_url: direct?.avatar_url || rpc?.avatar_url || '',
            cover_image_url: direct?.cover_image_url || rpc?.cover_image_url || undefined,
            bio: typeof direct?.bio !== 'undefined' ? direct.bio : (rpc?.bio ?? null),
            current_streak: streak,
          };
        })
        .filter((p): p is Profile => p !== null);

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
  }, [user]);

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
      if (user) {
        const senderName = user.user_metadata?.display_name || user.user_metadata?.full_name || 'Someone';
        notificationService.sendNotificationTrigger({
          recipientUserId: targetUserId,
          type: 'friend_request',
          title: '👥 Friend request',
          body: `${senderName} sent you a friend request.`,
          url: '/friends'
        }).catch(() => {});
      }
      fetchFriendships();
    } catch {
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
      const acceptedFriendship = friendships.find((f) => f.id === friendshipId);
      if (user && acceptedFriendship) {
        const recipientId = acceptedFriendship.requester_id === user.id ? acceptedFriendship.addressee_id : acceptedFriendship.requester_id;
        const senderName = user.user_metadata?.display_name || user.user_metadata?.full_name || 'A friend';
        notificationService.sendNotificationTrigger({
          recipientUserId: recipientId,
          type: 'friend_accepted',
          title: '👥 Friendship',
          body: `${senderName} accepted your friend request.`,
          url: '/friends'
        }).catch(() => {});
      }
      fetchFriendships();
    } catch {
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
    } catch {
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
    } catch {
      toast.error('Failed to cancel friend request');
    }
  };

  const handleRemoveFriend = async (friendshipId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);

      if (error) throw error;
      toast.success('Connection removed');
      fetchFriendships();
    } catch (err: any) {
      console.error('Failed to remove connection:', err);
      toast.error('Failed to remove connection');
    }
  };

  const incomingRequests = friendships.filter(f => f.status === 'pending' && f.addressee_id === user?.id);
  const outgoingRequests = friendships.filter(f => f.status === 'pending' && f.requester_id === user?.id);
  const acceptedFriends = friendships.filter(f => f.status === 'accepted');

  const leaderboardUsers = [
    ...(user && profile ? [{
      id: user.id,
      username: profile.username || '',
      display_name: resolveProfileDisplayName(profile, 'You'),
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
    handleRemoveFriend,
    getFriendshipStatus
  };
}






