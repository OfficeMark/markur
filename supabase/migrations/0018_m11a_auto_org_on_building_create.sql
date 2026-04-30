-- M11a: when a user creates a building (M10h flow) we auto-attach an
-- organization so per-org features (custom asset types, etc.) work
-- immediately. Logic:
--   1. If NEW.owner_org_id is already set, leave it.
--   2. Otherwise look for an existing org the user already admins on
--      another building - reuse that.
--   3. Otherwise create a fresh organization named after the user
--      (display_name or email) and use that.
-- Runs BEFORE INSERT so the value is persisted on the same row. The
-- existing AFTER INSERT trigger (grant_creator_building_admin) keeps
-- handing the creator a building_admin grant.

create or replace function public.set_building_owner_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_user_email text;
  v_user_name text;
  v_org_name text;
  v_slug text;
begin
  if new.owner_org_id is not null then
    return new;
  end if;

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
    select email, display_name into v_user_email, v_user_name
    from public.profiles where id = auth.uid();

    v_org_name := coalesce(v_user_name, v_user_email, 'My organization');
    v_slug := lower(regexp_replace(v_org_name, '[^a-z0-9]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
    if length(v_slug) = 0 then
      v_slug := 'org';
    end if;
    v_slug := substring(v_slug, 1, 40) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.organizations (name, slug)
    values (v_org_name, v_slug)
    returning id into v_org_id;
  end if;

  new.owner_org_id := v_org_id;
  return new;
end;
$$;

drop trigger if exists buildings_auto_set_org on public.buildings;
create trigger buildings_auto_set_org
  before insert on public.buildings
  for each row execute function public.set_building_owner_org();

-- Backfill: any buildings with null owner_org_id today get an org now.
do $$
declare
  r record;
  v_org_id uuid;
begin
  for r in
    select b.id as building_id, ag.user_id, p.email, p.display_name
    from public.buildings b
    join public.access_grants ag on ag.scope_type = 'building' and ag.scope_id = b.id and ag.role = 'building_admin'
    left join public.profiles p on p.id = ag.user_id
    where b.owner_org_id is null
      and b.deleted_at is null
  loop
    select b2.owner_org_id into v_org_id
    from public.access_grants ag2
    join public.buildings b2 on b2.id = ag2.scope_id
    where ag2.user_id = r.user_id
      and ag2.role = 'building_admin'
      and ag2.scope_type = 'building'
      and b2.owner_org_id is not null
      and b2.deleted_at is null
    limit 1;

    if v_org_id is null then
      insert into public.organizations (name, slug)
      values (
        coalesce(r.display_name, r.email, 'My organization'),
        lower(regexp_replace(coalesce(r.display_name, r.email, 'org'), '[^a-z0-9]+', '-', 'g'))
        || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
      )
      returning id into v_org_id;
    end if;

    update public.buildings set owner_org_id = v_org_id where id = r.building_id;
  end loop;
end$$;
