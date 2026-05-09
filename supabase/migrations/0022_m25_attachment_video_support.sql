-- =========================================================================
-- M25: video attachments (and 100 MB cap)
-- =========================================================================
--
-- Extends the asset-attachments storage bucket and asset_attachments table
-- to accept short field-clip videos alongside PDFs / Office docs / images.
--
-- Changes:
--   1. Raise bucket file_size_limit from 25 MB to 100 MB (104857600 bytes).
--   2. Add video/mp4, video/quicktime, video/webm to bucket allowed_mime_types.
--   3. Drop the table CHECK constraint that capped size_bytes at 25 MB and
--      replace it with one that caps at 100 MB.
--
-- Anything larger than 100 MB needs a chunked / resumable upload path
-- (Supabase TUS endpoint), which is its own milestone — not this one.
-- =========================================================================

-- ------------------------------------------------------------------
-- Bucket: widen allowlist + bump size cap
-- ------------------------------------------------------------------
update storage.buckets
set
  file_size_limit    = 104857600,   -- 100 MB
  allowed_mime_types = array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
where id = 'asset-attachments';

-- ------------------------------------------------------------------
-- Table CHECK: replace 25 MB cap with 100 MB cap
-- ------------------------------------------------------------------
alter table public.asset_attachments
  drop constraint if exists asset_attachments_size_max;

alter table public.asset_attachments
  add constraint asset_attachments_size_max
  check (size_bytes <= 104857600);   -- 100 MB
