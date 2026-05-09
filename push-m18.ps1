# M18: asset window robustness.
#
# Per Randy's directive after the BAS demo: drop required-field
# validation, add metadata fields used during real audit walks
# (room number, notes, vendor contact). Foundation for M18b
# attachments — the schema and storage bucket are already in place;
# the upload UI ships in the next milestone once a few real audits
# tell us what file types and metadata we actually need.
#
# - supabase/migrations/0021_m18_asset_robustness.sql: adds
#   room_number / notes / vendor_contact (jsonb) columns to assets.
#   Length checks as soft guard rails. Plus the asset_attachments
#   table + asset-attachments storage bucket + RLS policies (read
#   gated by view-on-floor; write gated by edit-on-building, same
#   pattern as asset_photos).
# - src/lib/queries/assets.ts: VendorContact type. CreateAssetInput
#   now accepts the new fields, name is optional (server-side fallback
#   to "Untitled" when blank — keeps the DB NOT NULL but matches the
#   "all optional" UX).
# - src/components/waymarks/NewAssetDialog.tsx: only `type` is
#   form-required now. Room number, vendor name/email/phone, and a
#   notes textarea added in a 2-column block before the photo picker.
# - src/components/waymarks/AssetDrawer.tsx: DetailsSection extended
#   with a room-number chip, a notes block, and a vendor contact card
#   with click-to-email / click-to-call.
# - src/types/database.ts: assets columns + asset_attachments table
#   reflected.
#
# What's NOT in M18 (deferred to a later "M18b"):
#   - The attachments UPLOAD UI (file picker, signed-URL view, list).
#     Schema and bucket are in place so it's a UI-only milestone next.
#   - Filter-by-category quick-select in the placement window. Was on
#     Randy's list; intentionally deferred to keep this ship small and
#     low-risk after the BAS demo bugs.
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add supabase/migrations/0021_m18_asset_robustness.sql
git add src/lib/queries/assets.ts
git add src/components/waymarks/NewAssetDialog.tsx
git add src/components/waymarks/AssetDrawer.tsx
git add src/types/database.ts
git add docs/m18-verification.md
git add push-m18.ps1

git commit -m "M18: asset window robustness - room_number/notes/vendor_contact fields, all-optional form, schema for attachments; DetailsSection in drawer extended"

git push origin main
