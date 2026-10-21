/* eslint-disable react-hooks/exhaustive-deps, react/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { uploadMessageImage, cleanupOrphanedMessageImage, getSignedMessageImageUrl } from '../lib/chatStorage';
import { notificationService } from '../services/notificationService';
import type { Profile } from './useFriends';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: 'text' | 'image';
  text_content: string | null;
  image_path: string | null;
  image_metadata?: {
    width?: number;
    height?: number;
    size?: number;
    mime?: string;
  } | null;
  created_at: string;
  status?: 'sending' | 'sent' | 'error';
  errorMessage?: string;
  localPreviewUrl?: string;
  signedImageUrl?: string;
}

export const MESSAGES_PAGE_SIZE = 30;

export function useChat(conversationId: string | null, friendProfile?: Profile | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [otherUserLastReadAt, setOtherUserLastReadAt] = useState<string | null>(null);
  const [otherUserLastDeliveredAt, setOtherUserLastDeliveredAt] = useState<string | null>(null);
  const [isOtherUserOnline, setIsOtherUserOnline] = useState<boolean>(false);
  const [isFriendshipActive, setIsFriendshipActive] = useState<boolean>(true);

  // Check friendship status safely
  const checkFriendship = useCallback(async () => {
    if (!user || !friendProfile?.id) return;
    try {
      const { data } = await supabase
        .from('friendships')
        .select('status')
        .eq('status', 'accepted')
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${friendProfile.id}),and(requester_id.eq.${friendProfile.id},addressee_id.eq.${user.id})`
        )
        .maybeSingle();

      setIsFriendshipActive(!!data);
    } catch {
      setIsFriendshipActive(true);
    }
  }, [user, friendProfile?.id]);

  useEffect(() => {
    checkFriendship();
  }, [checkFriendship]);

  // Pre-fetch signed URLs for images in message list
  const resolveSignedUrls = async (items: ChatMessage[]): Promise<ChatMessage[]> => {
    return Promise.all(
      items.map(async (msg) => {
        if (msg.message_type === 'image' && msg.image_path && !msg.signedImageUrl) {
          try {
            // If image_path is already a full url (legacy fallback), use directly
            if (msg.image_path.startsWith('http://') || msg.image_path.startsWith('https://')) {
              return { ...msg, signedImageUrl: msg.image_path };
            }
            const url = await getSignedMessageImageUrl(msg.image_path);
            return { ...msg, signedImageUrl: url };
          } catch {
            return msg;
          }
        }
        return msg;
      })
    );
  };

  // 1. Initial Fetch (Latest messages up to MESSAGES_PAGE_SIZE)
  const fetchInitialMessages = useCallback(async () => {
    if (!user || !conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use select('*') to gracefully support both image_path/message_type and media_url/media_type schemas
      const { data, error: fetchErr } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      if (fetchErr) throw fetchErr;

      const rawItems: ChatMessage[] = (data || []).map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        message_type: m.message_type || (m.media_url ? 'image' : 'text'),
        text_content: m.text_content,
        image_path: m.image_path || m.media_url || null,
        image_metadata: m.image_metadata || null,
        created_at: m.created_at,
        status: 'sent' as const
      }));

      setHasMore(rawItems.length === MESSAGES_PAGE_SIZE);

      const chronological = rawItems.reverse();
      const withSignedUrls = await resolveSignedUrls(chronological);
      setMessages(withSignedUrls);

      // Fetch member read & delivery states safely
      try {
        const { data: members } = await supabase
          .from('conversation_members')
          .select('user_id, last_read_at, last_delivered_at')
          .eq('conversation_id', conversationId);

        members?.forEach((m: any) => {
          if (m.user_id !== user.id) {
            setOtherUserLastReadAt(m.last_read_at);
            if (m.last_delivered_at) {
              setOtherUserLastDeliveredAt(m.last_delivered_at);
            }
          }
        });
      } catch {
        // Safe fallback if conversation_members table or last_delivered_at not yet migrated
      }

      // Acknowledge delivery & mark as read immediately on open
      try {
        await supabase.rpc('acknowledge_message_delivery', { p_conversation_id: conversationId });
      } catch {
        // ignore fallback
      }

      try {
        await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
      } catch {
        try {
          await supabase
            .from('conversation_members')
            .upsert({
              conversation_id: conversationId,
              user_id: user.id,
              last_read_at: new Date().toISOString()
            });
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user, conversationId]);

  useEffect(() => {
    fetchInitialMessages();
  }, [fetchInitialMessages]);

  // 2. Pagination: Load Older Messages
  const loadOlderMessages = useCallback(async () => {
    if (!user || !conversationId || loadingMore || !hasMore || messages.length === 0) return;

    setLoadingMore(true);
    const oldestTimestamp = messages[0].created_at;

    try {
      const { data, error: fetchErr } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .lt('created_at', oldestTimestamp)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      if (fetchErr) throw fetchErr;

      const rawOlder: ChatMessage[] = (data || []).map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        message_type: m.message_type || (m.media_url ? 'image' : 'text'),
        text_content: m.text_content,
        image_path: m.image_path || m.media_url || null,
        image_metadata: m.image_metadata || null,
        created_at: m.created_at,
        status: 'sent' as const
      }));

      setHasMore(rawOlder.length === MESSAGES_PAGE_SIZE);

      const olderChronological = rawOlder.reverse();
      const withSignedUrls = await resolveSignedUrls(olderChronological);

      setMessages((prev) => [...withSignedUrls, ...prev]);
    } catch (err: any) {
      console.error('Error loading older messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [user, conversationId, loadingMore, hasMore, messages]);

  // 3. Realtime Subscription & Presence
  useEffect(() => {
    if (!user || !conversationId) return;

    const channelName = `chat_room_${conversationId}`;
    setRealtimeStatus('connecting');

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id
        }
      }
    });

    const checkFriendOnline = () => {
      if (!friendProfile?.id) return;
      const state = channel.presenceState();
      const friendPresences = state[friendProfile.id] as any[] | undefined;
      setIsOtherUserOnline(Boolean(friendPresences && friendPresences.length > 0));
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        checkFriendOnline();
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (friendProfile?.id && key === friendProfile.id) {
          setIsOtherUserOnline(true);
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (friendProfile?.id && key === friendProfile.id) {
          checkFriendOnline();
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async (payload) => {
          const newRow = payload.new as any;
          const imageTarget = newRow.image_path || newRow.media_url;

          let signedUrl: string | undefined;
          if ((newRow.message_type === 'image' || newRow.media_type === 'image') && imageTarget) {
            try {
              if (imageTarget.startsWith('http://') || imageTarget.startsWith('https://')) {
                signedUrl = imageTarget;
              } else {
                signedUrl = await getSignedMessageImageUrl(imageTarget);
              }
            } catch {
              // ignore
            }
          }

          const incomingMsg: ChatMessage = {
            id: newRow.id,
            conversation_id: newRow.conversation_id,
            sender_id: newRow.sender_id,
            message_type: newRow.message_type || (newRow.media_url ? 'image' : 'text'),
            text_content: newRow.text_content,
            image_path: imageTarget || null,
            image_metadata: newRow.image_metadata || null,
            created_at: newRow.created_at,
            status: 'sent',
            signedImageUrl: signedUrl
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === incomingMsg.id)) {
              return prev;
            }

            const matchIndex = prev.findIndex(
              (m) =>
                m.status === 'sending' &&
                m.sender_id === incomingMsg.sender_id &&
                ((m.message_type === 'text' && m.text_content === incomingMsg.text_content) ||
                  (m.message_type === 'image' && m.image_path === incomingMsg.image_path))
            );

            if (matchIndex !== -1) {
              const updated = [...prev];
              updated[matchIndex] = incomingMsg;
              return updated;
            }

            return [...prev, incomingMsg];
          });

          if (incomingMsg.sender_id !== user.id) {
            try {
              await supabase.rpc('acknowledge_message_delivery', { p_conversation_id: conversationId });
              await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
            } catch {
              // ignore
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const updatedMember = payload.new as any;
          if (updatedMember.user_id !== user.id) {
            if (updatedMember.last_read_at) {
              setOtherUserLastReadAt(updatedMember.last_read_at);
            }
            if (updatedMember.last_delivered_at) {
              setOtherUserLastDeliveredAt(updatedMember.last_delivered_at);
            }
          }
        }
      );

    const trackPresence = async () => {
      if (document.visibilityState === 'visible') {
        try {
          await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString()
          });
        } catch {
          // ignore
        }
      } else {
        try {
          await channel.untrack();
        } catch {
          // ignore
        }
      }
    };

    const handleVisibilityChange = () => {
      trackPresence();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setRealtimeStatus('connected');
        trackPresence();
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setRealtimeStatus('disconnected');
        setIsOtherUserOnline(false);
      }
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      setIsOtherUserOnline(false);
    };
  }, [user, conversationId, friendProfile?.id]);

  // 4. Send Text Message (Resilient payload)
  const sendTextMessage = async (text: string) => {
    if (!user || !conversationId) return;

    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Message cannot be empty.');
    }
    if (trimmed.length > 4000) {
      throw new Error('Message exceeds the maximum limit of 4,000 characters.');
    }
    if (!isFriendshipActive) {
      throw new Error('Cannot send messages: you and this user are not currently accepted friends.');
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: 'text',
      text_content: trimmed,
      image_path: null,
      created_at: nowIso,
      status: 'sending'
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // Try primary insert
      let insertedRow: any = null;
      const { data, error: err1 } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          message_type: 'text',
          text_content: trimmed
        })
        .select()
        .single();

      if (err1) {
        // Fallback without message_type column if table is older schema
        const { data: fbData, error: err2 } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            text_content: trimmed
          })
          .select()
          .single();

        if (err2) throw err2;
        insertedRow = fbData;
      } else {
        insertedRow = data;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, id: insertedRow.id, created_at: insertedRow.created_at, status: 'sent' } : m
        )
      );

      if (friendProfile?.id) {
        const senderName = user.user_metadata?.display_name || user.user_metadata?.full_name || 'A friend';
        notificationService.sendNotificationTrigger({
          recipientUserId: friendProfile.id,
          type: 'message',
          title: '💬 New message',
          body: `${senderName} sent you a message.`,
          url: `/chat/${conversationId}`,
          data: { conversation_id: conversationId }
        }).catch(() => {});
      }
    } catch (err: any) {
      console.error('Failed to send text message:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, status: 'error', errorMessage: err.message || 'Failed to send message.' }
            : m
        )
      );
      throw err;
    }
  };

  // 5. Send Image Message (Resilient payload)
  const sendImageMessage = async (
    file: File,
    localPreviewUrl: string,
    metadata?: { width: number; height: number; sizeBytes: number }
  ) => {
    if (!user || !conversationId) return;

    if (file.size > 500_000) {
      throw new Error('Image exceeds the hard limit of 500,000 bytes (500 KB).');
    }
    if (!isFriendshipActive) {
      throw new Error('Cannot send messages: you and this user are not currently accepted friends.');
    }

    const tempId = `temp_img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: 'image',
      text_content: null,
      image_path: null,
      image_metadata: {
        width: metadata?.width,
        height: metadata?.height,
        size: metadata?.sizeBytes || file.size,
        mime: file.type
      },
      created_at: nowIso,
      status: 'sending',
      localPreviewUrl
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    let uploadedPath = '';

    try {
      const uploadResult = await uploadMessageImage(conversationId, file, {
        width: metadata?.width,
        height: metadata?.height
      });
      uploadedPath = uploadResult.imagePath;

      // Resilient insert supporting both image_path and media_url columns
      let insertedRow: any = null;
      const { data, error: err1 } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          message_type: 'image',
          image_path: uploadedPath,
          image_metadata: uploadResult.metadata
        })
        .select()
        .single();

      if (err1) {
        // Fallback for older schema with media_url and media_type
        const { data: fbData, error: err2 } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            media_type: 'image',
            media_url: uploadedPath
          })
          .select()
          .single();

        if (err2) {
          await cleanupOrphanedMessageImage(uploadedPath);
          throw err2;
        }
        insertedRow = fbData;
      } else {
        insertedRow = data;
      }

      let signedUrl = localPreviewUrl;
      try {
        signedUrl = await getSignedMessageImageUrl(uploadedPath);
      } catch {
        // ignore
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                id: insertedRow.id,
                image_path: uploadedPath,
                created_at: insertedRow.created_at,
                status: 'sent',
                signedImageUrl: signedUrl
              }
            : m
        )
      );
    } catch (err: any) {
      console.error('Failed to send image message:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, status: 'error', errorMessage: err.message || 'Failed to upload image.' }
            : m
        )
      );
      throw err;
    }
  };

  const retryFailedMessage = async (failedMsg: ChatMessage) => {
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    if (failedMsg.message_type === 'text' && failedMsg.text_content) {
      await sendTextMessage(failedMsg.text_content);
    }
  };

  return {
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
    retryFailedMessage,
    refreshMessages: fetchInitialMessages
  };
}
