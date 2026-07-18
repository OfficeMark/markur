# Plan-replace fix: replaced plans now appear immediately (no hard reload).
#
# ROOT CAUSE (found 2026-07-13):
#   Plan Prep v2 always writes the display plate to the floor's canonical
#   storage slot (<floorId>.plate.png). So REPLACING a plan rewrites
#   floors.plan_url with the SAME string it already held. Floor.tsx resolved
#   its signed URL in an effect keyed on [floor?.plan_url] -- unchanged key,
#   so the effect never re-ran, the old signed URL kept feeding the canvas,
#   and the old image stayed on screen. Only a hard reload (fresh mount ->
#   fresh signed URL) showed the new plan. The query invalidation added
#   earlier was already correct -- it just refetched a row whose plan_url
#   looked identical, so nothing downstream moved.
#
# FIX (3 files):
#   - src/lib/upload.ts: new planRefreshStamp(plan_metadata) helper --
#     returns planPrep.processedAt, which is rewritten on EVERY upload
#     (both the plate path and the processing-fallback path stamp it).
#   - src/routes/Floor.tsx: the signed-URL effect now keys on
#     [floor?.plan_url, planStamp]. A replace changes the stamp -> effect
#     re-runs -> fresh signed URL (unique per issue, so it also bypasses
#     the browser + service-worker caches) -> canvas redraws with the new
#     plan. Dev-only console marker '[plan] resolving signed URL' shows
#     the re-resolve firing.
#   - tests/unit/upload.test.ts: planRefreshStamp contract pinned
#     (v2 stamp, fallback stamp, same-path/new-stamp difference,
#     pre-v2/absent/malformed -> null).
#
# Gates run below; commit + push only happen if all pass.

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

git add src/lib/upload.ts src/routes/Floor.tsx tests/unit/upload.test.ts push-plan-replace.ps1
git commit -m "fix(plan-prep): replaced plans render immediately" -m "Key the Floor signed-URL resolve on planPrep.processedAt as well as plan_url. The canonical plate slot (<floorId>.plate.png) means plan_url is byte-identical across replaces, so the old effect never re-ran and the old image stayed until a hard reload. The stamp changes on every upload (plate + fallback), and each signed URL is unique per issue, so the swap also bypasses browser/SW caches." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Pushed. Netlify is building markur-rebuild now." -ForegroundColor Green
Write-Host "Wait for the deploy to go green, then HARD RELOAD (Ctrl+Shift+R) before testing." -ForegroundColor Green
