# Incident Post-Mortem — Production Lockout & The Two-Week Slowdown

**Date:** 2026-06-17 (evening)
**Prepared by:** Cowork (Claude), with Randy
**Status:** Production access restored; root causes identified; fixes partly applied, partly queued.
**Why this exists:** so future-us knows what was wired, what broke, what we did, and how not to repeat it.

---

## TL;DR

For about a week, **markur.ca (production) was silently pointed at the *demo* database.** Randy's and Mark's accounts only exist in the *production* database, so the live site kept rejecting correct passwords — and because password-reset/magic-link emails were also misconfigured (pointing at `localhost:3000`), every recovery path failed too. The result: Randy locked out of his own app for a week, and Mark (BAS Group) unable to log in the night before a hospital survey. Separately, two weeks of feature/optimization work introduced a **performance regression** and got stranded on the demo side, so production stayed fast-but-old while demo went slow-but-featureful. Tonight we re-pointed production at the correct database and redeployed, restored login for both users, found the cause of the slowness, and queued the fix.

---

## How everything is actually wired (the reference that was missing)

| | **PRODUCTION** | **DEMO / test** | **Legacy (retire)** |
|---|---|---|---|
| Supabase project name | `markur` | `markur-demo` | `MarkView` |
| Supabase project ref | `drclmnqlurvwqpnnpgzb` | `dzhrugpkodxzhjgihjkn` | `xjmmfqjwyqbqhchehowy` |
| Netlify site | `markur` | `markur-standalone` | — |
| URL | **markur.ca** | app.markur.ca | markur.netlify.app (stale) |
| Git branch | `main` | `standalone` | — |
| Data | **Real BAS data:** Crescent School, Timmins Hospital, SJCCC | Test buildings: OfficeMark, Riverside, Capital One | — |
| Speed | Fast | Slow (perf regression) | — |

Two near-identical worlds with look-alike names is the underlying condition that made every mistake below possible.

---

## How we got here (root causes)

1. **Production site pointed at the wrong database (the lockout).** On ~June 9, the Netlify environment variable `VITE_SUPABASE_URL` for the `markur` site was changed to the **demo** project (`dzhrugpkodxzhjgihjkn`). After the next deploy, markur.ca authenticated against the demo database — where Randy's and Mark's accounts don't exist — so correct passwords were rejected. Nothing in the UI showed which database the app was using, so it was invisible.

2. **Two look-alike environments, no guardrails.** `markur` vs `markur-demo`, markur.ca vs app.markur.ca, `main` vs `standalone`, plus leftover projects. When everything looks the same, the wrong one eventually gets wired to the wrong thing.

3. **A dev setting left in production (broke recovery).** The production auth **Site URL was `http://localhost:3000`**, so password-reset and magic-link emails dead-ended on every device. A normally-fixable login problem became an all-day wall because *no* recovery path worked.

4. **Features stranded + a performance regression.** Two weeks of work (Plan Prep, the data "bundle" rework) lived on `standalone`/demo and never got promoted to `main`/production, so clients couldn't reach them. The rework also introduced a slowdown (see below), so the stranded version was both newer *and* slower.

5. **Verification gap across hand-offs.** Work passed between agents (DB work, frontend work) and Randy relaying. Fixes were reported "done" without confirming behavior on the *actual live site*. The single fact nobody checked all week — *which database does the live site really talk to* — was the answer the whole time. (Cowork repeated this: set the password on the wrong database twice before checking.)

### The performance regression (separate but related)
Discovered via a clean A/B: **production (`main`) is fast; demo (`standalone`) is slow**, even though demo has all the "speed fix" commits. So the cause is the data-loading architecture the rework introduced, in three compounding parts:
- **Reload-everything-on-edit:** one big combined load (`get_app_boot`) feeds the whole app, and ~12 edit actions throw it all away and refetch+redraw the entire app instead of updating the one thing that changed.
- **No caching on screen data:** the building/floor view loads had no cache lifetime, so navigating re-downloaded and re-drew each screen.
- **Aggressive retry:** a hiccup made the app wait ~4+ seconds doing nothing before retrying — the "frozen screen with zero network activity."
Production never had any of this, which is why it's instant.

---

## What we did tonight

- **Re-pointed production at the correct database.** Set the `markur` (markur.ca) Netlify env vars `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to the **production** project (`drclmnqlurvwqpnnpgzb`) and redeployed (`Deploy without cache`). Verified `main` does not use the bundle RPCs, so it's compatible with the production database.
- **Restored login** for `randy@rancherdesign.ca` (super-admin) and `mark@basgroup.ca` by setting passwords directly in the production database (bypassing the broken email paths). Mark confirmed he's in; the Timmins Hospital data is present.
- **Found the slowness root cause** (the three-part regression above) via the main-vs-standalone diff.
- **Applied two safe perf fixes** to the `standalone` working tree: session caching on the building/floor view loads, and a calmer retry setting. **Not yet built/deployed** (see Open Items).
- **Added a build stamp** (commit + build time) to the account menu so the running build is visible at a glance.

---

## Current state

- ✅ markur.ca points at the production database; Randy and Mark can log in.
- ✅ Real BAS data (incl. Timmins Hospital) is intact and reachable.
- ⏳ **Perf fixes A + B written but not deployed** — need a verified build + deploy to demo (Cowork's sandbox can't build reliably; CC to do it). See `markur-CC-perf-regression-fix-2026-06-17.md`.
- ⏳ **Perf fix C** (stop reloading everything on edits) documented, not yet done.
- ⏳ **Production auth Site URL still `localhost:3000`** — resets/magic links still broken until changed to `https://markur.ca`.
- ⏳ Temporary passwords were set tonight for both accounts — **rotate them** to something Randy chooses.

---

## Lessons & prevention

1. **Collapse to one environment.** One database, one site, one branch. This deletes the entire "pointed at the wrong twin" failure class — the actual cause of the lockout — and un-strands the features. (Randy's decision; do it after the survey, with a backup taken first.)
2. **Show the truth in the app.** The build stamp should also display *which database* the app is connected to. Tonight would have been a 30-second diagnosis instead of hours.
3. **No dev settings in production.** Fix the auth Site URL to `https://markur.ca`; audit for other `localhost` leftovers.
4. **One verification rule:** before calling any login/routing fix "done," confirm what the *live site* actually talks to (env var or a real request in the logs) — never the assumed one.
5. **If a test environment is ever needed again,** use *ephemeral* previews (Netlify deploy previews + Supabase branching) that vanish after use — never a permanent parallel "demo" that drifts and gets mistaken for prod.
6. **Retire the clutter:** the `MarkView` Supabase project and `markur.netlify.app` should go, so there are no look-alikes left to confuse.

---

## Open action items (next session, in daylight, backup first)

1. Change production auth **Site URL → `https://markur.ca`** (fixes resets/magic links for good).
2. **Rotate** the two temporary passwords set tonight.
3. **CC: build + deploy perf fixes A + B** to demo; have Randy re-test the slow buttons; then do **fix C** with a test.
4. **Consolidate to one environment** (the production database + site), promote the good demo features onto it, retire `markur-demo`, `markur-standalone`, `MarkView`, and `markur.netlify.app`.
5. Add the **connected-database indicator** to the build stamp.

---

*Net: a week-long lockout and a two-week mystery both came down to small misconfigurations hiding inside a fragile two-environment setup. The durable fix is fewer moving parts and making the app tell you the truth about what it's connected to.*
