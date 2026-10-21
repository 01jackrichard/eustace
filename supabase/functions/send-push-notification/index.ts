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

    const body = await req.json();
    const { userId, type, title, body: messageBody, url, data } = body;

    if (!userId || !title || !messageBody) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize internal URL strictly
    let sanitizedUrl = '/dashboard';
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) {
      sanitizedUrl = url;
    }

    // 1. Check user preferences
    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    let shouldDeliverPush = true;
    if (prefs) {
      if (prefs.push_notifications === false) {
        shouldDeliverPush = false;
      } else if (type === 'message' && prefs.message_notifications === false) {
        shouldDeliverPush = false;
      } else if ((type === 'friend_request' || type === 'friend_accepted') && prefs.friend_request_notifications === false) {
        shouldDeliverPush = false;
      } else if (type === 'task_reminder' && prefs.task_reminders === false) {
        shouldDeliverPush = false;
      } else if (type === 'streak' && prefs.streak_reminders === false) {
        shouldDeliverPush = false;
      } else if (type === 'system' && prefs.system_notifications === false) {
        shouldDeliverPush = false;
      }
    }

    // 2. Persist in-app notification record
    const { data: insertedNotification, error: notifError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        type: type || 'system',
        title: title.slice(0, 100),
        body: messageBody.slice(0, 300),
        data: { url: sanitizedUrl, ...(data || {}) }
      })
      .select()
      .single();

    if (notifError) {
      console.warn('[send-push-notification] Error recording in-app notification:', notifError);
    }

    if (!shouldDeliverPush) {
      return new Response(
        JSON.stringify({
          success: true,
          deliveredDevices: 0,
          reason: 'Push notifications disabled by user preferences',
          notificationId: insertedNotification?.id
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Find active user devices
    const { data: devices, error: devError } = await supabaseAdmin
      .from('notification_devices')
      .select('id, fcm_token, token_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (devError || !devices || devices.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          deliveredDevices: 0,
          reason: 'No active devices registered',
          notificationId: insertedNotification?.id
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Send FCM Push Notification to each active device (supporting FID and token targets)
    let deliveredCount = 0;
    const deactivatedTokens: string[] = [];

    for (const device of devices) {
      const result = await sendFcmMessage({
        token: device.fcm_token,
        tokenType: (device.token_type as 'fid' | 'token') || 'fid',
        title,
        body: messageBody,
        url: sanitizedUrl,
        data: {
          type: type || 'system',
          notification_id: insertedNotification?.id || '',
          ...(data || {})
        }
      });

      if (result.success) {
        deliveredCount++;
      } else if (result.isUnregistered) {
        deactivatedTokens.push(device.fcm_token);
      }
    }

    // 5. Deactivate expired / invalid tokens
    if (deactivatedTokens.length > 0) {
      await supabaseAdmin
        .from('notification_devices')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('fcm_token', deactivatedTokens);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deliveredDevices: deliveredCount,
        notificationId: insertedNotification?.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[send-push-notification] Unhandled exception:', err.message || err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
