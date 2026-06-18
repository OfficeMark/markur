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
export const ASSET_PHOTO_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AssetPhotoMime = (typeof ASSET_PHOTO_MIMES)[number];

/** `accept` value for photo file inputs. HEIC/HEIF allowed — they upload raw and
 *  are served via the Storage image transform (WO-3). */
export const PHOTO_ACCEPT =
  'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif';

/**
 * HEIC/HEIF detection. Checks the MIME type AND the filename extension, because
 * Windows Chrome frequently reports an empty `file.type` for `.heic` files.
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
      cacheControl: '0',
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
 * Batch-sign many asset-photo paths in ONE request (createSignedUrls, plural).
 * Returns a path → signed-URL map. Used to collapse the per-pin signing N+1 on
 * floor load: get_floor_view hands back every photo path at once, so we sign
 * them all in a single pass instead of one createSignedUrl per thumbnail.
 */
export async function signedAssetPhotoUrls(
  paths: string[],
  transform?: PhotoTransform
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (paths.length === 0) return out;
  // An explicit transform applies to every path (and the batch endpoint can't
  // carry one), so sign those individually; otherwise only a still-raw HEIC
  // needs a transform — batch-sign the plain JPEGs in one request.
  const perPhoto = transform ? paths : paths.filter(isHeicPath);
  if (perPhoto.length) {
    const signed = await Promise.all(
      perPhoto.map((p) =>
        supabase.storage
          .from('asset-photos')
          .createSignedUrl(p, 60 * 30, { transform: transform ?? PHOTO_FULL_TRANSFORM })
          .then((r) => [p, r.data?.signedUrl ?? null] as const)
          .catch(() => [p, null] as const)
      )
    );
    for (const [p, url] of signed) if (url) out[p] = url;
  }
  const plainPaths = transform ? [] : paths.filter((p) => !isHeicPath(p));
  if (plainPaths.length === 0) return out;
  const { data, error } = await supabase.storage
    .from('asset-photos')
    .createSignedUrls(plainPaths, 60 * 30);
  if (error) throw error;
  // Zip by index — the response preserves request order.
  (data ?? []).forEach((row, i) => {
    const p = plainPaths[i];
    if (p && row?.signedUrl) out[p] = row.signedUrl;
  });
  return out;
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
