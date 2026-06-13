CREATE POLICY "building_photos_guest_share_read"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'building-photos'
  AND EXISTS (
    SELECT 1
    FROM public.building_shares bs
    JOIN public.buildings b ON b.id = bs.building_id
    WHERE b.id = storage_building_photo_building_id(objects.name)
      AND bs.revoked_at IS NULL
      AND (bs.expires_at IS NULL OR bs.expires_at > now())
  )
);
