# M7 verification - permissions hardening + access management

**Live URL:** https://waymarks-rebuild.netlify.app
**Migration applied:** `0013_m7_tenant_rep_rls_hardening`

After Netlify ships, hard-refresh and walk through:

## 1. Access Management card surfaces on Building view

1. Open 161 Bay St. (signed in as super_admin).
2. Below the Floors section a new "People with access" card appears.
3. It lists your own super_admin grant. The "Invite user" gold button is in the top-right corner.

If you sign in as a non-admin user later, the card does NOT show (gated by `useCan('manage_access')`).

## 2. Create an invitation

1. Click "Invite user". Modal opens.
2. Enter email, pick a role (Building admin / Auditor / Facilities), pick the scope (floor for Auditor; tenant for Facilities), set an expiry in days (defaults to 30 for auditor).
3. Click "Create invitation". The modal flips to a "Copy this link" panel with the `/accept/<token>` URL.
4. Copy the link. Click Done.
5. Back on the Building view, a "Pending invitations" entry appears with a Copy link / Cancel pair.

## 3. Accept an invitation (round trip)

1. Open the invitation URL in a new private/incognito window.
2. You should be bounced to `/login?next=/accept/<token>` because you're signed out.
3. Sign in (or sign up) with the invited email. After auth, you're redirected back to `/accept/<token>`.
4. The page shows the role + scope preview. Click "Accept invitation".
5. The grant is inserted, the invitation row is marked `accepted_at`, and you're sent to `/`.
6. On `/`, the new user sees only what their role allows.

## 4. Tenant-rep direct-to-floor

1. Create a Facilities (tenant_rep) invitation scoped to a tenant.
2. Have the recipient accept it.
3. When they sign in next, the Home page should NOT show the building list — they should redirect straight to `/floors/<their-tenant-primary-floor>`.
4. In the sidebar (BuildingNav), only the building name is visible — no other floors of that building leak through.
5. Other tenants' assets on the same floor are hidden too.

## 5. Revoke a grant

1. As super_admin / building_admin, find the test user's grant in the People with access list.
2. Click "Revoke". The row disappears.
3. The revoked user reload: their previous access surface (the floor, the audit button, etc.) should now redirect or hide. They land on the empty-state Home if they have no other grants.

## 6. Time-bounded grants

1. Create an auditor invitation with `expires_in (days) = 1`.
2. After the recipient accepts, they should see audit capability on their floor.
3. Manually run in SQL:
   ```sql
   update access_grants
   set expires_at = now() - interval '1 day'
   where role = 'auditor' and user_id = '<user>';
   ```
4. The user reload: the audit capability is gone. The grant row in AccessManagementCard now shows an "Expired" chip and is greyed out.

## 7. RLS sanity check (super_admin SQL)

```sql
-- assets.photo_url should be gone
select column_name from information_schema.columns
where table_schema='public' and table_name='assets' and column_name='photo_url';
-- expect 0 rows

-- the new helper exists
\df public.user_can_view_asset

-- floors_view should reject tenant_rep on non-primary floors:
-- (run as a tenant_rep test user via supabase.auth.signInWithPassword in a console)
```

## 8. Build / test

- `npx tsc -b` clean.
- `npx vite build` clean (1.10 MB JS / 318 KB gzip - about +6 KB gzip vs M6 for all of M7's UI).
- `npx vitest run` - 83 / 83 passing across 15 test files (M6's 70 + 13 new for M7 in `permissions-tenant-rep.test.ts`).

## 9. Things explicitly deferred

- Email-sending Edge Function for invitations - the inviter still copy/pastes the link. M10 with the rest of email infra.
- Playwright e2e for all 7 spec § Test cases - needs a CI test-user/branch story; bundled with the test infrastructure pass we keep deferring.
- Building-admin remove user (with step-up) - `revokeGrant()` deletes immediately; M10 polish can add a confirmation.
- Public link sharing - off by default, M10+.
- DB rename `tenant_rep` to `facility_rep` - UI shows "Facilities" but DB value unchanged; defer to a focused commit when we touch the role enum for other reasons.
