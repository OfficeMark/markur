-- M6 — audit walkaround triggers + helpers
--
-- Audit sessions/events tables exist from 0001 with RLS in 0003. M6 wires
-- the audit_log triggers on them, adds an index for the "active session"
-- lookup, and extends the audit_log read policy so the activity timeline
-- can read audit-events for assets the user can view.

drop trigger if exists audit_sessions_audit_log on public.audit_sessions;
create trigger audit_sessions_audit_log
after insert or update or delete on public.audit_sessions
for each row execute function public.audit_log_changes();

drop trigger if exists audit_events_audit_log on public.audit_events;
create trigger audit_events_audit_log
after insert or update or delete on public.audit_events
for each row execute function public.audit_log_changes();

-- One open session per (floor, auditor) — a partial unique index doubles as
-- a fast lookup for the "Resume audit" surface.
drop index if exists audit_sessions_active_idx;
create unique index audit_sessions_active_idx
  on public.audit_sessions(floor_id, auditor_id)
  where completed_at is null;

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
    or (
      entity_type = 'audit_sessions'
      and exists (
        select 1 from public.audit_sessions s
        join public.floors f on f.id = s.floor_id
        where s.id = audit_log.entity_id
          and (
            s.auditor_id = auth.uid()
            or public.user_can('view_audit_log', 'building', f.building_id)
          )
      )
    )
    or (
      entity_type = 'audit_events'
      and exists (
        select 1
        from public.audit_events e
        join public.audit_sessions s on s.id = e.session_id
        join public.floors f on f.id = s.floor_id
        where e.id = audit_log.entity_id
          and (
            s.auditor_id = auth.uid()
            or public.user_can('view_audit_log', 'building', f.building_id)
            or public.user_can('view', 'floor', s.floor_id)
            or public.user_can('view', 'building', f.building_id)
          )
      )
    )
  );
