-- Waymarks initial schema. Tables and shared trigger functions.
-- Forward-only: no DROP statements. RLS is enabled in 0003.

-- =========================================================================
-- Shared trigger functions
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_pin_coords()
returns trigger
language plpgsql
as $$
begin
  if new.x < 0 or new.x > 1 or new.y < 0 or new.y > 1 then
    raise exception 'Pin coordinates must be normalized 0..1 (got x=%, y=%)', new.x, new.y;
  end if;
  return new;
end;
$$;

-- =========================================================================
-- organizations  (must come before buildings — owner_org_id FK)
-- =========================================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'free' check (plan in ('free','pro','enterprise')),
  created_at timestamptz not null default now()
);

-- =========================================================================
-- profiles  (1-1 with auth.users)
-- =========================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth.users row arrives.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================================
-- buildings
-- =========================================================================

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null,
  region text,
  country text not null default 'CA',
  total_floors integer not null,
  owner_org_id uuid references public.organizations(id),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index buildings_owner_org_idx on public.buildings(owner_org_id);

create trigger buildings_set_updated_at
before update on public.buildings
for each row execute function public.set_updated_at();

-- =========================================================================
-- floors
-- =========================================================================

create table public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  label text not null,
  sort_order integer not null,
  plan_url text,
  plan_metadata jsonb,
  width_px integer,
  height_px integer,
  audit_cycle_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (building_id, sort_order)
);

create index floors_building_idx on public.floors(building_id) where deleted_at is null;

create trigger floors_set_updated_at
before update on public.floors
for each row execute function public.set_updated_at();

-- =========================================================================
-- tenants  (must come before assets — tenant_scope_id FK)
-- =========================================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  suite_label text,
  primary_floor_id uuid references public.floors(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tenants_building_idx on public.tenants(building_id) where deleted_at is null;

-- =========================================================================
-- assets
-- =========================================================================

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors(id) on delete cascade,
  type text not null check (type in (
    'directory','tenant_id','egress','stairwell','service_room','other',
    'wayfinding','tenant_products','utility_room','emergency','evacuation'
  )),
  category text not null check (category in ('signage','facility')),
  name text not null,
  location_notes text,
  x numeric(8,4) not null,
  y numeric(8,4) not null,
  photo_url text,
  manufacturer text,
  installed_at date,
  audit_cycle_days integer,
  status text not null default 'good' check (status in ('good','attention','flagged')),
  tenant_scope_id uuid references public.tenants(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index assets_floor_idx on public.assets(floor_id) where deleted_at is null;
create index assets_tenant_idx on public.assets(tenant_scope_id);

create trigger assets_set_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

create trigger assets_validate_pin_coords
before insert or update on public.assets
for each row execute function public.validate_pin_coords();

-- =========================================================================
-- audit_sessions / audit_events
-- =========================================================================

create table public.audit_sessions (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors(id) on delete cascade,
  auditor_id uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  assets_total integer not null default 0,
  assets_audited integer not null default 0,
  assets_missed integer not null default 0,
  notes text
);

create index audit_sessions_floor_idx on public.audit_sessions(floor_id);
create index audit_sessions_auditor_idx on public.audit_sessions(auditor_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.audit_sessions(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  outcome text not null check (outcome in ('confirmed','flagged','skipped')),
  photo_url text,
  notes text,
  created_at timestamptz not null default now()
);

create index audit_events_session_idx on public.audit_events(session_id);
create index audit_events_asset_idx on public.audit_events(asset_id);

-- =========================================================================
-- flags
-- =========================================================================

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  raised_by uuid not null references auth.users(id),
  severity text not null default 'normal' check (severity in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','dismissed')),
  description text not null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index flags_asset_idx on public.flags(asset_id);
create index flags_status_idx on public.flags(status);

-- =========================================================================
-- access_grants
-- =========================================================================

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','building_admin','auditor','tenant_rep')),
  scope_type text not null check (scope_type in ('global','organization','building','floor','tenant')),
  scope_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);

create index access_grants_user_idx on public.access_grants(user_id);
create index access_grants_scope_idx on public.access_grants(scope_type, scope_id);

-- =========================================================================
-- audit_log
-- =========================================================================

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index audit_log_user_idx on public.audit_log(user_id);
create index audit_log_created_idx on public.audit_log(created_at desc);

-- =========================================================================
-- pending_invitations
-- =========================================================================

create table public.pending_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null,
  scope_type text not null,
  scope_id uuid,
  invited_by uuid not null references auth.users(id),
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index pending_invitations_email_idx on public.pending_invitations(email);
create index pending_invitations_token_idx on public.pending_invitations(token);
