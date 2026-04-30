# M9 verification - offline + sync

**Live URL:** https://waymarks-rebuild.netlify.app

The most-valuable surface to verify is the audit walkaround. The flow:
**load a floor online → tap "Take offline" → kill Wi-Fi → audit pins → reconnect → watch the queue drain.**

## 1. Service worker + PWA install

1. Open the site in Chrome desktop after the new build lands.
2. DevTools → Application → Service Workers: should show `sw.js` activated. Cache Storage shows `workbox-precache-v2-*` and `waymarks-storage` caches.
3. The address bar shows an "Install Markur" icon. Click it - opens as a standalone app with the gold pin icon.
4. On iOS Safari: Share → Add to Home Screen. Tap the resulting icon - opens fullscreen, no Safari chrome.
5. On Android Chrome: menu → Install app. Same fullscreen behaviour.

## 2. SyncChip lights up

1. Header shows the "Synced" green pill when online with no backlog.
2. DevTools → Network → Offline. Within ~30s the chip flips to "Offline" (warning amber).
3. Restore network. Chip flips back to "Synced" within 30s.

## 3. Take offline + walk an audit offline

1. Open a floor with pins. Tap **Take offline** (next to Replace plan). Button shows a spinner, then a green check + "Cached" for ~3.5s.
2. DevTools → Application → IndexedDB → `waymarks-offline`. Confirm tables `assets`, `floors`, `last_audit_by_asset` have rows.
3. Set DevTools to Offline. Hard-refresh the floor URL. The plan still loads (workbox runtime cache) and pins still render (Dexie SWR fallback).
4. Tap **Audit floor**. Audit shell opens normally.
5. Tap a pin → tap **Confirm OK**. The progress bar advances, the pin turns green. The SyncChip flips to **Queued** with a `1` badge.
6. Confirm a second pin. SyncChip shows `2`.
7. Restore network. Within ~5s the queue drains: SyncChip transitions Queued → Syncing → Synced. Refresh: the audit_events are now in Supabase.

## 4. Backoff on transient errors

1. Block `*.supabase.co` in DevTools but keep navigator.onLine = true.
2. Confirm a pin in audit mode. The optimistic update lands locally and the event lands in Dexie pending queue.
3. SyncChip stays at "Syncing" briefly, drain attempts every ~5s, each failure bumps backoff (5s → 10s → 20s → ...).
4. Unblock Supabase. Drain succeeds on the next attempt; SyncChip clears.

## 5. SWR for non-audit reads

1. Online: open a floor. Pins render normally.
2. Go offline. Hit Cmd/Ctrl+R. Pins still render (Dexie returns the cache; no spinner stays up forever).
3. Open a floor you've never visited online: empty list (no cache to fall back to). That's expected - "Take offline" pre-caches floors you plan to walk.

## 6. DB checks (super_admin SQL after reconnect)

```sql
-- audit_events for the session you walked offline
select session_id, outcome, created_at
from public.audit_events
where session_id = '<your session>'
order by created_at;
-- the `created_at` should match the time you tapped Confirm offline,
-- not the time the queue drained.
```

Wait — actually the trigger sets created_at server-side when the row inserts, not when you tapped. The Dexie queue stores the user's local timestamp; we don't currently override created_at in the insert. M10 polish: pass the local timestamp to keep audit timing accurate.

## 7. Build / test

- `npx tsc -b` clean.
- `npx vite build` clean (1.21 MB JS / 355 KB gzip - +37 KB gzip vs M8 for Dexie + workbox + offline glue). Service worker `sw.js` + `workbox-*.js` emitted, 11 entries precached.
- `npx vitest run` - 92 / 92 passing across 17 test files (M8's 89 + 3 new for `useOnline`).

## 8. Things explicitly deferred

- **Conflict detection** + `<ConflictResolverDialog>` - deferred to M10. Rare in practice for our usage shape.
- **Sync of asset edits / photos / repositions when offline** - M9 ships only audit_event sync. Asset edits + photo upload still require live network; that's fine because they're admin actions at a desk, not in stairwells.
- **Created_at preservation** - the queued event uses the server's `now()` on insert, so an event tapped at 10:05 and synced at 10:30 records as 10:30. M10 fix: pass the local timestamp explicitly.
- **Playwright e2e for offline drain** - deferred with the rest of the e2e backlog.
- **Final brand icons** - the placeholder gold pin in `public/icons/` is functional but not Officemark-branded. Swap before M10.
