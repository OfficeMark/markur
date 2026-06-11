-- PHASE 1b (demo): move the 5 policy-facing RLS helpers out of the API-exposed
-- public schema into a hidden private schema. OID-stable, so all 41 policy refs
-- follow automatically. private is not in PostgREST's exposed schema list, so the
-- /rest/v1/rpc/<fn> endpoints die for every role (anon, authenticated, service_role).
create schema if not exists private;
-- roles still need USAGE on private so RLS evaluation can resolve the helpers
grant usage on schema private to anon, authenticated, service_role;

alter function public.user_can(text,text,uuid)           set schema private;
alter function public.user_in_org(uuid)                  set schema private;
alter function public.user_in_building(uuid)             set schema private;
alter function public.user_can_admin_org(uuid)           set schema private;
alter function public.user_can_view_asset(public.assets) set schema private;

-- re-point search_path so inter-helper calls resolve from private and table refs from public
alter function private.user_can(text,text,uuid)           set search_path = private, public;
alter function private.user_in_org(uuid)                  set search_path = private, public;
alter function private.user_in_building(uuid)             set search_path = private, public;
alter function private.user_can_admin_org(uuid)           set search_path = private, public;
alter function private.user_can_view_asset(public.assets) set search_path = private, public;

-- dead code: 0 policy refs, 0 DB callers, no frontend .rpc() call (CC-confirmed)
drop function if exists public.user_can_anything(text);
