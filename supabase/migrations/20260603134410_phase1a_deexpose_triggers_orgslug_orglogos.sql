-- PHASE 1a (demo): de-expose trigger functions, pin org_slug, tighten org-logos bucket.
-- Trigger functions are never meant to be RPC endpoints; triggers fire regardless of caller EXECUTE.
revoke execute on function public.assign_pin_number()            from public, anon, authenticated;
revoke execute on function public.audit_log_changes()            from public, anon, authenticated;
revoke execute on function public.audit_log_pin_move()           from public, anon, authenticated;
revoke execute on function public.grant_creator_building_admin() from public, anon, authenticated;
revoke execute on function public.handle_new_user()              from public, anon, authenticated;
revoke execute on function public.set_building_owner_org()       from public, anon, authenticated;

-- org_slug: pin search_path so it is no longer role-mutable (uses only built-ins).
alter function public.org_slug(text) set search_path = pg_catalog, pg_temp;

-- org-logos is a public bucket: object URLs work without a broad SELECT policy.
-- Dropping the listing policy stops clients from enumerating every file. Write policy stays.
drop policy if exists org_logos_public_read on storage.objects;
