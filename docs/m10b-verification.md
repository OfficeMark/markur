# M10b verification - visual confidence pass + building photos + tutorial

**Live URL:** https://waymarks-rebuild.netlify.app
**Migration applied:** `0014_m10b_building_photos`

This is a visual upgrade plus two real new features (building photos + /help tutorial). After Netlify ships, hard-refresh (Cmd/Ctrl+Shift+R) and walk through:

## 1. Dark-shell appearance

1. Sign in. The header is dark slate with a thin solid orange stripe under it.
2. The sidebar is now dark slate too (matching the header). Active building has a left orange stripe; the active floor is filled solid orange. Inactive items are white-ish on slate.
3. Body content area stays cream, so the dark shell frames the work.

## 2. Building photos (the big new feature)

1. Open 161 Bay St. The hero area is full-width slate (no photo yet) with an "Add photo" button top-right.
2. Click Add photo → pick a JPG/PNG from your laptop. It uploads, replaces the placeholder. Replace and Remove buttons appear.
3. Go back to Home. The 161 Bay St. card now has the photo at the top, building name below.
4. Try uploading a 12 MB image - rejected with a friendly error. Under 10 MB, PNG/JPG/WebP only.
5. Sign in as a non-admin user (if you have one): photo shows but no Add/Replace/Remove buttons.

## 3. Floor stat tiles

1. Open a floor with at least one pin. Above the floor plan there are now 4 tiles: Total / Good / Audit due / Flagged.
2. Numbers are in big sans-serif (no more Cormorant), labels are color-coded with semantic palette.
3. Click the Audit due tile - it filters the canvas to only audit-due pins, the tile turns active, click again to clear.

## 4. /help tutorial

1. Click the ? icon in the header (between the SyncChip and your avatar).
2. Lands on /help. TOC at the top with 6 sections.
3. Scroll through: Set up your building / Place pins / Walk an audit / Invite team / Use offline / Roles.
4. Each section has numbered steps in plain language. The "Stuck?" footer mailto links to your email.

## 5. First-time welcome card on Home

1. As an admin who hasn't fully set up the building (e.g. no photo, no plan, no pins), Home shows a "Set up <Building>" card under the page header.
2. Three steps: Add a building photo / Upload a floor plan / Place your first pin. Each has an arrow link to where it happens.
3. Steps complete with a green check as you do them. Once all three are done, the card disappears.

## 6. Typography + color discipline

- Cormorant Garamond is gone. Inter at semibold weight handles all headlines.
- No gradients anywhere. Solid colors only.
- No orange-with-opacity. Markur orange (`#ED7E2C`) is solid where used; hover state uses a dedicated deeper orange (`#C0651F`) so it never fades into peach.
- Cream-tinted surfaces use the dedicated `--waymarks-gold-soft` token (`#FBF0E4`), not orange-with-alpha.

## 7. Build / test

- `npx tsc -b` clean.
- `npx vite build` clean (1.41 MB total, ~360 KB gzip - up from M9 only because of the brand assets in the precache).
- `npx vitest run` - all existing tests pass.

## 8. What design-critique flagged + how we addressed it

Owner feedback after first pass:
- No gradients - all removed (BuildingPhotoUpload, BuildingCard, WelcomeCard).
- No orange opacity (causes peach blends on cream) - swept across the codebase. New `--waymarks-gold-deep` token covers hover states; cream-orange surfaces use the dedicated `--waymarks-gold-soft` token.
- Sans-serif for functional surfaces - Cormorant retired, all `font-serif` swapped to sans semibold.

## 9. Things explicitly deferred

- Building photo client-side compression (10 MB upload limit will eventually tank Lighthouse). M10c.
- The original M10 list (code-splitting, legal pages, cookie banner, step-up on revoke, long-press reposition, error boundary, a11y sweep). M10c.
- Image overlay on building photos for low-light sources.
