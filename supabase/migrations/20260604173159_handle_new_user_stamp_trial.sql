CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- one organization per new signup; starts a self-managed 30-day free trial.
  v_slug_base := nullif(org_slug(v_org_name), '');
  v_slug := coalesce(v_slug_base, 'org') || '-' || substr(replace(new.id::text,'-',''),1,8);
  insert into public.organizations (name, slug, subscription_status, trial_ends_at)
  values (v_org_name, v_slug, 'trial', now() + interval '30 days')
  returning id into v_org_id;

  -- org-admin grant (org admin = building_admin @ organization scope)
  insert into public.access_grants (user_id, role, scope_type, scope_id)
  values (new.id, 'building_admin', 'organization', v_org_id);

  return new;
end;
$function$;
