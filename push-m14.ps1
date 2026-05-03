# M14: per-org overrides on the global asset-type catalog.
#
# - 0019_m14_org_asset_type_overrides.sql: new table letting building
#   admins hide / rename / recolor / reorder a global type for their
#   org without touching the underlying global row. RLS policies match
#   M11's pattern: read for any authenticated user, write only for
#   building_admin of a building owned by that org.
# - src/lib/queries/asset-types.ts: extended with EffectiveAssetType,
#   listEffectiveAssetTypes (merges globals + overrides + org-specific),
#   setOverride / clearOverride / updateAssetType / countAssetsForType.
# - src/hooks/useAssetTypes.ts: refactored. Hook now derives orgId
#   internally, returns merged effective list, plus signage/facility
#   filters that exclude hidden. New mutation hooks: useUpdateAssetType,
#   useSetOverride, useClearOverride. New query hook: useAssetCountForType
#   (used by hide/delete confirm dialogs).
# - src/components/waymarks/AssetTypesCard.tsx: rewritten. Inline
#   label edit, inline color picker, hide / unhide toggle with
#   assigned-asset count confirm modal, "Reorder" mode with up/down
#   arrows, "Reset to default" button on overridden globals, edit-not-
#   just-delete on org-specific rows.
# - src/types/database.ts: added the new table type.
#
# Manual setup still required (one-time, before pushing):
#   1. Apply migration 0019 to Supabase. From the Supabase MCP or
#      dashboard SQL editor, run the contents of
#      supabase/migrations/0019_m14_org_asset_type_overrides.sql.
#      Verify the org_asset_types_org_admin_write policy exists from
#      M11 (the migration's DO block raises if it does not).
#   2. Pre-push gauntlet: from this folder run
#         npx tsc -b
#         npx vite build
#      Both should be clean before this script runs.

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

# Touched code
git add supabase/migrations/0019_m14_org_asset_type_overrides.sql
git add src/lib/queries/asset-types.ts
git add src/hooks/useAssetTypes.ts
git add src/components/waymarks/AssetTypesCard.tsx
git add src/types/database.ts
git add docs/m14-verification.md
git add specs/08-m14-admin-customization.md
git add push-m14.ps1

git commit -m "M14: per-org overrides on global asset types - hide/rename/recolor/reorder; edit-in-place on org-specific rows; assigned-asset count on hide/delete confirms"

git push origin main
