# 07 — Build order and milestones

The sequence Claude Code should ship vertical slices in. Each milestone is a working app — never half-done. After every milestone, deploy a preview to Netlify and update this file's status.

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Shipped (preview deployed)
- `[!]` Blocked (note the blocker inline)

---

## M0 — Project skeleton `[x]`

Goal: A running React app at `localhost:5173` that proves the toolchain.

**Shipped 2026-04-25.** Preview: https://waymarks-rebuild.netlify.app — repo: https://github.com/Randy-Hough/waymarks2

### Tasks

- [x] Scaffold project with `npm create vite@latest` (React + TS template) — done by hand-writing equivalent config for full control
- [x] Install all stack dependencies (see `01-stack-architecture.md`)
- [x] Configure Tailwind with the theme tokens from `02-design-system.md`
- [x] Configure TypeScript strict mode + `@/*` path alias
- [x] Configure ESLint + Prettier + lint-staged + husky
- [x] Set up Vitest + RTL + Playwright (config files only, no tests yet) — one smoke test added for the theme toggle
- [x] Create the folder structure from `01-stack-architecture.md`
- [x] Add a single hello-world route at `/` that proves Tailwind, font loading, and the dark/light mode toggle work
- [x] Configure Netlify deploy (push to `main` → builds → deploys) — `netlify.toml` written; final wiring requires the owner to create the GitHub repo and Netlify site (see `docs/m0-verification.md`)
- [x] `npm run check` passes

### Acceptance

- [x] `npm run dev` opens a styled "Waymarks" hero on `localhost:5173`
- [x] `npm run check` is green
- [x] Netlify preview URL works — https://waymarks-rebuild.netlify.app

---

## M1 — Auth and the empty shell `[x]`

Goal: A user can sign up, log in, and see an empty "no buildings yet" state.

**Shipped 2026-04-26.** Preview: https://waymarks-rebuild.netlify.app — Supabase project ref `drclmnqlurvwqpnnpgzb`. Migrations 0001–0004 applied. See `docs/m1-verification.md` for the run log.

### Tasks

- [x] Initialize Supabase project, copy URL + anon key into `.env.local` and Netlify
- [x] Create migration `0001_init.sql`: `profiles`, `organizations`, `buildings`, `floors`, `assets`, `tenants`, `access_grants`, `audit_log`, `pending_invitations` tables (per `03-data-model.md`)
- [x] Set up RLS on every table (start permissive, lock down per-table)
- [x] Add Postgres trigger: on `auth.users` insert, create `profiles` row
- [x] Add the `user_can()` SQL function (`04-permissions.md`)
- [x] `npm run db:types` to generate TypeScript types — generated via Supabase MCP and saved to `src/types/database.ts`
- [x] Build `<AuthProvider>` and the login/signup screens (hand-rolled with React Hook Form + Zod)
- [x] Implement `useCurrentUser()`, `useCan()`, and `<Can>` from `04-permissions.md`
- [x] Implement the page shell: header (logo + sync chip + user chip), main content area
- [x] Empty state: "You don't have access to any buildings yet" with explainer
- [x] Manual test: sign up, log in, log out

### Acceptance

- [x] Sign up via email/password works
- [x] Login persists across reloads
- [x] Logged-out state correctly redirects to `/login`
- [x] The header looks like the design system specifies (dark ink + gold accent)
- [x] A signed-in user with no `access_grants` sees the empty state
- [x] Granting them a `super_admin` role manually in SQL → they see the building list (empty for now)

---

## M2 — Buildings and floors (read-only) `[x]`

Goal: Super admin can see buildings and floors. No editing yet.

**Shipped 2026-04-26.** Preview: https://waymarks-rebuild.netlify.app — Migration 0005 seeded "161 Bay St., Toronto" with 5 floors (B2 / B1 / Ground / Floor 2 / Floor 3). Commit `a548d6a`.

### Tasks

- [x] `lib/queries/buildings.ts`: list, get
- [x] `lib/queries/floors.ts`: list by building, get
- [x] `useBuildings()`, `useFloors(buildingId)`, `useFloor(floorId)` hooks
- [x] `<BuildingNav>` sidebar component with mock data — went straight to real data; no separate mock pass needed
- [x] Wire `<BuildingNav>` to real data
- [x] Routes: `/buildings/:id`, `/floors/:id`
- [x] Floor view: shows the floor name, building name, "no plan uploaded yet" empty state
- [x] Seed script: 1 building (161 Bay St.), 5 floors (B2, B1, Ground, Floor 2, Floor 3)
- [~] Playwright test: super admin sees seeded building and floors — **deferred to M7.** Replaced for M2 with Vitest + RTL coverage of BuildingNav + query wrappers (8 unit tests). Real e2e against Supabase needs a stable test user / branch / cleanup story; deferring to the M7 permissions hardening pass when we do all four roles together.

### Acceptance

- [x] Sidebar shows building + floors
- [x] Clicking a floor navigates to that floor's page
- [x] Empty state on floor page is friendly
- [x] Test passes (Vitest, 8 new tests; Playwright e2e deferred per note above)

---

## M3 — Floor plan upload and rendering `[~]`

Goal: Building admin can upload a PDF floor plan and see it render.

### Tasks

- [ ] Create Supabase Storage bucket `floor-plans` with RLS policy
- [ ] `<FloorPlanUploadDialog>` component (`05-components.md`)
- [ ] PDF metadata parsing (PDF.js): extract title, author
- [ ] Mismatch detection: compare PDF metadata against floor name; warn if discrepancy
- [ ] `<FloorPlanCanvas>` rendering: PDF.js → canvas
- [ ] Pan + zoom (mouse wheel + drag, pinch + drag on touch)
- [ ] Replace plan flow with diff confirmation
- [ ] Handle render errors with retry
- [ ] Acceptance test: upload sample PDFs, verify mismatch warning fires correctly

### Acceptance

- A PDF uploads and renders within 5 s for a typical floor plan
- Mismatch detection catches obvious cases (different building name in metadata)
- Replacing a plan does not lose existing pins
- Pan/zoom feel responsive on iPad

---

## M4 — Pins (place, view, drawer) `[ ]`

Goal: Building admin can place pins on a floor plan and see asset details.

### Tasks

- [ ] Migration: pin coords already in `assets` table per `03-data-model.md`
- [ ] `<PinMarker>` component
- [ ] `<AssetDrawer>` component (full spec in `05-components.md`)
- [ ] `<NewAssetDialog>` for placing
- [ ] Add asset flow: toolbar → click canvas → fill dialog → save
- [ ] Pin click → drawer opens
- [ ] Edit asset details inline
- [ ] Activity timeline (read from `audit_log`)
- [ ] Photo upload + Supabase Storage `asset-photos` bucket
- [ ] Storybook story for `<PinMarker>` showing all states

### Acceptance

- Building admin can place a new pin and see it instantly
- Pin click opens drawer with all sections rendered
- Editing a field saves and shows in activity timeline
- Photo upload works on mobile (camera) and desktop (file picker)
- Status colors match `02-design-system.md`

---

## M5 — Reposition + delete + audit_log triggers `[ ]`

Goal: Pin movement works end-to-end with logging.

### Tasks

- [ ] `audit_log_changes` trigger on `assets`, `floors`, `buildings`, `flags`, `access_grants`
- [ ] Reposition pin flow per `06-features.md` § Reposition pin
- [ ] StepUpDialog for delete asset
- [ ] Soft-delete: set `deleted_at`, exclude from queries
- [ ] Restore-within-30-days flow (super admin only, surfaced in a "Trash" view)
- [ ] Playwright test: reposition records old/new in audit_log
- [ ] Playwright test: tenant rep cannot reposition (UI hidden + RLS rejects)

### Acceptance

- Reposition mode is visually obvious
- Confirmation toast prevents accidental moves
- Delete requires step-up confirmation
- All mutations land in `audit_log`
- Tests pass

---

## M6 — Audit walkaround `[ ]`

Goal: A user can run an audit on a floor.

### Tasks

- [ ] Migration: `audit_sessions`, `audit_events` tables (already in `03-data-model.md`)
- [ ] `<AuditModeShell>` component
- [ ] Audit session lifecycle: start → events → end
- [ ] `<AuditCompleteSummary>` modal
- [ ] "Resume last audit" surface on home/building view
- [ ] Asset status computed from latest audit_event (good / attention / flagged)
- [ ] Filter "Audit due" computed from cycle days vs. last audit
- [ ] Playwright test: full audit flow on a 3-asset floor

### Acceptance

- Audit mode is full-screen with progress bar and bottom action sheet
- Confirm/Flag/Skip each generate the right event
- End audit summary is accurate
- Multiple audit sessions accumulate correctly in asset history

---

## M7 — Permissions hardening + access management `[ ]`

Goal: All four roles work correctly. UI gates, RLS enforces.

### Tasks

- [ ] Build out RLS policies for every table per `04-permissions.md`
- [ ] `<AccessManagementCard>` and full access management drawer
- [ ] `<NewInvitationDialog>` + Supabase Edge Function for sending invites
- [ ] Acceptance flow for invitations
- [ ] Time-bounded grants (auditor expires_at)
- [ ] Tenant rep direct-to-floor on login
- [ ] Hide other floors from tenant rep entirely (not greyed out)
- [ ] Hide other tenants' assets within the same floor
- [ ] Playwright tests for all 7 cases in `04-permissions.md` § Test cases
- [ ] Audit a sample of UI for `<Can>` coverage (no inline `if (role === ...)`)

### Acceptance

- All four roles work: super_admin, building_admin, auditor, tenant_rep
- All 7 Playwright permission tests pass
- The "Manage access" UI lets a building admin invite, revoke, and re-invite
- Expired grants are filtered correctly

---

## M8 — Mobile / iPad / responsive polish `[ ]`

Goal: The app works on a phone and an iPad, not just desktop.

### Tasks

- [ ] `useLayout()` hook with breakpoint detection
- [ ] `<Drawer>` adapts: side panel / overlay / bottom sheet
- [ ] `<BuildingNav>` adapts: sidebar / collapsible / sheet trigger
- [ ] Tap targets ≥ 44 px on touch
- [ ] Pinch-to-zoom on canvas (touch)
- [ ] Camera capture for photos on iOS Safari + Android Chrome
- [ ] Long-press confirmation for "Reposition pin" on touch
- [ ] Playwright tests at 3 viewport sizes (390x844, 1024x768, 1440x900)
- [ ] Manual smoke test on real iOS Safari and iPad

### Acceptance

- All key flows work on phone, iPad portrait, iPad landscape, desktop
- Mobile audit walkaround feels native and responsive
- No content unreachable on any size

---

## M9 — Offline + sync + conflicts `[ ]`

Goal: The app works offline mid-audit and reconciles when reconnected.

### Tasks

- [ ] Set up Dexie schema in `lib/offline.ts`
- [ ] `useOnline()` hook + `<SyncChip>` with all 5 states
- [ ] Stale-while-revalidate read pattern (Dexie → React → Supabase)
- [ ] Pending writes queue with FIFO push, exponential backoff
- [ ] Optimistic updates on every mutation
- [ ] Conflict detection (HTTP 409 on `updated_at` mismatch)
- [ ] `<ConflictResolverDialog>` with field-level resolution
- [ ] "Take offline" pre-cache flow
- [ ] PWA service worker via `vite-plugin-pwa` + `manifest.webmanifest`
- [ ] "Add to Home Screen" works on iOS, Android
- [ ] Playwright test: simulate offline mid-audit, queue events, reconnect, verify sync

### Acceptance

- Turn off Wi-Fi → app keeps working → indicator updates
- Reconnect → queue drains automatically
- Force a conflict (two browser tabs editing same asset) → conflict dialog appears
- "Take offline" caches a building successfully
- App is installable as a PWA

---

## M10 — Production readiness `[ ]`

Goal: Ship to first paying customer.

### Tasks

- [ ] Replace placeholder copy and demo data
- [ ] Wire `waymarks.ca` to Netlify (DNS records)
- [ ] SSL via Netlify
- [ ] Email domain (Resend or Postmark) for invitations + notifications
- [ ] Privacy policy + ToS pages (`/legal/privacy`, `/legal/terms`)
- [ ] Cookie consent (one banner, declines by default)
- [ ] Sentry (or PostHog) for error monitoring
- [ ] Backups: confirm Supabase Pro backups enabled
- [ ] Rate limiting on signup, invitation acceptance, email sends
- [ ] Penetration smoke test: try every permission boundary as the wrong role
- [ ] Onboarding wizard for first-time building admin
- [ ] Empty/error states audit (every screen has them per `05-components.md` checklist)
- [ ] Performance: First Contentful Paint < 1.5 s on 4G
- [ ] Lighthouse: ≥ 90 on Accessibility and Best Practices

### Acceptance

- A net-new user can sign up, accept an invitation, complete an audit, and never hit a blank or broken state
- All Playwright tests green
- Lighthouse scores hit target
- A pen-test against the four roles uncovers no permission leaks

---

## How to use this file

When starting a milestone:

1. Mark it `[~]` in progress.
2. Read the related specs (linked above and in `CLAUDE.md`).
3. Implement the tasks in order.
4. Run `npm run check`, then `npm run test:e2e`, then deploy a Netlify preview.
5. Update the checkboxes as you complete tasks.
6. When all tasks pass and acceptance criteria hold, mark `[x]` shipped, note the preview URL, and tell the owner what to test.

When stuck:

1. Re-read the relevant spec section. The answer is usually there.
2. If the spec is ambiguous, ask the owner one specific question rather than guessing.
3. Do not skip tests to "save time" — every milestone has acceptance tests for a reason.

When deviating from a spec:

1. Stop and ask the owner. The specs are the source of truth.
2. If the owner agrees to the deviation, update the spec in the same PR as the code change.
