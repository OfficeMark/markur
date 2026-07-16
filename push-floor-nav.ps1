# Floor toolbar on phones + prev/next floor stepping (rebuild, 2026-07-16).
#
# WHAT CHANGED (1 file): src/routes/Floor.tsx
#   1. FIX (phone): the toolbar's breadcrumb ("Home > building > floor") was
#      being crushed to nothing by the un-shrinkable button cluster at 390px.
#      Now: "Home >" hides below sm (the hamburger covers Home), the floor
#      label never shrinks away (building name truncates first), and the
#      Focus button is desktop/tablet-only (on phones the map already fills
#      the screen) - per the toolbar law, phones collapse secondary controls.
#   2. FEATURE: prev/next floor steppers flank the floor label in the
#      breadcrumb (in sidebar order for the same building), so you can walk
#      Ground -> 2 -> 3 without leaving the plan. Ends render dimmed.
#      Works at every width; steppers carry aria-labels + tooltips.
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

git add src/routes/Floor.tsx push-floor-nav.ps1
git commit -m "feat(floors): prev/next floor steppers; fix phone toolbar breadcrumb crush" -m "Steppers flank the floor label (building's floors in sidebar order) so walkthroughs move floor to floor without exiting the plan. Phone toolbar: Home crumb hides below sm, the floor label is uncrushable (building truncates first), Focus becomes desktop/tablet-only - the breadcrumb was being squeezed to nothing behind the button cluster at 390px." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. On your PHONE, hard reload, open a floor, then check:" -ForegroundColor Green
Write-Host "  1. Building name + '< Floor X >' visible in the toolbar - nothing crushed" -ForegroundColor Green
Write-Host "  2. Tap the < > chevrons: steps through the building's floors in order" -ForegroundColor Green
Write-Host "  3. Desktop: Home crumb + Focus button still present from sm-width up" -ForegroundColor Green
