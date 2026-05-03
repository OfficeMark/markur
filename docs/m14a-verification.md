# M14a verification

Org-wide members management on /settings.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both should be clean.

## Smoke test (manual)

Sign in as a Super admin or Manager, go to `/settings`, scroll to the new "Members" card.

### Roster shows correct people

1. The card lists everyone with an active `access_grants` row for any building owned by your org.
2. Members are grouped by building name (alphabetic).
3. Within each building, members are ordered by role (Manager first, then Facilities/Auditor, then by name).
4. Your own row appears with "(you)" suffix and the role dropdown / revoke button are disabled.
5. Super admin rows show a locked gold badge instead of a dropdown — no one can edit them via UI.

### Role change

1. Pick a row that's not yours and click the role dropdown.
2. As Super admin: you see Manager, Facilities, Auditor as options.
3. As Manager: you see Facilities and Auditor only — not Manager (Manager is at your own level).
4. Pick a different role. A confirmation modal opens explaining what changes for that person.
5. Confirm. The row updates immediately. The affected user sees their new role on next page load.
6. Cancel returns the dropdown to the original role.

### Revoke

1. Click the user-minus icon on someone else's row.
2. Confirmation modal: "Remove [name]? They will lose access to [scope] immediately."
3. Confirm. Row disappears from the card.
4. The revoked user, on their next page load, sees no Settings page or limited access depending on what other grants they have.

### Self-protection

1. Your own row's role dropdown is disabled.
2. Your own row's revoke button is disabled.
3. Tooltip on hover: implicit (browser default for disabled).

### Hierarchy isn't bypassable via the dropdown

1. As a Manager, the dropdown does NOT include Manager as an option.
2. The current role is shown as "(current)" if it's not in the grantable set (e.g. you're a Manager looking at someone whose existing role is Manager — though under our rules that's a peer and you wouldn't normally need to change them).

### Invitation dialog labels updated

1. Open any building's access panel and click "Invite member".
2. Role options now read: Manager / Auditor / Facilities. No "Building admin" or "Tenant rep" anywhere.
3. Help text under Facilities reads "Day-to-day building staff..." — does not mention tenants.

## Known limitation (deferred)

The role hierarchy rule is enforced UI-side only. A user calling the API directly could insert a grant with a role above their level. Mitigated by:
- The existing `access_grants_admin_write` RLS still requires the writer be admin on the scope they're touching, so the worst case is a building admin promoting one of their existing members to building_admin within the same building.
- A future hardening migration (TBD) should add a `role_level` helper and a tightened `with check` on `access_grants_admin_write`. Note: that migration must also introduce an `accept_invitation` security-definer RPC so non-admin invitees can still accept (the current acceptInvitation client function inserts directly and would fail the new check).
