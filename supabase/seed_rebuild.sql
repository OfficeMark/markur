-- ============================================================================
-- Rebuild-environment seed (markur-rebuild / hlfkfkyglfzrbeuzyojm) — IDEMPOTENT.
-- Re-applicable: safe to run repeatedly; inserts only what's missing.
--
-- Test admin: demo@rancherdesign.ca
--
-- WHY a global super_admin grant (not the org-scope grant from handle_new_user):
--   The client-side capability gate, src/lib/permissions-types.ts checkCapability(),
--   only honors:  super_admin (any scope)  |  building_admin @ 'building'  |
--                 auditor @ 'floor'  |  tenant_rep @ 'tenant'.
--   It has NO 'organization'-scope branch, so the auto-minted
--   building_admin @ 'organization' grant gives the UI zero capabilities
--   (blank / read-only) even though the DB user_can() honors org scope.
--   A global super_admin grant is honored by the client short-circuit AND by the
--   DB phase2c branch (super_admin blanket-allows only at scope_type='global').
-- ============================================================================
do $$
declare
  v_uid uuid;
  v_org uuid;
  v_b1 uuid; v_b2 uuid;
  v_f1 uuid; v_f2 uuid; v_f3 uuid;
begin
  select id into v_uid from auth.users where email = 'demo@rancherdesign.ca';
  if v_uid is null then
    raise exception 'seed_rebuild: demo@rancherdesign.ca not found — create the auth user first';
  end if;

  -- Working admin grant: GLOBAL super_admin (honored by client + DB).
  if not exists (
    select 1 from public.access_grants
    where user_id = v_uid and role = 'super_admin' and scope_type = 'global'
      and (expires_at is null or expires_at > now())
  ) then
    insert into public.access_grants (user_id, role, scope_type, scope_id)
    values (v_uid, 'super_admin', 'global', null);
  end if;

  -- Org for the demo user's buildings (the org-scope grant from signup).
  select scope_id into v_org from public.access_grants
    where user_id = v_uid and scope_type = 'organization' limit 1;

  -- Buildings (idempotent by name within the org). owner_org_id set explicitly so
  -- the BEFORE INSERT set_building_owner_org trigger short-circuits.
  select id into v_b1 from public.buildings
    where name = 'Rebuild Tower' and owner_org_id = v_org and deleted_at is null;
  if v_b1 is null then
    insert into public.buildings (name, address, city, region, country, total_floors, owner_org_id, settings)
    values ('Rebuild Tower', '100 King Street West', 'Toronto', 'ON', 'CA', 2, v_org,
            jsonb_build_object('default_audit_cycle_days', 90))
    returning id into v_b1;
  end if;

  select id into v_b2 from public.buildings
    where name = 'Demo Plaza' and owner_org_id = v_org and deleted_at is null;
  if v_b2 is null then
    insert into public.buildings (name, address, city, region, country, total_floors, owner_org_id, settings)
    values ('Demo Plaza', '250 Front Street', 'Toronto', 'ON', 'CA', 1, v_org, '{}'::jsonb)
    returning id into v_b2;
  end if;

  -- Floors (idempotent by building + label).
  select id into v_f1 from public.floors where building_id = v_b1 and label = 'Ground'  and deleted_at is null;
  if v_f1 is null then insert into public.floors (building_id, label, sort_order) values (v_b1, 'Ground', 0)  returning id into v_f1; end if;
  select id into v_f2 from public.floors where building_id = v_b1 and label = 'Floor 2' and deleted_at is null;
  if v_f2 is null then insert into public.floors (building_id, label, sort_order) values (v_b1, 'Floor 2', 10) returning id into v_f2; end if;
  select id into v_f3 from public.floors where building_id = v_b2 and label = 'Ground'  and deleted_at is null;
  if v_f3 is null then insert into public.floors (building_id, label, sort_order) values (v_b2, 'Ground', 0)  returning id into v_f3; end if;

  -- Pins (idempotent by floor + name).
  if not exists (select 1 from public.assets where floor_id = v_f1 and name = 'Lobby directory') then
    insert into public.assets (floor_id, type, category, name, x, y) values
      (v_f1, 'directory',  'signage',  'Lobby directory',     0.25, 0.30),
      (v_f1, 'wayfinding', 'signage',  'Elevator wayfinding', 0.55, 0.42),
      (v_f1, 'egress',     'signage',  'North exit sign',     0.80, 0.20),
      (v_f1, 'stairwell',  'facility', 'Stair A marker',      0.15, 0.70);
  end if;
  if not exists (select 1 from public.assets where floor_id = v_f2 and name = 'Floor 2 directory') then
    insert into public.assets (floor_id, type, category, name, x, y) values
      (v_f2, 'directory', 'signage', 'Floor 2 directory',   0.40, 0.35),
      (v_f2, 'tenant_id', 'signage', 'Suite 200 nameplate', 0.62, 0.55);
  end if;
  if not exists (select 1 from public.assets where floor_id = v_f3 and name = 'Plaza wayfinding') then
    insert into public.assets (floor_id, type, category, name, x, y) values
      (v_f3, 'wayfinding', 'signage', 'Plaza wayfinding', 0.50, 0.50);
  end if;
end $$;

select
  (select count(*) from public.access_grants
     where user_id = (select id from auth.users where email='demo@rancherdesign.ca')
       and role='super_admin' and scope_type='global') as super_admin_grants,
  (select count(*) from public.buildings where deleted_at is null) as buildings_total,
  (select count(*) from public.floors where deleted_at is null) as floors_total,
  (select count(*) from public.assets where deleted_at is null) as pins_total;
