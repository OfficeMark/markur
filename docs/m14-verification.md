# M14 verification

Per-org overrides on the global asset-type catalog (and edit-in-place on org-specific rows).

## Migration 0019

```
supabase/migrations/0019_m14_org_asset_type_overrides.sql
```

Adds the `org_asset_type_overrides` table with:
- `(org_id, global_key)` unique
- `hidden boolean`, `label_override text`, `color_override text`, `sort_order_override integer` — all nullable except `hidden`
- color format check `^#[0-9A-Fa-f]{6}$`, key format check `^[a-z][a-z0-9_]*$`
- RLS: `select` for any authenticated user; `all` (insert/update/delete) only for super_admin or a `building_admin` whose granted building is owned by the override's org
- Reuses the `set_updated_at()` trigger function defined in 0001_init.sql
- A DO-block sanity check raises if the M11 `org_asset_types_org_admin_write` policy is missing — protects against a wrong-version apply

The migration is purely additive. No existing data is modified.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both should be clean.

## Smoke test (manual)

Sign in as a building admin, go to `/settings`, scroll to "Asset types your team uses".

### Hide a global

1. Click the eye-off icon next to "Donor plaque".
2. A confirmation modal opens, showing the count of existing assets using this type. Confirm.
3. The row gets a "hidden" badge and reduced opacity.
4. Open the floor plan → "Add asset" dropdown → confirm "Donor plaque" is no longer listed.
5. Click the eye icon to unhide. No confirm needed; row returns to normal.

### Rename a global

1. Click the label "Tenant ID" (or its pencil icon).
2. Type "Tenant suite", press Enter.
3. The row picks up an "edited" gold badge.
4. Open "Add asset" dropdown → confirm the renamed entry is "Tenant suite".
5. Existing assets of type `tenant_id` should now display as "Tenant suite" everywhere (drawer, filter popover, audit walkaround).

### Recolor a global

1. Click the color swatch on "Wayfinding" (currently green).
2. Inline picker opens. Pick a different color.
3. The pin color in the floor-plan filter popover and on existing pins reflects the new color.
4. Click the rotate-counter-clockwise icon (Reset) → swatch returns to original green; "edited" badge disappears.

### Reorder

1. Click "Reorder" button in the card header.
2. Up/down arrows appear in each row.
3. Move "Egress" up two slots within the Signage section.
4. Click "Done reordering".
5. Refresh the page → the new order persists (sort_order was written via override or org-specific update depending on the row).

### Edit org-specific

1. Click "Add type" → create one called "Memorial bench" (signage, default color).
2. After save, click its label and rename to "Memorial plaque". Press Enter.
3. Row updates; no override row needed (org-specific rows mutate directly).
4. Click the trash icon → assigned-asset count modal → confirm. Row disappears.

### Other orgs are unaffected

Sign in as a different org's building admin. None of the above changes should be visible to them — they see the original 17 globals untouched.

## Post-deploy checks

- Migrations table on Supabase shows `0019_m14_org_asset_type_overrides`.
- `org_asset_type_overrides` table appears in the Supabase Studio table list.
- A `select` from the table as an authenticated user returns only override rows the RLS lets them see (only their org's, plus none if they have none).
