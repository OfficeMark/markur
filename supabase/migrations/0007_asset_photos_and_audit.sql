-- =========================================================================
-- asset-photos storage bucket + RLS-equivalent policies
-- =========================================================================
--
-- Layout: asset-photos/{asset_id}.{ext} (a single photo per asset for now;
-- versioning lands when we tackle history in M5). 8 MB cap (most phone
-- photos are 2–4 MB).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-photos',
  'asset-photos',
  false,
  8388608,                           -- 8 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = excluded.public;

create or replace function public.storage_asset_photo_asset_id(p_name text)
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
      where a.id = public.storage_asset_photo_asset_id(name)
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
      where a.id = public.storage_asset_photo_asset_id(name)
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
      where a.id = public.storage_asset_photo_asset_id(name)
        and public.user_can('edit', 'building', f.building_id)
    )
  )
  with check (
    bucket_id = 'asset-photos'
    and exists (
      select 1
      from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = public.storage_asset_photo_asset_id(name)
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
      where a.id = public.storage_asset_photo_asset_id(name)
        and public.user_can('delete', 'building', f.building_id)
    )
  );

-- =========================================================================
-- audit_log_changes function + trigger on assets
-- =========================================================================
--
-- Per spec 03 §audit_log_changes. The full set of triggers (floors,
-- buildings, flags, access_grants) lands in M5; for M4 we just need assets
-- to drive the activity timeline acceptance.

create or replace function public.audit_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log(user_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    lower(tg_op) || '.' || tg_table_name,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists assets_audit_log on public.assets;
create trigger assets_audit_log
after insert or update or delete on public.assets
for each row execute function public.audit_log_changes();

-- =========================================================================
-- Loosen audit_log SELECT so the activity timeline can read entries on
-- assets/floors/tenants the user can view. Original policy was too narrow.
-- =========================================================================

drop policy if exists "audit_log_admin_read" on public.audit_log;

create policy "audit_log_read"
  on public.audit_log for select
  using (
    public.user_can('view_audit_log', 'global', null)
    or (
      entity_type = 'buildings'
      and public.user_can('view_audit_log', 'building', entity_id)
    )
    or (
      -- An entry on an asset is readable iff the user can view that asset.
      entity_type = 'assets'
      and exists (
        select 1
        from public.assets a
        join public.floors f on f.id = a.floor_id
        where a.id = audit_log.entity_id
          and (
            public.user_can('view', 'floor', a.floor_id)
            or public.user_can('view', 'building', f.building_id)
            or (a.tenant_scope_id is not null and public.user_can('view', 'tenant', a.tenant_scope_id))
          )
      )
    )
    or (
      -- Entries on floors readable iff user can view the floor.
      entity_type = 'floors'
      and exists (
        select 1 from public.floors f
        where f.id = audit_log.entity_id
          and (
            public.user_can('view', 'floor', f.id)
            or public.user_can('view', 'building', f.building_id)
          )
      )
    )
  );
