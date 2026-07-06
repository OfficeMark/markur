# Markur — Brookfield Readiness (2026-07-06)

**Prepared by:** Cowork (Claude, Fable 5). Session: full code review + completion of the entire remaining build queue.
**Prod status: untouched.** No commits/merges to `main`, no markur.ca deploys, zero calls to the prod Supabase (`drclmnql…`). All work: `rebuild` branch + `markur-rebuild` Supabase (`hlfkfkygl…`) + `markur-rebuild` Netlify (`82c2ec99…`).

---

## What shipped today (11 commits on `rebuild`, local — push pending)

| Commit | What |
|---|---|
| `177a72b` | docs from the 2026-06-21 session (HEIC verify-first gate) |
| `3c08fdf` | **SEC-1/2/3**: `lookup_invitation` + `accept_invitation` SECURITY DEFINER RPCs — invitation accept now actually works, email-bound, idempotent + the full code review doc |
| `7a568d2` | regenerated DB types |
| `b0e9e94` | **S9 Demo link** — the Brookfield centerpiece |
| `400d21e` | S4 type-aware action card (vendor links only, no Officemark CTA) |
| `3fe7ca3` | Perf fixes: grid photo N+1 → 2 round trips/floor; cached signed URLs + real cacheControl; offline-drain Dexie bug; memo(PinMarker); lazy jsPDF; route ErrorBoundary |
| `fb6839c` | S8 HEIC: on-device native HEIC→JPEG before upload, ext+MIME validation |
| `6810c41` | S9b edit-form regroup (What it is / Where it is) |
| `89b12ed` | S10 teardrop pin shape |
| `3e1058c` | S11 suggest-a-feature box |
| `9d509b1` | queue marked complete |

Migrations applied to **markur-rebuild only**: `accept_invitation_rpc`, `demo_links`, `teardrop_pin_shape` (files in `supabase/migrations/`).

**Verification:** build green · **192/192 tests** · iron rule confirmed (`git grep` bundle hooks in `src/` = **0**) · S9 peek RPC smoke-tested live ("161 Bay St. · Officemark · 30 days") · no prod URL in the built bundle.

## The demo flow to rehearse (S9)

1. Building page → **Share** button → pick 30 days → **Generate link** → Copy.
2. Open the `/welcome/<token>` link in an incognito window: building name, "Full access · 30 days", name/email/password.
3. Sign up → you land in the building with full access; note the "Keep your building" banner.
4. Back as admin: Share dialog shows the active link, claimant email, days left; Revoke ends their access instantly.

## Randy's checklist before the meeting

1. **Push the branch** (I have no git credentials here): `git push origin rebuild`
2. **Deploy** (sandbox couldn't reach Netlify): in the repo, `netlify deploy --build --prod` against the **markur-rebuild** site (`82c2ec99…`) only — never the prod `markur` site. The build must use `.env.rebuild` values.
3. **6-tap lag check** (desktop + phone): cold load → building → floor → pin detail → place a pin → open a photo → Map/Grid/Notes.
4. **HEIC physical verify** (your verify-first rule): upload a real `.heic` to a pin in your logged-in session — it should convert on-device and display as a JPEG. iPhone: instant. Windows Chrome: a clear "convert to JPG first" message (that browser can't decode HEIC — by design, nothing broken).
5. **Rehearse the S9 flow** above on a good building with pins + photos.

## Known follow-ups (not blockers)

- `fake-indexeddb` devDep + a drain test for `offline.ts` (next `npm install`).
- Medium/Low review items in `docs/CODE-REVIEW-2026-07-06.md` (export concurrency cap, polling gates, SW auto-reload before customer rollout, SEC-4 editor-branch cleanup).
- "Keep your building" CTA currently emails randy@rancherdesign.ca; conversion = clearing the grant's expiry in Access Management (manual for v1).
- Demo claim with email-confirmation ON: user confirms, then returns to the same `/welcome/` link to enter (the page handles it). If that friction bites in rehearsal, turn confirmations off for the demo window.
