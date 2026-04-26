-- Per-pin lock. New pins start unlocked so the placer (or any user with
-- edit on the building) can nudge the position. Once locked, repositioning
-- requires unlocking it first — only edit-capable users can flip the bit.
--
-- The audit_log_changes trigger on public.assets already records changes to
-- this column, so every lock / unlock / move generates an audit entry.

alter table public.assets
  add column is_locked boolean not null default false;

comment on column public.assets.is_locked is
  'When true, the pin position is committed and only edit-capable users can move it. New pins are unlocked so the placer can adjust before committing.';
