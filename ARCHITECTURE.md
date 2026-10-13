# Eustace System Architecture

## 1. High-Level Overview

Eustace is a personal productivity system and focus architecture built as a modern Single-Page Application (SPA) backed by Supabase (PostgreSQL, GoTrue Auth, Realtime, and Storage) and deployed on Vercel.

```
                      +---------------------------------------+
                      |               End User                |
                      +---------------------------------------+
                                          |
                                          | HTTPS / WSS
                                          v
                      +---------------------------------------+
                      |         Vercel Edge Network           |
                      |   - Strict CSP & Security Headers     |
                      |   - Static SPA Distribution           |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |      Client: React 19 + Vite SPA      |
                      |   - React Router DOM                  |
                      |   - Context Layer (Auth, Tasks, Notes)|
                      |   - Lucide Icons & Tailwind CSS       |
                      |   - TipTap Rich Text Engine           |
                      +---------------------------------------+
                                          |
                   +----------------------+----------------------+
                   |                                             |
             PostgREST / Auth / Storage                     WSS Realtime
                   |                                             |
                   v                                             v
+------------------------------------+         +------------------------------------+
|          Supabase Core             |         |     Supabase Realtime Service      |
|  - GoTrue Auth (JWT verification)  |         |  - Channel pub/sub for messages    |
|  - Private & Public Storage Buckets|         |  - Friendship request events       |
+------------------------------------+         +------------------------------------+
                   |                                             |
                   +----------------------+----------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |         PostgreSQL Database           |
                      |  - Row Level Security (RLS) on tables |
                      |  - Hardened SECURITY DEFINER RPCs     |
                      |  - Cascading auth.users references    |
                      +---------------------------------------+
```

---

## 2. Frontend Architecture

### 2.1 Core Stack
- **Framework:** React 19 with TypeScript ~6.0
- **Bundler:** Vite 8 with code splitting and manual vendor chunks
- **Styling:** Tailwind CSS 3.4 with custom typography and CSS variable design tokens
- **Routing:** React Router v7 (configured for SPA client-side routing)
- **Rich Text:** TipTap (Headless ProseMirror wrapper with full formatting mark support)
- **Visualizations:** Native `@visx` suite (radar, heatmap, trend charts) & D3 primitives

### 2.2 Client State Management
Application state is organized into focused React Contexts and custom React hooks:
1. `AuthContext`: Tracks authenticated user session, profile synchronization, session recovery, and sign-out states.
2. `TasksContext`: Manages daily tasks, recurring habit schedules, completions, task skips, and optimistic UI updates.
3. `NotesContext`: Manages hierarchical note organization, folder trees, note tags, and bidirectional links.
4. `ThemeContext`: Provides dark mode and theme persistence.
5. Domain-specific hooks:
   - `useFriends`: Friendship lifecycle management (requests, accepts, rejections, unfriend).
   - `useConversations`: Direct messaging threads, unread counts, and real-time subscription synchronization.
   - `useGlobalShortcuts`: Application-wide keybindings guarded against input interception.

### 2.3 Resilient Code Splitting
Route components are lazy-loaded via an enhanced `safeLazy` boundary in `App.tsx`. If a deployment introduces a new Vite asset hash, the boundary safely coordinates a one-time session reload to fetch fresh chunks without infinite reload loops.

---

## 3. Backend & Database Architecture

The backend utilizes Supabase's managed PostgreSQL instance. Application access is strictly governed by Row Level Security (RLS) and encapsulated Stored Procedures (RPCs).

### 3.1 Primary Data Tables
- `public.profiles`: User identity, bio, avatar/cover URLs, visibility (`public`, `friends`, `private`), and activity visibility settings.
- `public.tasks`: User task definitions, categories, duration estimates, scheduled time (`start_time`), and recurrence cadence (`none`, `daily`, `weekly`, `monthly`, `yearly`).
- `public.task_completions`: Historical log of completed tasks indexed by date and task ID.
- `public.daily_data`: Daily reflections, journal notes, and manual day completion flags.
- `public.notes` & `public.folders`: Personal knowledge base documents and folder trees.
- `public.friendships`: Friendship graph nodes storing requester, addressee, and status (`pending`, `accepted`, `declined`).
- `public.conversations` & `public.messages`: Direct communication threads and messages with realtime event broadcasting.
- `public.user_preferences`: Notification settings and application preferences.

### 3.2 Security Definer Functions & Access Control
All privileged database operations run through `SECURITY DEFINER` functions with search path isolation (`SET search_path = ''`):

| Function | Access Role | Description |
| :--- | :--- | :--- |
| `get_profile_by_username` | `anon`, `authenticated` | Returns public profile data; honors `visibility` settings so private profiles cannot be probed. |
| `get_friend_profiles` | `authenticated` | Returns friend cards with bios and streaks; strictly masks bios for non-accepted relations. |
| `calculate_user_streak` | `authenticated` | Computes consecutive active days; caller-scoped or restricted to accepted friends. |
| `get_public_productivity` | `anon`, `authenticated` | Returns anonymous aggregate metrics if the user's `activity_visibility` is `public`. |
| `check_username_available` | `anon`, `authenticated` | Case-insensitive uniqueness check verifying taken usernames without exposing private profile rows. |
| `get_suggested_connections`| `authenticated` | Computes mutual friend intersections while filtering out private users and existing relations. |
| `migrate_user_local_data`  | `authenticated` | Imports guest/local data into the caller's account with deduplication and bounded loop guards. |
| `delete_user_account`      | `authenticated` | Cascades account deletion across storage buckets (`profile-images`, `profile-covers`, `message-images`) and `auth.users`. |

### 3.3 Storage Buckets
1. `profile-images` & `profile-covers`:
   - Public read access for profile cards and avatars.
   - Insert/Update/Delete restricted to the authenticated resource owner matching `auth.uid()`.
2. `message-images`:
   - Private bucket. Read access restricted to verified participants in the corresponding conversation.

---

## 4. Network & Edge Security

Deployment configuration in `vercel.json` enforces enterprise-grade edge headers:
- **Content Security Policy (CSP):** Restricts script and style execution, restricts connection targets strictly to self and configured Supabase endpoints, and disallows framing (`frame-ancestors 'none'`).
- **Strict-Transport-Security (HSTS):** Enforces HTTPS with `max-age=63072000; includeSubDomains; preload`.
- **Anti-Clickjacking:** `X-Frame-Options: DENY`.
- **MIME Sniffing Protection:** `X-Content-Type-Options: nosniff`.
- **Referrer Privacy:** `Referrer-Policy: strict-origin-when-cross-origin`.
- **Permissions Policy:** Restricts access to sensitive browser features (camera, microphone, geolocation).
