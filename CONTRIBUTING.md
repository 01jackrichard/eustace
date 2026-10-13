# Contributing to Eustace

Thank you for your interest in contributing to Eustace. To maintain code quality, security, and stability, please review these development guidelines before proposing changes.

---

## 1. Development Workflow

### 1.1 Branching Model
- Work on a dedicated feature or bugfix branch branched from `main`.
- Keep changes scoped and atomic. Avoid combining unrelated refactors with functional changes.
- Ensure all automated checks pass locally before opening a pull request.

### 1.2 Environment Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```
3. Populate `.env.local` with your Supabase URL and public Anon Key:
   ```env
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 2. Coding Standards & Conventions

### 2.1 TypeScript & React
- Maintain strict type safety. Do not introduce `any` types; prefer explicit interfaces or generic constraints.
- React components should use functional components with standard React hooks.
- Clean up all side effects (`useEffect` subscriptions, intervals, event listeners) on component unmount.
- Guard global keyboard shortcuts to prevent intercepting user input inside form controls (`input`, `textarea`, `select`, `contenteditable`).

### 2.2 Styling
- Use Tailwind CSS utility classes adhering to the project's monochrome and minimalist aesthetic.
- Use the `cn()` utility (`clsx` + `tailwind-merge`) for conditional class composition.

---

## 3. Database & Migration Guidelines

Eustace operates on a strict **forward-only database migration policy**.

### 3.1 Migration Rules
1. **Never alter historical migration files.** Historical migrations represent an immutable sequence of deployed database revisions.
2. **Always create forward-only migration scripts** using the standard timestamp format:
   ```
   supabase/migrations/YYYYMMDDHHMMSS_<descriptive_name>.sql
   ```
3. **Hardened RPCs:**
   - Always declare functions with `SECURITY DEFINER`.
   - Always include `SET search_path = ''`.
   - Fully qualify every table and function reference (e.g., `public.profiles`, `auth.uid()`).
   - Explicitly revoke execution from `PUBLIC` and grant permissions only to required roles (`authenticated`, `anon`, or `service_role`).
4. **Row Level Security:**
   - Every new table must enable RLS immediately (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
   - Define least-privilege policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.

---

## 4. Pre-Flight Verification Checklist

Before submitting code, run the complete local verification suite:

```bash
# 1. Run all unit and integration tests
npm test -- --run

# 2. Type-check TypeScript definitions
npx tsc -b

# 3. Run linter (Oxlint)
npm run lint

# 4. Verify production Vite build
npm run build
```

All 4 commands must exit cleanly with code `0`.
