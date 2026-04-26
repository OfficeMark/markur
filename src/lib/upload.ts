import { supabase } from './supabase';

export const PLAN_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const PLAN_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export type PlanMime = (typeof PLAN_MIME_TYPES)[number];

export type ValidationError =
  | { code: 'too_large'; message: string }
  | { code: 'wrong_type'; message: string };

export function validatePlanFile(file: File): ValidationError | null {
  if (file.size > PLAN_MAX_BYTES) {
    return {
      code: 'too_large',
      message: `File is ${formatBytes(file.size)} — limit is ${formatBytes(PLAN_MAX_BYTES)}.`,
    };
  }
  if (!(PLAN_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      code: 'wrong_type',
      message: `Unsupported file type "${file.type || 'unknown'}". Use PDF, PNG, or JPG.`,
    };
  }
  return null;
}

export function objectNameForFloor(floorId: string, mime: PlanMime): string {
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  return `${floorId}.${ext}`;
}

export async function uploadFloorPlan(
  floorId: string,
  file: File
): Promise<{ path: string }> {
  const mime = file.type as PlanMime;
  const path = objectNameForFloor(floorId, mime);
  const { error } = await supabase.storage
    .from('floor-plans')
    .upload(path, file, {
      contentType: mime,
      upsert: true,
      cacheControl: '0', // never cache — we want replaces to take effect
    });
  if (error) throw error;
  return { path };
}

/**
 * Get a short-lived signed URL for the floor's plan. Plans are private.
 */
export async function signedUrlForPlan(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('floor-plans')
    .createSignedUrl(path, 60 * 30); // 30 minutes
  if (error) throw error;
  return data.signedUrl;
}

export function planKindForPath(path: string | null | undefined): 'pdf' | 'image' | null {
  if (!path) return null;
  if (path.endsWith('.pdf')) return 'pdf';
  if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image';
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
