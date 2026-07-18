# Mobile header: menu visible, no sideways wobble (rebuild round, 2026-07-16).
#
# DIAGNOSIS: a mobile hamburger menu has existed all along (BuildingNavSheet,
# shown below 1024px) -- but at phone width the header content (~510px of
# hamburger + wordmark + ENCRYPTED + Synced + help + user pill) exceeded the
# ~390px screen. Flexbox crushed the shrinkable hamburger toward zero width
# ("mobile has no menu of any kind") and the leftover overflow gave the page
# a horizontal pan ("wobbles around when you scroll up or down").
#
# WHAT CHANGED (2 files):
#   1. AppShell.tsx
#      - overflow-x-clip on the shell root: no child can ever hand the page a
#        horizontal pan again (clip, not hidden -- sticky header unaffected)
#      - wordmark h-7 on phones (h-9 from sm: up)
#      - ENCRYPTED chip hidden below lg (decorative there; security page
#        stays reachable via Admin on desktop). Synced chip stays -- field
#        crews need sync status.
#   2. BuildingNav.tsx -- shrink-0 on the hamburger trigger: it must never be
#      the flex item that gives way.
#   3. (folded in) Help "?" glyph: lucide's HelpCircle is itself a circled
#      question mark, so inside the bordered circle button it doubled the
#      ring and shrank the ? to a speck. Now a plain bold text "?" sized to
#      fill the button.
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

git add src/components/waymarks/AppShell.tsx src/components/waymarks/BuildingNav.tsx push-mobile-header.ps1
git commit -m "fix(shell): phone header fits; help ? glyph fills its circle" -m "At phone width the header's ~510px of content exceeded the screen: flexbox crushed the hamburger to zero (menu 'missing') and the overflow gave the page a sideways pan while scrolling. Hamburger is now shrink-0, wordmark h-7 on phones, ENCRYPTED chip hidden below lg, and the shell root is overflow-x-clip (clip, not hidden - sticky header unaffected). Also: the help button now renders a plain bold ? instead of lucide HelpCircle, whose own circle doubled the ring and shrank the glyph." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host "commit FAILED" -ForegroundColor Red; exit 1 }

git push origin rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "push FAILED" -ForegroundColor Red; exit 1 }

Write-Host "Deploying to markur-rebuild.netlify.app ..." -ForegroundColor Cyan
npm run deploy:rebuild
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED - code is pushed but the dev site was NOT updated" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Deployed. On your PHONE: hard reload markur-rebuild.netlify.app, then check:" -ForegroundColor Green
Write-Host "  1. Top-left hamburger (three lines) is visible - tap it: buildings/floors slide-over" -ForegroundColor Green
Write-Host "  2. Tapping a floor in the menu navigates and closes the sheet" -ForegroundColor Green
Write-Host "  3. Scroll up/down anywhere - the page no longer drifts sideways" -ForegroundColor Green
Write-Host "  4. Desktop too: the ? in the help circle is now a real, readable question mark" -ForegroundColor Green
