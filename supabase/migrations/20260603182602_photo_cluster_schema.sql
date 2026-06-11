-- Resolution photos kept distinct from issue photos on a flag (two distinct records).
ALTER TABLE public.flags
  ADD COLUMN IF NOT EXISTS resolution_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Replace-with-history on asset photos: the current row has superseded_at IS NULL.
-- Replacing a photo inserts a new row and stamps the old one (image retained).
ALTER TABLE public.asset_photos
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid NULL REFERENCES public.asset_photos(id) ON DELETE SET NULL;

-- Supports the common "current photos for an asset" read.
CREATE INDEX IF NOT EXISTS asset_photos_current_idx
  ON public.asset_photos (asset_id, sort_order)
  WHERE superseded_at IS NULL;
