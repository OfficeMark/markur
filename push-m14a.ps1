# M14a: org-wide members management.
#
# Builds on the per-building grants surface that already lives in
# AccessManagementCard - adds an aggregated view at /settings that
# shows everyone with access across every building you own. Lets a
# Super admin or Manager change roles or revoke access. Dropdown
# options are constrained by the current user's level (you can only
# assign roles strictly below your own; Super admin is grant-anything).
#
# - src/lib/queries/members.ts: new module. listMembersForOrg fans
#   out across the org's buildings and merges. updateMemberRole and
#   revokeMember mutate the underlying access_grants row. ROLE_LABEL
#   maps internal role keys to user-facing strings (Manager,
#   Facilities, Auditor, Super admin).
# - src/hooks/useMembers.ts: wraps queries with React Query.
#   useMyHighestRoleLevel resolves the current user's effective level
#   from usePermissions().grants so the UI knows what roles to offer.
# - src/components/waymarks/MembersCard.tsx: new card on /settings.
#   Grouped by building. Self-row disabled (no self-revoke or
#   self-role-change). Super-admin rows show as a locked badge with no
#   role dropdown. Confirmation modal on every role change and revoke.
# - src/routes/Settings.tsx: mounts MembersCard between AssetTypesCard
#   and the Account section. Renames the user's role label
#   "Building admin" to "Manager" (cosmetic; database name unchanged).
# - src/components/waymarks/NewInvitationDialog.tsx: ROLE_OPTIONS
#   labels updated to match (Building admin -> Manager). Help text
#   updated for Facilities ("day-to-day building staff", not "tenant").
#
# RLS unchanged. The hierarchy rule is enforced UI-side for now -
# anyone bypassing the UI by calling the API directly could grant a
# role above their level, but the existing access_grants_admin_write
# policy already requires you to be admin on the scope you're writing
# to, so the blast radius is limited to your own buildings. Defense-
# in-depth (a DB-level role-level check + an accept_invitation RPC) is
# deferred to a separate hardening milestone.
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

# Touched code
git add src/lib/queries/members.ts
git add src/hooks/useMembers.ts
git add src/components/waymarks/MembersCard.tsx
git add src/routes/Settings.tsx
git add src/components/waymarks/NewInvitationDialog.tsx
git add src/components/waymarks/RoleBadge.tsx
git add src/components/waymarks/AssetDrawer.tsx
git add src/routes/Help.tsx
git add docs/m14a-verification.md
git add push-m14a.ps1

git commit -m "M14a: org-wide members card on /settings - change role / revoke; UI hierarchy enforces grant level; rename Building admin to Manager and tighten Facilities help text"

git push origin main
