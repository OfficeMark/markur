-- M14: per-org overrides on the global asset-type catalog.
--
-- M11 introduced per-org additions (rows with org_id set) but the 17
-- seeded globals (org_id IS NULL) stayed read-only to org admins. This
-- migration adds an overrides table that lets a building admin tweak
-- a global's label, color, sort order, or hide it entirely - without
-- touching the underlying global row (other orgs continue to see the
-- baseline). The frontend merges global + override + org-specific into
-- the effective catalog.
--
-- Reuses public.set_updated_at() defined in 0001_init.sql.

create table public.org_asset_type_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  global_key text not null,
  hidden boolean not null default false,
  label_override text,
  color_override text,
  sort_order_override integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, global_key),
  constraint override_color_format check (
    color_override is null or color_override ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint override_key_format check (global_key ~ '^[a-z][a-z0-9_]*$')
);

create index org_asset_type_overrides_org_idx
  on public.org_asset_type_overrides(org_id);

create trigger set_updated_at_org_asset_type_overrides
  before update on public.org_asset_type_overrides
  for each row execute function public.set_updated_at();

alter table public.org_asset_type_overrides enable row level security;

-- Anyone authenticated can read overrides; the per-org write policy
-- below ensures only admins of THAT org can mutate.
create policy "overrides_select_authenticated"
  on public.org_asset_type_overrides for select
  using (auth.uid() is not null);

create policy "overrides_admin_write"
  on public.org_asset_type_overrides for all
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
          where b.owner_org_id = org_asset_type_overrides.org_id
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
          where b.owner_org_id = org_asset_type_overrides.org_id
            and b.deleted_at is null
        )
    )
  );

-- Allow building admins to UPDATE their own org-specific rows in
-- org_asset_types (M11 only granted INSERT/DELETE through the broad
-- "for all" policy; UPDATE was implicit but the dropdown UI never wired
-- it up). M14 adds inline edit, so the policy already permits it - this
-- is a no-op DDL just to verify on apply that the policy is intact.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'org_asset_types'
      and policyname = 'org_asset_types_org_admin_write'
  ) then
    raise exception 'expected org_asset_types_org_admin_write policy from 0017 - missing';
  end if;
end$$;
