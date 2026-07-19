-- Audit path: floor_audit_paths table + RLS (one ordered pin route per floor).
--
-- RECORD MIGRATION. These objects were created out-of-band on the live demo
-- backend (Supabase project dzhrugpkodxzhjgihjkn) and are ALREADY LIVE as of
-- 2026-07-18. This file exists so the repo has the migration record; the DDL
-- was extracted verbatim from the live database. Every statement is guarded so
-- replaying it is a safe no-op that simply reconciles the migration history.

create table if not exists public.floor_audit_paths (
  floor_id   uuid primary key references public.floors(id) on delete cascade,
  path       uuid[] not null default '{}'::uuid[],
  set_by     uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.floor_audit_paths enable row level security;

-- View gates on floor-scope `audit`; create/update/delete on floor-scope `edit`
-- (create additionally pins set_by to the caller).
drop policy if exists audit_paths_view on public.floor_audit_paths;
create policy audit_paths_view on public.floor_audit_paths for select
  using (private.user_can('audit', 'floor', floor_id));

drop policy if exists audit_paths_create on public.floor_audit_paths;
create policy audit_paths_create on public.floor_audit_paths for insert
  with check (set_by = auth.uid() and private.user_can('edit', 'floor', floor_id));

drop policy if exists audit_paths_update on public.floor_audit_paths;
create policy audit_paths_update on public.floor_audit_paths for update
  using (private.user_can('edit', 'floor', floor_id))
  with check (private.user_can('edit', 'floor', floor_id));

drop policy if exists audit_paths_delete on public.floor_audit_paths;
create policy audit_paths_delete on public.floor_audit_paths for delete
  using (private.user_can('edit', 'floor', floor_id));

drop trigger if exists floor_audit_paths_set_updated_at on public.floor_audit_paths;
create trigger floor_audit_paths_set_updated_at before update on public.floor_audit_paths
  for each row execute function set_updated_at();

drop trigger if exists floor_audit_paths_audit_log on public.floor_audit_paths;
create trigger floor_audit_paths_audit_log after insert or delete or update on public.floor_audit_paths
  for each row execute function audit_log_changes_floor_paths();
