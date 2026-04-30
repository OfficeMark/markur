# 01 — Stack and architecture

This document explains the tech stack chosen for Markur, the rationale for each piece, and the high-level architecture. Read this before writing any code.

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React 18 + Vite + TypeScript | Most well-known stack, fast dev server, strict types catch bugs early |
| Styling | Tailwind CSS v3 (custom theme) | Utility-first, fast iteration, theme tokens centralized |
| State (UI) | Zustand | Tiny, no boilerplate, ideal for ephemeral UI state |
| State (server) | TanStack Query v5 | Caching, retries, optimistic updates, stale-while-revalidate |
| Routing | React Router v6 | Standard React routing, supports nested layouts |
| Forms | React Hook Form + Zod | Performant forms, runtime validation that infers types |
| UI primitives | Radix UI | Headless, accessible, keyboard-friendly |
| Backend | Supabase | Postgres + Auth + Storage + Realtime in one product |
| Offline cache | Dexie | IndexedDB wrapper with a clean API |
| PWA | vite-plugin-pwa (Workbox under the hood) | Installable on home screen, offline service worker |
| PDF rendering | PDF.js | Renders floor-plan PDFs on canvas |
| Tests | Vitest + RTL + Playwright | Standard React testing pyramid |
| Deploy | Netlify (frontend) + Supabase Cloud (backend) | Both have generous free tiers and Git-based deploys |

## Why these and not alternatives

- **Why not Next.js?** Markur is a SPA with a backend (Supabase). We don't need server-side rendering or React Server Components for this use case, and a static SPA on Netlify is simpler to operate.
- **Why not Tailwind v4?** v4 is still settling. v3 is stable and well-supported.
- **Why not Redux?** Overkill. Zustand for client state, TanStack Query for server state, React state for component-local stuff.
- **Why not Firebase?** Supabase is Postgres-first, which means real SQL, real foreign keys, and Row-Level Security policies that map cleanly to the role model. Firestore's ad-hoc security rules don't scale to this kind of multi-tenant permission model.
- **Why not native iOS / Android?** A PWA covers desktop, iPad, and phone with one codebase, supports installation via "Add to Home Screen", and supports offline through service workers. Native is a future option if push notifications and tighter offline become hard requirements.

## High-level architecture

```
┌─────────────────────────────────────────┐
│           React PWA (the app)           │
│ ┌─────────────────────────────────────┐ │
│ │ TanStack Query (server cache)       │ │
│ └────────────┬────────────────────────┘ │
│              │                          │
│ ┌────────────┴───────┐  ┌─────────────┐ │
│ │ Dexie (offline)    │  │ Zustand     │ │
│ └────────────┬───────┘  └─────────────┘ │
│              │                          │
└──────────────┼──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Supabase (the backend)          │
│ ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────┐ │
│ │ Auth │ │ DB   │ │ Storage  │ │ Edge │ │
│ │      │ │ (PG) │ │ (S3-like)│ │ Fns  │ │
│ └──────┘ └──┬───┘ └──────────┘ └──────┘ │
│            │                            │
│         RLS policies                    │
│         (per-table security)            │
└─────────────────────────────────────────┘
```

### Data flow for a typical read

1. Component calls a TanStack Query hook (e.g. `useFloor(floorId)`).
2. Hook checks Dexie. If found, returns immediately.
3. Hook fires a Supabase request in parallel.
4. When Supabase response lands, the hook updates Dexie and re-renders the component.
5. Realtime channel pushes future changes to the same query, which updates both Dexie and React state.

### Data flow for a typical write

1. Component calls a mutation (e.g. `useUpdateAsset()`).
2. Mutation does an optimistic update to TanStack Query cache and Dexie.
3. Mutation queues the change in a "pending writes" Dexie table.
4. If online, mutation pushes to Supabase immediately.
5. If offline, mutation stays queued. The sync orchestrator pushes when connectivity returns.
6. On conflict, the conflict resolution UI is shown (see `specs/06-features.md` § offline).
7. On success, the Postgres trigger writes an `audit_log` row.

## Folder structure (detailed)

```
src/
├── main.tsx              ← bootstraps React + Router + QueryClient + Auth
├── App.tsx               ← top-level layout, providers
├── routes/
│   ├── index.tsx         ← list of routes, lazy-loaded
│   ├── _layout.tsx       ← shell with header + nav
│   ├── login.tsx
│   ├── buildings/
│   │   └── [id].tsx
│   ├── floors/
│   │   └── [floorId].tsx
│   └── audit/
│       └── [floorId].tsx
├── features/
│   ├── audit/            ← Audit mode (full-screen walkaround)
│   ├── asset-detail/     ← Drawer + asset CRUD
│   ├── floor-plan/       ← Canvas + pin overlay
│   ├── building-list/    ← Building/floor sidebar
│   ├── settings/         ← Building settings, access management
│   └── auth/             ← Login, invitation accept
├── components/
│   ├── ui/               ← Generic primitives
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Drawer.tsx
│   │   ├── Dialog.tsx
│   │   ├── Toast.tsx
│   │   ├── ChipFilter.tsx
│   │   ├── Spinner.tsx
│   │   └── ...
│   └── Markur/         ← Domain UI
│       ├── FloorPlanCanvas.tsx
│       ├── PinMarker.tsx
│       ├── SyncChip.tsx
│       ├── PermissionGate.tsx (the <Can> component)
│       └── ...
├── lib/
│   ├── supabase.ts       ← typed client export
│   ├── auth.ts           ← auth helpers, session hook
│   ├── permissions.ts    ← role/capability checks
│   ├── offline.ts        ← Dexie schema + sync orchestrator
│   ├── queries/          ← One file per table; encapsulates all Supabase calls
│   │   ├── buildings.ts
│   │   ├── floors.ts
│   │   ├── assets.ts
│   │   ├── audits.ts
│   │   └── ...
│   └── utils.ts
├── hooks/
│   ├── useFloor.ts
│   ├── useAsset.ts
│   ├── useAuditSession.ts
│   ├── useOnline.ts
│   └── ...
├── stores/
│   ├── ui.ts             ← UI-only state (drawer open, filters, etc.)
│   └── audit-session.ts  ← in-progress audit walkaround
├── styles/
│   └── globals.css       ← Tailwind directives, CSS variables, root font
└── types/
    ├── database.ts       ← Generated from Supabase schema
    └── domain.ts         ← Hand-written domain types
```

## Conventions enforced in code

- `eslint` with `@typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`. CI fails on warnings.
- `prettier` for formatting. Pre-commit hook via `husky` + `lint-staged`.
- TypeScript strict mode in `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
- Path alias `@/*` → `src/*`.
- Database types regenerated via `npm run db:types` after every migration. Type drift between schema and code is a build failure.

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local`, Netlify | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local`, Netlify | Public anon key (RLS enforces security) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions only | Admin operations, never exposed to client |

Never commit `.env.local`. The `.env.example` template lives in the repo with placeholders.

## Build commands

```bash
npm run dev          # Vite dev server, port 5173
npm run build        # Production build → dist/
npm run preview      # Local preview of the production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest
npm run test:e2e     # playwright test
npm run check        # typecheck + lint + test (run before declaring a task done)
npm run db:setup     # supabase migration up
npm run db:reset     # supabase migration reset (dev only)
npm run db:types     # regenerate src/types/database.ts
```

## Deploy

Frontend deploys to Netlify on push to `main`. Preview deploys on every PR. Build command: `npm run build`. Publish directory: `dist/`. Environment variables set in Netlify UI.

Backend (Supabase) migrations are applied via `npm run db:setup` against the production project — done manually before merging a migration to `main`. Edge functions deploy via `supabase functions deploy <name>`.

## What you (Claude Code) should do first

If this is a fresh checkout and the project hasn't been scaffolded yet:

1. Run `npm create vite@latest Markur -- --template react-ts` to scaffold.
2. Install all dependencies in the stack list above.
3. Configure Tailwind, TypeScript paths, ESLint, Prettier.
4. Set up Supabase client and types.
5. Set up TanStack Query, Router, Auth provider in `App.tsx`.
6. Confirm `npm run dev` works.
7. Read the rest of the specs in order (02 → 07) before writing feature code.

The first vertical slice to ship is in `specs/07-build-order.md` § Milestone M0.
