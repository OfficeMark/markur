# M17: ship the missing "Add floor" UI.
#
# Context: we discovered after the BAS demo that floors had no creation
# UI anywhere — not in Building.tsx, BuildingNav, or Floor.tsx. The only
# floors that ever existed were the seed floors from M0/M5. The
# FloorPlanUploadDialog only updates an existing floor's plan_url; it
# doesn't create floor rows. Net effect: no user could create a new
# floor, ever. This was THE bug from "neither of us could add a floor."
#
# - src/lib/queries/floors.ts: adds createFloor() + nextFloorSortOrder()
#   helper. RLS gate `floors_admin_create` already requires edit rights
#   on the parent building, so no migration is needed.
# - src/hooks/useFloors.ts: adds useCreateFloor mutation hook with
#   sensible sort_order default (highest existing + 10).
# - src/components/waymarks/NewFloorDialog.tsx: new dialog. Creates the
#   floor row first, then optionally uploads a plan in the same flow.
#   If plan upload fails, the floor row still exists — user can add a
#   plan later from the floor view.
# - src/routes/Building.tsx: adds an "Add floor" button next to the
#   Floors heading (visible to canEdit users), an empty-state CTA when
#   there are no floors yet, and mounts NewFloorDialog. Also fixes the
#   stale local Skeleton wrapping (no functional change, just a
#   consistency pass while editing the file).
#
# No migration. No new dependencies.
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add src/lib/queries/floors.ts
git add src/hooks/useFloors.ts
git add src/components/waymarks/NewFloorDialog.tsx
git add src/routes/Building.tsx
git add docs/m17-verification.md
git add push-m17.ps1

git commit -m "M17: add NewFloorDialog + 'Add floor' button on Building page; closes the gap where floors had no creation UI anywhere"

git push origin main
