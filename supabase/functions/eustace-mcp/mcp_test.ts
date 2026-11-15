// Eustace MCP Deno Integration Tests
import { assertEquals } from 'jsr:@std/assert'
import {
  isValidDateString,
  isValidTimeString,
  isValidTimeZone,
  normalizeTimeString,
  localDateInTimeZone,
  taskOccursOnDate,
  type TaskRow,
} from './taskLogic.ts'

Deno.test('Date & Time Validation', () => {
  assertEquals(isValidDateString('2026-11-15'), true)
  assertEquals(isValidDateString('2026-11-31'), false)
  assertEquals(isValidTimeString('06:30'), true)
  assertEquals(isValidTimeString('25:00'), false)
  assertEquals(normalizeTimeString('7:00 PM'), '19:00')
  assertEquals(normalizeTimeString('6:30 AM'), '06:30')
  assertEquals(isValidTimeZone('Asia/Kolkata'), true)
  assertEquals(isValidTimeZone('Fake/Tz'), false)
})

Deno.test('Asia/Kolkata Midnight Boundary Calculation', () => {
  const istDate1 = localDateInTimeZone('Asia/Kolkata', new Date('2026-11-15T18:29:59.000Z'))
  assertEquals(istDate1, '2026-11-15')

  const istDate2 = localDateInTimeZone('Asia/Kolkata', new Date('2026-11-15T18:30:00.000Z'))
  assertEquals(istDate2, '2026-11-16')
})

Deno.test('Recurrence Evaluation Matrix', () => {
  const dailyTask: TaskRow = {
    id: 'd-1',
    name: 'Daily Yoga',
    category: 'Wellness',
    duration: '30m',
    recurring: 'daily',
    created_at: '2026-11-01',
    description: JSON.stringify({ startDate: '2026-11-01' }),
  }

  const weekdayTask: TaskRow = {
    id: 'w-1',
    name: 'Code Review',
    category: 'Work',
    duration: '1h',
    recurring: 'weekdays',
    created_at: '2026-11-01',
    description: JSON.stringify({ startDate: '2026-11-01' }),
  }

  // 2026-11-15 is Sunday (weekday 0)
  // 2026-11-16 is Monday (weekday 1)
  assertEquals(taskOccursOnDate(dailyTask, '2026-11-15'), true)
  assertEquals(taskOccursOnDate(dailyTask, '2026-11-16'), true)

  assertEquals(taskOccursOnDate(weekdayTask, '2026-11-15'), false) // Sunday
  assertEquals(taskOccursOnDate(weekdayTask, '2026-11-16'), true)  // Monday
})

Deno.test('Safe Pagination: Older Recurring Tasks Preserved', () => {
  const oldRecurringTask: TaskRow = {
    id: 'old-1',
    name: 'Long-standing Daily Routine',
    category: 'Habits',
    duration: '15m',
    recurring: 'daily',
    created_at: '2026-01-01',
    description: JSON.stringify({ startDate: '2026-01-01' }),
  }

  const todayTask: TaskRow = {
    id: 'today-1',
    name: 'Today Task',
    category: 'General',
    duration: null,
    recurring: 'none',
    created_at: '2026-11-15',
    description: JSON.stringify({ startDate: '2026-11-15' }),
  }

  const candidateMap = new Map<string, TaskRow>()
  candidateMap.set(oldRecurringTask.id, oldRecurringTask)
  candidateMap.set(todayTask.id, todayTask)

  const matches = Array.from(candidateMap.values()).filter((t) =>
    taskOccursOnDate(t, '2026-11-15')
  )

  assertEquals(matches.length, 2)
  assertEquals(matches.some((t) => t.id === 'old-1'), true)
  assertEquals(matches.some((t) => t.id === 'today-1'), true)
})
