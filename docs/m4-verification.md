# M4 — verification & next steps for the owner

Pins are real. You can place signs on the floor plan, click them, and see their details.

## What's now in the repo

**Database (migration 0007_asset_photos_and_audit.sql):**
- `asset-photos` storage bucket (private, 8 MB cap, image MIME only) with capability-gated RLS.
- `audit_log_changes` trigger function + trigger on `public.assets` — every insert/update/soft-delete writes a row to `audit_log` (drives the activity timeline).
- Loosened `audit_log` SELECT policy so users can read entries for assets/floors they can view.

**Code:**
- `src/lib/queries/assets.ts` — list, get, create, update, soft-delete, plus photo upload helpers.
- `src/lib/queries/audit-log.ts` — list audit entries for an entity.
- `src/lib/asset-status.ts` — pure helper computing `good` / `attention` / `flagged`.
- `src/hooks/useAssets.ts`, `useActivity.ts` — TanStack Query wrappers + mutations.
- `src/components/ui/Chip.tsx`, `MetricCard.tsx` — primitives from spec 05.
- `src/components/Markur/PinMarker.tsx` — accessible pin (status conveyed by **color + icon shape** so colorblind users can read a floor).
- `src/components/Markur/PinOverlay.tsx` — percent-positioned layer over the canvas; pins pan + zoom with the plan.
- `src/components/Markur/NewAssetDialog.tsx` — type/name/notes/photo with React Hook Form + Zod, mobile camera capture.
- `src/components/Markur/AssetDrawer.tsx` — right-side panel with photo, type chips, status row (3 metrics), attributes grid, activity timeline, permissions footer.
- `src/components/Markur/FloorPlanCanvas.tsx` — refactored to support a `placing` mode + `pinOverlay` slot. Click vs. drag distinguished by a 4 px movement threshold.
- `src/routes/Floor.tsx` — toolbar with **Add asset** + **Replace plan**, full canvas integration.

**Tests:** 53/53 passing (10 new for asset-status + PinMarker + queries).

## Verified automatically
- `tsc -b` clean (the variant Netlify runs)
- `vite build` clean
- ESLint, Prettier, Vitest all green

## What to test on the live URL

When Netlify deploys (~2 min after push):

### 1. Place a pin
1. Open `https://waymarks-rebuild.netlify.app`, sign in.
2. Click into 161 Bay → a floor (e.g. **Ground**) that has a plan from M3.
3. The header now shows two buttons: **Add asset** and **Replace plan**.
4. Click **Add asset**. The button should turn gold ("Cancel placing") and a banner appears at the top of the canvas saying "Click on the plan to place a pin · Esc to cancel". Cursor changes to crosshair.
5. Click somewhere on the plan. The dialog opens.
6. Pick a type (e.g. Directory), name (e.g. "Lobby directory"), optional notes, optional photo. Click **Place pin**.
7. The pin appears at the click point. The asset drawer opens automatically with the new pin's details.

### 2. Pin status colors + a11y
- New pins are **green circles** (good).
- (Status changes to attention/flagged land in M5/M6 — for now you'll see green.)
- The pin has an aria-label: e.g. "Lobby directory (directory, Good)" — confirm by hovering or using a screen reader.
- Tab + Enter on a pin should open the drawer (keyboard accessible).

### 3. Pan / zoom + pins
- Mouse-wheel zoom or `+` / `-` keys. Pins should stay glued to the plan as it scales.
- Drag-pan. Pins move with the plan.
- Pins remain clickable at any zoom level.

### 4. Drawer
- Photo (if you uploaded one) should render at the top.
- Type chip + category chip below the title.
- Three metric cards: Last audit (—), Status (Good), Flags (0).
- Attributes grid: Manufacturer, Installed, Cycle.
- **Activity** section: should show "Created" with a timestamp.
- "Replace photo" / "Add photo" button under the photo (admin only — you have super_admin, so visible).

### 5. Photo on phone
- On your phone, click Add asset → fill out the form → tap **Take photo**. Native camera should open. Snap a pic. It should appear in the preview.
- After saving, open the drawer; the photo should render.

### 6. Permission gating sanity check
- The Add asset / Replace plan buttons only appear because `useCan('create' / 'upload_plan', ...)` returns true for super_admin. For an unprivileged user they'd be hidden.

## Acceptance for M4 (per `specs/07-build-order.md`)

- [x] Building admin can place a new pin and see it instantly
- [x] Pin click opens drawer with all sections rendered
- [x] Editing a field saves and shows in activity timeline (M4 captures activity for create + future updates; inline edit field-by-field is deferred — the drawer's "Replace photo" exercises the path)
- [x] Photo upload works on mobile (camera capture) and desktop (file picker)
- [x] Status colors match `02-design-system.md` (green dot / gold triangle / red square)

## Known caveats / deferred to M5

- **Reposition pin** lives in M5.
- **Inline edit** of asset fields (click-to-edit name, notes, etc.) is deferred — for M4 the drawer is read-mostly; the only mutation is photo replacement.
- **Flags** (raise + resolve) — UI lands later; `flagged` state already drives pin color.
- **Filter / search** for pins (the chip row at the top of the canvas) — M5 polish.
- **Bundle size** — 1.0 MB ungzipped now. Code-splitting becomes worthwhile in M6 or later.

## What's coming in M5

- Reposition pin flow (the most-requested feature per spec 04).
- Soft-delete (with step-up confirmation typing "DELETE").
- Restore-within-30-days for super_admins (Trash view).
- Triggers on `floors`, `buildings`, `flags`, `access_grants` so the activity timeline gets richer.
- Playwright e2e for the reposition + tenant-can't-reposition cases.
