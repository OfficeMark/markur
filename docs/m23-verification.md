# M23 verification

Safari/iOS hardening pass. Defensive auth-recovery + viewport-height fixes for the Mac/iOS Safari demo failure mode (Deborah at BAS, May 7).

## What shipped

### 1. PKCE flow pinned (`src/lib/supabase.ts`)
Explicit `flowType: 'pkce'`. supabase-js 2.43+ defaults to PKCE, but pinning prevents a future upgrade silently regressing to implicit flow.

**Honest caveat:** PKCE alone does NOT defeat Safari ITP. The PKCE code verifier sits in localStorage alongside the access token, so a 7-day ITP wipe takes both with it. The real Safari defense is the recovery path below.

### 2. Auth-error recovery (`src/lib/queryErrorHandler.ts` + wiring in `src/App.tsx`)
The actual fix for the Deborah demo. New helper classifies any error as auth-expired by checking:
- HTTP `status` / `statusCode` === 401
- PostgREST `code` ∈ {PGRST301, PGRST302}
- Error `name` === 'AuthSessionMissingError'
- Message text contains "JWT expired", "invalid jwt", "JWT is missing", "auth session missing"

Plugged into `QueryClient.queryCache.onError` and `mutationCache.onError`, so any TanStack Query call (read or write) that hits an auth failure dispatches a `markur:session-lost` window event.

`<SessionLostHandler />` (mounted inside the Router) listens for that event, shows a top-of-screen "Your session expired. Redirecting to sign in…" banner for 1.5 s, then redirects to `/login?next=<currentPath>&reason=session-expired` with `replace: true`.

### 3. Dynamic-viewport-height (dvh) for iOS Safari
- `src/components/waymarks/AppShell.tsx`: `min-h-screen` → `min-h-screen min-h-dvh` (dvh primary, screen fallback for older browsers).
- `src/components/waymarks/BuildingNav.tsx`: sticky sidebar `max-h-[calc(100vh-3.5rem)]` → adds `max-h-[calc(100dvh-3.5rem)]` so the sidebar doesn't clip behind the iOS Safari bottom toolbar.

## Smoke tests (manual)

### Session-expired recovery (the headline fix)

1. Sign in normally. Navigate to /buildings/<id>.
2. Open DevTools → Application → Local Storage → delete the `waymarks-auth` key.
3. Click any action that hits Supabase (e.g., "Add floor", or open an asset drawer that triggers a read).
4. Top-of-screen warning banner appears: "Your session expired. Redirecting to sign in…"
5. ~1.5 s later, page navigates to `/login?next=/buildings/<id>&reason=session-expired`. The replace prevents back-button loops.
6. Sign in. Login.tsx (owner-managed) doesn't yet read `reason` or `next` to auto-return; that's a follow-up. For now the user lands on home.

### PKCE flow still works

1. Sign out. Sign in. Confirm session persists across reload.
2. Wait for autoRefreshToken to fire (within 60s of token expiry — usually requires waiting ~55 min in dev, or set the JWT TTL low in Supabase to verify).
3. Page should not bounce to login during a normal session.

### Viewport on iOS Safari

1. Open the deploy on an iPhone in mobile Safari.
2. Scroll to the bottom of any AppShell-wrapped page (e.g., /admin/security or /buildings/<id>).
3. The footer / page bottom should sit just above the iOS toolbar — not be hidden behind it.
4. Open BuildingNav sidebar on iPad in landscape: the sticky sidebar should not extend past the visible viewport into the toolbar area.

### Existing flows unbroken

1. M18b attachment upload still works.
2. Sign-in / sign-out / invitation accept all unchanged behaviorally.

## Parallel changes Randy should make in owner-managed files

These need the same fix but live in files I'm not touching this milestone:

- **`src/routes/Login.tsx:28`** — `min-h-screen` → `min-h-screen min-h-dvh` for iOS keyboard handling.
- **`src/routes/ProtectedRoute.tsx:16`** — same `min-h-screen min-h-dvh` change.
- **`src/routes/Login.tsx`** (optional) — read `?reason=session-expired` from the URL and show a small banner above the sign-in tabs. Without this, a redirected user has no context for why they're suddenly at /login. UX nice-to-have.
- **`src/routes/Login.tsx`** (optional) — read `?next=<path>` after a successful sign-in and `navigate(next, { replace: true })` instead of always going to `/`. Restores the ITP-victim user back to the screen they were trying to use.

These are well-bounded one-liners; either Cowork can write them or Randy can hand them to me with explicit permission to touch those files.

## What's NOT in M23

- Cookie-based session storage. The proper Safari ITP defense is a custom storage adapter writing to `document.cookie` with `SameSite=Lax`. Big change touching session lifecycle and refresh-token rotation; out of scope for a 2-3 hr hardening pass.
- File picker changes. Existing dual-button design (`capture="environment"` for camera, no-capture input for "Choose files") is intentional and works on iOS as-is.
- Audit walkaround changes. AuditModeShell uses `position: fixed` correctly and `PinOverlay` uses pointer events, not deprecated touch events. No iOS-specific bugs found.
- AcceptInvitation pre-flight. The global SessionLostHandler already catches a 401 from the accept mutation and redirects, so a duplicate pre-flight `getSession()` would be redundant.
- Position-fixed dialogs + iOS keyboard. AssetDrawer, NewAssetDialog etc. are `fixed`-positioned containers that can hide focused inputs behind the iOS keyboard. Fixing this universally requires either VirtualKeyboard API opt-in or per-input scroll-into-view; deferred until a real complaint surfaces.

## Pre-existing test failure (NOT introduced by M23)

`tests/unit/building-nav.test.tsx` has 3 failing tests — the mock for `@/hooks/useBuildings` is missing the `useCreateBuilding` export that BuildingNav started using sometime around M17 ("Add building" UI). Verified failures reproduce on pristine HEAD with `git stash`. Reasonable cleanup work for a future pass; doesn't block M23 because Netlify runs `tsc -b && vite build`, not unit tests.

## Files touched (8)

- `src/lib/supabase.ts` — flowType: 'pkce' explicit
- `src/lib/queryErrorHandler.ts` — NEW; auth-error classifier + event bus
- `src/App.tsx` — QueryCache/MutationCache onError wiring + SessionLostHandler component
- `src/components/waymarks/AppShell.tsx` — min-h-dvh
- `src/components/waymarks/BuildingNav.tsx` — max-h-dvh in calc
- `tests/unit/query-error-handler.test.ts` — NEW; 9 unit tests covering classifier and event bus
- `docs/m23-verification.md` — NEW; this doc
- `push-m23.ps1` — NEW
