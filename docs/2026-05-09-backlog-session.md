# 2026-05-09 — Backlog session (Claude Code)

Cleared 5 of 6 BACKLOG items plus a one-line UI fix. M22c (clustering) deferred for live testing of M22b first.

Branch: `main`. All commits pushed to `origin/main`. Both Supabase migrations applied to project `drclmnqlurvwqpnnpgzb` (Markur).

---

## What shipped

### Fix: `+ Add type` button no longer wraps mid-text
**Commit:** `918e2ae`
**Files:** `src/components/waymarks/AssetTypesCard.tsx`

Single-line fix: added `whitespace-nowrap` to the orange button on `/admin` → Asset types. Was rendering as two lines on narrower viewports.

---

### M24 — Grid view shows room, vendor, and "Untitled" fallback
**Commit:** `a01e664`
**Files:** `src/components/waymarks/AssetGridView.tsx`

Floor → Grid view now surfaces more asset detail under the name:
- Empty/whitespace names render `Untitled` in muted italic.
- Room number renders as `Rm <number>`.
- Vendor name pulled from `vendor_contact` JSON (prefers `company`, falls back to `name`).
- Secondary line joins `Room · Vendor · Location notes` with `·` separators; only the parts that exist are shown; line is hidden when none are set.

**Decisions:**
- Kept the existing table layout (vs. switching to cards as the BACKLOG suggested) — the table already supports sorting and is tablet-friendly. Cards would be a much bigger change.
- Folded room and vendor into the existing secondary line under the name (vs. adding two new columns) so the table stays compact. Easy to flip to columns later if you want sort-by-room or sort-by-vendor.

---

### M25 — Video attachments (MP4/MOV/WebM) with 100 MB cap
**Commits:** `e3bbebf`
**Files:** `src/lib/queries/asset-attachments.ts`, `src/components/waymarks/AssetAttachmentsPanel.tsx`, `supabase/migrations/0022_m25_attachment_video_support.sql`
**Migration applied:** `m25_attachment_video_support` on `drclmnqlurvwqpnnpgzb`

What changed:
- Allowed MIMEs extended to include `video/mp4`, `video/quicktime` (MOV), `video/webm`.
- Size cap raised from 25 MB → 100 MB (client validation, bucket `file_size_limit`, and table CHECK constraint all updated).
- File picker `accept` attribute now includes `.mp4,.mov,.webm`.
- Validation error copy updated.

**Decisions:**
- Skipped MKV (BACKLOG marked it "(probably)"). Browser MIME detection for `.mkv` is inconsistent (`video/x-matroska` vs. `application/octet-stream`); easy to add later if asked.
- Kept under 100 MB. Anything bigger would need resumable / TUS uploads — flagged in the BACKLOG as a separate project.

**Heads-up:** Browsers don't always set MIME reliably on `.mov` from iPhone. If a customer hits "unsupported type" on a phone-recorded video, fix is extension-based fallback validation (small change, defer until it actually bites).

---

### M26 — Per-org pin shape and size on `/admin/branding`
**Commit:** `766243d`
**Files:** `supabase/migrations/0023_m26_pin_appearance.sql`, `src/types/database.ts`, `src/lib/queries/branding.ts`, `src/hooks/useBranding.ts`, `src/components/waymarks/PinMarker.tsx`, `src/components/waymarks/PinOverlay.tsx`, `src/components/waymarks/admin/AdminBrandingPane.tsx`
**Migration applied:** `m26_pin_appearance` on `drclmnqlurvwqpnnpgzb`

What changed:
- New columns `pin_shape` (enum: circle/square/diamond) and `pin_size` (enum: small/medium/large) on `org_branding`, NOT NULL with defaults `'circle'` and `'medium'`. CHECK constraints clamp to the known enum sets.
- New "Pin appearance" section on `/admin/branding` with shape chips (with swatch preview), size chips, and a side-by-side preview rendering three real `PinMarker`s (good / audit due / flagged) at the chosen settings. Re-renders live as you tweak.
- `PinMarker` rebuilt: shape via `rounded-full` / `rounded-md` / rotated-rounded-square; size via inline width/height (18 / 22 / 30 px); inner status icon scales (7 / 9 / 13 px); for diamond, body rotates 45° and inner icon counter-rotates so status stays upright.
- Sizes coalesced from the old mobile/desktop split (22/21) into a single value per preset — the 1-px difference wasn't worth the inline-style complexity.

**Decisions:**
- **Drop-pin / classic teardrop deliberately not in the shape menu.** Its tip-anchor positioning differs from the centroid anchor used by circle/square/diamond, which would mean changes to the drag math, audit walkaround animation, and `before:`/`after:` halo placement. Easy follow-up if customers ask.
- The old `--pin-size-mobile` / `--pin-size-desktop` CSS variables in `globals.css` are now orphan but harmless; left in place to avoid scope creep.

---

### M22a — Free-text pin filter on Floor toolbar
**Commit:** `66e366b`
**Files:** `src/components/waymarks/FilterByTextInput.tsx` (new), `src/routes/Floor.tsx`

What changed:
- New `FilterByTextInput` component — controlled debounced input (150 ms default), with a clear-X button when populated.
- Sits next to the existing `FilterByTypePopover` on the Floor toolbar.
- Substring match (case-insensitive) against: `name`, `location_notes`, `room_number`, `notes`, `vendor_contact.name`, `vendor_contact.company`.
- ANDs with the type filter (both must match).
- "X of Y visible" indicator badge appears when any filter is active.
- Same filter pipeline drives both Map and Grid views — single source of truth in `Floor.tsx` via `visibleAssets`.

---

### M22b — Pins stay constant viewport size at zoom
**Commit:** `19ade30`
**Files:** `src/components/waymarks/FloorPlanCanvas.tsx`, `src/components/waymarks/PinMarker.tsx`

The complaint that prompted this was originally framed as "pins don't scale with zoom" — but the code has been wrapping the pin overlay inside the canvas's scaled transform for a while, so pins were already growing 1:1 with zoom. The actual problem (clarified mid-session): pins were growing **too much** at high zoom and obscuring architecture detail when an admin zooms in to see "4 assets on one section of wall".

What changed:
- `FloorPlanCanvas` now publishes its `zoom` state as a `--zoom` CSS custom property on the scaled wrapper.
- `PinMarker` reads it via `transform: scale(calc(stateScale / var(--zoom, 1)))`, counter-scaling the canvas zoom. Net effect: pin pixel size stays constant in the viewport regardless of zoom.
- Folded the centering translate, the diamond rotation, the M5 selection scale-up, the M5 reposition scale-up, and the new inverse-zoom scale all into a single inline transform on the button so they compose cleanly without Tailwind class conflicts.
- The CSS-var fallback `var(--zoom, 1)` means PinMarker behaves correctly outside the floor plan (e.g. the admin shape/size preview on `/admin/branding`) where there's no zoom context.

**Net behavior at high zoom:** wall section grows, pins stay the same size, separation between adjacent pins increases — exactly the disambiguation Randy wanted.

---

## What didn't ship

### M22c — Pin clustering (auto-offset + spiderfy)
Deferred pending live test of M22b. With pins now constant viewport size, the "4 pins on one wall" case is largely solved by zooming in. Clustering is real engineering (~3–5 hours, regression risk on drag / audit walkaround / reposition flows in `PinOverlay`). Worth waiting to see whether dense floors still feel cluttered at default zoom before committing.

If still needed: a smaller "auto-offset only" pass (no UI changes, just nudge near-overlapping pins apart visually) is the right first step before committing to spiderfy.

---

## Working tree state at end of session

`origin/main` matches `HEAD`. Uncommitted state unchanged from session start — left alone deliberately:

- `M  CLAUDE.md` (your pending edits)
- `M  src/routes/Login.tsx` (focus-ring opacity tweak from earlier work)
- `M  src/routes/ProtectedRoute.tsx` (spinner border opacity tweak from earlier work)
- Untracked: `.claude/`, `CLAUDE-CODE-CONTEXT.md`, 18 stale `push-mNN.ps1` scripts (M5–M13).

Per `CLAUDE-CODE-CONTEXT.md`, those Login/ProtectedRoute/CLAUDE.md changes are owner-managed — Claude Code shouldn't touch them.

---

## Verification — what to test on live

Once Netlify finishes rebuilding `19ade30`:

1. **Add type button** (`/admin` → Asset types): label is on one line.
2. **Grid view** (any floor → toggle to Grid): asset rows show room number, vendor name, and the secondary line is hidden when nothing is set. Empty-name assets show as muted italic "Untitled".
3. **Video upload** (open any pin's drawer → Attach): pick a small `.mp4` / `.mov` / `.webm`. Should upload up to 100 MB.
4. **Pin shape + size** (`/admin/branding` → Pin appearance): pick diamond + large, save. Visit a floor — pins are diamonds at large size. Switch back to circle + medium.
5. **Free-text filter** (any floor with several pins): type "Emergency" or any substring of an asset name / room / vendor. Pins fade / cards filter out. "X of Y visible" appears. Type filter still combines correctly.
6. **Pin scale at zoom** (Floor view, any plan loaded): scroll-zoom in (Ctrl + wheel) or `+` key. Pins stay roughly the same size as the wall details get bigger. At 300%+, pins should feel small relative to the architecture.

---

## Carry-forward (untouched this session)

From BACKLOG.md "Carry-forward debt to fold in eventually":
- M23 follow-up #2: optional `?reason=session-expired` + `?next=<path>` URL-param banner in `Login.tsx`.
- Test debt: `tests/unit/building-nav.test.tsx` — 3 failures from stale `useCreateBuilding` mock.
- Sandbox / staging Netlify branch deploy.
- Cloudflare R2 migration for audit photos.
- 2FA enrollment UI.
- Self-serve data export button.
- Two-tier feature flag plumbing (Markur vs. Markur Pro).
- `accept_invitation` security-definer RPC + role-hierarchy enforcement in RLS.
- `revoked_at` column on `pending_invitations`.
- PDF export header using org logo.
- Invitation email template using org logo.
- Deeper Markur+ViewMark integration.
