# Markur Rebuild — Full Code Review (2026-07-06)

**Prepared by:** Cowork (Claude, Fable 5), read-only review ahead of the Brookfield push.
**Scope:** `rebuild` branch @ `177a72b`. Three parallel reviews: security/RLS, frontend architecture & performance, and the standalone→rebuild port surface.
**Rule honored throughout:** review made no code changes; this document is the recommendation record. Prod (`main` / markur.ca / Supabase `drclmnql…`) untouched, as always.

---

## Headline results

1. **The iron rule holds.** Zero bundle hooks (`get_app_boot` / `get_building_view` / `get_floor_view` / `useAppBoot` / `useBundles` / `useFloorView` / `useBuildingView`) anywhere in `src/`. Data layer is per-table, param-scoped, `enabled`-guarded, with `refetchOnWindowFocus: false` and sane staleTimes. The old disease cannot re-enter through the current code.
2. **S8b (Share/collab) is already ported** — every file exists on `rebuild`, most byte-identical to standalone, and the four that differ were de-bundled in the right direction. **But see Security #1: invitation acceptance is functionally broken at the RLS layer** and needs a SECURITY DEFINER accept RPC before S8b actually works end to end.
3. **Security posture is well above baseline** — no secrets committed, expiry enforced in every `user_can` branch, helpers moved to `private` schema, audit log write-closed, edge function escapes HTML properly.
4. **Three High-severity frontend findings** are the living relatives of the old perf disease (offline audit sync silently dead; grid photo N+1; photos re-downloaded every view). All three are cheap to fix.

---

## Security findings

### SEC-1 (High) — No self-insert path for `access_grants`: invitation accept is broken, demo-link claims will be too
`acceptInvitation` (`src/lib/queries/access.ts:257-288`) does a plain client-side insert into `access_grants`. The only INSERT policy requires `user_can('manage_access')` on the scope — which an invitee never has. RLS therefore **rejects** a normal invitee's accept. Correct security posture (no escalation), but the flow doesn't work for its intended users, and S9 demo claims would hit the same wall.
**Fix:** a `SECURITY DEFINER` RPC `accept_invitation(token)` that validates the token, checks `expires_at > now()` and `accepted_at is null`, **binds to the invited email** (`lower(inv.email) = lower(auth.jwt()->>'email')`), inserts the grant and stamps `accepted_at` in one transaction. Do **not** widen INSERT RLS.

### SEC-2 (High) — Accept is not email-bound
The UI only soft-warns when the signed-in user's email differs from the invitation's. A leaked token (14-day life, sent in plaintext email) could be redeemed by any account once SEC-1's RPC exists. **Fix:** enforce the email match inside the RPC (server-side), never in the client.

### SEC-3 (Medium) — No idempotency/uniqueness on grant creation
Two un-transacted writes; no unique constraint on `(user_id, role, scope_type, scope_id)`. Double-accepts create duplicate grants. **Fix:** both writes inside the RPC transaction + partial unique index.

### SEC-4 (Medium) — `user_can` has an `editor` branch but the `access_grants.role` CHECK forbids `'editor'`
Dead code today; a latent trap the day someone widens the CHECK without reviewing the capability set (it grants `audit` + `upload_plan` + `export`). **Fix:** widen the CHECK deliberately as part of S9's migration (which needs new-role thinking anyway) or drop the branch.

### SEC-5/6/7 (Low) — Noted, no action needed
SVG plans can't reach the DOM (canvas rasterization only — keep it that way); `org-logos` public bucket is by design; login `next=` redirect is SPA-internal, not an open redirect.

**Solid:** no secrets tracked; expiry (`expires_at is null or expires_at > now()`) enforced in **every** branch of `user_can`, `user_can_view_asset`, `user_in_org/building`; `search_path` pinned on every definer function; phase2c super-admin global-scope fix; audit_log client-write-closed; race-safe pin numbering.

### Direct answer to the S9 gate question
**Yes** — a building-scoped grant with `expires_at` set loses all access (app + RLS + storage) the moment it expires. The expiry check the BUILD-QUEUE asked us to verify is already comprehensive. The gap is not expiry — it's grant *creation* (SEC-1/2).

---

## Frontend / performance findings

### PERF-1 (High) — Offline audit queue can never drain
`offline.ts:180` sorts by `created_at`, which is **not** in the Dexie store index (`offline.ts:71`). Dexie throws; `useAudit.ts:229` swallows the error into `[]`. **Offline-queued audit events are never synced, silently.** No test covers `offline.ts`. **Fix:** index bump or sort in JS after `.toArray()`; add a drain test.

### PERF-2 (High) — Grid view is an N+1: one photo query + one signing round trip per pin
`AssetGridView.tsx:299-316` — 150 pins ≈ ~300 round trips on grid open. This is exactly the "one interaction → many round trips" disease. The batch helper (`listFirstPhotoPaths`) already exists. **Fix:** one batched paths query + one `createSignedUrls` (plural) per floor. Same pattern in `Report.tsx:485-500`.

### PERF-3 (High) — Photos re-downloaded on every view
`cacheControl: '0'` on upload + a freshly-minted signed token per mount = browser cache, SW cache, and HTTP cache all miss, every time. Closest living relative of the old 45-second photo opens. **Fix:** real `cacheControl` on upload (paths are immutable UUIDs) + cache signed URLs in TanStack Query keyed by path with staleTime ≈ 25 min (token TTL 30 min).

### PERF-4 (Medium) — Pin drag re-renders every pin per pointermove; `PinMarker` unmemoized. **Fix:** `memo(PinMarker)` + ref-based drag preview.
### PERF-5 (Medium) — jspdf parsed eagerly in Floor/Report chunks. **Fix:** dynamic `import()` at the export call sites.
### PERF-6 (Medium) — Export pipeline: unbounded parallel fetches + main-thread canvas encodes. User-initiated with busy state → acceptable; add a concurrency cap when convenient.
### PERF-7 (Medium) — Single app-root ErrorBoundary; a crash anywhere nukes the whole app incl. mid-audit. **Fix:** second boundary around the routed outlet.
### PERF-8/9/10/11 (Low) — 2s/5s polling loops could gate on queue length; SW auto-reload can eat an in-progress edit (revisit before customer rollout); pan/zoom state-per-move is well-mitigated as built; `useAssetsWithVideos` key embeds all asset ids.

**Solid:** route-level code splitting thorough; optimistic pin-move mutations textbook (instant by construction); pinch/pan/zoom carefully engineered; auth/session-loss (ITP) recovery designed and tested; providers leak-free; permissions matrix, report builders, plan-prep, zoom, upload all well-tested.

---

## Port surface (what's actually left to build)

| Feature | Rebuild status | Size |
|---|---|---|
| S8b share/collab | **already ported & de-bundled** — needs SEC-1 RPC to work end-to-end | S |
| S9 demo link | missing entirely; build per BUILD-QUEUE spec (invitations + expiring grant), **not** standalone's `building_shares` guest system | L |
| S4 action card | missing; all deps present; adapt: **no Officemark CTA** (vendor-with-a-link decision, Randy 2026-07-06) | S |
| S8 photos/HEIC | diagnostic pass-through only; port `image-convert.ts` (native decoder → JPEG ~3000px) + extension+MIME validation; skip bundle-era `a9cb56d`; **Randy's physical HEIC verify remains the gate** | M |
| S9b edit regroup | JSX reshuffle in `EditPanel` to match read-view bands | S |
| S10 teardrop pin | PinMarker SVG branch + widen `org_branding.pin_shape` CHECK (rebuild sources shape from org branding) | M |
| S11 suggest-a-feature | port `feature_suggestions` migration + dialog | S |

**S9 design notes (spec vs. standalone reality):** standalone's shipped guest-share is OTP-login, read-only viewer, `building_shares` tables — all three contradict the approved spec/mock (password signup, full access, invitations + `access_grants.expires_at`, 14/30/90 days). Build to the spec/mock; reuse standalone only as reference. The migration must be **re-based onto rebuild's current `user_can`** (phase2b/2c revisions), never copied verbatim. Also reconcile the mock's 14/30/90 against standalone's 7/30/90 — spec says 14/30/90, default 30.

---

## Recommended fix order (Brookfield-first)

1. SEC-1/2/3 accept RPC migration (unblocks S8b *and* S9)
2. S9 demo link (centerpiece)
3. PERF-2 + PERF-3 (photo speed insurance for the live demo)
4. S4, PERF-1, S8 HEIC (with verify gate), S9b, PERF-4/5/7, S10, S11
