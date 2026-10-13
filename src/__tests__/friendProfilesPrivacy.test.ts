// @vitest-environment node
/**
 * Scope Notice:
 * Static SQL contract tests and in-memory specification models verify the local
 * migration file (`supabase/migrations/20261013120000_fix_friend_profiles_bio_privacy.sql`)
 * and its expected authorization semantics, but SQL contract tests alone do NOT
 * prove live production PostgreSQL catalog state or runtime database behavior.
 * Production behavior can only be confirmed after authorized migration execution
 * and post-migration catalog/RPC verification against the live database.
 */
import { describe, it, expect } from 'vitest';
import migrationSql from '../../supabase/migrations/20261013120000_fix_friend_profiles_bio_privacy.sql?raw';

type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
type CallerRole = 'anon' | 'authenticated' | 'service_role' | 'public_unprivileged_role';

interface MockProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  streak: number;
}

interface MockFriendshipRow {
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
}

interface FriendProfileResult {
  id: string;
  username: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  current_streak: number;
}

/**
 * In-memory specification model of `public.get_friend_profiles(user_ids uuid[])`
 * as defined in `20261013120000_fix_friend_profiles_bio_privacy.sql`.
 */
function evaluateGetFriendProfilesSpec(params: {
  callerRole: CallerRole;
  callerId: string | null;
  userIds: string[] | null;
  profiles: MockProfileRow[];
  friendships: MockFriendshipRow[];
}): FriendProfileResult[] {
  if (params.callerRole !== 'authenticated' && params.callerRole !== 'service_role') {
    throw new Error('42501: permission denied for function get_friend_profiles');
  }

  if (!params.callerId || !params.userIds || params.userIds.length === 0) {
    return [];
  }

  const targetSet = new Set(params.userIds);

  const hasRelationship = (targetId: string, allowedStatuses: FriendshipStatus[]): boolean => {
    return params.friendships.some(
      (f) =>
        allowedStatuses.includes(f.status) &&
        ((f.requester_id === params.callerId && f.addressee_id === targetId) ||
          (f.addressee_id === params.callerId && f.requester_id === targetId))
    );
  };

  return params.profiles
    .filter(
      (p) =>
        targetSet.has(p.id) &&
        (p.id === params.callerId || hasRelationship(p.id, ['accepted', 'pending']))
    )
    .map((p) => {
      const isOwnerOrAcceptedFriend =
        p.id === params.callerId || hasRelationship(p.id, ['accepted']);

      return {
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        bio: isOwnerOrAcceptedFriend ? p.bio : '',
        current_streak: isOwnerOrAcceptedFriend ? (p.streak ?? 0) : 0,
      };
    });
}

describe('Phase 1B.1 — Static SQL Contract Tests for get_friend_profiles Migration (Not Live DB Proof)', () => {
  const sql = migrationSql.replace(/\r\n/g, '\n');

  it('preserves the exact original function signature and RETURNS TABLE columns', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_friend_profiles(user_ids uuid[])');
    expect(sql).toMatch(
      /RETURNS\s+TABLE\s*\(\s*id\s+uuid,\s*username\s+text,\s*display_name\s+text,\s*full_name\s+text,\s*avatar_url\s+text,\s*bio\s+text,\s*current_streak\s+int\s*\)/i
    );
  });

  it('preserves SECURITY DEFINER, STABLE, and empty search_path hardening', () => {
    expect(sql).toContain('LANGUAGE plpgsql');
    expect(sql).toContain('STABLE');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
  });

  it('uses schema-qualified references for tables and functions', () => {
    expect(sql).toContain('FROM public.profiles p');
    expect(sql).toContain('FROM public.friendships f');
    expect(sql).toContain('public.calculate_user_streak(p.id)');
    expect(sql).toContain('auth.uid()');
  });

  it('masks bio to empty string unless caller is profile owner or an accepted friend', () => {
    // Must not select raw unmasked `p.bio,` directly in the projection list
    expect(sql).not.toMatch(/p\.avatar_url\s*,\s*p\.bio\s*,/i);

    // Must gate p.bio behind owner check or accepted friendship check with '' fallback
    expect(sql).toMatch(
      /CASE\s+WHEN\s+p\.id\s*=\s*v_caller_id\s+OR\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.friendships\s+f\s+WHERE\s+f\.status\s*=\s*'accepted'[\s\S]*?THEN\s+p\.bio\s+ELSE\s+''\s+END\s+AS\s+bio/i
    );
  });

  it('preserves pending relationship lookup for non-sensitive request card fields while gating current_streak', () => {
    expect(sql).toContain("WHERE (f.status = 'accepted' OR f.status = 'pending')");
    expect(sql).toMatch(
      /THEN\s+COALESCE\(public\.calculate_user_streak\(p\.id\),\s*0\)\s+ELSE\s+0\s+END\s+AS\s+current_streak/i
    );
  });

  it('explicitly revokes execute privileges from PUBLIC and anon and grants only to authenticated and service_role', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_friend_profiles(uuid[]) FROM PUBLIC;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_friend_profiles(uuid[]) FROM anon;');
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_friend_profiles(uuid[]) TO authenticated, service_role;'
    );
    expect(sql).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_friend_profiles[\s\S]*?\banon\b/i);
  });

  it('does not modify unrelated functions or tables', () => {
    const functionCreations = sql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/gi) || [];
    expect(functionCreations).toHaveLength(1);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });
});

describe('Phase 1B.1 — In-Memory Specification Verification for get_friend_profiles Authorization', () => {
  const OWNER_ID = '11111111-1111-4111-8111-111111111111';
  const ACCEPTED_FRIEND_ID = '22222222-2222-4222-8222-222222222222';
  const PENDING_REQUESTER_ID = '33333333-3333-4333-8333-333333333333';
  const PENDING_ADDRESSEE_ID = '44444444-4444-4444-8444-444444444444';
  const STRANGER_ID = '55555555-5555-4555-8555-555555555555';

  const sampleProfiles: MockProfileRow[] = [
    {
      id: OWNER_ID,
      username: 'owner_user',
      display_name: 'Owner Name',
      full_name: 'Owner Full Name',
      avatar_url: 'https://example.com/owner.webp',
      bio: 'Owner private biography details',
      streak: 12,
    },
    {
      id: ACCEPTED_FRIEND_ID,
      username: 'accepted_friend',
      display_name: 'Accepted Friend',
      full_name: 'Accepted Friend Full',
      avatar_url: 'https://example.com/friend.webp',
      bio: 'Accepted friend private bio',
      streak: 9,
    },
    {
      id: PENDING_REQUESTER_ID,
      username: 'pending_requester',
      display_name: 'Pending Requester',
      full_name: 'Pending Requester Full',
      avatar_url: 'https://example.com/pending-req.webp',
      bio: 'Secret bio of incoming requester',
      streak: 21,
    },
    {
      id: PENDING_ADDRESSEE_ID,
      username: 'pending_addressee',
      display_name: 'Pending Addressee',
      full_name: 'Pending Addressee Full',
      avatar_url: 'https://example.com/pending-add.webp',
      bio: 'Secret bio of outgoing addressee',
      streak: 15,
    },
    {
      id: STRANGER_ID,
      username: 'stranger_user',
      display_name: 'Stranger',
      full_name: 'Stranger Full',
      avatar_url: 'https://example.com/stranger.webp',
      bio: 'Stranger secret bio',
      streak: 30,
    },
  ];

  const sampleFriendships: MockFriendshipRow[] = [
    { requester_id: OWNER_ID, addressee_id: ACCEPTED_FRIEND_ID, status: 'accepted' },
    { requester_id: PENDING_REQUESTER_ID, addressee_id: OWNER_ID, status: 'pending' },
    { requester_id: OWNER_ID, addressee_id: PENDING_ADDRESSEE_ID, status: 'pending' },
    { requester_id: OWNER_ID, addressee_id: STRANGER_ID, status: 'declined' },
  ];

  it('masks bio and streak for both incoming and outgoing pending friend requests while preserving request identity fields', () => {
    const results = evaluateGetFriendProfilesSpec({
      callerRole: 'authenticated',
      callerId: OWNER_ID,
      userIds: [PENDING_REQUESTER_ID, PENDING_ADDRESSEE_ID],
      profiles: sampleProfiles,
      friendships: sampleFriendships,
    });

    expect(results).toHaveLength(2);

    const incoming = results.find((r) => r.id === PENDING_REQUESTER_ID)!;
    expect(incoming).toEqual({
      id: PENDING_REQUESTER_ID,
      username: 'pending_requester',
      display_name: 'Pending Requester',
      full_name: 'Pending Requester Full',
      avatar_url: 'https://example.com/pending-req.webp',
      bio: '',
      current_streak: 0,
    });

    const outgoing = results.find((r) => r.id === PENDING_ADDRESSEE_ID)!;
    expect(outgoing).toEqual({
      id: PENDING_ADDRESSEE_ID,
      username: 'pending_addressee',
      display_name: 'Pending Addressee',
      full_name: 'Pending Addressee Full',
      avatar_url: 'https://example.com/pending-add.webp',
      bio: '',
      current_streak: 0,
    });
  });

  it('returns real bio and current_streak for accepted friends (bidirectional) and the profile owner', () => {
    const ownerAndFriendResults = evaluateGetFriendProfilesSpec({
      callerRole: 'authenticated',
      callerId: OWNER_ID,
      userIds: [OWNER_ID, ACCEPTED_FRIEND_ID],
      profiles: sampleProfiles,
      friendships: sampleFriendships,
    });

    expect(ownerAndFriendResults).toEqual([
      {
        id: OWNER_ID,
        username: 'owner_user',
        display_name: 'Owner Name',
        full_name: 'Owner Full Name',
        avatar_url: 'https://example.com/owner.webp',
        bio: 'Owner private biography details',
        current_streak: 12,
      },
      {
        id: ACCEPTED_FRIEND_ID,
        username: 'accepted_friend',
        display_name: 'Accepted Friend',
        full_name: 'Accepted Friend Full',
        avatar_url: 'https://example.com/friend.webp',
        bio: 'Accepted friend private bio',
        current_streak: 9,
      },
    ]);

    // Reverse direction: ACCEPTED_FRIEND_ID querying OWNER_ID
    const reverseResults = evaluateGetFriendProfilesSpec({
      callerRole: 'authenticated',
      callerId: ACCEPTED_FRIEND_ID,
      userIds: [OWNER_ID],
      profiles: sampleProfiles,
      friendships: sampleFriendships,
    });
    expect(reverseResults).toHaveLength(1);
    expect(reverseResults[0].bio).toBe('Owner private biography details');
    expect(reverseResults[0].current_streak).toBe(12);
  });

  it('excludes strangers, declined, and cancelled relationships completely', () => {
    const results = evaluateGetFriendProfilesSpec({
      callerRole: 'authenticated',
      callerId: OWNER_ID,
      userIds: [STRANGER_ID],
      profiles: sampleProfiles,
      friendships: sampleFriendships,
    });
    expect(results).toEqual([]);
  });

  it('rejects anon and PUBLIC callers with permission denied', () => {
    for (const disallowedRole of ['anon', 'public_unprivileged_role'] as CallerRole[]) {
      expect(() =>
        evaluateGetFriendProfilesSpec({
          callerRole: disallowedRole,
          callerId: null,
          userIds: [OWNER_ID],
          profiles: sampleProfiles,
          friendships: sampleFriendships,
        })
      ).toThrow(/42501: permission denied for function get_friend_profiles/);
    }
  });
});
