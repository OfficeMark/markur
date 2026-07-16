# Floor steppers move onto the map window (Randy's design, 2026-07-16).
#
# The phone control row physically cannot hold words - every layout attempt
# left text clipped or trapped at the button edge. Randy's call: words leave
# the row entirely.
#
# WHAT CHANGED (1 file): src/routes/Floor.tsx
#   1. Phone control row is ICONS ONLY: [<- back to building] left, buttons
#      right. Nothing to trap, at any label length, ever.
#   2. The map window gets a top-left overlay (phones): < > floor steppers,
#      with the floor name on a pill BELOW the arrows - same ink/85 style as
#      the recenter control at bottom-right. Ends render dimmed.
#   3. Desktop/tablet (sm+) unchanged: full breadcrumb trail with inline
#      steppers.
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

git add src/routes/Floor.tsx push-map-steppers.ps1
git commit -m "fix(floors): phone floor nav moves onto the map - steppers top-left, label pill below" -m "The phone control row cannot honestly hold text; it now carries icons only (back arrow + controls). The < > floor steppers live as a top-left overlay ON the plan window with the floor name on a pill beneath them, matching the recenter control's style. Desktop keeps the breadcrumb trail with inline steppers." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. On your PHONE, fresh load, open a floor (map view):" -ForegroundColor Green
Write-Host "  1. Toolbar: back arrow + buttons only - no text anywhere in the row" -ForegroundColor Green
Write-Host "  2. Map window top-left: < > arrows with the floor name below them" -ForegroundColor Green
Write-Host "  3. Arrows step the building's floors; back arrow returns to the building" -ForegroundColor Green
Write-Host ""
Write-Host "NOTE: the promotion script (push-promote-round3.ps1) expects 3 commits and" -ForegroundColor Yellow
Write-Host "will correctly REFUSE now that there are 4 - Claude will issue an updated one" -ForegroundColor Yellow
Write-Host "after your phone check passes." -ForegroundColor Yellow
