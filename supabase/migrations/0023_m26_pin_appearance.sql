-- =========================================================================
-- M26: per-org pin appearance (shape + size)
-- =========================================================================
--
-- Extends org_branding (M16) with two new admin-tunable knobs that affect
-- how asset pins render on the floor plan:
--
--   pin_shape — circle (default) | square | diamond
--   pin_size  — small | medium (default) | large
--
-- Stored as text enums with CHECK constraints (vs. PG enum type) so the
-- value set can grow without an ALTER TYPE migration.
-- =========================================================================

alter table public.org_branding
  add column if not exists pin_shape text not null default 'circle',
  add column if not exists pin_size  text not null default 'medium';

alter table public.org_branding
  drop constraint if exists org_branding_pin_shape_valid;
alter table public.org_branding
  add constraint org_branding_pin_shape_valid
  check (pin_shape in ('circle', 'square', 'diamond'));

alter table public.org_branding
  drop constraint if exists org_branding_pin_size_valid;
alter table public.org_branding
  add constraint org_branding_pin_size_valid
  check (pin_size in ('small', 'medium', 'large'));
