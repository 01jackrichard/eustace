# Eustace Push Notification System

Complete end-to-end documentation for the Eustace Push Notification System powered by **Firebase Cloud Messaging (FCM)**, **W3C Web Push**, and **Supabase Edge Functions**.

---

## 1. System Architecture & Notification Flow

```text
                           EUSTACE CLIENT (Browser / PWA)
                                        │
           1. Notification Permission   │ 2. FCM Web Token
           (User grants permission)     │ (via VAPID key)
                                        ▼
                           NOTIFICATION SERVICE & HOOK
                                        │
               3. RPC register_notification_device (atomic upsert)
                                        ▼
                                 SUPABASE DATABASE
                        ├── public.notification_devices (multi-device)
                        ├── public.user_preferences (granular toggles)
                        ├── public.task_reminder_logs (idempotency registry)
                        └── public.notifications (in-app history)
                                        ▲
                                        │
                        4. Trigger / Scheduled RPC
                                        │
                        SUPABASE EDGE FUNCTIONS
            ├── send-push-notification (on-demand events: messages, friends)
            └── dispatch-task-reminders (time-sensitive scheduled tasks)
                                        │
                         5. Google OAuth2 JWT Bearer Token
                                        ▼
                        FIREBASE CLOUD MESSAGING (FCM v1)
                                        │
                         6. W3C Web Push Protocol
                                        ▼
                        USER DEVICE / SERVICE WORKER
                        (public/firebase-messaging-sw.js)
                                        │
                                        ▼
                        🔔 Eustace Notification
                        (Click opens sanitized internal route)
```

---

## 2. Firebase Project Setup

### Step A: Create or Open Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** or select your existing Eustace Google Cloud project.
3. Name your project (e.g. `eustace-production`).
4. Google Analytics can be enabled or disabled as desired.

### Step B: Register the Web App
1. In your Firebase project overview, click the **Web icon (`</>`)** to add a web application.
2. App nickname: `Eustace Web`.
3. Check or leave unchecked Firebase Hosting as needed.
4. Copy the `firebaseConfig` object values.

### Step C: Generate Web Push Certificate (VAPID Key)
1. In Firebase Console, go to **Project Settings** (gear icon) -> **Cloud Messaging** tab.
2. Scroll to the **Web configuration** section.
3. Under **Web Push certificates**, click **Generate key pair**.
4. Copy the generated public key. This is your `VITE_FIREBASE_VAPID_KEY`.

### Step D: Generate Service Account (Server-Side Secrets)
1. In Firebase Console, go to **Project Settings** -> **Service accounts** tab.
2. Select **Firebase Admin SDK**.
3. Click **Generate new private key**.
4. Download the JSON key file safely.
5. Extract the following values:
   - `project_id`
   - `client_email`
   - `private_key`

---

## 3. Environment Variables Reference

### Frontend Client Variables (`.env.local` / Vercel Environment)
These variables are bundled into the client application and are safe for public browser consumption:

| Variable | Description | Source |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard -> Settings -> API |
| `VITE_SUPABASE_ANON_KEY` | Public anonymous key | Supabase Dashboard -> Settings -> API |
| `VITE_FIREBASE_API_KEY` | Firebase Web API key | Firebase Console -> General -> Web App |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | Firebase Console -> General -> Web App |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | Firebase Console -> General -> Web App |
| `VITE_FIREBASE_STORAGE_BUCKET`| Firebase Storage Bucket | Firebase Console -> General -> Web App |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM Messaging Sender ID | Firebase Console -> General -> Web App |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | Firebase Console -> General -> Web App |
| `VITE_FIREBASE_VAPID_KEY` | Web Push Public Key Pair | Firebase Console -> Cloud Messaging |

### Server-Only Secrets (Supabase Edge Functions / CI)
> [!CAUTION]
> **NEVER expose these secrets in frontend `.env` files or Git repositories.**
> Configure these directly in Supabase Edge Function Secrets or via Supabase CLI.

> [!NOTE]
> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically provided by the Supabase Edge Runtime environment by default. You do **not** need to manually configure them.

| Secret | Description | Where to Set |
| :--- | :--- | :--- |
| `FIREBASE_PROJECT_ID` | Firebase Project ID | Supabase Secrets (`supabase secrets set`) |
| `FIREBASE_CLIENT_EMAIL` | Service Account Email (`firebase-adminsdk-...`) | Supabase Secrets (`supabase secrets set`) |
| `FIREBASE_PRIVATE_KEY` | Full RSA Private Key (`-----BEGIN PRIVATE KEY...`) | Supabase Secrets (`supabase secrets set`) |

To set Firebase service account secrets via Supabase CLI:
```bash
supabase secrets set \
  FIREBASE_PROJECT_ID="your_project_id" \
  FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@your_project_id.iam.gserviceaccount.com" \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 4. Database Schema & Migration

Migration file: `supabase/migrations/20261021000000_push_notifications_system.sql`.

### Tables Introduced

1. **`public.notification_devices`**
   - Multi-device FCM token registry per user.
   - Primary Key: `id uuid`
   - Foreign Key: `user_id -> public.profiles(id) ON DELETE CASCADE`
   - Unique Constraint: `(user_id, fcm_token)`
   - Status & Diagnostics: `is_active boolean`, `device_type text`, `device_name text`, `last_seen_at timestamptz`
   - Strict RLS: `user_id = auth.uid()`

2. **`public.notifications`**
   - Persistent in-app notifications history.
   - Types: `'task_reminder'`, `'message'`, `'friend_request'`, `'friend_accepted'`, `'streak'`, `'system'`
   - Tracks read states: `read_at timestamptz`
   - Strict RLS: `user_id = auth.uid()`

3. **`public.task_reminder_logs`**
   - Idempotency registry preventing duplicate reminder notifications.
   - Unique Constraint: `(user_id, task_id, occurrence_date, reminder_minutes)`
   - Ensures an occurrence reminder can only be delivered once even across overlapping cron jobs.

4. **Schema Enhancements to Existing Tables**
   - **`public.user_preferences`**:
     - `push_notifications boolean DEFAULT true` (master switch)
     - `task_reminders boolean DEFAULT true`
     - `message_notifications boolean DEFAULT true`
     - `streak_reminders boolean DEFAULT true`
     - `system_notifications boolean DEFAULT true`
   - **`public.tasks`**:
     - `reminder_minutes integer DEFAULT NULL` (Constraint: `NULL, 0, 5, 10, 15, 30, 60`)

### Database RPCs
- **`register_notification_device(p_fcm_token, p_device_type, p_device_name)`**:
  - `SECURITY DEFINER SET search_path = ''`
  - Atomically upserts device tokens and sets `is_active = true`.
- **`unregister_notification_device(p_fcm_token)`**:
  - `SECURITY DEFINER SET search_path = ''`
  - Deactivates device token on logout or user toggle.
- **`get_due_task_reminders(p_window_minutes)`**:
  - Timezone-aware query calculating task start time minus reminder lead time against `profiles.timezone`.
  - Excludes already completed tasks (`task_completions`).
  - Excludes already logged reminders (`task_reminder_logs`).

---

## 5. Service Worker (`public/firebase-messaging-sw.js`)

The service worker handles background push messages when Eustace is closed or running in a background tab:

- **Push Event (`push`)**:
  - Formats notification with high-res Eustace icons (`/pwa-192x192.png`, `/favicon.png`).
  - Resolves internal navigation target.
- **Click Event (`notificationclick`)**:
  - Closes the notification banner.
  - Matches open window clients and navigates/focuses existing tabs to reduce memory footprint.
  - Opens new tab if no instance is active.
- **Security Sanitization (`sanitizeInternalUrl`)**:
  - Enforces relative path validation (`startsWith('/')` and disallows `//`, `\`, and pseudo-protocols like `/javascript:`).
  - Whitelists allowed Eustace root routes (`/dashboard`, `/tasks`, `/calendar`, `/notes`, `/chat`, `/friends`, `/settings`, etc.).
  - Rejects external open redirects.

---

## 6. Supabase Edge Functions

Functions are located in `supabase/functions/`:

1. **`send-push-notification`**
   - Used for on-demand event notifications (new messages, friend requests, friend acceptances, system alerts).
   - Validates caller authorization and recipient notification preferences.
   - Automatically deactivates unregistered/expired tokens (`UNREGISTERED`, 404).

2. **`dispatch-task-reminders`**
   - Scheduled task dispatch engine.
   - Evaluates due tasks across user timezones.
   - Idempotently logs reminders to avoid duplicate dispatches.

To deploy Edge Functions to Supabase:
```bash
supabase functions deploy send-push-notification
supabase functions deploy dispatch-task-reminders
```

### Scheduling with pg_cron
To execute task reminders every minute, configure Supabase `pg_cron` with `pg_net`:
```sql
SELECT cron.schedule(
  'dispatch-eustace-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/dispatch-task-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <service-role-key>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

---

## 7. Frontend Integration

- **`src/services/notificationService.ts`**:
  Core singleton managing permissions, token registration, foreground listeners, and device tracking.
- **`src/hooks/useNotifications.tsx`**:
  React hook providing permission state, device diagnostic info, and enable/disable handlers.
- **`src/pages/SettingsPage.tsx`**:
  Native Settings UI under `Settings -> Notifications`:
  - Master Push Notifications toggle.
  - Categorized switches: Tasks, Social, Progress, System.
  - Permission blocked remediation instructions.
  - One-click Test Push Notification button.
- **`src/components/AddTaskModal.tsx`**:
  Task reminder offset dropdown (None, At time, 5m before, 10m before, 15m before, 30m before, 1h before) with scheduled start time.

---

## 8. Local Development & Testing

1. If Firebase credentials are not yet added to `.env.local`, Eustace automatically detects unconfigured mode:
   - Application loads and functions normally without errors.
   - Settings page clearly marks Push Status as pending configuration.
2. To test push notifications locally:
   - Add your Firebase keys to `.env.local`.
   - Start the development server with `npm run dev`.
   - Open `http://localhost:5173/settings`.
   - Click "Turn on Push Notifications".
   - Browser will prompt for permission; click **Allow**.
   - Click **Send Test Notification**.

---

## 9. Troubleshooting & Common Questions

### Q: Why do notifications not arrive when the browser is completely closed on macOS or iOS?
Web Push on macOS Safari requires macOS Ventura (13.0+) and user permission. On iOS Safari, Web Push requires the user to install the app to the Home Screen ("Add to Home Screen" as a PWA) starting with iOS 16.4+.

### Q: Notifications permission was blocked. How does a user unblock it?
1. Click the site settings icon (padlock or tune symbol) in the browser's address bar.
2. Locate **Notifications**.
3. Change the dropdown from **Block** to **Allow**.
4. Reload Eustace and toggle notifications on in **Settings -> Notifications**.

### Q: What happens when a user logs out?
`AuthContext.signOut()` immediately invokes `notificationService.unregisterDevice(user.id)`, deactivating the device token in `notification_devices`. This ensures other users logging in on a shared computer will not receive the prior user's notifications.

---

## 10. Staging Environment & Verified Status

The staging environment is deployed and verified on an isolated Supabase project:

- **Staging Project Reference**: `wrqidyxorezpsvtoozic` (Region: `ap-northeast-2`)
- **Database Migrations**: All 21 chronological migrations applied successfully via IPv4 session pooler (`aws-0-ap-northeast-2.pooler.supabase.com:5432`).
- **Deployed Edge Functions**:
  - `send-push-notification`: Deployed and active at `https://wrqidyxorezpsvtoozic.supabase.co/functions/v1/send-push-notification`.
  - `dispatch-task-reminders`: Deployed and active at `https://wrqidyxorezpsvtoozic.supabase.co/functions/v1/dispatch-task-reminders`.
- **Staging Client Environment**: Configured in `.env.staging.local` with dedicated staging Supabase URL and anon key.
- **Automated Verification**:
  - 360/360 Vitest unit/integration tests passing.
  - 0 TypeScript compile errors (`tsc --noEmit`).
  - 0 ESLint errors (`oxlint`).
  - Production Vite build and PWA service worker generated cleanly.

