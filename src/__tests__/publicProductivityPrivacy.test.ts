// @vitest-environment node
/**
 * Scope Notice:
 * No local PostgreSQL/Supabase instance is installed in this environment, and
 * DDL/DML execution against the live Supabase project is strictly prohibited.
 *
 * Therefore, this test file is divided into:
 *   1. Static SQL Migration Verification — inspects the exact SQL text of
 *      `supabase/migrations/20261013000000_fix_public_productivity_privacy.sql`
 *      for signature compatibility, `SECURITY DEFINER` search_path hardening,
 *      explicit `('private', 'friends', 'public')` constraint verification,
 *      branch structure, sargable bounds, and role privileges.
 *   2. In-Memory Specification & Frontend Consumer Contract Tests — verifies
 *      the constraint-validation state machine, visibility/friendship decision
 *      logic, and frontend heatmap compatibility (`getDayCompletionInfo` in
 *      `src/lib/dataManager.ts` and `usePublicProductivityData` contract)
 *      against synthetic fixtures.
 *
 * Live PostgreSQL execution of the migration and RPC authorization must still
 * be verified on an isolated staging database before production deployment.
 */
import { describe, it, expect } from 'vitest';
import migrationSql from '../../supabase/migrations/20261013034310_fix_public_productivity_privacy.sql?raw';
import {
  getDayCompletionInfo,
  getHeatmapDayCellModel,
  type AppData,
  type DailyData,
  type Task,
} from '../lib/dataManager';

type Visibility = 'private' | 'friends' | 'public';
type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

interface MockProfile {
  id: string;
  visibility: Visibility | null;
  activity_visibility: Visibility | null;
}

interface MockFriendship {
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
}

interface MockTask {
  id: string;
  user_id: string;
  name: string;
  description: string;
  icon: string;
  recurring: string;
  created_at: string;
}

interface MockCompletion {
  user_id: string;
  task_id: string;
  completed_date: string;
}

interface MockDailyRow {
  user_id: string;
  date: string;
  note: string;
  manual_completion: boolean;
}

/**
 * In-memory specification model of the DO block that validates existing rows
 * and CHECK constraints on `public.profiles.activity_visibility`.
 */
function evaluateConstraintMigrationState(params: {
  existingRowValues: Array<string | null>;
  existingConstraintDefs: Array<{ conname: string; condef: string }>;
}): { action: 'add_constraint' | 'keep_existing' } {
  const ALLOWED = new Set(['private', 'friends', 'public']);

  for (const val of params.existingRowValues) {
    if (val !== null && !ALLOWED.has(val)) {
      throw new Error(
        'Existing public.profiles rows contain unexpected activity_visibility values outside (private, friends, public).'
      );
    }
  }

  const VALID_NORMALIZED_DEFS = new Set([
    "check ((activity_visibility = any (array['private'::text, 'friends'::text, 'public'::text])))",
    "check (activity_visibility = any (array['private'::text, 'friends'::text, 'public'::text]))",
    "check ((activity_visibility in ('private', 'friends', 'public')))",
    "check (activity_visibility in ('private', 'friends', 'public'))",
  ]);

  let hasValidConstraint = false;

  for (const con of params.existingConstraintDefs) {
    const normalized = con.condef.toLowerCase().replace(/\s+/g, ' ').trim();
    if (VALID_NORMALIZED_DEFS.has(normalized)) {
      hasValidConstraint = true;
    } else {
      throw new Error(
        `Unexpected CHECK constraint "${con.conname}" on public.profiles.activity_visibility: ${con.condef}`
      );
    }
  }

  return { action: hasValidConstraint ? 'keep_existing' : 'add_constraint' };
}

/**
 * In-memory specification model of `public.get_public_productivity`
 * in `20261013000000_fix_public_productivity_privacy.sql`.
 */
function evaluatePublicProductivitySpec(params: {
  callerRole: 'anon' | 'authenticated' | 'service_role' | 'public_unprivileged_role';
  callerId: string | null;
  targetUserId: string | null;
  targetYear: number | null;
  profiles: MockProfile[];
  friendships: MockFriendship[];
  tasks: MockTask[];
  completions: MockCompletion[];
  dailyData: MockDailyRow[];
}) {
  if (
    params.callerRole !== 'anon' &&
    params.callerRole !== 'authenticated' &&
    params.callerRole !== 'service_role'
  ) {
    throw new Error('42501: permission denied for function get_public_productivity');
  }

  if (!params.targetUserId) {
    return { error: 'user_not_found' };
  }

  const profile = params.profiles.find(p => p.id === params.targetUserId);
  if (!profile) {
    return { error: 'user_not_found' };
  }

  const vVisibility: Visibility = profile.visibility ?? 'public';
  const vActivityVisibility: Visibility = profile.activity_visibility ?? 'public';
  const vIsSelf = params.callerId !== null && params.callerId === params.targetUserId;

  if (!vIsSelf) {
    let vIsFriend = false;
    if (params.callerId !== null) {
      vIsFriend = params.friendships.some(
        f =>
          f.status === 'accepted' &&
          ((f.requester_id === params.callerId && f.addressee_id === params.targetUserId) ||
            (f.requester_id === params.targetUserId && f.addressee_id === params.callerId))
      );
    }

    if (vVisibility === 'private' || vActivityVisibility === 'private') {
      return { error: 'private' };
    }

    if ((vVisibility === 'friends' || vActivityVisibility === 'friends') && !vIsFriend) {
      return { error: 'friends_only' };
    }
  }

  if (params.targetYear === null || params.targetYear < 1900 || params.targetYear > 2100) {
    return { completions: [], daily_data: [] };
  }

  const startDate = `${params.targetYear}-01-01`;
  const endDate = `${params.targetYear}-12-31`;

  const countsByDate = new Map<string, number>();
  for (const c of params.completions) {
    if (
      c.user_id === params.targetUserId &&
      c.completed_date >= startDate &&
      c.completed_date <= endDate
    ) {
      countsByDate.set(c.completed_date, (countsByDate.get(c.completed_date) ?? 0) + 1);
    }
  }

  const aggregatedCompletions = Array.from(countsByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const filteredDailyData = params.dailyData
    .filter(
      d =>
        d.user_id === params.targetUserId &&
        d.date >= startDate &&
        d.date <= endDate &&
        d.manual_completion === true
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ date: d.date, manual_completion: d.manual_completion }));

  return {
    completions: aggregatedCompletions,
    daily_data: filteredDailyData,
  };
}

/**
 * Mirrors the response consumer logic in `src/hooks/usePublicProductivityData.ts`
 */
function transformRpcResponseToAppData(result: Record<string, any>): {
  data: AppData | null;
  error: string | null;
} {
  if (result && result.error) {
    return { data: null, error: result.error };
  }

  const dbTasks = result.tasks || [];
  const dbCompletions = result.completions || [];
  const dbDailyData = result.daily_data || [];

  const recurringTasks: Task[] = [];
  const days: Record<string, DailyData> = {};

  for (const t of dbTasks) {
    const task: Task = {
      id: t.id,
      name: 'Private Task',
      description: t.description,
      recurring: t.recurring,
      createdAt: t.created_at?.split('T')[0] || '',
    };

    if (task.recurring && task.recurring !== 'none') {
      recurringTasks.push(task);
    } else {
      const date = task.createdAt;
      if (date) {
        if (!days[date]) days[date] = { tasks: [], completedTaskIds: [], manualCompletion: false };
        days[date].tasks.push(task);
      }
    }
  }

  for (const d of dbDailyData) {
    if (!days[d.date]) days[d.date] = { tasks: [], completedTaskIds: [], manualCompletion: false };
    days[d.date].manualCompletion = d.manual_completion;
  }

  for (const c of dbCompletions) {
    const date = c.date || c.completed_date;
    if (!date) continue;
    if (!days[date]) days[date] = { tasks: [], completedTaskIds: [], manualCompletion: false };
    if (!days[date].completedTaskIds) days[date].completedTaskIds = [];

    if (typeof c.count === 'number') {
      for (let i = 0; i < c.count; i++) {
        days[date].completedTaskIds.push(`agg-${date}-${i}`);
        days[date].tasks.push({
          id: `agg-${date}-${i}`,
          name: 'Completed Task',
          recurring: 'none',
          createdAt: date,
        });
      }
    } else if (c.task_id) {
      days[date].completedTaskIds.push(c.task_id);
    }
  }

  return {
    data: {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks,
      days,
    },
    error: null,
  };
}

describe('Step 3A — Static SQL Migration Verification (Not Live DB Execution)', () => {
  const sql = migrationSql.replace(/\r\n/g, '\n');

  it('aligns profiles.visibility default to public without bulk updating existing visibility values or dropping constraints', () => {
    expect(sql).toContain("ALTER TABLE public.profiles ALTER COLUMN visibility SET DEFAULT 'public';");
    expect(sql).not.toMatch(/\bSET\s+visibility\s*=/i);
    expect(sql).not.toMatch(/\bDROP\s+CONSTRAINT\b/i);
  });

  it('adds profiles.activity_visibility idempotently with safe default and NULL backfill', () => {
    expect(sql).toContain('ALTER TABLE public.profiles');
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS activity_visibility text DEFAULT 'public'");
    expect(sql).toContain("ALTER COLUMN activity_visibility SET DEFAULT 'public'");
    expect(sql).toContain(
      "UPDATE public.profiles\nSET activity_visibility = 'public'\nWHERE activity_visibility IS NULL;"
    );
  });

  it('verifies exact allowed constraint values (private, friends, public) and raises on incompatible constraints or rows', () => {
    expect(sql).toContain("AND activity_visibility NOT IN ('private', 'friends', 'public')");
    expect(sql).toContain(
      "'check ((activity_visibility = any (array[''private''::text, ''friends''::text, ''public''::text])))'"
    );
    expect(sql).toContain(
      'Unexpected CHECK constraint "%" on public.profiles.activity_visibility: %'
    );
    expect(sql).toContain("CHECK (activity_visibility IN ('private', 'friends', 'public'))");
  });

  it('preserves exact RPC signature and jsonb return type with hardened SECURITY DEFINER settings', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.get_public_productivity(target_user_id UUID, target_year INT)'
    );
    expect(sql).toContain('RETURNS jsonb');
    expect(sql).toContain('STABLE');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
  });

  it('enforces nonexistent-user, self-access, bidirectional accepted friendship, and visibility branches in SQL', () => {
    expect(sql).toContain("RETURN jsonb_build_object('error', 'user_not_found');");
    expect(sql).toContain('v_is_self := (v_caller_id IS NOT NULL AND v_caller_id = target_user_id);');
    expect(sql).toContain("WHERE f.status = 'accepted'");
    expect(sql).toContain('(f.requester_id = v_caller_id AND f.addressee_id = target_user_id)');
    expect(sql).toContain('(f.requester_id = target_user_id AND f.addressee_id = v_caller_id)');
    expect(sql).toContain("IF v_visibility = 'private' OR v_activity_visibility = 'private' THEN");
    expect(sql).toContain("RETURN jsonb_build_object('error', 'private');");
    expect(sql).toContain(
      "IF (v_visibility = 'friends' OR v_activity_visibility = 'friends') AND NOT v_is_friend THEN"
    );
    expect(sql).toContain("RETURN jsonb_build_object('error', 'friends_only');");
  });

  it('never references public.tasks, sanitize_task_description, daily notes, or legacy receiver_id', () => {
    expect(sql).not.toMatch(/FROM\s+public\.tasks/i);
    expect(sql).not.toMatch(/sanitize_task_description/i);
    expect(sql).not.toMatch(/receiver_id/i);
    expect(sql).not.toMatch(/\.note\b/i);
  });

  it('uses sargable make_date bounds, filters manual_completion IS TRUE, and explicitly grants to anon, authenticated, and service_role', () => {
    expect(sql).toContain('make_date(target_year, 1, 1)');
    expect(sql).toContain('make_date(target_year, 12, 31)');
    expect(sql).toContain('AND d.manual_completion IS TRUE');
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.get_public_productivity(UUID, INT) FROM PUBLIC;'
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_public_productivity(UUID, INT) TO anon, authenticated, service_role;'
    );
  });
});

describe('Step 3A — Specification Model & Frontend Consumer Contract Tests (Synthetic Fixtures)', () => {
  const TARGET_USER_ID = '11111111-1111-4111-8111-111111111111';
  const FRIEND_USER_ID = '22222222-2222-4222-8222-222222222222';
  const STRANGER_USER_ID = '33333333-3333-4333-8333-333333333333';

  const sampleTasks: MockTask[] = [
    {
      id: 'task-secret-uuid-1',
      user_id: TARGET_USER_ID,
      name: 'Confidential Therapy Appointment',
      description: '{"status":"active","startTime":"14:00","rrule":"FREQ=WEEKLY;BYDAY=MO"}',
      icon: 'Heart',
      recurring: 'custom',
      created_at: '2026-01-10T09:00:00Z',
    },
    {
      id: 'task-secret-uuid-2',
      user_id: TARGET_USER_ID,
      name: 'Review Legal Contract',
      description: 'Private client notes',
      icon: 'FileText',
      recurring: 'none',
      created_at: '2026-03-15T10:00:00Z',
    },
  ];

  const sampleCompletions: MockCompletion[] = [
    { user_id: TARGET_USER_ID, task_id: 'task-secret-uuid-1', completed_date: '2026-03-15' },
    { user_id: TARGET_USER_ID, task_id: 'task-secret-uuid-2', completed_date: '2026-03-15' },
    { user_id: TARGET_USER_ID, task_id: 'task-secret-uuid-1', completed_date: '2026-03-16' },
    { user_id: TARGET_USER_ID, task_id: 'task-secret-uuid-1', completed_date: '2025-12-31' },
  ];

  const sampleDailyData: MockDailyRow[] = [
    {
      user_id: TARGET_USER_ID,
      date: '2026-03-17',
      note: 'Private journal entry on a manual completion day',
      manual_completion: true,
    },
    {
      user_id: TARGET_USER_ID,
      date: '2026-03-18',
      note: 'Secret diary note on a day where manual_completion is false',
      manual_completion: false,
    },
  ];

  it('0. Constraint verification handles missing, valid baseline, and incompatible constraints safely', () => {
    // Missing constraint -> adds constraint
    expect(
      evaluateConstraintMigrationState({
        existingRowValues: ['public', 'private', 'friends'],
        existingConstraintDefs: [],
      })
    ).toEqual({ action: 'add_constraint' });

    // Canonical PostgreSQL deparsed baseline constraint -> keeps existing without duplicate error
    expect(
      evaluateConstraintMigrationState({
        existingRowValues: ['public'],
        existingConstraintDefs: [
          {
            conname: 'profiles_activity_visibility_check',
            condef:
              "CHECK ((activity_visibility = ANY (ARRAY['private'::text, 'friends'::text, 'public'::text])))",
          },
        ],
      })
    ).toEqual({ action: 'keep_existing' });

    // Incompatible constraint permitting unexpected values -> raises explicit error
    expect(() =>
      evaluateConstraintMigrationState({
        existingRowValues: ['public'],
        existingConstraintDefs: [
          {
            conname: 'profiles_activity_visibility_check',
            condef:
              "CHECK ((activity_visibility = ANY (ARRAY['public'::text, 'everyone'::text])))",
          },
        ],
      })
    ).toThrow(/Unexpected CHECK constraint "profiles_activity_visibility_check"/);

    // Existing row with invalid value -> raises explicit error without mutating user data
    expect(() =>
      evaluateConstraintMigrationState({
        existingRowValues: ['public', 'invalid_value'],
        existingConstraintDefs: [],
      })
    ).toThrow(/unexpected activity_visibility values/);
  });

  it('1. Public profile specification exposes only aggregate productivity data', () => {
    const response = evaluatePublicProductivitySpec({
      callerRole: 'anon',
      callerId: null,
      targetUserId: TARGET_USER_ID,
      targetYear: 2026,
      profiles: [{ id: TARGET_USER_ID, visibility: 'public', activity_visibility: 'public' }],
      friendships: [],
      tasks: sampleTasks,
      completions: sampleCompletions,
      dailyData: sampleDailyData,
    });

    expect(response).toEqual({
      completions: [
        { date: '2026-03-15', count: 2 },
        { date: '2026-03-16', count: 1 },
      ],
      daily_data: [{ date: '2026-03-17', manual_completion: true }],
    });
  });

  it('2. Private profile specification blocks unauthorized callers and permits self-access', () => {
    for (const caller of [
      { role: 'anon' as const, id: null },
      { role: 'authenticated' as const, id: STRANGER_USER_ID },
      { role: 'authenticated' as const, id: FRIEND_USER_ID },
    ]) {
      expect(
        evaluatePublicProductivitySpec({
          callerRole: caller.role,
          callerId: caller.id,
          targetUserId: TARGET_USER_ID,
          targetYear: 2026,
          profiles: [{ id: TARGET_USER_ID, visibility: 'public', activity_visibility: 'private' }],
          friendships: [
            { requester_id: FRIEND_USER_ID, addressee_id: TARGET_USER_ID, status: 'accepted' },
          ],
          tasks: sampleTasks,
          completions: sampleCompletions,
          dailyData: sampleDailyData,
        })
      ).toEqual({ error: 'private' });

      expect(
        evaluatePublicProductivitySpec({
          callerRole: caller.role,
          callerId: caller.id,
          targetUserId: TARGET_USER_ID,
          targetYear: 2026,
          profiles: [{ id: TARGET_USER_ID, visibility: 'private', activity_visibility: 'public' }],
          friendships: [
            { requester_id: FRIEND_USER_ID, addressee_id: TARGET_USER_ID, status: 'accepted' },
          ],
          tasks: sampleTasks,
          completions: sampleCompletions,
          dailyData: sampleDailyData,
        })
      ).toEqual({ error: 'private' });
    }

    const selfRes = evaluatePublicProductivitySpec({
      callerRole: 'authenticated',
      callerId: TARGET_USER_ID,
      targetUserId: TARGET_USER_ID,
      targetYear: 2026,
      profiles: [{ id: TARGET_USER_ID, visibility: 'private', activity_visibility: 'private' }],
      friendships: [],
      tasks: sampleTasks,
      completions: sampleCompletions,
      dailyData: sampleDailyData,
    });
    expect(selfRes).toHaveProperty('completions');
    expect(selfRes).not.toHaveProperty('error');
  });

  it('3. Friends-only specification enforces bidirectional accepted friendship rules', () => {
    const friendsOnlyProfile: MockProfile = {
      id: TARGET_USER_ID,
      visibility: 'public',
      activity_visibility: 'friends',
    };

    expect(
      evaluatePublicProductivitySpec({
        callerRole: 'anon',
        callerId: null,
        targetUserId: TARGET_USER_ID,
        targetYear: 2026,
        profiles: [friendsOnlyProfile],
        friendships: [],
        tasks: sampleTasks,
        completions: sampleCompletions,
        dailyData: sampleDailyData,
      })
    ).toEqual({ error: 'friends_only' });

    for (const status of ['pending', 'declined', 'cancelled'] as FriendshipStatus[]) {
      expect(
        evaluatePublicProductivitySpec({
          callerRole: 'authenticated',
          callerId: FRIEND_USER_ID,
          targetUserId: TARGET_USER_ID,
          targetYear: 2026,
          profiles: [friendsOnlyProfile],
          friendships: [
            { requester_id: FRIEND_USER_ID, addressee_id: TARGET_USER_ID, status },
          ],
          tasks: sampleTasks,
          completions: sampleCompletions,
          dailyData: sampleDailyData,
        })
      ).toEqual({ error: 'friends_only' });
    }

    for (const friendship of [
      { requester_id: FRIEND_USER_ID, addressee_id: TARGET_USER_ID, status: 'accepted' as const },
      { requester_id: TARGET_USER_ID, addressee_id: FRIEND_USER_ID, status: 'accepted' as const },
    ]) {
      const allowedRes = evaluatePublicProductivitySpec({
        callerRole: 'authenticated',
        callerId: FRIEND_USER_ID,
        targetUserId: TARGET_USER_ID,
        targetYear: 2026,
        profiles: [friendsOnlyProfile],
        friendships: [friendship],
        tasks: sampleTasks,
        completions: sampleCompletions,
        dailyData: sampleDailyData,
      });
      expect(allowedRes).not.toHaveProperty('error');
      expect(allowedRes.completions).toHaveLength(2);
    }
  });

  it('4. Nonexistent users return user_not_found without revealing records', () => {
    const resUnknown = evaluatePublicProductivitySpec({
      callerRole: 'anon',
      callerId: null,
      targetUserId: '99999999-9999-4999-8999-999999999999',
      targetYear: 2026,
      profiles: [{ id: TARGET_USER_ID, visibility: 'public', activity_visibility: 'public' }],
      friendships: [],
      tasks: sampleTasks,
      completions: sampleCompletions,
      dailyData: sampleDailyData,
    });
    expect(resUnknown).toEqual({ error: 'user_not_found' });
  });

  it('5. Response payload omits task IDs, descriptions, recurrence rules, raw completions, and daily notes', () => {
    const response = evaluatePublicProductivitySpec({
      callerRole: 'authenticated',
      callerId: STRANGER_USER_ID,
      targetUserId: TARGET_USER_ID,
      targetYear: 2026,
      profiles: [{ id: TARGET_USER_ID, visibility: 'public', activity_visibility: 'public' }],
      friendships: [],
      tasks: sampleTasks,
      completions: sampleCompletions,
      dailyData: sampleDailyData,
    });

    const serialized = JSON.stringify(response);
    expect(response).not.toHaveProperty('tasks');
    expect(serialized).not.toContain('task-secret-uuid-1');
    expect(serialized).not.toContain('task-secret-uuid-2');
    expect(serialized).not.toContain('Confidential Therapy Appointment');
    expect(serialized).not.toContain('Review Legal Contract');
    expect(serialized).not.toContain('FREQ=WEEKLY');
    expect(serialized).not.toContain('task_id');
    expect(serialized).not.toContain('Private journal entry');
    expect(serialized).not.toContain('Secret diary note');
    expect(serialized).not.toContain('2026-03-18');
  });

  it('6. Intended roles (anon, authenticated, service_role) are permitted while unprivileged roles are rejected', () => {
    for (const allowedRole of ['anon', 'authenticated', 'service_role'] as const) {
      const res = evaluatePublicProductivitySpec({
        callerRole: allowedRole,
        callerId: null,
        targetUserId: TARGET_USER_ID,
        targetYear: 2026,
        profiles: [{ id: TARGET_USER_ID, visibility: 'public', activity_visibility: 'public' }],
        friendships: [],
        tasks: sampleTasks,
        completions: sampleCompletions,
        dailyData: sampleDailyData,
      });
      expect(res).toHaveProperty('completions');
    }

    expect(() =>
      evaluatePublicProductivitySpec({
        callerRole: 'public_unprivileged_role',
        callerId: null,
        targetUserId: TARGET_USER_ID,
        targetYear: 2026,
        profiles: [{ id: TARGET_USER_ID, visibility: 'public', activity_visibility: 'public' }],
        friendships: [],
        tasks: sampleTasks,
        completions: sampleCompletions,
        dailyData: sampleDailyData,
      })
    ).toThrow(/permission denied for function get_public_productivity/);
  });

  it('7. Authorized public-profile heatmaps (getDayCompletionInfo) compute accurate cells from aggregated payload', () => {
    const rpcPayload = evaluatePublicProductivitySpec({
      callerRole: 'anon',
      callerId: null,
      targetUserId: TARGET_USER_ID,
      targetYear: 2026,
      profiles: [{ id: TARGET_USER_ID, visibility: 'public', activity_visibility: 'public' }],
      friendships: [],
      tasks: sampleTasks,
      completions: sampleCompletions,
      dailyData: sampleDailyData,
    });

    const { data, error } = transformRpcResponseToAppData(rpcPayload);
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    expect(getDayCompletionInfo(data!, '2026-03-15')).toEqual({
      completed: true,
      percent: 100,
      completedCount: 2,
      totalCount: 2,
    });

    expect(getDayCompletionInfo(data!, '2026-03-16')).toEqual({
      completed: true,
      percent: 100,
      completedCount: 1,
      totalCount: 1,
    });

    expect(getDayCompletionInfo(data!, '2026-03-17')).toEqual({
      completed: true,
      percent: 100,
      completedCount: 1,
      totalCount: 1,
    });

    expect(getDayCompletionInfo(data!, '2026-03-18')).toEqual({
      completed: false,
      percent: 0,
      completedCount: 0,
      totalCount: 0,
    });

    // Public-aggregated heatmap cell model (used by PublicProfilePage -> ContributionGraph)
    expect(getHeatmapDayCellModel(data!, '2026-03-15', 'public-aggregated')).toEqual({
      level: 2,
      completedCount: 2,
      totalCount: null,
      percent: null,
      manualCompletion: false,
    });

    expect(getHeatmapDayCellModel(data!, '2026-03-16', 'public-aggregated')).toEqual({
      level: 1,
      completedCount: 1,
      totalCount: null,
      percent: null,
      manualCompletion: false,
    });

    expect(getHeatmapDayCellModel(data!, '2026-03-17', 'public-aggregated')).toEqual({
      level: 1,
      completedCount: 0,
      totalCount: null,
      percent: null,
      manualCompletion: true,
    });

    expect(getHeatmapDayCellModel(data!, '2026-03-18', 'public-aggregated')).toEqual({
      level: 0,
      completedCount: 0,
      totalCount: null,
      percent: null,
      manualCompletion: false,
    });
  });

  it('8. Existing frontend consumer contract handles error and empty-year responses cleanly', () => {
    for (const errCode of ['private', 'friends_only', 'user_not_found']) {
      const transformed = transformRpcResponseToAppData({ error: errCode });
      expect(transformed.data).toBeNull();
      expect(transformed.error).toBe(errCode);
    }

    const emptyYear = transformRpcResponseToAppData({ completions: [], daily_data: [] });
    expect(emptyYear.error).toBeNull();
    expect(emptyYear.data?.days).toEqual({});
    expect(emptyYear.data?.recurringTasks).toEqual([]);
  });
});
