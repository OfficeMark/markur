# M12 verification

Five-part slice:

- Mobile pins shrunk from 28px to 22px (with a hidden hit-area extender so tap targets stay around 34px).
- Floating "Re-center" button on the floor plan, next to the zoom % indicator. Same effect as keyboard `0`.
- 500ms long-press on a pin in mobile/iPad enters the deliberate-reposition flow (the same one the desktop drawer's "Move pin" button uses).
- Offline drain now preserves the original queue timestamp on `audit_events.created_at` instead of letting the server stamp `now()` at flush time.
- Route-level code splitting via `React.lazy` + `Suspense`. Main bundle drops from 355 KB gzip to 220 KB gzip; Floor (with pdf.js) loads on demand.

## Pin sizing

- Open any floor on a phone (or shrink the browser to ~390px wide). Pins should look noticeably smaller — about 22px across.
- Tap targets should still feel comfortable. The visible dot is small but the surrounding hit area is larger, so a sloppy tap should still register on the right pin.
- On desktop (>= 1024px wide) pin size is unchanged at 21px. Spot check a building you remember to confirm nothing visibly shifted.
- The values live in `src/styles/globals.css` as `--pin-size-mobile` and `--pin-size-desktop`. Future tweaks are one line.

## Re-center button

- Open a floor with a plan. Bottom-right of the plan you should see a dark icon button (LocateFixed glyph) next to the zoom % indicator.
- Drag the plan around and pinch/scroll to zoom in. Tap the button. Plan should snap back to centered/100%.
- Keyboard `0` does the same thing.
- Hovering the button shows the tooltip "Re-center (0)".

## Long-press reposition (touch only)

- On a phone/iPad, tap and HOLD a pin for ~half a second without moving your finger.
  - On Android you should feel a small haptic buzz when the timer fires (no buzz on iOS — that API throws there and we swallow it).
  - The pin should jump into reposition mode (visible: pin scales up, dashed gold ring, other pins fade).
  - Lift your finger, then drag the pin to a new location. The familiar confirm/cancel toolbar appears.
- Quick-drag is not affected — moving your finger before the 500ms timer fires cancels the long-press and starts a normal drag (only meaningful for unlocked pins).
- Long-press is gated on `canEdit`. A read-only viewer holding a pin should see nothing happen.
- Audit walkaround mode does NOT enable long-press (the Audit shell uses a different PinOverlay instance and intentionally doesn't pass `onLongPress`).

## Offline drain — created_at preservation

This is hard to exercise fully in the browser, but the path is straightforward:

1. Open a floor, start an audit walkaround.
2. Toggle Chrome DevTools → Network → Offline.
3. Confirm a pin. The SyncChip should show 1 pending. Note the time.
4. Wait a couple of minutes. Confirm another pin or two.
5. Toggle back to Online. The drain should fire within ~5s.
6. Reload the audit log for that asset. The events should show the times you took the action, not the time the queue drained.

If you want to be sure: in Supabase SQL editor after the drain, run something like

```sql
select id, asset_id, created_at, outcome
from public.audit_events
where session_id = 'YOUR_SESSION_ID'
order by created_at;
```

Created_at on the drained rows should match when you tapped, not when you came back online.

## Code splitting

- Open DevTools → Network. Reload the app at the home page.
- The initial JS payload should be visibly smaller. The big `index-*.js` chunk is now ~220 KB gzip (was ~355 KB).
- Click into a building, then a floor. You should see a separate `Floor-*.js` chunk and a `pdf.worker.min-*.mjs` chunk fetched only at that point. Initial app load no longer ships pdf.js.
- Each non-critical route (Settings, Help, Trash, Privacy, Terms, AcceptInvitation, Login) is its own chunk. Hover the network tab as you navigate to confirm.
- A brief Loader2 spinner may flash on the first navigation to a lazy route on a slow network. That's the Suspense fallback.

## Build watchpoint

`npx tsc -b` and `npx vite build --emptyOutDir --outDir /tmp/wm-dist` both pass clean as of M12.

The only build warning is a benign one Vite emits because `lib/offline.ts` is statically imported in some places and dynamically imported (the `setMeta` lazy import inside `useCreateAuditEvent`'s catch path) in another. Functionally fine, but worth tidying when next we touch those files — make the import static and remove the dynamic version.

## Push script

`push-m12.ps1` runs from the repo root in PowerShell. Pure ASCII (no em-dashes — the M6 lesson). It clears any stale `.git/index.lock`, stages the touched files plus `docs/m12-verification.md`, commits, and pushes to `origin/main`. Netlify auto-deploys on push.
