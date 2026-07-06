# Path B — Rebuild on a Duplicate of Prod (2026-06-19)

**Prepared by:** Cowork (Claude), with Randy
**Decision:** Stop diagnosing why demo is slow. Duplicate prod (the known-good, fast build) and re-add the missing features **one at a time, testing each**, on the duplicate. **Never touch the original prod.**

---

## Brookfield one-day plan (for the return; ~2026-07-xx)

Shipped & verified on `rebuild`: floor view (S1+fixes), pin detail (S2/2b/2c/2d), Trash+deletion (S3), StepUp fix, start-audit-at-pin (S5). In flight when Randy left: S6 (add-dialog banded restyle) + S7 (printable grid — surface the existing `floor-catalogue.ts` PDF).

**One focused polish day, Brookfield-first priority:**
1. Finish S6/S7 if they didn't land.
2. **S8b (Share/collab port) + S9 (Demo link)** — the centerpiece; front-load it. Demo link = "use Markur on your building" → "sign up to keep it."
3. **S4** (type-aware action card) — fast.
4. **Polish pass** — cosmetic quirks, full smoke test on desktop/iPad/phone, and **rehearse the demo flow** (load a good building w/ pins+photos, run the share→signup path).

**De-risk:** Photos already work (rebuild = prod's photo code; prod serves photos fine) — S8 is just the HEIC/thumbnail *enhancement*, the riskiest slice, treat as gravy. **Demo on `markur-rebuild.netlify.app`, NOT prod** — do not rush a rebuild→main promotion before the meeting. Skip S10/S11 for the demo; S9b optional.

## Status — 2026-06-20 (end of day; Randy on holiday ~2 weeks, Brookfield meeting on return)

**Floorplan view: DONE** — rebuilt to the approved mock, responsive (progressive-disclosure toolbar), focus mode added, recenter fixed, primary buttons fire. Commits on `rebuild`: `e01d958` (S1) → `a56d5b5` (S1-fix responsive) → `9da7eb0` (S1-fix-2: no-overlap desktop + contain-fit recenter + focus mode). All verified clean (0 bundle hooks, per-table, `.env.rebuild` out).

**Slice 2 (pin-detail re-group)** handed to CC — in progress; verify against `docs/pin-detail-window-mock.html` when it reports.

**Decisions made today:** data belongs to the client (full-access demo link, no copy); the **demo/share link** (`docs/demo-share-flow-mock.html`, build spec = BUILD-QUEUE S9) replaces *both* old trial-enforcement (#11) and guest-share (#12), built on `access_grants.expires_at` + `pending_invitations`; **responsive progressive-disclosure** principle for all bars; pin terminology ("pin detail window," "add a pin"); vendor = add-any-vendor-with-a-link (no Officemark CTA). Pin-shape (#5) + suggest-a-feature (#9) kept but low priority.

**How to resume:** read this doc + `docs/BUILD-QUEUE.md` (the ordered, ready-to-paste CC prompts) + the per-slice smoke-test/sign-off gate. Hand CC one slice at a time; Cowork verifies each (per-table/no-bundle/scope) + Randy runs the 6-tap lag check before the next. Mocks for every redesigned surface live in `docs/`. Prod (`main`/markur.ca/`drclmnql…`) untouched throughout. Brookfield-priority order: S2 → S9 (polished pin detail + a working share link to put in front of them).

---

## Status — 2026-06-19 (end of day)

Foundation stood up clean and verified: branch `rebuild` off `main`, fresh Supabase `markur-rebuild` (`hlfkfkyglfzrbeuzyojm`, prod-schema clone, no bundle/demo cruft), fresh Netlify site `markur-rebuild`. Test login `demo@rancherdesign.ca` / `MarkurRebuild2026!`.

Shipped slices (all per-table, zero bundle hooks, prod untouched):
- #1 plan provenance label · #2 floor-wide team notes · #3a Zone/Department field
- #3b drawer regrouped into sections + Notes raised to 4000 chars · #3c banded sections + video demoted into Media (photo primary) · #3d high-contrast "dynamic" treatment on the read view · #3e same treatment on the edit form (high-contrast bands, orange accent #B0541A meets WCAG AA).
- Design reference: `docs/asset-drawer-dynamic-mock.html` (Randy-approved look).

Pick up here tomorrow:
1. Confirm CC committed #3e **and the untracked seed scripts** (`supabase/seed_rebuild.sql`, `seed_rebuild_plans.mjs`) + the rebuild docs. `.env.rebuild` must stay gitignored (secrets).
2. Run the **feature review** — decide keep/cut/reorder on the backlog. Claude's nominations to cut: pin-shape options (#5) and the "suggest a feature" box (#9). Defer trial enforcement (#11) to monetization time. Guest share (#12) only if client-sharing is core to the pitch. Likely keepers: type-aware action card (#4), per-building external order link (#6), printable grid (#7), start-audit-at-pin (#8), photos (#10).
3. Optional small slice: bring the add-a-sign dialog (`NewAssetDialog`) into the new banded look for add/edit consistency.

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

## Share vs Demo — two distinct things on one primitive (clarified 2026-06-21)

Real use case: Officemark surveys a building for a client (a national installer); the installer adds production info and shares down to *their* installers and to *their* end client, who reviews/edits. So there are three access contexts, all built on the **same primitive — invite a person to a building with a role + optional expiry** (`access_grants`):

1. **Internal use** — a property manager / org team managing their own buildings (core; normal multi-user roles within the org).
2. **Share (collaboration)** — invite an external party (your client) to **review/edit** a building's pins, with a role (Edit / View), **no expiry**, and it can **cascade** (each party re-shares to their own people). This is the installer-chain case. **Already exists on `standalone`** — the access-management + invitations system (`AccessManagementCard`, `NewInvitationDialog`, `PendingInvitationsCard`, `MembersCard`, `useAccess`, `AcceptInvitation`). So Share = a **port**, and it's the foundation Demo builds on. Port it FIRST.
3. **Demo (sales)** — a thin preset of Share for *prospects*: full access + **30-day expiry** + a **"sign up to keep your building" conversion** CTA. The link IS the trial; conversion = subscribing.

## Data ownership + demo/share link (decided 2026-06-20)

**Principle: the client owns their data** — even when Officemark entered the signage for them, it belongs to the client. If they want to view, edit, or change it, let them.

**Demo/share link model** (replaces the heavy "guest read-only share" plan #12 AND the old trial-enforcement #11): it's a **sales / demo-to-signup tool**. Officemark loads a prospect's building, sends a **link** granting a **30-day, full-access, building-scoped grant** on their **real** building — no sandboxed copy (it's their data). Built on existing infra: `access_grants` (with `expires_at`) + `pending_invitations`. Access lapses automatically at expiry. **The link IS the trial; conversion = subscribing.** So include a clear **"sign up to keep your building" conversion path** as the demo winds down (and available anytime) — that's the whole purpose: get them using the real thing, then convert. Framing/copy is "try Markur on your building," not "share with your tenants." Strong Brookfield play. Assumptions: lightweight account on claim (email + password, edits attributed, works across devices); grant role = full building-admin-level on that one building only; on conversion the time limit comes off and the building stays theirs.

## Naming / terminology (decided 2026-06-19)

- **Pin filtering = two dropdowns only: "Layer" and "Type"** (decided 2026-06-21). **"Layer"** (singular) is the user-facing name for the zone/area/department filter (dropdown of the building's zones/departments; data field stays `assets.zone`). **"Type"** is the asset-type filter. Chosen for lean/intuitive/fast — "Layer" is clearer than "Zone" and distinct from "Type." The **free-text search box is removed** (three ways to find pins was too much). Underlying fields unchanged; `FilterByZonePopover` component name can stay. **"Layer" replaces "Zone" in ALL user-facing copy** — the filter, the pin-detail "Where it is" field (was "Zone or department"), and empty-state text. The **DB column stays `assets.zone`** — this is label/copy only, never a column rename.

- The window shown when you tap an existing pin is the **"pin detail window"** — not "sign detail" or "asset detail." A pin is the neutral primitive; signage is only one kind of pin (facility/service pins exist too). The flow should guide the user the same way regardless of *why* the pin exists.
- The add flow is **"add a pin" / "new pin,"** not "add a sign."
- This is a **user-facing copy** convention: neutralize signage-specific wording in the UI. Internal code names (`AssetDrawer`, `NewAssetDialog`) and the `assets` DB table stay as-is for now — an optional clean rename is deferred churn, not required.

## Pin detail window — intended flow (decided 2026-06-20)

The pin detail window follows a narrative the same way the floorplan view does: **see it → what it is → where it is → is there a problem or a change.** Concretely:
1. **Photos & video** (see the item)
2. **What it is** — asset type, name, notes
3. **Where it is** — room # & name, zone/department, and the pin itself (number, lock/unlock, reposition, delete)
4. **A problem or a change?** — status & audit (flags), vendor, activity (history)
   - **Vendor behavior:** add any vendor (Officemark or any other supplier) with a **link**; following that link is the order/replace path. No hardcoded "Order from Officemark" CTA — Officemark is just one vendor you can add. Once a vendor is added, the section lists it with its clickable link. (Generalizes the old per-building "configurable order link" idea down to the vendor level.)

This splits the old "Identity" group into *what* vs *where*, folds pin-position controls into *where*, and gathers status/vendor/activity into the closing beat. Mock: `docs/pin-detail-window-mock.html`. Floorplan header mock (Visualize added to row 2, controls stacked + right-justified): `docs/floorplan-header-tightened-mock.html`.

## Mobile "screen too large" — root cause + fix (for the floorplan slice)

The floor toolbar's action buttons are content-width flex items, so the longest label renders wider than the rest — reading as "a button too large" on phones. Fixed on `standalone` (commits `2f96752`, then `4344eee`) by laying the controls out as a **uniform grid on phones** (equal width via `[&>*]:w-full`, equal height, smaller text so labels fit), reverting to the desktop right-aligned layout at `sm+`. That fix never came to `main`, so the rebuild regressed. The floorplan-view redesign slice must build the new toolbar responsively using this pattern (no horizontal overflow, no oversized buttons; Add pin + Audit stay prominent on mobile).

## Notes on existing capabilities

- **Multi-floor pin placement ALREADY EXISTS in prod** (`NewAssetDialog`, "item 4" / `FloorPicker`). When placing a *new* pin in a building with >1 floor, a "Floors" multi-select lets you drop an independent copy at the same x/y on each selected floor, skipping any floor that already has a pin there. It uses the **independent-copies** model (copies diverge; photos per floor; new floors don't auto-inherit). It's therefore already on the rebuild foundation. (Corrected 2026-06-19 — I had wrongly logged this as missing; Randy confirmed it's in prod.)
  - *Possible future enhancement, only if wanted:* a **linked** sign (edit once → all floors update, auto-apply to new floors), with per-floor audit/flag instances. Not requested yet; not needed for parity.

## After the rebuild is complete

When every feature we want is on the duplicate and proven fast, *then* we decide how it becomes the live product (promote to prod, or repoint markur.ca) — one deliberate, backed-up move, with Randy's explicit go-ahead. Until then: one environment we trust, small verifiable slices, never a standing parallel reality again.
