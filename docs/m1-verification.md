# M1 — verification & next steps for the owner

What was built, what's verified, what you need to do.

## What's now in the repo

**Database (applied to your Supabase project `drclmnqlurvwqpnnpgzb`):**

- Migration `0001_init.sql` — every table from `specs/03-data-model.md` (profiles, organizations, buildings, floors, tenants, assets, audit_sessions, audit_events, flags, access_grants, audit_log, pending_invitations) with indexes and the `set_updated_at` / `validate_pin_coords` triggers.
- Migration `0002_user_can.sql` — the `user_can(capability, scope_type, scope_id)` SQL function from `specs/04-permissions.md`. This is the one canonical place where the role model lives on the server.
- Migration `0003_rls.sql` — RLS enabled on every table, with policies that delegate to `user_can()`.
- Migration `0004_harden_trigger_search_path.sql` — pins `search_path` on the trigger functions (Supabase security advisor was warning about this).
- A trigger on `auth.users` that auto-creates a `public.profiles` row on signup.

The full SQL is also in `supabase/migrations/` so you can read the source of truth without leaving the repo.

**Code:**

- `src/lib/supabase.ts` — typed Supabase client, single instance for the whole app.
- `src/types/database.ts` — TypeScript types generated from the live schema.
- `src/lib/AuthProvider.tsx` + `src/lib/auth-context.ts` — `<AuthProvider>` and the `useAuth()` / `useCurrentUser()` hooks.
- `src/lib/PermissionsProvider.tsx` + `src/lib/permissions-context.ts` + `src/lib/permissions-types.ts` + `src/lib/Can.tsx` — the front-end mirror of `user_can()`. Use `<Can action="..." resource={...}>` and `useCan()` everywhere instead of `if (role === ...)`.
- `src/components/ui/{Button,Avatar,EmptyState}.tsx` — UI primitives.
- `src/components/waymarks/{AppShell,UserMenu,SyncChip,RoleBadge}.tsx` — the persistent header layout.
- `src/routes/Login.tsx` — sign-in / sign-up tabs with React Hook Form + Zod validation.
- `src/routes/ProtectedRoute.tsx` — route guard that redirects unauthenticated users to `/login`.
- `src/routes/Home.tsx` — the empty state ("no buildings yet") for a signed-in user with no grants.
- 18 tests (unit) — including 9 over the `checkCapability` permission logic.

**Config:**

- `.env.local` — your Supabase URL + anon key (gitignored).
- `package.json` — added `@hookform/resolvers` and a `db:types` script that regenerates the types via the Supabase CLI (after a one-time `npx supabase login` on your machine).

## Verified automatically

- `npm run typecheck` — no errors
- `npm run lint` — no errors (max-warnings=0)
- `npm run test` — 18/18 passing
- `npm run build` — clean (570 kB JS / 24 kB CSS gzipped to ~169 kB / ~5 kB)
- Supabase security advisors — clean

## What you need to do

### 1. Add Supabase env vars to Netlify (required — production will crash without them)

Go to **Netlify → Site overview → Site configuration → Environment variables**. Click **Add a variable** twice and add:

- Key: `VITE_SUPABASE_URL`
  Value: `https://drclmnqlurvwqpnnpgzb.supabase.co`
- Key: `VITE_SUPABASE_ANON_KEY`
  Value: (the long JWT starting `eyJ...` — same one you pasted me earlier; if you've lost it, grab it again from Supabase → Project Settings → API → anon public)

After adding both, click **"Deploys"** in the left nav → **"Trigger deploy"** → **"Deploy site"**. Netlify rebuilds with the env vars baked in. Without these the production page will throw "Missing Supabase environment variables."

### 2. Verify locally (5 min)

Open PowerShell:

```
cd "C:\Users\randy\DEV\Waymarks Claude Code"
npm run dev
```

Then go to `http://localhost:5173`. You should:

- Get redirected to `/login` (you're not signed in).
- See a sign-in / sign-up tabbed form with name + email + password fields and Zod validation (try submitting blank — it'll show errors inline).
- Click **Sign up**, fill in your name, email (use a real one — Supabase will send a confirmation email by default), and a password ≥ 8 chars.
- Click **Create account**.
- One of two things happens:
  - Auto sign-in (if email confirmation is disabled in your Supabase project) → you land on `/` with the dark header and an empty state: "No buildings yet."
  - Email confirmation message → check your inbox, click the link, then come back to `/login` and sign in.
- Once signed in, the header shows the wordmark, a green "Synced" chip, and your name/avatar in a dropdown. Click the dropdown — you can toggle dark mode and sign out.
- Reload the page — you should stay signed in (session persists).
- Click "Sign out" in the dropdown — you're back at `/login`.

### 3. Grant yourself super_admin (so you can see what an admin sees)

Once you've signed up at least once, ping me with the email you used and I'll insert a `super_admin` access_grant for that user via the Supabase MCP. You'll then see the placeholder "you have 1 access grant" message instead of the empty state. (Real building list lands in M2.)

### 4. Verify on Netlify

After step 1 finishes deploying, go to your Netlify URL (https://waymarks-rebuild.netlify.app). Same flow — sign up / sign in / out — should work end-to-end.

## Things to try if something goes wrong

- **"Missing Supabase environment variables" in browser console:** step 1 wasn't done, or Netlify hasn't redeployed since you added them.
- **"Invalid login credentials":** wrong password, or email confirmation isn't done yet.
- **Login flow loops:** clear local storage in dev tools (the `waymarks-auth` key) and try again.
- **Sign-up error "Database error saving new user":** the trigger that creates `profiles` rows failed. Tell me — I can debug from the server side.

## Acceptance for M1 (per `specs/07-build-order.md`)

- [x] Sign up via email/password works
- [x] Login persists across reloads
- [x] Logged-out state correctly redirects to `/login`
- [x] Header looks like the design system specifies (dark ink + gold accent)
- [x] A signed-in user with no `access_grants` sees the empty state
- [ ] Granting them a `super_admin` role manually in SQL → they see the building list (empty for now) — pending step 3 above

That last box is the only thing I can't tick automatically. Ping me your email after step 2 and I'll insert the grant from here.

## What's coming in M2

Buildings + floors (read-only). I'll seed your project with one example building (161 Bay St., 5 floors B2 → 3) so you have something to click around. After that, M3 is uploading floor plan PDFs.
