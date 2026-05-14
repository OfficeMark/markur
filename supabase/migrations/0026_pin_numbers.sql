-- =========================================================================
-- markur-changes: sequential pin ID numbers
-- =========================================================================
--
-- Every pin (an `assets` row) gets a per-floor sequential number — 1, 2, 3, …
-- — assigned once at insert and never changed. It is a stable, client-facing
-- reference number ("pin #003"), so:
--
--   * Numbers are NOT reused. A deleted pin keeps its number; the next insert
--     still takes max+1. Like a receipt number — monotonic per floor.
--   * Different floors have independent counters.
--   * Display formatting (zero-pad to 3 digits) is a UI concern. The database
--     stores a plain integer.
-- =========================================================================

alter table public.assets
  add column if not exists pin_number integer;

-- Backfill existing rows: number every asset per floor by creation order.
-- Soft-deleted assets are included so live pins keep stable numbers and the
-- monotonic counter never collides with a tombstoned number.
with numbered as (
  select
    id,
    row_number() over (
      partition by floor_id
      order by created_at, id
    ) as rn
  from public.assets
)
update public.assets a
set pin_number = numbered.rn
from numbered
where numbered.id = a.id
  and a.pin_number is null;

-- One number per (floor, pin_number). Belt-and-suspenders against any race
-- the trigger's advisory lock somehow misses.
create unique index if not exists assets_floor_pin_number_idx
  on public.assets (floor_id, pin_number)
  where pin_number is not null;

-- Assign the next number on insert. An advisory lock keyed on the floor
-- serializes concurrent inserts on the SAME floor (different floors do not
-- contend), so two pins dropped at once cannot grab the same number.
-- SECURITY DEFINER so the max() always sees every asset on the floor —
-- including soft-deleted ones — regardless of the caller's RLS visibility.
create or replace function public.assign_pin_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pin_number is null then
    perform pg_advisory_xact_lock(hashtext(new.floor_id::text));
    select coalesce(max(pin_number), 0) + 1
      into new.pin_number
      from public.assets
      where floor_id = new.floor_id;
  end if;
  return new;
end
$$;

drop trigger if exists assign_pin_number on public.assets;
create trigger assign_pin_number
before insert on public.assets
for each row execute function public.assign_pin_number();
