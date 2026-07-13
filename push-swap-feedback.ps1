# Plan-replace polish: no dead air after the upload window closes.
#
# WHAT CHANGED (1 file):
#   src/components/waymarks/FloorPlanUploadDialog.tsx -- the upload mutation's
#   onSuccess now AWAITS the floor-detail refetch before closing the dialog.
#   The dialog holds its working spinner through the refetch, so the close
#   lands directly on the new-plan swap instead of leaving the stale plan on
#   screen for several seconds (which read as "Replace did nothing").
#
# NOTE: the remaining wait after the swap starts is the new display image
# downloading (PNG plates up to 4096px can be several MB). That gets the
# bytes-diet treatment (JPG for scans, smaller cap) as a follow-up round
# after promotion -- tracked, not forgotten.
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

git add src/components/waymarks/FloorPlanUploadDialog.tsx push-swap-feedback.ps1
git commit -m "fix(plan-prep): hold upload dialog until the floor refetch lands" -m "The dialog closed the moment the save finished, seconds before the floor row refetched and the fresh signed URL resolved -- so the stale plan sat on screen looking like Replace did nothing. Awaiting the detail invalidation keeps the working spinner up through the refetch; the close now lands directly on the swap." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. HARD RELOAD (Ctrl+Shift+R) once on each device, then test." -ForegroundColor Green
