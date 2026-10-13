# Eustace

> **Personal Productivity Operating System & Focus Architecture**

Eustace is a minimalist, high-performance personal productivity platform designed for disciplined daily execution, habit consistency, and mutual accountability. Built on a zero-trust architecture, it unites task scheduling with tactile time-picking and multi-frequency recurrence, TipTap rich-text knowledge management, `@visx`/D3 visual analytics, a privacy-first social network, real-time authenticated messaging, and community streak leaderboards.

Deployed in production at: [https://eustace-pi.vercel.app/](https://eustace-pi.vercel.app/)

---

## 1. Core Feature Suite

### ⏱️ Task Execution & Time Scheduling
- **Tactile Time Picker:** Choose between flexible "Anytime" planning or set precise hours and minutes using an integrated wheel picker with 12-hour AM/PM cycles and keyboard digit entry.
- **Multi-Cadence Recurrence:** Full recurrence engine powered by `rrule` supporting `Off`, `Daily`, `Weekly`, `Monthly`, and `Yearly` cadences, with customizable end dates managed via an anchored calendar popover.
- **Optimistic Task Execution:** Instant UI completion updates backed by client-side state caching and user-local completion date validation.
- **Unified Timeline & Calendar:** Day-by-day task planning, scheduled item sequencing, and historical completion reviews.

### 📝 Knowledge Base & Notes
- **Headless ProseMirror Engine:** Distraction-free rich-text editing powered by TipTap, supporting bold, italic, underline, strikethrough, headings, lists, blockquotes, and code blocks.
- **Structured Organization:** Hierarchical folder trees, custom color-coded tags, and instant full-text title and content search.
- **Zero Data Loss Auto-Save:** Debounced background synchronization paired with synchronous unmount flushing to guarantee unsaved drafts persist safely across navigation.

### 📊 Visual Productivity Analytics
- **Native Visx & D3 Visualizations:** Built entirely with `@visx` primitives and D3 scales, completely replacing legacy chart libraries with zero runtime charting bloat.
- **Annual Contribution Heatmap:** Full-year GitHub-style activity grid visualizing daily task completion volume, historical density, and streak continuity.
- **Discipline Radar Profile:** Multi-axis radar visualization analyzing productivity balance across key performance dimensions.
- **Time Distribution & Trends:** Hourly execution peak analysis and day-by-day trend graphs.

### 👥 Social & Accountability Network
- **Friends Hub:** Send and accept connection requests, view mutual circles, and discover suggested peers.
- **Accountability Profiles (`/u/:username`):** Share your public profile, current streak, and annual contribution heatmap with peers.
- **Granular Privacy Controls:** Control profile visibility (`public`, `friends`, `private`) for bio and personal details.
- **Privacy-Safe Usernames:** Server-side RPC username checks verify availability without leaking the existence of hidden or private user accounts.

### 💬 Real-Time Direct Messaging
- **Encrypted Real-Time Chat:** Low-latency 1-on-1 direct messaging powered by Supabase Realtime WebSocket channels.
- **Secure Image Sharing:** Client-side image compression (500 KB budget) stored in a private Supabase Storage bucket (`message-images`) and rendered strictly via short-lived authenticated signed URLs.
- **Live Activity Signals:** Optimistic delivery indicators, live unread message badges, and responsive conversation panes.

### 🏆 Transcend Leaderboard
- **Circle Streak Standings:** Track consecutive active habit streaks across your mutual network.
- **Podium Showcase:** Top 3 performers featured on a dedicated podium with crown indicators and profile shortcuts.
- **Discipline Culture:** Built to motivate daily consistency without vanity metrics.

---

## 2. Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework & UI** | React 19 (`^19.2.8`), TypeScript ~6.0 (`~6.0.2`), Vite 8 (`^8.3.0`), Tailwind CSS 3.4 (`^3.4.1`) |
| **Animation & Motion** | Framer Motion (`motion ^14.0.0`) |
| **Data Visualization** | `@visx` suite (`^4.0.0`: curve, event, gradient, grid, group, heatmap, pattern, responsive, scale, shape), `d3-array`, `d3-shape` |
| **Rich Text Editor** | TipTap (`^3.31.4`) with ProseMirror starter-kit, extensions (placeholder, text-align, underline) |
| **Scheduling Engine** | `rrule` (`^2.8.1`), `date-fns` (`^4.4.0`) |
| **Icons & Tooling** | `lucide-react` (`^1.50.0`), `clsx`, `tailwind-merge` |
| **Backend & Database** | Supabase (`@supabase/supabase-js ^2.117.2`): PostgreSQL 15+, GoTrue Auth, Realtime WebSocket pub/sub, Storage |
| **Infrastructure & Edge** | Vercel Edge Network with strict Content Security Policy (CSP), frame denial, and HSTS |

---

## 3. Architecture & Security

Eustace enforces strict zero-trust security boundaries across its entire application layer:

- **Database Row Level Security (RLS):** Every PostgreSQL table enforces strict user-isolated or friendship-bounded Row Level Security policies.
- **Hardened SECURITY DEFINER RPCs:** All privileged server functions run with explicit search path isolation (`SET search_path = ''`) and fully schema-qualified object references to eliminate search path hijacking vulnerabilities.
- **Short-Lived Signed URLs:** Private chat media is stored in non-public buckets; the frontend requests short-lived signed URLs on-the-fly, preventing permanent public link exposure.
- **Privacy-Safe User Lookups:** RPC-based validation prevents enumeration attacks and preserves visibility settings.
- **Edge Protection:** Production deployments enforce strict Content Security Policy (CSP), frame denial (`frame-ancestors 'none'`), and HTTP Strict Transport Security (HSTS).

For deeper technical documentation, see:
- [System Architecture](ARCHITECTURE.md)
- [Security Policy](SECURITY.md)
- [Contribution Guidelines](CONTRIBUTING.md)
- [Database Migration Workflow](supabase/MIGRATION_WORKFLOW.md)

---

## 4. Repository Structure

```
├── .github/              # CI workflows (Node 22, typecheck, lint, test, build)
├── public/               # Public assets (icons, manifest, logo, hero images)
├── src/
│   ├── __tests__/        # Automated Vitest suites (273+ unit and regression tests)
│   ├── components/       # Reusable UI components (WheelPicker, EditProfileModal, etc.)
│   ├── contexts/         # React Context providers (AuthContext)
│   ├── hooks/            # Custom hooks (useTasks, useNotes, useFriends, useAnalytics)
│   ├── lib/              # Utilities, Supabase client, Visx chart helpers
│   ├── pages/            # Application routes (Landing, Tasks, Notes, Analytics, etc.)
│   ├── App.tsx           # Route declarations and root providers
│   └── main.tsx          # Application entry point
├── supabase/
│   ├── migrations/       # Forward-only SQL migrations
│   └── MIGRATION_WORKFLOW.md
├── ARCHITECTURE.md       # Detailed technical architecture
├── SECURITY.md           # Security disclosure and vulnerability guidelines
├── package.json          # Dependency specifications and scripts
└── vite.config.ts        # Vite configuration and build targets
```

---

## 5. Local Development

### Prerequisites
- **Node.js**: `22.x` (matching CI configuration in `.github/workflows/ci.yml`)
- **npm**: `10.x` or later

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jackrichard/personal-tracker.git
   cd personal-tracker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env.local` file by copying the template:
   ```bash
   cp .env.example .env.local
   ```
   Provide your Supabase project credentials in `.env.local`:
   ```env
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```

4. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 6. Verification & Quality Assurance

Eustace maintains automated test suites covering component interactions, custom hooks, privacy contracts, and SQL migration logic:

```bash
# Run all automated tests (17 suites, 273+ tests)
npm test -- --run

# Run TypeScript type check
npx tsc -b

# Run Oxlint static analysis
npm run lint

# Build for production
npm run build

# Preview production build locally
npm run preview
```

> **Note:** `npm run lint` uses [Oxlint](https://oxc.rs/docs/learn/how-to-use/linter.html). In React 19 environments, certain hook dependency patterns may emit linter advisories while maintaining 100% build validity.

---

## 7. Database Migrations

Database schemas and security policies are tracked using forward-only SQL migration files in `supabase/migrations/`.
- Refer to [supabase/MIGRATION_WORKFLOW.md](supabase/MIGRATION_WORKFLOW.md) for database reconciliation procedures and migration history.
- Never edit previously applied migrations; append new forward migrations for schema evolution.

---

## 8. License

Copyright &copy; 2026 Jack Richard. All rights reserved.

This project is proprietary and confidential. See [LICENSE](LICENSE) for terms.
