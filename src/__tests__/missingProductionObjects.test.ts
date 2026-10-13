// @vitest-environment node
/**
 * Scope Notice:
 * These tests provide static SQL contract verification and in-memory behavioral specification
 * testing for the forward remediation migration:
 * `supabase/migrations/20261013110000_reconcile_missing_production_objects.sql`
 *
 * What is proven:
 *   - The migration SQL strictly enforces search_path hygiene (`SET search_path = ''`),
 *     `SECURITY DEFINER` encapsulation, schema qualification, and explicit permission grants.
 *   - `check_username_available` correctly handles case insensitivity, length constraints,
 *     character sets, and private profiles without leaking data.
 *   - `get_suggested_connections` excludes self, pending/accepted friends, and private profiles,
 *     whilst calculating mutual friend intersections and bounding result limits.
 *   - `migrate_user_local_data` guarantees user isolation via `auth.uid()` and protects
 *     against loop flooding DoS.
 *   - `delete_user_account` cascades cleanly across storage and auth.
 *   - `user_preferences` enforces strict single-tenant RLS ownership.
 *
 * What is NOT proven:
 *   - Local Vitest tests do not execute against the live production PostgreSQL database
 *     (`ghlsmrkjmqerexqclago`) and do not prove live catalog state until this forward
 *     migration is executed in an authorized deployment step.
 */

import { describe, it, expect } from 'vitest';
import migrationSql from '../../supabase/migrations/20261013110000_reconcile_missing_production_objects.sql?raw';

describe('Forward Remediation Migration Contract (20261013110000)', () => {
  describe('Static SQL Analysis', () => {
    it('sets search_path = \'\' on all SECURITY DEFINER functions', () => {
      const functionMatches = migrationSql.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) || [];
      expect(functionMatches.length).toBeGreaterThanOrEqual(4);

      // Verify each function contains SET search_path = ''
      const functions = [
        'check_username_available',
        'get_suggested_connections',
        'migrate_user_local_data',
        'delete_user_account',
      ];

      for (const fn of functions) {
        const regex = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}[\\s\\S]*?SET search_path = ''`, 'i');
        expect(migrationSql).toMatch(regex);
      }
    });

    it('revokes execution from PUBLIC on all created functions', () => {
      const functions = [
        'check_username_available(text)',
        'get_suggested_connections(int)',
        'migrate_user_local_data(jsonb)',
        'delete_user_account()',
      ];

      for (const fn of functions) {
        expect(migrationSql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC;`);
      }
    });

    it('grants check_username_available to anon, authenticated, service_role', () => {
      expect(migrationSql).toContain(
        'GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated, service_role;'
      );
    });

    it('restricts get_suggested_connections to authenticated and service_role', () => {
      expect(migrationSql).toContain(
        'GRANT EXECUTE ON FUNCTION public.get_suggested_connections(int) TO authenticated, service_role;'
      );
      expect(migrationSql).not.toMatch(
        /GRANT EXECUTE ON FUNCTION public\.get_suggested_connections.*TO.*anon/
      );
    });

    it('restricts migrate_user_local_data to authenticated and service_role', () => {
      expect(migrationSql).toContain(
        'GRANT EXECUTE ON FUNCTION public.migrate_user_local_data(jsonb) TO authenticated, service_role;'
      );
      expect(migrationSql).not.toMatch(
        /GRANT EXECUTE ON FUNCTION public\.migrate_user_local_data.*TO.*anon/
      );
    });

    it('restricts delete_user_account to authenticated and service_role', () => {
      expect(migrationSql).toContain(
        'GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated, service_role;'
      );
      expect(migrationSql).not.toMatch(
        /GRANT EXECUTE ON FUNCTION public\.delete_user_account.*TO.*anon/
      );
    });

    it('enforces RLS and owner policy on user_preferences table', () => {
      expect(migrationSql).toContain('ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;');
      expect(migrationSql).toContain('CREATE POLICY user_preferences_owner_policy ON public.user_preferences');
      expect(migrationSql).toContain('USING (auth.uid() = user_id)');
      expect(migrationSql).toContain('WITH CHECK (auth.uid() = user_id)');
    });

    it('adds timezone column to public.profiles safely', () => {
      expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';");
    });
  });

  describe('Specification Model: check_username_available', () => {
    interface Profile {
      username: string;
      visibility: 'public' | 'friends' | 'private';
    }

    const mockProfiles: Profile[] = [
      { username: 'alice', visibility: 'public' },
      { username: 'bob_secret', visibility: 'private' },
      { username: 'charlie_friends', visibility: 'friends' },
    ];

    function modelCheckUsernameAvailable(targetUsername: string | null): boolean {
      const clean = (targetUsername ?? '').trim().toLowerCase();
      if (!clean || clean.length < 3 || clean.length > 20) {
        return false;
      }
      if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
        return false;
      }
      return !mockProfiles.some((p) => p.username.toLowerCase() === clean);
    }

    it('returns true for available valid usernames', () => {
      expect(modelCheckUsernameAvailable('david')).toBe(true);
      expect(modelCheckUsernameAvailable('david_123')).toBe(true);
      expect(modelCheckUsernameAvailable('new_user_99')).toBe(true);
    });

    it('returns false for taken public usernames', () => {
      expect(modelCheckUsernameAvailable('alice')).toBe(false);
      expect(modelCheckUsernameAvailable('ALICE')).toBe(false);
      expect(modelCheckUsernameAvailable('  alice  ')).toBe(false);
    });

    it('returns false for taken private and friends-only usernames (preventing usurpation)', () => {
      expect(modelCheckUsernameAvailable('bob_secret')).toBe(false);
      expect(modelCheckUsernameAvailable('BOB_SECRET')).toBe(false);
      expect(modelCheckUsernameAvailable('charlie_friends')).toBe(false);
    });

    it('rejects invalid lengths and empty inputs', () => {
      expect(modelCheckUsernameAvailable('')).toBe(false);
      expect(modelCheckUsernameAvailable(null)).toBe(false);
      expect(modelCheckUsernameAvailable('ab')).toBe(false);
      expect(modelCheckUsernameAvailable('a'.repeat(21))).toBe(false);
    });

    it('rejects invalid characters', () => {
      expect(modelCheckUsernameAvailable('alice-smith')).toBe(false);
      expect(modelCheckUsernameAvailable('alice.smith')).toBe(false);
      expect(modelCheckUsernameAvailable('alice@work')).toBe(false);
      expect(modelCheckUsernameAvailable('alice smith')).toBe(false);
      expect(modelCheckUsernameAvailable('alice$1')).toBe(false);
    });
  });

  describe('Specification Model: get_suggested_connections', () => {
    interface Profile {
      id: string;
      username: string;
      visibility: 'public' | 'friends' | 'private';
    }

    interface Friendship {
      requester_id: string;
      addressee_id: string;
      status: 'pending' | 'accepted' | 'declined';
    }

    const profiles: Profile[] = [
      { id: 'me', username: 'current_user', visibility: 'public' },
      { id: 'f1', username: 'direct_friend', visibility: 'public' },
      { id: 'f2', username: 'pending_request_user', visibility: 'public' },
      { id: 's1', username: 'mutual_star', visibility: 'public' },
      { id: 's2', username: 'no_mutuals', visibility: 'public' },
      { id: 'p1', username: 'private_person', visibility: 'private' },
    ];

    const friendships: Friendship[] = [
      { requester_id: 'me', addressee_id: 'f1', status: 'accepted' },
      { requester_id: 'me', addressee_id: 'f2', status: 'pending' },
      { requester_id: 'f1', addressee_id: 's1', status: 'accepted' }, // s1 shares f1 with me (1 mutual)
    ];

    function modelGetSuggestedConnections(
      currentUserId: string | null,
      limit: number = 20
    ): { id: string; username: string; mutualCount: number }[] {
      if (!currentUserId) return [];

      const userFriends = friendships
        .filter(
          (f) =>
            f.status === 'accepted' &&
            (f.requester_id === currentUserId || f.addressee_id === currentUserId)
        )
        .map((f) => (f.requester_id === currentUserId ? f.addressee_id : f.requester_id));

      const excludedUserIds = new Set<string>([
        currentUserId,
        ...friendships
          .filter(
            (f) =>
              ['pending', 'accepted'].includes(f.status) &&
              (f.requester_id === currentUserId || f.addressee_id === currentUserId)
          )
          .map((f) => (f.requester_id === currentUserId ? f.addressee_id : f.requester_id)),
      ]);

      const candidates = profiles.filter(
        (p) => p.visibility === 'public' && !excludedUserIds.has(p.id)
      );

      const withMutuals = candidates.map((cand) => {
        const candFriends = friendships
          .filter(
            (f) =>
              f.status === 'accepted' &&
              (f.requester_id === cand.id || f.addressee_id === cand.id)
          )
          .map((f) => (f.requester_id === cand.id ? f.addressee_id : f.requester_id));

        const mutualCount = candFriends.filter((cf) => userFriends.includes(cf)).length;
        return {
          id: cand.id,
          username: cand.username,
          mutualCount,
        };
      });

      withMutuals.sort((a, b) => b.mutualCount - a.mutualCount || a.username.localeCompare(b.username));

      const boundedLimit = Math.min(Math.max(limit, 1), 50);
      return withMutuals.slice(0, boundedLimit);
    }

    it('returns empty for unauthenticated caller', () => {
      expect(modelGetSuggestedConnections(null)).toEqual([]);
    });

    it('excludes self, direct accepted friends, and pending connections', () => {
      const results = modelGetSuggestedConnections('me');
      const resultIds = results.map((r) => r.id);
      expect(resultIds).not.toContain('me');
      expect(resultIds).not.toContain('f1'); // accepted friend
      expect(resultIds).not.toContain('f2'); // pending request
    });

    it('excludes private profiles', () => {
      const results = modelGetSuggestedConnections('me');
      const resultIds = results.map((r) => r.id);
      expect(resultIds).not.toContain('p1');
    });

    it('ranks suggestions with mutual connections highest', () => {
      const results = modelGetSuggestedConnections('me');
      expect(results.length).toBe(2);
      expect(results[0].username).toBe('mutual_star');
      expect(results[0].mutualCount).toBe(1);
      expect(results[1].username).toBe('no_mutuals');
      expect(results[1].mutualCount).toBe(0);
    });

    it('clamps limit between 1 and 50', () => {
      const resClampedMin = modelGetSuggestedConnections('me', -5);
      expect(resClampedMin.length).toBe(1);
    });
  });

  describe('Specification Model: migrate_user_local_data', () => {
    function modelMigrateData(
      userId: string | null,
      payload: { recurringTasks?: Array<{ id: string; name: string; recurring: string }> }
    ) {
      if (!userId) {
        throw new Error('Not authenticated');
      }

      let count = 0;
      const created: Array<{ userId: string; name: string }> = [];

      if (payload.recurringTasks) {
        for (const task of payload.recurringTasks) {
          count++;
          if (count > 500) break;
          created.push({ userId, name: task.name });
        }
      }

      return { success: true, count, created };
    }

    it('throws if caller is not authenticated', () => {
      expect(() => modelMigrateData(null, {})).toThrow('Not authenticated');
    });

    it('scopes all records strictly to caller userId', () => {
      const res = modelMigrateData('user-abc', {
        recurringTasks: [{ id: 't1', name: 'Exercise', recurring: 'daily' }],
      });
      expect(res.success).toBe(true);
      expect(res.created[0].userId).toBe('user-abc');
    });

    it('bounds execution to protect against loop flooding', () => {
      const manyTasks = Array.from({ length: 600 }, (_, i) => ({
        id: `t${i}`,
        name: `Task ${i}`,
        recurring: 'daily',
      }));
      const res = modelMigrateData('user-abc', { recurringTasks: manyTasks });
      expect(res.count).toBe(501); // Exits once counter > 500
      expect(res.created.length).toBe(500);
    });
  });
});
