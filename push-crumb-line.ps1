# Phone floor navigation, Randy's design: Back + < floor > (2026-07-16).
#
# After the steppers landed, the phone toolbar still couldn't honestly fit
# the full trail: building truncated to one letter, label clipped, and crumb
# text was PAINTING UNDERNEATH the opaque buttons (no overflow clipping on
# the nav). Randy's call: on a phone, Back + next/previous is all the
# navigation you need - Home lives in the hamburger.
#
# WHAT CHANGED (1 file): src/routes/Floor.tsx
#   1. Phones (<sm): the toolbar's left side is now [<- back to building]
#      [< floor label >] - one row, big tappable targets, nothing crushed.
#   2. sm+ keeps the full trail (Home > building > < floor >), with the
#      < > steppers shared between both layouts (one implementation).
#   3. Dropped the redundant "Floor " literal before the label everywhere.
#   4. The breadcrumb nav is overflow-hidden - crumb text can never paint
#      underneath the buttons again, at any width (the "words are behind
#      the button, not shorter" bug).
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

git add src/routes/Floor.tsx push-crumb-line.ps1
git commit -m "fix(floors): phone nav = back + floor steppers; crumb text can never paint under buttons" -m "Randy's design: on phones the toolbar's left side is a back-to-building arrow plus the < floor > steppers - all the navigation needed, one row, nothing crushed (Home lives in the hamburger). sm+ keeps the full trail with the same shared stepper cluster. The breadcrumb nav is now overflow-hidden, so overwide crumb text clips inside its own box instead of painting underneath the opaque buttons. Redundant 'Floor ' label prefix removed." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. On your PHONE, fresh load, open a floor:" -ForegroundColor Green
Write-Host "  1. Left of the buttons: [<-] < 5th Floor > - all visible, nothing behind buttons" -ForegroundColor Green
Write-Host "  2. <- goes to the building; < > step through its floors in order" -ForegroundColor Green
Write-Host "  3. Desktop: full trail unchanged, steppers beside the floor name" -ForegroundColor Green
