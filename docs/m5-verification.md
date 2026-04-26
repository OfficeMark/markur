# M5 verification — reposition + delete + Trash

**Live URL:** https://waymarks-rebuild.netlify.app
**Migration applied:** `0011_m5_audit_triggers_and_pin_move`
**Commit:** _<filled in after push>_

After the next Netlify deploy goes green AND post-processing finishes, hard-refresh (Cmd/Ctrl+Shift+R) and walk through:

## 1. Deliberate reposition (the M5 headline)

1. Sign in, open 161 Bay St. → any floor with a plan + a pin.
2. Click a pin → drawer opens.
3. New under "Quick actions" you'll see a **"Reposition pin"** button (admin only) and a "Delete asset" button.
4. Click **Reposition pin**. The drawer should close. The selected pin should grow noticeably and gain a brighter dashed gold ring; other pins fade to ~40% opacity. A banner pinned to the bottom of the canvas reads "Drag the pin to a new location · or press Esc to cancel".
5. Drag the pin to a new spot.
6. On release: the banner switches to a confirmation that says **"Move from (x%, y%) to (x%, y%)?"** with **Cancel** and **Confirm** buttons.
7. Click **Cancel** — the pin snaps back to its original position. Reposition mode stays armed (you can drag again).
8. Drag again, then click **Confirm** — the pin commits to the new position, the banner disappears, and reposition mode exits. Hard-refresh: the pin should still be at the new spot.
9. Press **Esc** (without dragging) — exits reposition mode without committing.

Things that should NOT happen: the pin moving without confirming, the banner auto-dismissing, the drawer reopening over the canvas while in reposition mode, other pins being draggable.

## 2. Soft-delete with step-up confirmation

1. Open the drawer for a pin.
2. Click **Delete asset** — a modal appears: "Delete asset" + a text input that says `Type DELETE to confirm`.
3. Try to click the **Delete asset** button — disabled.
4. Type `delete` (lowercase) — still disabled (case-sensitive on purpose).
5. Type `DELETE` — button enables.
6. Press Enter (or click the button). The dialog closes, the drawer closes, the pin disappears from the floor.
7. Hard-refresh. The pin stays gone.

## 3. Trash + restore (super_admin only)

1. Go back to the building view (`161 Bay St.`).
2. There's a new **Trash** link/chip in the building header (only visible because you're super_admin).
3. Click it. You land on `/buildings/<id>/trash` listing the pin you just deleted, with a deleted-time annotation ("a few seconds ago").
4. Click **Restore**. The row disappears. Navigate back to the floor — the pin is back exactly where it was.
5. Open the drawer for the restored pin. The Activity timeline should now have entries for: the original creation, the move(s) you did in step 1, the delete, and the restore.

To confirm the gate works: a non-super-admin user navigating directly to `/buildings/<id>/trash` should bounce back to the building view (no flash of forbidden content).

## 4. Audit_log entries

In the Supabase dashboard SQL editor (or via MCP):

```sql
select id, action, before, after, created_at
from public.audit_log
where entity_type = 'assets'
  and entity_id = '<the asset id you moved>'
order by created_at desc
limit 8;
```

Expected to see:

- A `pin.move` row with `before = {"x": …, "y": …}` and `after = {"x": …, "y": …}` — the dedicated trigger.
- An `update.assets` row alongside it — the generic trigger; before/after contain the full row JSON.
- A `update.assets` row when you soft-deleted (deleted_at flipped null → not-null).
- A `update.assets` row when you restored (deleted_at flipped not-null → null).

For the other tables, the new generic triggers are wired but not yet exercised by UI in M5. They light up as M6/M7 land.

## 5. Tenant-rep cannot reposition (UI + RLS)

We don't yet have a tenant-rep test user; the playwright e2e for this is deferred to M7 with the wider permissions hardening. Logic check: in `AssetDrawer`, the "Reposition pin" button is gated by `useCan('reposition', { type: 'building' })`, and the SQL `user_can()` only returns true on the `reposition` capability for `building_admin` (or `super_admin` via the blanket short-circuit). So both UI and RLS gates align.

## 6. Build / test summary

- `npx tsc -b` clean.
- `npx vite build` clean (2092 modules, ~1.06 MB JS / 309 KB gzip — same as M4).
- `npx vitest run` — **59 / 59 passing** across 12 test files (53 from M0–M4, 6 new for M5).

## 7. Things explicitly deferred

- Playwright e2e for reposition (writes to audit_log) and tenant-rep-blocked: bundled into M7.
- Trigger correctness for `flags`/`access_grants`/`floors`/`buildings` audit rows: triggers verified live via `information_schema.triggers`; the activity-timeline UI for those entity types is on the M7 menu, not M5.
- Renaming the `tenant_rep` role's DB value to `facility_rep`: still slated for M7 per `waymarks_role_rename` notes.
