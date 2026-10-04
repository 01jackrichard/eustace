# Eustace Database Architecture

This directory is the source of truth for the Eustace Supabase database schema, policies, and workflows.

## Directory Structure
- `DATABASE_INVENTORY.md` - Complete list of active tables, columns, and purposes.
- `RLS.md` - Complete active Row Level Security policy documentation.
- `MIGRATION_WORKFLOW.md` - Instructions for safely updating the schema.
- `CURRENT_DATABASE_REFERENCE.sql` - A consolidated, read-only representation of the current active schema (Tables, RPCs, Triggers). **DO NOT EXECUTE.**
- `sql-archive/` - Contains all historical iteration scripts, fixes, and migrations leading up to the current schema. These are preserved for context but many contain deprecated logic (like `receiver_id` or `visibility` filters).

## Core Systems
- **Auth & Profiles**: All authenticated users receive a public `profiles` row.
- **Productivity Engine**: Tasks, recurrence metadata (stored securely as JSON in `description`), and date-bound `task_completions`.
- **Social Graph**: Bidirectional `friendships` tracked using `requester_id` and `addressee_id` with strict RLS and state machine triggers.
