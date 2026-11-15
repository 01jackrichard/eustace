import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { localDateInTimeZone, taskOccursOnDate, type TaskRow } from '../supabase/functions/eustace-mcp/taskLogic.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const userId = Deno.env.get('EUSTACE_OWNER_USER_ID') || ''
const timeZone = Deno.env.get('EUSTACE_OWNER_TIME_ZONE') || 'Asia/Kolkata'

if (!supabaseUrl || !supabaseAnonKey || !userId) {
  console.error('Missing required environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, EUSTACE_OWNER_USER_ID)')
  Deno.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const today = localDateInTimeZone(timeZone)

console.log(`[Daily Reminder] Checking tasks for ${today} in ${timeZone}...`)

// 1. Fetch user's tasks
const { data: tasks, error: taskError } = await supabase
  .from('tasks')
  .select('id, name, created_at, recurring, description')
  .eq('user_id', userId)

if (taskError) {
  console.error('[Daily Reminder] Error fetching tasks:', taskError.message)
  Deno.exit(1)
}

const todaysTasks = (tasks as TaskRow[]).filter((t) => taskOccursOnDate(t, today))

if (todaysTasks.length === 0) {
  console.log(`[Daily Reminder] No tasks scheduled for ${today}.`)
  Deno.exit(0)
}

console.log(`[Daily Reminder] Found ${todaysTasks.length} task(s) scheduled for today.`)

// 2. Check completions for today's tasks
const taskIds = todaysTasks.map((t) => t.id)
const { data: completions, error: compError } = await supabase
  .from('task_completions')
  .select('task_id')
  .eq('user_id', userId)
  .eq('completed_date', today)
  .in('task_id', taskIds)

if (compError) {
  console.error('[Daily Reminder] Error fetching completions:', compError.message)
  Deno.exit(1)
}

const completedSet = new Set((completions || []).map((c: any) => c.task_id))
const pendingTasks = todaysTasks.filter((t) => !completedSet.has(t.id))

// Determine mode from CLI flag: --mode=morning | --mode=evening | auto
const modeArg = Deno.args.find((a) => a.startsWith('--mode='))?.split('=')[1]

let isMorning = true
if (modeArg === 'evening') {
  isMorning = false
} else if (modeArg === 'morning') {
  isMorning = true
} else {
  // auto based on local hour
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  })
  const currentHour = parseInt(formatter.format(new Date()), 10)
  isMorning = currentHour < 14 // Before 2 PM is morning, after is evening
}

const taskNames = todaysTasks.map((t) => `"${t.name}"`).join(', ')

let title = ''
let message = ''

if (isMorning) {
  title = '🌅 Eustace Morning Reminder'
  message = pendingTasks.length > 0
    ? `Today's DSA Topic: ${taskNames}. Ready to practice?`
    : `All tasks for today are already complete! Great job!`
} else {
  title = '🌙 Eustace Evening Check-in'
  message = pendingTasks.length > 0
    ? `Don't forget to complete: ${pendingTasks.map((t) => `"${t.name}"`).join(', ')} before the day ends!`
    : `Awesome work today! You completed ${taskNames}.`
}

console.log(`[Daily Reminder] Sending (${isMorning ? 'morning' : 'evening'}): ${title} - ${message}`)

// 3. Invoke send-push-notification Edge Function
const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-push-notification', {
  body: {
    userId,
    type: 'task_reminder',
    title,
    body: message,
    url: '/tasks',
    data: {
      date: today,
      pendingCount: pendingTasks.length,
    },
  },
})

if (pushError) {
  console.error('[Daily Reminder] Error invoking send-push-notification:', pushError)
  Deno.exit(1)
}

console.log('[Daily Reminder] Notification dispatched successfully:', pushResult)
