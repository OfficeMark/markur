# Pin-safe scan cleanup on pinned floors (rebuild round, 2026-07-14).
#
# WHAT CHANGED (2 files):
#   1. enhance-scan.ts -- enhanceScanBlob(blob, { deskew }) option. Deskew is
#      geometry-changing (rotation moves content relative to the frame, so
#      normalized pins would drift); contrast + despeckle are strictly
#      per-pixel and pin-safe. Default deskew:true (unchanged behavior).
#   2. FloorPlanUploadDialog.tsx -- "Clean up scan" is now offered on EVERY
#      replace, including floors with pins (it runs pin-safe there: no
#      rotation, no crop). The before/after badge says which mode ran.
#      Crop stays pin-free-only, as designed. Explainer text updated.
#
# WHY: Randy replaced the rebuild tower's plans and was never offered the
# enhance -- the old gate hid ALL enhances on pinned floors, even though only
# deskew/crop actually endanger pins.
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

git add src/lib/plan-prep/enhance-scan.ts src/components/waymarks/FloorPlanUploadDialog.tsx push-pin-safe-clean.ps1
git commit -m "feat(plan-prep): pin-safe scan cleanup on pinned floors" -m "Clean up scan is now offered on every replace. On floors with pins it runs without deskew (contrast + despeckle only, strictly per-pixel), so pin coordinates cannot drift; the before/after badge shows which mode ran. Crop remains pin-free-only." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. HARD RELOAD, then: Replace on a PINNED floor now offers Clean up scan" -ForegroundColor Green
Write-Host "(badge reads 'contrast - despeckle - pin-safe'); pins must not move after accepting." -ForegroundColor Green
