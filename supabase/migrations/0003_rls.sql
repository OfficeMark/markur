-- Enable RLS on every public table and add policies that delegate to user_can().
-- Tightening / additional edge cases land in M5 and M7.

-- =========================================================================
-- profiles
-- =========================================================================

alter table public.profiles enable row level security;

create policy "profiles_self_read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Authenticated users can read other profiles they share a scope with — needed
-- to render names/avatars in access-management lists. Lock further in M7.
create policy "profiles_read_for_authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- =========================================================================
-- organizations
-- =========================================================================

alter table public.organizations enable row level security;

create policy "organizations_read_authenticated"
  on public.organizations for select
  using (auth.role() = 'authenticated');

create policy "organizations_super_only_write"
  on public.organizations for all
  using (public.user_can('configure', 'global', null))
  with check (public.user_can('configure', 'global', null));

-- =========================================================================
-- buildings
-- =========================================================================

alter table public.buildings enable row level security;

create policy "buildings_view"
  on public.buildings for select
  using (public.user_can('view', 'building', id));

create policy "buildings_admin_write"
  on public.buildings for update
  using (public.user_can('configure', 'building', id))
  with check (public.user_can('configure', 'building', id));

create policy "buildings_super_create"
  on public.buildings for insert
  with check (public.user_can('configure', 'global', null));

create policy "buildings_super_delete"
  on public.buildings for delete
  using (public.user_can('delete', 'global', null));

-- =========================================================================
-- floors
-- =========================================================================

alter table public.floors enable row level security;

create policy "floors_view"
  on public.floors for select
  using (
    public.user_can('view', 'floor', id)
    or public.user_can('view', 'building', building_id)
  );

create policy "floors_admin_write"
  on public.floors for update
  using (public.user_can('edit', 'building', building_id))
  with check (public.user_can('edit', 'building', building_id));

create policy "floors_admin_create"
  on public.floors for insert
  with check (public.user_can('edit', 'building', building_id));

create policy "floors_admin_delete"
  on public.floors for delete
  using (public.user_can('delete', 'building', building_id));

-- =========================================================================
-- tenants
-- =========================================================================

alter table public.tenants enable row level security;

create policy "tenants_view"
  on public.tenants for select
  using (
    public.user_can('view', 'building', building_id)
    or public.user_can('view', 'tenant', id)
  );

create policy "tenants_admin_write"
  on public.tenants for all
  using (public.user_can('edit', 'building', building_id))
  with check (public.user_can('edit', 'building', building_id));

-- =========================================================================
-- assets
-- =========================================================================

alter table public.assets enable row level security;

create policy "assets_view"
  on public.assets for select
  using (
    public.user_can('view', 'floor', floor_id)
    or (tenant_scope_id is not null and public.user_can('view', 'tenant', tenant_scope_id))
  );

create policy "assets_admin_create"
  on public.assets for insert
  with check (
    public.user_can('create', 'building', (select building_id from public.floors where id = floor_id))
  );

create policy "assets_admin_update"
  on public.assets for update
  using (
    public.user_can('edit', 'building', (select building_id from public.floors where id = floor_id))
  )
  with check (
    public.user_can('edit', 'building', (select building_id from public.floors where id = floor_id))
  );

create policy "assets_admin_delete"
  on public.assets for delete
  using (
    public.user_can('delete', 'building', (select building_id from public.floors where id = floor_id))
  );

-- =========================================================================
-- audit_sessions / audit_events
-- =========================================================================

alter table public.audit_sessions enable row level security;

create policy "audit_sessions_view_own_or_admin"
  on public.audit_sessions for select
  using (
    auditor_id = auth.uid()
    or public.user_can('view_audit_log', 'building', (select building_id from public.floors where id = floor_id))
  );

create policy "audit_sessions_create"
  on public.audit_sessions for insert
  with check (
    auditor_id = auth.uid()
    and public.user_can('audit', 'floor', floor_id)
  );

create policy "audit_sessions_update_own"
  on public.audit_sessions for update
  using (auditor_id = auth.uid())
  with check (auditor_id = auth.uid());

alter table public.audit_events enable row level security;

create policy "audit_events_view"
  on public.audit_events for select
  using (
    exists (
      select 1 from public.audit_sessions s
      where s.id = audit_events.session_id
        and (
          s.auditor_id = auth.uid()
          or public.user_can('view_audit_log', 'building', (select building_id from public.floors where id = s.floor_id))
        )
    )
  );

create policy "audit_events_create_own_session"
  on public.audit_events for insert
  with check (
    exists (
      select 1 from public.audit_sessions s
      where s.id = session_id and s.auditor_id = auth.uid()
    )
  );

-- =========================================================================
-- flags
-- =========================================================================

alter table public.flags enable row level security;

create policy "flags_view"
  on public.flags for select
  using (
    exists (
      select 1 from public.assets a
      where a.id = flags.asset_id
        and (
          public.user_can('view', 'floor', a.floor_id)
          or (a.tenant_scope_id is not null and public.user_can('view', 'tenant', a.tenant_scope_id))
        )
    )
  );

create policy "flags_create"
  on public.flags for insert
  with check (
    raised_by = auth.uid()
    and exists (
      select 1 from public.assets a
      where a.id = asset_id
        and (
          public.user_can('flag', 'floor', a.floor_id)
          or (a.tenant_scope_id is not null and public.user_can('flag', 'tenant', a.tenant_scope_id))
        )
    )
  );

create policy "flags_resolve"
  on public.flags for update
  using (
    exists (
      select 1 from public.assets a
      where a.id = flags.asset_id
        and public.user_can('resolve_flag', 'building',
          (select building_id from public.floors where id = a.floor_id))
    )
    or raised_by = auth.uid()
  );

-- =========================================================================
-- access_grants
-- =========================================================================

alter table public.access_grants enable row level security;

-- A user can see their own grants (so the front-end can build the local capability cache).
create policy "access_grants_self_read"
  on public.access_grants for select
  using (user_id = auth.uid());

-- Admins can see all grants on scopes they manage.
create policy "access_grants_admin_read"
  on public.access_grants for select
  using (
    public.user_can('manage_access', 'global', null)
    or (
      scope_type = 'building'
      and public.user_can('manage_access', 'building', scope_id)
    )
  );

-- Admins (super or building) can write.
create policy "access_grants_admin_write"
  on public.access_grants for all
  using (
    public.user_can('manage_access', 'global', null)
    or (
      scope_type = 'building'
      and public.user_can('manage_access', 'building', scope_id)
    )
  )
  with check (
    public.user_can('manage_access', 'global', null)
    or (
      scope_type = 'building'
      and public.user_can('manage_access', 'building', scope_id)
    )
  );

-- =========================================================================
-- audit_log
-- =========================================================================

alter table public.audit_log enable row level security;

create policy "audit_log_admin_read"
  on public.audit_log for select
  using (
    public.user_can('view_audit_log', 'global', null)
    or (
      entity_type = 'building'
      and public.user_can('view_audit_log', 'building', entity_id)
    )
  );

-- audit_log inserts come from triggers (security definer); not user-writable.
-- No INSERT/UPDATE/DELETE policies — table is effectively read-only for clients.

-- =========================================================================
-- pending_invitations
-- =========================================================================

alter table public.pending_invitations enable row level security;

-- Inviters and admins can read invitations they created or for scopes they manage.
create policy "pending_invitations_read"
  on public.pending_invitations for select
  using (
    invited_by = auth.uid()
    or public.user_can('manage_access', 'global', null)
    or (
      scope_type = 'building'
      and public.user_can('manage_access', 'building', scope_id)
    )
  );

create policy "pending_invitations_write"
  on public.pending_invitations for all
  using (
    public.user_can('manage_access', 'global', null)
    or (
      scope_type = 'building'
      and public.user_can('manage_access', 'building', scope_id)
    )
  )
  with check (
    public.user_can('manage_access', 'global', null)
    or (
      scope_type = 'building'
      and public.user_can('manage_access', 'building', scope_id)
    )
  );
