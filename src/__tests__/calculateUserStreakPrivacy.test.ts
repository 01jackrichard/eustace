// @vitest-environment node
/**
 * Scope Notice:
 * Static SQL contract tests and in-memory specification models verify the local
 * migration draft (`supabase/migrations/20261013123000_harden_calculate_user_streak_privacy.sql`)
 * and its authorization/streak semantics against synthetic fixtures.
 * Local SQL contract tests alone do NOT prove live production PostgreSQL
 * catalog permissions or runtime behavior; production verification must be
 * performed after migration history reconciliation and authorized deployment.
 */
import { describe, it, expect } from 'vitest';
import hardenedMigrationSql from '../../supabase/migrations/20261013123000_harden_calculate_user_streak_privacy.sql?raw';
import baselineStreakMigrationSql from '../../supabase/migrations/20261009204500_implement_streak_baseline_framework.sql?raw';

type Visibility = 'private' | 'friends' | 'public';
type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
type CallerRole = 'anon' | 'authenticated' | 'public_unprivileged_role';

interface MockProfile {
  id: string;
  visibility: Visibility;
  activity_visibility: Visibility;
}

interface MockFriendship {
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
}

interface MockStreakInputs {
  completedDates: string[];
  manualCompletionDates: string[];
  streakCreditValue?: number;
  streakCreditDate?: string | null;
}

/**
 * Computes the streak using the same consecutive-day grouping algorithm as
 * `WITH user_active_dates AS (...)` in `public.calculate_user_streak`,
 * evaluated relative to `referenceCurrentDate` (`YYYY-MM-DD`).
 */
function computeStreakFromInputs(
  inputs: MockStreakInputs | undefined,
  referenceCurrentDate: string
): number {
  if (!inputs) return 0;

  const activeSet = new Set<string>();
  for (const d of inputs.completedDates) activeSet.add(d);
  for (const d of inputs.manualCompletionDates) activeSet.add(d);

  if (
    inputs.streakCreditValue &&
    inputs.streakCreditValue > 0 &&
    inputs.streakCreditDate
  ) {
    const endMs = Date.parse(`${inputs.streakCreditDate}T00:00:00Z`);
    for (let i = 0; i < inputs.streakCreditValue; i++) {
      const dayMs = endMs - i * 86_400_000;
      const isoDate = new Date(dayMs).toISOString().slice(0, 10);
      activeSet.add(isoDate);
    }
  }

  const orderedDates = Array.from(activeSet).sort();
  if (orderedDates.length === 0) return 0;

  const groups: Array<{ streakLength: number; streakEnd: string }> = [];
  for (const dateStr of orderedDates) {
    const prev = groups[groups.length - 1];
    if (!prev) {
      groups.push({ streakLength: 1, streakEnd: dateStr });
    } else {
      const diffDays = Math.round(
        (Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${prev.streakEnd}T00:00:00Z`)) /
          86_400_000
      );
      if (diffDays === 1) {
        prev.streakLength += 1;
        prev.streakEnd = dateStr;
      } else {
        groups.push({ streakLength: 1, streakEnd: dateStr });
      }
    }
  }

  const cutoffMs = Date.parse(`${referenceCurrentDate}T00:00:00Z`) - 86_400_000;
  const eligible = groups
    .filter((g) => Date.parse(`${g.streakEnd}T00:00:00Z`) >= cutoffMs)
    .sort((a, b) => b.streakEnd.localeCompare(a.streakEnd));

  return eligible.length > 0 ? eligible[0].streakLength : 0;
}

/**
 * In-memory specification model of `public.calculate_user_streak(target_user_id uuid)`
 * as defined in `20261013123000_harden_calculate_user_streak_privacy.sql`.
 */
function evaluateCalculateUserStreakSpec(params: {
  callerRole: CallerRole;
  callerId: string | null;
  targetUserId: string | null;
  profiles: MockProfile[];
  friendships: MockFriendship[];
  streakDataByUser: Record<string, MockStreakInputs>;
  referenceCurrentDate: string;
}): number {
  if (params.callerRole !== 'authenticated') {
    throw new Error('42501: permission denied for function calculate_user_streak');
  }

  if (!params.callerId || !params.targetUserId) {
    return 0;
  }

  const targetProfile = params.profiles.find((p) => p.id === params.targetUserId);
  if (!targetProfile) {
    return 0;
  }

  const isSelf = params.callerId === params.targetUserId;
  const isAcceptedFriend = params.friendships.some(
    (f) =>
      f.status === 'accepted' &&
      ((f.requester_id === params.callerId && f.addressee_id === params.targetUserId) ||
        (f.addressee_id === params.callerId && f.requester_id === params.targetUserId))
  );

  if (!isSelf && !isAcceptedFriend) {
    return 0;
  }

  return computeStreakFromInputs(
    params.streakDataByUser[params.targetUserId],
    params.referenceCurrentDate
  );
}

describe('Phase 1B.2 — Static SQL Contract Tests for calculate_user_streak Migration (Not Live DB Proof)', () => {
  const sql = hardenedMigrationSql.replace(/\r\n/g, '\n');
  const baselineSql = baselineStreakMigrationSql.replace(/\r\n/g, '\n');

  it('preserves the exact function signature, int return type, SECURITY DEFINER, STABLE, and empty search_path', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.calculate_user_streak(target_user_id uuid)'
    );
    expect(sql).toContain('RETURNS int');
    expect(sql).toContain('LANGUAGE plpgsql');
    expect(sql).toContain('STABLE');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
  });

  it('uses schema-qualified references for all tables and auth functions', () => {
    expect(sql).toContain('FROM public.profiles p');
    expect(sql).toContain('FROM public.friendships f');
    expect(sql).toContain('FROM public.task_completions');
    expect(sql).toContain('FROM public.daily_data');
    expect(sql).toContain('FROM public.user_stats');
    expect(sql).toContain('auth.uid()');
  });

  it('enforces authenticated caller, target existence, and self-or-accepted-friend authorization before calculating streak', () => {
    expect(sql).toContain('IF v_caller_id IS NULL OR target_user_id IS NULL THEN');
    expect(sql).toMatch(
      /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.profiles\s+p\s+WHERE\s+p\.id\s*=\s*target_user_id\s*\)\s+THEN\s+RETURN\s+0;/i
    );
    expect(sql).toMatch(
      /IF\s+v_caller_id\s*!=\s*target_user_id\s+AND\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.friendships\s+f\s+WHERE\s+f\.status\s*=\s*'accepted'\s+AND\s*\(\s*\(f\.requester_id\s*=\s*v_caller_id\s+AND\s+f\.addressee_id\s*=\s*target_user_id\)\s+OR\s+\(f\.addressee_id\s*=\s*v_caller_id\s+AND\s+f\.requester_id\s*=\s*target_user_id\)\s*\)\s*\)\s+THEN\s+RETURN\s+0;/i
    );
  });

  it('does not introduce a blanket pg_trigger_depth() or service_role authorization bypass', () => {
    expect(sql).not.toMatch(/pg_trigger_depth/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*'role'/i);
  });

  it('preserves the existing streak calculation CTE body verbatim from 20261009204500_implement_streak_baseline_framework.sql', () => {
    const extractCteBlock = (source: string) => {
      const start = source.indexOf('WITH user_active_dates AS (');
      const end = source.indexOf('RETURN COALESCE(v_streak, 0);');
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end + 'RETURN COALESCE(v_streak, 0);'.length).trim();
    };

    const baselineCte = extractCteBlock(baselineSql);
    const hardenedCte = extractCteBlock(sql);
    expect(hardenedCte).toBe(baselineCte);
  });

  it('explicitly revokes execution from PUBLIC and anon and grants EXECUTE only to authenticated', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM PUBLIC;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.calculate_user_streak(uuid) FROM anon;');
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.calculate_user_streak(uuid) TO authenticated;'
    );
    expect(sql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.calculate_user_streak[\s\S]*?\banon\b/i
    );
  });
});

describe('Phase 1B.2 — In-Memory Authorization & Streak Specification Tests', () => {
  const PUBLIC_USER_ID = '11111111-1111-4111-8111-111111111111';
  const FRIENDS_ONLY_USER_ID = '22222222-2222-4222-8222-222222222222';
  const PRIVATE_USER_ID = '33333333-3333-4333-8333-333333333333';
  const FRIEND_CALLER_ID = '44444444-4444-4444-8444-444444444444';
  const STRANGER_CALLER_ID = '55555555-5555-4555-8555-555555555555';
  const MISSING_USER_ID = '99999999-9999-4999-8999-999999999999';

  const TODAY = '2026-10-13';

  const profiles: MockProfile[] = [
    { id: PUBLIC_USER_ID, visibility: 'public', activity_visibility: 'public' },
    { id: FRIENDS_ONLY_USER_ID, visibility: 'friends', activity_visibility: 'friends' },
    { id: PRIVATE_USER_ID, visibility: 'private', activity_visibility: 'private' },
    { id: FRIEND_CALLER_ID, visibility: 'public', activity_visibility: 'public' },
    { id: STRANGER_CALLER_ID, visibility: 'public', activity_visibility: 'public' },
  ];

  const streakDataByUser: Record<string, MockStreakInputs> = {
    [PUBLIC_USER_ID]: {
      completedDates: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'],
      manualCompletionDates: [],
    },
    [FRIENDS_ONLY_USER_ID]: {
      completedDates: ['2026-10-11', '2026-10-12'],
      manualCompletionDates: ['2026-10-13'],
    },
    [PRIVATE_USER_ID]: {
      completedDates: ['2026-10-12', '2026-10-13'],
      manualCompletionDates: [],
      streakCreditValue: 5,
      streakCreditDate: '2026-10-11',
    },
  };

  it('1. Self-access returns the authentic streak for public, friends-only, and private profiles', () => {
    expect(
      evaluateCalculateUserStreakSpec({
        callerRole: 'authenticated',
        callerId: PUBLIC_USER_ID,
        targetUserId: PUBLIC_USER_ID,
        profiles,
        friendships: [],
        streakDataByUser,
        referenceCurrentDate: TODAY,
      })
    ).toBe(4);

    expect(
      evaluateCalculateUserStreakSpec({
        callerRole: 'authenticated',
        callerId: FRIENDS_ONLY_USER_ID,
        targetUserId: FRIENDS_ONLY_USER_ID,
        profiles,
        friendships: [],
        streakDataByUser,
        referenceCurrentDate: TODAY,
      })
    ).toBe(3);

    // Private profile owner also gets their full streak including credited baseline days (5 + 2 = 7)
    expect(
      evaluateCalculateUserStreakSpec({
        callerRole: 'authenticated',
        callerId: PRIVATE_USER_ID,
        targetUserId: PRIVATE_USER_ID,
        profiles,
        friendships: [],
        streakDataByUser,
        referenceCurrentDate: TODAY,
      })
    ).toBe(7);
  });

  it('2. Accepted friendship in both directions (requester -> addressee and addressee -> requester) returns the target streak', () => {
    for (const friendship of [
      { requester_id: FRIEND_CALLER_ID, addressee_id: PUBLIC_USER_ID, status: 'accepted' as const },
      { requester_id: PUBLIC_USER_ID, addressee_id: FRIEND_CALLER_ID, status: 'accepted' as const },
    ]) {
      expect(
        evaluateCalculateUserStreakSpec({
          callerRole: 'authenticated',
          callerId: FRIEND_CALLER_ID,
          targetUserId: PUBLIC_USER_ID,
          profiles,
          friendships: [friendship],
          streakDataByUser,
          referenceCurrentDate: TODAY,
        })
      ).toBe(4);
    }
  });

  it('3. Pending, declined, and cancelled friendships return 0 without leaking the target streak', () => {
    for (const status of ['pending', 'declined', 'cancelled'] as FriendshipStatus[]) {
      for (const friendship of [
        { requester_id: FRIEND_CALLER_ID, addressee_id: PUBLIC_USER_ID, status },
        { requester_id: PUBLIC_USER_ID, addressee_id: FRIEND_CALLER_ID, status },
      ]) {
        expect(
          evaluateCalculateUserStreakSpec({
            callerRole: 'authenticated',
            callerId: FRIEND_CALLER_ID,
            targetUserId: PUBLIC_USER_ID,
            profiles,
            friendships: [friendship],
            streakDataByUser,
            referenceCurrentDate: TODAY,
          })
        ).toBe(0);
      }
    }
  });

  it('4. Stranger access returns 0 for public, friends-only, and private targets, as well as missing targets', () => {
    for (const targetId of [
      PUBLIC_USER_ID,
      FRIENDS_ONLY_USER_ID,
      PRIVATE_USER_ID,
      MISSING_USER_ID,
    ]) {
      expect(
        evaluateCalculateUserStreakSpec({
          callerRole: 'authenticated',
          callerId: STRANGER_CALLER_ID,
          targetUserId: targetId,
          profiles,
          friendships: [],
          streakDataByUser,
          referenceCurrentDate: TODAY,
        })
      ).toBe(0);
    }
  });

  it('5. Private and friends-only targets block strangers and pending requests while permitting accepted friends', () => {
    for (const target of [
      { id: FRIENDS_ONLY_USER_ID, expectedStreak: 3 },
      { id: PRIVATE_USER_ID, expectedStreak: 7 },
    ]) {
      // Blocked for pending request
      expect(
        evaluateCalculateUserStreakSpec({
          callerRole: 'authenticated',
          callerId: FRIEND_CALLER_ID,
          targetUserId: target.id,
          profiles,
          friendships: [
            { requester_id: FRIEND_CALLER_ID, addressee_id: target.id, status: 'pending' },
          ],
          streakDataByUser,
          referenceCurrentDate: TODAY,
        })
      ).toBe(0);

      // Permitted once accepted
      expect(
        evaluateCalculateUserStreakSpec({
          callerRole: 'authenticated',
          callerId: FRIEND_CALLER_ID,
          targetUserId: target.id,
          profiles,
          friendships: [
            { requester_id: FRIEND_CALLER_ID, addressee_id: target.id, status: 'accepted' },
          ],
          streakDataByUser,
          referenceCurrentDate: TODAY,
        })
      ).toBe(target.expectedStreak);
    }
  });

  it('6. Anonymous and PUBLIC execution are rejected with permission denied', () => {
    for (const disallowedRole of ['anon', 'public_unprivileged_role'] as CallerRole[]) {
      expect(() =>
        evaluateCalculateUserStreakSpec({
          callerRole: disallowedRole,
          callerId: null,
          targetUserId: PUBLIC_USER_ID,
          profiles,
          friendships: [],
          streakDataByUser,
          referenceCurrentDate: TODAY,
        })
      ).toThrow(/42501: permission denied for function calculate_user_streak/);
    }
  });
});
