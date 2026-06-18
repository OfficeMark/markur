# Demo → Prod Feature Gap (consolidation inventory)

**Date:** 2026-06-18
**Prepared by:** Cowork (Claude), with Randy
**Purpose:** the list of everything that lives on **demo** (`standalone` branch + demo Supabase) but is **not yet in prod** (`main` branch + prod Supabase `drclmnqlurvwqpnnpgzb`). This is the scope of the consolidation.
**Companion docs:** `INCIDENT-2026-06-17-prod-lockout-postmortem.md` (how we got here) and the demo→prod database reconciliation manifest (the backend half).

---

## Headline

**109 commits** are on `standalone` (demo) and not in `main` (prod) — roughly a couple of months of work. That backlog *is* the "everything piled up at once" problem. Consolidation brings it across in one deliberate, backed-up move; the prevention afterward is shipping small and often so a gap this size never rebuilds.

Important framing: **prod (`main`) today is the older, fast-but-fewer-features build.** Consolidation gives markur.ca the new features **and** the speed at the same time.

---

## New features a client or admin would see

- **Guest / client share links** — tokenized read-only building links with a pre-login claim screen (building photo, pins keep their org colours) so a client can view their own signage. *(Needs the guest-share DB tables + functions — see backend section.)*
- **On-screen catalogue view** (admin + guest) — browse the sign catalogue in-app, not just as a PDF; the PDF also now opens correctly in a tab on iPhone/Safari instead of dead-ending.
- **Building Settings menu** — per-building controls consolidated in one place, including a configurable external link (replaces the hardcoded "Order Signs" button).
- **Redesigned Add/Edit sign dialog** — one clean banded layout (Location / Sign / Contact / Service / Media), edits in place, with a "Zone or Department" field. *(Needs `assets.zone` column.)*
- **Floor-wide team notes** panel. *(Needs `floors.floor_notes` column.)*
- **Plan provenance label** — shows where a floor plan came from ("recreated from site reference," etc.). *(Needs `floors.plan_provenance` column.)*
- **Type-aware pin detail** — the pin drawer shows the right action cards for signage vs. facility assets.
- **Trial enforcement** — 7-day trial banner + lockout screen + subscription gate (monetization). *(Needs the `org_is_locked` function + the `user_can` lock-deny.)*
- **Start an audit at a chosen pin** (instead of always from the top).
- **Pin-shape options** — the Markur teardrop and a logo-glyph pin.
- **"Suggest a feature"** in-app feedback box for signed-in users.
- **Help content** — "Preparing your floor plans" tips + a currency pass on the help copy.

## Photos (all added 2026-06-17/18)

- The complete **HEIC photo fix** — instant iPhone uploads, sharp ~3000px photos, fast light grids (small thumbnail transform), full-res on tap, viewable on every device, buckets stay private. Brand new; none of it in prod.

## Speed & stability

- The **bundle/boot rework** (`get_app_boot` / `get_building_view` / `get_floor_view`) that collapses the request cascades, **plus** the regression fixes (A/B/C and WO-1–7) that made it actually fast. This is the difference between today's slow demo history and the fast demo now — and prod has none of it.
- **Crash fixes:** the "something went wrong" stale-deploy chunk crash, the auth half-ready crash.
- **Mobile fixes:** floor toolbar/viewport layout, pin colours on cold load, the character-limit bug that blocked long notes, mobile type-filter, `dvh` dialog sizing.
- The **build stamp** (shows the running version in the account menu).

## The backend half (must travel with the frontend)

Features are frontend **and** database. Prod's database is missing the pieces below — captured in detail in the reconciliation manifest:

- Bundle functions: `get_app_boot`, `get_building_view`, `get_floor_view`.
- Guest-share tables (`building_shares`, `building_share_claims`) + functions (`peek` / `claim` / `revoke_building_share`, `building_shares_cap`).
- New columns: `floors.floor_notes`, `floors.plan_provenance`, `assets.zone`.
- `org_is_locked`, `set_floor_pins_locked`.
- Updated function bodies (out of date on prod): `user_can` (lock-deny), `user_can_view_asset`, `handle_new_user`.

---

## Consolidation = two coordinated moves (daylight, backup first)

1. **Back up the prod database** (snapshot).
2. **Apply the database reconciliation to prod** (the backend list above) via the SQL Editor — additive, in dependency order.
3. **Merge the frontend** `standalone` → `main` so prod builds the new app.
4. **Redeploy markur.ca** (already points at the prod database) and test end-to-end on real data: login, floor open, an edit, a photo, the catalogue.
5. **Retire the duplicates** — the demo Supabase project, the `markur-standalone` site (app.markur.ca), the stale `markur.netlify.app`, and the old MarkView project.

Order matters: **database first** (additive, safe for the old frontend), **then** the frontend, so nothing 404s mid-promotion.

## After consolidation — keep the gap from rebuilding

One environment, and ship finished pieces to it in small, verifiable batches rather than letting a side branch diverge for weeks. If a risky change needs isolation, use a throwaway preview that merges back within days — never a standing parallel "demo" that becomes its own reality. That, plus the build/version stamp showing what's running where, is the whole prevention.
