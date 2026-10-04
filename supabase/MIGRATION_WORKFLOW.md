# Supabase Migration Workflow

To maintain a clean and reliable database architecture, **do not make changes directly in the Supabase SQL Editor via "Untitled query" tabs.** Unracked SQL scripts lead to schema drift and lost historical context.

## The Final Workflow

When a database schema change is needed (e.g., adding a table, modifying a column, or updating an RPC):

### 1. Create a Local Migration File
Use the Supabase CLI to generate a new migration file:
```bash
supabase migration new name_of_feature
```
This creates a timestamped SQL file in `supabase/migrations/`.

### 2. Write the SQL
Write your DDL (CREATE, ALTER, DROP) or function definitions inside the newly generated file.
* Always use `CREATE OR REPLACE` for functions.
* Use `IF NOT EXISTS` for tables/columns to ensure idempotency where possible.
* If writing a `SECURITY DEFINER` function, always append `SET search_path = ''` and explicitly schema-qualify tables (e.g., `public.tasks`).

### 3. Test Locally
If using local development:
```bash
supabase start
supabase migration up
```
Test the application against the local database to verify the changes.

### 4. Commit to Version Control
Add the migration file to Git. This ensures your database schema is versioned alongside the codebase.
```bash
git add supabase/migrations/
git commit -m "db: add name_of_feature"
```

### 5. Deploy to Remote Supabase
Once tested and committed, apply the migration to the remote production/staging database:
```bash
supabase db push
```

### Fixing Mistakes
If you make a mistake in a deployed migration, **do not edit the old migration file**. Instead, create a new migration that reverts or fixes the issue, and push it forward.

### Archiving Scripts
For one-off data patches or manual fixes that aren't strictly schema migrations, save the `.sql` files in `supabase/sql-archive/05-fixes/` with a descriptive name, rather than leaving them in the web editor.
