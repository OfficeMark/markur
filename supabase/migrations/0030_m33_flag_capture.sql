-- =========================================================================
-- M33 — flag capture (Audit Mode "Flag issue").
--
-- public.flags already carries a NOT NULL `description`, so the required
-- description needs no schema change. This migration adds optional photo
-- evidence:
--   1. flags.photo_urls — jsonb array of storage paths, default [].
--   2. a private `flag-photos` storage bucket.
--
-- Photos use the same path scheme as asset photos — `<asset_id>/<photo_id>.
-- <ext>` — so the existing storage_asset_photo_asset_id() helper resolves
-- the owning asset. Keying the storage policies on the asset (not the flag)
-- means the upload can happen before the flags row is inserted, which the
-- app relies on: it uploads, then inserts the flag with the paths already
-- populated (an auditor cannot UPDATE a flag — flags_resolve is admin-only).
-- =========================================================================

alter table public.flags
  add column photo_urls jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'flag-photos',
  'flag-photos',
  false,
  8388608, -- 8 MB, matching asset photos
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Read: anyone who can view the underlying asset.
create policy "flag_photos_read"
  on storage.objects for select
  using (
    bucket_id = 'flag-photos'
    and exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = public.storage_asset_photo_asset_id(storage.objects.name)
        and (
          public.user_can('view', 'floor', a.floor_id)
          or public.user_can('view', 'building', f.building_id)
          or (a.tenant_scope_id is not null and public.user_can('view', 'tenant', a.tenant_scope_id))
        )
    )
  );

-- Insert / delete: anyone who can flag the underlying asset. Delete lets the
-- app clean up an orphan object if the flags insert fails after upload.
create policy "flag_photos_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'flag-photos'
    and exists (
      select 1 from public.assets a
      where a.id = public.storage_asset_photo_asset_id(storage.objects.name)
        and (
          public.user_can('flag', 'floor', a.floor_id)
          or (a.tenant_scope_id is not null and public.user_can('flag', 'tenant', a.tenant_scope_id))
        )
    )
  );

create policy "flag_photos_delete"
  on storage.objects for delete
  using (
    bucket_id = 'flag-photos'
    and exists (
      select 1 from public.assets a
      where a.id = public.storage_asset_photo_asset_id(storage.objects.name)
        and (
          public.user_can('flag', 'floor', a.floor_id)
          or (a.tenant_scope_id is not null and public.user_can('flag', 'tenant', a.tenant_scope_id))
        )
    )
  );
