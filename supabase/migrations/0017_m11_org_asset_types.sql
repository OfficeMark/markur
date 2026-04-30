-- M11: customizable asset types per organization.
-- Replaces the static CHECK constraint on assets.type with:
--   * a new org_asset_types table that holds the type catalog
--   * a relaxed format CHECK so arbitrary types can be inserted (the
--     dropdown in the UI still constrains the practical input set)
-- Globals (org_id IS NULL) are visible to every user and seed-populated
-- with the 17 types we had in the old CHECK. Org-specific rows are
-- managed by building admins on a per-organization basis.

create table public.org_asset_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  color text not null,
  category text not null check (category in ('signage', 'facility')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, key),
  constraint org_asset_types_key_format check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint org_asset_types_color_format check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index org_asset_types_org_idx on public.org_asset_types(org_id);

-- Seed the 17 existing types as globals (org_id IS NULL).
insert into public.org_asset_types (org_id, key, label, color, category, sort_order) values
  (null, 'directory',          'Directory',          '#2563EB', 'signage',  10),
  (null, 'tenant_id',           'Tenant ID',          '#7C3AED', 'signage',  20),
  (null, 'wayfinding',          'Wayfinding',         '#059669', 'signage',  30),
  (null, 'tenant_products',     'Tenant products',    '#0D9488', 'signage',  40),
  (null, 'evacuation',          'Evacuation',         '#EA580C', 'signage',  50),
  (null, 'emergency',           'Emergency',          '#DC2626', 'signage',  60),
  (null, 'egress',              'Egress',             '#16A34A', 'signage',  70),
  (null, 'donor_plaque',        'Donor plaque',       '#B45309', 'signage',  80),
  (null, 'donor_wall',          'Donor wall',         '#92400E', 'signage',  90),
  (null, 'nameplate',           'Nameplate',          '#1E40AF', 'signage', 100),
  (null, 'wall_mural',          'Wall mural',         '#BE185D', 'signage', 110),
  (null, 'decorative_feature',  'Decorative feature', '#9F1239', 'signage', 120),
  (null, 'other',               'Other',              '#475569', 'signage', 130),
  (null, 'stairwell',           'Stairwell',          '#15803D', 'facility', 200),
  (null, 'service_room',        'Service room',       '#334155', 'facility', 210),
  (null, 'utility_room',        'Utility room',       '#6D28D9', 'facility', 220);

alter table public.assets drop constraint if exists assets_type_check;
alter table public.assets
  add constraint assets_type_format check (type ~ '^[a-z][a-z0-9_]*$');

alter table public.org_asset_types enable row level security;

create policy "org_asset_types_select_authenticated"
  on public.org_asset_types for select
  using (auth.uid() is not null);

create policy "org_asset_types_super_write_globals"
  on public.org_asset_types for all
  using (org_id is null and public.user_can('configure', 'global', null))
  with check (org_id is null and public.user_can('configure', 'global', null));

create policy "org_asset_types_org_admin_write"
  on public.org_asset_types for all
  using (
    org_id is not null
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
            where b.owner_org_id = org_asset_types.org_id
              and b.deleted_at is null
          )
      )
    )
  )
  with check (
    org_id is not null
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
            where b.owner_org_id = org_asset_types.org_id
              and b.deleted_at is null
          )
      )
    )
  );
