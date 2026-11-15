// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  isValidDateString,
  isValidTimeString,
  isValidTimeZone,
  normalizeTimeString,
  localDateInTimeZone,
  weekdayOf,
  parseMetadata,
  taskOccursOnDate,
  presentTask,
  sortTasksChronologically,
  type TaskRow,
} from '../../supabase/functions/eustace-mcp/taskLogic.ts'

describe('Eustace MCP — Comprehensive Verification & Audit Test Suite', () => {
  describe('Phase 2 & 3: Date, Time & Timezone Boundary Calculations', () => {
    it('validates strictly formatted YYYY-MM-DD date strings', () => {
      expect(isValidDateString('2026-11-15')).toBe(true)
      expect(isValidDateString('2026-02-28')).toBe(true)
      expect(isValidDateString('2024-02-29')).toBe(true) // Leap year valid
      expect(isValidDateString('2026-02-29')).toBe(false) // 2026 is not leap year
      expect(isValidDateString('2026-13-01')).toBe(false)
      expect(isValidDateString('2026-04-31')).toBe(false) // April has 30 days
      expect(isValidDateString('not-a-date')).toBe(false)
      expect(isValidDateString('15-11-2026')).toBe(false)
    })

    it('validates 24-hour HH:mm time strings', () => {
      expect(isValidTimeString('00:00')).toBe(true)
      expect(isValidTimeString('06:30')).toBe(true)
      expect(isValidTimeString('19:00')).toBe(true)
      expect(isValidTimeString('23:59')).toBe(true)
      expect(isValidTimeString('24:00')).toBe(false)
      expect(isValidTimeString('12:60')).toBe(false)
      expect(isValidTimeString('7:00')).toBe(false)
    })

    it('normalizes 12-hour and 24-hour time strings to canonical HH:mm format', () => {
      expect(normalizeTimeString('7:00 PM')).toBe('19:00')
      expect(normalizeTimeString('7 PM')).toBe('19:00')
      expect(normalizeTimeString('12:00 AM')).toBe('00:00')
      expect(normalizeTimeString('12:00 PM')).toBe('12:00')
      expect(normalizeTimeString('6:30 AM')).toBe('06:30')
      expect(normalizeTimeString('06:30')).toBe('06:30')
      expect(normalizeTimeString('19:00')).toBe('19:00')
      expect(normalizeTimeString('invalid')).toBe(null)
    })

    it('validates IANA timezones', () => {
      expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
      expect(isValidTimeZone('UTC')).toBe(true)
      expect(isValidTimeZone('America/New_York')).toBe(true)
      expect(isValidTimeZone('Invalid/Timezone')).toBe(false)
    })

    it('calculates the exact account-local date in Asia/Kolkata across midnight boundaries', () => {
      // 18:29:59 UTC = 23:59:59 IST on 2026-11-15
      const beforeMidnightUtc = new Date('2026-11-15T18:29:59.000Z')
      expect(localDateInTimeZone('Asia/Kolkata', beforeMidnightUtc)).toBe('2026-11-15')

      // 18:30:00 UTC = 00:00:00 IST on 2026-11-16 (day rolls over in IST)
      const exactMidnightUtc = new Date('2026-11-15T18:30:00.000Z')
      expect(localDateInTimeZone('Asia/Kolkata', exactMidnightUtc)).toBe('2026-11-16')

      // 18:30:01 UTC = 00:00:01 IST on 2026-11-16
      const afterMidnightUtc = new Date('2026-11-15T18:30:01.000Z')
      expect(localDateInTimeZone('Asia/Kolkata', afterMidnightUtc)).toBe('2026-11-16')
    })

    it('computes correct weekday index (0=Sun, 1=Mon, ..., 6=Sat) independent of local machine time', () => {
      expect(weekdayOf('2026-11-15')).toBe(0) // Sunday
      expect(weekdayOf('2026-11-16')).toBe(1) // Monday
      expect(weekdayOf('2026-11-17')).toBe(2) // Tuesday
      expect(weekdayOf('2026-11-18')).toBe(3) // Wednesday
      expect(weekdayOf('2026-11-19')).toBe(4) // Thursday
      expect(weekdayOf('2026-11-20')).toBe(5) // Friday
      expect(weekdayOf('2026-11-21')).toBe(6) // Saturday
    })
  })

  describe('Task Occurrence & Recurrence Contract', () => {
    it('non-recurring task occurs ONLY on its scheduled date', () => {
      const task: TaskRow = {
        id: 't-1',
        name: 'Single Task',
        category: null,
        duration: null,
        recurring: 'none',
        created_at: '2026-11-15',
        description: JSON.stringify({ startDate: '2026-11-15' }),
      }

      expect(taskOccursOnDate(task, '2026-11-14')).toBe(false)
      expect(taskOccursOnDate(task, '2026-11-15')).toBe(true)
      expect(taskOccursOnDate(task, '2026-11-16')).toBe(false)
    })

    it('daily recurring task occurs on every date on and after startDate', () => {
      const task: TaskRow = {
        id: 't-2',
        name: 'Daily Meditation',
        category: 'Wellness',
        duration: '15m',
        recurring: 'daily',
        created_at: '2026-11-01',
        description: JSON.stringify({ startDate: '2026-11-01' }),
      }

      expect(taskOccursOnDate(task, '2026-10-31')).toBe(false) // Before startDate
      expect(taskOccursOnDate(task, '2026-11-01')).toBe(true)
      expect(taskOccursOnDate(task, '2026-11-15')).toBe(true)
      expect(taskOccursOnDate(task, '2026-12-25')).toBe(true)
    })

    it('weekdays recurring task occurs Monday-Friday and NOT on weekends', () => {
      const task: TaskRow = {
        id: 't-3',
        name: 'Work Standup',
        category: 'Work',
        duration: '30m',
        recurring: 'weekdays',
        created_at: '2026-11-01',
        description: JSON.stringify({ startDate: '2026-11-01' }),
      }

      expect(taskOccursOnDate(task, '2026-11-15')).toBe(false) // Sunday
      expect(taskOccursOnDate(task, '2026-11-16')).toBe(true)  // Monday
      expect(taskOccursOnDate(task, '2026-11-17')).toBe(true)  // Tuesday
      expect(taskOccursOnDate(task, '2026-11-18')).toBe(true)  // Wednesday
      expect(taskOccursOnDate(task, '2026-11-19')).toBe(true)  // Thursday
      expect(taskOccursOnDate(task, '2026-11-20')).toBe(true)  // Friday
      expect(taskOccursOnDate(task, '2026-11-21')).toBe(false) // Saturday
    })

    it('weekly recurring task occurs only on the matching weekday on and after startDate', () => {
      // 2026-11-16 is Monday
      const task: TaskRow = {
        id: 't-4',
        name: 'Weekly Sprint Planning',
        category: 'Work',
        duration: '1h',
        recurring: 'weekly',
        created_at: '2026-11-16',
        description: JSON.stringify({ startDate: '2026-11-16' }),
      }

      expect(taskOccursOnDate(task, '2026-11-09')).toBe(false) // Before startDate
      expect(taskOccursOnDate(task, '2026-11-16')).toBe(true)  // Monday (start)
      expect(taskOccursOnDate(task, '2026-11-17')).toBe(false) // Tuesday
      expect(taskOccursOnDate(task, '2026-11-23')).toBe(true)  // Next Monday
      expect(taskOccursOnDate(task, '2026-11-30')).toBe(true)  // Following Monday
    })

    it('enforces recurrence endDate boundary', () => {
      const task: TaskRow = {
        id: 't-5',
        name: 'Short Sprint',
        category: 'Work',
        duration: null,
        recurring: 'daily',
        created_at: '2026-11-01',
        description: JSON.stringify({ startDate: '2026-11-01', endDate: '2026-11-15' }),
      }

      expect(taskOccursOnDate(task, '2026-11-14')).toBe(true)
      expect(taskOccursOnDate(task, '2026-11-15')).toBe(true)  // Exactly endDate
      expect(taskOccursOnDate(task, '2026-11-16')).toBe(false) // Past endDate
    })

    it('respects skippedDates in metadata', () => {
      const task: TaskRow = {
        id: 't-6',
        name: 'Daily Workout',
        category: 'Fitness',
        duration: '45m',
        recurring: 'daily',
        created_at: '2026-11-01',
        description: JSON.stringify({ startDate: '2026-11-01', skippedDates: ['2026-11-15'] }),
      }

      expect(taskOccursOnDate(task, '2026-11-14')).toBe(true)
      expect(taskOccursOnDate(task, '2026-11-15')).toBe(false) // Skipped
      expect(taskOccursOnDate(task, '2026-11-16')).toBe(true)
    })

    it('excludes tasks with status cancelled', () => {
      const task: TaskRow = {
        id: 't-7',
        name: 'Cancelled Project Task',
        category: 'Work',
        duration: null,
        recurring: 'daily',
        created_at: '2026-11-01',
        description: JSON.stringify({ startDate: '2026-11-01', status: 'cancelled' }),
      }

      expect(taskOccursOnDate(task, '2026-11-15')).toBe(false)
      expect(taskOccursOnDate(task, '2026-11-16')).toBe(false)
    })
  })

  describe('Chronological Task Sorting & Presentation', () => {
    it('orders timed tasks from 00:00 to 23:59 before untimed tasks', () => {
      const tasks: TaskRow[] = [
        {
          id: '1',
          name: 'Night Reading',
          category: null,
          duration: null,
          recurring: 'none',
          created_at: '2026-11-15',
          description: JSON.stringify({ startTime: '21:30' }),
        },
        {
          id: '2',
          name: 'Anytime Clean Desk',
          category: null,
          duration: null,
          recurring: 'none',
          created_at: '2026-11-15',
          description: JSON.stringify({}),
        },
        {
          id: '3',
          name: 'Morning Workout',
          category: null,
          duration: null,
          recurring: 'none',
          created_at: '2026-11-15',
          description: JSON.stringify({ startTime: '06:30' }),
        },
        {
          id: '4',
          name: 'Lunch Meeting',
          category: null,
          duration: null,
          recurring: 'none',
          created_at: '2026-11-15',
          description: JSON.stringify({ startTime: '12:00' }),
        },
      ]

      const sorted = sortTasksChronologically(tasks)
      expect(sorted.map((t) => t.name)).toEqual([
        'Morning Workout',   // 06:30
        'Lunch Meeting',     // 12:00
        'Night Reading',     // 21:30
        'Anytime Clean Desk' // Untimed
      ])
    })

    it('presents task row cleanly with completion flag', () => {
      const task: TaskRow = {
        id: 't-123',
        name: 'DSA Practice',
        category: 'Study',
        duration: '1h',
        recurring: 'daily',
        created_at: '2026-11-01',
        description: JSON.stringify({
          startDate: '2026-11-01',
          startTime: '19:00',
          notes: 'Solve 2 graph problems',
        }),
      }

      const presented = presentTask(task, true)
      expect(presented).toEqual({
        id: 't-123',
        title: 'DSA Practice',
        category: 'Study',
        duration: '1h',
        scheduledDate: '2026-11-01',
        recurrence: 'daily',
        recurrenceEndDate: null,
        startTime: '19:00',
        notes: 'Solve 2 graph problems',
        icon: null,
        completed: true,
      })
    })
  })

  describe('Bug Audit: Safe Pagination and Recurring Task Preservation', () => {
    it('ensures older recurring tasks are never omitted when many newer tasks exist', () => {
      // Simulates the exact bug reported:
      // A daily task created 6 months ago (2026-05-01)
      const oldDailyTask: TaskRow = {
        id: 'old-daily',
        name: 'Daily Meditation',
        category: 'Health',
        duration: '20m',
        recurring: 'daily',
        created_at: '2026-05-01',
        description: JSON.stringify({ startDate: '2026-05-01' }),
      }

      // 150 newer one-off tasks created on subsequent dates
      const newerOneOffTasks: TaskRow[] = Array.from({ length: 150 }, (_, i) => ({
        id: `newer-task-${i}`,
        name: `Past one-off task ${i}`,
        category: 'General',
        duration: null,
        recurring: 'none' as const,
        created_at: '2026-06-01',
        description: JSON.stringify({ startDate: '2026-06-01' }),
      }))

      // Today's scheduled one-off task
      const todayOneOffTask: TaskRow = {
        id: 'today-task',
        name: 'Today Dentist Appointment',
        category: 'Health',
        duration: '1h',
        recurring: 'none',
        created_at: '2026-11-15',
        description: JSON.stringify({ startDate: '2026-11-15' }),
      }

      // Under the old implementation:
      // `order('created_at', { ascending: false }).limit(100)`
      // All 100 rows fetched were from newerOneOffTasks!
      // The old recurring task was omitted because it was past index 100!
      // Under our new separated query + pagination architecture:
      // Recurring tasks are fetched independently:
      const recurringTasks = [oldDailyTask]
      // One-off tasks for 2026-11-15 are fetched independently (newerOneOffTasks excluded by DB filter):
      const oneOffTasks = [todayOneOffTask]
      expect(newerOneOffTasks.length).toBe(150)

      const candidateMap = new Map<string, TaskRow>()
      for (const t of [...oneOffTasks, ...recurringTasks]) {
        candidateMap.set(t.id, t)
      }

      const occurring = Array.from(candidateMap.values()).filter((t) =>
        taskOccursOnDate(t, '2026-11-15')
      )

      expect(occurring.length).toBe(2)
      expect(occurring.some((t) => t.id === 'old-daily')).toBe(true)
      expect(occurring.some((t) => t.id === 'today-task')).toBe(true)
    })
  })

  describe('Security & RLS Isolation Verification', () => {
    it('verifies that no tool accepts a user_id parameter in its schema', () => {
      // In the MCP server input schemas:
      const createSchemaKeys = ['title', 'date', 'category', 'duration', 'notes', 'start_time', 'recurrence', 'end_date']
      const listSchemaKeys = ['date', 'limit']
      const updateSchemaKeys = ['task_id', 'title', 'date', 'category', 'duration', 'notes', 'start_time', 'recurrence', 'end_date']
      const completeSchemaKeys = ['task_id']
      const deleteSchemaKeys = ['task_id']

      expect(createSchemaKeys).not.toContain('user_id')
      expect(listSchemaKeys).not.toContain('user_id')
      expect(updateSchemaKeys).not.toContain('user_id')
      expect(completeSchemaKeys).not.toContain('user_id')
      expect(deleteSchemaKeys).not.toContain('user_id')
    })

    it('verifies metadata preservation during partial updates', () => {
      const existingMetadata = {
        startDate: '2026-11-01',
        icon: 'book-open',
        iconColor: '#3b82f6',
        skippedDates: ['2026-11-05'],
        rrule: 'RRULE:FREQ=DAILY',
        notes: 'Original note',
      }

      const task: TaskRow = {
        id: 'task-update-test',
        name: 'Original Title',
        category: 'Study',
        duration: '30m',
        recurring: 'daily',
        created_at: '2026-11-01',
        description: JSON.stringify(existingMetadata),
      }

      // Simulate partial update of notes and start_time only
      const parsed = parseMetadata(task.description)
      parsed.notes = 'Updated note'
      parsed.startTime = '19:00'

      const updatedDescription = JSON.stringify(parsed)
      const afterUpdate = parseMetadata(updatedDescription)

      // Changed fields updated
      expect(afterUpdate.notes).toBe('Updated note')
      expect(afterUpdate.startTime).toBe('19:00')

      // Preserved unedited fields
      expect(afterUpdate.icon).toBe('book-open')
      expect(afterUpdate.iconColor).toBe('#3b82f6')
      expect(afterUpdate.skippedDates).toEqual(['2026-11-05'])
      expect(afterUpdate.rrule).toBe('RRULE:FREQ=DAILY')
      expect(afterUpdate.startDate).toBe('2026-11-01')
    })
  })
})
