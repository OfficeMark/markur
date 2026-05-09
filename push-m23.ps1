# M23: Safari/iOS hardening - auth-error recovery + dvh viewport units.
#
# - src/lib/supabase.ts: flowType 'pkce' explicit (defensive pin; was the
#   default in supabase-js 2.43+ but now can't silently regress on upgrade).
# - src/lib/queryErrorHandler.ts: NEW. Classifies any error as auth-expired
#   by status / PostgREST code / error name / message text. Plugged into
#   QueryClient.queryCache + mutationCache onError, so any 401 from a
#   read or write fires a 'markur:session-lost' window event.
# - src/App.tsx: wires the QueryCache/MutationCache onError to the helper,
#   adds a SessionLostHandler component that listens for the event, shows
#   a top-of-screen "Your session expired" banner for 1.5s, then redirects
#   to /login?next=<currentPath>&reason=session-expired with replace.
#   This is the actual Safari ITP recovery path: when localStorage gets
#   wiped mid-flow, the user gets a context-clear bounce instead of a
#   silent failure.
# - src/components/waymarks/AppShell.tsx: min-h-screen + min-h-dvh.
# - src/components/waymarks/BuildingNav.tsx: max-h-dvh fallback in the
#   sticky sidebar calc so it doesn't clip behind the iOS toolbar.
# - tests/unit/query-error-handler.test.ts: NEW. 9 unit tests covering
#   the classifier and event-bus subscribe/unsubscribe.
#
# Honest caveat: PKCE alone does not defeat Safari ITP - the verifier
# sits in localStorage with the access token and they vanish together.
# The ITP defense is the recovery path, not the flow change.
#
# Owner-managed files NOT touched (parallel changes documented in
# docs/m23-verification.md): src/routes/Login.tsx, ProtectedRoute.tsx.
#
# No migration. No new dependencies.
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build
#   npx vitest run tests/unit/query-error-handler.test.ts (9/9 pass)
#
# Pre-existing failure NOT introduced by M23: tests/unit/building-nav.test.tsx
# has stale mock for useCreateBuilding (3 failures). Reproduces on pristine
# HEAD. Netlify only runs tsc -b + vite build, not vitest, so it does not
# block deploy.

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add src/lib/supabase.ts
git add src/lib/queryErrorHandler.ts
git add src/App.tsx
git add src/components/waymarks/AppShell.tsx
git add src/components/waymarks/BuildingNav.tsx
git add tests/unit/query-error-handler.test.ts
git add docs/m23-verification.md
git add push-m23.ps1

git commit -m "M23: Safari/iOS hardening - graceful session-expired recovery + dvh viewport units"

git push origin main
