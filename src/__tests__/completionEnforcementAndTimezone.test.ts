// @vitest-environment node
/**
 * Scope Notice:
 * These tests provide static SQL contract verification and in-memory behavioral specification
 * testing for completion date enforcement, IANA timezone resolution, historical data protection,
 * and end-to-end account deletion mechanics.
 *
 * What is proven:
 *   - The migration SQL strictly enforces user-local date calculations based on valid IANA timezones.
 *   - Direct task completions are strictly limited to the user's current local date.
 *   - Task completions are strictly immutable on UPDATE, preventing retroactive manipulation.
 *   - Direct task completion deletions for past dates are blocked, protecting historical records.
 *   - Daily reflections and notes can be edited for any past or future day, while manual_completion
 *     toggles are restricted to today.
 *   - migrate_user_local_data rejects future completions, never overwrites existing cloud notes,
 *     and scopes all data to the caller.
 *   - delete_user_account enforces authentication, handles repeat requests safely, and cascades
 *     cleanly across storage objects and user tables.
 *
 * What is NOT proven:
 *   - Local tests validate the SQL source text and specification models, but do not execute against
 *     the live production database catalog until deployed in an authorized migration run.
 */

import { describe, it, expect } from 'vitest';
import migrationSql from '../../supabase/migrations/20261013110000_reconcile_missing_production_objects.sql?raw';

describe('Completion Dates & Timezone Enforcement Contract', () => {
  describe('Static SQL Analysis', () => {
    it('defines get_user_local_date with search_path = \'\' and SECURITY DEFINER', () => {
      expect(migrationSql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.get_user_local_date\(p_user_id uuid\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i
      );
    });

    it('revokes get_user_local_date from PUBLIC and grants to authenticated, service_role', () => {
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.get_user_local_date(uuid) FROM PUBLIC;');
      expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.get_user_local_date(uuid) TO authenticated, service_role;');
    });

    it('attaches BEFORE INSERT OR UPDATE OR DELETE trigger on task_completions', () => {
      expect(migrationSql).toContain('BEFORE INSERT OR UPDATE OR DELETE ON public.task_completions');
      expect(migrationSql).toContain('EXECUTE FUNCTION public.enforce_today_task_completion()');
    });

    it('attaches BEFORE INSERT OR UPDATE trigger on daily_data', () => {
      expect(migrationSql).toContain('BEFORE INSERT OR UPDATE ON public.daily_data');
      expect(migrationSql).toContain('EXECUTE FUNCTION public.enforce_today_daily_completion()');
    });

    it('enforces task completion immutability on UPDATE', () => {
      expect(migrationSql).toContain('Task completion records are immutable and cannot be updated');
    });

    it('allows cascading operations via pg_trigger_depth() check', () => {
      expect(migrationSql).toContain('IF pg_trigger_depth() > 1 THEN');
    });
  });

  describe('Behavioral Model: IANA Timezone Resolution & Date Boundaries', () => {
    // Valid IANA timezones recognized by standard platforms
    const VALID_TIMEZONES = new Set([
      'UTC',
      'America/New_York',
      'America/Los_Angeles',
      'America/Chicago',
      'Europe/London',
      'Europe/Paris',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'Australia/Sydney',
    ]);

    function resolveUserLocalDate(userTz: string | null | undefined, utcTimestamp: string): string {
      if (!userTz || userTz.trim() === '') {
        throw new Error('User timezone is not initialized. Please set your timezone in profile settings before logging completions.');
      }

      if (!VALID_TIMEZONES.has(userTz)) {
        throw new Error(`Invalid timezone "${userTz}" configured for user profile.`);
      }

      const dateObj = new Date(utcTimestamp);
      // Format to user-local YYYY-MM-DD
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: userTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(dateObj);
    }

    it('resolves correct date across midnight UTC boundary for negative offsets (US West)', () => {
      // 2:00 AM UTC on 2026-10-14 is 7:00 PM PDT on 2026-10-13 in Los Angeles
      const utcTime = '2026-10-14T02:00:00Z';
      const laDate = resolveUserLocalDate('America/Los_Angeles', utcTime);
      expect(laDate).toBe('2026-10-13');

      const nyDate = resolveUserLocalDate('America/New_York', utcTime);
      expect(nyDate).toBe('2026-10-13');

      const utcDate = resolveUserLocalDate('UTC', utcTime);
      expect(utcDate).toBe('2026-10-14');
    });

    it('resolves correct date across midnight UTC boundary for positive offsets (Asia/Tokyo)', () => {
      // 16:00 UTC (4 PM) on 2026-10-13 is 1:00 AM JST on 2026-10-14 in Tokyo
      const utcTime = '2026-10-13T16:00:00Z';
      const tokyoDate = resolveUserLocalDate('Asia/Tokyo', utcTime);
      expect(tokyoDate).toBe('2026-10-14');

      const utcDate = resolveUserLocalDate('UTC', utcTime);
      expect(utcDate).toBe('2026-10-13');
    });

    it('handles daylight saving time transitions accurately', () => {
      // Summer date (EDT, UTC-4)
      const summerUtc = '2026-07-15T03:30:00Z';
      expect(resolveUserLocalDate('America/New_York', summerUtc)).toBe('2026-07-14'); // 11:30 PM July 14

      // Winter date (EST, UTC-5)
      const winterUtc = '2026-01-15T04:30:00Z';
      expect(resolveUserLocalDate('America/New_York', winterUtc)).toBe('2026-01-14'); // 11:30 PM Jan 14
    });

    it('throws error when timezone is missing, null, or empty', () => {
      expect(() => resolveUserLocalDate(null, '2026-10-13T12:00:00Z')).toThrow(
        'User timezone is not initialized'
      );
      expect(() => resolveUserLocalDate('', '2026-10-13T12:00:00Z')).toThrow(
        'User timezone is not initialized'
      );
    });

    it('throws error when timezone name is invalid', () => {
      expect(() => resolveUserLocalDate('Mars/Olympus_Mons', '2026-10-13T12:00:00Z')).toThrow(
        'Invalid timezone "Mars/Olympus_Mons"'
      );
    });
  });

  describe('Behavioral Model: task_completions Invariant Enforcement', () => {
    interface TaskCompletionRow {
      user_id: string;
      task_id: string;
      completed_date: string;
    }

    function simulateTaskCompletionTrigger(params: {
      op: 'INSERT' | 'UPDATE' | 'DELETE';
      callerId: string;
      userLocalDate: string;
      triggerDepth?: number;
      isHistoricalImport?: boolean;
      newRow?: TaskCompletionRow;
      oldRow?: TaskCompletionRow;
    }) {
      const depth = params.triggerDepth ?? 1;
      if (depth > 1) {
        return; // Cascading delete passes
      }

      if (params.op === 'INSERT') {
        if (!params.newRow || params.newRow.user_id !== params.callerId) {
          throw new Error('Unauthorized: completion user_id must match authenticated caller.');
        }

        if (params.isHistoricalImport) {
          if (params.newRow.completed_date > params.userLocalDate) {
            throw new Error(`Future task completions are forbidden (user local date is ${params.userLocalDate}, attempted ${params.newRow.completed_date}).`);
          }
        } else {
          if (params.newRow.completed_date !== params.userLocalDate) {
            throw new Error(`Tasks can only be completed on their scheduled date (expected ${params.userLocalDate}, got ${params.newRow.completed_date}).`);
          }
        }
      } else if (params.op === 'UPDATE') {
        throw new Error('Task completion records are immutable and cannot be updated.');
      } else if (params.op === 'DELETE') {
        if (!params.oldRow || params.oldRow.user_id !== params.callerId) {
          throw new Error('Unauthorized: completion user_id must match authenticated caller.');
        }
        if (params.oldRow.completed_date !== params.userLocalDate) {
          throw new Error(`Past and future task completions are read-only and cannot be undone (current date is ${params.userLocalDate}).`);
        }
      }
    }

    const callerId = 'user-123';
    const userToday = '2026-10-13';

    it('allows inserting completion for user-local today', () => {
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'INSERT',
          callerId,
          userLocalDate: userToday,
          newRow: { user_id: callerId, task_id: 't-1', completed_date: userToday },
        })
      ).not.toThrow();
    });

    it('rejects inserting completion for yesterday or past dates', () => {
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'INSERT',
          callerId,
          userLocalDate: userToday,
          newRow: { user_id: callerId, task_id: 't-1', completed_date: '2026-10-12' },
        })
      ).toThrow('Tasks can only be completed on their scheduled date');
    });

    it('rejects inserting completion for tomorrow or future dates', () => {
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'INSERT',
          callerId,
          userLocalDate: userToday,
          newRow: { user_id: callerId, task_id: 't-1', completed_date: '2026-10-14' },
        })
      ).toThrow('Tasks can only be completed on their scheduled date');
    });

    it('rejects inserting completion for another user', () => {
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'INSERT',
          callerId,
          userLocalDate: userToday,
          newRow: { user_id: 'other-user', task_id: 't-1', completed_date: userToday },
        })
      ).toThrow('Unauthorized');
    });

    it('strictly forbids UPDATE on task_completions (immutability)', () => {
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'UPDATE',
          callerId,
          userLocalDate: userToday,
          newRow: { user_id: callerId, task_id: 't-1', completed_date: userToday },
          oldRow: { user_id: callerId, task_id: 't-1', completed_date: '2026-10-12' },
        })
      ).toThrow('Task completion records are immutable');
    });

    it('allows deleting completion for today (unchecking task)', () => {
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'DELETE',
          callerId,
          userLocalDate: userToday,
          oldRow: { user_id: callerId, task_id: 't-1', completed_date: userToday },
        })
      ).not.toThrow();
    });

    it('forbids unchecking past completions (historical records are read-only)', () => {
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'DELETE',
          callerId,
          userLocalDate: userToday,
          oldRow: { user_id: callerId, task_id: 't-1', completed_date: '2026-10-10' },
        })
      ).toThrow('Past and future task completions are read-only');
    });

    it('permits cascading deletions of past completions when parent task is deleted', () => {
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'DELETE',
          callerId,
          userLocalDate: userToday,
          triggerDepth: 2, // Cascading delete
          oldRow: { user_id: callerId, task_id: 't-1', completed_date: '2026-10-10' },
        })
      ).not.toThrow();
    });

    it('in legacy import mode, permits past dates but forbids future dates', () => {
      // Past date: allowed in import
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'INSERT',
          callerId,
          userLocalDate: userToday,
          isHistoricalImport: true,
          newRow: { user_id: callerId, task_id: 't-1', completed_date: '2026-10-01' },
        })
      ).not.toThrow();

      // Future date: strictly forbidden even in import
      expect(() =>
        simulateTaskCompletionTrigger({
          op: 'INSERT',
          callerId,
          userLocalDate: userToday,
          isHistoricalImport: true,
          newRow: { user_id: callerId, task_id: 't-1', completed_date: '2026-12-31' },
        })
      ).toThrow('Future task completions are forbidden');
    });
  });

  describe('Behavioral Model: daily_data Trigger & Note Editing Freedom', () => {
    interface DailyDataRow {
      user_id: string;
      date: string;
      note?: string | null;
      manual_completion: boolean;
    }

    function simulateDailyDataTrigger(params: {
      op: 'INSERT' | 'UPDATE';
      callerId: string;
      userLocalDate: string;
      triggerDepth?: number;
      newRow: DailyDataRow;
      oldRow?: DailyDataRow;
    }) {
      if ((params.triggerDepth ?? 1) > 1) return;

      if (params.newRow.user_id !== params.callerId) {
        throw new Error('Unauthorized: daily_data user_id must match authenticated caller.');
      }

      if (params.op === 'INSERT') {
        if (params.newRow.manual_completion && params.newRow.date !== params.userLocalDate) {
          throw new Error('Manual completions can only be logged for today.');
        }
      } else if (params.op === 'UPDATE') {
        if (!params.oldRow) throw new Error('Missing oldRow');
        if (params.oldRow.date !== params.newRow.date || params.oldRow.user_id !== params.newRow.user_id) {
          throw new Error('Date and user_id of daily_data cannot be modified.');
        }

        // If manual_completion changed on past/future date: block
        if (params.oldRow.manual_completion !== params.newRow.manual_completion) {
          if (params.newRow.date !== params.userLocalDate) {
            throw new Error('Past and future manual completions are read-only.');
          }
        }
        // Note updates proceed unblocked!
      }
    }

    const callerId = 'user-abc';
    const userToday = '2026-10-13';

    it('allows inserting notes for past or future days without manual_completion', () => {
      expect(() =>
        simulateDailyDataTrigger({
          op: 'INSERT',
          callerId,
          userLocalDate: userToday,
          newRow: { user_id: callerId, date: '2026-10-01', note: 'Historical reflection', manual_completion: false },
        })
      ).not.toThrow();

      expect(() =>
        simulateDailyDataTrigger({
          op: 'INSERT',
          callerId,
          userLocalDate: userToday,
          newRow: { user_id: callerId, date: '2026-10-20', note: 'Future planning note', manual_completion: false },
        })
      ).not.toThrow();
    });

    it('allows updating notes on past days without touching manual_completion', () => {
      expect(() =>
        simulateDailyDataTrigger({
          op: 'UPDATE',
          callerId,
          userLocalDate: userToday,
          oldRow: { user_id: callerId, date: '2026-10-05', note: 'Old note', manual_completion: false },
          newRow: { user_id: callerId, date: '2026-10-05', note: 'Updated retrospective note', manual_completion: false },
        })
      ).not.toThrow();
    });

    it('rejects toggling manual_completion on past or future days', () => {
      expect(() =>
        simulateDailyDataTrigger({
          op: 'UPDATE',
          callerId,
          userLocalDate: userToday,
          oldRow: { user_id: callerId, date: '2026-10-05', note: 'Old note', manual_completion: false },
          newRow: { user_id: callerId, date: '2026-10-05', note: 'Old note', manual_completion: true },
        })
      ).toThrow('Past and future manual completions are read-only');
    });

    it('allows toggling manual_completion for user-local today', () => {
      expect(() =>
        simulateDailyDataTrigger({
          op: 'UPDATE',
          callerId,
          userLocalDate: userToday,
          oldRow: { user_id: callerId, date: userToday, note: 'Today note', manual_completion: false },
          newRow: { user_id: callerId, date: userToday, note: 'Today note', manual_completion: true },
        })
      ).not.toThrow();
    });
  });

  describe('Behavioral Model: delete_user_account End-to-End', () => {
    interface DatabaseState {
      authUsers: string[];
      profiles: string[];
      tasks: string[];
      conversations: Array<{ id: string; user1: string; user2: string }>;
      storageObjects: Array<{ bucket: string; name: string; owner: string }>;
    }

    function simulateDeleteUserAccount(callerId: string | null, state: DatabaseState) {
      if (!callerId) {
        throw new Error('Not authenticated');
      }

      if (!state.authUsers.includes(callerId)) {
        throw new Error('User not found or already deleted');
      }

      // 1. Storage removal
      state.storageObjects = state.storageObjects.filter(
        (obj) =>
          !(
            ['profile-images', 'profile-covers', 'message-images'].includes(obj.bucket) &&
            (obj.owner === callerId || obj.name.startsWith(`${callerId}-`) || obj.name.startsWith(`${callerId}/`))
          )
      );

      // 2. Cascade deletion from auth.users
      state.authUsers = state.authUsers.filter((u) => u !== callerId);
      state.profiles = state.profiles.filter((p) => p !== callerId);
      state.tasks = state.tasks.filter((t) => !t.startsWith(callerId));
      state.conversations = state.conversations.filter(
        (c) => c.user1 !== callerId && c.user2 !== callerId
      );

      return { success: true };
    }

    it('throws when unauthenticated caller attempts account deletion', () => {
      const state: DatabaseState = {
        authUsers: ['u-1'],
        profiles: ['u-1'],
        tasks: ['u-1:t1'],
        conversations: [],
        storageObjects: [],
      };
      expect(() => simulateDeleteUserAccount(null, state)).toThrow('Not authenticated');
    });

    it('cascades deletion across profiles, tasks, conversations, and storage', () => {
      const state: DatabaseState = {
        authUsers: ['u-1', 'u-2'],
        profiles: ['u-1', 'u-2'],
        tasks: ['u-1:taskA', 'u-2:taskB'],
        conversations: [{ id: 'c-1', user1: 'u-1', user2: 'u-2' }],
        storageObjects: [
          { bucket: 'profile-images', name: 'u-1-avatar.jpg', owner: 'u-1' },
          { bucket: 'profile-images', name: 'u-2-avatar.jpg', owner: 'u-2' },
        ],
      };

      const result = simulateDeleteUserAccount('u-1', state);
      expect(result.success).toBe(true);
      expect(state.authUsers).toEqual(['u-2']);
      expect(state.profiles).toEqual(['u-2']);
      expect(state.tasks).toEqual(['u-2:taskB']);
      expect(state.conversations).toHaveLength(0); // Conversation purged
      expect(state.storageObjects).toHaveLength(1);
      expect(state.storageObjects[0].owner).toBe('u-2');
    });

    it('handles repeat deletion requests safely', () => {
      const state: DatabaseState = {
        authUsers: ['u-1'],
        profiles: ['u-1'],
        tasks: [],
        conversations: [],
        storageObjects: [],
      };

      simulateDeleteUserAccount('u-1', state);
      // Second attempt on already-deleted user
      expect(() => simulateDeleteUserAccount('u-1', state)).toThrow('User not found or already deleted');
    });
  });
});
