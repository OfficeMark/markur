-- =========================================================================
-- markur-changes: zone column on assets (add/edit dialog redesign)
-- =========================================================================
--
-- The redesigned add/edit asset dialog adds a free-text "zone" to the LOCATION
-- band (e.g. "Reception", "Parkade", "Wing B"). v1 just stores it; it becomes
-- a filter facet in a later pass. The dialog offers suggestions drawn from
-- zones already used on the same floor — that's a client-side distinct over
-- this column, no DB support needed.
--
-- Plain nullable text. No trigger, no backfill, no new RLS: the existing
-- row-level policies on public.assets already gate insert/update/select, and
-- table-level column privileges cover a new column automatically.
--
-- CC authored this; web Claude applies it on DEMO first, then it is reconciled
-- back into the repo byte-faithful (same flow as the guest-viewer migrations).
-- =========================================================================

alter table public.assets
  add column if not exists zone text;
