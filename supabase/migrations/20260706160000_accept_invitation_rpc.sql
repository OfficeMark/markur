-- ==========================================================================
-- SEC-1/2/3 fix (CODE-REVIEW-2026-07-06): invitation lookup + acceptance
-- must run server-side. RLS (correctly) prevents an invitee from reading
-- pending_invitations or self-inserting into access_grants, which left the
-- accept flow functionally broken. These SECURITY DEFINER RPCs are the one
-- sanctioned path: token-validated, expiry-checked, email-bound, idempotent.
-- ==========================================================================

-- Deduplicate any existing active permanent grants before adding the guard
-- index (keep the earliest of each duplicate set).
delete from public.access_grants a
using public.access_grants b
where a.user_id = b.user_id
  and a.role = b.role
  and a.scope_type = b.scope_type
  and a.scope_id is not distinct from b.scope_id
  and a.expires_at is null
  and b.expires_at is null
  and a.created_at > b.created_at;

-- SEC-3: no duplicate active permanent grants (expiring grants excluded —
-- demo/trial grants are managed by their own claim path).
create unique index if not exists access_grants_active_unique
  on public.access_grants (user_id, role, scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where expires_at is null;

-- --------------------------------------------------------------------------
-- lookup_invitation: lets the signed-in invitee preview an invitation by
-- token (status, role, scope, friendly building name) without widening RLS.
-- --------------------------------------------------------------------------
create or replace function public.lookup_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv record;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view this invitation.';
  end if;

  select * into inv from public.pending_invitations where token = p_token;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if inv.accepted_at is not null then
    return jsonb_build_object('status', 'accepted');
  end if;
  if inv.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if inv.scope_type = 'building' and inv.scope_id is not null then
    select b.name into v_name from public.buildings b where b.id = inv.scope_id;
  elsif inv.scope_type = 'floor' and inv.scope_id is not null then
    select coalesce(b.name || ' · ', '') || f.label into v_name
    from public.floors f left join public.buildings b on b.id = f.building_id
    where f.id = inv.scope_id;
  elsif inv.scope_type = 'tenant' and inv.scope_id is not null then
    select coalesce(b.name || ' · ', '') || t.name into v_name
    from public.tenants t left join public.buildings b on b.id = t.building_id
    where t.id = inv.scope_id;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'email', inv.email,
    'role', inv.role,
    'scope_type', inv.scope_type,
    'scope_id', inv.scope_id,
    'building_name', v_name,
    'expires_at', inv.expires_at
  );
end;
$$;

revoke execute on function public.lookup_invitation(text) from public, anon;
grant execute on function public.lookup_invitation(text) to authenticated;

-- --------------------------------------------------------------------------
-- accept_invitation: validates token + expiry, binds to the invited email
-- (SEC-2 — a leaked token cannot be redeemed by another account), creates
-- the grant and stamps accepted_at in one transaction (SEC-3), idempotently.
-- --------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  inv record;
begin
  if v_user is null then
    raise exception 'Sign in to accept this invitation.';
  end if;

  select * into inv from public.pending_invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'Invitation not found.';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invitation has already been accepted.';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invitation has expired.';
  end if;
  if lower(inv.email) <> v_email then
    raise exception 'This invitation was issued to a different email address.';
  end if;

  insert into public.access_grants (user_id, role, scope_type, scope_id, granted_by)
  select v_user, inv.role, inv.scope_type, inv.scope_id, inv.invited_by
  where not exists (
    select 1 from public.access_grants g
    where g.user_id = v_user
      and g.role = inv.role
      and g.scope_type = inv.scope_type
      and g.scope_id is not distinct from inv.scope_id
      and (g.expires_at is null or g.expires_at > now())
  );

  update public.pending_invitations set accepted_at = now() where id = inv.id;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
