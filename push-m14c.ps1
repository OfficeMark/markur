# M14c: floor-view tightening + persistent Encrypted badge + ViewMark
# stub bridge.
#
# - src/components/waymarks/EncryptedChip.tsx: new persistent gold pill
#   in the top nav. Tooltip explains "Your data is encrypted in transit
#   (TLS) and at rest in the database." Brings back the "encrypted"
#   trust signal the older Waymarks build had on the dashboard.
# - src/components/waymarks/AppShell.tsx: mounts EncryptedChip beside
#   LiveSyncChip in the header.
# - src/routes/Floor.tsx: replaces the eyebrow + giant H1 floor-label
#   stack with a single compact breadcrumb (Home > Building > Floor),
#   reduces vertical padding (py-8 -> py-4 / py-10 -> py-5), gives
#   ~100px of vertical real estate back to the floor plan canvas.
#   Also adds a Visualize button to the floor toolbar that opens the
#   ViewMark visualizer in a new tab with the building name as a hint.
# - src/components/waymarks/AssetDrawer.tsx: adds a per-asset
#   Visualize panel (gold, prominent) right above the asset details
#   so a user looking at one specific pin can drop into ViewMark to
#   mock up signage at that exact location. Both Visualize entry
#   points are stubs - the deep auth/floor-context bridge ships in a
#   later milestone.
#
# No migration. No new dependencies.
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add src/components/waymarks/EncryptedChip.tsx
git add src/components/waymarks/AppShell.tsx
git add src/routes/Floor.tsx
git add src/components/waymarks/AssetDrawer.tsx
git add docs/m14c-verification.md
git add push-m14c.ps1

git commit -m "M14c: tighter Floor header (compact breadcrumb, reduced padding) + persistent Encrypted badge in top nav + Visualize-in-ViewMark stubs in floor toolbar and AssetDrawer"

git push origin main
