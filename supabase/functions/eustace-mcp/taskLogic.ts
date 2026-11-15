// Eustace Task & Calendar Logic for MCP Server and Testing
// Pure TypeScript module without runtime dependencies.

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly'

export type TaskMetadata = {
  notes?: string
  startDate?: string
  endDate?: string
  startTime?: string
  skippedDates?: string[]
  icon?: string
  iconColor?: string
  status?: 'pending' | 'skipped' | 'cancelled'
  rrule?: string
  [key: string]: unknown
}

export type TaskRow = {
  id: string
  user_id?: string
  name: string
  category: string | null
  duration: string | null
  recurring: Recurrence
  created_at: string
  description: string | null
  updated_at?: string
}

export const TASK_COLUMNS = 'id,name,category,duration,recurring,created_at,description,updated_at'

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function isValidTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function normalizeTimeString(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM|am|pm))?$/i)
  if (!match) {
    const matchHour = trimmed.match(/^(\d{1,2})(?:\s*(AM|PM|am|pm))?$/i)
    if (!matchHour) return null
    let h = parseInt(matchHour[1], 10)
    const ampm = matchHour[2]?.toUpperCase()
    if (ampm === 'PM' && h < 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    if (isNaN(h) || h < 0 || h > 23) return null
    return `${String(h).padStart(2, '0')}:00`
  }
  let h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const ampm = match[3]?.toUpperCase()
  if (ampm === 'PM' && h < 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function localDateInTimeZone(timeZone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) throw new Error('Could not determine the account-local date.')
  return [year, month, day].join('-')
}

export function weekdayOf(dateString: string): number {
  return new Date(dateString + 'T00:00:00.000Z').getUTCDay()
}

export function parseMetadata(description: string | null): TaskMetadata {
  if (!description) return {}
  try {
    const parsed: unknown = JSON.parse(description)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as TaskMetadata
    }
  } catch {
    // Legacy descriptions that are not JSON are not treated as task metadata.
  }
  return {}
}

export function taskOccursOnDate(task: TaskRow, dateString: string): boolean {
  const metadata = parseMetadata(task.description)

  // Cancelled tasks do not occur on any date
  if (metadata.status === 'cancelled') return false

  // Skipped dates
  if (Array.isArray(metadata.skippedDates) && metadata.skippedDates.includes(dateString)) {
    return false
  }

  // Non-recurring task: occurs only on its scheduled date
  if (task.recurring === 'none') {
    const taskDate = task.created_at.slice(0, 10)
    const startDate = isValidDateString(metadata.startDate || '') ? (metadata.startDate as string) : taskDate
    return taskDate === dateString || startDate === dateString
  }

  // Recurring task: check start date
  const startDate = isValidDateString(metadata.startDate || '')
    ? (metadata.startDate as string)
    : task.created_at.slice(0, 10)

  if (dateString < startDate) return false

  // Check end date
  if (metadata.endDate && isValidDateString(metadata.endDate) && dateString > metadata.endDate) {
    return false
  }

  switch (task.recurring) {
    case 'daily':
      return true
    case 'weekdays': {
      const weekday = weekdayOf(dateString)
      return weekday >= 1 && weekday <= 5
    }
    case 'weekly':
      return weekdayOf(startDate) === weekdayOf(dateString)
    default:
      return false
  }
}

export function getScheduledMinutes(task: TaskRow): number | null {
  const meta = parseMetadata(task.description)
  // Authoritative scheduled clock time from metadata only.
  // Duration values (e.g. "01:00" for 1 hour duration) must never be interpreted as clock times.
  const timeCandidate = meta.startTime
  if (!timeCandidate || typeof timeCandidate !== 'string') return null
  const match = timeCandidate.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m
  return null
}

export function sortTasksChronologically(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => {
    const timeA = getScheduledMinutes(a)
    const timeB = getScheduledMinutes(b)
    if (timeA !== null && timeB !== null) return timeA - timeB
    if (timeA !== null && timeB === null) return -1
    if (timeA === null && timeB !== null) return 1
    return a.name.localeCompare(b.name)
  })
}

export function presentTask(task: TaskRow, completed: boolean) {
  const metadata = parseMetadata(task.description)
  const scheduledDate =
    task.recurring === 'none'
      ? task.created_at.slice(0, 10)
      : (isValidDateString(metadata.startDate || '') ? (metadata.startDate as string) : task.created_at.slice(0, 10))

  return {
    id: task.id,
    title: task.name,
    category: task.category,
    duration: task.duration,
    scheduledDate,
    recurrence: task.recurring,
    recurrenceEndDate: metadata.endDate || null,
    startTime: metadata.startTime || null,
    notes: metadata.notes || null,
    icon: metadata.icon || null,
    completed,
  }
}
