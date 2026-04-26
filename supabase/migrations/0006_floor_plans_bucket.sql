-- Floor plan storage bucket + RLS-equivalent storage policies.
--
-- Layout: floor-plans/{floor_id}.{ext} — replacing a plan overwrites the
-- single object for that floor. Pins live in public.assets keyed by
-- floor_id so they survive a plan replacement.
--
-- Constraints:
--   * Private (no public links). Authenticated users with `view` on the floor
--     can read; users with `upload_plan` on the parent building can write.
--   * 25 MB cap.
--   * Allowed MIME: PDF, PNG, JPG/JPEG.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'floor-plans',
  'floor-plans',
  false,
  26214400,                       -- 25 MB
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = excluded.public;

-- Helper: extract floor_id from an object name. We expect names like
-- "<uuid>.pdf" or "<uuid>.png" — the prefix before the first dot is the floor id.
create or replace function public.storage_floor_plan_floor_id(p_name text)
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

-- RLS policies on storage.objects, scoped to bucket_id = 'floor-plans'.

drop policy if exists "floor_plans_read"   on storage.objects;
drop policy if exists "floor_plans_insert" on storage.objects;
drop policy if exists "floor_plans_update" on storage.objects;
drop policy if exists "floor_plans_delete" on storage.objects;

create policy "floor_plans_read"
  on storage.objects for select
  using (
    bucket_id = 'floor-plans'
    and exists (
      select 1 from public.floors f
      where f.id = public.storage_floor_plan_floor_id(name)
        and (
          public.user_can('view', 'floor', f.id)
          or public.user_can('view', 'building', f.building_id)
        )
    )
  );

create policy "floor_plans_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'floor-plans'
    and exists (
      select 1 from public.floors f
      where f.id = public.storage_floor_plan_floor_id(name)
        and public.user_can('upload_plan', 'building', f.building_id)
    )
  );

create policy "floor_plans_update"
  on storage.objects for update
  using (
    bucket_id = 'floor-plans'
    and exists (
      select 1 from public.floors f
      where f.id = public.storage_floor_plan_floor_id(name)
        and public.user_can('upload_plan', 'building', f.building_id)
    )
  )
  with check (
    bucket_id = 'floor-plans'
    and exists (
      select 1 from public.floors f
      where f.id = public.storage_floor_plan_floor_id(name)
        and public.user_can('upload_plan', 'building', f.building_id)
    )
  );

create policy "floor_plans_delete"
  on storage.objects for delete
  using (
    bucket_id = 'floor-plans'
    and exists (
      select 1 from public.floors f
      where f.id = public.storage_floor_plan_floor_id(name)
        and public.user_can('upload_plan', 'building', f.building_id)
    )
  );
