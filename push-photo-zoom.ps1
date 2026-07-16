# Photo zoom + faster Replace (rebuild round, 2026-07-14).
#
# WHAT CHANGED (3 files):
#   1. NEW src/components/waymarks/PhotoLightbox.tsx -- full-screen zoomable
#      viewer for a pin's photos: pinch (focal-anchored, same math as the plan
#      canvas), wheel zoom, drag pan, double-tap fit<->2.5x, arrow keys +
#      counter for multi-photo pins, recenter + zoom %, Esc/X to close.
#   2. AssetDrawer.tsx -- hero photo is now tappable (cursor-zoom-in) and has
#      an expand button next to Save; both open the lightbox. State + render
#      wired at drawer level so the strip's active photo carries over.
#   3. FloorPlanUploadDialog.tsx -- Replace speedup: the original-file upload
#      now runs CONCURRENTLY with plate production (and with the plate upload)
#      instead of ahead of them. Every exit path still awaits the original
#      before writing the floors row, so plan_url never points at a missing
#      object. On a 10-20 MB PDF this removes most of the added wall-clock.
#
# CONTEXT (from the perf investigation):
#   Floor-open slowness = old v1 plates, NOT Plan Prep code (floor opens ship
#   zero Plan Prep bytes). Dev has 8 heavy v1 floors -- worst: Mezzanine at
#   13.8 MB. Fix is re-replacing those plans (v2 re-bakes them 5-48x smaller,
#   e.g. 286 KB). No feature removal; measure after re-bake + this round.
#
# Gates run below; commit + push + DEPLOY only happen if all pass.

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }
if (Test-Path _to_delete) { Remove-Item _to_delete -Recurse -Force }

Write-Host "Gate 1/3: tsc -b ..." -ForegroundColor Cyan
npx tsc -b
if ($LASTEXITCODE -ne 0) { Write-Host "tsc FAILED - not committing" -ForegroundColor Red; exit 1 }

Write-Host "Gate 2/3: eslint ..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { Write-Host "eslint FAILED - not committing" -ForegroundColor Red; exit 1 }

Write-Host "Gate 3/3: vitest ..." -ForegroundColor Cyan
npm run test
if ($LASTEXITCODE -ne 0) { Write-Host "tests FAILED - not committing" -ForegroundColor Red; exit 1 }

git add src/components/waymarks/PhotoLightbox.tsx src/components/waymarks/AssetDrawer.tsx src/components/waymarks/FloorPlanUploadDialog.tsx push-photo-zoom.ps1
git commit -m "feat(photos): full-screen pinch-zoom viewer for pin photos; perf(plan-prep): parallelize original upload with plate production" -m "PhotoLightbox: focal-anchored pinch/wheel/drag/double-tap viewer (same gesture math as FloorPlanCanvas), multi-photo navigation, opened from the hero photo or its expand button. Replace flow: the retained original now uploads concurrently with plate production and the plate upload; all row writes still await it." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. HARD RELOAD once per device, then test:" -ForegroundColor Green
Write-Host "  1. Open a pin with photos - tap the photo (or expand icon): full-screen," -ForegroundColor Green
Write-Host "     pinch/scroll to zoom into detail, drag to pan, double-tap to zoom, arrows between photos" -ForegroundColor Green
Write-Host "  2. Replace a plan with a biggish PDF - noticeably quicker than yesterday" -ForegroundColor Green
Write-Host "  3. THE RE-BAKE (floor-open speed fix): re-replace the plans on the 8 heavy floors" -ForegroundColor Green
Write-Host "     (Mezzanine is the 13.8 MB monster) - then judge floor-open speed" -ForegroundColor Green
