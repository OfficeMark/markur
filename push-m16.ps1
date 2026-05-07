# M16: org branding (functional).
#
# Lets a building admin upload an org logo, set an accent color, and
# override the org's display name. Saved values flow into the top-nav
# co-branding ("Markur · for [Org Name]") immediately. Foundation for
# (later) PDF export header + invitation email branding.
#
# - supabase/migrations/0020_m16_org_branding.sql: org_branding table
#   (org_id PK, logo_path, accent_color, display_name_override) with
#   RLS matching M14's pattern. Plus org-logos storage bucket (public
#   read, 2 MB cap, png/jpg/svg/webp) and storage policies that gate
#   writes to the org's building_admin.
# - src/lib/queries/branding.ts: queries (getOrgBranding, saveOrgBranding,
#   uploadOrgLogo, deleteOrgLogo, logoPublicUrl), file validation, a
#   curated accent-color palette.
# - src/hooks/useBranding.ts: React Query wrappers + orgId derivation
#   (same pattern as useAssetTypes / useMembers).
# - src/components/waymarks/admin/AdminBrandingPane.tsx: full functional
#   replacement of the placeholder. Logo upload (with live preview),
#   color picker, display-name override, live preview of the resulting
#   top nav, save button.
# - src/components/waymarks/AppShell.tsx: new OrgCoBrand component that
#   shows "for [Org Name]" + small logo to the right of the Markur
#   wordmark when branding is set. Renders nothing for unbranded orgs.
# - src/types/database.ts: org_branding table type added.
#
# Skipped for now (later milestones):
#   - White-label mode (Markur branding hidden entirely)
#   - Per-org accent color cascading to UI buttons
#   - PDF export header using the logo
#   - Invitation email template using the logo (requires Edge Function
#     redeploy)
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build
#
# Apply migration 0020 to Supabase BEFORE pushing (or in parallel).

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add supabase/migrations/0020_m16_org_branding.sql
git add src/lib/queries/branding.ts
git add src/hooks/useBranding.ts
git add src/components/waymarks/admin/AdminBrandingPane.tsx
git add src/components/waymarks/AppShell.tsx
git add src/types/database.ts
git add docs/m16-verification.md
git add push-m16.ps1

git commit -m "M16: functional org branding - logo upload + accent color + display-name override; OrgCoBrand sliver in top nav; org_branding table + org-logos storage bucket"

git push origin main
