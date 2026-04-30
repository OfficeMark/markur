import { supabase } from '@/lib/supabase';
import type { Building } from '@/types/database';

/**
 * Per CLAUDE.md: server data goes through TanStack Query, never raw
 * `await supabase.from(...)` inside components. This file is the only place
 * that talks to public.buildings — components call the wrappers via the
 * useBuildings* hooks.
 */
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

// =========================================================================
// Building photos (M10b)
// =========================================================================

const BUILDING_PHOTO_BUCKET = 'building-photos';

/**
 * Path scheme: `<building_id>.<ext>` (single hero photo per building).
 * Per migration 0014's storage policies, only edit-capable users can write.
 */
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

/**
 * Generates a 1-hour signed URL for a building photo. Used by the Home
 * card thumbnail and the Building hero. We don't memoize — TanStack Query
 * handles caching at the hook layer.
 */
export async function signedBuildingPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUILDING_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
