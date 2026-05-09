# M17b: UX fixes from BAS demo feedback (round 2).
#
# After M17 + M18 went out, Randy walked through the live build and
# flagged four real friction points. None are blocker bugs; they're the
# kind of micro-cuts that tank a demo.
#
# - src/routes/Admin.tsx: adds a "Back to Markur" link at the top of
#   the admin sidebar. The Markur wordmark in the top nav already goes
#   home, but it isn't obvious there's a way out of /admin. Explicit
#   link removes the dead-end feeling.
# - src/components/waymarks/NewAssetDialog.tsx:
#   - Type field is now optional. If left blank, falls back to the
#     seeded "other" type so the pin still has a category at the DB.
#   - Type dropdown gains a "+ Add custom type..." option at the
#     bottom. Picking it opens an inline label field; saving creates
#     an org-specific asset_type via existing M11 plumbing and auto-
#     selects it. Reusable next time, not a one-off.
#   - Vendor info fields removed from the placement flow entirely.
#     Per Randy: "added during audit or from your desk later."
#   - Room number stays in the placement flow.
# - src/components/waymarks/AssetDrawer.tsx:
#   - DetailsSection swapped its read-only vendor card for a
#     VendorPanel component. When no vendor info exists, shows a
#     dashed "+ Add vendor info" button. When set, shows a tidy card
#     with an edit pencil that opens an inline form (vendor name,
#     company, email, phone) wired to useUpdateAsset.
#
# No migration. No new dependencies.
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add src/routes/Admin.tsx
git add src/components/waymarks/NewAssetDialog.tsx
git add src/components/waymarks/AssetDrawer.tsx
git add docs/m17b-verification.md
git add push-m17b.ps1

git commit -m "M17b: 'Back to Markur' admin exit link; type optional + custom-type inline; vendor info moved out of NewAssetDialog into editable VendorPanel in drawer"

git push origin main
