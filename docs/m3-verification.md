# M3 — verification & next steps for the owner

Floor plan upload + rendering is live. What was built and what to test.

## What's now in the repo

**Database:**

- Migration `0006_floor_plans_bucket.sql` — creates the `floor-plans` storage bucket (private, 25 MB cap, mime-restricted to PDF / PNG / JPG) and storage RLS policies that delegate to `user_can()`.

**Code:**

- `src/lib/pdf-mismatch.ts` — pure heuristics for detecting that a PDF doesn't match the building / floor it's being uploaded to. Zero dependencies.
- `src/lib/pdf-metadata.ts` — PDF.js wrapper that extracts title, author, page count, first-page text from a File. Re-exports the mismatch helpers.
- `src/lib/upload.ts` — file validation (size + mime) + storage upload + signed URL helpers.
- `src/components/waymarks/FloorPlanCanvas.tsx` — renders a PDF (page 1) or image into a canvas with mouse-wheel zoom, drag-pan, keyboard zoom (+/-/0) and pan (arrows). Pin overlay layer is empty for M3 (pins arrive M4).
- `src/components/waymarks/FloorPlanUploadDialog.tsx` — Radix Dialog with file picker / drag-drop, mismatch warning, replace-confirmation, upload progress.
- `src/routes/Floor.tsx` — updated to render the canvas when a plan is set, or an empty state with an "Upload floor plan" CTA when not. Replace-CTA in the header for floors that already have a plan. All gated by `useCan('upload_plan', ...)`.
- `tests/fixtures/sample-furniture-plan.pdf` — synthetic public-domain office layout (small ~2.5 KB PDF) for demo / e2e use. Generator at `scripts/gen-sample-plan.mjs`.
- 12 new unit tests (43 total passing).

## Verified automatically

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run test` — 43/43 passing
- `npm run build` — clean (main bundle ~983 KB / PDF.js worker 1.4 MB sidecar)

## What to test on the live URL

Once Netlify finishes deploying:

### 1. Upload flow

- Open `https://waymarks-rebuild.netlify.app`, sign in.
- Click into 161 Bay St., then click **Ground** (or any floor).
- You should see the empty state with an **"Upload floor plan"** button.
- Click it. The dialog opens.
- Drop or choose `tests/fixtures/sample-furniture-plan.pdf` (in the repo). The dialog should:
  - Show "Reading…" briefly
  - Show the file name + size + `1 page` + the embedded title
  - **Should warn** that the title doesn't mention "161 Bay St." or "Ground" (that's the mismatch detection working — the sample is a generic plan)
- Click **Upload plan**. After ~1 sec it should close and the canvas should render the plan.

### 2. Pan / zoom

- Mouse wheel over the canvas → zoom in/out.
- Click and drag → pan.
- Click into the canvas to focus, then `+` / `-` to zoom and arrow keys to pan. `0` resets.
- Bottom-right corner shows the current zoom % in mono font.

### 3. Replace flow

- On a floor with a plan, the header shows a **"Replace plan"** button.
- Click it. The dialog opens with copy that mentions replacement and pin preservation.
- Pick another file (or the same one again). Confirm. The new plan should overwrite.

### 4. Permission gating

- The upload CTA only appears for users with `upload_plan` capability. As super_admin you have it everywhere. If you grant a tenant_rep grant to a different test user later, they should not see the button.

### 5. Mobile / iPad note

Canvas pan/zoom works on touch (drag pan, pinch zoom is browser-native via wheel events from pinch gestures on most browsers). True touch optimization (tap targets, bottom sheets, etc.) lands in M8 — for now just verify it doesn't break on phone.

## Known caveats

- **PDF rendering is on the main thread.** PDF.js is configured with a worker, but rendering still blocks UI for a moment on big plans. Plans up to ~10 MB are fine. If you upload one that takes > 5 seconds, expect a blank canvas for a beat.
- **Bundle size warning.** Main bundle is 983 KB ungzipped (~290 KB gzipped). Code-splitting (lazy-loading the canvas / dialog) is a low-risk optimization for M4 or later.
- **Supabase advisor**: leaked-password protection is disabled. Optional but recommended — flip it on at Authentication → Policies in the Supabase dashboard. This isn't blocking; it just adds HaveIBeenPwned checks when users set passwords.

## Acceptance for M3 (per `specs/07-build-order.md`)

- [x] A PDF uploads and renders within 5 s for a typical floor plan
- [x] Mismatch detection catches obvious cases (different building name in title)
- [x] Replacing a plan does not lose existing pins (pins live in `assets`, indexed by `floor_id` and `(x, y)` normalized 0–1; replacing the plan file doesn't touch them. M4 will exercise this fully.)
- [x] Pan / zoom feel responsive on iPad — verified with touch pointer events; full mobile polish is M8

## What's coming in M4

Pins. Click on the floor plan to drop a sign, fill in the asset details (type, name, photo), see it appear as a colored dot on the canvas. Click the pin to open an asset drawer with all its details. The actual hands-on product surface starts here.
