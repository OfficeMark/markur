# Floor-open speed: stop re-downloading the plate on every visit (2026-07-14).
#
# WHAT THE LIVE PROFILE SHOWED (Chrome trace on markur-rebuild, Mezzanine):
#   - Floor open ships ZERO plan-prep/pdfjs code (bundling law holds).
#   - The visible plan waits on a 3-step relay AFTER route load:
#     floor row fetch -> signed-URL mint -> plate download.
#   - Every open minted a FRESH signed URL (unique token), so the browser/SW
#     cache never hit -- the full plate re-downloaded on EVERY visit, even
#     immediately repeated ones. That is the residual lag.
#
# WHAT CHANGED (2 files):
#   1. Floor.tsx -- the plan signed URL is now a CACHED TanStack query
#      (staleTime 25 min; signed URLs live 30). Reopening a floor reuses the
#      same URL, so the service worker serves the plate instantly. The query
#      key keeps planRefreshStamp, preserving the replace fix (new stamp ->
#      new URL -> fresh download).
#   2. useFloors.ts -- useFloor seeds placeholderData from the sidebar's
#      already-loaded by-building lists, so the plan fetch chain starts
#      immediately on tap instead of waiting a full detail round trip.
#      The real detail fetch still runs and reconciles.
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

git add src/routes/Floor.tsx src/hooks/useFloors.ts push-floor-open-speed.ps1
git commit -m "perf(floors): cache the plan signed URL + seed floor detail from list cache" -m "Profile showed every floor open minting a fresh signed URL, so the plate re-downloaded on every visit. Signed URL is now a cached query (25-min staleTime, key includes planRefreshStamp so the replace fix holds); useFloor seeds placeholderData from the sidebar's by-building lists so the plan chain starts on tap." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. HARD RELOAD once, then the feel test:" -ForegroundColor Green
Write-Host "  1. Open a floor (first open: modestly faster)" -ForegroundColor Green
Write-Host "  2. Leave and reopen the SAME floor - should be near-instant now" -ForegroundColor Green
Write-Host "  3. Replace a plan - new plan must still swap in without a reload" -ForegroundColor Green
