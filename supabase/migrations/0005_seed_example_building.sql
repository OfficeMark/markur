-- Idempotent seed: one example organization + one example building + 5 floors.
-- Safe to re-apply (uses ON CONFLICT against unique slugs / (building_id, sort_order)).

insert into public.organizations (name, slug, plan)
values ('Officemark', 'officemark', 'pro')
on conflict (slug) do update set name = excluded.name
returning id;

with org as (
  select id from public.organizations where slug = 'officemark' limit 1
),
b as (
  insert into public.buildings (name, address, city, region, country, total_floors, owner_org_id, settings)
  select
    '161 Bay St.',
    '161 Bay Street',
    'Toronto',
    'ON',
    'CA',
    5,
    org.id,
    jsonb_build_object(
      'default_audit_cycle_days', 90,
      'default_pin_color', 'amber',
      'tenant_can_flag', true
    )
  from org
  -- soft idempotency: only insert if not present (no unique on name; we treat
  -- (name, address) as the natural key for the seed)
  where not exists (
    select 1 from public.buildings
    where name = '161 Bay St.' and address = '161 Bay Street'
  )
  returning id
),
building_id as (
  select id from b
  union all
  select id from public.buildings
    where name = '161 Bay St.' and address = '161 Bay Street'
    and not exists (select 1 from b)
)
insert into public.floors (building_id, label, sort_order)
select bid.id, f.label, f.sort_order
from building_id bid
cross join (values
  ('B2', 0),
  ('B1', 1),
  ('Ground', 2),
  ('Floor 2', 3),
  ('Floor 3', 4)
) as f(label, sort_order)
on conflict (building_id, sort_order) do nothing;
