# M18 verification

Asset window robustness: optional fields, room number, notes, vendor contact. Attachments schema in place; UI deferred to M18b.

## Migration 0021

Already applied to Supabase project `drclmnqlurvwqpnnpgzb` via the MCP.

Adds:
- `assets.room_number` (text, nullable, ≤80 chars)
- `assets.notes` (text, nullable, ≤4000 chars)
- `assets.vendor_contact` (jsonb, nullable; shape `{ name?, email?, phone?, company? }`)
- `asset_attachments` table (id, asset_id, path, filename, mime_type, size_bytes, uploaded_by, created_at) with RLS
- `asset-attachments` storage bucket (private, 25 MB cap, PDF + common Office MIME types)
- `storage_asset_attachment_asset_id` helper for path-based RLS

## TypeScript build

```
npx tsc -b
npx vite build
```

Both clean.

## Smoke test (manual)

### Create an asset with no name and minimal data

1. Open a floor with a plan. Click somewhere on the plan.
2. NewAssetDialog opens. Pick a Type (only required field). Leave Name blank.
3. Click "Place pin". Asset is created with name = "Untitled".
4. The pin appears on the floor at the click coordinate.

### Use the new fields

1. Click an empty spot on the plan again. Pick a type.
2. Fill: Name "Lobby directory", Room number "L1-101", Vendor name "Acme Sign Co.", Vendor email "service@acme.com", Vendor phone "(416) 555-0123", Notes "Replaced 2024-03 with brushed aluminum face."
3. Click "Place pin".
4. Click the new pin. Drawer opens.
5. Top of drawer shows: gold "Type" chip, default "Category" chip, default "Rm L1-101" chip.
6. Notes block shows the multiline notes correctly.
7. Vendor block shows Acme Sign Co., the email as a `mailto:` link, and the phone as a `tel:` link.

### Existing assets unchanged

1. Click any pre-M18 asset (no room_number, no notes, no vendor_contact set).
2. Drawer renders normally — no Rm chip, no Notes block, no Vendor block. Just Type + Category + location_notes if present.
3. Editing flow still works.

### Form validation behavior

1. Try creating an asset with NO type selected. Form blocks with "Pick a type."
2. Leave every other field blank. Form accepts. Asset created with default name.
3. Type more than 80 chars in Name → form blocks with length error.
4. Type more than 4000 chars in Notes → form blocks with length error.

## RLS spot-check

The asset_attachments policies parallel asset_photos:

- Read: any user with view rights on the asset's floor.
- Write: only users with edit rights on the parent building.
- Storage path layout `<asset_id>/<random>.<ext>` enforced by helper function.

Storage bucket policies fire correctly on direct API attempts (verified during migration apply via the safety DO-block).

## What's NOT in M18 (deferred)

- **Attachment upload UI.** Schema and bucket are live; the UI to actually pick/upload/view PDFs lands in M18b. Until then, attachments can be inserted via direct SQL or a manual upload to the bucket if needed for testing.
- **Filter-by-category quick-select** in the placement window. Was on the original list; deferred to keep this ship small and stable after the BAS demo bugs. Will land alongside attachments UI in M18b.
- **Pin clustering** for overlapping pins (M21 / separate work pending Deborah's specific suggestion).
