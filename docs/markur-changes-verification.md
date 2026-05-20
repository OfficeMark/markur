# markur-changes verification

Six owner-requested additions (`markur-changes.txt`) plus a cleanup of pre-existing
repo debt. Shipped in commits `3ebecd8` (features) and `7147eb1` (lint + test fixes),
auto-deployed to https://markur.netlify.app.

## What shipped

### 1. SVG floor plans
`image/svg+xml` added to `PLAN_MIME_TYPES` (`src/lib/upload.ts`) so SVG is accepted
alongside PDF/PNG/JPG. `objectNameForFloor` / `extFromMime` map it to a `.svg` object
name; `planKindForPath` routes `.svg` through the existing `'image'` path. The upload
dialog copy and hint now say "SVG". `FloorPlanCanvas` renders SVG through the same
`<img>`→canvas path as raster images, with a `naturalWidth || 1600` / `|| 1200`
fallback so a viewBox-only SVG (0×0 intrinsic size in some browsers) never produces a
0×0 canvas.

### 2. Max zoom 600% → 1000%
New `src/lib/zoom.ts` exports `ZOOM_MIN = 0.3`, `ZOOM_MAX = 10`, and `clampZoom()`.
`FloorPlanCanvas` wheel, pinch, and keyboard `+`/`-` handlers all clamp through
`clampZoom` instead of the old inline `clamp(z, 0.3, 6)` — raising the cap from 6
(600%) to 10 (1000%). Note: `specs/06-features.md` still says "10–400%" — that spec
line is stale; the code was at 600% and is now 1000%.

### 3. Asset photo download
`signedAssetPhotoDownloadUrl()` (`src/lib/queries/asset-photos.ts`) issues a Supabase
signed URL with `{ download: filename }`, which sets `Content-Disposition: attachment`
so a plain anchor click saves the file — this works cross-origin, where the bare
`download` attribute is ignored. `assetPhotoDownloadName()` builds a friendly,
filesystem-safe filename. `AssetDrawer`'s `PhotoFrame` gets a "Save" button (visible to
anyone who can view the asset, not just editors).

### 4. Floor PDF catalogue
New `src/lib/floor-catalogue.ts` (adds the `jspdf` dependency): `prepareCatalogueEntries`
orders a floor's assets (pinned first by pin number, then unpinned by name);
`buildCatalogueDoc` renders a clean A4 PDF — one card per asset with photo, a prominent
pin-ID chip, name, type, condition, and the building/floor reference. `Floor.tsx` has a
"Catalogue" toolbar button that loads each asset's primary photo, re-encodes it to a
compact JPEG, builds the doc, and downloads it. Photo failures degrade to a "No photo"
box rather than aborting.

### 5. Pin ID numbers
Migration `supabase/migrations/0026_pin_numbers.sql` adds a per-floor sequential
`pin_number` to `assets`: a `before insert` trigger assigns the next number under a
floor-scoped advisory lock (monotonic, never reused — a stable client-facing
reference), backed by a `unique (floor_id, pin_number)` index. Existing rows were
backfilled by creation order. `formatPinNumber` zero-pads to 3 digits for display.
The ID shows on map pins (`PinOverlay`), in the asset drawer (`AssetDrawer`), and in
the grid (`AssetGridView`). The migration was applied to the live Markur project
(`drclmnqlurvwqpnnpgzb`) with explicit owner authorization; `src/types/database.ts`
regenerated.

### 6. Search by pin ID
`pinNumberMatchesQuery()` (`src/lib/pin-types.ts`) accepts a query with or without a
leading `#` and with or without leading zeros (`3`, `003`, `#3`, `#003`), and matches
partials. Wired into `matchesAssetText` in `Floor.tsx` so the existing floor search box
finds an asset by its pin ID.

### Cleanup (commit `7147eb1`)
Pre-existing repo debt, unrelated to the six features, fixed so `npm run check` is
green for the first time:
- 9 eslint errors: `prefer-const` in `useOnline`; an unused `eslint-disable` in
  `ErrorBoundary`; 7× `jsx-a11y/no-autofocus` (justified `eslint-disable` — these
  autofocus the first field of focus-trapped dialogs / inline editors, exactly where
  the rule is over-cautious); 1× `label-has-associated-control` (justified disable —
  the label wraps its radio and visible text, just deeper than the rule's static
  search depth).
- 3 warnings: moved `inviteUrlFor` from `AccessManagementCard` to `lib/utils`
  (resolves `react-refresh/only-export-components`); `AuditModeShell.handleDiscardAudit`
  is now a `useCallback` above the Esc effect that depends on it (resolves
  `react-hooks/exhaustive-deps`).
- `tests/unit/building-nav.test.tsx` was stale (pre-dates this work — the m23 doc
  flagged it too). `BuildingNav`'s tree grew to render `NewBuildingDialog`, which now
  needs `useCreateBuilding`, the permissions context, the org picker, and a
  `QueryClient`. Added the missing mocks plus a `QueryClientProvider` wrapper.

## Verification performed

All checks below were run against commit `7147eb1` and the live deploy built from it.

### Build + tests
- `npm run check` (typecheck + lint + test) — **green**. 22 test files, **126 tests**
  passing, including dedicated suites: `zoom.test.ts` (3), `upload.test.ts` (13, SVG
  cases added), `asset-photo-download.test.ts` (4), `floor-catalogue.test.ts` (6),
  `pin-number.test.ts` (8, covers `formatPinNumber` + `pinNumberMatchesQuery`).
- `npm run build` (`tsc -b && vite build`) — **green**.

### Live deploy
- Netlify deploy `6a0605112a01cd00089bad48`: `commit_ref` = `7147eb1`, `branch` =
  `main`, `manual_deploy` = `false` (webhook auto-deploy), `state` = `ready`. Secret
  scan clean. The git auto-deploy was reconnected and confirmed working end-to-end.

### Live bundle — every feature's code is present
Downloaded all 41 JS chunks from the live Workbox precache manifest and grepped each
feature's distinctive compiled marker:
- **SVG**: `image/svg+xml`, the `PNG · JPG · SVG` upload hint, `Use PDF, PNG, JPG, or SVG.`
- **Zoom**: `clampZoom` compiled to `Math.min(OS, Math.max(DS, r))` where `OS = 10` and
  `DS = .3` — i.e. the live clamp is 1000% max / 30% min.
- **Photo download**: `Download this photo` (the button aria-label).
- **Catalogue**: `SIGNAGE CATALOGUE` (PDF header), the `Catalogue` button.
- **Pin IDs**: `this asset's reference number on the floor` (drawer), `padStart(3,"0")`
  (`formatPinNumber`).
- **Search**: `/^#/` (the pin-ID query normalizer).

### Pin-ID database layer — verified against live Supabase
`pin_number` column present · `assign_pin_number` insert trigger present · trigger
function present · `assets_floor_pin_number_idx` unique index present · **0 of 9
assets missing a number** (backfill complete and intact).

### Prototype bugs confirmed absent
The two bugs found in the old WayMarks single-file prototype do not exist here, and
are structurally precluded:
- The prototype's `openAssetModal` crashed on stale `getElementById` refs. This
  codebase has exactly one `getElementById` — the guarded `#root` mount in `main.tsx`
  — and zero `querySelector` calls; the asset dialog/drawer are pure state-driven
  React.
- The prototype's duplicate `saveAsset` declaration caused infinite recursion. Here
  the save path is declared once each (`createAsset`/`updateAsset` in
  `lib/queries/assets.ts`, `useCreateAsset`/`useUpdateAsset` in `hooks/useAssets.ts`);
  no `saveAsset`, no `_orig*` wrapper.
- Both bug classes are TypeScript-strict compile errors (duplicate declaration;
  possibly-null DOM ref), so a passing `tsc` rules them out.

## What was NOT verified

No interactive click-through of the running app — there is no browser in this
environment and the app is behind Supabase auth. The statements above establish that
every feature's code is compiled, deployed, and serving; the database migration is
applied and intact; and every feature's logic is unit-tested. The final visual pass —
upload an SVG plan, zoom past 600%, use a photo's Save button, export a catalogue PDF,
see `#001` on a pin, search `003` — needs a human signed into markur.netlify.app.

## Files touched

Features (`3ebecd8`):
- `src/lib/upload.ts`, `src/lib/zoom.ts` (new), `src/lib/pin-types.ts`,
  `src/lib/floor-catalogue.ts` (new), `src/lib/queries/asset-photos.ts`
- `src/components/waymarks/FloorPlanCanvas.tsx`, `FloorPlanUploadDialog.tsx`,
  `AssetDrawer.tsx`, `AssetGridView.tsx`, `PinOverlay.tsx`
- `src/routes/Floor.tsx`, `src/types/database.ts`
- `supabase/migrations/0026_pin_numbers.sql` (new)
- `tests/unit/zoom.test.ts`, `asset-photo-download.test.ts`, `floor-catalogue.test.ts`,
  `pin-number.test.ts` (new); `tests/unit/upload.test.ts`
- `package.json`, `package-lock.json` (jspdf)

Cleanup (`7147eb1`):
- `src/hooks/useOnline.ts`, `src/lib/utils.ts`
- `src/components/waymarks/ErrorBoundary.tsx`, `StepUpDialog.tsx`, `AssetTypesCard.tsx`,
  `NewAssetDialog.tsx`, `NewBuildingDialog.tsx`, `NewFloorDialog.tsx`,
  `NewInvitationDialog.tsx`, `AccessManagementCard.tsx`, `PendingInvitationsCard.tsx`,
  `AuditModeShell.tsx`
- `tests/unit/building-nav.test.tsx`

Verification (this commit):
- `docs/markur-changes-verification.md` (new; this doc)
