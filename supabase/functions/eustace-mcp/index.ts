// Eustace personal ChatGPT MCP integration.
// All database requests use the authenticated user's Supabase client and existing RLS policies.
// This function intentionally does not use the service-role key.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1'
import { z } from 'npm:zod@^4.3.6'

type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly'

type TaskMetadata = {
  notes?: string
  startDate?: string
  endDate?: string
  startTime?: string
  skippedDates?: string[]
  icon?: string
  rrule?: string
  [key: string]: unknown
}

type TaskRow = {
  id: string
  name: string
  category: string | null
  duration: string | null
  recurring: Recurrence
  created_at: string
  description: string | null
  updated_at?: string
}

const TASK_COLUMNS = 'id,name,category,duration,recurring,created_at,description,updated_at'

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isValidTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function localDateInTimeZone(timeZone: string, instant = new Date()): string {
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

function weekdayOf(dateString: string): number {
  return new Date(dateString + 'T00:00:00.000Z').getUTCDay()
}

function daysInMonth(year: number, monthOneBased: number): number {
  return new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate()
}

function parseMetadata(description: string | null): TaskMetadata {
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

function taskOccursOnDate(task: TaskRow, dateString: string): boolean {
  const metadata = parseMetadata(task.description)
  const startDate = isValidDateString(metadata.startDate || '')
    ? metadata.startDate as string
    : task.created_at.slice(0, 10)

  if (dateString < startDate) return false
  if (metadata.endDate && isValidDateString(metadata.endDate) && dateString > metadata.endDate) return false
  if (Array.isArray(metadata.skippedDates) && metadata.skippedDates.includes(dateString)) return false

  switch (task.recurring) {
    case 'none':
      return task.created_at.slice(0, 10) === dateString
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

function presentTask(task: TaskRow, completed: boolean) {
  const metadata = parseMetadata(task.description)
  return {
    id: task.id,
    title: task.name,
    category: task.category,
    duration: task.duration,
    scheduledDate: metadata.startDate || task.created_at.slice(0, 10),
    recurrence: task.recurring,
    recurrenceEndDate: metadata.endDate || null,
    startTime: metadata.startTime || null,
    notes: metadata.notes || null,
    icon: metadata.icon || null,
    completed,
  }
}

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  }
}

const dateSchema = z.string().refine(isValidDateString, 'Use a real date in YYYY-MM-DD format.')
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm time.')

const recurrenceSchema = z.enum(['none', 'daily', 'weekdays', 'weekly'])

Deno.serve(
  pipeline(
    // Discovery must run before authentication so an MCP client can find Supabase Auth.
    // withSupabase verifies the OAuth token and creates an RLS-scoped client.
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (_req, { supabase, userClaims }) => {
      const ownerUserId = Deno.env.get('EUSTACE_OWNER_USER_ID') || ''
      const ownerTimeZone = Deno.env.get('EUSTACE_OWNER_TIME_ZONE') || ''

      if (!ownerUserId || !ownerTimeZone || !isValidTimeZone(ownerTimeZone)) {
        return Response.json(
          {
            error: 'Eustace MCP is not configured. Set EUSTACE_OWNER_USER_ID and a valid EUSTACE_OWNER_TIME_ZONE before enabling this endpoint.',
          },
          { status: 503 },
        )
      }

      // withSupabase has already verified the bearer token and provides its
      // verified claims. Use the JWT subject as the caller identity; never
      // accept a user ID supplied by an MCP tool argument.
      const userId = typeof userClaims?.sub === 'string' ? userClaims.sub : ''

      if (!userId) {
        return Response.json({ error: 'A valid Eustace sign-in is required.' }, { status: 401 })
      }

      // This integration is intentionally single-account, even though the OAuth
      // authorization server may support other Eustace users.
      if (userId !== ownerUserId) {
        return Response.json({ error: 'This Eustace integration is not enabled for this account.' }, { status: 403 })
      }

      // Every query below uses the caller-scoped client. Never replace this with
      // the service-role client: the database's existing RLS remains in force.
      const db = supabase as any
      const today = localDateInTimeZone(ownerTimeZone)

      const handler = createMcpHandler(() => {
        const server = new McpServer({ name: 'eustace', version: '1.0.0' })

        server.registerTool(
          'create_task',
          {
            title: 'Create an Eustace task',
            description:
              'Create a task in the signed-in owner’s Eustace account. Supports title, date, category, duration, notes, start time, recurrence, and recurrence end date. The account-local date is used when date is omitted. Recurrence is currently limited to none, daily, weekdays, or weekly because those are the values accepted by the live database schema. Reminders are intentionally omitted until the production reminder schema is reconciled.',
            inputSchema: z.object({
              title: z.string().trim().min(1).max(160),
              date: dateSchema.optional(),
              category: z.string().trim().max(80).nullable().optional(),
              duration: z.string().trim().max(80).nullable().optional(),
              notes: z.string().max(5000).nullable().optional(),
              start_time: timeSchema.nullable().optional(),
              recurrence: recurrenceSchema.default('none'),
              end_date: dateSchema.nullable().optional(),
            }),
            annotations: { destructiveHint: false },
          },
          async ({ title, date, category, duration, notes, start_time, recurrence, end_date }) => {
            const scheduledDate = date || today
            if (end_date && end_date < scheduledDate) {
              throw new Error('The recurrence end date cannot be earlier than the scheduled start date.')
            }

            const metadata: TaskMetadata = { startDate: scheduledDate }
            if (notes?.trim()) metadata.notes = notes.trim()
            if (start_time) metadata.startTime = start_time
            if (end_date) metadata.endDate = end_date

            const { data, error } = await db
              .from('tasks')
              .insert({
                user_id: userId,
                name: title.trim(),
                category: category?.trim() || null,
                duration: duration?.trim() || null,
                recurring,
                created_at: scheduledDate,
                description: JSON.stringify(metadata),
              })
              .select(TASK_COLUMNS)
              .single()

            if (error) throw new Error('Could not create the Eustace task: ' + error.message)

            return toolResult({
              success: true,
              message: 'Task created in Eustace.',
              task: presentTask(data as TaskRow, false),
            })
          },
        )

        server.registerTool(
          'list_tasks',
          {
            title: 'View Eustace tasks',
            description:
              'List tasks scheduled for a date in the owner’s Eustace account. Defaults to the owner’s current local date. Recurring occurrences and skipped dates follow Eustace task metadata. Returns completion status for the requested date.',
            inputSchema: z.object({
              date: dateSchema.optional(),
              limit: z.number().int().min(1).max(200).default(100),
            }),
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          async ({ date, limit }) => {
            const requestedDate = date || today
            const { data: taskRows, error: taskError } = await db
              .from('tasks')
              .select(TASK_COLUMNS)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(limit)

            if (taskError) throw new Error('Could not load Eustace tasks: ' + taskError.message)

            const { data: completionRows, error: completionError } = await db
              .from('task_completions')
              .select('task_id')
              .eq('user_id', userId)
              .eq('completed_date', requestedDate)

            if (completionError) throw new Error('Could not load task completion status: ' + completionError.message)

            const completedIds = new Set((completionRows || []).map((row: { task_id: string }) => row.task_id))
            const scheduledTasks = ((taskRows || []) as TaskRow[])
              .filter((task) => taskOccursOnDate(task, requestedDate))
              .map((task) => presentTask(task, completedIds.has(task.id)))

            return toolResult({
              date: requestedDate,
              count: scheduledTasks.length,
              tasks: scheduledTasks,
            })
          },
        )

        server.registerTool(
          'update_task',
          {
            title: 'Update an Eustace task',
            description:
              'Update fields on an existing Eustace task. For a recurring task, changes update the recurring task definition and therefore affect its future occurrences; this tool does not edit only one occurrence. Set nullable fields to null to clear them.',
            inputSchema: z.object({
              task_id: z.string().uuid(),
              title: z.string().trim().min(1).max(160).optional(),
              date: dateSchema.optional(),
              category: z.string().trim().max(80).nullable().optional(),
              duration: z.string().trim().max(80).nullable().optional(),
              notes: z.string().max(5000).nullable().optional(),
              start_time: timeSchema.nullable().optional(),
              recurrence: recurrenceSchema.optional(),
              end_date: dateSchema.nullable().optional(),
            }),
            annotations: { destructiveHint: false },
          },
          async ({ task_id, title, date, category, duration, notes, start_time, recurrence, end_date }) => {
            const hasUpdate =
              title !== undefined ||
              date !== undefined ||
              category !== undefined ||
              duration !== undefined ||
              notes !== undefined ||
              start_time !== undefined ||
              recurrence !== undefined ||
              end_date !== undefined

            if (!hasUpdate) throw new Error('Provide at least one field to update.')

            const { data: existing, error: readError } = await db
              .from('tasks')
              .select(TASK_COLUMNS)
              .eq('id', task_id)
              .eq('user_id', userId)
              .maybeSingle()

            if (readError) throw new Error('Could not load the Eustace task: ' + readError.message)
            if (!existing) throw new Error('Task not found in your Eustace account.')

            const task = existing as TaskRow
            const metadata = parseMetadata(task.description)
            const nextDate = date || (metadata.startDate as string | undefined) || task.created_at.slice(0, 10)
            const nextEndDate = end_date === undefined ? (metadata.endDate as string | undefined) : end_date || undefined

            if (nextEndDate && nextEndDate < nextDate) {
              throw new Error('The recurrence end date cannot be earlier than the scheduled start date.')
            }

            const updates: Record<string, unknown> = {}
            if (title !== undefined) updates.name = title.trim()
            if (category !== undefined) updates.category = category?.trim() || null
            if (duration !== undefined) updates.duration = duration?.trim() || null
            if (recurrence !== undefined) updates.recurring = recurrence
            if (date !== undefined) {
              updates.created_at = date
              metadata.startDate = date
            }
            if (notes !== undefined) {
              if (notes?.trim()) metadata.notes = notes.trim()
              else delete metadata.notes
            }
            if (start_time !== undefined) {
              if (start_time) metadata.startTime = start_time
              else delete metadata.startTime
            }
            if (end_date !== undefined) {
              if (end_date) metadata.endDate = end_date
              else delete metadata.endDate
            }

            updates.description = JSON.stringify(metadata)

            const { data: updated, error: updateError } = await db
              .from('tasks')
              .update(updates)
              .eq('id', task_id)
              .eq('user_id', userId)
              .select(TASK_COLUMNS)
              .single()

            if (updateError) throw new Error('Could not update the Eustace task: ' + updateError.message)

            return toolResult({
              success: true,
              message: 'Task updated in Eustace. Recurring-task changes apply to the task definition, not a single occurrence.',
              task: presentTask(updated as TaskRow, false),
            })
          },
        )

        server.registerTool(
          'complete_task',
          {
            title: 'Complete an Eustace task',
            description:
              'Mark a task complete for the owner’s current local date only. Eustace does not allow tasks to be completed early or retroactively. The task must be scheduled for today. This operation is idempotent.',
            inputSchema: z.object({
              task_id: z.string().uuid(),
            }),
            annotations: { destructiveHint: false },
          },
          async ({ task_id }) => {
            const { data: taskData, error: taskError } = await db
              .from('tasks')
              .select(TASK_COLUMNS)
              .eq('id', task_id)
              .eq('user_id', userId)
              .maybeSingle()

            if (taskError) throw new Error('Could not load the Eustace task: ' + taskError.message)
            if (!taskData) throw new Error('Task not found in your Eustace account.')

            const task = taskData as TaskRow
            if (!taskOccursOnDate(task, today)) {
              throw new Error('This task is not scheduled for today in your Eustace account.')
            }

            const { data: existingCompletion, error: completionReadError } = await db
              .from('task_completions')
              .select('id')
              .eq('user_id', userId)
              .eq('task_id', task_id)
              .eq('completed_date', today)
              .maybeSingle()

            if (completionReadError) {
              throw new Error('Could not check task completion status: ' + completionReadError.message)
            }

            if (existingCompletion) {
              return toolResult({
                success: true,
                alreadyCompleted: true,
                message: 'This task is already marked complete for today.',
                task: presentTask(task, true),
              })
            }

            const { error: insertError } = await db
              .from('task_completions')
              .insert({
                user_id: userId,
                task_id,
                completed_date: today,
              })

            if (insertError && insertError.code !== '23505') {
              throw new Error('Could not complete the Eustace task: ' + insertError.message)
            }

            return toolResult({
              success: true,
              alreadyCompleted: insertError?.code === '23505',
              message: 'Task marked complete for ' + today + '.',
              task: presentTask(task, true),
            })
          },
        )

        server.registerTool(
          'delete_task',
          {
            title: 'Delete an Eustace task',
            description:
              'Permanently delete a task from the owner’s Eustace account. Deleting a recurring task removes the entire recurring task definition. The database cascades deletion to its task-completion history.',
            inputSchema: z.object({
              task_id: z.string().uuid(),
            }),
            annotations: { destructiveHint: true },
          },
          async ({ task_id }) => {
            const { data: existing, error: readError } = await db
              .from('tasks')
              .select(TASK_COLUMNS)
              .eq('id', task_id)
              .eq('user_id', userId)
              .maybeSingle()

            if (readError) throw new Error('Could not load the Eustace task: ' + readError.message)
            if (!existing) throw new Error('Task not found in your Eustace account.')

            const { error: deleteError } = await db
              .from('tasks')
              .delete()
              .eq('id', task_id)
              .eq('user_id', userId)

            if (deleteError) throw new Error('Could not delete the Eustace task: ' + deleteError.message)

            return toolResult({
              success: true,
              message: 'Task deleted. Its task-completion history was removed by the existing database cascade.',
              deletedTask: presentTask(existing as TaskRow, false),
            })
          },
        )

        return server
      })

      return handler.fetch(_req)
    },
  ),
)
