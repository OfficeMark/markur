-- =========================================================================
-- markur-changes: building photo on the guest claim screen (refinement #5)
-- =========================================================================
--
-- The pre-auth claim screen (/share/:token) shows only what peek returns, and
-- building photos live in a PRIVATE bucket — so an anonymous visitor can't load
-- one today. Two scoped changes let the hero photo appear on the claim card:
--
--   1. peek_building_share() also returns the building's photo path.
--   2. Anon may READ a building-photos object ONLY for a building that has an
--      active (not revoked, not expired) share. No blanket public access.
--
-- CC authored this spec + built the frontend (it already reads `photo_url` from
-- peek and resolves a signed URL, degrading to no-photo until this lands).
-- WEB CLAUDE applies on DEMO first, then it's reconciled into the repo
-- byte-faithful (same flow as the zone column). The exact SQL below mirrors the
-- live function's shape — adjust to match the deployed definition.
-- =========================================================================

-- 1) peek_building_share: add photo_url to the returned jsonb. The function is
--    SECURITY DEFINER and already resolves the share's building; add the
--    building's photo_url (the storage path) to its json_build_object(...).
--
--    e.g. inside the existing function, the 'ok' return becomes:
--      return json_build_object(
--        'status',        'ok',
--        'building_name', b.name,
--        'expires_at',    s.expires_at,
--        'photo_url',     b.photo_url      -- <- added
--      );
--    (expired/revoked/invalid branches need no photo_url; the client treats a
--    missing key as null.)

-- 2) Storage read policy: anon (and authenticated) may SELECT a building-photos
--    object whose building has an active share. Building photos are stored as
--    `<building_id>.<ext>`, so building_id is the name prefix. Guard the cast so
--    a non-uuid object name can never error the policy.
create policy "building photo readable for active share"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'building-photos'
    and name ~ '^[0-9a-fA-F-]{36}\.'
    and exists (
      select 1
      from public.building_shares s
      where s.building_id = split_part(name, '.', 1)::uuid
        and s.revoked_at is null
        and s.expires_at > now()
    )
  );
