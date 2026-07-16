# Housekeeping: help (?) icon matches the header chips (2026-07-14).
#
# WHAT CHANGED (1 file): AppShell.tsx -- the How-to help button was a 36px
# square (h-9 rounded-md) next to 28px pills; it's now an h-7 rounded-full
# bordered circle matching EncryptedChip / SyncChip, icon scaled to fit.
#
# Gates run below; commit + push + DEPLOY only happen if all pass.

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }
if (Test-Path _to_delete) { Remove-Item _to_delete -Recurse -Force }

$dirty = git status --porcelain | Where-Object { $_ -notmatch '^\?\?' } | Where-Object { $_ -notmatch 'AppShell\.tsx' }
if ($dirty) { Write-Host "Unrelated uncommitted changes present - they would ride into this deploy:" -ForegroundColor Yellow; $dirty }

Write-Host "Gate 1/3: tsc -b ..." -ForegroundColor Cyan
npx tsc -b
if ($LASTEXITCODE -ne 0) { Write-Host "tsc FAILED - not committing" -ForegroundColor Red; exit 1 }

Write-Host "Gate 2/3: eslint ..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { Write-Host "eslint FAILED - not committing" -ForegroundColor Red; exit 1 }

Write-Host "Gate 3/3: vitest ..." -ForegroundColor Cyan
npm run test
if ($LASTEXITCODE -ne 0) { Write-Host "tests FAILED - not committing" -ForegroundColor Red; exit 1 }

git add src/components/waymarks/AppShell.tsx push-help-pill.ps1
git commit -m "style(shell): help icon matches chip height" -m "The How-to (?) button was a 36px square beside 28px pills; now an h-7 rounded-full bordered circle matching EncryptedChip/SyncChip." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. Glance at the header: the ? now sits flush with the pills." -ForegroundColor Green
Write-Host "Then run .\push-promote-round2.ps1 to promote all four commits to markur.ca." -ForegroundColor Green
