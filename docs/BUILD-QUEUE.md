# Markur Rebuild — Build Queue (ready-to-hand CC prompts)

**Created 2026-06-20.** Hand CC one slice at a time, in order. After each, get its STOP report (files, desktop+mobile screenshots, per-table grep = 0, build/test green, prod untouched), have Cowork verify, then hand the next. Everything below already exists in `standalone` unless marked **NEW**.

## Responsive principle (applies to every screen, not just the toolbar)

**Progressive disclosure, and the floor plan / content always wins.** Bars stay a fixed compact height at every size; primary actions are always prominent; secondary controls **move into a ⋯ overflow as the screen narrows** — they never wrap to extra rows or shrink to fit. Tiers: desktop = all visible; tablet = collapse search to an icon + least-used actions to ⋯; phone = icon-only view switcher, filters in one "Filter" sheet, search as icon, rest in ⋯. Never let a control bar bunch up or grow tall enough to steal content space. (Decided 2026-06-20; adapt breakpoints as we see them live.)

## Per-slice sign-off — DO NOT skip (this is how we avoid re-bogging)

After every slice, before handing CC the next one, Randy runs this on **desktop + phone**:
1. Cold load (incognito) — fast first paint?
2. Building → floor — snappy?
3. Tap a pin → pin detail window — opens instantly?
4. **Place a pin** — fast? *(old 10–15s killer)*
5. **Open a photo** — fast? *(old 45s killer)*
6. Switch Map / Grid / Notes — no freeze?

**If a slice feels slower than the previous one, STOP and fix that slice before continuing.** Cowork's structural check each slice: `git grep` bundle hooks = 0 + data path stayed per-table (guards the original root cause). Watch S8 (photos) hardest.

## Standing rules — paste at the top of EVERY slice

> 🚫 **ORIGINAL PROD OFF-LIMITS.** No changes to `main` / markur.ca / the prod Supabase `drclmnqlurvwqpnnpgzb` / the prod Netlify site `markur` (`ba310662…`). Work only on the `rebuild` branch + `markur-rebuild` Supabase (`hlfkfkyglfzrbeuzyojm`) + `markur-rebuild` Netlify site (`82c2ec99…`). If anything seems to need prod, STOP and ask.
>
> **Deploy = publish to the rebuild site.** Run `netlify deploy --build --prod` against the **`markur-rebuild`** site (`82c2ec99…`) — that's how the rebuild reaches `markur-rebuild.netlify.app` (the URL Randy tests on). `--prod` is **fine here** — it only publishes the rebuild's *own* site. The `--prod` ban applies **only** to the original prod `markur` site (`ba310662…` / markur.ca) — never deploy there.
>
> **Default approach:** PORT `standalone`'s existing implementation, **rewire its data to per-table** (never reintroduce `get_app_boot` / `get_building_view` / `get_floor_view` / any bundle hook), and **don't redesign.** Add at least one test. `npm run build` + `npm run test` green. Deploy `rebuild` to the `markur-rebuild` site (CLI, not `--prod`). Then **STOP and report:** files changed, desktop + mobile screenshots, `git grep` for bundle hooks = 0, build/test status, prod untouched.
>
> **Exception — approved redesigns (don't ship standalone's old look for these):** where an approved mock/spec exists — **S1 floorplan header** (`docs/floorplan-header-tightened-mock.html`), **S2 pin-detail flow** (`docs/pin-detail-window-mock.html`), the banded high-contrast styling, and **S9 demo-share** (`docs/demo-share-flow-mock.html`) — **build to the mock.** Reuse standalone's *functional logic/hooks* (so no actions, permissions, or edge cases are lost) but apply the new visual arrangement. Everywhere else, port standalone's UI as-is.

---

## S1 — Floorplan view redesign + mobile fix — ✅ SHIPPED 2026-06-20 (`e01d958` + fixes `a56d5b5`, `9da7eb0`)
**Approach = port-then-reskin (Option 3):** port standalone's Floor toolbar (all actions, permission gating, the `2f96752`/`4344eee` mobile-grid fix) rewired to per-table, **then** arrange it to the mock and build the new Zone filter. Don't ship standalone's old toolbar look, and don't rebuild the actions from scratch.
Build the floor top bar + toolbar to match `docs/floorplan-header-tightened-mock.html`. Build the **real Zone filter** (Zone popover mirroring the Type popover, filtering loaded pins by `zone`, per-table). Remove Catalogue/Record/Delete-floor from the toolbar: Record just goes (already homed in pin detail), Delete-floor sits in the **⋯ overflow** as a stopgap until S3. **Mobile:** uniform control grid on phones per commits `2f96752` + `4344eee` — no overflow/oversizing; Add pin + Audit stay prominent.

## S2 — Pin detail window re-group — ✅ SHIPPED 2026-06-20 (`9225ab1`)
Re-group `AssetDrawer` to `docs/pin-detail-window-mock.html`: **Photos & video → What it is (type, name, notes) → Where it is (room, zone, pin controls) → Status & audit → Vendor (no Officemark order CTA) → Activity.** Keep existing high-contrast banded styling. **Presentation/structure only** — no field/logic/gating changes.

## S3 — Consolidate deletion into the Trash page (revised 2026-06-21) — ✅ SHIPPED 2026-06-21 (`5129ab5`, deploy `6a3806e7`)
Make the existing Trash page (`src/routes/Trash.tsx`, `/buildings/:id/trash`) the single home for destructive actions + restore. **No Danger-zone section on the building page.**
- **Delete floor:** per-floor trash action on the Trash page → `useSoftDeleteFloor` (exists) + confirm.
- **Delete building:** type-to-confirm action → port `useSoftDeleteBuilding` + `softDeleteBuilding` from `standalone` (`hooks/useBuildings.ts` / `lib/queries/buildings.ts`) if not on rebuild.
- Keep existing deleted-items list + restore.
- **Remove Delete-floor from the floor toolbar ⋯ overflow** (S1 stopgap) once its Trash home is live.
Rationale: the building page's "Trash" is a recycle bin, not a delete action; destructive actions belong together in the Trash/settings area, main pages stay clean.

## S4 — Type-aware action card
Port the category branch in `standalone:src/components/waymarks/AssetDrawer.tsx` (~lines 489–584): facility pins (stairwells, service rooms) show **"Request service"**; signage shows the order framing. Lives in the pin detail's Status/Vendor area. Per-table.

## S5 — Start an audit at a chosen pin — ✅ SHIPPED 2026-06-21 (`fcea5d4`, deploy `6a38155c`)
Port from `standalone` (`AssetDrawer.tsx`, `AuditModeShell.tsx`, `hooks/useAudit.ts`, `routes/Floor.tsx`): let an audit begin at a selected pin instead of from the top. Per-table.

## S6 — Add-pin dialog restyle + pin terminology
(a) Restyle `NewAssetDialog` to the banded high-contrast look so add matches the pin detail window. (b) **Copy pass:** user-facing "sign/asset" → "pin" where generic ("Add a sign" → "Add a pin," "asset/sign detail" → "pin detail"). Internal code names + the `assets` table stay as-is. Presentation/copy only.

## S7 — Printable grid *(replaces catalogue; partly NEW)*
Add **print/export** to the existing `AssetGridView` (already in prod). Reuse `lib/floor-catalogue.ts` / `lib/audit-report.ts` for output. Output = a clean printable list/grid of every pin with key fields + photo thumbnails, grouped by zone if set. No separate catalogue view. Keep simple.

## S8 — Photos ⚠️ *(trickiest port — bundle entanglement)*
Port the **final** photo approach from `standalone` (commits `7b73708` + `04d9ef6`: on-device HEIC→JPEG ~3000px + sized thumbnails) and signed-URL serving (`e765e20`). **CRITICAL:** standalone batch-signed photos via `get_floor_view` (commit `a9cb56d`) — do **NOT** bring that. Sign photos **per-table** instead. Files: `hooks/useAssetPhotos.ts`, `AssetDrawer.tsx`, `AssetGridView.tsx`, `PinMarker.tsx`, `FloorPlanCanvas.tsx`, `BuildingPhotoUpload.tsx`. Verify upload + display are fast; test on mobile (photo is the primary audit action).

## S8b — Share / collaboration (access-management + invitations) *(port; foundation for S9)*
Port the existing sharing system from `standalone`: invite an external party to a building with a **role (Edit / View)**, accept-invitation flow, pending invitations, members list. Files: `AccessManagementCard.tsx`, `NewInvitationDialog.tsx`, `PendingInvitationsCard.tsx`, `MembersCard.tsx`, `hooks/useAccess.ts`, `hooks/useMembers.ts`, `routes/AcceptInvitation.tsx`. Rewire per-table, no bundle. This is the **Share** use case (collaboration down the chain — e.g. installer → their end client; can cascade). Ongoing, no expiry. **Build this BEFORE S9** — Demo is a preset on top of it.

## S9 — Demo link *(sales demo-to-signup preset of S8b's share; Brookfield centerpiece; replaces old #11 trial)*
**Framing:** this is a demo-to-signup motion — load a prospect's building, send a link, they try the real thing ~30 days, then convert. Copy = "try Markur on your building," not "share with tenants." Add a **"sign up to keep your building" conversion path** near expiry (and available anytime); on conversion the time limit lifts and the building stays theirs. The link IS the trial.
Build on the **existing invitation flow** — `standalone:src/routes/AcceptInvitation.tsx`, `NewInvitationDialog.tsx`, `pending_invitations`, and `access_grants.expires_at` (already in the schema). Match `docs/demo-share-flow-mock.html`.
- **Admin:** a "Share" action on a building → pick period (14 / 30 / **90**, default **30**) → generate a link → copy. List active links with time remaining.
- **Client:** opens link → welcome/claim screen (building name, "Full access · N days") → name + email + **password** → creates a lightweight account + a **building-scoped grant** with full building-admin-level role and `expires_at = now() + period`, on their **real** building (it's their data — full view/edit/audit, no copy).
- **Expiry:** access lapses automatically. **Verify `user_can` / the grant queries ignore expired grants** (`expires_at < now()`); add the filter if missing.
- Per-table. Do NOT use the old `building_shares` tables — this is invitations + an expiring grant.

## S2b — Remove free-text search + relabel "Zone" → "Layer" — ✅ SHIPPED 2026-06-21 (`d387df5`, deploy `6a37f8fb`)
Floorplan toolbar: **remove the free-text search box entirely** (incl. `SearchPopover` + the search field in `FloorFilterSheet`; delete dead code) — lean: the two dropdowns are the only pin filters. **Relabel "Zone" → "Layer"** (singular); `FilterByZonePopover` name can stay. UI/copy only, per-table. Result: filter area = **Layer** dropdown + **Type** dropdown, no search.

## S2c — "Zone or department" pin field → "Layer" — ✅ SHIPPED 2026-06-21 (`d147a65`, deploy `6a37fc19`)
Copy-only consistency follow-up to S2b: relabel the pin field "Zone or department" → **Layer** in the pin detail (`AssetDrawer`) + add-pin dialog (`NewAssetDialog`), with example-rich placeholders; update filter empty-state/"No zone" copy to "layer". `assets.zone` column unchanged (no migration).

## S2d — Add-pin type field relabel "Zone / asset type" → "Asset type" — ✅ SHIPPED 2026-06-21 (`2af3dba`, deploy `6a37fe65`)
Copy-only: the asset-type picker in `NewAssetDialog` carried legacy "Zone / asset type" wording + a "zone or department" placeholder; relabel to **Asset type** with a type-appropriate placeholder (Directory, Stairwell ID, Fire extinguisher). Distinct from the Layer field.

## StepUpDialog confirm fix — ✅ SHIPPED 2026-06-21 (`71bb805`, deploy `6a3812d5`)
Shared type-to-confirm dialog: matched case-sensitively but rendered the word ALL-CAPS, trapping users (esp. mobile auto-capitalize). Fix = case-insensitive + trimmed match, and `normal-case` so the word shows in its true case. Fixes floor/building/pin delete confirms together; tests updated.

## S9b — Edit form (`EditPanel`) re-group *(small follow-up to S2)*
S2 re-grouped the pin-detail **read** view to the What-it-is / Where-it-is flow but left the **edit form** (`EditPanel`) on its prior grouping. Optional: re-group the edit form to mirror the same flow so view and edit match. Presentation only, per-table.

## S10 — Pin-shape options *(low priority)*
Port pin shape choices (teardrop, logo-glyph) from `standalone:src/components/waymarks/PinMarker.tsx`. Per-table.

## S11 — Suggest-a-feature box *(low priority)*
Port from `standalone` (the `feature_suggestions` table — migration `20260604180538` — + the suggest dialog). Per-table.

---

### Gotchas recorded
- **Photos (S8):** re-sign per-table; the bundle did batch signing — leave it behind.
- **Demo link (S9):** confirm expired grants are excluded by `user_can`/grant reads.
- **Mobile (S1):** the "too large" fix is the uniform phone grid (`2f96752`/`4344eee`); build the new toolbar that way from the start.
- Every slice: per-table only, no bundle, port don't redesign, prod untouched.
