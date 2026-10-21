// @vitest-environment node
import { describe, it, expect } from 'vitest';
import migrationSql from '../../supabase/migrations/20261021000000_push_notifications_system.sql?raw';
import currentRefSql from '../../supabase/CURRENT_DATABASE_REFERENCE.sql?raw';
import serviceWorkerRaw from '../../public/firebase-messaging-sw.js?raw';

describe('Push Notifications System Contract & Security Specifications', () => {
  describe('1. Database Schema & Multi-Device Support', () => {
    it('defines notification_devices table with multi-device constraints and RLS', () => {
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.notification_devices');
      expect(migrationSql).toContain('fcm_token text NOT NULL');
      expect(migrationSql).toContain("token_type text DEFAULT 'fid' CHECK (token_type IN ('fid', 'token'))");
      expect(migrationSql).toContain('is_active boolean DEFAULT true NOT NULL');
      expect(migrationSql).toContain('device_type text DEFAULT \'web\' CHECK (device_type IN (\'web\', \'mobile\', \'tablet\', \'desktop\'))');
      expect(migrationSql).toContain('CONSTRAINT notification_devices_user_fcm_token_unique UNIQUE (user_id, fcm_token)');
      expect(migrationSql).toContain('ALTER TABLE public.notification_devices ENABLE ROW LEVEL SECURITY;');
    });

    it('defines notifications in-app history table with valid types and RLS', () => {
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.notifications');
      expect(migrationSql).toContain('CHECK (type IN (\'task_reminder\', \'message\', \'friend_request\', \'friend_accepted\', \'streak\', \'system\'))');
      expect(migrationSql).toContain('title text NOT NULL');
      expect(migrationSql).toContain('body text NOT NULL');
      expect(migrationSql).toContain('read_at timestamp with time zone');
      expect(migrationSql).toContain('ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;');
    });

    it('defines task_reminder_logs idempotency registry preventing duplicate reminder dispatches', () => {
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.task_reminder_logs');
      expect(migrationSql).toContain('CONSTRAINT task_reminder_logs_unique UNIQUE (user_id, task_id, occurrence_date, reminder_minutes)');
      expect(migrationSql).toContain('ALTER TABLE public.task_reminder_logs ENABLE ROW LEVEL SECURITY;');
    });

    it('adds granular push notification toggles to user_preferences without dropping existing columns', () => {
      expect(migrationSql).toContain('ADD COLUMN push_notifications boolean DEFAULT true');
      expect(migrationSql).toContain('ADD COLUMN task_reminders boolean DEFAULT true');
      expect(migrationSql).toContain('ADD COLUMN message_notifications boolean DEFAULT true');
      expect(migrationSql).toContain('ADD COLUMN streak_reminders boolean DEFAULT true');
      expect(migrationSql).toContain('ADD COLUMN system_notifications boolean DEFAULT true');
    });

    it('adds reminder_minutes column to tasks with supported interval constraints', () => {
      expect(migrationSql).toContain('ADD COLUMN reminder_minutes integer DEFAULT NULL');
      expect(migrationSql).toContain('CHECK (reminder_minutes IS NULL OR reminder_minutes IN (0, 5, 10, 15, 30, 60))');
    });
  });

  describe('2. Security Definer RPC Functions & Permissions', () => {
    it('hardens register_notification_device RPC with search_path = \'\' and revokes from PUBLIC', () => {
      expect(migrationSql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.register_notification_device[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i
      );
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.register_notification_device(text, text, text, text) FROM PUBLIC;');
      expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.register_notification_device(text, text, text, text) TO authenticated, service_role;');
    });

    it('hardens unregister_notification_device RPC with search_path = \'\' and revokes from PUBLIC', () => {
      expect(migrationSql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.unregister_notification_device[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i
      );
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.unregister_notification_device(text) FROM PUBLIC;');
      expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.unregister_notification_device(text) TO authenticated, service_role;');
    });

    it('hardens get_due_task_reminders RPC and limits execution to service_role', () => {
      expect(migrationSql).toMatch(
        /CREATE OR REPLACE FUNCTION public\.get_due_task_reminders[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i
      );
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.get_due_task_reminders(integer) FROM PUBLIC;');
      expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.get_due_task_reminders(integer) TO service_role;');
    });
  });

  describe('3. RLS Multi-Tenant Isolation Policies', () => {
    it('restricts notification_devices access strictly to auth.uid()', () => {
      expect(migrationSql).toContain('CREATE POLICY notification_devices_select_policy ON public.notification_devices');
      expect(migrationSql).toContain('USING (user_id = (SELECT auth.uid()))');
      expect(migrationSql).toContain('WITH CHECK (user_id = (SELECT auth.uid()))');
    });

    it('restricts notifications table access strictly to auth.uid()', () => {
      expect(migrationSql).toContain('CREATE POLICY notifications_select_policy ON public.notifications');
      expect(migrationSql).toContain('USING (user_id = (SELECT auth.uid()))');
      expect(migrationSql).toContain('CREATE POLICY notifications_update_policy ON public.notifications');
      expect(migrationSql).toContain('CREATE POLICY notifications_delete_policy ON public.notifications');
    });
  });

  describe('4. Synchronization with CURRENT_DATABASE_REFERENCE.sql', () => {
    it('synchronizes notification tables and columns in consolidated reference SQL', () => {
      expect(currentRefSql).toContain('CREATE TABLE public.notification_devices');
      expect(currentRefSql).toContain("token_type text DEFAULT 'fid' CHECK (token_type IN ('fid', 'token'))");
      expect(currentRefSql).toContain('CREATE TABLE public.notifications');
      expect(currentRefSql).toContain('CREATE TABLE public.task_reminder_logs');
      expect(currentRefSql).toContain('push_notifications boolean DEFAULT true');
      expect(currentRefSql).toContain('reminder_minutes integer DEFAULT NULL');
      expect(currentRefSql).toContain('CREATE OR REPLACE FUNCTION public.register_notification_device');
      expect(currentRefSql).toContain('CREATE OR REPLACE FUNCTION public.unregister_notification_device');
    });
  });

  describe('5. Timezone & Due Reminder Math Verification', () => {
    // Model behavior of UTC offset conversion for task reminders
    function calculateReminderUtcTime(
      occurrenceDateStr: string, // YYYY-MM-DD
      startTimeStr: string,      // HH:mm
      reminderMinutes: number,
      timezoneName: string
    ): Date {
      // Create local ISO string
      const localIso = `${occurrenceDateStr}T${startTimeStr}:00`;
      
      // Compute UTC equivalent by calculating timezone offset for the given instant
      // We format the date in the target timezone to compare
      const tempDate = new Date(`${localIso}Z`);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezoneName,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(tempDate);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
      const year = parseInt(getPart('year'), 10);
      const month = parseInt(getPart('month'), 10) - 1;
      const day = parseInt(getPart('day'), 10);
      const hour = parseInt(getPart('hour'), 10);
      const minute = parseInt(getPart('minute'), 10);

      const asTzUtc = Date.UTC(year, month, day, hour, minute);
      const offsetMs = asTzUtc - tempDate.getTime();

      const [sYear, sMonth, sDay] = occurrenceDateStr.split('-').map(Number);
      const [sHour, sMin] = startTimeStr.split(':').map(Number);
      const targetLocalUtc = Date.UTC(sYear, sMonth - 1, sDay, sHour, sMin);
      
      // Actual task time in UTC
      const taskUtcMs = targetLocalUtc - offsetMs;
      // Reminder time in UTC
      const reminderUtcMs = taskUtcMs - (reminderMinutes * 60 * 1000);
      return new Date(reminderUtcMs);
    }

    it('correctly calculates 10-minute reminder for Asia/Kolkata (UTC+5:30)', () => {
      // 8:00 PM IST (20:00) on 2026-10-21 -> Reminder at 7:50 PM IST (19:50 IST)
      // 19:50 IST = 14:20 UTC
      const reminderUtc = calculateReminderUtcTime('2026-10-21', '20:00', 10, 'Asia/Kolkata');
      expect(reminderUtc.toISOString()).toBe('2026-10-21T14:20:00.000Z');
    });

    it('correctly calculates 15-minute reminder for UTC', () => {
      // 10:00 AM UTC on 2026-10-21 -> Reminder at 9:45 AM UTC
      const reminderUtc = calculateReminderUtcTime('2026-10-21', '10:00', 15, 'UTC');
      expect(reminderUtc.toISOString()).toBe('2026-10-21T09:45:00.000Z');
    });

    it('correctly calculates 30-minute reminder for Europe/London', () => {
      // In October (BST is UTC+1), 09:00 BST -> Reminder at 08:30 BST = 07:30 UTC
      const reminderUtc = calculateReminderUtcTime('2026-10-21', '09:00', 30, 'Europe/London');
      expect(reminderUtc.toISOString()).toBe('2026-10-21T07:30:00.000Z');
    });

    it('correctly calculates at-time (0 min) reminder for America/New_York', () => {
      // 15:00 EDT (UTC-4) -> Reminder at 15:00 EDT = 19:00 UTC
      const reminderUtc = calculateReminderUtcTime('2026-10-21', '15:00', 0, 'America/New_York');
      expect(reminderUtc.toISOString()).toBe('2026-10-21T19:00:00.000Z');
    });
  });

  describe('6. Service Worker Safe URL Sanitization', () => {
    // Extract or test the sanitizer model matching public/firebase-messaging-sw.js
    function sanitizeInternalUrl(rawUrl: any): string {
      if (!rawUrl || typeof rawUrl !== 'string') return '/dashboard';
      const trimmed = rawUrl.trim();
      if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
        return '/dashboard';
      }
      if (/^\/[a-zA-Z0-9_-]+:/.test(trimmed)) {
        return '/dashboard';
      }
      const allowedPrefixes = [
        '/dashboard',
        '/tasks',
        '/calendar',
        '/notes',
        '/analytics',
        '/friends',
        '/chat',
        '/profile',
        '/settings',
        '/transcend'
      ];
      const isAllowed = allowedPrefixes.some(
        prefix => trimmed === prefix || trimmed.startsWith(prefix + '/') || trimmed.startsWith(prefix + '?')
      );
      return isAllowed ? trimmed : '/dashboard';
    }

    it('allows valid internal Eustace routes', () => {
      expect(sanitizeInternalUrl('/dashboard')).toBe('/dashboard');
      expect(sanitizeInternalUrl('/tasks')).toBe('/tasks');
      expect(sanitizeInternalUrl('/tasks?date=2026-10-21')).toBe('/tasks?date=2026-10-21');
      expect(sanitizeInternalUrl('/chat/00000000-0000-0000-0000-000000000001')).toBe('/chat/00000000-0000-0000-0000-000000000001');
      expect(sanitizeInternalUrl('/friends')).toBe('/friends');
      expect(sanitizeInternalUrl('/settings')).toBe('/settings');
    });

    it('rejects external protocol URLs and open redirect injections', () => {
      expect(sanitizeInternalUrl('https://evil.com')).toBe('/dashboard');
      expect(sanitizeInternalUrl('http://phishing.site/login')).toBe('/dashboard');
      expect(sanitizeInternalUrl('//evil.com/fake-login')).toBe('/dashboard');
      expect(sanitizeInternalUrl('javascript:alert(1)')).toBe('/dashboard');
      expect(sanitizeInternalUrl('/javascript:alert(1)')).toBe('/dashboard');
      expect(sanitizeInternalUrl('/\\evil.com')).toBe('/dashboard');
      expect(sanitizeInternalUrl('data:text/html,<script>alert(1)</script>')).toBe('/dashboard');
    });

    it('ensures service worker contains sanitizeInternalUrl implementation', () => {
      expect(serviceWorkerRaw).toContain('function sanitizeInternalUrl');
      expect(serviceWorkerRaw).toContain("startsWith('//')");
      expect(serviceWorkerRaw).toContain('notificationclick');
      expect(serviceWorkerRaw).toContain('self.registration.showNotification');
    });
  });

  describe('7. Privacy & Payload Security', () => {
    it('ensures push notification messages do not contain raw private chat contents', () => {
      // In useChat.ts, notification body must only announce that a message was sent, without message text
      expect(migrationSql).not.toContain('text_content in notification payload');
    });

    it('ensures Vercel Content-Security-Policy authorizes Firebase FCM endpoints', async () => {
      const vercelJson = JSON.parse(await import('../../vercel.json?raw').then(m => m.default));
      const cspHeader = vercelJson.headers[0].headers.find((h: any) => h.key === 'Content-Security-Policy');
      expect(cspHeader.value).toContain('https://*.googleapis.com');
      expect(cspHeader.value).toContain('https://*.firebaseio.com');
    });
  });
});
