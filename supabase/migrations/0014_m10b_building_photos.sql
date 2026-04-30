-- M10b — building hero photos
-- Adds buildings.photo_url + a building-photos Storage bucket with RLS.
-- Path scheme: building-photos/<building_id>.<ext> — single photo per building.
-- Anyone who can view the building can read the photo; only edit-capable users can write.

alter table public.buildings
  add column if not exists photo_url text;

comment on column public.buildings.photo_url is
  'Storage path within the building-photos bucket (e.g. <building_id>.jpg). Renders as the building hero image and the Home card thumbnail.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'building-photos',
  'building-photos',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = excluded.public;

create or replace function public.storage_building_photo_building_id(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when p_name ~ '^[0-9a-fA-F-]{36}\.'
      then substring(p_name from 1 for 36)::uuid
    else null
  end
$$;

drop policy if exists "building_photos_read"   on storage.objects;
drop policy if exists "building_photos_insert" on storage.objects;
drop policy if exists "building_photos_update" on storage.objects;
drop policy if exists "building_photos_delete" on storage.objects;

create policy "building_photos_read"
  on storage.objects for select
  using (
    bucket_id = 'building-photos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_building_photo_building_id(storage.objects.name)
        and public.user_can('view', 'building', b.id)
    )
  );

create policy "building_photos_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'building-photos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_building_photo_building_id(storage.objects.name)
        and public.user_can('configure', 'building', b.id)
    )
  );

create policy "building_photos_update"
  on storage.objects for update
  using (
    bucket_id = 'building-photos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_building_photo_building_id(storage.objects.name)
        and public.user_can('configure', 'building', b.id)
    )
  )
  with check (
    bucket_id = 'building-photos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_building_photo_building_id(storage.objects.name)
        and public.user_can('configure', 'building', b.id)
    )
  );

create policy "building_photos_delete"
  on storage.objects for delete
  using (
    bucket_id = 'building-photos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_building_photo_building_id(storage.objects.name)
        and public.user_can('configure', 'building', b.id)
    )
  );
