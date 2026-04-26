-- Fix: 0007 storage policies on asset-photos used unqualified `name`, which
-- resolved to `assets.name` because of the join to `public.assets a`.
-- That made every insert / update / select / delete on the bucket fail RLS.
-- Qualify all references as `storage.objects.name` to disambiguate.

drop policy if exists "asset_photos_read"   on storage.objects;
drop policy if exists "asset_photos_insert" on storage.objects;
drop policy if exists "asset_photos_update" on storage.objects;
drop policy if exists "asset_photos_delete" on storage.objects;

create policy "asset_photos_read"
  on storage.objects for select
  using (
    bucket_id = 'asset-photos'
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

create policy "asset_photos_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'asset-photos'
    and exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = public.storage_asset_photo_asset_id(storage.objects.name)
        and public.user_can('edit', 'building', f.building_id)
    )
  );

create policy "asset_photos_update"
  on storage.objects for update
  using (
    bucket_id = 'asset-photos'
    and exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = public.storage_asset_photo_asset_id(storage.objects.name)
        and public.user_can('edit', 'building', f.building_id)
    )
  )
  with check (
    bucket_id = 'asset-photos'
    and exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = public.storage_asset_photo_asset_id(storage.objects.name)
        and public.user_can('edit', 'building', f.building_id)
    )
  );

create policy "asset_photos_delete"
  on storage.objects for delete
  using (
    bucket_id = 'asset-photos'
    and exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = public.storage_asset_photo_asset_id(storage.objects.name)
        and public.user_can('delete', 'building', f.building_id)
    )
  );
