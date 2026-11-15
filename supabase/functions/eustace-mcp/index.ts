// Eustace personal ChatGPT & Antigravity MCP integration.
// All database requests use the authenticated user's Supabase client and existing RLS policies.
// This function intentionally does not use the service-role key.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1'
import { z } from 'npm:zod@^4.3.6'

import {
  TASK_COLUMNS,
  isValidDateString,
  isValidTimeZone,
  localDateInTimeZone,
  normalizeTimeString,
  parseMetadata,
  presentTask,
  sortTasksChronologically,
  taskOccursOnDate,
  type TaskMetadata,
  type TaskRow,
} from './taskLogic.ts'

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  }
}

const dateSchema = z.string().refine(isValidDateString, 'Use a real date in YYYY-MM-DD format.')

const timeSchema = z.string().transform((val, ctx) => {
  const norm = normalizeTimeString(val)
  if (!norm) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use 24-hour HH:mm or 12-hour h:mm A time format.' })
    return z.NEVER
  }
  return norm
})

const recurrenceSchema = z.enum(['none', 'daily', 'weekdays', 'weekly'])

/**
 * Safely fetches rows from a Supabase query with pagination.
 * Ensures that table row counts exceeding PostgREST's default max limit
 * are completely retrieved rather than truncated.
 */
async function fetchPaginatedTasks(
  queryBuilder: (from: number, to: number) => Promise<{ data: any; error: any }>,
  maxRows = 5000,
): Promise<TaskRow[]> {
  const PAGE_SIZE = 500
  const results: TaskRow[] = []
  let from = 0

  while (results.length < maxRows) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await queryBuilder(from, to)
    if (error) throw error
    if (!data || data.length === 0) break
    results.push(...(data as TaskRow[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return results
}

Deno.serve(
  pipeline(
    // Discovery must run before authentication so an MCP client can find Supabase Auth.
    // withSupabase verifies the OAuth token and creates an RLS-scoped client.
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (_req, { supabase, userClaims, jwtClaims }) => {
      const ownerUserId = Deno.env.get('EUSTACE_OWNER_USER_ID') || ''
      const ownerTimeZone = Deno.env.get('EUSTACE_OWNER_TIME_ZONE') || ''

      if (!ownerUserId || !ownerTimeZone || !isValidTimeZone(ownerTimeZone)) {
        return Response.json(
          {
            error:
              'Eustace MCP is not configured. Set EUSTACE_OWNER_USER_ID and a valid EUSTACE_OWNER_TIME_ZONE before enabling this endpoint.',
          },
          { status: 503 },
        )
      }

      // withSupabase has already verified the bearer token and provides its
      // verified claims. Use the JWT subject as the caller identity; never
      // accept a user ID supplied by an MCP tool argument.
      const userId =
        (typeof userClaims?.id === 'string' ? userClaims.id : '') ||
        (typeof (userClaims as any)?.sub === 'string' ? (userClaims as any).sub : '') ||
        (typeof jwtClaims?.sub === 'string' ? jwtClaims.sub : '')

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

            if (recurrence === 'none' && end_date) {
              throw new Error('A non-recurring task cannot have a recurrence end date.')
            }

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
                recurring: recurrence,
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
              'List tasks scheduled for a date in the owner’s Eustace account. Defaults to the owner’s current local date. Safely aggregates both recurring task definitions and date-specific tasks across pagination boundaries without omitting older recurring items. Returns completion status for the requested date.',
            inputSchema: z.object({
              date: dateSchema.optional(),
              limit: z.number().int().min(1).max(200).default(100),
            }),
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          async ({ date, limit }) => {
            const requestedDate = date || today

            // 1. Fetch recurring tasks (recurring != 'none') with pagination so older
            // recurring tasks are never pushed out by newer rows.
            let recurringTasks: TaskRow[] = []
            try {
              recurringTasks = await fetchPaginatedTasks((from, to) =>
                db
                  .from('tasks')
                  .select(TASK_COLUMNS)
                  .eq('user_id', userId)
                  .neq('recurring', 'none')
                  .order('created_at', { ascending: false })
                  .range(from, to),
              )
            } catch (err: any) {
              throw new Error('Could not load recurring Eustace tasks: ' + err.message)
            }

            // 2. Fetch one-off tasks (recurring = 'none') scheduled for requestedDate.
            let oneOffTasks: TaskRow[] = []
            try {
              oneOffTasks = await fetchPaginatedTasks((from, to) =>
                db
                  .from('tasks')
                  .select(TASK_COLUMNS)
                  .eq('user_id', userId)
                  .eq('recurring', 'none')
                  .eq('created_at', requestedDate)
                  .order('created_at', { ascending: false })
                  .range(from, to),
              )
            } catch (err: any) {
              throw new Error('Could not load scheduled Eustace tasks: ' + err.message)
            }

            // 3. Fallback: check for any one-off task whose description JSON holds
            // startDate = requestedDate in case created_at differed.
            let legacyMismatchTasks: TaskRow[] = []
            try {
              const { data: mismatchData } = await db
                .from('tasks')
                .select(TASK_COLUMNS)
                .eq('user_id', userId)
                .eq('recurring', 'none')
                .neq('created_at', requestedDate)
                .ilike('description', `%"startDate":"${requestedDate}"%`)
                .limit(200)
              if (mismatchData) legacyMismatchTasks = mismatchData as TaskRow[]
            } catch {
              // Non-critical fallback
            }

            // 4. Fetch completion status for the requested date.
            const { data: completionRows, error: completionError } = await db
              .from('task_completions')
              .select('task_id')
              .eq('user_id', userId)
              .eq('completed_date', requestedDate)

            if (completionError) throw new Error('Could not load task completion status: ' + completionError.message)

            const completedIds = new Set((completionRows || []).map((row: { task_id: string }) => row.task_id))

            // 5. Combine candidates, deduplicate by ID, and filter through occurrence rules.
            const candidateMap = new Map<string, TaskRow>()
            for (const task of [...oneOffTasks, ...legacyMismatchTasks, ...recurringTasks]) {
              candidateMap.set(task.id, task)
            }

            const occurringTasks = Array.from(candidateMap.values()).filter((task) =>
              taskOccursOnDate(task, requestedDate),
            )

            // 6. Sort tasks chronologically: timed items (00:00 - 23:59) first, then untimed.
            const sortedTasks = sortTasksChronologically(occurringTasks)

            // 7. Apply the requested limit to the finalized occurrences.
            const paginatedTasks = sortedTasks.slice(0, limit)
            const presented = paginatedTasks.map((task) => presentTask(task, completedIds.has(task.id)))

            return toolResult({
              date: requestedDate,
              count: presented.length,
              totalScheduled: sortedTasks.length,
              tasks: presented,
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
            const targetRecurrence = recurrence !== undefined ? recurrence : task.recurring

            if (targetRecurrence === 'none' && nextEndDate) {
              throw new Error('A non-recurring task cannot have a recurrence end date.')
            }

            if (nextEndDate && nextEndDate < nextDate) {
              throw new Error('The recurrence end date cannot be earlier than the scheduled start date.')
            }

            const updates: Record<string, unknown> = {}
            if (title !== undefined) updates.name = title.trim()
            if (category !== undefined) updates.category = category?.trim() || null
            if (duration !== undefined) updates.duration = duration?.trim() || null
            if (recurrence !== undefined) {
              updates.recurring = recurrence
              if (recurrence === 'none') {
                delete metadata.endDate
              }
            }
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
              message:
                'Task updated in Eustace. Recurring-task changes apply to the task definition, not a single occurrence.',
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
