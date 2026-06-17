import { supabase } from '@/lib/supabase';
import type { Building, Json } from '@/types/database';
import type { PinShape, PinSize } from '@/lib/queries/branding';

/**
 * Set the per-building pin shape/size in `buildings.settings` (jsonb). Read-
 * modify-write so other settings keys are preserved. RLS gates this to admins
 * with `configure` on the building.
 */
export async function setBuildingPinAppearance(
  buildingId: string,
  appearance: { pin_shape: PinShape; pin_size: PinSize }
): Promise<Building> {
  const { data: existing, error: readErr } = await supabase
    .from('buildings')
    .select('settings')
    .eq('id', buildingId)
    .single();
  if (readErr) throw readErr;
  const prev =
    existing?.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings)
      ? (existing.settings as Record<string, unknown>)
      : {};
  const settings = { ...prev, pin_shape: appearance.pin_shape, pin_size: appearance.pin_size };
  const { data, error } = await supabase
    .from('buildings')
    .update({ settings: settings as unknown as Json })
    .eq('id', buildingId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Set the per-building external link config in `buildings.settings` (jsonb)
 * under `external_link`. Read-modify-write so pin appearance and other keys are
 * preserved. RLS gates this to admins with `configure` on the building.
 */
export async function setBuildingExternalLink(
  buildingId: string,
  link: { mode: 'default' | 'custom' | 'hidden'; label: string; url: string }
): Promise<Building> {
  const { data: existing, error: readErr } = await supabase
    .from('buildings')
    .select('settings')
    .eq('id', buildingId)
    .single();
  if (readErr) throw readErr;
  const prev =
    existing?.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings)
      ? (existing.settings as Record<string, unknown>)
      : {};
  const settings = {
    ...prev,
    external_link: { mode: link.mode, label: link.label.trim(), url: link.url.trim() },
  };
  const { data, error } = await supabase
    .from('buildings')
    .update({ settings: settings as unknown as Json })
    .eq('id', buildingId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function listBuildings(): Promise<Building[]> {
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getBuilding(id: string): Promise<Building | null> {
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Soft-delete a building (most destructive action; admin-gated + name-typed
 * confirm in the UI). Models floor delete one level up: stamps `deleted_at` on
 * the building AND cascades the SAME timestamp onto its live floors. Every read
 * already filters `deleted_at` (buildings list/get, floors, assets via the floor
 * join, reports), so the building and all its floors/pins/photos/flags vanish
 * everywhere — lists, god view, exports, direct floor URLs, and guest shares
 * (getBuilding returns null → the guest view shows "unavailable"). No storage
 * purge; fully recoverable via restoreBuilding.
 */
export async function softDeleteBuilding(id: string): Promise<void> {
  const deletedAt = new Date().toISOString();
  const { error: fErr } = await supabase
    .from('floors')
    .update({ deleted_at: deletedAt })
    .eq('building_id', id)
    .is('deleted_at', null);
  if (fErr) throw fErr;
  const { error } = await supabase.from('buildings').update({ deleted_at: deletedAt }).eq('id', id);
  if (error) throw error;
}

/**
 * Restore a soft-deleted building and only the floors that were cascade-deleted
 * WITH it (matching `deletedAt`), so floors deleted independently before the
 * building stay deleted. Their pins/photos/flags reappear via the same
 * visibility filters. Super-admin only (RLS).
 */
export async function restoreBuilding(id: string, deletedAt: string): Promise<void> {
  const { error } = await supabase.from('buildings').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
  const { error: fErr } = await supabase
    .from('floors')
    .update({ deleted_at: null })
    .eq('building_id', id)
    .eq('deleted_at', deletedAt);
  if (fErr) throw fErr;
}

/** Soft-deleted buildings, newest first. Super-admin only (RLS). */
export async function listDeletedBuildings(): Promise<Building[]> {
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type NewBuildingInput = {
  name: string;
  address: string;
  city: string;
  region?: string | null;
  /** M24: form picker sends this; the BEFORE-INSERT trigger raises if it's
   *  null and no inference works (no more silent org auto-creation). */
  owner_org_id?: string | null;
};

export async function createBuilding(input: NewBuildingInput): Promise<Building> {
  const { data, error } = await supabase
    .from('buildings')
    .insert({
      name: input.name,
      address: input.address,
      city: input.city,
      region: input.region ?? null,
      total_floors: 0,
      owner_org_id: input.owner_org_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Building;
}

/**
 * Insert a building WITHOUT a RETURNING read-back. The `.select()` in
 * createBuilding re-reads the new row under the `buildings` SELECT policy, which
 * a brand-new org admin can't satisfy at INSERT time — their building_admin
 * grant is only minted by the AFTER-INSERT trigger, so the read-back raises an
 * RLS violation even though the write itself succeeds. First-run onboarding
 * uses this: the write lands (and the trigger grants access), and the caller
 * refreshes grants + navigates without needing the returned row.
 */
export async function createBuildingNoReturn(input: NewBuildingInput): Promise<void> {
  const { error } = await supabase.from('buildings').insert({
    name: input.name,
    address: input.address,
    city: input.city,
    region: input.region ?? null,
    total_floors: 0,
    owner_org_id: input.owner_org_id ?? null,
  });
  if (error) throw error;
}

const BUILDING_PHOTO_BUCKET = 'building-photos';

function buildingPhotoPath(buildingId: string, file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  return `${buildingId}.${ext}`;
}

export type BuildingPhotoValidationError =
  | 'invalid-type'
  | 'too-large'
  | 'invalid-name';

export function validateBuildingPhotoFile(file: File): BuildingPhotoValidationError | null {
  if (!file.name.match(/\.(png|jpe?g|webp)$/i)) return 'invalid-type';
  if (file.size > 10 * 1024 * 1024) return 'too-large';
  return null;
}

export async function uploadBuildingPhoto(buildingId: string, file: File): Promise<Building> {
  const path = buildingPhotoPath(buildingId, file);

  const { error: uploadErr } = await supabase.storage
    .from(BUILDING_PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) throw uploadErr;

  const { data, error } = await supabase
    .from('buildings')
    .update({ photo_url: path })
    .eq('id', buildingId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function removeBuildingPhoto(buildingId: string): Promise<Building> {
  const { data: existing } = await supabase
    .from('buildings')
    .select('photo_url')
    .eq('id', buildingId)
    .maybeSingle();

  if (existing?.photo_url) {
    await supabase.storage.from(BUILDING_PHOTO_BUCKET).remove([existing.photo_url]);
  }
  const { data, error } = await supabase
    .from('buildings')
    .update({ photo_url: null })
    .eq('id', buildingId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function signedBuildingPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUILDING_PHOTO_BUCKET)
    // WO-3: transform on the way out so HEIC building photos render in any
    // browser (and cards download a resized image), bucket staying private.
    .createSignedUrl(path, 60 * 60, {
      transform: { width: 1000, quality: 78, resize: 'contain' },
    });
  if (error) throw error;
  return data?.signedUrl ?? null;
}
