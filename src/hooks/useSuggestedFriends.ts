import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Friendship, Profile } from './useFriends';

export interface SuggestedProfile extends Profile {
  mutualCount: number;
}

export function useSuggestedFriends(
  currentUserId?: string,
  currentUsername?: string,
  friendships: Friendship[] = []
) {
  const [suggested, setSuggested] = useState<SuggestedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSuggested = useCallback(async () => {
    if (!currentUserId) {
      setSuggested([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Authoritative exclusion set: current user ID + all active/pending friendship connections
      const excludedIds = new Set<string>([currentUserId]);

      // Seed from prop friendships
      friendships.forEach((f) => {
        if (f.status === 'accepted' || f.status === 'pending') {
          if (f.requester_id) excludedIds.add(f.requester_id);
          if (f.addressee_id) excludedIds.add(f.addressee_id);
        }
      });

      // Also query public.friendships directly for current user to catch any records
      // that may not have resolved profile data in the friendships hook
      try {
        const { data: directRels } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
          .in('status', ['pending', 'accepted']);

        if (directRels) {
          directRels.forEach((r) => {
            if (r.requester_id) excludedIds.add(r.requester_id);
            if (r.addressee_id) excludedIds.add(r.addressee_id);
          });
        }
      } catch (relErr) {
        console.warn('[useSuggestedFriends] Direct rel query fallback warning:', relErr);
      }

      // 2. Try the secure get_suggested_connections RPC first
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_suggested_connections', {
          p_limit: 20,
        });

        if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
          const sanitizedRpc = rpcData
            .filter((p: any) => {
              if (!p || !p.id || !p.username) return false;
              if (p.id === currentUserId) return false;
              if (excludedIds.has(p.id)) return false;
              if (currentUsername && p.username.toLowerCase() === currentUsername.toLowerCase()) return false;
              return true;
            })
            .map((p: any) => ({
              id: p.id,
              username: p.username,
              display_name: p.display_name || p.full_name || p.username,
              full_name: p.full_name || '',
              avatar_url: p.avatar_url || '',
              bio: p.bio || '',
              cover_image_url: p.cover_image_url || '',
              mutualCount: Number(p.mutual_count) || 0,
            }));

          setSuggested(sanitizedRpc);
          setLoading(false);
          return;
        }
      } catch {
        // RPC not yet deployed on remote backend; fall through to direct public profiles query
      }

      // 3. Fallback: Query public profiles directly with strict multi-factor exclusions
      const { data: rawProfiles, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, username, display_name, full_name, avatar_url, bio, cover_image_url')
        .neq('id', currentUserId)
        .eq('visibility', 'public')
        .limit(30);

      if (fetchErr) throw fetchErr;

      // Filter with rigorous identity verification
      const eligibleProfiles = (rawProfiles || []).filter((p) => {
        if (!p || !p.id || !p.username) return false;
        if (p.id === currentUserId) return false;
        if (excludedIds.has(p.id)) return false;
        if (currentUsername && p.username.toLowerCase() === currentUsername.toLowerCase()) return false;
        return true;
      });

      const finalSuggested: SuggestedProfile[] = eligibleProfiles.map((p) => ({
        ...p,
        mutualCount: 0,
      }));

      // Sort alphabetically by username for deterministic ordering
      finalSuggested.sort((a, b) => a.username.localeCompare(b.username));

      setSuggested(finalSuggested);
    } catch (err: any) {
      console.error('[useSuggestedFriends] Failed to fetch suggestions:', err);
      setError(err);
      setSuggested([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, currentUsername, friendships]);

  useEffect(() => {
    fetchSuggested();
  }, [fetchSuggested]);

  const excludeUser = useCallback((targetUserId: string) => {
    setSuggested((prev) => prev.filter((p) => p.id !== targetUserId));
  }, []);

  return {
    suggested,
    loading,
    error,
    refreshSuggested: fetchSuggested,
    excludeUser,
  };
}

export default useSuggestedFriends;
