# Markur — Building Signage Passport (formerly Waymarks)

> **Claude Code:** read `CLAUDE-CODE-CONTEXT.md` first (in this same folder) — it has the current state, push workflow, and known gotchas. This file is the original architectural spec; both are useful.

> **All Claudes (Cowork, Claude Code, web, mobile):** read `../STATE.md` first for the live snapshot — shipped milestones, current HEAD, owner-managed files, pending prompts, gotchas. STATE.md is the single source of truth; this file is the original architectural spec.

> Live build (current): https://markur.netlify.app  (Netlify site renamed from `waymarks-rebuild` to `markur` on 2026-05-13)
> Production domain target: https://markur.ca (already owned by Randy; DNS pointing to Netlify is M10 work)
> Brand: **Markur, by Officemark.** Final name as of 2026-04-30 (history: PlaqueMark → MarkView → Markur → Markur). Trademark cleared in CIPO Canada; clean NUANS June 2023.
> Owner: Randy (rancherdesign.ca / officemark.ca) — non-developer; you (Claude Code) are the implementing developer

## What this is

A web app for property managers to track signage and wayfinding assets across multi-tenant buildings. Building owners or facilities teams pin signs onto floor plans, photograph them, audit them on a schedule, and let tenants flag issues. The product's core promise is "every sign on every floor, accounted for and audit-ready."

A previous prototype exists at the netlify URL above. The current rebuild starts fresh from these specs — do not assume any of that code carries over. The data model concepts (buildings → floors → asset pins → audits) are valid, the implementation isn't.

## Audience and primary jobs

Three distinct users (full role model in `specs/04-permissions.md`):

- **Building admin / property manager** — the paying customer. Lives on desktop for setup and reporting, iPad for client-facing demos, occasionally phone.
- **Auditor** — internal or third-party. Walks the building with a phone or iPad, marks signs audited, flags issues. Often offline (basements, stairwells).
- **Tenant rep** — the building's tenants. Sees their own floor only. Flags missing or wrong signage. Read-mostly.

Three primary devices:

- **Desktop** (1280 px+) — planning surface: setup, reporting, bulk operations.
- **iPad** (768–1366 px) — presenting and walking surface: client meetings, in-the-field with a tablet.
- **Mobile phone** (≤480 px) — doing surface: hands-on audits, often offline.

Build for all three. The app is one responsive PWA, not three apps.

## Stack (decided — do not change without discussion)

- **Frontend**: React 18 + Vite + TypeScript (strict)
- **Styling**: Tailwind CSS v3 with a custom theme (see `specs/02-design-system.md`)
- **State**: Zustand (UI/local) + TanStack Query v5 (server state)
- **Routing**: React Router v6
- **Forms**: React Hook Form + Zod
- **UI primitives**: Radix UI (headless, accessible) — used for Dialog, Popover, DropdownMenu, Tabs, Tooltip
- **Backend**: Supabase (Postgres + Auth + Storage + Realtime)
- **Offline cache**: Dexie (IndexedDB wrapper)
- **PWA**: vite-plugin-pwa with Workbox
- **Image / floor-plan rendering**: PDF.js for PDF floor plans; native canvas for PNG/JPG; pin overlay in absolutely-positioned divs over the canvas
- **Tests**: Vitest + React Testing Library (unit/integration), Playwright (e2e)
- **Icons**: lucide-react
- **Date/time**: date-fns
- **Deploy**: Netlify (frontend), Supabase Cloud (backend)

Rationale for these choices is in `specs/01-stack-architecture.md`.

## Repo layout

```
markur/
├── CLAUDE.md                     ← you are here
├── README.md                     ← public-facing project description
├── HANDOFF.md                    ← non-developer owner's guide
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── public/
│   ├── manifest.webmanifest
│   └── icons/                    ← PWA icons
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/                   ← Route components, one per top-level URL
│   ├── features/                 ← Feature modules (audit, asset-detail, building, floor)
│   ├── components/
│   │   ├── ui/                   ← Generic UI primitives (Button, Card, Drawer, etc.)
│   │   └── waymarks/             ← Domain components (FloorPlanCanvas, PinMarker, etc.) — directory name kept for now; renaming to `markur/` is Path-2 churn deferred past first customer
│   ├── lib/
│   │   ├── supabase.ts           ← Supabase client + typed helpers
│   │   ├── permissions.ts        ← Capability checks (Can component, useCan hook)
│   │   ├── offline.ts            ← Dexie schema + sync orchestration
│   │   ├── auth.ts
│   │   └── utils.ts
│   ├── hooks/                    ← Custom React hooks (useAsset, useFloor, etc.)
│   ├── stores/                   ← Zustand stores (UI state, audit session)
│   ├── styles/
│   │   └── globals.css           ← Tailwind directives + CSS variables
│   └── types/                    ← Shared TypeScript types (also generated from Supabase)
├── supabase/
│   ├── migrations/               ← SQL migrations (numbered)
│   ├── functions/                ← Edge functions (Deno)
│   └── seed.sql                  ← Seed data for dev
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── specs/                        ← Product specs — read these
    ├── 01-stack-architecture.md
    ├── 02-design-system.md
    ├── 03-data-model.md
    ├── 04-permissions.md
    ├── 05-components.md
    ├── 06-features.md
    └── 07-build-order.md
```

## Conventions

- **TypeScript strict mode**. No `any` without an inline comment explaining why.
- **File naming**: components in PascalCase (`AssetDrawer.tsx`); hooks camelCase prefixed `use` (`useFloor.ts`); other files kebab-case.
- **Imports**: absolute imports from `src/` using `@/` prefix. Configure in `tsconfig.json` and `vite.config.ts`.
- **Tailwind only** for styling. No inline `style=` props except for dynamic positions (pin x/y on the floor plan). Tokens live in `tailwind.config.ts`, not in component files.
- **Server data goes through TanStack Query**, never raw `await supabase.from(...)` inside components. Wrap each table in `lib/queries/<table>.ts`.
- **All mutations log to `audit_log`** via Postgres triggers — defined in migrations, not in app code.
- **Offline-first reads**: every query checks Dexie first, returns immediately, then revalidates from Supabase in the background (stale-while-revalidate pattern).
- **Permissions**: never check roles inline in component bodies. Use `<Can action="..." resource={...}>...</Can>` and `useCan(action, resource)`.
- **Accessibility is a first-class concern**: keyboard navigable, semantic HTML, ARIA where Radix doesn't already handle it, WCAG 2.1 AA contrast minimum.
- **Forms**: always React Hook Form + Zod. Schemas live alongside the form component.
- **Errors**: surface in the UI (inline next to fields, or in a status banner). Never silently swallow.
- **Realtime**: use Supabase Realtime channels for collaborative updates (pin moves, audit status changes). See `specs/06-features.md` for which queries opt in.

## How to work in this repo

When the owner gives you a task, your standard flow:

1. Read the relevant spec(s) under `specs/`.
2. If a spec is ambiguous, ask the owner one focused question rather than guessing.
3. Implement in vertical slices: a thin slice that ships end-to-end (UI + data + tests) is better than a thick layer that doesn't.
4. Always add at least one test (unit or integration) per feature. Add Playwright e2e tests for any flow that crosses three or more screens.
5. Run `npm run check` (lint + typecheck + test) before declaring a task done.
6. When you complete a milestone from `specs/07-build-order.md`, update its status in that file.

## Anti-patterns (don't do these)

- ❌ **Don't introduce a new dependency** without a clear reason. The stack above covers ~95% of needs.
- ❌ **Don't hardcode `if (user.role === 'admin')`** in component bodies. Use the permissions wrapper.
- ❌ **Don't bypass the offline cache** for reads — always go through TanStack Query → Dexie → Supabase.
- ❌ **Don't auto-resolve sync conflicts silently**. The user always decides when two changes collide (see offline spec).
- ❌ **Don't use `position: fixed` for drawers/modals** — use Radix Dialog/Popover with proper focus management and `aria-modal`.
- ❌ **Don't store secrets in the repo**. `.env.local` for local dev (gitignored), Netlify environment variables for production.
- ❌ **Don't reproduce floor-plan PDFs verbatim in screenshots or marketing**. They're tenant-confidential.
- ❌ **Don't ship a feature without thinking through the four roles**. Every screen should answer: what does each role see / not see / not be able to do?

## Owner conventions

The owner is not a developer and will speak in product terms ("can we make the pin draggable", "tenants shouldn't see other floors"). Translate those to specs and tasks. Ask follow-up questions before assuming. When you ship something, describe it in plain language, not in code-speak.
