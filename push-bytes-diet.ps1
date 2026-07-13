# Plan Prep bytes diet: smaller, faster plates (Randy's JPG call + cap cut).
#
# WHAT CHANGED (7 files):
#   - rasterize.ts: plate cap 4096 -> 3000 (half the pixels: ~2x faster to
#     produce on a phone, much faster to download). New plate encoder tries
#     BOTH PNG and JPEG (quality 0.85) and keeps whichever is smaller --
#     line drawings stay PNG (crisper AND smaller), scans/photos drop to
#     JPEG at a fraction of the size. No detector; the bytes decide.
#   - enhance-scan.ts: cleaned scans use the same encoder (they're
#     photographic, so they usually come out JPEG and much smaller).
#   - upload.ts: plate extension follows the format (.plate.png/.plate.jpg);
#     contentType rides the blob; removeSiblingPlate drops the other-format
#     file AFTER the floors row points at the new one (never before).
#   - FloorPlanUploadDialog.tsx: calls the sibling cleanup post-save.
#   - types.ts: PLAN_PIPELINE_VERSION 1 -> 2 (metadata only; v1 plates keep
#     working, they're just bigger files).
#   - index.ts: exports the new encoder pieces.
#   - plan-rasterize.test.ts: cap-relative expectations + encoder pick tests
#     + plate-extension tests. Old tests hardcoded 4096-derived numbers.
#
# SAFETY NOTES:
#   - Pin coordinates are normalized; cap change alters pixels, not aspect,
#     so pinned floors are unaffected on replace.
#   - JPEG has no alpha, but every plate canvas is composited on white
#     before encoding (newCanvas), so transparency can't go black.
#   - No DB/schema work. RLS keys off the <uuid>. prefix -- .plate.jpg
#     matches the same as .plate.png.
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

git add src/lib/plan-prep/rasterize.ts src/lib/plan-prep/enhance-scan.ts src/lib/plan-prep/types.ts src/lib/plan-prep/index.ts src/lib/upload.ts src/components/waymarks/FloorPlanUploadDialog.tsx tests/unit/plan-rasterize.test.ts push-bytes-diet.ps1
git commit -m "feat(plan-prep): bytes diet - cap 3000, keep the smaller of PNG/JPEG" -m "Plates encode as both PNG and JPEG(0.85) and keep the smaller; extension and contentType follow the winner (.plate.png/.plate.jpg), and the other-format sibling is removed best-effort after the floors row points at the new path. Cap drops 4096 -> 3000: half the pixels, ~2x faster plate production on phones, much faster floor opens. Scan cleanup uses the same encoder. Pipeline version -> 2 (metadata only; v1 plates unaffected)." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. HARD RELOAD (Ctrl+Shift+R) once per device, then re-test the full gate:" -ForegroundColor Green
Write-Host "  1. Replace a plan - swaps in on its own, faster than before (esp. phone)" -ForegroundColor Green
Write-Host "  2. Torture sequence: Replace -> Cancel -> switch floors -> Replace -> file" -ForegroundColor Green
Write-Host "  3. Crop on a pin-free floor - result matches the box, no stretching" -ForegroundColor Green
Write-Host "  4. Clean up scan on a scanned/photo plan - before/after looks right" -ForegroundColor Green
