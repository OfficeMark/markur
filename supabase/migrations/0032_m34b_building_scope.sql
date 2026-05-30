-- ============================================================
-- M34b — per-building scope  (RECORD-ONLY: already applied live to
-- drclmnqlurvwqpnnpgzb. Do NOT push / re-apply.)
-- Reconciled to live pg_catalog, 2026-05-30. Final post-M34b state.
-- ============================================================

-- 1. building_id columns  (NULL = org-wide/shared; set = building-specific)
alter table public.contacts
  add column if not exists building_id uuid references public.buildings(id) on delete cascade;
alter table public.vendors
  add column if not exists building_id uuid references public.buildings(id) on delete cascade;

-- 2. helper: org-level grant sees all buildings in org; else building-scoped grant
create or replace function public.user_in_building(p_building_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_org uuid;
begin
  if v_user is null or p_building_id is null then return false; end if;
  select owner_org_id into v_org from public.buildings where id = p_building_id and deleted_at is null;
  if v_org is null then return false; end if;
  if public.user_in_org(v_org) and exists (
      select 1 from public.access_grants
      where user_id = v_user and (scope_type in ('global','organization'))
        and (expires_at is null or expires_at > now())) then return true; end if;
  return exists (select 1 from public.access_grants
    where user_id = v_user and scope_type = 'building' and scope_id = p_building_id
      and (expires_at is null or expires_at > now()));
end; $function$;

-- 3. widened two-tier policies (role = public; org-wide rows visible to all
--    org members, building-scoped rows only to that building's members)
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select to public
  using (user_in_org(owner_org_id) and ((building_id is null) or user_in_building(building_id)));

drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts
  for all to public
  using      (user_can_admin_org(owner_org_id) and ((building_id is null) or user_can('edit','building',building_id)))
  with check (user_can_admin_org(owner_org_id) and ((building_id is null) or user_can('edit','building',building_id)));

drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors
  for select to public
  using (user_in_org(owner_org_id) and ((building_id is null) or user_in_building(building_id)));

drop policy if exists vendors_write on public.vendors;
create policy vendors_write on public.vendors
  for all to public
  using      (user_can_admin_org(owner_org_id) and ((building_id is null) or user_can('edit','building',building_id)))
  with check (user_can_admin_org(owner_org_id) and ((building_id is null) or user_can('edit','building',building_id)));
