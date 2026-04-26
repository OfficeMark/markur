-- M7 — tighten RLS so tenant_rep matches spec 04:
--   * They see ONLY their primary floor (not every floor in their building).
--   * They see ONLY their tenant's assets (or unscoped common-area assets) on that floor.
--
-- Also drop the legacy `assets.photo_url` column — replaced by `asset_photos`
-- in migration 0009; no app code reads or writes it.

create or replace function public.user_can_view_asset(p_asset public.assets)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;

  if exists (
    select 1 from public.access_grants
    where user_id = v_user and role = 'super_admin'
      and (expires_at is null or expires_at > now())
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.access_grants
    where user_id = v_user
      and role in ('building_admin','auditor')
      and (expires_at is null or expires_at > now())
  ) then
    return public.user_can('view', 'floor', p_asset.floor_id);
  end if;

  return exists (
    select 1
    from public.access_grants ag
    join public.tenants t on t.id = ag.scope_id
    where ag.user_id = v_user
      and ag.role = 'tenant_rep'
      and ag.scope_type = 'tenant'
      and t.primary_floor_id = p_asset.floor_id
      and (ag.expires_at is null or ag.expires_at > now())
      and (
        p_asset.tenant_scope_id = ag.scope_id
        or p_asset.tenant_scope_id is null
      )
  );
end;
$$;

drop policy if exists "assets_view" on public.assets;

create policy "assets_view"
  on public.assets for select
  using (public.user_can_view_asset(assets));

drop policy if exists "floors_view" on public.floors;

create policy "floors_view"
  on public.floors for select
  using (
    public.user_can('view', 'floor', id)
    or (
      public.user_can('view', 'building', building_id)
      and exists (
        select 1 from public.access_grants
        where user_id = auth.uid()
          and role in ('super_admin','building_admin','auditor')
          and (expires_at is null or expires_at > now())
      )
    )
  );

alter table public.assets drop column if exists photo_url;
