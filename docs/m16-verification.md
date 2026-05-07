# M16 verification

Functional org branding: upload logo, set accent color, override display name; lives in the top nav.

## Migration 0020

```
supabase/migrations/0020_m16_org_branding.sql
```

Adds:
- `org_branding` table — `org_id` (PK, FK to organizations), `logo_path`, `accent_color` (hex format check), `display_name_override`, timestamps. RLS: `select` for any authenticated user; `all` for super_admin or the org's `building_admin`.
- `org-logos` storage bucket — public read, 2 MB cap, PNG/JPG/SVG/WebP only.
- Storage policies — public read on the bucket; write gated to the org's building_admin via the `storage_org_logo_org_id()` helper that extracts the `org_id` from the object name.
- Reuses the existing `set_updated_at()` trigger function.

The migration is purely additive. No existing data is modified.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both clean.

## Smoke test (manual)

### Setting branding

1. Sign in as a building admin. Open `/admin/branding`.
2. Click "Upload logo" — pick a PNG/JPG/SVG/WebP under 2 MB. The 96x96 preview updates immediately.
3. Type "ABC Donor Solutions" (or your firm's name) in the display name field.
4. Pick an accent color from the palette (default: OfficeMark gold).
5. The "Live preview" panel at the bottom shows how your top nav will look: `markur  by OfficeMark  ·  for [logo] ABC Donor Solutions`.
6. Click "Save branding". Saved confirmation appears.

### Branding visible in the top nav

1. After save, the actual top nav (above the page content) shows the same co-brand: Markur wordmark on the left, then `· for [logo] [Org Name]` to its right.
2. Refresh the browser — branding persists.
3. Sign out, sign in as a different user in the same org — they see the same branding.
4. Sign in as a user in a different org with no branding set — they see only the Markur wordmark.

### Removing the logo

1. On `/admin/branding`, click the trash icon on the logo row.
2. Logo preview returns to placeholder.
3. Save. Top nav drops the logo (display name remains if set).

### File validation

1. Try uploading a 5 MB image — error: "File must be under 2 MB."
2. Try uploading a `.gif` — error: "File must be PNG, JPG, SVG, or WebP."

### Permission gating

1. Sign in as a Facilities user. `/admin/branding` redirects to `/settings` (admin gate from M15).
2. Try a direct API call to insert into `org_branding` for another org — Postgres rejects via RLS.

## Storage URLs

Logo URLs look like: `https://drclmnqlurvwqpnnpgzb.supabase.co/storage/v1/object/public/org-logos/<org_id>.<timestamp>.<ext>`.

The cache-busting `<timestamp>` segment in the path means re-uploading replaces the URL too — no stale CDN copies haunting the user.

## What's intentionally not in M16

- White-label mode (Markur branding hidden entirely): later milestone.
- Per-org accent color cascading to UI button hover states: later.
- PDF export header using the logo: later (touches a separate file).
- Invitation email template using the logo: requires Edge Function redeploy; will land alongside the next M13-related work.
