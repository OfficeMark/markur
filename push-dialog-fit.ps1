# Upload dialog fits the screen (multi-page PDF overflow fix).
#
# WHAT CHANGED (1 file):
#   src/components/waymarks/FloorPlanUploadDialog.tsx -- the dialog shell is
#   viewport-centered, so content taller than the screen ran off BOTH edges.
#   Multi-page PDFs trigger it: the page-count + mismatch warnings stack up
#   in the review step. The shell now caps at 85vh and scrolls inside
#   (max-h-[85vh] overflow-y-auto overscroll-contain). Crop drag is
#   unaffected: the crop image self-caps at 52vh and the crop frame uses
#   touch-none + pointer capture.
#
# Per Randy: replace speed is acceptable for now (rarely used) -- no perf
# changes in this round.
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

git add src/components/waymarks/FloorPlanUploadDialog.tsx push-dialog-fit.ps1
git commit -m "fix(plan-prep): upload dialog caps to the viewport and scrolls" -m "Multi-page PDFs stack page-count + mismatch warnings in the review step, pushing the viewport-centered dialog off both screen edges. Cap the shell at 85vh with inner scrolling; crop drag unaffected (image self-caps at 52vh, crop frame is touch-none with pointer capture)." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. HARD RELOAD once per device, then check:" -ForegroundColor Green
Write-Host "  1. Replace with a MULTI-PAGE PDF - whole dialog on screen, scrolls if tall" -ForegroundColor Green
Write-Host "  2. Crop on a pin-free floor still drags normally" -ForegroundColor Green
