# M14b verification

Org-wide pending-invitations card on /settings.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both should be clean.

## Smoke test (manual)

Sign in as a Super admin or Manager, go to `/settings`, scroll to the new "Pending invitations" card. (It sits between Members and Account.)

### Card shows the right invitations

1. From any building's access panel, send a new invitation.
2. The invitation appears in the M14b card immediately (after a 30s staleTime invalidation; React Query refetches on window focus, so re-focus the tab if needed).
3. Each row shows: email, role (Manager/Facilities/Auditor), scope label, sent timestamp, expires-in.
4. Status pill is gold "pending" when within the validity window, gray "expired" once `expires_at` passes.

### Copy link

1. Click "Copy link" on any pending row.
2. Button briefly turns into "Copied" with a checkmark.
3. Paste into another tab — `/accept/<token>` loads the invitation page.

### Resend email

1. Click "Resend email" on a pending row.
2. The M13 Edge Function is re-invoked. Recipient gets another email pointing at the same /accept link.
3. Button briefly turns into "Sent" with a checkmark.
4. If `RESEND_API_KEY` isn't set in Supabase secrets, the Edge Function returns an error and the card surfaces it via a red banner. Copy link still works as a fallback.
5. Resend on an expired row is disabled.

### Revoke

1. Click "Revoke" on any row.
2. Confirmation modal: "Revoke invitation to [email]? The accept link will stop working immediately."
3. Confirm. Row disappears.
4. Open the previously-copied accept URL in a new browser → the lookup returns "Invitation not found" (because the row was hard-deleted).

### Accept removes from this card

1. Send a new invitation, copy its link.
2. Open the link in a private window, accept it as a fresh user.
3. Refresh /settings as the inviter — the row is gone from Pending invitations and the new member appears in the Members card above.

## Known limitation

If `RESEND_API_KEY` is not configured in Supabase secrets, Resend silently fails (the Edge Function 500s). The card surfaces this with a red banner pointing the admin at the right setup step. Copy link is the manual workaround.
