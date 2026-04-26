-- The capability check used by every RLS policy and (cached) by the front-end.
-- Returns true iff the current auth.uid() has p_capability on (p_scope_type, p_scope_id).
--
-- Design notes:
--   * super_admin short-circuits to true on every check.
--   * Capability strings match those in src/lib/permissions.ts (`Capability` union).
--   * For 'view' specifically, we walk up the scope tree:
--       - access on a building grants view on its floors and the floor's tenants/assets
--       - access on a floor grants view on assets/tenants on that floor
--     This mirrors specs/04-permissions.md § "Scoping rules" (access inherits downward).
--   * For 'edit'/'create'/'delete'/'reposition'/'upload_plan'/'manage_access'/'configure':
--     building admin or super only.
--   * For 'audit':
--     auditor on the specific floor, or building admin on the parent building, or super.
--   * For 'flag' / 'view':
--     tenant rep on the matching tenant scope (or its parent floor/building) plus the above.

create or replace function public.user_can(
  p_capability text,
  p_scope_type text,
  p_scope_id   uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_building_id uuid;
  v_floor_id uuid;
begin
  if v_user is null then
    return false;
  end if;

  -- super_admin: blanket allow.
  if exists (
    select 1
    from public.access_grants
    where user_id = v_user
      and role = 'super_admin'
      and (expires_at is null or expires_at > now())
  ) then
    return true;
  end if;

  -- Resolve the parent building/floor of the requested scope so we can check
  -- inherited grants (a building_admin grant covers floors/assets on that building, etc.).
  if p_scope_type = 'floor' then
    select building_id into v_building_id from public.floors where id = p_scope_id;
    v_floor_id := p_scope_id;
  elsif p_scope_type = 'tenant' then
    select building_id into v_building_id from public.tenants where id = p_scope_id;
  elsif p_scope_type = 'building' then
    v_building_id := p_scope_id;
  end if;

  -- building_admin on the parent building covers most edit-class capabilities.
  if v_building_id is not null and exists (
    select 1 from public.access_grants
    where user_id = v_user
      and role = 'building_admin'
      and scope_type = 'building'
      and scope_id = v_building_id
      and (expires_at is null or expires_at > now())
  ) then
    return p_capability in (
      'view','edit','create','delete','reposition',
      'audit','flag','resolve_flag','upload_plan',
      'manage_access','configure','export','view_audit_log'
    );
  end if;

  -- auditor on the specific floor (read + audit + flag only).
  if v_floor_id is not null and exists (
    select 1 from public.access_grants
    where user_id = v_user
      and role = 'auditor'
      and scope_type = 'floor'
      and scope_id = v_floor_id
      and (expires_at is null or expires_at > now())
  ) then
    return p_capability in ('view','audit','flag','resolve_flag');
  end if;

  -- tenant_rep on the specific tenant (read + flag).
  if p_scope_type = 'tenant' and exists (
    select 1 from public.access_grants
    where user_id = v_user
      and role = 'tenant_rep'
      and scope_type = 'tenant'
      and scope_id = p_scope_id
      and (expires_at is null or expires_at > now())
  ) then
    return p_capability in ('view','flag','export');
  end if;

  -- tenant_rep on a building/floor implicitly views assets in that scope (their floor).
  -- For floor scope, allow view if they have a tenant grant in this building.
  if p_capability = 'view' and v_building_id is not null and exists (
    select 1
    from public.access_grants ag
    join public.tenants t on t.id = ag.scope_id
    where ag.user_id = v_user
      and ag.role = 'tenant_rep'
      and ag.scope_type = 'tenant'
      and t.building_id = v_building_id
      and (ag.expires_at is null or ag.expires_at > now())
  ) then
    -- Tenant reps see their floor only; if checking a specific floor, that floor must
    -- be the tenant's primary_floor_id.
    if p_scope_type = 'floor' then
      return exists (
        select 1
        from public.access_grants ag
        join public.tenants t on t.id = ag.scope_id
        where ag.user_id = v_user
          and ag.role = 'tenant_rep'
          and ag.scope_type = 'tenant'
          and t.primary_floor_id = v_floor_id
          and (ag.expires_at is null or ag.expires_at > now())
      );
    end if;
    -- For building-scoped 'view' (e.g. in the building list), allow read so
    -- BuildingNav can render the parent building name.
    return true;
  end if;

  return false;
end;
$$;

-- A convenience that takes no scope (used by `<Can action="view" resource={{ type: 'global' }}>`)
create or replace function public.user_can_anything(p_capability text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return false;
  end if;
  return exists (
    select 1 from public.access_grants
    where user_id = v_user
      and (expires_at is null or expires_at > now())
  );
end;
$$;
