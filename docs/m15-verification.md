# M15 verification

Proper Admin section at /admin; /settings becomes personal-only.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both clean.

## Smoke test (manual)

### As an admin (super_admin or building_admin)

1. Sign in. The user menu (top-right avatar dropdown) now shows "Admin" as the first item, with a gold shield icon. Click it.
2. /admin redirects to /admin/asset-types and renders the new admin layout: left sidebar with five sections (Asset types, Members, Invitations, Security, Branding); content area on the right.
3. The active section in the sidebar is highlighted gold. Click each section in turn:
   - Asset types: same hide/rename/recolor/reorder UI as M14 — full pane width.
   - Members: same roster + role change + revoke as M14a — full pane width.
   - Invitations: same resend/copy/revoke as M14b — full pane width.
   - Security: the new posture page (see below).
   - Branding: placeholder ("Coming soon").
4. Browser back/forward works between sections.
5. Direct URLs work: typing /admin/security or /admin/members in the address bar lands you in the right pane.

### As a non-admin

1. Sign in as a Facilities or Auditor user. The user menu does NOT show "Admin".
2. Navigate to /admin manually. Redirects to /settings.

### /settings now

1. /settings shows: profile (name, email, role badge), Theme, Admin banner (admin only — gold pill linking to /admin), Account (sign out, delete account).
2. The three previously-stacked admin cards (asset types, members, invitations) are gone. Admins can find them at /admin.

### Encrypted badge in top nav

1. Click the gold Encrypted pill in the top nav.
2. Navigates to /admin/security.
3. Tooltip on hover: "Your data is encrypted in transit (TLS) and at rest. Click for the full security posture."

### Security pane content

1. Encryption section — three rows: in transit, at rest in DB, at rest in storage. All show green "On" pills.
2. Access control section — RLS, role-based grants, instant revocation. Inline link to /admin/members.
3. Authentication section — Supabase Auth, password hashing, sessions. 2FA shows orange "Planned" pill (honest about the roadmap state). User's last sign-in timestamp shown if available.
4. Your data section — two action buttons: "Request data export" and "Request account deletion" (mailtos to support@officemark.ca). Note about 30-day processing.
5. Compliance section — invitation for IT team review, mention of SOC 2 / ISO 27001 / HIPAA conversations.

## Performance

Each admin pane is its own lazy chunk (`src/App.tsx` uses React.lazy for all five). Users who never visit /admin pay zero bytes for the admin tooling. Verified via `npx vite build` output: separate `Admin*-<hash>.js` chunks.
