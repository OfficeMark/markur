# 06 — Features

End-to-end behavior for each feature. Each feature has: scope, screens, interactions, validation, edge cases, and acceptance criteria. Implementation lives under `src/features/<feature-name>/`.

## Index

1. [Floor map and pin overlay](#floor-map-and-pin-overlay)
2. [Asset detail drawer](#asset-detail-drawer)
3. [Add asset](#add-asset)
4. [Reposition pin](#reposition-pin)
5. [Audit walkaround](#audit-walkaround)
6. [Floor plan upload + validation](#floor-plan-upload--validation)
7. [Filtering and search](#filtering-and-search)
8. [Mobile + iPad layouts](#mobile--ipad-layouts)
9. [Offline + sync](#offline--sync)
10. [Conflict resolution](#conflict-resolution)
11. [Security / access management](#security--access-management)
12. [Onboarding and invites](#onboarding-and-invites)

---

## Floor map and pin overlay

The default view of a floor.

### Screens

- **Map view** (default): Floor plan rendered as a canvas; pins overlaid as absolutely-positioned markers.
- **Grid view**: Card grid of all assets on the floor (alternative layout, accessed via a tab next to "Map").

### Interactions

- Click a pin → `AssetDrawer` opens for that asset.
- Click empty canvas (in default view) → does nothing. (Placing requires explicit "Add asset" mode.)
- Pinch / scroll wheel → zoom (10–400%).
- Drag canvas → pan (one-finger on touch, click-drag on desktop).
- Double-click / double-tap → fit to view.
- Keyboard: `+`/`-` zoom, arrows pan, `0` fit, Esc cancels.

### Pin status colors

See `02-design-system.md` § Status colors. The status itself is computed:

- `good` if last audit was within `audit_cycle_days` and no open flags
- `attention` (amber) if outside cycle
- `flagged` if any open flag

### Acceptance

- Map and grid views show the same data; toggling between them is instant (no reload).
- Stats row above the canvas (Total / Good / Attention / Audit due) is always consistent with the visible pins.
- Selecting a pin in map view highlights it AND scrolls to the corresponding card in grid view if grid is open in a panel.
- All keyboard shortcuts work and are documented in a `?` help dialog.

---

## Asset detail drawer

Sliding panel on the right (or bottom on mobile) with the full asset record.

### Sections (top to bottom)

1. Header: close X, type badge color
2. Photo (with replace button — admin/auditor)
3. Title (asset name, serif), type chip, location notes
4. Status row (3× MetricCard): Last audit date, Status, Flag count
5. Details: Manufacturer, Installed date, Audit cycle, Tenant scope (if any)
6. Actions: Edit, Replace photo, Reposition pin (admin), Add flag (everyone allowed to flag)
7. Activity timeline (last 10 entries from `audit_log` for this asset)
8. Permissions footer ("Visible to: …")

### Interactions

- Click any inline-editable field (with `<Can>` allowed) → switches to inline edit; Esc cancels, Enter saves
- "Replace photo" → opens device camera on mobile/iPad, file picker on desktop
- "Reposition pin" → closes drawer, enters reposition mode on canvas (see § Reposition pin below)
- "Add flag" → opens flag dialog with severity + description
- Activity timeline → click an entry → diff view ("before / after" of that change)

### Edge cases

- Asset deleted while drawer open: show "This asset has been deleted" with close button. Do not auto-close (user might want to see what happened).
- Asset moved to a different floor (rare): the drawer follows; URL updates.
- Realtime update from another user: changes apply immediately, with a tiny "Updated by M. Chen 2s ago" line above the changed field.

### Acceptance

- Drawer opens within 100 ms of pin click.
- Closing drawer restores canvas focus.
- All actions respect role permissions; "Reposition pin" never shows for non-admins.
- Drawer is keyboard-navigable (Tab through, Enter activates, Esc closes).

---

## Add asset

Two entry points: "Add asset" button in the toolbar, or right-click on the canvas.

### Flow (toolbar entry)

1. User clicks "Add asset" in toolbar.
2. Canvas enters placing mode (cursor crosshair, "Click on the floor plan to place" banner).
3. User clicks a location on the canvas.
4. `NewAssetDialog` opens with the location pre-filled.
5. User fills out type, name, location notes, photo.
6. Submit → optimistic insert → drawer opens for the new asset.

### Flow (right-click)

1. User right-clicks on canvas.
2. Context menu: "Add asset here" (admin only).
3. Same dialog as above, location pre-filled.

### Validation

- Type required.
- Name required, max 80 chars.
- Photo optional but encouraged.
- Coordinates must be within the floor plan bounds (0–1).

### Acceptance

- Placing mode is visually distinct (cursor + banner).
- Esc cancels placing mode.
- Photo capture works on iOS Safari, Android Chrome, desktop Chrome/Safari/Firefox.
- New asset appears at the click point with no perceivable jump.

---

## Reposition pin

Admin-only. The single most-requested feature.

### Flow

1. From `AssetDrawer`, admin clicks "Reposition pin".
2. Drawer closes.
3. Canvas enters repositioning mode:
   - The selected pin grows slightly and gets a dashed gold ring.
   - Banner at bottom: "Drag pin to a new location · Tap outside to cancel".
   - Other pins fade to 40% opacity.
4. Admin drags the pin.
5. On release:
   - Confirmation toast: "Move from (x1,y1) to (x2,y2)?" with [Confirm] [Cancel].
   - If confirm: optimistic update, write goes through, audit_log entry recorded with old/new coords.
   - If cancel: pin snaps back, mode persists.
6. Tap outside or Esc: exits repositioning mode.

### Implementation notes

- The drag uses pointer events (works on mouse and touch).
- Snap to the floor plan grid (10 px grid by default; can be toggled off in Settings).
- During drag, show a faint trail line from the original position to current cursor.
- Audit_log entry: `action = 'pin.move'`, before = old coords, after = new coords.

### Edge cases

- Pin dragged outside the canvas bounds: clamp to edges, show "Pin must stay on the floor plan" hint.
- Network drops during the move: queue the change, mark pin with pending-sync indicator.
- Two admins reposition the same pin offline: → conflict resolution flow (see below).

### Acceptance

- Reposition mode is never accessible to non-admins (UI hidden + RLS rejects the write).
- Touch drag on iPad feels responsive (no lag, no accidental scroll).
- Confirmation toast prevents accidental moves.
- The audit_log shows every move with before/after.

---

## Audit walkaround

Full-screen mode for going through every sign on a floor.

### Flow

1. User taps "Audit" button on a floor.
2. App creates a new `audit_session` row.
3. App loads `AuditModeShell`:
   - Top bar: AUDIT badge, "<floor name>", progress bar (e.g., "0 of 7"), End Audit button.
   - Floor plan fills viewport.
   - Pins are color-coded: green = already audited this session, amber = not yet, red = flagged.
   - Bottom action sheet with current asset (or empty if none selected).
4. User taps a pin OR uses "Next" button (auto-advances to nearest unaudited).
5. Bottom sheet updates with that asset:
   - Photo thumbnail
   - Name, type, location
   - "Confirm OK" (green), "Flag issue" (red outline), "Skip" (link)
6. Each tap creates an `audit_event` row.
7. Progress bar advances.
8. When user taps End Audit → `AuditCompleteSummary` modal:
   - Total / Audited / Missed counts
   - List of missed assets (clickable, returns to audit mode focused on each)
   - "Review Floor" returns to mode for re-audit; "Done" closes session

### Validation

- Audit session can have at most one active per floor per user (don't create dupes).
- Tapping a pin already audited this session re-opens it for re-confirmation.
- Cannot end audit if no events recorded (warn user).

### Offline

- Full feature works offline if the floor was pre-cached.
- Photos taken during audit stored locally; uploaded on reconnect.
- Each audit_event queued to `pending_writes`.

### Acceptance

- Audit mode is visually distinct (full-screen, AUDIT badge).
- Progress bar accurately reflects audit_events in this session.
- Going back/forth between assets does not duplicate events.
- Audit_complete_summary correctly reports missed = total − audited.
- All audit events appear in the asset's activity timeline.

---

## Floor plan upload + validation

When uploading or replacing a floor plan, validate aggressively to prevent the "wrong floor" bug.

### Flow

1. Admin clicks "Upload floor plan" (or "Replace floor plan" if one exists).
2. `FloorPlanUploadDialog` opens.
3. User selects file (PDF, PNG, JPG; max 15 MB).
4. Client-side checks:
   - File type and size
   - For PDF: parse first page, extract text content, check title and author metadata
5. Server-side checks:
   - Same as above, plus virus scan (Supabase Edge Function)
   - Render preview at 300 DPI to verify it loads
6. **Mismatch detection**:
   - If PDF text contains a building or floor reference (e.g., "180 Simcoe", "Floor 8") that does not match the target building/floor, show a warning:
     - "This file appears to belong to a different floor. Detected: '180 Simcoe Floor 8'. Target: '161 Bay St. Floor 3'. [Choose another] [Update floor info] [Use anyway]"
7. On confirm:
   - Upload to `floor-plans` bucket
   - Update `floors.plan_url`, `floors.plan_metadata`, `floors.width_px`, `floors.height_px`
   - Audit_log entry
8. Render the new plan in the canvas.

### Replace flow extras

- Show diff: "Replacing this plan will keep all 24 existing pins. They'll appear at the same relative positions on the new plan. [Continue] [Cancel]"
- After replace, run a "verify pin positions" prompt: do any pins now sit outside the building outline? If yes, surface them in a "needs review" list.

### Acceptance

- Wrong-floor PDFs are caught before upload completes.
- Replacing a plan never silently loses pins.
- Plan render errors show actionable error messages, not blank screens.

---

## Filtering and search

### Type filter

- Chip row above the canvas: All, Directory, Tenant ID, Egress, Stairwell, Service Room, Wayfinding, etc.
- The full filter panel (slide-in from right) shows two sections (Signage / Facilities) with checkbox per type and color dot.
- "All" / "None" buttons at bottom of panel.
- Filter persists across navigation (stored in URL search params).

### Search

- Search input in the toolbar.
- Searches across: asset name, location notes, manufacturer, suite/tenant.
- Debounced 200 ms.
- Results highlight in both Map and Grid views (matching pins glow; non-matching dim to 30%).
- Esc clears search.

### Status filter

- Quick-toggle chips: "Audit due", "Flagged", "Recently changed".
- Sit alongside the type filter.

### Acceptance

- Filter state in URL → shareable links work.
- Search highlights both views simultaneously.
- Clearing filter with one tap (`Reset filters` button when any filter active).

---

## Mobile + iPad layouts

The same components, but rearranged for the device.

### Mobile (default → sm)

- Header: hamburger (left), WayMarks logo (center), SyncChip + user avatar (right)
- No sidebar; access buildings via hamburger menu (slides over from left)
- Canvas: full viewport
- Drawer becomes bottom sheet (drag handle, can expand to 80% viewport)
- Audit mode: full screen as designed

Specific decisions:
- Tap targets: 44 × 44 px minimum
- Pinch-to-zoom on canvas (native gesture)
- "Reposition pin" requires a long-press confirmation (1 s) to avoid accidental admin actions
- Camera capture: opens native camera UI

### iPad portrait (md)

- Header: same as mobile but with more breathing room
- Sidebar: slide-in from left (icon strip when collapsed, full when expanded)
- Drawer: bottom sheet (drag handle, can expand to full)
- Canvas: 70% of vertical space when sheet collapsed

### iPad landscape (lg)

- Header: full
- Sidebar: collapsible (icon-only by default; expand on hover/click)
- Drawer: overlay on the right with backdrop (not a third pane — there's not enough horizontal space for the canvas to feel right with two sidebars)
- Canvas: dominant

### Desktop (xl+)

- Three-pane layout: sidebar (240px) + canvas (flex) + drawer (360px when open)
- Drawer is a side panel, not an overlay
- Toolbar shows all actions inline
- Footer status bar with sync state, activity feed

### Layout primitive

A `useLayout()` hook returns the current layout name and provides helpers:

```tsx
const { layout, isMobile, isTablet, isDesktop, drawerStyle } = useLayout();
// drawerStyle = 'side-panel' | 'overlay' | 'bottom-sheet'
```

The `Drawer` component reads `drawerStyle` and renders accordingly.

### Acceptance

- All key flows work on each layout (verified by Playwright on three viewport sizes).
- No content is unreachable on any size.
- Tenant rep on mobile: can flag, can confirm audit, cannot accidentally place a pin.

---

## Offline + sync

The product must work without a network connection.

### What gets cached

- Floor plans (PDF or image binary)
- Asset photos (full resolution)
- Asset metadata, audit history, flags
- User profile + access grants
- Last 30 days of audit_log entries (for activity timeline)

Cache lives in IndexedDB via Dexie. Schema:

```ts
const db = new Dexie('waymarks');
db.version(1).stores({
  buildings: '&id, owner_org_id',
  floors: '&id, building_id',
  assets: '&id, floor_id, status',
  audits: '&id, floor_id, started_at',
  audit_events: '&id, session_id, asset_id',
  flags: '&id, asset_id, status',
  access_grants: '&id, user_id',
  blobs: '&key',                          // file:// URLs cached as blobs
  pending_writes: '&id, status, created_at',
});
```

### Sync state machine

```
synced ──user makes change──▶ syncing ──success──▶ synced
                                  │
                                  ├──network drops──▶ offline (queued)
                                  │                       │
                                  │                       └──reconnect──▶ syncing
                                  │
                                  └──server diverged──▶ conflict
                                                          │
                                                          └──resolved──▶ syncing
```

The `SyncChip` reflects the current state. See spec sketches.

### Pre-cache flow

On a building card or a "Take offline" button:

1. User taps "Take offline".
2. Modal: "Cache 161 Bay St. — 312 assets, 142 MB? Available offline through tomorrow."
3. Confirm → background fetch of all floor plans, photos, metadata.
4. Progress bar.
5. On complete: "Available offline" indicator on the building card.

### Online detection

- `navigator.onLine` for initial state.
- Periodic ping to `/api/health` (Supabase edge function) to verify actual connectivity (online ≠ reachable).
- `useOnline()` hook returns `{ online: boolean, lastSeen: Date }`.

### Pending writes orchestrator

Lives in `src/lib/offline.ts`. Responsibilities:

1. Add to queue on every mutation.
2. Attempt to push when online, in FIFO order.
3. On 409/conflict response, mark as conflict and stop (don't push subsequent writes for the same entity until resolved).
4. On other errors, exponential backoff (1s, 2s, 4s, …, max 5 min).
5. Persist queue to IndexedDB so a page refresh doesn't lose pending writes.

### Acceptance

- Turn off Wi-Fi mid-audit: app keeps working, edits queue, indicator shows "Offline".
- Turn Wi-Fi back on: indicator shows "Syncing N", queue drains, indicator returns to "Synced".
- Power-cycle the device with pending writes: queue persists; indicator shows "N pending" on reload.
- Pre-cached building loads in <1 s with no network.

---

## Conflict resolution

When two people change the same asset.

### Detection

The Supabase write fails with a `409 Conflict` if the `updated_at` of the row on the server is newer than the `updated_at` the client based its change on (optimistic concurrency).

### UI

`ConflictResolverDialog` opens with:

- Asset header
- Two cards side by side:
  - "YOUR CHANGE · OFFLINE" with the local diff
  - "SERVER · {user}" with the server diff
- Auto-merged fields are listed as resolved ("Already merged: name, location_notes")
- Conflicting fields shown with radio choices: keep yours / keep theirs / keep both (when applicable, e.g., photo)
- Buttons: "Decide later" (parks the conflict), "Resolve" (applies)

### Behavior

- Auto-merge non-conflicting fields (different fields changed → both apply).
- Photo conflicts can offer "Keep both as version history" if storage permits.
- Pin coordinate conflicts get extra emphasis (red dot in icon, prominent dialog) because they have real-world impact.
- "Decide later" leaves the asset in a "needs review" state visible in a dedicated section.

### Acceptance

- No silent overwrites — every conflict surfaces.
- The conflict dialog is keyboard-accessible.
- Resolved conflicts log both old and new values to audit_log.
- Conflicts persist across reloads if "Decide later" is chosen.

---

## Security / access management

UI for managing who can see what.

### Manage access drawer

Opened from "Manage access" button (visible to building admins and super admins).

Shows:
- Current users grouped by role (Building admins, Auditors, Tenant reps)
- For each: name, email, scope, expires_at, granted_by, "Revoke" button
- "Invite" button → opens NewInvitationDialog
- Pending invitations section (sent but not accepted)

### NewInvitationDialog

- Email (required)
- Role (select: building_admin / auditor / tenant_rep)
- Scope (depends on role: building / floor / tenant)
- Expires at (optional date picker)
- "Send invitation" → creates `pending_invitations` row + sends email via Edge Function

### Visible security indicators

Per `02-design-system.md`:

- Persistent header chip: "● Encrypted · {building name}"
- Per-building "Who can see this" card on the building settings page
- Activity log on every floor (recent access changes)

### Acceptance

- Inviting a user works end-to-end: email arrives, link works, signup creates auth user, access_grant created.
- Revoking access: user sees "Access revoked" on next request.
- Time-bounded grants auto-expire and update the user's view immediately on next page load.

---

## Onboarding and invites

### Sign-up flows

- **Direct sign-up**: only for super admins (Waymarks team). Disabled for everyone else.
- **Invitation**: clicking an invite link → if not signed up, prompts for name + password → creates auth user → consumes the `pending_invitations` row → creates `access_grant`.

### First-time experience by role

- **building_admin first login**: empty building shell. Wizard: "Add a building → upload first floor plan → place a pin → invite a tenant". Skippable.
- **auditor first login**: lands on assigned floor in audit mode by default.
- **tenant_rep first login**: lands on their floor, drawer open with a "Welcome — flag any signs that need attention" message.

### Email templates

- Invitation: "{Inviter} invited you to Waymarks for {building}. Accept here: {link}"
- Audit due: "Floor {N} of {building} is due for audit on {date}"
- Flag raised: "{User} raised a flag on {asset} at {building}: '{description}'"

Templates live in `supabase/functions/send-email/templates/`.

### Acceptance

- Invitation flow works on first try (most common bug area).
- Expired invitations show a useful error.
- Re-sending invitation invalidates the old token.
- Tenant rep cannot invite anyone.
