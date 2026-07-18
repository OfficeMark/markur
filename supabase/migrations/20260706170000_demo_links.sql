-- ==========================================================================
-- S9 — Demo links (BUILD-QUEUE S9, mock: docs/demo-share-flow-mock.html)
-- A demo link is a tokenized, expiring invitation with no pre-set email:
-- the prospect claims it by signing up, receiving a building-scoped
-- building_admin grant whose expires_at equals the link's end date
-- ("the link IS the trial" — a fixed trial window from link creation).
-- Built on pending_invitations + access_grants.expires_at, per spec.
-- NOT the old building_shares system.
-- ==========================================================================

-- ---- pending_invitations: demo kind, optional email, trial length --------
alter table public.pending_invitations
  add column if not exists kind text not null default 'member'
    check (kind in ('member','demo')),
  add column if not exists grant_days integer;

alter table public.pending_invitations alter column email drop not null;

alter table public.pending_invitations
  add constraint pending_invitations_member_email
  check (kind = 'demo' or email is not null);

-- ---- access_grants: remember which link a demo grant came from -----------
-- Lets the "Active links" list show who claimed, and lets revoking a link
-- expire its derived grants immediately.
alter table public.access_grants
  add column if not exists source_invitation_id uuid
    references public.pending_invitations(id) on delete set null;

create index if not exists access_grants_source_invitation_idx
  on public.access_grants(source_invitation_id);

-- ---- peek_demo_link: anon-callable preview for the claim screen ----------
create or replace function public.peek_demo_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv record;
  v_building text;
  v_sharer text;
begin
  select * into inv from public.pending_invitations
  where token = p_token and kind = 'demo';
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if inv.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;

  select b.name, o.name into v_building, v_sharer
  from public.buildings b
  left join public.organizations o on o.id = b.owner_org_id
  where b.id = inv.scope_id;

  return jsonb_build_object(
    'status', 'ok',
    'building_name', v_building,
    'sharer_name', v_sharer,
    'expires_at', inv.expires_at,
    'grant_days', inv.grant_days
  );
end;
$$;

-- Anon-callable by design: the claim screen renders before signup. It leaks
-- only building name + sharer name + window, and only to a valid token.
grant execute on function public.peek_demo_link(text) to anon, authenticated;

-- ---- claim_demo_link: mint the expiring full-access grant ----------------
create or replace function public.claim_demo_link(p_token text)
returns uuid  -- the building id, for redirect
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  inv record;
begin
  if v_user is null then
    raise exception 'Sign in to open this building.';
  end if;

  select * into inv from public.pending_invitations
  where token = p_token and kind = 'demo'
  for update;

  if not found then
    raise exception 'This link is not valid.';
  end if;
  if inv.expires_at < now() then
    raise exception 'This link has expired.';
  end if;
  if inv.scope_type <> 'building' or inv.scope_id is null then
    raise exception 'This link is not attached to a building.';
  end if;

  -- Idempotent per user + link: revisits keep the existing grant.
  -- Multiple people may claim the same link (colleagues at the prospect).
  insert into public.access_grants
    (user_id, role, scope_type, scope_id, granted_by, expires_at, source_invitation_id)
  select v_user, 'building_admin', 'building', inv.scope_id,
         inv.invited_by, inv.expires_at, inv.id
  where not exists (
    select 1 from public.access_grants g
    where g.user_id = v_user
      and g.source_invitation_id = inv.id
      and (g.expires_at is null or g.expires_at > now())
  )
  -- Also skip if they already hold real (non-demo) access to this building.
  and not exists (
    select 1 from public.access_grants g
    where g.user_id = v_user
      and g.scope_type = 'building'
      and g.scope_id = inv.scope_id
      and g.source_invitation_id is null
      and (g.expires_at is null or g.expires_at > now())
  );

  return inv.scope_id;
end;
$$;

revoke execute on function public.claim_demo_link(text) from public, anon;
grant execute on function public.claim_demo_link(text) to authenticated;

-- ---- revoke_demo_link: kill the link AND its derived grants --------------
create or replace function public.revoke_demo_link(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv record;
begin
  select * into inv from public.pending_invitations
  where id = p_invitation_id and kind = 'demo'
  for update;
  if not found then
    raise exception 'Demo link not found.';
  end if;

  -- Only someone who can manage access on the building may revoke.
  if not public.user_can('manage_access', 'building', inv.scope_id) then
    raise exception 'Not allowed.';
  end if;

  update public.access_grants
  set expires_at = now()
  where source_invitation_id = inv.id
    and (expires_at is null or expires_at > now());

  delete from public.pending_invitations where id = inv.id;
end;
$$;

revoke execute on function public.revoke_demo_link(uuid) from public, anon;
grant execute on function public.revoke_demo_link(uuid) to authenticated;

-- ---- list_demo_link_claims: emails for the "Active links" list -----------
create or replace function public.list_demo_link_claims(p_building_id uuid)
returns table (invitation_id uuid, email text, claimed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.user_can('manage_access', 'building', p_building_id) then
    raise exception 'Not allowed.';
  end if;
  return query
    select g.source_invitation_id, p.email, g.created_at
    from public.access_grants g
    join public.profiles p on p.id = g.user_id
    where g.scope_type = 'building'
      and g.scope_id = p_building_id
      and g.source_invitation_id is not null;
end;
$$;

revoke execute on function public.list_demo_link_claims(uuid) from public, anon;
grant execute on function public.list_demo_link_claims(uuid) to authenticated;

-- ---- handle_new_user: guest signups skip org provisioning ----------------
-- A demo prospect signing up through /welcome/<token> must not get an empty
-- auto-provisioned organization + org-admin grant; their access comes from
-- the claimed demo grant. Client passes data.guest = 'true' on signUp.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- profile (always)
  insert into public.profiles (id, display_name, email)
  values (new.id, v_display, new.email)
  on conflict (id) do nothing;

  -- Guest (demo-link) signups: profile only — no org, no grant.
  if coalesce(new.raw_user_meta_data->>'guest','') = 'true' then
    return new;
  end if;

  v_org_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'company'),''),
    nullif(trim(new.raw_user_meta_data->>'organization'),''),
    v_display || ' Org');

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
