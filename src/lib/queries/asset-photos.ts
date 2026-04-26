import { supabase } from '@/lib/supabase';
import type { AssetPhoto } from '@/types/database';

/**
 * One asset can have many photos. Path scheme is `<asset_id>/<photo_id>.<ext>`
 * (per migration 0009). The matching public.asset_photos row is the source of
 * truth — the storage object is just the binary.
 */

export const ASSET_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const ASSET_PHOTO_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AssetPhotoMime = (typeof ASSET_PHOTO_MIMES)[number];

export function validateAssetPhotoFile(file: File): string | null {
  if (file.size > ASSET_PHOTO_MAX_BYTES) {
    return `${file.name}: too large (limit 8 MB).`;
  }
  if (!(ASSET_PHOTO_MIMES as readonly string[]).includes(file.type)) {
    return `${file.name}: unsupported type. Use PNG, JPG, or WebP.`;
  }
  return null;
}

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
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

export async function signedAssetPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('asset-photos')
    .createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}
