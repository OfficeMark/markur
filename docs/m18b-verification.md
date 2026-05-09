# M18b verification

Asset attachments upload UI + searchable type dropdown. Builds on M18's table + storage bucket; no new migration.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both clean.

## Smoke tests (manual)

### Attaching a PDF to an asset

1. Open any floor with assets. Click a pin to open the drawer.
2. Below the StatusRow there's now an "Attachments" section. Empty state reads "No files attached. Drop in cut sheets, install instructions, or warranty docs."
3. Click "Attach" (visible to edit users). File picker opens. Pick a PDF (or Word/Excel/image).
4. Upload progresses; row appears with filename, size, and "just now" timestamp.
5. Click "View" — opens the file in a new tab via a 15-min signed URL.

### Multiple file uploads at once

1. Select 3 files at once in the file picker.
2. They upload sequentially. Three rows appear, newest first.

### Validation

1. Try uploading a file > 25 MB → error: "too large (limit 25 MB)."
2. Try uploading a `.zip` or other unsupported MIME → error: "unsupported type. Use PDF, Word, Excel, image, or text file."

### Delete

1. Click the trash icon on a row. The row disappears; the storage object is also removed.
2. As a non-edit user (Auditor / Facilities), the trash icon does not appear.

### Permission gating

1. Sign in as Auditor or Facilities. Open an asset drawer.
2. Attachments section visible. List shows existing files. View links work.
3. No "Attach" button. No trash icons.

### Searchable type dropdown

1. Open any floor with a plan. Click an empty spot to place a new asset.
2. NewAssetDialog opens. Above the type dropdown there's now a search input: "Search types (e.g. emerg, donor, way…)".
3. Type "emerg" → dropdown narrows to Emergency, Evacuation, Egress (substring match on label).
4. Type "donor" → narrows to Donor plaque, Donor wall.
5. Clear the search → full list returns.
6. The "+ Add custom type…" option stays pinned at the bottom regardless of search.

### Existing assets unchanged

1. Pre-M18b assets show the Attachments section with empty state.
2. No regression on photo gallery, vendor panel, notes, room number.

## What's NOT in M18b

- Filter-by-category quick-select chips above the search (Randy's earlier "all emergency" framing) — search input does the equivalent work; chips can come later if real audit walks show search isn't enough.
- Bulk attachment delete.
- Drag-and-drop file upload zone — current UX is click-to-pick. Drag-drop is polish.

## Storage notes

Path scheme: `asset-attachments/<asset_id>/<attachment_id>.<ext>`. Bucket is private; reads use signed URLs (15-min TTL). On row delete, the storage object is also removed (best-effort; orphans are tolerable). On row insert failure, the uploaded blob is cleaned up before the error surfaces.
