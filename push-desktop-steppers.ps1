# Floor steppers on the map at EVERY width (2026-07-16).
#
# The phone-proven design goes universal: the < > floor-hop arrows live
# top-left ON the plan window at all sizes. One control, one place.
#
# WHAT CHANGED (1 file): src/routes/Floor.tsx
#   1. Map overlay arrows show at every width (was phone-only). The floor
#      name pill under them stays phone-only - desktop's breadcrumb already
#      names the floor.
#   2. The desktop breadcrumb returns to a plain text trail (Home > building
#      > floor) - its inline stepper cluster is gone, so there aren't two
#      competing sets of arrows. Unused helpers removed.
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

git add src/routes/Floor.tsx push-desktop-steppers.ps1
git commit -m "feat(floors): floor steppers on the map at every width; breadcrumb back to plain text" -m "The phone-proven map overlay goes universal: < > arrows top-left of the plan window at all sizes, floor-name pill phone-only. The breadcrumb's inline stepper cluster is removed so there's exactly one set of arrows, in one place." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. Check on DESKTOP: < > arrows top-left of the plan window step the" -ForegroundColor Green
Write-Host "building's floors; breadcrumb reads as plain text. Phone unchanged from your" -ForegroundColor Green
Write-Host "last check. Then tell Claude - the final promotion script (5 commits) follows." -ForegroundColor Green
