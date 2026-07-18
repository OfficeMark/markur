import { supabase } from '@/lib/supabase';
import type { AssetPhoto } from '@/types/database';

/**
 * Image-transform options for signed URLs (WO-3). Serving photos through the
 * Storage render endpoint converts HEIC (and resizes JPEGs) to a web format the
 * browser can decode — so iPhone HEICs render in desktop Chrome without any
 * client-side conversion, while the bucket stays private.
 */
export type PhotoTransform = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill';
};

// Sensible defaults per surface.
export const PHOTO_THUMB_TRANSFORM: PhotoTransform = { width: 400, quality: 72, resize: 'contain' };
export const PHOTO_FULL_TRANSFORM: PhotoTransform = { width: 1400, quality: 82, resize: 'contain' };

/**
 * HEIC is converted to a stored JPEG ON-DEVICE before upload (see lib/image-
 * convert), so stored objects are normal JPEGs. Serving rule: an explicitly
 * requested transform ALWAYS applies (cheap on a JPEG — used for grid/PDF thumbs
 * to keep them light); with no transform, a JPEG serves PLAIN (full res, e.g. the
 * full-screen viewer) and a still-raw HEIC gets the transform as a fallback.
 */
function isHeicPath(path: string): boolean {
  return /\.(heic|heif)$/i.test(path);
}

/**
 * One asset can have many photos. Path scheme is `<asset_id>/<photo_id>.<ext>`
 * (per migration 0009). The matching public.asset_photos row is the source of
 * truth — the storage object is just the binary.
 */

export const ASSET_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
// S8 final: displayable web formats only — HEIC is accepted at the PICKER
// (see PHOTO_ACCEPT + isHeicFile) and converted to JPEG before upload by
// lib/image-convert.ts, so the stored object is always displayable.
export const ASSET_PHOTO_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AssetPhotoMime = (typeof ASSET_PHOTO_MIMES)[number];

/** `accept` value for photo file inputs — HEIC/HEIF included by ext AND MIME. */
export const PHOTO_ACCEPT =
  'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif';

/**
 * HEIC/HEIF detection: MIME type AND filename extension, because Windows
 * Chrome frequently hands over `.heic` files with an EMPTY `file.type`
 * (the empty-MIME gotcha from the 2026-06-21 diagnostic).
 */
export function isHeicFile(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(file.name);
}

/** Resolve the storage extension + contentType for an upload (HEIC-aware). */
export function photoExtAndType(file: File): { ext: string; contentType: string } {
  if (isHeicFile(file)) {
    const isHeif = /\.heif$/i.test(file.name) || (file.type || '').toLowerCase() === 'image/heif';
    return isHeif
      ? { ext: 'heif', contentType: 'image/heif' }
      : { ext: 'heic', contentType: 'image/heic' };
  }
  const t = (file.type || '').toLowerCase();
  if (t === 'image/png') return { ext: 'png', contentType: 'image/png' };
  if (t === 'image/webp') return { ext: 'webp', contentType: 'image/webp' };
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

export function validateAssetPhotoFile(file: File): string | null {
  if (file.size > ASSET_PHOTO_MAX_BYTES) {
    return `${file.name}: too large (limit 8 MB).`;
  }
  if (!isHeicFile(file) && !(ASSET_PHOTO_MIMES as readonly string[]).includes(file.type)) {
    return `${file.name}: unsupported type. Use a JPG, PNG, WebP, or HEIC.`;
  }
  return null;
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
  const { ext, contentType } = photoExtAndType(file);
  const path = `${assetId}/${photoId}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('asset-photos')
    .upload(path, file, {
      // Explicit contentType: Windows Chrome reports empty file.type for .heic,
      // and we must store it as image/heic so the transform endpoint reads it.
      contentType,
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

export async function signedAssetPhotoUrl(
  path: string,
  transform?: PhotoTransform
): Promise<string> {
  // Explicit transform (thumb/PDF) always applies; otherwise plain for a stored
  // JPEG (full res) and the transform fallback for a still-raw HEIC.
  const opts = transform
    ? { transform }
    : isHeicPath(path)
      ? { transform: PHOTO_FULL_TRANSFORM }
      : undefined;
  const { data, error } = await supabase.storage
    .from('asset-photos')
    .createSignedUrl(path, 60 * 30, opts);
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
  // A raw HEIC won't open on Windows, so downloads go through the transform
  // (→ JPEG) too, and the suggested filename becomes .jpg to match.
  const isHeic = /\.(heic|heif)$/i.test(path);
  const dlName = isHeic ? filename.replace(/\.(heic|heif)$/i, '.jpg') : filename;
  const { data, error } = await supabase.storage
    .from('asset-photos')
    .createSignedUrl(path, 60 * 30, {
      download: dlName,
      ...(isHeic ? { transform: { width: 2400, quality: 90 } } : {}),
    });
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
