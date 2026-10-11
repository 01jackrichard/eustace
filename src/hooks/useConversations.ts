/* eslint-disable react-hooks/exhaustive-deps, react/set-state-in-effect */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Profile } from './useFriends';

export interface ConversationItem {
  id: string;
  friend: Profile;
  lastMessage: {
    textContent: string | null;
    messageType: 'text' | 'image';
    createdAt: string;
    senderId: string;
  } | null;
  lastMessageAt: string;
  unreadCount: number;
  myLastReadAt: string;
  otherUserLastReadAt: string;
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch conversations with fallback if last_message_at doesn't exist yet
      let convRows: any[] = [];
      let { data: primaryData, error: primaryErr } = await supabase
        .from('conversations')
        .select(`
          id,
          user1_id,
          user2_id,
          last_message_at,
          created_at,
          updated_at
        `)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('last_message_at', { ascending: false });

      if (primaryErr) {
        // Fallback query if last_message_at column hasn't been migrated yet
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('conversations')
          .select(`
            id,
            user1_id,
            user2_id,
            created_at,
            updated_at
          `)
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .order('updated_at', { ascending: false });

        if (fallbackErr) throw fallbackErr;
        convRows = (fallbackData || []).map((r) => ({
          ...r,
          last_message_at: r.updated_at || r.created_at
        }));
      } else {
        convRows = primaryData || [];
      }

      if (!convRows || convRows.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const convIds = convRows.map((c) => c.id);
      const otherUserIds = Array.from(
        new Set(convRows.map((c) => (c.user1_id === user.id ? c.user2_id : c.user1_id)))
      );

      // 2. Fetch profiles for other users using get_friend_profiles RPC
      const { data: profilesData } = await supabase.rpc('get_friend_profiles', {
        user_ids: otherUserIds
      });

      const profileMap = new Map<string, Profile>();
      if (profilesData) {
        profilesData.forEach((p: Profile) => profileMap.set(p.id, p));
      }

      // Fallback for any profile not returned by RPC
      const missingIds = otherUserIds.filter((id) => !profileMap.has(id));
      if (missingIds.length > 0) {
        const { data: fallbackProfiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, full_name, avatar_url, bio')
          .in('id', missingIds);

        fallbackProfiles?.forEach((p) => {
          profileMap.set(p.id, {
            id: p.id,
            username: p.username,
            display_name: p.display_name,
            full_name: p.full_name,
            avatar_url: p.avatar_url,
            bio: p.bio || '',
            current_streak: 0
          });
        });
      }

      // 3. Fetch members to get read timestamps (safe fallback if table missing)
      const myReadMap = new Map<string, string>();
      const otherReadMap = new Map<string, string>();

      try {
        const { data: membersData } = await supabase
          .from('conversation_members')
          .select('conversation_id, user_id, last_read_at')
          .in('conversation_id', convIds);

        membersData?.forEach((m) => {
          if (m.user_id === user.id) {
            myReadMap.set(m.conversation_id, m.last_read_at);
          } else {
            otherReadMap.set(m.conversation_id, m.last_read_at);
          }
        });
      } catch {
        // Safe fallback if conversation_members table doesn't exist yet
      }

      // 4. Fetch latest message for each conversation
      const latestMessageMap = new Map<string, any>();
      const unreadCountMap = new Map<string, number>();

      convIds.forEach((cId) => unreadCountMap.set(cId, 0));

      try {
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_id, message_type, text_content, image_path, created_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false });

        recentMessages?.forEach((msg) => {
          if (!latestMessageMap.has(msg.conversation_id)) {
            latestMessageMap.set(msg.conversation_id, msg);
          }

          const myLastRead = myReadMap.get(msg.conversation_id) || '1970-01-01T00:00:00Z';
          if (msg.sender_id !== user.id && new Date(msg.created_at) > new Date(myLastRead)) {
            unreadCountMap.set(msg.conversation_id, (unreadCountMap.get(msg.conversation_id) || 0) + 1);
          }
        });
      } catch {
        // Safe fallback if messages query fails
      }

      // 5. Construct items
      const items: ConversationItem[] = [];

      for (const row of convRows) {
        const friendId = row.user1_id === user.id ? row.user2_id : row.user1_id;
        const friendProfile = profileMap.get(friendId) || {
          id: friendId,
          username: 'user',
          display_name: 'Friend',
          full_name: 'Friend',
          avatar_url: '',
          bio: '',
          current_streak: 0
        };

        const latest = latestMessageMap.get(row.id);

        items.push({
          id: row.id,
          friend: friendProfile,
          lastMessage: latest
            ? {
                textContent: latest.text_content,
                messageType: latest.message_type,
                createdAt: latest.created_at,
                senderId: latest.sender_id
              }
            : null,
          lastMessageAt: row.last_message_at || row.updated_at || row.created_at,
          unreadCount: unreadCountMap.get(row.id) || 0,
          myLastReadAt: myReadMap.get(row.id) || row.created_at,
          otherUserLastReadAt: otherReadMap.get(row.id) || row.created_at
        });
      }

      setConversations(items);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription for conversation updates & messages
  const fetchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('conversations_overview')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => {
          if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
          fetchTimeoutRef.current = setTimeout(() => {
            fetchConversations();
          }, 300);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_members'
        },
        () => {
          if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
          fetchTimeoutRef.current = setTimeout(() => {
            fetchConversations();
          }, 300);
        }
      )
      .subscribe();

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, fetchConversations]);

  const inFlightOpenRequestsRef = useRef<Map<string, Promise<string>>>(new Map());

  // Open or create conversation with an accepted friend (Atomic & Race-safe)
  const openConversationWithFriend = useCallback(
    async (friendId: string): Promise<string> => {
      if (!user) throw new Error('Not authenticated');
      if (!friendId || friendId === user.id) throw new Error('Invalid friend ID');

      // 1. Deduplicate concurrent in-flight requests for the exact same friend
      const existingInFlight = inFlightOpenRequestsRef.current.get(friendId);
      if (existingInFlight) {
        return existingInFlight;
      }

      const executionPromise = (async () => {
        try {
          // Check if conversation already exists in current local state
          const cachedConv = conversations.find(
            (c) => c.friend.id === friendId || (c as any).user1_id === friendId || (c as any).user2_id === friendId
          );
          if (cachedConv) {
            return cachedConv.id;
          }

          // 2. Primary path: Secure atomic PostgreSQL RPC
          try {
            const { data, error: rpcErr } = await supabase.rpc('get_or_create_conversation', {
              friend_user_id: friendId
            });

            if (!rpcErr && data && data.length > 0) {
              const convId = data[0].conversation_id;
              fetchConversations();
              return convId;
            }
          } catch {
            // RPC not available yet, fall back to direct query
          }

          // 3. Direct query fallback with canonical user order
          const u1 = user.id < friendId ? user.id : friendId;
          const u2 = user.id < friendId ? friendId : user.id;

          const { data: existing } = await supabase
            .from('conversations')
            .select('id')
            .eq('user1_id', u1)
            .eq('user2_id', u2)
            .maybeSingle();

          if (existing?.id) {
            fetchConversations();
            return existing.id;
          }

          // 4. Insert new conversation with 23505 duplicate-key race recovery
          const { data: newConv, error: insertErr } = await supabase
            .from('conversations')
            .insert({ user1_id: u1, user2_id: u2 })
            .select('id')
            .single();

          if (insertErr) {
            // If another client or concurrent call inserted at the same time, fetch it
            if (
              insertErr.code === '23505' ||
              insertErr.message?.includes('conversations_unique_pair') ||
              insertErr.message?.includes('duplicate key')
            ) {
              const { data: raceRow } = await supabase
                .from('conversations')
                .select('id')
                .eq('user1_id', u1)
                .eq('user2_id', u2)
                .maybeSingle();

              if (raceRow?.id) {
                fetchConversations();
                return raceRow.id;
              }
            }
            throw insertErr;
          }

          // Ensure conversation_members exist
          try {
            await supabase.from('conversation_members').upsert([
              { conversation_id: newConv.id, user_id: u1, last_read_at: new Date().toISOString(), last_delivered_at: new Date().toISOString() },
              { conversation_id: newConv.id, user_id: u2, last_read_at: new Date().toISOString(), last_delivered_at: new Date().toISOString() }
            ]);
          } catch {
            // safe fallback
          }

          fetchConversations();
          return newConv.id;
        } finally {
          inFlightOpenRequestsRef.current.delete(friendId);
        }
      })();

      inFlightOpenRequestsRef.current.set(friendId, executionPromise);
      return executionPromise;
    },
    [user, conversations, fetchConversations]
  );

  // Mark conversation read
  const markAsRead = useCallback(
    async (conversationId: string) => {
      if (!user) return;

      const now = new Date().toISOString();

      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0, myLastReadAt: now } : c))
      );

      try {
        const { error: rpcErr } = await supabase.rpc('mark_conversation_read', {
          p_conversation_id: conversationId
        });

        if (rpcErr) {
          await supabase
            .from('conversation_members')
            .upsert({
              conversation_id: conversationId,
              user_id: user.id,
              last_read_at: now
            });
        }
      } catch {
        // ignore
      }
    },
    [user]
  );

  const totalUnreadCount = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

  return {
    conversations,
    loading,
    error,
    totalUnreadCount,
    fetchConversations,
    openConversationWithFriend,
    markAsRead
  };
}
