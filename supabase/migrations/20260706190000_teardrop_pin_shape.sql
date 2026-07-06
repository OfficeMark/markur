-- S10 — allow the Markur teardrop pin as an org-branding shape choice.
-- (The original constraint from 0023_m26_pin_appearance is named
-- org_branding_pin_shape_valid — drop by that name, not _check.)
alter table public.org_branding
  drop constraint if exists org_branding_pin_shape_valid;
alter table public.org_branding
  drop constraint if exists org_branding_pin_shape_check;
alter table public.org_branding
  add constraint org_branding_pin_shape_valid
  check (pin_shape in ('circle','square','diamond','teardrop'));
