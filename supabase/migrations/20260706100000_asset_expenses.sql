-- Expense layer: asset_expenses table + RLS + get_expense_report RPC.
--
-- RECORD MIGRATION. These objects were created out-of-band on the live demo
-- backend (Supabase project dzhrugpkodxzhjgihjkn) and are ALREADY LIVE as of
-- 2026-07-18. This file exists so the repo has the migration record; the DDL
-- was extracted verbatim from the live database. Every statement is guarded
-- (if not exists / or replace / drop-if-exists) so replaying it is a safe
-- no-op that simply reconciles the migration history.

create table if not exists public.asset_expenses (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references public.assets(id) on delete cascade,
  flag_id      uuid references public.flags(id) on delete set null,
  amount       numeric not null check (amount >= 0),
  expense_date date not null default current_date,
  billable_to  text not null check (billable_to = any (array['tenant'::text, 'building'::text])),
  invoice_ref  text,
  note         text,
  created_by   uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists asset_expenses_asset_id_idx on public.asset_expenses using btree (asset_id);
create index if not exists asset_expenses_flag_id_idx  on public.asset_expenses using btree (flag_id) where flag_id is not null;
create index if not exists asset_expenses_date_idx     on public.asset_expenses using btree (expense_date);

alter table public.asset_expenses enable row level security;

-- View/edit/delete all gate on building-scope `edit` for the expense's asset
-- (create additionally pins created_by to the caller).
drop policy if exists expenses_view on public.asset_expenses;
create policy expenses_view on public.asset_expenses for select using (
  exists (
    select 1 from public.assets a
    where a.id = asset_expenses.asset_id
      and private.user_can('edit', 'building', (select floors.building_id from public.floors where floors.id = a.floor_id))
  )
);

drop policy if exists expenses_create on public.asset_expenses;
create policy expenses_create on public.asset_expenses for insert with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.assets a
    where a.id = asset_expenses.asset_id
      and private.user_can('edit', 'building', (select floors.building_id from public.floors where floors.id = a.floor_id))
  )
);

drop policy if exists expenses_update on public.asset_expenses;
create policy expenses_update on public.asset_expenses for update using (
  exists (
    select 1 from public.assets a
    where a.id = asset_expenses.asset_id
      and private.user_can('edit', 'building', (select floors.building_id from public.floors where floors.id = a.floor_id))
  )
) with check (
  exists (
    select 1 from public.assets a
    where a.id = asset_expenses.asset_id
      and private.user_can('edit', 'building', (select floors.building_id from public.floors where floors.id = a.floor_id))
  )
);

drop policy if exists expenses_delete on public.asset_expenses;
create policy expenses_delete on public.asset_expenses for delete using (
  exists (
    select 1 from public.assets a
    where a.id = asset_expenses.asset_id
      and private.user_can('delete', 'building', (select floors.building_id from public.floors where floors.id = a.floor_id))
  )
);

drop trigger if exists asset_expenses_set_updated_at on public.asset_expenses;
create trigger asset_expenses_set_updated_at before update on public.asset_expenses
  for each row execute function set_updated_at();

drop trigger if exists asset_expenses_audit_log on public.asset_expenses;
create trigger asset_expenses_audit_log after insert or delete or update on public.asset_expenses
  for each row execute function audit_log_changes();

-- Expense report: tenant/building totals + line items for a building over a date range.
create or replace function public.get_expense_report(p_building_id uuid, p_from date, p_to date)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with rows as (
    select e.id, e.expense_date, e.amount, e.billable_to,
           e.invoice_ref, e.note, e.flag_id,
           a.id as asset_id, a.name as asset_name, a.pin_number,
           f.id as floor_id, f.label as floor_label
    from public.asset_expenses e
    join public.assets a on a.id = e.asset_id
    join public.floors f on f.id = a.floor_id
    where f.building_id = p_building_id
      and e.expense_date >= p_from
      and e.expense_date <= p_to
      and a.deleted_at is null
      and f.deleted_at is null
  )
  select jsonb_build_object(
    'total_tenant',   coalesce((select sum(amount) from rows where billable_to = 'tenant'), 0),
    'total_building', coalesce((select sum(amount) from rows where billable_to = 'building'), 0),
    'count',          (select count(*) from rows),
    'items',          coalesce((select jsonb_agg(to_jsonb(r) order by r.expense_date desc, r.floor_label) from rows r), '[]'::jsonb)
  );
$function$;
