import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendFcmMessage } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are natively provided by Supabase Edge runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase server environment variables not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch due task reminders via database RPC
    const { data: dueReminders, error: rpcErr } = await supabaseAdmin.rpc('get_due_task_reminders', {
      p_window_minutes: 5
    });

    if (rpcErr) {
      console.error('[dispatch-task-reminders] Error querying due reminders:', rpcErr.message || rpcErr);
      return new Response(
        JSON.stringify({ error: 'Failed to query due reminders' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, dispatchedCount: 0, message: 'No reminders currently due' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let dispatchedCount = 0;
    const staleTokens: string[] = [];

    for (const reminder of dueReminders) {
      // 2. Atomic Idempotency Check: Insert into task_reminder_logs
      const { error: logErr } = await supabaseAdmin
        .from('task_reminder_logs')
        .insert({
          user_id: reminder.user_id,
          task_id: reminder.task_id,
          occurrence_date: reminder.occurrence_date,
          reminder_minutes: reminder.reminder_minutes
        });

      if (logErr) {
        // Unique constraint violation (23505) indicates this reminder was already processed by a concurrent run
        continue;
      }

      // 3. Format Notification Message
      const title = '🔔 Eustace';
      const body =
        reminder.reminder_minutes === 0
          ? `"${reminder.task_name}" is starting now.`
          : `"${reminder.task_name}" starts in ${reminder.reminder_minutes} minutes.`;

      // 4. In-App Notification Record
      const { data: insertedNotif } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: reminder.user_id,
          type: 'task_reminder',
          title,
          body,
          data: {
            url: '/tasks',
            task_id: reminder.task_id,
            occurrence_date: reminder.occurrence_date
          }
        })
        .select()
        .single();

      // 5. Send FCM message to all active user device targets (FID or token)
      const rawDevices = reminder.devices || reminder.fcm_tokens;
      const deviceList: Array<{ token: string; type?: 'fid' | 'token' }> = Array.isArray(rawDevices)
        ? rawDevices.map((d: any) => (typeof d === 'string' ? { token: d, type: 'fid' } : d))
        : [];

      for (const dev of deviceList) {
        const sendRes = await sendFcmMessage({
          token: dev.token,
          tokenType: dev.type || 'fid',
          title,
          body,
          url: '/tasks',
          data: {
            type: 'task_reminder',
            task_id: reminder.task_id,
            notification_id: insertedNotif?.id || ''
          }
        });

        if (sendRes.success) {
          dispatchedCount++;
        } else if (sendRes.isUnregistered) {
          staleTokens.push(dev.token);
        }
      }
    }

    // 6. Deactivate stale tokens
    if (staleTokens.length > 0) {
      await supabaseAdmin
        .from('notification_devices')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('fcm_token', staleTokens);
    }

    return new Response(
      JSON.stringify({
        success: true,
        dueCount: dueReminders.length,
        dispatchedCount
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[dispatch-task-reminders] Unhandled exception:', err.message || err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
