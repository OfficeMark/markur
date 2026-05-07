-- M16: per-org branding (logo, accent color, display-name override).
--
-- Lets a building admin upload their org's logo, set an accent color,
-- and override how the org name appears in the app + on outgoing
-- comms. Used by the top-nav co-branding ("Markur · for [Org Name]"),
-- the PDF export header, and (future) the invitation email template.
--
-- Storage layout: org-logos/<org_id>.<ext>. Public bucket so the
-- logo URLs work in PDFs and email without signed-URL plumbing —
-- logos are not sensitive (they're brand assets).

-- =========================================================================
-- org_branding table
-- =========================================================================

create table public.org_branding (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  logo_path text,
  accent_color text,
  display_name_override text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_branding_color_format check (
    accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create trigger set_updated_at_org_branding
  before update on public.org_branding
  for each row execute function public.set_updated_at();

alter table public.org_branding enable row level security;

-- Anyone authenticated can read - branding is meant to be visible.
create policy "org_branding_select_authenticated"
  on public.org_branding for select
  using (auth.uid() is not null);

-- Building admins can write their own org's row; super_admin can write any.
create policy "org_branding_admin_write"
  on public.org_branding for all
  using (
    public.user_can('configure', 'global', null)
    or exists (
      select 1
      from public.access_grants ag
      where ag.user_id = auth.uid()
        and ag.role = 'building_admin'
        and ag.scope_type = 'building'
        and ag.scope_id in (
          select b.id from public.buildings b
          where b.owner_org_id = org_branding.org_id
            and b.deleted_at is null
        )
    )
  )
  with check (
    public.user_can('configure', 'global', null)
    or exists (
      select 1
      from public.access_grants ag
      where ag.user_id = auth.uid()
        and ag.role = 'building_admin'
        and ag.scope_type = 'building'
        and ag.scope_id in (
          select b.id from public.buildings b
          where b.owner_org_id = org_branding.org_id
            and b.deleted_at is null
        )
    )
  );

-- =========================================================================
-- org-logos storage bucket
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-logos',
  'org-logos',
  true,                            -- public read; logos aren't sensitive
  2097152,                         -- 2 MB
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = excluded.public;

-- Helper: extract org_id from object name (e.g. "<uuid>.png" -> uuid).
create or replace function public.storage_org_logo_org_id(p_name text)
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

-- Storage policies (only when the table is empty - apply once)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'org_logos_public_read'
  ) then
    create policy "org_logos_public_read"
      on storage.objects for select
      using (bucket_id = 'org-logos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'org_logos_admin_write'
  ) then
    create policy "org_logos_admin_write"
      on storage.objects for all
      using (
        bucket_id = 'org-logos'
        and (
          public.user_can('configure', 'global', null)
          or exists (
            select 1
            from public.access_grants ag
            where ag.user_id = auth.uid()
              and ag.role = 'building_admin'
              and ag.scope_type = 'building'
              and ag.scope_id in (
                select b.id from public.buildings b
                where b.owner_org_id = public.storage_org_logo_org_id(storage.objects.name)
                  and b.deleted_at is null
              )
          )
        )
      )
      with check (
        bucket_id = 'org-logos'
        and (
          public.user_can('configure', 'global', null)
          or exists (
            select 1
            from public.access_grants ag
            where ag.user_id = auth.uid()
              and ag.role = 'building_admin'
              and ag.scope_type = 'building'
              and ag.scope_id in (
                select b.id from public.buildings b
                where b.owner_org_id = public.storage_org_logo_org_id(storage.objects.name)
                  and b.deleted_at is null
              )
          )
        )
      );
  end if;
end$$;
