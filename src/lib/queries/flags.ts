import { supabase } from '@/lib/supabase';
import type { Flag } from '@/types/database';
import { validateAssetPhotoFile, photoExtAndType } from '@/lib/queries/asset-photos';

/**
 * Read/write helpers for `public.flags` — service flags raised against an
 * asset. M33 wires the first frontend writer: the Audit Mode "Flag issue"
 * capture form. Photo evidence lives in the private `flag-photos` storage
 * bucket and is referenced by path in flags.photo_urls.
 */

/** Max photos on a single flag — evidence, not a gallery. */
export const FLAG_PHOTO_MAX = 5;

/** Flag photos reuse the asset-photo file rules (8 MB; JPG/PNG/WebP/HEIC). */
export const validateFlagPhotoFile = validateAssetPhotoFile;

/**
 * Upload one flag photo and return its storage path. The path scheme
 * `<asset_id>/<photo_id>.<ext>` matches asset photos, so the shared
 * storage_asset_photo_asset_id() RLS helper resolves the owning asset.
 */
async function uploadFlagPhoto(assetId: string, file: File): Promise<string> {
  const { ext, contentType } = photoExtAndType(file);
  const path = `${assetId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('flag-photos')
    .upload(path, file, { contentType, upsert: false, cacheControl: '0' });
  if (error) throw error;
  return path;
}

export async function signedFlagPhotoUrl(
  path: string,
  transform?: { width?: number; height?: number; quality?: number; resize?: 'cover' | 'contain' | 'fill' }
): Promise<string> {
  // Stored JPEGs serve plain (fast); only legacy raw HEIC needs the transform.
  const opts = /\.(heic|heif)$/i.test(path)
    ? { transform: transform ?? { width: 1200, quality: 80, resize: 'contain' as const } }
    : undefined;
  const { data, error } = await supabase.storage.from('flag-photos').createSignedUrl(path, 60 * 30, opts);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Fetch every open flag attached to assets on a building's floors. Used by
 * the building Audit Report. Returns `[]` when RLS denies the user — no
 * leaking via error.
 */
export async function listFlagsForAssets(assetIds: string[]): Promise<Flag[]> {
  if (assetIds.length === 0) return [];
  const { data, error } = await supabase
    .from('flags')
    .select('*')
    .in('asset_id', assetIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Best-effort cleanup of uploaded objects when a later step fails. */
async function removeFlagPhotos(paths: string[]): Promise<void> {
  if (paths.length > 0) {
    await supabase.storage.from('flag-photos').remove(paths).catch(() => {});
  }
}

export type CreateFlagInput = {
  assetId: string;
  description: string;
  /** Files to attach; uploaded before the flags row is inserted. */
  photos: File[];
  /** M34 item 1: optional directory contact associated with the flag. */
  contactId?: string | null;
};

/**
 * Raise a flag against an asset. Photos upload first so the flags row is
 * inserted with photo_urls already populated — an auditor can INSERT a flag
 * but not UPDATE one (flags_resolve is admin-only). Uploaded objects are
 * cleaned up if the insert fails.
 */
export async function createFlag(input: CreateFlagInput): Promise<Flag> {
  const description = input.description.trim();
  if (!description) throw new Error('A description is required to raise a flag.');

  const { data: userData } = await supabase.auth.getUser();
  const raisedBy = userData.user?.id;
  if (!raisedBy) throw new Error('You must be signed in to raise a flag.');

  const paths: string[] = [];
  try {
    for (const file of input.photos) {
      paths.push(await uploadFlagPhoto(input.assetId, file));
    }
  } catch (err) {
    await removeFlagPhotos(paths);
    throw err;
  }

  const { data, error } = await supabase
    .from('flags')
    .insert({
      asset_id: input.assetId,
      raised_by: raisedBy,
      description,
      photo_urls: paths,
      contact_id: input.contactId ?? null,
    })
    .select('*')
    .single();
  if (error) {
    await removeFlagPhotos(paths);
    throw error;
  }
  return data;
}
