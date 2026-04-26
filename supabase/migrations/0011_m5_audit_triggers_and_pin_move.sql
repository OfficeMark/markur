-- =========================================================================
-- M5 — audit_log triggers on the rest of the M-class tables, plus a
-- dedicated pin.move trigger so reposition events show up cleanly in the
-- activity timeline.
-- =========================================================================
--
-- M4 added the generic audit_log_changes trigger on `assets` only. Per
-- spec 07 § M5, the same trigger now fires on `floors`, `buildings`,
-- `flags`, `access_grants`. The function itself was defined in 0007 and is
-- reused as-is — it writes <op>.<table_name> as the action, and the full
-- row before/after as JSONB. Soft-deletes (which look like UPDATEs that
-- flip deleted_at from null → non-null) flow through the generic trigger;
-- the activity timeline can detect them by inspecting before/after.

-- Floors -------------------------------------------------------------------
drop trigger if exists floors_audit_log on public.floors;
create trigger floors_audit_log
after insert or update or delete on public.floors
for each row execute function public.audit_log_changes();

-- Buildings ----------------------------------------------------------------
drop trigger if exists buildings_audit_log on public.buildings;
create trigger buildings_audit_log
after insert or update or delete on public.buildings
for each row execute function public.audit_log_changes();

-- Flags --------------------------------------------------------------------
drop trigger if exists flags_audit_log on public.flags;
create trigger flags_audit_log
after insert or update or delete on public.flags
for each row execute function public.audit_log_changes();

-- Access grants ------------------------------------------------------------
drop trigger if exists access_grants_audit_log on public.access_grants;
create trigger access_grants_audit_log
after insert or update or delete on public.access_grants
for each row execute function public.audit_log_changes();


-- =========================================================================
-- Dedicated pin-move trigger on assets.
-- =========================================================================
--
-- The generic `update.assets` row from audit_log_changes captures every
-- column (x, y, status, is_locked, etc.) so it's good for forensics.
-- This second trigger writes a more focused `pin.move` row only when the
-- coordinates actually changed, with before/after = {x, y}. The activity
-- timeline can then render "Pin moved" as a first-class action without
-- having to diff jsonb in the UI.

create or replace function public.audit_log_pin_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log(user_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    'pin.move',
    'assets',
    new.id,
    jsonb_build_object('x', old.x, 'y', old.y),
    jsonb_build_object('x', new.x, 'y', new.y)
  );
  return new;
end;
$$;

drop trigger if exists assets_audit_log_pin_move on public.assets;
create trigger assets_audit_log_pin_move
after update on public.assets
for each row
when (old.x is distinct from new.x or old.y is distinct from new.y)
execute function public.audit_log_pin_move();


-- =========================================================================
-- Extend audit_log read access so the activity timeline can read entries on
-- flags (via the parent asset's building) without weakening the existing
-- buildings/assets/floors paths.
-- =========================================================================
--
-- The existing policy "audit_log_read" (defined in 0007) covers buildings,
-- assets, floors. Drop and recreate to fold in the new branches.

drop policy if exists "audit_log_read" on public.audit_log;

create policy "audit_log_read"
  on public.audit_log for select
  using (
    public.user_can('view_audit_log', 'global', null)
    or (
      entity_type = 'buildings'
      and public.user_can('view_audit_log', 'building', entity_id)
    )
    or (
      -- An entry on an asset is readable iff the user can view that asset.
      entity_type = 'assets'
      and exists (
        select 1
        from public.assets a
        join public.floors f on f.id = a.floor_id
        where a.id = audit_log.entity_id
          and (
            public.user_can('view', 'floor', a.floor_id)
            or public.user_can('view', 'building', f.building_id)
            or (a.tenant_scope_id is not null and public.user_can('view', 'tenant', a.tenant_scope_id))
          )
      )
    )
    or (
      -- Entries on floors readable iff user can view the floor.
      entity_type = 'floors'
      and exists (
        select 1 from public.floors f
        where f.id = audit_log.entity_id
          and (
            public.user_can('view', 'floor', f.id)
            or public.user_can('view', 'building', f.building_id)
          )
      )
    )
    or (
      -- Entries on flags readable iff the user can view the underlying asset.
      entity_type = 'flags'
      and exists (
        select 1
        from public.flags fl
        join public.assets a on a.id = fl.asset_id
        join public.floors f on f.id = a.floor_id
        where fl.id = audit_log.entity_id
          and (
            public.user_can('view', 'floor', a.floor_id)
            or public.user_can('view', 'building', f.building_id)
            or (a.tenant_scope_id is not null and public.user_can('view', 'tenant', a.tenant_scope_id))
          )
      )
    )
    -- access_grants, tenants, organizations, pending_invitations: only
    -- readable via the global view_audit_log capability (super_admin).
    -- Building-admin scoped audit access for these can be added later when
    -- the access management UI lands in M7.
  );
