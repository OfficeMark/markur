# Markur — Day Review, 2026-06-19

**Author:** Cowork (Claude), with Randy
**Scope:** a candid retrospective of the day — what we did, what we decided, what we learned, and where to pick up. Companion to `PATH-B-rebuild-plan-2026-06-19.md` (the live plan) and `COWORK-HANDOFF-2026-06-19.md` (the morning's starting point).

---

## One-line summary

We spent the morning diagnosing why the old demo was slow, hit a wall, then made the call to **stop diagnosing and rebuild on a clean duplicate of prod** — and by end of day had a verified-fast foundation plus seven shipped slices, with **production never touched once.**

---

## What happened (timeline)

1. **Caught up** from `COWORK-HANDOFF-2026-06-19.md`: prod lockout already resolved; the open question was *fix the slow demo vs. restart from prod's fast base*.
2. **Bundle-strip experiment** (the morning's plan): CC stripped the `get_app_boot`/bundle architecture on a throwaway branch to test whether it was the cause of the slowness.
   - Two snags: CC's deploy **published to the live demo** (`app.markur.ca`) instead of a draft (contained — demo only, prod untouched), and the result **falsified the hypothesis** — stripping the bundle did *not* make demo faster (the bundle build was even slightly quicker).
3. **Isolation test** (prod's frontend on the demo backend) to separate "frontend vs backend" as the cause — but it **crashed** on a chunk-loading error (`'text/html' is not a valid JavaScript MIME type`), a deploy/PWA issue affecting both codebases on the demo deploys. The clean measurement never completed.
4. **The pivot (Randy's call):** stop diagnosing, **duplicate prod and re-add features one slice at a time, never touching the original.** Key insight: this path is robust to the unknown cause — whether the slowness was backend or frontend, building on prod's proven-fast full stack sidesteps it.
5. **Foundation stood up & verified:** branch `rebuild` off `main`; fresh Supabase `markur-rebuild` (prod-schema clone from the 47 repo migrations — verified clean, no bundle/guest-share/zone cruft); fresh Netlify site `markur-rebuild`. Took three fix-ups: a seed grant using an unhonored `scope_type`, missing floor-plan images, and a stale duplicate grant — all cleaned.
6. **Seven slices shipped**, each per-table, zero bundle hooks, prod untouched, each independently verified:
   - #1 plan provenance label · #2 floor-wide team notes · #3a Zone/Department field
   - #3b drawer regrouped + Notes raised to 4000 chars · #3c banded sections + video demoted (photo primary) · #3d high-contrast "dynamic" read view · #3e same treatment on the edit form
7. **Design iteration** on the asset/edit window: from flat/beige to dark high-contrast bands with Markur orange, approved via mock (`docs/asset-drawer-dynamic-mock.html`). WCAG AA verified (accent darkened to `#B0541A`, which also fixed a pre-existing failing button).
8. **End of day:** caught that #3e and the seed scripts were uncommitted; CC committed everything as `445a25a`; `.env.rebuild` confirmed gitignored.

---

## Key decisions

- **Path B over Path A** — rebuild on a prod duplicate rather than repair the standalone codebase. (Path A was effectively killed by the experiment: stripping the bundle didn't help.)
- **The bundle architecture does not come across.** Per-table data loading only, like prod.
- **Never touch the original prod** — all work on `rebuild` branch + `markur-rebuild` Supabase + `markur-rebuild` site.
- **One small, verified slice at a time** — with independent verification (DB + git + scope + speed) on every slice, not trust in the report.
- **Dropped/changed scope:** catalogue view replaced by "make the grid printable"; "Where on the floor" field removed (pin conveys it); video demoted below photo.

---

## What shipped — state at EOD

The rebuild foundation is clean and fast (reads ~0.17s, pin placement ~0.2–0.3s; floor open ~0.9s). The asset/edit window — the main data-entry screen — is rebuilt into grouped, banded, high-contrast sections (read + edit), photo-primary, with a generous 4000-char notes field. Test login: `demo@rancherdesign.ca` / `MarkurRebuild2026!`. Commit tip: `445a25a` on `rebuild`.

---

## What we learned (honest retrospective)

- **The morning's diagnosis was largely unnecessary for the decision we made.** Path B is robust to *why* demo was slow, so ~2.5 hours of experiments mostly bought one fact — "the bundle isn't the cause" — which prevented a worse Path-A mistake but wasn't worth its full cost. The lesson Randy named: when you keep going in circles, stop diagnosing the broken thing and start building on the known-good thing.
- **Verify, don't trust — it paid off repeatedly.** Independent checks caught: an uncommitted #3e, untracked seed scripts (a reproducibility risk), the seed grant bug, a wrong-account login, and a claim *I* got wrong (multi-floor pin placement already exists in prod — I'd said it didn't).
- **Show, don't tell.** Mockups of the drawer order and the visual direction prevented blind CC build cycles and got us to an approved design fast.
- **Tooling friction is real and needs guardrails:** the sandbox can't reliably do git/build (index corruption — CC owns those); the Netlify MCP deploy publishes to *production* by default (it overwrote the live demo early on — use the CLI without `--prod` for previews).
- **Discipline beats momentum.** Small slices + a pause-to-review kept us from rebuilding the "100-commit cliff."

---

## Open items / pick up next

1. **Feature review** (paused, pending Randy's calls): keep/cut/reorder the backlog. Claude's nominations — cut pin-shape options (#5) and the "suggest a feature" box (#9); defer trial enforcement (#11) to monetization; guest share (#12) only if client-sharing is core to the pitch; likely keepers: type-aware action card (#4), per-building external order link (#6), printable grid (#7), start-audit-at-pin (#8), photos (#10).
2. **Optional consistency slice:** bring the add-a-sign dialog (`NewAssetDialog`) into the new banded look.
3. **Security tidy:** the untracked `.verify/` Playwright scripts hard-code the rebuild demo password in plaintext — scrub before tracking; consider rotating `MarkurRebuild2026!`.
4. **Cleanup later:** retire `markur-demo` Supabase + `app.markur.ca` *after* the port reaches parity (it's the reference for un-migrated schema like `floor_notes` until then).
5. **Parked prod quirk:** `handle_new_user` mints an unhonored `organization`-scope grant — revisit deliberately, never on prod without explicit OK.
6. **From the original handoff, still pending (prod changes — need Randy's explicit go-ahead):** flip prod auth Site URL from `localhost:3000` to `https://markur.ca`; rotate the two temporary passwords set during the lockout fix.

---

## Production safety statement

`main`, `markur.ca`, and Supabase `drclmnqlurvwqpnnpgzb` had **zero changes** today. All work happened on the `rebuild` branch, the `markur-rebuild` Supabase project, and the `markur-rebuild` Netlify site.
