-- ============================================================
-- Guest viewer share — phase 1 (DB)
-- viewer role + building_shares + claims + RPCs + guest signup skip
-- ============================================================

-- 1. Role check: add 'viewer'; also add 'editor' (latent bug — user_can has an
--    editor branch but the constraint never allowed editor grants to be inserted).
alter table public.access_grants drop constraint access_grants_role_check;
alter table public.access_grants add constraint access_grants_role_check
  check (role = any (array['super_admin'::text,'building_admin'::text,'editor'::text,'auditor'::text,'tenant_rep'::text,'viewer'::text]));

-- 2. user_can: add viewer branch (view + export only, building scope).
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

  -- super_admin: blanket allow, GLOBAL scope only (phase2c).
  if exists (
    select 1 from public.access_grants
    where user_id = v_user and role = 'super_admin'
      and scope_type = 'global'
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

  -- editor on the parent building: edit-class for content work, but withholds
  -- access management, configuration, deletion, and audit-log visibility.
  if v_building_id is not null and exists (
    select 1 from public.access_grants
    where user_id = v_user
      and role = 'editor'
      and scope_type = 'building'
      and scope_id = v_building_id
      and (expires_at is null or expires_at > now())
  ) then
    return p_capability in (
      'view','edit','create','reposition','audit',
      'flag','resolve_flag','upload_plan','export'
    );
  end if;

  -- viewer on the parent building: read-only guest (share link). view + export only.
  if v_building_id is not null and exists (
    select 1 from public.access_grants
    where user_id = v_user
      and role = 'viewer'
      and scope_type = 'building'
      and scope_id = v_building_id
      and (expires_at is null or expires_at > now())
  ) then
    return p_capability in ('view','export');
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

-- 3. user_can_view_asset: defer editor + viewer to the user_can path
--    (also fixes latent gap: editors previously fell through to the tenant_rep path).
create or replace function private.user_can_view_asset(p_asset assets)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'private', 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;

  -- super_admin: blanket allow, GLOBAL scope only (phase2c).
  if exists (
    select 1 from public.access_grants
    where user_id = v_user and role = 'super_admin'
      and scope_type = 'global'
      and (expires_at is null or expires_at > now())
  ) then
    return true;
  end if;

  -- building_admin / editor / auditor / viewer: defer to user_can('view','floor',...).
  if exists (
    select 1 from public.access_grants
    where user_id = v_user
      and role in ('building_admin','editor','auditor','viewer')
      and (expires_at is null or expires_at > now())
  ) then
    return user_can('view', 'floor', p_asset.floor_id);
  end if;

  -- tenant_rep only: must be on the tenant's primary floor AND
  -- (asset belongs to that tenant OR is unscoped common-area).
  return exists (
    select 1
    from public.access_grants ag
    join public.tenants t on t.id = ag.scope_id
    where ag.user_id = v_user
      and ag.role = 'tenant_rep'
      and ag.scope_type = 'tenant'
      and t.primary_floor_id = p_asset.floor_id
      and (ag.expires_at is null or ag.expires_at > now())
      and (
        p_asset.tenant_scope_id = ag.scope_id
        or p_asset.tenant_scope_id is null
      )
  );
end;
$function$;

-- 4. building_shares
create table public.building_shares (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.building_shares enable row level security;

create policy building_shares_read on public.building_shares for select using (
  private.user_can('manage_access','global',null)
  or private.user_can('manage_access','building',building_id)
);
create policy building_shares_write on public.building_shares for all using (
  private.user_can('manage_access','global',null)
  or private.user_can('manage_access','building',building_id)
) with check (
  private.user_can('manage_access','global',null)
  or private.user_can('manage_access','building',building_id)
);

-- cap: max 10 active shares per building
create or replace function private.building_shares_cap()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'private', 'public'
as $function$
begin
  if (select count(*) from public.building_shares
      where building_id = new.building_id
        and revoked_at is null
        and expires_at > now()) >= 10 then
    raise exception 'share cap reached: this building already has 10 active share links';
  end if;
  return new;
end;
$function$;

create trigger building_shares_cap_trg
  before insert on public.building_shares
  for each row execute function private.building_shares_cap();

-- 5. building_share_claims
create table public.building_share_claims (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.building_shares(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  email text not null,
  grant_id uuid references public.access_grants(id) on delete set null,
  claimed_at timestamptz not null default now(),
  unique (share_id, user_id)
);

alter table public.building_share_claims enable row level security;

create policy building_share_claims_read on public.building_share_claims for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.building_shares s
    where s.id = share_id
      and (private.user_can('manage_access','global',null)
        or private.user_can('manage_access','building',s.building_id))
  )
);
-- no insert/update policies: claims are written only via SECURITY DEFINER RPC.

-- 6. RPCs
create or replace function public.peek_building_share(p_token text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'private', 'extensions'
as $function$
declare
  v record;
begin
  select s.revoked_at, s.expires_at, b.name as building_name
  into v
  from public.building_shares s
  join public.buildings b on b.id = s.building_id
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if not found then
    return jsonb_build_object('status','invalid');
  end if;
  if v.revoked_at is not null then
    return jsonb_build_object('status','revoked');
  end if;
  if v.expires_at <= now() then
    return jsonb_build_object('status','expired');
  end if;
  return jsonb_build_object('status','ok','building_name',v.building_name,'expires_at',v.expires_at);
end;
$function$;

create or replace function public.claim_building_share(p_token text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'extensions'
as $function$
declare
  v_share record;
  v_user uuid := auth.uid();
  v_grant uuid;
  v_claim record;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  select * into v_share
  from public.building_shares
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if not found then raise exception 'invalid share link'; end if;
  if v_share.revoked_at is not null then raise exception 'share link revoked'; end if;
  if v_share.expires_at <= now() then raise exception 'share link expired'; end if;

  -- repeat visit: reuse the existing grant, re-aligned to the share expiry
  select * into v_claim
  from public.building_share_claims
  where share_id = v_share.id and user_id = v_user;

  if found and v_claim.grant_id is not null then
    update public.access_grants
    set expires_at = v_share.expires_at
    where id = v_claim.grant_id;
    return v_share.building_id;
  end if;

  insert into public.access_grants (user_id, role, scope_type, scope_id, expires_at, granted_by)
  values (v_user, 'viewer', 'building', v_share.building_id, v_share.expires_at, v_share.created_by)
  returning id into v_grant;

  insert into public.building_share_claims (share_id, user_id, email, grant_id)
  values (v_share.id, v_user, coalesce((select email from auth.users where id = v_user), ''), v_grant)
  on conflict (share_id, user_id) do update set grant_id = excluded.grant_id;

  return v_share.building_id;
end;
$function$;

create or replace function public.revoke_building_share(p_share_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare
  v_share record;
begin
  select * into v_share from public.building_shares where id = p_share_id;
  if not found then raise exception 'share not found'; end if;

  if not (private.user_can('manage_access','building',v_share.building_id)
          or private.user_can('manage_access','global',null)) then
    raise exception 'not authorized';
  end if;

  update public.building_shares
  set revoked_at = now()
  where id = p_share_id and revoked_at is null;

  -- cut derived guest grants immediately
  update public.access_grants g
  set expires_at = now()
  from public.building_share_claims c
  where c.share_id = p_share_id
    and g.id = c.grant_id
    and (g.expires_at is null or g.expires_at > now());
end;
$function$;

-- execute hardening (phase-1 discipline)
revoke all on function public.peek_building_share(text) from public;
revoke all on function public.claim_building_share(text) from public;
revoke all on function public.revoke_building_share(uuid) from public;
grant execute on function public.peek_building_share(text) to anon, authenticated;
grant execute on function public.claim_building_share(text) to authenticated;
grant execute on function public.revoke_building_share(uuid) to authenticated;

-- 7. handle_new_user: guest skip (profile only, no org/grant provisioning)
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_display text;
  v_org_name text;
  v_slug_base text;
  v_slug text;
begin
  v_display := coalesce(
    nullif(new.raw_user_meta_data->>'display_name',''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'User');

  -- guest (share-link) sign-ins: profile only, no org/grant provisioning.
  if coalesce(new.raw_user_meta_data->>'guest','') = 'true' then
    insert into public.profiles (id, display_name, email)
    values (new.id, v_display, new.email)
    on conflict (id) do nothing;
    return new;
  end if;

  v_org_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'company'),''),
    nullif(trim(new.raw_user_meta_data->>'organization'),''),
    v_display || ' Org');

  -- profile (preserves prior behavior)
  insert into public.profiles (id, display_name, email)
  values (new.id, v_display, new.email)
  on conflict (id) do nothing;

  -- one organization per new signup; starts a self-managed 30-day free trial.
  v_slug_base := nullif(org_slug(v_org_name), '');
  v_slug := coalesce(v_slug_base, 'org') || '-' || substr(replace(new.id::text,'-',''),1,8);
  insert into public.organizations (name, slug, subscription_status, trial_ends_at)
  values (v_org_name, v_slug, 'trial', now() + interval '30 days')
  returning id into v_org_id;

  -- org-admin grant (org admin = building_admin @ organization scope)
  insert into public.access_grants (user_id, role, scope_type, scope_id)
  values (new.id, 'building_admin', 'organization', v_org_id);

  return new;
end;
$function$;
