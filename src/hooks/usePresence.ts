import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function usePresence(userId?: string) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const channelName = 'eustace_global_presence';
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    const updatePresenceState = () => {
      const state = channel.presenceState();
      const onlineSet = new Set<string>();
      Object.keys(state).forEach((key) => {
        onlineSet.add(key);
      });
      setOnlineUserIds(onlineSet);
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        updatePresenceState();
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineUserIds((prev) => new Set(prev).add(key));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              user_id: userId,
              online_at: new Date().toISOString(),
            });
          } catch {
            // ignore presence tracking errors
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const isUserOnline = useCallback(
    (targetUserId: string) => {
      if (!targetUserId) return false;
      return onlineUserIds.has(targetUserId);
    },
    [onlineUserIds]
  );

  return {
    onlineUserIds,
    isUserOnline,
  };
}
