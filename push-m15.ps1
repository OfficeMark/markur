# M15: proper Admin section.
#
# Replaces the previous "stack of cards on /settings" pattern with a
# real admin layout. /admin has a left rail with sections (Asset types,
# Members, Invitations, Security, Branding) and a content pane on the
# right. Each section is its own URL — bookmarkable, browser back/
# forward works, deep-linkable.
#
# /settings is now personal-only (profile, theme, account). Admin users
# see a gold "Admin" banner on /settings linking to /admin, and a new
# "Admin" item in the user menu. Non-admins never see it.
#
# - src/routes/Admin.tsx: outer admin route. Sidebar nav + Outlet. Gated
#   by super_admin or building_admin role; non-admins redirect to
#   /settings.
# - src/components/waymarks/admin/AdminAssetTypesPane.tsx: thin wrapper
#   around the existing AssetTypesCard.
# - src/components/waymarks/admin/AdminMembersPane.tsx: ditto for
#   MembersCard.
# - src/components/waymarks/admin/AdminInvitationsPane.tsx: ditto for
#   PendingInvitationsCard.
# - src/components/waymarks/admin/AdminSecurityPane.tsx: NEW. Surfaces
#   the security posture inside the app: encryption (TLS in transit, at
#   rest in DB and storage), access control (RLS, role-based grants,
#   instant revoke), authentication (Supabase Auth, hashing, 2FA on
#   roadmap), data ownership (export + deletion mailtos), and a
#   compliance hook for IT teams.
# - src/components/waymarks/admin/AdminBrandingPane.tsx: placeholder
#   pane reserving the slot for org-logo upload work.
# - src/App.tsx: lazy-loads Admin and the five panes; mounts /admin
#   with nested sub-routes; index redirects to /admin/asset-types.
# - src/routes/Settings.tsx: removes the three moved cards. Adds an
#   AdminLink banner (gold, prominent) for admin users that links to
#   /admin. Personal-only sections (profile, theme, account) stay.
# - src/components/waymarks/UserMenu.tsx: adds an "Admin" dropdown item
#   gated by usePermissions().grants. Above "Account settings".
# - src/components/waymarks/AppShell.tsx: makes the Encrypted badge in
#   the top nav clickable; navigates to /admin/security.
# - src/components/waymarks/EncryptedChip.tsx: tooltip updated to hint
#   clicking opens the security details page.
#
# No migration. No new dependencies. All existing tests should still
# pass — the cards moved but kept their behavior.
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

# New files
git add src/routes/Admin.tsx
git add src/components/waymarks/admin/AdminAssetTypesPane.tsx
git add src/components/waymarks/admin/AdminMembersPane.tsx
git add src/components/waymarks/admin/AdminInvitationsPane.tsx
git add src/components/waymarks/admin/AdminSecurityPane.tsx
git add src/components/waymarks/admin/AdminBrandingPane.tsx
# Modified
git add src/App.tsx
git add src/routes/Settings.tsx
git add src/components/waymarks/UserMenu.tsx
git add src/components/waymarks/AppShell.tsx
git add src/components/waymarks/EncryptedChip.tsx
git add docs/m15-verification.md
git add push-m15.ps1

git commit -m "M15: proper Admin section at /admin with sidebar nav (Asset types, Members, Invitations, Security, Branding); /settings becomes personal-only; Encrypted badge navigates to /admin/security"

git push origin main
