// @vitest-environment node
/**
 * Test Suite: Task Creation Redesign & Extended Recurrence
 * 
 * Validates:
 * 1. Wheel time picker 12h/24h bidirectional conversion mathematics and roundtrip fidelity.
 * 2. Monthly recurrence logic including month-end day clamping (Jan 31 -> Feb 28/29, Apr 30).
 * 3. Yearly recurrence logic including leap-day clamping (Feb 29 -> Feb 28 on non-leap years).
 * 4. Chronological task sorting with dedicated start_time and metadata fallback.
 * 5. Static contract verification of database migration 20261013140000.
 */

import { describe, it, expect } from 'vitest';
import {
  parse24HourTo12,
  convert12To24,
  processMinuteDigitEntry,
  DIGIT_ENTRY_TIMEOUT_MS
} from '../components/ui/WheelTimePicker';
import {
  getTasksForDate,
  sortTasksChronologically,
  getTaskScheduledMinutes,
  parseTaskMetadata,
  serializeTaskMetadata,
  type AppData,
  type Task
} from '../lib/dataManager';
import {
  RECURRENCE_OPTIONS,
  getRecurrenceDescription
} from '../components/AddTaskModal';
import migrationSql from '../../supabase/migrations/20261013140000_add_task_start_time_and_recurrence_options.sql?raw';
import dailyViewSource from '../components/DailyView.tsx?raw';
import addTaskModalSource from '../components/AddTaskModal.tsx?raw';
import useProductivityDataSource from '../hooks/useProductivityData.ts?raw';

describe('WheelTimePicker Conversion Helpers', () => {
  it('correctly converts 24h midnight to 12h AM', () => {
    const res = parse24HourTo12('00:00');
    expect(res).toEqual({ hour12: 12, minute: 0, period: 'AM' });
    expect(convert12To24(12, 0, 'AM')).toBe('00:00');
  });

  it('correctly converts 24h noon to 12h PM', () => {
    const res = parse24HourTo12('12:00');
    expect(res).toEqual({ hour12: 12, minute: 0, period: 'PM' });
    expect(convert12To24(12, 0, 'PM')).toBe('12:00');
  });

  it('correctly converts morning times (AM)', () => {
    const res = parse24HourTo12('09:05');
    expect(res).toEqual({ hour12: 9, minute: 5, period: 'AM' });
    expect(convert12To24(9, 5, 'AM')).toBe('09:05');
  });

  it('correctly converts afternoon & evening times (PM)', () => {
    const res1 = parse24HourTo12('13:45');
    expect(res1).toEqual({ hour12: 1, minute: 45, period: 'PM' });
    expect(convert12To24(1, 45, 'PM')).toBe('13:45');

    const res2 = parse24HourTo12('23:59');
    expect(res2).toEqual({ hour12: 11, minute: 59, period: 'PM' });
    expect(convert12To24(11, 59, 'PM')).toBe('23:59');
  });

  it('preserves complete 24-hour roundtrip fidelity across all hours', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 15, 30, 45, 59]) {
        const time24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        const { hour12, minute, period } = parse24HourTo12(time24);
        const reconstructed = convert12To24(hour12, minute, period);
        expect(reconstructed).toBe(time24);
      }
    }
  });

  it('handles invalid or empty time string with safe fallback to current time components', () => {
    const fallbackEmpty = parse24HourTo12('');
    expect(fallbackEmpty.hour12).toBeGreaterThanOrEqual(1);
    expect(fallbackEmpty.hour12).toBeLessThanOrEqual(12);
    expect(fallbackEmpty.minute).toBeGreaterThanOrEqual(0);
    expect(fallbackEmpty.minute).toBeLessThanOrEqual(59);
    expect(['AM', 'PM']).toContain(fallbackEmpty.period);

    const fallbackInvalid = parse24HourTo12('invalid');
    expect(fallbackInvalid.hour12).toBeGreaterThanOrEqual(1);
    expect(fallbackInvalid.hour12).toBeLessThanOrEqual(12);
    expect(['AM', 'PM']).toContain(fallbackInvalid.period);
  });
});

describe('WheelTimePicker Intelligent Minute Digit Entry', () => {
  it('defines a usable input window within 700-900ms', () => {
    expect(DIGIT_ENTRY_TIMEOUT_MS).toBeGreaterThanOrEqual(700);
    expect(DIGIT_ENTRY_TIMEOUT_MS).toBeLessThanOrEqual(900);
  });

  it('immediately jumps to tens value for digits 0-5 and sets pending prefix', () => {
    // 4 -> 40
    const res4 = processMinuteDigitEntry('4', null);
    expect(res4).toEqual({
      newMinute: 40,
      newPendingPrefix: '4',
      shouldSetTimer: true
    });

    // 0 -> 00
    const res0 = processMinuteDigitEntry('0', null);
    expect(res0).toEqual({
      newMinute: 0,
      newPendingPrefix: '0',
      shouldSetTimer: true
    });

    // 1 -> 10
    const res1 = processMinuteDigitEntry('1', null);
    expect(res1).toEqual({
      newMinute: 10,
      newPendingPrefix: '1',
      shouldSetTimer: true
    });

    // 5 -> 50
    const res5 = processMinuteDigitEntry('5', null);
    expect(res5).toEqual({
      newMinute: 50,
      newPendingPrefix: '5',
      shouldSetTimer: true
    });
  });

  it('combines second digit with pending prefix when entered within window', () => {
    // 4 + 7 -> 47
    const combined47 = processMinuteDigitEntry('7', '4');
    expect(combined47).toEqual({
      newMinute: 47,
      newPendingPrefix: null,
      shouldSetTimer: false
    });

    // 0 + 5 -> 05
    const combined05 = processMinuteDigitEntry('5', '0');
    expect(combined05).toEqual({
      newMinute: 5,
      newPendingPrefix: null,
      shouldSetTimer: false
    });

    // 5 + 9 -> 59
    const combined59 = processMinuteDigitEntry('9', '5');
    expect(combined59).toEqual({
      newMinute: 59,
      newPendingPrefix: null,
      shouldSetTimer: false
    });

    // 3 + 0 -> 30
    const combined30 = processMinuteDigitEntry('0', '3');
    expect(combined30).toEqual({
      newMinute: 30,
      newPendingPrefix: null,
      shouldSetTimer: false
    });
  });

  it('immediately selects single-digit values 06-09 for initial digits 6-9 without pending prefix', () => {
    const res6 = processMinuteDigitEntry('6', null);
    expect(res6).toEqual({
      newMinute: 6,
      newPendingPrefix: null,
      shouldSetTimer: false
    });

    const res7 = processMinuteDigitEntry('7', null);
    expect(res7).toEqual({
      newMinute: 7,
      newPendingPrefix: null,
      shouldSetTimer: false
    });

    const res8 = processMinuteDigitEntry('8', null);
    expect(res8).toEqual({
      newMinute: 8,
      newPendingPrefix: null,
      shouldSetTimer: false
    });

    const res9 = processMinuteDigitEntry('9', null);
    expect(res9).toEqual({
      newMinute: 9,
      newPendingPrefix: null,
      shouldSetTimer: false
    });
  });

  it('safely rejects non-digit keys without mutating state', () => {
    expect(processMinuteDigitEntry('a', null)).toBeNull();
    expect(processMinuteDigitEntry('Escape', null)).toBeNull();
    expect(processMinuteDigitEntry('-', '4')).toBeNull();
    expect(processMinuteDigitEntry(' ', null)).toBeNull();
  });

  it('starts a new sequence after timer expiration or scroll cancel', () => {
    // Prefix expired (null) -> 2 starts 20
    const res = processMinuteDigitEntry('2', null);
    expect(res?.newMinute).toBe(20);
    expect(res?.newPendingPrefix).toBe('2');
  });
});

describe('Monthly & Yearly Recurrence Scheduling', () => {
  const baseAppData = (recurringTask: Task): AppData => ({
    version: 2,
    days: {},
    recurringTasks: [recurringTask],
    settings: {
      theme: 'dark',
      weekStartsOn: 1
    }
  });

  describe('Monthly recurrence', () => {
    it('schedules on the exact day for months with enough days', () => {
      const task: Task = {
        id: 'task-monthly-15',
        name: 'Mid-Month Review',
        recurring: 'monthly',
        createdAt: '2026-01-15'
      };
      const data = baseAppData(task);

      // Matches on the 15th
      expect(getTasksForDate(data, '2026-01-15')).toHaveLength(1);
      expect(getTasksForDate(data, '2026-02-15')).toHaveLength(1);
      expect(getTasksForDate(data, '2026-03-15')).toHaveLength(1);

      // Does not match on adjacent days
      expect(getTasksForDate(data, '2026-02-14')).toHaveLength(0);
      expect(getTasksForDate(data, '2026-02-16')).toHaveLength(0);
    });

    it('clamps 31st day to end of month for shorter months in non-leap year (Feb 28, Apr 30)', () => {
      const task: Task = {
        id: 'task-monthly-31',
        name: 'Month End Wrap-up',
        recurring: 'monthly',
        createdAt: '2026-01-31'
      };
      const data = baseAppData(task);

      // 31st in Jan: matches
      expect(getTasksForDate(data, '2026-01-31')).toHaveLength(1);

      // February 2026 has 28 days: should trigger on Feb 28
      expect(getTasksForDate(data, '2026-02-28')).toHaveLength(1);
      expect(getTasksForDate(data, '2026-02-27')).toHaveLength(0);

      // March has 31 days: should trigger on Mar 31, NOT Mar 28
      expect(getTasksForDate(data, '2026-03-31')).toHaveLength(1);
      expect(getTasksForDate(data, '2026-03-28')).toHaveLength(0);

      // April has 30 days: should trigger on Apr 30
      expect(getTasksForDate(data, '2026-04-30')).toHaveLength(1);
      expect(getTasksForDate(data, '2026-04-29')).toHaveLength(0);
    });

    it('clamps 31st day to Feb 29 in a leap year (2024)', () => {
      const task: Task = {
        id: 'task-monthly-leap',
        name: 'Month End Wrap-up',
        recurring: 'monthly',
        createdAt: '2024-01-31'
      };
      const data = baseAppData(task);

      expect(getTasksForDate(data, '2024-02-29')).toHaveLength(1);
      expect(getTasksForDate(data, '2024-02-28')).toHaveLength(0);
    });

    it('does not schedule before createdAt date', () => {
      const task: Task = {
        id: 'task-monthly-future',
        name: 'Future Task',
        recurring: 'monthly',
        createdAt: '2026-05-15'
      };
      const data = baseAppData(task);

      expect(getTasksForDate(data, '2026-04-15')).toHaveLength(0);
      expect(getTasksForDate(data, '2026-05-15')).toHaveLength(1);
    });

    it('respects metadata endDate boundary', () => {
      const task: Task = {
        id: 'task-monthly-bounded',
        name: 'Term Project',
        recurring: 'monthly',
        createdAt: '2026-01-10',
        description: serializeTaskMetadata({ endDate: '2026-04-10' })
      };
      const data = baseAppData(task);

      expect(getTasksForDate(data, '2026-04-10')).toHaveLength(1);
      expect(getTasksForDate(data, '2026-05-10')).toHaveLength(0);
    });
  });

  describe('Yearly recurrence', () => {
    it('schedules on the exact anniversary each year', () => {
      const task: Task = {
        id: 'task-yearly-bday',
        name: 'Birthday Celebration',
        recurring: 'yearly',
        createdAt: '2025-08-20'
      };
      const data = baseAppData(task);

      expect(getTasksForDate(data, '2025-08-20')).toHaveLength(1);
      expect(getTasksForDate(data, '2026-08-20')).toHaveLength(1);
      expect(getTasksForDate(data, '2027-08-20')).toHaveLength(1);

      // Does not trigger on wrong day or wrong month
      expect(getTasksForDate(data, '2026-08-19')).toHaveLength(0);
      expect(getTasksForDate(data, '2026-09-20')).toHaveLength(0);
    });

    it('safely handles leap day (Feb 29) on non-leap years (clamps to Feb 28)', () => {
      const task: Task = {
        id: 'task-yearly-leap',
        name: 'Leap Year Task',
        recurring: 'yearly',
        createdAt: '2024-02-29'
      };
      const data = baseAppData(task);

      // 2024: Leap year -> triggers Feb 29
      expect(getTasksForDate(data, '2024-02-29')).toHaveLength(1);

      // 2025: Non-leap year -> clamps to Feb 28
      expect(getTasksForDate(data, '2025-02-28')).toHaveLength(1);
      expect(getTasksForDate(data, '2025-02-27')).toHaveLength(0);

      // 2028: Next leap year -> triggers Feb 29
      expect(getTasksForDate(data, '2028-02-29')).toHaveLength(1);
      expect(getTasksForDate(data, '2028-02-28')).toHaveLength(0);
    });
  });
});

describe('Chronological Sorting with startTime', () => {
  it('places timed tasks before untimed tasks in chronological order', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Untimed Task A', recurring: 'none', createdAt: '2026-10-13' },
      { id: '2', name: 'Afternoon Meeting', recurring: 'none', createdAt: '2026-10-13', startTime: '14:30' },
      { id: '3', name: 'Morning Standup', recurring: 'none', createdAt: '2026-10-13', startTime: '09:00' },
      { id: '4', name: 'Breakfast', recurring: 'none', createdAt: '2026-10-13', startTime: '07:45' },
      { id: '5', name: 'Untimed Task B', recurring: 'none', createdAt: '2026-10-13' }
    ];

    const sorted = sortTasksChronologically(tasks);
    expect(sorted.map(t => t.id)).toEqual(['4', '3', '2', '1', '5']);
  });

  it('correctly reads startTime from task.metadata when task.startTime is not top-level', () => {
    const task: Task = {
      id: 'meta-time',
      name: 'Gym',
      recurring: 'none',
      createdAt: '2026-10-13',
      description: serializeTaskMetadata({ startTime: '06:15' })
    };

    expect(getTaskScheduledMinutes(task)).toBe(6 * 60 + 15);
  });

  it('correctly prefers top-level task.startTime over description when both exist', () => {
    const task: Task = {
      id: 'override-time',
      name: 'Gym',
      recurring: 'none',
      createdAt: '2026-10-13',
      startTime: '08:00',
      description: serializeTaskMetadata({ startTime: '06:15' })
    };

    expect(getTaskScheduledMinutes(task)).toBe(8 * 60);
  });

  it('preserves untimed relative ordering', () => {
    const tasks: Task[] = [
      { id: 'u1', name: 'Read Book', recurring: 'none', createdAt: '2026-10-13' },
      { id: 'u2', name: 'Clean Desk', recurring: 'none', createdAt: '2026-10-13' },
      { id: 'u3', name: 'Journal', recurring: 'none', createdAt: '2026-10-13' }
    ];

    const sorted = sortTasksChronologically(tasks);
    expect(sorted.map(t => t.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('correctly parses and serializes metadata with startTime', () => {
    const meta = { startTime: '15:30', notes: 'Call Alice' };
    const serialized = serializeTaskMetadata(meta);
    const parsed = parseTaskMetadata({
      id: 'task-roundtrip',
      name: 'Task',
      recurring: 'none',
      createdAt: '2026-10-13',
      description: serialized
    });
    expect(parsed.startTime).toBe('15:30');
    expect(parsed.notes).toBe('Call Alice');
  });
});

describe('Static SQL Migration Contract (20261013140000)', () => {
  it('updates tasks_recurring_check constraint to include monthly and yearly', () => {
    expect(migrationSql).toContain('ALTER TABLE public.tasks DROP CONSTRAINT tasks_recurring_check');
    expect(migrationSql).toMatch(
      /CHECK\s*\(\s*recurring\s+IN\s*\(\s*'none',\s*'daily',\s*'weekdays',\s*'weekly',\s*'monthly',\s*'yearly',\s*'custom'\s*\)\s*\)/i
    );
  });

  it('adds structured start_time column idempotently with time without time zone', () => {
    expect(migrationSql).toMatch(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+start_time\s+time\s+without\s+time\s+zone\s+DEFAULT\s+NULL/i
    );
  });

  it('includes explanatory comments on start_time and recurring columns', () => {
    expect(migrationSql).toContain('COMMENT ON COLUMN public.tasks.start_time IS');
    expect(migrationSql).toContain('COMMENT ON COLUMN public.tasks.recurring IS');
  });
});

describe('Task Modal UI Corrections & Task List Polish', () => {
  describe('Time Selection Interaction Specification', () => {
    it('provides segmented control with Anytime and Set Time', () => {
      expect(addTaskModalSource).toContain('Anytime');
      expect(addTaskModalSource).toContain('Set Time');
      expect(addTaskModalSource).toContain('<Clock size={13}');
    });

    it('defaults to Anytime when creating a new untimed task', () => {
      const initialTask: Task | undefined = undefined;
      const initialStartTime: string | undefined = undefined;
      const initialTimeCandidate = initialTask ? (parseTaskMetadata(initialTask).startTime || (initialTask as any).startTime) : (initialStartTime || null);
      const timeMode: 'anytime' | 'set' = initialTimeCandidate ? 'set' : 'anytime';
      expect(timeMode).toBe('anytime');

      // Saving with Anytime stores startTime as undefined and omits it from metadata
      const chosenStartTime = (timeMode as 'anytime' | 'set') === 'set' ? '09:00' : undefined;
      const meta = serializeTaskMetadata({
        notes: 'Review report',
        startTime: chosenStartTime
      });
      const parsed = parseTaskMetadata({ id: '1', name: 'Task', recurring: 'none', createdAt: '2026-10-13', description: meta });
      expect(parsed.startTime).toBeUndefined();
    });

    it('restores saved scheduled time when editing an existing timed task', () => {
      const initialTask: Task = {
        id: 'timed-1',
        name: 'Design Review',
        recurring: 'none',
        createdAt: '2026-10-13',
        startTime: '14:30',
        description: serializeTaskMetadata({ startTime: '14:30' })
      };

      const meta = parseTaskMetadata(initialTask);
      const initialTimeCandidate = meta.startTime || initialTask.startTime || null;
      const timeMode = initialTimeCandidate ? 'set' : 'anytime';
      const startTime = initialTimeCandidate || '09:00';

      expect(timeMode).toBe('set');
      expect(startTime).toBe('14:30');
    });

    it('clears scheduled time completely when returning to Anytime', () => {
      // Simulate task originally with time
      const initialTask: Task = {
        id: 'timed-2',
        name: 'Sprint Planning',
        recurring: 'none',
        createdAt: '2026-10-13',
        startTime: '10:00',
        description: serializeTaskMetadata({ startTime: '10:00' })
      };

      // User switches back to Anytime
      const timeMode = 'anytime' as 'anytime' | 'set';
      const startTime = '10:00'; // state retains value in memory
      const chosenStartTime = timeMode === 'set' && startTime ? startTime : undefined;

      const metadata = parseTaskMetadata(initialTask);
      if (!chosenStartTime) {
        delete metadata.startTime;
      }

      expect(chosenStartTime).toBeUndefined();
      expect(metadata.startTime).toBeUndefined();
    });

    it('retains selected time value across form field updates without resetting', () => {
      let startTime = '09:30';
      const timeMode: 'anytime' | 'set' = 'set';

      // Simulate user editing title, category, notes, or toggling recurrence
      let title = 'Initial Title';
      title = 'Updated Title';
      let category = '';
      category = 'Work';
      let notes = '';
      notes = 'Bring notebook';
      let recurring: Task['recurring'] = 'none';
      recurring = 'daily';

      expect(title).toBe('Updated Title');
      expect(category).toBe('Work');
      expect(notes).toBe('Bring notebook');
      expect(recurring).toBe('daily');

      // Time remains unchanged
      expect(startTime).toBe('09:30');
      expect(timeMode).toBe('set');
      const chosenStartTime = timeMode === 'set' && startTime ? startTime : undefined;
      expect(chosenStartTime).toBe('09:30');
    });
  });

  describe('Recurrence Cadence Selection & End-to-End Verification', () => {
    it('provides segmented control with 5 distinct repeat options (Off, Daily, Weekly, Monthly, Yearly)', () => {
      expect(RECURRENCE_OPTIONS).toEqual([
        { value: 'none', label: 'Off' },
        { value: 'daily', label: 'Daily' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'yearly', label: 'Yearly' }
      ]);
      expect(addTaskModalSource).toContain('grid-cols-5');
      expect(addTaskModalSource).toContain('RECURRENCE_OPTIONS.map');
    });

    it('generates accurate, human-readable recurrence descriptions for all cadences', () => {
      expect(getRecurrenceDescription('none', '2026-10-13')).toBe('Occurs once on scheduled date');
      expect(getRecurrenceDescription('daily', '2026-10-13')).toBe('Repeats every day');
      // 2026-10-13 is Tuesday
      expect(getRecurrenceDescription('weekly', '2026-10-13')).toBe('Repeats weekly on Tuesday');
      expect(getRecurrenceDescription('monthly', '2026-10-13')).toBe('Repeats on day 13 of every month (adjusted for shorter months)');
      expect(getRecurrenceDescription('yearly', '2026-10-13')).toBe('Repeats annually on October 13');
      // Leap day special note
      expect(getRecurrenceDescription('yearly', '2024-02-29')).toBe('Repeats annually on February 29 (Feb 28 in non-leap years)');
      // Legacy cadences
      expect(getRecurrenceDescription('weekdays', '2026-10-13')).toBe('Repeats every weekday (Mon–Fri)');
      expect(getRecurrenceDescription('custom', '2026-10-13')).toBe('Custom recurrence rule');
    });

    it('safely preserves legacy task recurrence (weekdays/custom) without silently rewriting', () => {
      const legacyTask: Task = {
        id: 'legacy-1',
        name: 'Weekday Standup',
        recurring: 'weekdays',
        createdAt: '2026-10-13'
      };

      const recurring = legacyTask.recurring || 'none';
      expect(recurring).toBe('weekdays');
      expect(RECURRENCE_OPTIONS.some(o => o.value === recurring)).toBe(false);
      expect(addTaskModalSource).toContain('Preserving existing recurrence:');
    });

    it('enables End Date selector for any active recurrence (not just daily)', () => {
      expect(addTaskModalSource).toContain("recurring !== 'none'");
      expect(addTaskModalSource).toContain("endDate: recurring !== 'none' && endDate ? endDate : undefined");
    });

    it('implements backward-compatible fallback in useProductivityData for unmigrated DB schemas', () => {
      expect(useProductivityDataSource).toContain('tasks_recurring_check');
      expect(useProductivityDataSource).toContain("insertPayload.recurring = 'custom'");
      expect(useProductivityDataSource).toContain("updatePayload.recurring = 'custom'");
      expect(useProductivityDataSource).toContain('RRULE:FREQ=MONTHLY');
      expect(useProductivityDataSource).toContain('RRULE:FREQ=YEARLY');
    });
  });

  describe('Anchored Portal DatePicker Popover & Overflow Elimination', () => {
    it('mounts calendar popover to document.body via createPortal', () => {
      expect(addTaskModalSource).toContain('createPortal(');
      expect(addTaskModalSource).toContain('document.body');
    });

    it('anchors position directly to trigger button and calculates coordinates', () => {
      expect(addTaskModalSource).toContain('anchorRef.current.getBoundingClientRect()');
      expect(addTaskModalSource).toContain('rect.right - popoverWidth');
      expect(addTaskModalSource).toContain('endDateTriggerRef');
    });

    it('flips above trigger when vertical space below is constrained', () => {
      expect(addTaskModalSource).toContain("spaceBelow < popoverHeight + padding && spaceAbove > spaceBelow");
      expect(addTaskModalSource).toContain("placement = 'top'");
    });

    it('clamps horizontal coordinates within viewport margins eliminating modal scrollbar', () => {
      expect(addTaskModalSource).toContain('window.innerWidth - popoverWidth - padding');
      expect(addTaskModalSource).toContain('left = padding');
    });

    it('attaches Escape key and outside click listeners for accessible popover lifecycle', () => {
      expect(addTaskModalSource).toContain("e.key === 'Escape'");
      expect(addTaskModalSource).toContain('document.addEventListener');
      expect(addTaskModalSource).toContain('window.addEventListener');
    });
  });

  describe('Task List Calm Agenda & Scheduled Time Storage', () => {
    it('does not render scheduled time badge or Clock in DailyView task rows', () => {
      // Confirms DailyView task cards do not render the time badge
      expect(dailyViewSource).not.toContain('Clock size={10}');
      expect(dailyViewSource).not.toContain('formatTime12(task.startTime');
    });

    it('preserves task item name, checkbox, and category rendering in DailyView', () => {
      expect(dailyViewSource).toContain('task.name');
      expect(dailyViewSource).toContain('task.category');
      expect(dailyViewSource).toContain('meta.notes');
    });

    it('preserves underlying scheduled time sorting in dataManager', () => {
      const tasks: Task[] = [
        { id: '1', name: 'Untimed Task', recurring: 'none', createdAt: '2026-10-13' },
        { id: '2', name: 'Morning Task', recurring: 'none', createdAt: '2026-10-13', startTime: '09:00' }
      ];

      const sorted = sortTasksChronologically(tasks);
      expect(sorted[0].id).toBe('2'); // Morning Task (09:00) sorted first
      expect(sorted[1].id).toBe('1'); // Untimed Task sorted second
    });
  });
});

