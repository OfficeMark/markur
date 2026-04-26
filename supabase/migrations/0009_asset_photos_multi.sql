-- =========================================================================
-- Multi-photo support for assets.
--
-- New table public.asset_photos. One asset can have many photos with stable
-- sort_order. The single asset.photo_url column from 0001_init is retained
-- (deprecated) but the app no longer writes to it.
--
-- Storage path scheme moves from `<asset_id>.<ext>` (single) to
-- `<asset_id>/<photo_id>.<ext>` (per-photo).
-- =========================================================================

create table public.asset_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  path text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index asset_photos_asset_idx on public.asset_photos(asset_id, sort_order);

alter table public.asset_photos enable row level security;

create policy "asset_photos_view"
  on public.asset_photos for select
  using (
    exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = asset_photos.asset_id
        and (
          public.user_can('view', 'floor', a.floor_id)
          or public.user_can('view', 'building', f.building_id)
          or (a.tenant_scope_id is not null and public.user_can('view', 'tenant', a.tenant_scope_id))
        )
    )
  );

create policy "asset_photos_admin_write"
  on public.asset_photos for all
  using (
    exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = asset_photos.asset_id
        and public.user_can('edit', 'building', f.building_id)
    )
  )
  with check (
    exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = asset_photos.asset_id
        and public.user_can('edit', 'building', f.building_id)
    )
  );

-- =========================================================================
-- Update the storage helper to extract asset_id from the new nested path
-- `<asset_id>/<photo_id>.<ext>` while still recognizing the legacy
-- `<asset_id>.<ext>` form for backward compatibility.
-- =========================================================================

create or replace function public.storage_asset_photo_asset_id(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when p_name ~ '^[0-9a-fA-F-]{36}[./]'
      then substring(p_name from 1 for 36)::uuid
    else null
  end
$$;
