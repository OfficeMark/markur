-- user_can never consulted organization-scope grants, so "building_admin @ organization"
-- (what every new signup gets, and the definition of org admin) granted no capabilities.
-- Add an org-admin branch: an org-scope building_admin grant covers edit-class capabilities
-- for any building (and its floors/tenants) owned by that org, and for the org scope itself.
create or replace function private.user_can(p_capability text, p_scope_type text, p_scope_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'private', 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_building_id uuid;
  v_floor_id uuid;
  v_org_id uuid;
begin
  if v_user is null then
    return false;
  end if;

  -- super_admin: blanket allow.
  if exists (
    select 1 from public.access_grants
    where user_id = v_user and role = 'super_admin'
      and (expires_at is null or expires_at > now())
  ) then
    return true;
  end if;

  -- Resolve the parent building/floor of the requested scope.
  if p_scope_type = 'floor' then
    select building_id into v_building_id from public.floors where id = p_scope_id;
    v_floor_id := p_scope_id;
  elsif p_scope_type = 'tenant' then
    select building_id into v_building_id from public.tenants where id = p_scope_id;
  elsif p_scope_type = 'building' then
    v_building_id := p_scope_id;
  end if;

  -- Resolve the owning org for the requested scope.
  if p_scope_type = 'organization' then
    v_org_id := p_scope_id;
  elsif v_building_id is not null then
    select owner_org_id into v_org_id from public.buildings where id = v_building_id;
  end if;

  -- ORG ADMIN: a building_admin grant at organization scope covers edit-class
  -- capabilities for everything owned by that org (and the org scope itself).
  if v_org_id is not null and exists (
    select 1 from public.access_grants
    where user_id = v_user
      and role = 'building_admin'
      and scope_type = 'organization'
      and scope_id = v_org_id
      and (expires_at is null or expires_at > now())
  ) then
    return p_capability in (
      'view','edit','create','delete','reposition',
      'audit','flag','resolve_flag','upload_plan',
      'manage_access','configure','export','view_audit_log'
    );
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
    return true;
  end if;

  return false;
end;
$function$;
