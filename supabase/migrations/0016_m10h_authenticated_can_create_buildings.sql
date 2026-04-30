-- M10h: let any authenticated user create a new building (was super-only).
-- The creator auto-gets a building_admin grant on the new building so they
-- can immediately manage it. Keeps the original super-delete policy.

drop policy if exists "buildings_super_create" on public.buildings;

create policy "buildings_authenticated_create"
  on public.buildings for insert
  with check (auth.uid() is not null);

-- Auto-grant building_admin to the creator. SECURITY DEFINER so the
-- access_grants insert isn't blocked by access_grants' own RLS (which
-- normally requires manage_access on the scope).
create or replace function public.grant_creator_building_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    insert into public.access_grants (user_id, role, scope_type, scope_id, granted_by)
    values (auth.uid(), 'building_admin', 'building', new.id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists buildings_auto_grant_creator on public.buildings;
create trigger buildings_auto_grant_creator
  after insert on public.buildings
  for each row execute function public.grant_creator_building_admin();
