# 03 — Data model

The Postgres schema, relationships, and Row-Level Security (RLS) policies. Implemented as Supabase migrations under `supabase/migrations/`.

## Naming conventions

- Tables: `snake_case`, plural (`buildings`, `floors`, `assets`).
- Columns: `snake_case`. Primary keys: `id` (uuid). Foreign keys: `<table_singular>_id`.
- Timestamps: `created_at`, `updated_at` (managed by triggers).
- Soft deletes: `deleted_at` (nullable timestamp). Hard deletes only by super admins.

## Schema

### `users` (managed by Supabase Auth — see `auth.users`)

We don't recreate the auth table. We add a `public.profiles` table for application-specific data tied to each auth user.

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Trigger: on `auth.users` insert, create a `profiles` row.

### `buildings`

```sql
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null,
  region text,                          -- province/state
  country text not null default 'CA',
  total_floors integer not null,
  owner_org_id uuid references public.organizations(id),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index buildings_owner_org_idx on buildings(owner_org_id);
```

`settings` JSON example:

```json
{
  "default_audit_cycle_days": 90,
  "default_pin_color": "amber",
  "logo_url": null,
  "tenant_can_flag": true
}
```

### `organizations`

The customer entity (e.g., "Officemark Inc."). Owns one or more buildings.

```sql
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'free' check (plan in ('free','building','portfolio','enterprise')),
  created_at timestamptz not null default now()
);
```

### `floors`

```sql
create table public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  label text not null,                  -- "Ground", "Floor 2", "B1", "Mezz"
  sort_order integer not null,          -- canonical order for display
  plan_url text,                        -- Supabase Storage path
  plan_metadata jsonb,                  -- {detected_building, detected_floor, page_count, ...}
  width_px integer,                     -- rendered floor plan dimensions (for pin coords)
  height_px integer,
  audit_cycle_days integer,             -- per-floor override; falls back to building setting
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (building_id, sort_order)
);

create index floors_building_idx on floors(building_id) where deleted_at is null;
```

### `assets` (the pins on the plan)

```sql
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors(id) on delete cascade,
  type text not null check (type in (
    'directory','tenant_id','egress','stairwell','service_room','other',
    'wayfinding','tenant_products','utility_room','emergency','evacuation'
  )),
  category text not null check (category in ('signage','facility')),
  name text not null,
  location_notes text,                  -- "East elevator lobby"
  x numeric(8,4) not null,              -- 0.0–1.0 normalized to floor plan width
  y numeric(8,4) not null,              -- 0.0–1.0 normalized
  photo_url text,
  manufacturer text,
  installed_at date,
  audit_cycle_days integer,             -- per-asset override
  status text not null default 'good' check (status in ('good','attention','flagged')),
  tenant_scope_id uuid references public.tenants(id), -- if visible to a specific tenant
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index assets_floor_idx on assets(floor_id) where deleted_at is null;
create index assets_tenant_idx on assets(tenant_scope_id);
```

Pin coordinates are stored as normalized 0–1 floats so the same data renders correctly regardless of how the floor plan is scaled or zoomed.

### `tenants`

```sql
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  suite_label text,                     -- "1306", "Penthouse"
  primary_floor_id uuid references public.floors(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

### `audit_sessions` and `audit_events`

An audit session is one walkaround. It contains many events (one per asset audited or skipped).

```sql
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

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.audit_sessions(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  outcome text not null check (outcome in ('confirmed','flagged','skipped')),
  photo_url text,
  notes text,
  created_at timestamptz not null default now()
);

create index audit_events_session_idx on audit_events(session_id);
create index audit_events_asset_idx on audit_events(asset_id);
```

### `flags`

User-raised issues on assets. Different from audit-time flags (which are events) — these are persistent issues that have a lifecycle.

```sql
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
```

### `access_grants` (the permission table)

Who can do what to which scope. This is the heart of the role model.

```sql
create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','building_admin','auditor','tenant_rep')),
  scope_type text not null check (scope_type in ('global','organization','building','floor','tenant')),
  scope_id uuid,                        -- null for global; otherwise the FK to the scope row
  expires_at timestamptz,               -- optional time-bounded access
  created_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);

create index access_grants_user_idx on access_grants(user_id);
create index access_grants_scope_idx on access_grants(scope_type, scope_id);
```

Examples:

| user_id | role | scope_type | scope_id |
|---|---|---|---|
| randy@officemark.ca | super_admin | global | null |
| pm@161bay.com | building_admin | building | <bay-uuid> |
| auditor@firm.com | auditor | floor | <floor-2-uuid> |
| tenant@suite1306.com | tenant_rep | tenant | <tenant-1306-uuid> |

### `audit_log`

Every mutation in the system writes a row here. Source of truth for security and debugging.

```sql
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,                 -- 'asset.update', 'pin.move', 'access.grant'
  entity_type text not null,            -- 'asset', 'floor', 'building', 'access_grant'
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log(entity_type, entity_id);
create index audit_log_user_idx on audit_log(user_id);
create index audit_log_created_idx on audit_log(created_at desc);
```

Populated by Postgres triggers on every insert/update/delete on `assets`, `floors`, `buildings`, `access_grants`, `flags`. See `supabase/migrations/0030_audit_log_triggers.sql`.

### `pending_invitations`

```sql
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
```

### `pending_writes` (client-side only — Dexie, not Postgres)

Stored in IndexedDB on the device. Not synced as a table — these *are* the unsynced writes waiting to be pushed.

```ts
// Dexie schema
{
  id: string;                  // uuid generated client-side
  entity_type: 'asset' | 'audit_event' | 'flag' | ...;
  operation: 'create' | 'update' | 'delete';
  entity_id: string;
  payload: object;             // the change
  attempted_at: number[];      // timestamps of sync attempts
  status: 'pending' | 'syncing' | 'conflict' | 'failed';
  created_at: number;
}
```

## Row-Level Security (RLS)

Every table is RLS-enabled. Policies enforce the role model. Below is the policy *pattern* — full SQL is generated and lives in `supabase/migrations/`.

```sql
alter table public.assets enable row level security;
```

Helper function — checks if the current user has the given capability on the given scope:

```sql
create or replace function public.user_can(
  p_capability text,
  p_scope_type text,
  p_scope_id uuid
) returns boolean as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;

  -- Super admin sees everything
  if exists (
    select 1 from access_grants
    where user_id = v_user and role = 'super_admin'
  ) then return true; end if;

  -- Capability check based on role + scope
  return exists (
    select 1 from access_grants ag
    where ag.user_id = v_user
      and (ag.expires_at is null or ag.expires_at > now())
      and (
        (ag.scope_type = 'building' and p_scope_type = 'building' and ag.scope_id = p_scope_id and ag.role = 'building_admin')
        or (ag.scope_type = 'floor' and p_scope_type = 'floor' and ag.scope_id = p_scope_id and ag.role = 'auditor' and p_capability in ('view','audit','flag'))
        or (ag.scope_type = 'tenant' and p_scope_type = 'tenant' and ag.scope_id = p_scope_id and ag.role = 'tenant_rep' and p_capability in ('view','flag'))
        -- ... more rules
      )
  );
end;
$$ language plpgsql security definer stable;
```

Example policy on `assets`:

```sql
-- Read: see assets on floors/buildings/tenants you have access to
create policy "assets_read" on public.assets for select using (
  user_can('view', 'building', (select building_id from floors where id = assets.floor_id))
  or user_can('view', 'floor', floor_id)
  or (tenant_scope_id is not null and user_can('view', 'tenant', tenant_scope_id))
);

-- Insert: building admins and super admins only
create policy "assets_insert" on public.assets for insert with check (
  user_can('edit', 'building', (select building_id from floors where id = assets.floor_id))
);

-- Update: same
create policy "assets_update" on public.assets for update using (
  user_can('edit', 'building', (select building_id from floors where id = assets.floor_id))
);

-- Delete: same, but with audit_log triggered
create policy "assets_delete" on public.assets for delete using (
  user_can('delete', 'building', (select building_id from floors where id = assets.floor_id))
);
```

The capability matrix in `specs/04-permissions.md` is implemented through these RLS policies plus the front-end `<Can>` component for UI gating.

## Triggers

### `set_updated_at`

```sql
create or replace function public.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- Applied to every table with updated_at
create trigger set_updated_at before update on public.assets
for each row execute function public.set_updated_at();
```

### `audit_log_changes`

```sql
create or replace function public.audit_log_changes() returns trigger as $$
begin
  insert into audit_log(user_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    tg_op || '.' || tg_table_name,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op = 'UPDATE' or tg_op = 'DELETE' then to_jsonb(old) end,
    case when tg_op = 'UPDATE' or tg_op = 'INSERT' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Applied to assets, floors, buildings, access_grants, flags
```

### `validate_pin_coords`

```sql
create or replace function public.validate_pin_coords() returns trigger as $$
begin
  if new.x < 0 or new.x > 1 or new.y < 0 or new.y > 1 then
    raise exception 'Pin coordinates must be normalized 0..1';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger validate_pin_coords before insert or update on public.assets
for each row execute function public.validate_pin_coords();
```

## Storage buckets

| Bucket | Purpose | Access |
|---|---|---|
| `floor-plans` | PDFs and images of floor plans | Authenticated read with RLS-equivalent storage policy; building admins write |
| `asset-photos` | Photos of individual assets | Same |
| `audit-photos` | Photos taken during audits | Same |
| `org-logos` | Building/org logos | Public read, authenticated write |

Storage policies mirror table policies. Example for `floor-plans`:

```sql
create policy "floor_plans_read" on storage.objects for select using (
  bucket_id = 'floor-plans'
  and exists (
    select 1 from floors f
    where f.plan_url = name and user_can('view', 'floor', f.id)
  )
);
```

## Realtime

Supabase Realtime channels we subscribe to:

- `floor:{floor_id}` — broadcasts pin moves, additions, deletions, status changes for that floor
- `audit_session:{session_id}` — for collaborative audits (rare, but supported)
- `building:{building_id}:flags` — new flags raised in this building (admin notifications)

## Generated TypeScript types

After every migration, run:

```bash
npm run db:types
```

which generates `src/types/database.ts` containing the typed schema. All Supabase queries should be typed off this file:

```ts
import type { Database } from '@/types/database';

const supabase: SupabaseClient<Database> = createClient(...);
```
