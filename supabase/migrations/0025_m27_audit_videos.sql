-- =========================================================================
-- M27: short field-clip video recording for audits
-- =========================================================================
--
-- Owner records short video clips on mobile during a building walk. Clips
-- can attach to a specific asset (the pin currently selected) or to the
-- whole building (no asset selected). They are always scoped to one
-- building.
--
-- A separate table from `asset_attachments` because:
--   * the recording flow is media-stream driven (MediaRecorder), not file
--     picker, so we want a clear surface
--   * building-level clips have no asset_id at all
--   * playback uses a dedicated signed-URL path that lives outside the
--     attachments bucket policy
--
-- Storage bucket: audit-videos
--   Path scheme: <building_id>/<video_id>.<ext>
--   Private (signed URLs only).
-- =========================================================================

create table public.audit_videos (
  id               uuid primary key default gen_random_uuid(),
  building_id      uuid not null references public.buildings(id) on delete cascade,
  asset_id         uuid references public.assets(id) on delete cascade,
  storage_path     text not null unique,
  duration_seconds integer,
  recorded_at      timestamptz not null default now(),
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  constraint audit_videos_duration_sane
    check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 600)),
  constraint audit_videos_notes_length
    check (notes is null or char_length(notes) <= 4000)
);

create index audit_videos_building_idx on public.audit_videos(building_id, recorded_at desc);
create index audit_videos_asset_idx    on public.audit_videos(asset_id) where asset_id is not null;

-- Guard: when asset_id is set, the asset must belong to the same building.
-- Cheaper than a CHECK with a subquery (which Postgres won't allow anyway)
-- and keeps the integrity invariant inside the database.
create or replace function public.audit_videos_assert_asset_building()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_asset_building uuid;
begin
  if new.asset_id is null then
    return new;
  end if;
  select f.building_id into v_asset_building
    from public.assets a
    join public.floors f on f.id = a.floor_id
    where a.id = new.asset_id;
  if v_asset_building is null then
    raise exception 'audit_videos.asset_id % not found', new.asset_id;
  end if;
  if v_asset_building <> new.building_id then
    raise exception 'audit_videos.asset_id % does not belong to building %', new.asset_id, new.building_id;
  end if;
  return new;
end
$$;

drop trigger if exists audit_videos_assert_asset_building on public.audit_videos;
create trigger audit_videos_assert_asset_building
before insert or update on public.audit_videos
for each row execute function public.audit_videos_assert_asset_building();

-- Activity timeline: log inserts/updates/deletes through the shared trigger.
drop trigger if exists audit_videos_audit_log on public.audit_videos;
create trigger audit_videos_audit_log
after insert or update or delete on public.audit_videos
for each row execute function public.audit_log_changes();

alter table public.audit_videos enable row level security;

-- Visible to anyone who can view the building (covers asset-level too: if
-- you can view the building you can see any asset on it).
create policy "audit_videos_view"
  on public.audit_videos for select
  using (
    public.user_can('view', 'building', audit_videos.building_id)
  );

-- Insert/update/delete: edit on the building. Same gate as asset photos /
-- attachments — building admins + super admins write.
create policy "audit_videos_write"
  on public.audit_videos for all
  using (
    public.user_can('edit', 'building', audit_videos.building_id)
  )
  with check (
    public.user_can('edit', 'building', audit_videos.building_id)
  );

-- =========================================================================
-- Storage bucket + policies
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audit-videos',
  'audit-videos',
  false,
  104857600, -- 100 MB; clips capped at 3 min at 1.5 Mbps run ~34 MB
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = excluded.public;

-- Extract <building_id> from storage path `<building_id>/<anything>`.
create or replace function public.storage_audit_video_building_id(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when p_name ~ '^[0-9a-fA-F-]{36}/'
      then substring(p_name from 1 for 36)::uuid
    else null
  end
$$;

drop policy if exists "audit_videos_storage_read"   on storage.objects;
drop policy if exists "audit_videos_storage_insert" on storage.objects;
drop policy if exists "audit_videos_storage_update" on storage.objects;
drop policy if exists "audit_videos_storage_delete" on storage.objects;

create policy "audit_videos_storage_read"
  on storage.objects for select
  using (
    bucket_id = 'audit-videos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_audit_video_building_id(storage.objects.name)
        and public.user_can('view', 'building', b.id)
    )
  );

create policy "audit_videos_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'audit-videos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_audit_video_building_id(storage.objects.name)
        and public.user_can('edit', 'building', b.id)
    )
  );

create policy "audit_videos_storage_update"
  on storage.objects for update
  using (
    bucket_id = 'audit-videos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_audit_video_building_id(storage.objects.name)
        and public.user_can('edit', 'building', b.id)
    )
  )
  with check (
    bucket_id = 'audit-videos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_audit_video_building_id(storage.objects.name)
        and public.user_can('edit', 'building', b.id)
    )
  );

create policy "audit_videos_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'audit-videos'
    and exists (
      select 1 from public.buildings b
      where b.id = public.storage_audit_video_building_id(storage.objects.name)
        and public.user_can('edit', 'building', b.id)
    )
  );
