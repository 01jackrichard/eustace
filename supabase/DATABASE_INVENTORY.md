# Eustace Database Inventory

This document represents the intended final database architecture for Eustace.

## Tables

### 1. `profiles`
The central identity for a user in Eustace. 
* **Columns**: 
  * `id` (uuid, PK): Matches `auth.users.id`
  * `username` (text, UNIQUE): The user's handle
  * `display_name` (text): User's friendly name
  * `full_name` (text): Legacy fallback for display name
  * `bio` (text): Short biography
  * `avatar_url` (text): Path to profile picture in storage
  * `cover_image_url` (text): Path to banner picture in storage
  * `visibility` (text): Hardcoded to 'public' (legacy constraint allows 'private', 'friends', 'public')
  * `activity_visibility` (text): Hardcoded to 'private' (legacy column)
  * `created_at`, `updated_at` (timestamps)
* **Purpose**: Stores public user identity.
* **RLS**: Fully readable by any authenticated user. Users can update their own row.
* **Relationships**: `id` references `auth.users(id)`.

### 2. `friendships`
Social graph connections between users.
* **Columns**:
  * `id` (uuid, PK)
  * `requester_id` (uuid): The user who initiated the request
  * `addressee_id` (uuid): The user receiving the request (replaces legacy `receiver_id`)
  * `status` (text): 'pending', 'accepted', 'declined', or 'cancelled'
  * `created_at`, `updated_at` (timestamps)
* **Purpose**: Manage friend requests and accepted connections.
* **RLS**: Select/Update/Delete restricted to rows where `auth.uid() = requester_id OR auth.uid() = addressee_id`. Insert restricted to `auth.uid() = requester_id`.
* **Constraints**: 
  * `friendships_no_self_friend`: `requester_id != addressee_id`
* **Indexes**: 
  * `friendships_unique_pair_idx`: Unique index on `least(requester_id, addressee_id), greatest(requester_id, addressee_id)`

### 3. `tasks`
Individual tasks (both one-time and recurring).
* **Columns**:
  * `id` (uuid, PK)
  * `user_id` (uuid): Owner of the task
  * `name` (text): Task title
  * `description` (text): Serialized JSON storing `TaskMetadata` (recurrence rules, skipped dates, notes)
  * `category` (text): Task category
  * `duration` (text): Expected duration
  * `recurring` (text): 'none', 'daily', 'weekdays', 'weekly', 'custom'
  * `created_at` (date): The logical local date the task was created
  * `updated_at` (timestamp)
* **Purpose**: Task definitions.
* **RLS**: Strictly restricted to `auth.uid() = user_id` for all operations.

### 4. `task_completions`
The completion history for tasks.
* **Columns**:
  * `id` (uuid, PK)
  * `user_id` (uuid): Owner
  * `task_id` (uuid): Reference to `tasks(id)`
  * `completed_date` (date): The logical local date the task was completed
  * `created_at` (timestamp)
* **Purpose**: Decouples completions from recurring task definitions. Checking off a task inserts a row for that specific day.
* **RLS**: Strictly restricted to `auth.uid() = user_id`.
* **Constraints**: Unique on `(user_id, task_id, completed_date)`.

### 5. `daily_data`
Daily journals and manual overrides.
* **Columns**:
  * `id` (uuid, PK)
  * `user_id` (uuid): Owner
  * `date` (date): The logical local date
  * `note` (text): Private journal entry
  * `manual_completion` (boolean): Manual override for daily streak
  * `created_at`, `updated_at` (timestamps)
* **Purpose**: Storing day-specific notes and status overrides.
* **RLS**: Strictly restricted to `auth.uid() = user_id`.
* **Constraints**: Unique on `(user_id, date)`.

### 6. `user_preferences`
Application settings.
* **Columns**:
  * `user_id` (uuid, PK): Owner
  * `email_notifications` (boolean)
  * `friend_request_notifications` (boolean)
  * `productivity_reminders` (boolean)
  * `created_at`, `updated_at` (timestamps)
* **Purpose**: User-specific settings toggles.
* **RLS**: Restricted to `auth.uid() = user_id`.

### 7. `user_stats`
Cached statistics.
* **Columns**:
  * `user_id` (uuid, PK): Owner
  * `current_streak` (integer)
  * `updated_at` (timestamp)
* **Purpose**: Stores calculated streak. (Note: The frontend calculates streaks on the fly, but this is maintained for future use/leaderboards).
* **RLS**: Select restricted to friends. Update restricted to owner.

## Storage Buckets
* `profile-images`: Publicly readable avatars.
* `profile-covers`: Publicly readable banners.
(Both restrict insert/update/delete to the `auth.uid() = owner` based on the folder path).
