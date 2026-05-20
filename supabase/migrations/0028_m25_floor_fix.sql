-- M25 (floor-fix): partial unique on floors(building_id, sort_order)
-- and widen floor-plans bucket MIME types.
--
-- Numbered 0028 (after Cowork's 0025_m27_audit_videos / 0026_pin_numbers /
-- 0027_plan_tiers). Migration was originally applied via MCP under the
-- name 'm25_floor_fix' before those landed; the file's content is the
-- canonical record and is idempotent if re-applied.
--
-- Background:
--   The (building_id, sort_order) UNIQUE constraint was unconditional.
--   nextFloorSortOrder() in the app picks MAX(sort_order)+10 from LIVE
--   rows only (excludes soft-deleted), so any soft-deleted floor's slot
--   becomes a future-collision landmine -- observed 2026-05-16 with
--   Crescent School (Rosalyn deleted, sort_order=50; next-attempt picked
--   50 again, INSERT exploded with 23505 and the UI showed the generic
--   "Could not create the floor"). Same shape on SJCCC (all 7 floors
--   soft-deleted on 2026-05-13). Independently diagnosed by Cowork who
--   temp-bumped Rosalyn to sort_order=9050 to unblock Randy.
--
-- Fix (two layers):
--   1. Drop the unconditional unique constraint; replace with a partial
--      unique INDEX that only enforces uniqueness among live
--      (deleted_at IS NULL) rows. Soft-deleted floors can share a slot
--      with a live replacement.
--   2. Widen storage.buckets.allowed_mime_types for `floor-plans` to add
--      webp/heic/heif (mobile-friendly -- iPhones produce HEIC). The
--      25 MB size_limit stays.
--
-- Defense-in-depth: the app-side nextFloorSortOrder() is updated in the
-- same milestone to consider ALL rows (including soft-deleted) when
-- picking the next slot. Either change alone fixes the bug; both
-- together close the door from both sides.

-- =========================================================================
-- 1) Partial unique on (building_id, sort_order) WHERE deleted_at IS NULL
-- =========================================================================
-- Safe: the old constraint was strictly stricter than the new one, so
-- no existing data can violate the partial index.

alter table public.floors
  drop constraint if exists floors_building_id_sort_order_key;

create unique index if not exists floors_building_id_sort_order_live_key
  on public.floors (building_id, sort_order)
  where deleted_at is null;

comment on index public.floors_building_id_sort_order_live_key is
  'M25-floor-fix: partial unique on live floors only. Soft-deleted floors retain their sort_order without blocking a replacement.';

-- =========================================================================
-- 2) Broaden floor-plans bucket MIME allowlist
-- =========================================================================
-- Adds webp / heic / heif. Keeps pdf / png / jpeg. 25 MB size_limit unchanged.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif'
]
where id = 'floor-plans';
