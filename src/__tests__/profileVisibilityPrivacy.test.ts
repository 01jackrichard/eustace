// @vitest-environment node
/**
 * Scope Notice:
 * These tests combine:
 *   1. Static SQL contract verification of `supabase/migrations/20261013130000_enforce_profile_visibility_rls_and_rpc.sql`,
 *   2. An executable in-memory authorization model of `public.profiles` RLS (`SELECT`, `INSERT`, `UPDATE`)
 *      and `public.get_profile_by_username(target_username text)`, and
 *   3. Regression tests for privacy-safe username availability validation in `EditProfileModal.tsx` and `Signup.tsx`.
 *
 * What is proven:
 *   - The local migration removes the blanket `"Profiles are viewable by all authenticated users."` policy
 *     without dropping `profiles_insert_own`, `profiles_update_own`, `profiles_insert_policy`, or `profiles_update_policy`.
 *   - The SQL policy and RPC definitions preserve the exact live 8-column `get_profile_by_username` signature,
 *     use `SECURITY DEFINER` with `SET search_path = ''`, and use schema-qualified references.
 *   - Under the modeled authorization rules, self-access, public-profile access (including `anon` via RPC),
 *     accepted-friend access to `friends`-only profiles, denial of `private`/`friends`-only rows to strangers
 *     and `pending`/`declined`/`cancelled` requests, and independence of `visibility` vs `activity_visibility`
 *     all hold across all state combinations.
 *   - `EditProfileModal` and `Signup` use `supabase.rpc('check_username_available', { target_username })`,
 *     never fall back to an RLS-filtered `public.profiles` SELECT that could falsely confirm availability,
 *     fail closed with a clear retryable message on RPC failure, translate PostgreSQL `23505` uniqueness races
 *     into a friendly taken-username error, and allow saving unrelated profile edits when the username is unchanged.
 *
 * What is NOT proven:
 *   - Local Vitest tests do not execute against the live production PostgreSQL engine (`ghlsmrkjmqerexqclago`)
 *     and do not prove live `pg_policies` or `pg_proc` state until the migrations (including `check_username_available`)
 *     are applied in an authorized deployment step and verified against production.
 */
import { describe, it, expect, vi } from 'vitest';
import migrationSql from '../../supabase/migrations/20261013130000_enforce_profile_visibility_rls_and_rpc.sql?raw';
import editProfileModalSource from '../components/EditProfileModal.tsx?raw';
import signupSource from '../pages/Signup.tsx?raw';
import {
  USERNAME_TAKEN_ERROR_MESSAGE,
  USERNAME_VERIFY_ERROR_MESSAGE,
  canSaveEditProfile,
  resolveProfileSaveError,
  verifyEditProfileUsername,
} from '../components/EditProfileModal';
import {
  SIGNUP_USERNAME_TAKEN_ERROR,
  SIGNUP_USERNAME_VERIFY_ERROR,
  verifySignupUsernameAvailability,
} from '../pages/Signup';

type Visibility = 'private' | 'friends' | 'public';
type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
type CallerRole = 'anon' | 'authenticated' | 'service_role' | 'public_unprivileged_role';

interface MockProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  visibility: Visibility;
  activity_visibility: Visibility;
}

interface PublicProfileRpcRow {
  id: string;
  username: string;
  display_name: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  visibility: Visibility;
}

interface MockFriendshipRow {
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
}

function hasAcceptedFriendship(
  callerId: string | null,
  targetUserId: string,
  friendships: MockFriendshipRow[]
): boolean {
  if (!callerId) return false;
  return friendships.some(
    (f) =>
      f.status === 'accepted' &&
      ((f.requester_id === callerId && f.addressee_id === targetUserId) ||
        (f.addressee_id === callerId && f.requester_id === targetUserId))
  );
}

/**
 * Executable specification of the `profiles_select_policy` on `public.profiles`
 * (`FOR SELECT TO authenticated`).
 */
function evaluateProfilesSelectRls(params: {
  callerRole: CallerRole;
  callerId: string | null;
  profiles: MockProfileRow[];
  friendships: MockFriendshipRow[];
}): MockProfileRow[] {
  if (params.callerRole === 'service_role') {
    return [...params.profiles];
  }

  // Policy is scoped `TO authenticated`
  if (params.callerRole !== 'authenticated' || !params.callerId) {
    return [];
  }

  return params.profiles.filter((p) => {
    if (p.id === params.callerId) return true;
    if (p.visibility === 'public') return true;
    if (
      p.visibility === 'friends' &&
      hasAcceptedFriendship(params.callerId, p.id, params.friendships)
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Executable specification of preserved `profiles_insert_own` / `profiles_update_own`
 * ownership policies (`WITH CHECK (auth.uid() = id)` / `USING (auth.uid() = id)`).
 */
function evaluateProfilesWriteRls(params: {
  callerRole: CallerRole;
  callerId: string | null;
  targetProfileId: string;
}): boolean {
  if (params.callerRole === 'service_role') return true;
  if (params.callerRole !== 'authenticated' || !params.callerId) return false;
  return params.callerId === params.targetProfileId;
}

/**
 * Executable specification of `public.get_profile_by_username(target_username text)`
 * as defined in `20261013130000_enforce_profile_visibility_rls_and_rpc.sql`.
 */
function evaluateGetProfileByUsernameSpec(params: {
  callerRole: CallerRole;
  callerId: string | null;
  targetUsername: string | null;
  profiles: MockProfileRow[];
  friendships: MockFriendshipRow[];
}): PublicProfileRpcRow[] {
  if (
    params.callerRole !== 'anon' &&
    params.callerRole !== 'authenticated' &&
    params.callerRole !== 'service_role'
  ) {
    throw new Error('42501: permission denied for function get_profile_by_username');
  }

  const cleanUsername = (params.targetUsername ?? '').trim().toLowerCase();
  if (!cleanUsername) {
    return [];
  }

  const matched = params.profiles.find(
    (p) => p.username.toLowerCase() === cleanUsername
  );
  if (!matched) {
    return [];
  }

  const isAuthorized =
    matched.visibility === 'public' ||
    (params.callerId !== null && matched.id === params.callerId) ||
    (params.callerId !== null &&
      matched.visibility === 'friends' &&
      hasAcceptedFriendship(params.callerId, matched.id, params.friendships));

  if (!isAuthorized) {
    return [];
  }

  return [
    {
      id: matched.id,
      username: matched.username,
      display_name: matched.display_name,
      full_name: matched.full_name,
      bio: matched.bio,
      avatar_url: matched.avatar_url,
      cover_image_url: matched.cover_image_url,
      visibility: matched.visibility,
    },
  ];
}

describe('Phase 1B.4 — Static SQL Contract Tests for Profile Visibility RLS & RPC Migration', () => {
  const sql = migrationSql.replace(/\r\n/g, '\n');

  it('1. Removes the blanket authenticated SELECT policy and legacy SELECT policy aliases without touching INSERT/UPDATE policies', () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Profiles are viewable by all authenticated users." ON public.profiles;'
    );
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Profiles are viewable by all users" ON public.profiles;'
    );
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;'
    );

    // Must never use broad USING (true)
    const activeSqlLines = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(activeSqlLines).not.toMatch(/USING\s*\(\s*true\s*\)/i);

    // Must preserve existing INSERT and UPDATE ownership policies
    expect(activeSqlLines).not.toMatch(/DROP\s+POLICY[\s\S]*?profiles_insert_own/i);
    expect(activeSqlLines).not.toMatch(/DROP\s+POLICY[\s\S]*?profiles_update_own/i);
    expect(activeSqlLines).not.toMatch(/DROP\s+POLICY[\s\S]*?profiles_insert_policy/i);
    expect(activeSqlLines).not.toMatch(/DROP\s+POLICY[\s\S]*?profiles_update_policy/i);
  });

  it('2. Defines profiles_select_policy for authenticated users enforcing self, public, or accepted-friend visibility', () => {
    expect(sql).toMatch(
      /CREATE\s+POLICY\s+"profiles_select_policy"\s+ON\s+public\.profiles\s+FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(/i
    );
    expect(sql).toContain('auth.uid() = id');
    expect(sql).toContain("OR visibility = 'public'");
    expect(sql).toMatch(
      /visibility\s*=\s*'friends'\s+AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.friendships\s+f\s+WHERE\s+f\.status\s*=\s*'accepted'\s+AND\s*\(\s*\(f\.requester_id\s*=\s*auth\.uid\(\)\s+AND\s+f\.addressee_id\s*=\s*public\.profiles\.id\)\s+OR\s+\(f\.addressee_id\s*=\s*auth\.uid\(\)\s+AND\s+f\.requester_id\s*=\s*public\.profiles\.id\)\s*\)\s*\)/i
    );
  });

  it('3. Preserves the exact live 8-column get_profile_by_username(target_username text) signature and return structure', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.get_profile_by_username(target_username text)'
    );
    expect(sql).toMatch(
      /RETURNS\s+TABLE\s*\(\s*id\s+uuid,\s*username\s+text,\s*display_name\s+text,\s*full_name\s+text,\s*bio\s+text,\s*avatar_url\s+text,\s*cover_image_url\s+text,\s*visibility\s+text\s*\)/i
    );
    expect(sql).toContain('LANGUAGE plpgsql');
    expect(sql).toContain('STABLE');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
  });

  it('4. Enforces visibility in get_profile_by_username, uses exact lower(p.username) equality (no LIKE/ILIKE wildcards), and uses schema-qualified references', () => {
    const activeSqlLines = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    expect(activeSqlLines).toContain('FROM public.profiles p');
    expect(activeSqlLines).toContain('FROM public.friendships f');
    expect(activeSqlLines).toContain('WHERE lower(p.username) = v_clean_username');

    // Must not use LIKE, ILIKE, or pattern-matching operators in get_profile_by_username
    expect(activeSqlLines).not.toMatch(/\bILIKE\b/i);
    expect(activeSqlLines).not.toMatch(/\bLIKE\b/i);
    expect(activeSqlLines).not.toMatch(/\bSIMILAR\s+TO\b/i);

    expect(activeSqlLines).toMatch(
      /p\.visibility\s*=\s*'public'\s+OR\s+\(v_caller_id\s+IS\s+NOT\s+NULL\s+AND\s+p\.id\s*=\s*v_caller_id\)\s+OR\s+\(\s*v_caller_id\s+IS\s+NOT\s+NULL\s+AND\s+p\.visibility\s*=\s*'friends'\s+AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.friendships\s+f\s+WHERE\s+f\.status\s*=\s*'accepted'/i
    );
  });

  it('5. Keeps activity_visibility independent from general profile visibility in both RLS and get_profile_by_username', () => {
    const activeSqlLines = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(activeSqlLines).not.toContain('activity_visibility');
  });

  it('6. Revokes PUBLIC execution on get_profile_by_username and grants EXECUTE to anon, authenticated, and service_role', () => {
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.get_profile_by_username(text) FROM PUBLIC;'
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_profile_by_username(text) TO anon, authenticated, service_role;'
    );
  });
});

describe('Phase 1B.4 — Executable Authorization Model Tests for Profile Visibility RLS & RPC', () => {
  const PUBLIC_USER_ID = '11111111-1111-4111-8111-111111111111';
  const FRIENDS_USER_ID = '22222222-2222-4222-8222-222222222222';
  const PRIVATE_USER_ID = '33333333-3333-4333-8333-333333333333';
  const ACCEPTED_FRIEND_ID = '44444444-4444-4444-8444-444444444444';
  const PENDING_USER_ID = '55555555-5555-4555-8555-555555555555';
  const DECLINED_USER_ID = '66666666-6666-4666-8666-666666666666';
  const CANCELLED_USER_ID = '77777777-7777-4777-8777-777777777777';
  const STRANGER_USER_ID = '88888888-8888-4888-8888-888888888888';

  const profiles: MockProfileRow[] = [
    {
      id: PUBLIC_USER_ID,
      username: 'public_member',
      display_name: 'Public Member',
      full_name: 'Public Member Full',
      bio: 'Public bio text',
      avatar_url: 'https://example.com/public.webp',
      cover_image_url: 'https://example.com/public-cover.webp',
      visibility: 'public',
      activity_visibility: 'private', // Independent activity setting
    },
    {
      id: FRIENDS_USER_ID,
      username: 'friends_only_member',
      display_name: 'Friends Only',
      full_name: 'Friends Only Full',
      bio: 'Friends-only confidential bio',
      avatar_url: 'https://example.com/friends.webp',
      cover_image_url: 'https://example.com/friends-cover.webp',
      visibility: 'friends',
      activity_visibility: 'public',
    },
    {
      id: PRIVATE_USER_ID,
      username: 'private_member',
      display_name: 'Private Member',
      full_name: 'Private Member Full',
      bio: 'Strictly private bio',
      avatar_url: 'https://example.com/private.webp',
      cover_image_url: 'https://example.com/private-cover.webp',
      visibility: 'private',
      activity_visibility: 'public',
    },
  ];

  const friendships: MockFriendshipRow[] = [
    // Bidirectional accepted friendships with FRIENDS_USER_ID and PRIVATE_USER_ID
    { requester_id: ACCEPTED_FRIEND_ID, addressee_id: FRIENDS_USER_ID, status: 'accepted' },
    { requester_id: PRIVATE_USER_ID, addressee_id: ACCEPTED_FRIEND_ID, status: 'accepted' },
    // Non-accepted states with FRIENDS_USER_ID and PRIVATE_USER_ID
    { requester_id: PENDING_USER_ID, addressee_id: FRIENDS_USER_ID, status: 'pending' },
    { requester_id: FRIENDS_USER_ID, addressee_id: DECLINED_USER_ID, status: 'declined' },
    { requester_id: CANCELLED_USER_ID, addressee_id: FRIENDS_USER_ID, status: 'cancelled' },
    { requester_id: PENDING_USER_ID, addressee_id: PRIVATE_USER_ID, status: 'pending' },
  ];

  it('1. Self-access is permitted for public, friends-only, and private profiles via both RLS SELECT and get_profile_by_username', () => {
    for (const ownProfile of profiles) {
      const rlsRows = evaluateProfilesSelectRls({
        callerRole: 'authenticated',
        callerId: ownProfile.id,
        profiles,
        friendships,
      });
      expect(rlsRows.some((r) => r.id === ownProfile.id)).toBe(true);

      const rpcRows = evaluateGetProfileByUsernameSpec({
        callerRole: 'authenticated',
        callerId: ownProfile.id,
        targetUsername: ownProfile.username,
        profiles,
        friendships,
      });
      expect(rpcRows).toHaveLength(1);
      expect(rpcRows[0].id).toBe(ownProfile.id);
      expect(rpcRows[0].bio).toBe(ownProfile.bio);
    }
  });

  it('2. Unauthenticated visitors (anon) can read public profiles via get_profile_by_username but are denied friends-only/private profiles and direct table SELECT', () => {
    // Direct table SELECT is blocked for anon
    expect(
      evaluateProfilesSelectRls({
        callerRole: 'anon',
        callerId: null,
        profiles,
        friendships,
      })
    ).toEqual([]);

    // RPC returns public profile for anon
    const publicRpc = evaluateGetProfileByUsernameSpec({
      callerRole: 'anon',
      callerId: null,
      targetUsername: 'PUBLIC_MEMBER',
      profiles,
      friendships,
    });
    expect(publicRpc).toHaveLength(1);
    expect(publicRpc[0].id).toBe(PUBLIC_USER_ID);
    expect(publicRpc[0].visibility).toBe('public');

    // RPC returns empty for friends-only and private profiles when called by anon
    expect(
      evaluateGetProfileByUsernameSpec({
        callerRole: 'anon',
        callerId: null,
        targetUsername: 'friends_only_member',
        profiles,
        friendships,
      })
    ).toEqual([]);

    expect(
      evaluateGetProfileByUsernameSpec({
        callerRole: 'anon',
        callerId: null,
        targetUsername: 'private_member',
        profiles,
        friendships,
      })
    ).toEqual([]);
  });

  it('3. Accepted friends can read friends-only profiles (bidirectional) via both RLS SELECT and get_profile_by_username', () => {
    const rlsVisible = evaluateProfilesSelectRls({
      callerRole: 'authenticated',
      callerId: ACCEPTED_FRIEND_ID,
      profiles,
      friendships,
    });
    expect(rlsVisible.map((p) => p.id)).toEqual([PUBLIC_USER_ID, FRIENDS_USER_ID]);

    const rpcFriendsOnly = evaluateGetProfileByUsernameSpec({
      callerRole: 'authenticated',
      callerId: ACCEPTED_FRIEND_ID,
      targetUsername: 'friends_only_member',
      profiles,
      friendships,
    });
    expect(rpcFriendsOnly).toHaveLength(1);
    expect(rpcFriendsOnly[0].id).toBe(FRIENDS_USER_ID);
    expect(rpcFriendsOnly[0].bio).toBe('Friends-only confidential bio');

    // Also verify reverse direction where target user was the requester
    const reverseFriendships: MockFriendshipRow[] = [
      { requester_id: FRIENDS_USER_ID, addressee_id: ACCEPTED_FRIEND_ID, status: 'accepted' },
    ];
    expect(
      evaluateGetProfileByUsernameSpec({
        callerRole: 'authenticated',
        callerId: ACCEPTED_FRIEND_ID,
        targetUsername: 'friends_only_member',
        profiles,
        friendships: reverseFriendships,
      })
    ).toHaveLength(1);
  });

  it('4. Strangers and pending, declined, or cancelled requests are denied access to friends-only and private profiles', () => {
    const nonFriendCallers = [
      STRANGER_USER_ID,
      PENDING_USER_ID,
      DECLINED_USER_ID,
      CANCELLED_USER_ID,
    ];

    for (const callerId of nonFriendCallers) {
      const rlsRows = evaluateProfilesSelectRls({
        callerRole: 'authenticated',
        callerId,
        profiles,
        friendships,
      });
      // Only the public profile is visible via direct SELECT
      expect(rlsRows.map((p) => p.id)).toEqual([PUBLIC_USER_ID]);

      // Neither friends-only nor private profile is returned by get_profile_by_username
      expect(
        evaluateGetProfileByUsernameSpec({
          callerRole: 'authenticated',
          callerId,
          targetUsername: 'friends_only_member',
          profiles,
          friendships,
        })
      ).toEqual([]);

      expect(
        evaluateGetProfileByUsernameSpec({
          callerRole: 'authenticated',
          callerId,
          targetUsername: 'private_member',
          profiles,
          friendships,
        })
      ).toEqual([]);
    }

    // Even an accepted friend cannot read another user's strictly `private` profile via direct SELECT or get_profile_by_username
    expect(
      evaluateGetProfileByUsernameSpec({
        callerRole: 'authenticated',
        callerId: ACCEPTED_FRIEND_ID,
        targetUsername: 'private_member',
        profiles,
        friendships,
      })
    ).toEqual([]);
  });

  it('5. Preserves INSERT and UPDATE ownership policies so users can only upsert/modify their own profile row', () => {
    expect(
      evaluateProfilesWriteRls({
        callerRole: 'authenticated',
        callerId: PUBLIC_USER_ID,
        targetProfileId: PUBLIC_USER_ID,
      })
    ).toBe(true);

    expect(
      evaluateProfilesWriteRls({
        callerRole: 'authenticated',
        callerId: PUBLIC_USER_ID,
        targetProfileId: PRIVATE_USER_ID,
      })
    ).toBe(false);

    expect(
      evaluateProfilesWriteRls({
        callerRole: 'anon',
        callerId: null,
        targetProfileId: PUBLIC_USER_ID,
      })
    ).toBe(false);
  });

  it('6. Keeps profile visibility independent of activity_visibility and returns the exact 8 expected RPC columns', () => {
    // PUBLIC_USER_ID has visibility = 'public' and activity_visibility = 'private'
    const [row] = evaluateGetProfileByUsernameSpec({
      callerRole: 'anon',
      callerId: null,
      targetUsername: 'public_member',
      profiles,
      friendships,
    });

    expect(row).toBeDefined();
    expect(Object.keys(row)).toEqual([
      'id',
      'username',
      'display_name',
      'full_name',
      'bio',
      'avatar_url',
      'cover_image_url',
      'visibility',
    ]);
    expect('activity_visibility' in row).toBe(false);
  });

  it('7. Treats % and _ as literal characters (no wildcard matching) while supporting case-insensitive and trimmed ordinary usernames', () => {
    const wildcardTestProfiles: MockProfileRow[] = [
      ...profiles,
      {
        id: '99999999-9999-4999-8999-999999999991',
        username: 'sathishx420',
        display_name: 'Sathish X',
        full_name: 'Sathish X',
        bio: null,
        avatar_url: null,
        cover_image_url: null,
        visibility: 'public',
        activity_visibility: 'public',
      },
      {
        id: '99999999-9999-4999-8999-999999999992',
        username: 'sathish_420',
        display_name: 'Sathish Underscore',
        full_name: 'Sathish Underscore',
        bio: null,
        avatar_url: null,
        cover_image_url: null,
        visibility: 'public',
        activity_visibility: 'public',
      },
    ];

    // `%` wildcards must never match any profile
    for (const pattern of ['%', 'public_%', '%_member', 'sathish%', '%']) {
      expect(
        evaluateGetProfileByUsernameSpec({
          callerRole: 'anon',
          callerId: null,
          targetUsername: pattern,
          profiles: wildcardTestProfiles,
          friendships,
        })
      ).toEqual([]);
    }

    // `_` must match literal underscore only, never arbitrary single characters like 'x'
    const onlyXProfile = wildcardTestProfiles.filter((p) => p.username !== 'sathish_420');
    expect(
      evaluateGetProfileByUsernameSpec({
        callerRole: 'anon',
        callerId: null,
        targetUsername: 'sathish_420',
        profiles: onlyXProfile,
        friendships,
      })
    ).toEqual([]);

    // When both `sathishx420` (listed first) and `sathish_420` exist, querying `sathish_420` returns `sathish_420`
    const exactMatch = evaluateGetProfileByUsernameSpec({
      callerRole: 'anon',
      callerId: null,
      targetUsername: '  SATHISH_420  ',
      profiles: wildcardTestProfiles,
      friendships,
    });
    expect(exactMatch).toHaveLength(1);
    expect(exactMatch[0].username).toBe('sathish_420');
  });

  it('8. Fails closed when authentication identity is missing or profile visibility has an unrecognized/null value', () => {
    const corruptedProfiles: MockProfileRow[] = [
      ...profiles,
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        username: 'unknown_vis_user',
        display_name: 'Unknown Vis',
        full_name: 'Unknown Vis',
        bio: 'Should remain hidden except to owner',
        avatar_url: null,
        cover_image_url: null,
        visibility: 'unexpected_mode' as unknown as Visibility,
        activity_visibility: 'public',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        username: 'null_vis_user',
        display_name: 'Null Vis',
        full_name: 'Null Vis',
        bio: 'Should remain hidden except to owner',
        avatar_url: null,
        cover_image_url: null,
        visibility: null as unknown as Visibility,
        activity_visibility: 'public',
      },
    ];

    const extendedFriendships: MockFriendshipRow[] = [
      ...friendships,
      {
        requester_id: ACCEPTED_FRIEND_ID,
        addressee_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'accepted',
      },
      {
        requester_id: ACCEPTED_FRIEND_ID,
        addressee_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'accepted',
      },
    ];

    // Missing callerId even with 'authenticated' role fails closed on RLS SELECT and non-public RPC
    expect(
      evaluateProfilesSelectRls({
        callerRole: 'authenticated',
        callerId: null,
        profiles: corruptedProfiles,
        friendships: extendedFriendships,
      })
    ).toEqual([]);

    expect(
      evaluateGetProfileByUsernameSpec({
        callerRole: 'authenticated',
        callerId: null,
        targetUsername: 'friends_only_member',
        profiles: corruptedProfiles,
        friendships: extendedFriendships,
      })
    ).toEqual([]);

    // Unrecognized or null visibility is denied to anon, strangers, and even accepted friends
    for (const uname of ['unknown_vis_user', 'null_vis_user']) {
      expect(
        evaluateGetProfileByUsernameSpec({
          callerRole: 'anon',
          callerId: null,
          targetUsername: uname,
          profiles: corruptedProfiles,
          friendships: extendedFriendships,
        })
      ).toEqual([]);

      expect(
        evaluateGetProfileByUsernameSpec({
          callerRole: 'authenticated',
          callerId: ACCEPTED_FRIEND_ID,
          targetUsername: uname,
          profiles: corruptedProfiles,
          friendships: extendedFriendships,
        })
      ).toEqual([]);
    }

    // Owner can still read their own profile even if visibility is unrecognized/null
    expect(
      evaluateGetProfileByUsernameSpec({
        callerRole: 'authenticated',
        callerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        targetUsername: 'unknown_vis_user',
        profiles: corruptedProfiles,
        friendships: extendedFriendships,
      })
    ).toHaveLength(1);
  });
});

describe('Phase 1B.6 — Privacy-Safe Username Availability Regression Tests', () => {
  it('1. RPC reports available (true) in both EditProfileModal and Signup', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    const editResult = await verifyEditProfileUsername({
      candidateUsername: '  New_User_99  ',
      currentUsername: 'existing_user',
      client: mockClient,
    });
    expect(mockClient.rpc).toHaveBeenCalledWith('check_username_available', {
      target_username: 'new_user_99',
    });
    expect(editResult).toEqual({
      status: 'available',
      errorMessage: null,
    });

    const signupResult = await verifySignupUsernameAvailability('new_user_99', mockClient);
    expect(signupResult).toEqual({
      available: true,
      error: null,
    });
  });

  it('2. RPC reports taken (false) in both EditProfileModal and Signup, including when taken by a private/friends-only profile', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };

    const editResult = await verifyEditProfileUsername({
      candidateUsername: 'private_member',
      currentUsername: 'existing_user',
      client: mockClient,
    });
    expect(mockClient.rpc).toHaveBeenCalledWith('check_username_available', {
      target_username: 'private_member',
    });
    expect(editResult).toEqual({
      status: 'taken',
      errorMessage: null,
    });

    const signupResult = await verifySignupUsernameAvailability('private_member', mockClient);
    expect(signupResult).toEqual({
      available: false,
      error: SIGNUP_USERNAME_TAKEN_ERROR,
    });
  });

  it('3. RPC fails or returns an unexpected result — fails closed and never falsely reports available', async () => {
    const errorAndMalformedResponses: Array<
      () => Promise<{ data: unknown; error: unknown }>
    > = [
      () => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Function not found' } }),
      () => Promise.resolve({ data: true, error: { code: '500', message: 'Internal error' } }),
      () => Promise.resolve({ data: null, error: null }),
      () => Promise.resolve({ data: undefined, error: null }),
      () => Promise.resolve({ data: 'true', error: null }),
      () => Promise.resolve({ data: 1, error: null }),
      () => Promise.reject(new Error('Network failure')),
    ];

    for (const makeResponse of errorAndMalformedResponses) {
      const mockClient = {
        rpc: vi.fn().mockImplementation(makeResponse),
      };

      const editResult = await verifyEditProfileUsername({
        candidateUsername: 'valid_candidate',
        currentUsername: 'existing_user',
        client: mockClient,
      });
      expect(editResult).toEqual({
        status: 'error',
        errorMessage: USERNAME_VERIFY_ERROR_MESSAGE,
      });
      expect(
        canSaveEditProfile({
          isDirty: true,
          saving: false,
          username: 'valid_candidate',
          currentUsername: 'existing_user',
          usernameStatus: editResult.status,
        })
      ).toBe(false);

      const signupResult = await verifySignupUsernameAvailability('valid_candidate', mockClient);
      expect(signupResult).toEqual({
        available: false,
        error: SIGNUP_USERNAME_VERIFY_ERROR,
      });
    }
  });

  it('4. Direct profile fallback cannot falsely confirm availability when RLS hides private/friends-only rows', async () => {
    // Verify source contracts: neither EditProfileModal nor Signup queries `.from('profiles').select(...)`
    // to check username availability.
    const normalizedEditSource = editProfileModalSource.replace(/\r\n/g, '\n');
    const normalizedSignupSource = signupSource.replace(/\r\n/g, '\n');

    expect(normalizedEditSource).toContain("rpc(\n      'check_username_available'");
    expect(normalizedEditSource).not.toMatch(/\.from\(\s*['"]profiles['"]\s*\)\s*\.select\(/);

    expect(normalizedSignupSource).toContain("rpc(\n      'check_username_available'");
    expect(normalizedSignupSource).not.toMatch(/\.from\(\s*['"]profiles['"]\s*\)\s*\.select\(/);

    // Even if a mock client had a `.from('profiles').select(...)` method that would return `{ data: null }`
    // because RLS hides a `private` profile row, an RPC failure must never invoke `.from('profiles')`
    // or mark the username available.
    const forbiddenSelectSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockClientWithForbiddenFallback = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find function check_username_available' },
      }),
      from: forbiddenSelectSpy,
    };

    const editResult = await verifyEditProfileUsername({
      candidateUsername: 'hidden_private',
      currentUsername: 'my_handle',
      client: mockClientWithForbiddenFallback,
    });
    expect(editResult.status).toBe('error');
    expect(editResult.status).not.toBe('available');
    expect(forbiddenSelectSpy).not.toHaveBeenCalled();

    const signupResult = await verifySignupUsernameAvailability(
      'hidden_private',
      mockClientWithForbiddenFallback
    );
    expect(signupResult.available).toBe(false);
    expect(signupResult.error).toBe(SIGNUP_USERNAME_VERIFY_ERROR);
    expect(forbiddenSelectSpy).not.toHaveBeenCalled();
  });

  it('5. Username uniqueness race (PostgreSQL 23505) returns a friendly message in profile editing', () => {
    const conflictResult = resolveProfileSaveError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "profiles_username_key" (Key (username)=(sathish_420) already exists.)',
    });

    expect(conflictResult).toEqual({
      isUsernameTaken: true,
      errorMessage: USERNAME_TAKEN_ERROR_MESSAGE,
    });
    expect(conflictResult.errorMessage).toBe('Username is already taken. Please choose another.');

    // Non-23505 errors preserve their message without falsely flagging username as taken
    const otherErrorResult = resolveProfileSaveError({
      code: '42501',
      message: 'new row violates row-level security policy for table "profiles"',
    });
    expect(otherErrorResult).toEqual({
      isUsernameTaken: false,
      errorMessage: 'new row violates row-level security policy for table "profiles"',
    });
  });

  it('6. Unchanged username does not invoke the RPC or block saving unrelated profile changes (bio, display_name, avatar, cover)', async () => {
    const mockClient = {
      rpc: vi.fn().mockRejectedValue(new Error('RPC should not be called when username is unchanged')),
    };

    // Exact match and case/whitespace variations of current username stay 'idle' without calling RPC
    for (const candidate of ['sathish_420', 'SATHISH_420', '  sathish_420  ']) {
      const checkResult = await verifyEditProfileUsername({
        candidateUsername: candidate,
        currentUsername: 'sathish_420',
        client: mockClient,
      });
      expect(checkResult).toEqual({
        status: 'idle',
        errorMessage: null,
      });
    }
    expect(mockClient.rpc).not.toHaveBeenCalled();

    // When username is unchanged and unrelated fields (e.g. displayName, bio, avatarUrl, coverUrl) make `isDirty = true`,
    // `canSaveEditProfile` allows saving even though `usernameStatus` is `'idle'` (or even if an earlier check had errored).
    expect(
      canSaveEditProfile({
        isDirty: true,
        saving: false,
        username: 'sathish_420',
        currentUsername: 'sathish_420',
        usernameStatus: 'idle',
      })
    ).toBe(true);

    // Conversely, when username IS changed to a new handle, `canSaveEditProfile` requires `usernameStatus === 'available'`
    for (const nonAvailableStatus of ['idle', 'checking', 'taken', 'invalid', 'error'] as const) {
      expect(
        canSaveEditProfile({
          isDirty: true,
          saving: false,
          username: 'brand_new_handle',
          currentUsername: 'sathish_420',
          usernameStatus: nonAvailableStatus,
        })
      ).toBe(false);
    }

    expect(
      canSaveEditProfile({
        isDirty: true,
        saving: false,
        username: 'brand_new_handle',
        currentUsername: 'sathish_420',
        usernameStatus: 'available',
      })
    ).toBe(true);
  });
});


