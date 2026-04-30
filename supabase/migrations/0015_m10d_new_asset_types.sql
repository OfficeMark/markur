-- M10d: extend asset type CHECK constraint with donor / nameplate / mural / decorative
-- The customer base spans more than wayfinding signage — donor recognition,
-- nameplates, and decorative architectural features are also things property
-- managers track per floor. M11 will replace this fixed CHECK with a
-- per-organization customizable type table; for now we just widen the list.

alter table public.assets
  drop constraint if exists assets_type_check;

alter table public.assets
  add constraint assets_type_check check (type in (
    -- existing
    'directory','tenant_id','egress','stairwell','service_room','other',
    'wayfinding','tenant_products','utility_room','emergency','evacuation',
    -- new in M10d
    'donor_plaque','donor_wall','nameplate','wall_mural','decorative_feature'
  ));
