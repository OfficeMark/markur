-- =========================================================================
-- M34 — Contacts + Vendors directory (Phase 0) and its consumers (items 1, 2, 4)
--
-- ⚠️  RECORD ONLY — already APPLIED to project `drclmnqlurvwqpnnpgzb` by Claude
--     (chat). Do NOT `supabase db push` and do NOT re-apply. Local migrations
--     0001–0030 do not match the remote `schema_migrations` timestamps, so a
--     push is unsafe. This file records the applied M34 layer; the per-building
--     M34b layer is in 0032_m34b_building_scope.sql. The script is idempotent
--     (if-not-exists / or-replace / guarded do-blocks).
--
-- What it creates:
--   * contacts  — people / departments (org-scoped), used by item 1.
--   * vendors   — suppliers (org-scoped), used by items 2 & 3.
--   * asset_vendors — many-to-many link of assets ↔ vendors (item 2).
--   * assets.contact_id, flags.contact_id — the contact picked on a pin / flag
--     (item 1). Stored as the contact id; the email is resolved at use-time so
--     edits to the contact propagate.
--   * Two RLS helpers (user_in_org / user_can_admin_org) that mirror the
--     existing org-membership pattern used by org_branding + user_can.
--   * A one-time data migration of the existing single `vendor_contact` JSON
--     blob into vendors + asset_vendors. The vendor_contact column is left in
--     place (deprecated, unused by the UI) so no data is lost.
-- =========================================================================

-- -------------------------------------------------------------------------
-- RLS helpers
-- -------------------------------------------------------------------------

-- Read membership: super_admin (global), an organization-scoped grant on the
-- org, or a building-scoped grant on any building the org owns.
create or replace function public.user_in_org(p_org_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_org_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.access_grants
    where user_id = v_user and role = 'super_admin'
      and (expires_at is null or expires_at > now())
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.access_grants
    where user_id = v_user and scope_type = 'organization' and scope_id = p_org_id
      and (expires_at is null or expires_at > now())
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.access_grants ag
    join public.buildings b on b.id = ag.scope_id
    where ag.user_id = v_user
      and ag.scope_type = 'building'
      and b.owner_org_id = p_org_id
      and b.deleted_at is null
      and (ag.expires_at is null or ag.expires_at > now())
  );
end;
$$;

-- Write authority: super_admin, or a building_admin grant on the org (either an
-- organization-scoped grant or a building-scoped grant on a building it owns).
create or replace function public.user_can_admin_org(p_org_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_org_id is null then
    return false;
  end if;

  -- super_admin short-circuit (user_can('configure','global',null) is true only for super_admin).
  if public.user_can('configure', 'global', null) then
    return true;
  end if;

  if exists (
    select 1 from public.access_grants
    where user_id = v_user and role = 'building_admin'
      and scope_type = 'organization' and scope_id = p_org_id
      and (expires_at is null or expires_at > now())
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.access_grants ag
    join public.buildings b on b.id = ag.scope_id
    where ag.user_id = v_user
      and ag.role = 'building_admin'
      and ag.scope_type = 'building'
      and b.owner_org_id = p_org_id
      and b.deleted_at is null
      and (ag.expires_at is null or ag.expires_at > now())
  );
end;
$$;

-- -------------------------------------------------------------------------
-- contacts (people / departments)
-- -------------------------------------------------------------------------

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'person' check (kind in ('person', 'department')),
  label text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contacts_label_length check (char_length(label) <= 160),
  constraint contacts_email_length check (email is null or char_length(email) <= 200)
);

create index if not exists contacts_org_idx
  on public.contacts(owner_org_id) where deleted_at is null;

drop trigger if exists set_updated_at_contacts on public.contacts;
create trigger set_updated_at_contacts
  before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;

drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts for select
  using (public.user_in_org(owner_org_id));

drop policy if exists "contacts_write" on public.contacts;
create policy "contacts_write" on public.contacts for all
  using (public.user_can_admin_org(owner_org_id))
  with check (public.user_can_admin_org(owner_org_id));

-- -------------------------------------------------------------------------
-- vendors (suppliers)
-- -------------------------------------------------------------------------
-- `phone` is not in the original Phase-0 column list; it exists only to
-- preserve any phone number already captured in the legacy vendor_contact
-- blob during the data migration below. The UI treats it as optional.

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text,
  url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint vendors_name_length check (char_length(name) <= 160),
  constraint vendors_email_length check (email is null or char_length(email) <= 200),
  constraint vendors_url_length check (url is null or char_length(url) <= 500)
);

create index if not exists vendors_org_idx
  on public.vendors(owner_org_id) where deleted_at is null;

drop trigger if exists set_updated_at_vendors on public.vendors;
create trigger set_updated_at_vendors
  before update on public.vendors
  for each row execute function public.set_updated_at();

alter table public.vendors enable row level security;

drop policy if exists "vendors_select" on public.vendors;
create policy "vendors_select" on public.vendors for select
  using (public.user_in_org(owner_org_id));

drop policy if exists "vendors_write" on public.vendors;
create policy "vendors_write" on public.vendors for all
  using (public.user_can_admin_org(owner_org_id))
  with check (public.user_can_admin_org(owner_org_id));

-- -------------------------------------------------------------------------
-- asset_vendors (many-to-many: an asset can reference multiple vendors)
-- -------------------------------------------------------------------------

create table if not exists public.asset_vendors (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  owner_org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (asset_id, vendor_id)
);

create index if not exists asset_vendors_asset_idx on public.asset_vendors(asset_id);
create index if not exists asset_vendors_vendor_idx on public.asset_vendors(vendor_id);

alter table public.asset_vendors enable row level security;

-- Read: anyone who can view the asset's floor, or any member of the owning org.
drop policy if exists "asset_vendors_read" on public.asset_vendors;
create policy "asset_vendors_read" on public.asset_vendors for select
  using (
    exists (
      select 1 from public.assets a
      where a.id = asset_vendors.asset_id
        and public.user_can('view', 'floor', a.floor_id)
    )
    or public.user_in_org(owner_org_id)
  );

-- Write: edit rights on the asset's building (mirrors asset_attachments).
drop policy if exists "asset_vendors_write" on public.asset_vendors;
create policy "asset_vendors_write" on public.asset_vendors for all
  using (
    exists (
      select 1 from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = asset_vendors.asset_id
        and public.user_can('edit', 'building', f.building_id)
    )
  )
  with check (
    exists (
      select 1 from public.assets a
      join public.floors f on f.id = a.floor_id
      where a.id = asset_vendors.asset_id
        and public.user_can('edit', 'building', f.building_id)
    )
  );

-- -------------------------------------------------------------------------
-- item 1 — contact_id on assets (pins) and flags
-- -------------------------------------------------------------------------

alter table public.assets
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

alter table public.flags
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

-- -------------------------------------------------------------------------
-- one-time data migration: vendor_contact JSON -> vendors + asset_vendors
-- (re-runnable; reuses an existing vendor per org+name and skips existing links)
-- -------------------------------------------------------------------------

do $$
declare
  r record;
  v_org uuid;
  v_vendor_id uuid;
  v_name text;
  v_email text;
  v_url text;
  v_phone text;
begin
  for r in
    select a.id as asset_id, a.vendor_contact, b.owner_org_id
    from public.assets a
    join public.floors f on f.id = a.floor_id
    join public.buildings b on b.id = f.building_id
    where a.vendor_contact is not null
      and a.deleted_at is null
      and b.owner_org_id is not null
  loop
    v_name  := coalesce(nullif(btrim(r.vendor_contact->>'name'), ''),
                        nullif(btrim(r.vendor_contact->>'company'), ''));
    v_email := nullif(btrim(r.vendor_contact->>'email'), '');
    v_url   := nullif(btrim(r.vendor_contact->>'url'), '');
    v_phone := nullif(btrim(r.vendor_contact->>'phone'), '');

    -- Skip empty / meaningless blobs.
    if v_name is null and v_email is null and v_url is null and v_phone is null then
      continue;
    end if;
    if v_name is null then
      v_name := coalesce(v_email, v_url, 'Vendor');
    end if;

    v_org := r.owner_org_id;

    select id into v_vendor_id
    from public.vendors
    where owner_org_id = v_org
      and lower(name) = lower(v_name)
      and deleted_at is null
    limit 1;

    if v_vendor_id is null then
      insert into public.vendors (owner_org_id, name, email, url, phone)
      values (v_org, v_name, v_email, v_url, v_phone)
      returning id into v_vendor_id;
    end if;

    insert into public.asset_vendors (asset_id, vendor_id, owner_org_id)
    values (r.asset_id, v_vendor_id, v_org)
    on conflict (asset_id, vendor_id) do nothing;
  end loop;
end $$;
