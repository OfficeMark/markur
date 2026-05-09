# M17 verification

Closes the bug where floors had no UI to create. Surfaced after the BAS demo when neither admin nor invited user could add a floor.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both clean.

## Smoke test (manual)

### Add floor — happy path

1. Sign in as a building admin or super_admin. Open any building.
2. Above the Floors list there's now an "Add floor" button (gold-bordered, "+ Add floor"). Click it.
3. Dialog opens. Type a label like "Floor 5". Click "Add floor".
4. Floor appears in the list immediately.

### Add floor + upload plan in one flow

1. Click "Add floor". Type a label.
2. Click the "Click to add PDF, PNG, or JPG" dropzone. Pick a file. The file name + size shows.
3. Click "Add floor". Button switches to "Uploading plan..." while the file goes up.
4. Dialog closes. The new floor card now shows "Plan uploaded".

### Add floor — empty building

1. Open a building that has zero floors.
2. The empty-state card now shows "Add the first floor" gold CTA in addition to the small "Add floor" header button.
3. Either button opens the same dialog.

### Permission gating

1. Sign in as a Facilities (tenant_rep) or Auditor user.
2. Open a building they have access to.
3. The "Add floor" button does NOT appear (canEdit returns false for these roles).
4. Trying to insert directly via the API would fail RLS — `floors_admin_create` requires `user_can('edit', 'building', X)`.

### Plan upload failure recovery

1. Disconnect from wifi briefly. Click "Add floor" → label → pick a plan file → submit.
2. The floor row IS created (createFloor fires before the upload).
3. Upload fails. Error toast shows: "...The floor was created — you can upload a plan from the floor view."
4. Reconnect. Open the new floor. Use Replace plan to upload.

## What's not in M17 (deferred to M18+)

- Editing floor sort order (drag-to-reorder)
- Deleting a floor (currently only via Trash from Building view)
- Bulk floor creation (e.g. "Add floors B2-B5 and Floors 1-30 in one shot")

## Companion bug — Deborah's "couldn't add a building" error

Diagnosed but not fixed in M17. The DB policy `buildings_authenticated_create` allows any authenticated user. The BuildingNav "+" button has no client-side gate. So her error was either a runtime exception in NewBuildingDialog or an issue with the M11a `auto_org_on_building_create` trigger.

Action: Randy is getting the exact error message from Deborah. Once we have it we'll know whether it's a client-side bug or a trigger bug, and we'll fix in a small M17a or M17b hotfix.
