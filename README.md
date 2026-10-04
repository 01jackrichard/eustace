# Eustace

Eustace is a powerful personal tracking and productivity web application. It features real-time social networking, rich productivity visualizations, and a robust recurring task engine.

## Purpose
Eustace helps users track their daily tasks, measure productivity via GitHub-style contribution graphs, and connect with friends to build accountability and momentum through shared streaks.

## Tech Stack
* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Framer Motion
* **Routing**: React Router (SPA)
* **Backend**: Supabase (PostgreSQL, Auth, RLS, Storage, RPCs)
* **Hosting**: Designed for Vercel

## Local Development

### Prerequisites
* Node.js (v24+)
* npm

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment variables template:
   ```bash
   cp .env.example .env.local
   ```
4. Fill in `.env.local` with your Supabase credentials (URL and Anon Key).

### Running
Start the Vite development server:
```bash
npm run dev
```

## Supabase Setup
The database schema and architecture are fully documented in the `supabase/` directory.

### Quick Start
You must apply the unified database schema to your Supabase project before running the application.

1. Ensure your `.env.local` contains valid connection details.
2. Please refer to `supabase/MIGRATION_WORKFLOW.md` for instructions on managing database schema changes.
3. Apply `supabase/CURRENT_DATABASE_REFERENCE.sql` to your Supabase project (this is the consolidated reference schema).

## Project Structure
* `/src` - React application source code.
* `/public` - Static assets and favicons.
* `/supabase` - Database documentation, RLS policies, and SQL archives.
* `/archive` - Preserved historical development scripts and unused assets.

## Deployment
This project is configured out-of-the-box for Vercel deployment (see `vercel.json` for SPA routing fallback). Ensure you map the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Environment Variables in your Vercel project settings.

```bash
# Build the project
npm run build
```
