# M14b: org-wide pending invitations admin.
#
# Companion to M14a. Aggregates open invitations across every building
# owned by the org so an admin can resend, copy the accept link, or
# revoke from one place rather than per-building.
#
# - src/lib/queries/invitations.ts: new module. listInvitationsForOrg
#   fans out across the org's buildings; resendInvitation re-invokes
#   the M13 send-invitation-email Edge Function (idempotent: looks up
#   the row under the caller's JWT and sends another email at the
#   same /accept/<token>); revokeInvitation re-exports the existing
#   cancelInvitation hard-delete from access.ts.
# - src/hooks/useInvitations.ts: standard React Query wrapping.
# - src/components/waymarks/PendingInvitationsCard.tsx: new card on
#   /settings. Per-row: pending/expired status pill, sent/expires
#   timestamps via date-fns, Copy link / Resend email / Revoke
#   buttons. Resend surfaces a clear error if RESEND_API_KEY isn't
#   configured. Revoke goes through a confirmation modal.
# - src/routes/Settings.tsx: mounts PendingInvitationsCard under the
#   M14a Members card.
#
# No migration. The existing pending_invitations table and RLS
# policies are sufficient. Resend uses the M13 Edge Function as-is.
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add src/lib/queries/invitations.ts
git add src/hooks/useInvitations.ts
git add src/components/waymarks/PendingInvitationsCard.tsx
git add src/routes/Settings.tsx
git add docs/m14b-verification.md
git add push-m14b.ps1

git commit -m "M14b: org-wide pending invitations card on /settings - resend, copy link, revoke; reuses M13 send-invitation-email Edge Function for resend"

git push origin main
