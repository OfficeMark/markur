-- PHASE 2 (demo): self-serve provisioning. On signup, create profile + one org
-- + an org-admin grant (building_admin @ organization scope). Runs SECURITY
-- DEFINER so it bypasses RLS during signup. Also recreate the auth.users trigger
-- (it did not clone to demo). NOTE for prod: prod still HAS this trigger; on prod
-- promote by replacing the FUNCTION only, do not recreate the trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_display text;
  v_org_name text;
  v_slug_base text;
  v_slug text;
begin
  v_display := coalesce(
    nullif(new.raw_user_meta_data->>'display_name',''),
    nullif(split_part(coalesce(new.email,''),'@',1),''),
    'User');
  v_org_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'company'),''),
    nullif(trim(new.raw_user_meta_data->>'organization'),''),
    v_display || ' Org');

  -- profile (preserves prior behavior)
  insert into public.profiles (id, display_name, email)
  values (new.id, v_display, new.email)
  on conflict (id) do nothing;

  -- one organization per new signup (plan defaults to 'free')
  v_slug_base := nullif(org_slug(v_org_name), '');
  v_slug := coalesce(v_slug_base, 'org') || '-' || substr(replace(new.id::text,'-',''),1,8);
  insert into public.organizations (name, slug)
  values (v_org_name, v_slug)
  returning id into v_org_id;

  -- org-admin grant (org admin = building_admin @ organization scope)
  insert into public.access_grants (user_id, role, scope_type, scope_id)
  values (new.id, 'building_admin', 'organization', v_org_id);

  return new;
end;
$function$;

-- recreate the auth.users -> provisioning trigger (absent on demo)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
