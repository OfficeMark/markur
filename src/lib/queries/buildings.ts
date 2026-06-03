import { supabase } from '@/lib/supabase';
import type { Building } from '@/types/database';

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
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
