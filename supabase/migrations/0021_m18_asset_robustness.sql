-- M18: asset window robustness — extra metadata fields + attachments.
--
-- Adds room_number, notes, vendor_contact to assets so the drawer can
-- capture more context per pin. All new fields are nullable; the M18
-- UI also drops form-level required validation on existing optional
-- fields per Randy's directive ("everything optional"). The NOT NULL
-- columns at the DB level (type, name, x, y, floor_id, category) stay
-- because they are physically required to render and identify a pin.
--
-- Adds asset_attachments table for PDFs and other files attached to
-- a pin (vendor cut sheets, install instructions, warranty PDFs).
-- Mirrors asset_photos pattern. Storage bucket asset-attachments
-- backs it, with policies parallel to asset_photos.

-- =========================================================================
-- assets — extra metadata
-- =========================================================================

alter table public.assets
  add column if not exists room_number text,
  add column if not exists notes text,
  add column if not exists vendor_contact jsonb;

-- vendor_contact is jsonb so a single field can capture name + email +
-- phone + company without three more columns. Sample shape:
--   { "name": "Acme Sign Co.", "email": "service@acme.com", "phone": "..." }

-- Soft constraint — keep notes from being abused as a 50KB blob in
-- the drawer.
alter table public.assets
  drop constraint if exists assets_notes_length;
alter table public.assets
  add constraint assets_notes_length check (notes is null or char_length(notes) <= 4000);

alter table public.assets
  drop constraint if exists assets_room_number_length;
alter table public.assets
  add constraint assets_room_number_length check (room_number is null or char_length(room_number) <= 80);

-- =========================================================================
-- asset_attachments table
-- =========================================================================

create table if not exists public.asset_attachments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint asset_attachments_size_max check (size_bytes <= 26214400),  -- 25 MB
  constraint asset_attachments_filename_length check (char_length(filename) <= 200)
);

create index if not exists asset_attachments_asset_idx
  on public.asset_attachments(asset_id);

alter table public.asset_attachments enable row level security;

-- Read: any user with view rights on the asset's floor can see attachments.
create policy "asset_attachments_read"
  on public.asset_attachments for select
  using (
    exists (
      select 1 from public.assets a
      where a.id = asset_attachments.asset_id
        and public.user_can('view', 'floor', a.floor_id)
    )
  );

-- Write: edit rights on the parent building.
create policy "asset_attachments_write"
  on public.asset_attachments for all
  using (
    exists (
      select 1 from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = asset_attachments.asset_id
        and public.user_can('edit', 'building', f.building_id)
    )
  )
  with check (
    exists (
      select 1 from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = asset_attachments.asset_id
        and public.user_can('edit', 'building', f.building_id)
    )
  );

-- =========================================================================
-- asset-attachments storage bucket
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-attachments',
  'asset-attachments',
  false,                           -- private; signed URLs only
  26214400,                        -- 25 MB
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = excluded.public;

-- Helper: extract asset_id from object name.
-- Layout: asset-attachments/<asset_id>/<random>.<ext>
create or replace function public.storage_asset_attachment_asset_id(p_name text)
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

-- Storage policies (apply once)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'asset_attachments_read'
  ) then
    create policy "asset_attachments_read"
      on storage.objects for select
      using (
        bucket_id = 'asset-attachments'
        and exists (
          select 1
          from public.assets a
          where a.id = public.storage_asset_attachment_asset_id(storage.objects.name)
            and public.user_can('view', 'floor', a.floor_id)
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'asset_attachments_write'
  ) then
    create policy "asset_attachments_write"
      on storage.objects for all
      using (
        bucket_id = 'asset-attachments'
        and exists (
          select 1
          from public.assets a
          join public.floors f on f.id = a.floor_id
          where a.id = public.storage_asset_attachment_asset_id(storage.objects.name)
            and public.user_can('edit', 'building', f.building_id)
        )
      )
      with check (
        bucket_id = 'asset-attachments'
        and exists (
          select 1
          from public.assets a
          join public.floors f on f.id = a.floor_id
          where a.id = public.storage_asset_attachment_asset_id(storage.objects.name)
            and public.user_can('edit', 'building', f.building_id)
        )
      );
  end if;
end$$;
