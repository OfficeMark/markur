import { supabase } from '@/lib/supabase';
import type { AssetPhoto } from '@/types/database';

/**
 * One asset can have many photos. Path scheme is `<asset_id>/<photo_id>.<ext>`
 * (per migration 0009). The matching public.asset_photos row is the source of
 * truth — the storage object is just the binary.
 */

export const ASSET_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
// 'image/heic'/'image/heif' added as a DIAGNOSTIC (not the final S8): let HEIC
// through the upload untouched so we can see whether the browser renders it.
// No conversion yet — stored as-is.
export const ASSET_PHOTO_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;
export type AssetPhotoMime = (typeof ASSET_PHOTO_MIMES)[number];

export function validateAssetPhotoFile(file: File): string | null {
  if (file.size > ASSET_PHOTO_MAX_BYTES) {
    return `${file.name}: too large (limit 8 MB).`;
  }
  if (!(ASSET_PHOTO_MIMES as readonly string[]).includes(file.type)) {
    return `${file.name}: unsupported type. Use PNG, JPG, WebP, or HEIC.`;
  }
  return null;
}

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  return 'jpg';
}

export async function listAssetPhotos(assetId: string): Promise<AssetPhoto[]> {
  const { data, error } = await supabase
    .from('asset_photos')
    .select('*')
    .eq('asset_id', assetId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Map of asset_id -> first photo path for a set of assets. One query for the
 * whole floor instead of N — used to build the floor catalogue PDF.
 */
export async function listFirstPhotoPaths(
  assetIds: string[]
): Promise<Map<string, string>> {
  if (assetIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('asset_photos')
    .select('asset_id, path, sort_order')
    .in('asset_id', assetIds)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (!map.has(row.asset_id)) map.set(row.asset_id, row.path);
  }
  return map;
}

/**
 * Upload a single photo and add the matching public.asset_photos row.
 * Returns the inserted row.
 */
export async function addAssetPhoto(assetId: string, file: File): Promise<AssetPhoto> {
  // Generate the photo id ourselves so the storage path and DB row stay in sync.
  const photoId = crypto.randomUUID();
  const ext = extFromMime(file.type);
  const path = `${assetId}/${photoId}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('asset-photos')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      // PERF-3 (CODE-REVIEW-2026-07-06): paths are immutable UUIDs, so let
      // browsers/SW actually cache the bytes. '0' forced a re-download on
      // every view — the old '45s photo opens' disease in miniature.
      cacheControl: '3600',
    });
  if (uploadErr) throw uploadErr;

  const { data: userData } = await supabase.auth.getUser();
  const created_by = userData.user?.id ?? null;

  // Compute the next sort_order in a small race-tolerant way: read max + 1.
  // Two simultaneous uploads will pick the same value, but they're independent
  // photos so the tie order is harmless.
  const { data: existing } = await supabase
    .from('asset_photos')
    .select('sort_order')
    .eq('asset_id', assetId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data: inserted, error: insertErr } = await supabase
    .from('asset_photos')
    .insert({
      id: photoId,
      asset_id: assetId,
      path,
      sort_order: nextOrder,
      created_by,
    })
    .select('*')
    .single();
  if (insertErr) {
    // Best-effort cleanup of the orphan storage object.
    await supabase.storage.from('asset-photos').remove([path]).catch(() => {});
    throw insertErr;
  }
  return inserted;
}

export async function deleteAssetPhoto(photo: AssetPhoto): Promise<void> {
  // Delete DB row first (RLS-gated); storage object follows.
  const { error: dbErr } = await supabase.from('asset_photos').delete().eq('id', photo.id);
  if (dbErr) throw dbErr;
  await supabase.storage.from('asset-photos').remove([photo.path]).catch(() => {});
}

/**
 * PERF-2: sign MANY paths in one round trip (createSignedUrls, plural).
 * One call per floor instead of one per pin — pair with listFirstPhotoPaths.
 */
export async function signedAssetPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from('asset-photos')
    .createSignedUrls(paths, 60 * 30);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) map.set(row.path, row.signedUrl);
  }
  return map;
}

export async function signedAssetPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('asset-photos')
    .createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * A signed URL that forces a download instead of inline display. The
 * `download` option makes Supabase Storage return `Content-Disposition:
 * attachment; filename="…"`, so a plain anchor click saves the file to disk —
 * this works cross-origin, where the bare `download` attribute is ignored.
 */
export async function signedAssetPhotoDownloadUrl(
  path: string,
  filename: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('asset-photos')
    .createSignedUrl(path, 60 * 30, { download: filename });
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Build a friendly, filesystem-safe download filename for an asset photo,
 * e.g. ("Suite 1203 Suite plate", 0, "uuid/uuid.jpg") -> "suite-1203-suite-plate-1.jpg".
 */
export function assetPhotoDownloadName(
  assetName: string,
  index: number,
  path: string
): string {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot + 1).toLowerCase() : 'jpg';
  const base =
    assetName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'asset-photo';
  return `${base}-${index + 1}.${ext}`;
}
