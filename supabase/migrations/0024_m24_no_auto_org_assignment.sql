-- M24: stop auto-creating orgs on building insert, and ship a fixed slug
-- helper so the bug that produced "andy-ough-ac98c5ae" for "Randy Hough"
-- cannot recur.
--
-- Background:
--   Migration 0018_m11a_auto_org_on_building_create.sql installed a BEFORE
--   INSERT trigger on public.buildings that did two things:
--     1. If owner_org_id was null AND the creator had no existing
--        building-admin grant pointing at an org, it INSERTED a new
--        organizations row named after the user. This silently fragmented
--        org structure (one orphan org per new client created without a
--        pre-existing org context — observed 2026-05-11 with the Crescent
--        School building, which auto-spawned a "Randy Hough" org).
--     2. Generated the new org's slug as
--          lower(regexp_replace(v_org_name, '[^a-z0-9]+', '-', 'g'))
--        The regex runs BEFORE lower(), and its character class is
--        lowercase-only, so capital letters get replaced with '-'. After
--        the leading '-' is trimmed, "Randy Hough" becomes "andy-ough".
--
-- This migration:
--   1. Adds public.org_slug(text) — the corrected helper (lowercase the
--      input FIRST, then regex). Not invoked by the trigger anymore, but
--      kept as a tested utility for any future flow that needs to mint a
--      slug (e.g. an explicit "create organization" UI).
--   2. Inline assertion that org_slug('Randy Hough') starts with 'randy'.
--      Fires once at apply time; the function is forward-only so future
--      regressions would land in a NEW migration with its own assertion.
--   3. Replaces set_building_owner_org() to keep the existing-org
--      INFERENCE branch (so a user with a building-admin grant on an
--      org-bearing building still gets the right org without the client
--      sending one), but the auto-CREATE branch is gone. If neither the
--      caller nor the inference yields an org, the trigger raises an
--      exception with a clear message — never silent.
--
-- Out of scope: floor creation is untouched (it's a different table and a
-- different trigger).

-- =========================================================================
-- org_slug helper (fixed: lower the input BEFORE the regex)
-- =========================================================================

create or replace function public.org_slug(input text)
returns text
language plpgsql
immutable
as $$
declare
  v_slug text;
begin
  if input is null then
    return 'org';
  end if;
  v_slug := regexp_replace(lower(input), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) = 0 then
    v_slug := 'org';
  end if;
  return substring(v_slug, 1, 40);
end;
$$;

-- Tiny unit test (the prompt asked for one). The old version returned
-- 'andy-ough' for this input; the fixed version must keep the leading R.
do $$
begin
  if public.org_slug('Randy Hough') <> 'randy-hough' then
    raise exception 'org_slug regression: expected "randy-hough", got "%"', public.org_slug('Randy Hough');
  end if;
  if public.org_slug('  Multiple   Spaces  ') <> 'multiple-spaces' then
    raise exception 'org_slug regression on whitespace: got "%"', public.org_slug('  Multiple   Spaces  ');
  end if;
  if public.org_slug('!!!') <> 'org' then
    raise exception 'org_slug fallback broken: got "%"', public.org_slug('!!!');
  end if;
end$$;

-- =========================================================================
-- set_building_owner_org: never auto-create an organization
-- =========================================================================

create or replace function public.set_building_owner_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
begin
  -- Honour an explicit choice from the client (the M24 form picker sends
  -- this for every create).
  if new.owner_org_id is not null then
    return new;
  end if;

  -- Fall back to inference: reuse an org the user already admins on
  -- another building. Keeps existing-customer flows working without the
  -- client having to send owner_org_id.
  select b.owner_org_id into v_org_id
  from public.access_grants ag
  join public.buildings b on b.id = ag.scope_id
  where ag.user_id = auth.uid()
    and ag.role = 'building_admin'
    and ag.scope_type = 'building'
    and b.owner_org_id is not null
    and b.deleted_at is null
  limit 1;

  if v_org_id is null then
    raise exception 'No organization context for this building. Pick an organization in the form, or create/join one before adding a building.'
      using errcode = 'P0001', hint = 'M24 removed silent org auto-creation; the building-create form must send owner_org_id.';
  end if;

  new.owner_org_id := v_org_id;
  return new;
end;
$$;

-- Trigger is unchanged from 0018 — same name, same timing, same target.
-- This is just defensive re-creation in case the migration runs out of
-- order during a restore.
drop trigger if exists buildings_auto_set_org on public.buildings;
create trigger buildings_auto_set_org
  before insert on public.buildings
  for each row execute function public.set_building_owner_org();
