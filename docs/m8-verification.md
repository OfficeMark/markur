# M8 verification - mobile / iPad / responsive polish

**Live URL:** https://waymarks-rebuild.netlify.app

The big behavioural changes aren't on desktop — they show up when you shrink the window or open the site on iPad / phone. Test on real devices when you can; meanwhile, Chrome DevTools "iPhone 14 Pro" / "iPad Mini" device toolbar is fine.

## 1. Mobile / phone (≤767px)

1. Open the site at iPhone width. The header now shows a hamburger icon to the left of the Markur wordmark.
2. Tap the hamburger. A left-slide drawer appears showing buildings + floors. Tap any link — the drawer auto-closes and you're navigated.
3. Open a floor with pins. Tap a pin. The asset drawer slides up from the bottom (rounded-top, ~88vh tall) instead of from the right.
4. Pin markers should look noticeably larger (~36px) so they're tappable. The icon shape inside is the same.
5. Start an audit. The full-screen shell + bottom action sheet (Confirm OK / Flag / Skip / Next) should fit comfortably. Buttons are easy to hit one-handed.

## 2. iPad portrait (768–1023px)

1. The hamburger nav is still in play (because the sidebar shows only at lg+). Tap it - sheet appears as on phone.
2. The asset drawer is the right-side panel again (sm: kicks in at 640+). Plenty of room for the photo gallery + edit form.
3. Pin markers are still bumped (≥36px) for finger-tap.

## 3. iPad landscape / desktop (≥1024px)

1. Full sidebar is visible on the left. No hamburger.
2. Pin markers are back to the smaller h-7 (28px) since you're using a mouse.
3. The Trash chip + Audit floor button + Audit-due filter all sit in the floor header without wrapping.

## 4. Audit-due filter chip

1. On a floor with at least one pin past its `audit_cycle_days`, a "Audit due (N)" chip appears next to "Audit floor".
2. Tap it - it goes warning-yellow and the canvas now shows only the audit-due pins. Tap again - back to all.
3. The count auto-updates after you Confirm a pin in audit mode (because `useLatestConfirmedByFloor` invalidates).

## 5. Resume audit banner

1. Start an audit on B2, mark one pin Confirmed. Don't end the audit.
2. Navigate up to the Home page (the buildings list). A gold "Audit in progress on 161 Bay St. / B2 - Resume" banner shows above the building cards.
3. Click the building. Same banner shows on the Building page.
4. Click Resume - jumps to the floor; you have the existing "Resume audit" CTA in the floor header AND the banner on Floor (kept from M6).

## 6. Pinch-zoom on the floor plan (M3 reverify)

1. On phone or iPad, pinch-zoom on the canvas. The plan should zoom smoothly without scrolling the page.
2. Drag with one finger to pan when zoomed in.

## 7. Camera capture for photos (M4 reverify on real iOS)

1. Open a pin's drawer on iPhone Safari. Tap "Add photo".
2. iOS should offer Take Photo / Photo Library. Take a photo - it uploads.

## 8. Tap-target spot check

1. The hamburger button is 36x36 (h-9 w-9).
2. Every action button in the audit sheet is h-10 (40px) — comfortable one-handed.
3. Pin markers tappable at 36x36 on phone/tablet.

## 9. Build / test

- `npx tsc -b` clean.
- `npx vite build` clean (1.10 MB JS / 318 KB gzip - same footprint as M7; M8 is mostly responsive CSS, not net-new JS).
- `npx vitest run` - 89 / 89 passing across 16 test files (M7's 83 + 6 new for `useLayout`).

## 10. Things explicitly deferred

- **Long-press for "Reposition pin"** - the deliberate flow is already gated by AssetDrawer + the confirmation banner, so accidents are very unlikely. Long-press lands in M10 polish.
- **Playwright at 3 viewport sizes** - deferred with the rest of the e2e backlog.
- **Code-splitting / lazy routes** - bundle hit 318 KB gzip. M9/M10 will lazy-load AuditModeShell + AccessManagementCard.
