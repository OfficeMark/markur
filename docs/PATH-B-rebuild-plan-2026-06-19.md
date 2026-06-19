# Path B — Rebuild on a Duplicate of Prod (2026-06-19)

**Prepared by:** Cowork (Claude), with Randy
**Decision:** Stop diagnosing why demo is slow. Duplicate prod (the known-good, fast build) and re-add the missing features **one at a time, testing each**, on the duplicate. **Never touch the original prod.**

---

## The one rule

🚫 **The original prod is sacred and untouched.** Prod = `main` branch + **markur.ca** (Netlify `markur`, site `ba310662…`) + Supabase **`drclmnqlurvwqpnnpgzb`**.

- No commits/merges/pushes to `main`. No markur.ca deploys or env changes. No `--prod`.
- The prod database is **read-only** at most (for a one-time snapshot to clone from). No writes, no migrations, no auth/storage changes — ever.
- All work happens on the **duplicate** (new branch + new Supabase + new Netlify site). If anything seems to need prod, STOP and ask.

We do not care *why* the old demo was slow. Prod doesn't have the problem; the duplicate starts as prod, so it won't either. We never bring over anything that isn't proven on the duplicate.

---

## What "the duplicate" is

Three new things, each a clean copy of prod, none of them the old demo:

1. **Frontend branch** off `main`: `rebuild` (off `main`, at prod's exact code). All feature work lands here. Never merged back to `main` without Randy's explicit per-merge OK at the very end.
2. **A fresh Supabase project** that is a clone of **prod's schema** — built from the repo's `supabase/migrations/` (which reflect prod), so it starts schema-identical to prod with **none** of the old demo's accumulated cruft. We do **not** reuse the old demo project (`dzhrugp…`); it's abandoned.
   - Data: seed with a small set of synthetic test buildings/floors/pins. (Optional: restore a one-time read-only snapshot of prod data into this private project if more realism is wanted — prod is only ever *read*, and the duplicate stays private. Tenant floor-plan PDFs are confidential; keep them out unless needed.)
3. **A fresh Netlify site** (e.g. `markur-rebuild`) pointing at the new Supabase, with its own URL. Not `markur` (prod), not `markur-standalone` (old demo).

This gives a foundation that is provably fast (it *is* prod) and clean.

---

## Hard architectural rule on the duplicate

- **Per-table data loading only** — exactly how prod/`main` already works. **Never** reintroduce the `get_app_boot` / `get_building_view` / `get_floor_view` bundle/boot system. (We proved stripping it didn't fix demo, so it adds complexity for no speed — it does not come across.)
- Each feature is added as the prod codebase would do it: a thin vertical slice (UI + only the DB it needs + a test), shipped to the duplicate, verified, then the next.

---

## Feature re-add order (smallest / most independent first)

Each is its own slice. Order is by size and independence, not by any theory about what's "risky." The bundle/boot rework and the old crash/mobile patches are **excluded** — we build clean and only add a fix if the duplicate actually needs it.

1. **Plan provenance label** — needs `floors.plan_provenance` column. Tiny, isolated.
2. **Floor-wide team notes** — needs `floors.floor_notes` column. Small, isolated.
3. **"Zone or Department" field + redesigned Add/Edit sign dialog** (banded layout, edit-in-place) — needs `assets.zone` column.
4. **Type-aware pin detail** (signage vs facility action cards) — frontend.
5. **Pin-shape options** (Markur teardrop, logo-glyph pin) — frontend.
6. **Building Settings menu** + configurable per-building external link (replaces hardcoded "Order Signs") — frontend + small config.
7. **Printable grid view** — add print/export to the existing `AssetGridView` (already in prod/rebuild). **Replaces the catalogue feature** (dropped per Randy 2026-06-19): a printable grid is the same shareable sign list with a fraction of the work, and it's an enhancement to existing prod code, not a port. Can reuse prod's `lib/floor-catalogue.ts` / `lib/audit-report.ts` for output. Guest catalogue is not rebuilt.
8. **Start an audit at a chosen pin** (not just from the top).
9. **"Suggest a feature" box** + refreshed Help content.
10. **Photos** — HEIC handling, ~3000px sharp images, small thumbnails, full-res on tap, private buckets. Ported as its own coherent slice.
11. **Trial enforcement** — 7-day trial banner + lockout + subscription gate — needs `org_is_locked` + `user_can` lock-deny.
12. **Guest / client share links** — read-only tokenized building links + claim screen — needs `building_shares` / `building_share_claims` tables + `peek`/`claim`/`revoke`/`cap` functions. Largest backend surface, so last.

(Each feature's code can largely be lifted from the `standalone` branch; only the data-loading is re-wired to the per-table pattern. The DB delta for each comes from the reconciliation list in `DEMO-PROD-feature-gap-2026-06-18.md`.)

---

## Per-feature test gate (every slice must pass before the next)

1. `npm run build` + `npm run test` green.
2. The feature works in the running app on the duplicate site.
3. **Speed sanity check** (Randy, on phone + desktop): cold load, building → floor navigation, **place a pin**, **open a photo** — all stay snappy. If this slice made anything slower than the previous slice, **STOP and fix it before adding the next feature.** That is the whole point — we catch a regression the moment it's introduced, on one isolated change.
4. Commit the slice on `rebuild`. Deploy to the `markur-rebuild` site. Never touch `main` / prod.

If a feature can't be added without a slowdown we can't resolve, that feature waits — the app stays fast and shippable without it.

---

## First step for CC — environment setup ONLY (no features yet)

Set up the duplicate and stop. This is its own verifiable milestone:

1. From clean `main`, create branch `rebuild`.
2. Create a fresh Supabase project (the duplicate backend); apply the repo's `supabase/migrations/` so its schema matches prod; seed synthetic test data.
3. Create a fresh Netlify site `markur-rebuild`; point its env vars at the new Supabase; deploy `rebuild`.
4. Verify: app loads, you can sign in, see seeded buildings/floors, place a pin, and it's fast. Confirm the build points at the new project (not prod `drclmnql…`, not old demo `dzhrugp…`).
5. **STOP and report:** the new Supabase project ref, the site URL, build/test status, and confirmation prod was never touched. Then wait.

Only after the foundation is confirmed fast and clean do we start feature #1.

---

## Open items (parking lot — recorded so they're not forgotten)

- **`handle_new_user` mints an unhonored grant.** The signup trigger (migration `20260603141055_phase2_signup_provisioning`) auto-creates a `building_admin / scope_type='organization'` grant for every new user, but the current permission model (`user_can` / phase2c) does **not** honor `organization`-scope — so a fresh signup gets zero usable capabilities until granted another way. This is pre-existing behavior on **prod (`main`)**, so it is OFF-LIMITS to change now and must not be touched on prod. Revisit deliberately later (likely: align the signup grant with a scope the model honors, or add an org-scope branch to `user_can`). For the rebuild test admin we work around it with a `super_admin / global` seed grant. Surfaced 2026-06-19 while cleaning the rebuild seed.

## Notes on existing capabilities

- **Multi-floor pin placement ALREADY EXISTS in prod** (`NewAssetDialog`, "item 4" / `FloorPicker`). When placing a *new* pin in a building with >1 floor, a "Floors" multi-select lets you drop an independent copy at the same x/y on each selected floor, skipping any floor that already has a pin there. It uses the **independent-copies** model (copies diverge; photos per floor; new floors don't auto-inherit). It's therefore already on the rebuild foundation. (Corrected 2026-06-19 — I had wrongly logged this as missing; Randy confirmed it's in prod.)
  - *Possible future enhancement, only if wanted:* a **linked** sign (edit once → all floors update, auto-apply to new floors), with per-floor audit/flag instances. Not requested yet; not needed for parity.

## After the rebuild is complete

When every feature we want is on the duplicate and proven fast, *then* we decide how it becomes the live product (promote to prod, or repoint markur.ca) — one deliberate, backed-up move, with Randy's explicit go-ahead. Until then: one environment we trust, small verifiable slices, never a standing parallel reality again.
