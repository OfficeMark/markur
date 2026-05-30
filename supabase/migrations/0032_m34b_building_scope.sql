-- =========================================================================
-- M34b — per-building scope for the Contacts + Vendors directory.
--
-- ⚠️  RECORD ONLY. This layer was applied to the live DB (project
--     drclmnqlurvwqpnnpgzb) by Claude (chat). This file records what was
--     applied so the repo history tracks the live schema. Do NOT
--     `supabase db push` and do NOT re-apply.
--
-- Adds a nullable building_id to contacts and vendors:
--   * building_id IS NULL  → org-wide / shared (visible across all buildings)
--   * building_id = <id>    → specific to that building only
-- Visibility: a user sees org-wide rows of their org PLUS rows for buildings
-- they can access — never another building's private rows. Building admins can
-- manage their own building's rows; org admins manage org-wide rows.
-- =========================================================================

-- ---------- columns ----------
alter table public.contacts add column if not exists building_id uuid references public.buildings(id) on delete cascade;
alter table public.vendors  add column if not exists building_id uuid references public.buildings(id) on delete cascade;

create index if not exists contacts_building_idx on public.contacts(building_id) where deleted_at is null;
create index if not exists vendors_building_idx  on public.vendors(building_id)  where deleted_at is null;

-- ---------- helper: does the current user have access to this building? ----------
create or replace function public.user_in_building(p_building_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  if v_user is null or p_building_id is null then
    return false;
  end if;

  -- super_admin
  if exists (select 1 from public.access_grants
             where user_id = v_user and role = 'super_admin'
               and (expires_at is null or expires_at > now())) then
    return true;
  end if;

  -- direct building grant
  if exists (select 1 from public.access_grants
             where user_id = v_user and scope_type = 'building' and scope_id = p_building_id
               and (expires_at is null or expires_at > now())) then
    return true;
  end if;

  -- organization grant on the building's owning org
  select owner_org_id into v_org from public.buildings where id = p_building_id;
  if v_org is not null and exists (
    select 1 from public.access_grants
    where user_id = v_user and scope_type = 'organization' and scope_id = v_org
      and (expires_at is null or expires_at > now())) then
    return true;
  end if;

  -- floor grant within the building
  if exists (select 1 from public.access_grants ag
             join public.floors f on f.id = ag.scope_id
             where ag.user_id = v_user and ag.scope_type = 'floor'
               and f.building_id = p_building_id
               and (ag.expires_at is null or ag.expires_at > now())) then
    return true;
  end if;

  -- tenant grant within the building
  return exists (select 1 from public.access_grants ag
                 join public.tenants t on t.id = ag.scope_id
                 where ag.user_id = v_user and ag.scope_type = 'tenant'
                   and t.building_id = p_building_id
                   and (ag.expires_at is null or ag.expires_at > now()));
end;
$$;

-- ---------- widened RLS: contacts ----------
drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts for select
  using (
    (building_id is null and public.user_in_org(owner_org_id))
    or (building_id is not null and public.user_in_building(building_id))
  );

drop policy if exists "contacts_write" on public.contacts;
create policy "contacts_write" on public.contacts for all
  using (
    case when building_id is null
      then public.user_can_admin_org(owner_org_id)
      else (public.user_can('configure', 'global', null) or public.user_can('edit', 'building', building_id))
    end
  )
  with check (
    case when building_id is null
      then public.user_can_admin_org(owner_org_id)
      else (public.user_can('configure', 'global', null) or public.user_can('edit', 'building', building_id))
    end
  );

-- ---------- widened RLS: vendors ----------
drop policy if exists "vendors_select" on public.vendors;
create policy "vendors_select" on public.vendors for select
  using (
    (building_id is null and public.user_in_org(owner_org_id))
    or (building_id is not null and public.user_in_building(building_id))
  );

drop policy if exists "vendors_write" on public.vendors;
create policy "vendors_write" on public.vendors for all
  using (
    case when building_id is null
      then public.user_can_admin_org(owner_org_id)
      else (public.user_can('configure', 'global', null) or public.user_can('edit', 'building', building_id))
    end
  )
  with check (
    case when building_id is null
      then public.user_can_admin_org(owner_org_id)
      else (public.user_can('configure', 'global', null) or public.user_can('edit', 'building', building_id))
    end
  );
