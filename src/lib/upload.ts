import { supabase } from './supabase';

export const PLAN_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Floor-plan accept list. PDF + standard web image formats + HEIC/HEIF
// (iPhones produce HEIC by default; rejecting it forced mobile users to
// convert before uploading, which M25-floor-fix removed). SVG accepted
// for vector floor plans (markur-changes feature).
//
// Mirrored in the storage.buckets.allowed_mime_types for `floor-plans`
// (pdf/png/jpeg/webp/heic/heif + image/svg+xml). SVG is now allowed at the
// bucket layer, so uploads must set contentType explicitly: a Blob sent
// without it goes up as application/octet-stream and the allowlist rejects it.
export const PLAN_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type PlanMime = (typeof PLAN_MIME_TYPES)[number];

export type ValidationError =
  | { code: 'too_large'; message: string }
  | { code: 'wrong_type'; message: string };

export function validatePlanFile(file: File): ValidationError | null {
  if (file.size > PLAN_MAX_BYTES) {
    return {
      code: 'too_large',
      message: `This file is ${formatBytes(file.size)}. Floor plans must be under ${formatBytes(PLAN_MAX_BYTES)} -- try compressing the PDF or reducing image resolution.`,
    };
  }
  if (!(PLAN_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      code: 'wrong_type',
      message: `We can't read this file format (${file.type || 'unknown'}). Floor plans should be PDF, JPG, PNG, WebP, HEIC, or SVG.`,
    };
  }
  return null;
}

const MIME_EXT: Record<PlanMime, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function extForMime(mime: PlanMime): string {
  return MIME_EXT[mime];
}

export function objectNameForFloor(floorId: string, mime: PlanMime): string {
  return `${floorId}.${extForMime(mime)}`;
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
      cacheControl: '0', // never cache -- we want replaces to take effect
    });
  if (error) throw error;
  return { path };
}

/**
 * Upload a produced object (e.g. a Plan Prep cleaned plate) to the floor's
 * storage slot at `<floorId>.<ext>`. The original upload lives at a different
 * extension (e.g. `<floorId>.pdf`), so both coexist — the RLS helper keys off
 * the `<uuid>.` prefix, which matches either. `ext` must be a plan extension
 * the bucket allows (svg requires the bucket MIME allowlist to include it).
 */
export async function uploadPlanObject(
  floorId: string,
  blob: Blob,
  ext: string,
  contentType: string
): Promise<{ path: string }> {
  const path = `${floorId}.${ext}`;
  const { error } = await supabase.storage.from('floor-plans').upload(path, blob, {
    contentType,
    upsert: true,
    cacheControl: '0',
  });
  if (error) throw error;
  return { path };
}

/**
 * Canonical storage path for a floor's processed display plate (Plan Prep v2).
 * Always PNG, always `<floorId>.plate.png` — distinct from the retained original
 * (`<floorId>.<origext>`) so both coexist. The RLS helper keys off the
 * `<uuid>.` prefix, which matches this too.
 */
export function platePathForFloor(floorId: string): string {
  return `${floorId}.plate.png`;
}

/** Upload the processed display PNG to the floor's canonical plate slot. */
export async function uploadDisplayPlate(
  floorId: string,
  blob: Blob
): Promise<{ path: string }> {
  const path = platePathForFloor(floorId);
  const { error } = await supabase.storage.from('floor-plans').upload(path, blob, {
    contentType: 'image/png',
    upsert: true,
    cacheControl: '0',
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

/**
 * The plan's refresh stamp — what actually changes when a plan is REPLACED.
 *
 * Plan Prep v2 writes every display plate to the floor's canonical storage
 * slot (`<floorId>.plate.png`, upsert) and the retained original to
 * `<floorId>.<ext>`, so replacing a plan rewrites `floors.plan_url` with the
 * SAME string it already held. Anything keyed on the path alone therefore
 * never re-runs — the old image stays on screen until a hard reload (the
 * "Replace does nothing" bug). The `planPrep.processedAt` stamp in
 * `floors.plan_metadata` is rewritten on EVERY upload (both the plate path and
 * the processing-fallback path), so `plan_url + stamp` changes exactly when
 * the plan does. Returns null when there is no v2 stamp (pre-v2 floors) —
 * for those a replace changes the path itself (they gain the `.plate.png`
 * slot), so the path is a sufficient key.
 */
export function planRefreshStamp(planMetadata: unknown): string | null {
  const stamp = (
    planMetadata as { planPrep?: { processedAt?: unknown } } | null | undefined
  )?.planPrep?.processedAt;
  return typeof stamp === 'string' ? stamp : null;
}

export function planKindForPath(path: string | null | undefined): 'pdf' | 'image' | null {
  if (!path) return null;
  if (path.endsWith('.pdf')) return 'pdf';
  // SVG renders through the same image path as PNG/JPG (the browser
  // rasterizes it onto the canvas in FloorPlanCanvas).
  if (/\.(png|jpe?g|webp|heic|heif|svg)$/i.test(path)) return 'image';
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Map a thrown error from the floor-create or floor-plan-upload flow to a
 * user-actionable message. The catch-all is honest: it includes the
 * original error text instead of swallowing it into "Could not create the
 * floor" (the generic message that hid the M25-floor-fix unique-violation
 * bug from view for two days).
 *
 * `ctx` tells the caller whether the floor row already exists ('upload'
 * context) so the message can reassure: the floor was created, retry the
 * upload from the floor view.
 */
export function floorErrorMessage(err: unknown, ctx: 'create' | 'upload'): string {
  const e = (err ?? {}) as {
    code?: string;
    status?: number;
    statusCode?: number;
    message?: string;
    error?: { code?: string; message?: string };
  };
  const code = e.code ?? e.error?.code ?? '';
  const status = e.status ?? e.statusCode ?? 0;
  const msg = (e.message ?? e.error?.message ?? '').toString();

  // Auth / session expiry -- fires across both contexts.
  if (status === 401 || /jwt expired|invalid jwt|session.*expired|not authenticated/i.test(msg)) {
    return 'Your session expired. Please sign in again.';
  }

  // Postgres RLS denial -- user genuinely lacks permission.
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return "You don't have permission to add floors to this building. Ask the building admin for access.";
  }

  // Postgres unique violation (the M25-floor-fix bug, in case the partial
  // index regresses or another unique key starts colliding).
  if (code === '23505') {
    return 'A naming or ordering conflict prevented creating this floor. Try again in a moment. If it keeps happening, contact randy@officemark.ca.';
  }

  // Postgres FK / NOT NULL violations -- payload is invalid.
  if (code === '23503' || code === '23502') {
    return `This floor's data is invalid (${code}: ${msg || 'unknown'}). Contact randy@officemark.ca if this keeps happening.`;
  }

  if (ctx === 'upload') {
    if (status === 413 || /payload too large|exceeds.*limit/i.test(msg)) {
      return 'This file is too large. Floor plans must be under 25 MB. Try compressing the PDF or reducing the image resolution.';
    }
    if (/mime|content.?type|invalid_mime_type|unsupported/i.test(msg)) {
      return "We can't read this file format. Floor plans should be PDF, JPG, PNG, WebP, HEIC, or SVG.";
    }
    if (status === 0 || /network|fetch|failed to fetch|timeout/i.test(msg)) {
      return "Couldn't upload the floor plan. Check your connection and try again. If this keeps happening, contact randy@officemark.ca.";
    }
    if (/corrupt|damaged|invalid (image|pdf|file)|cannot decode/i.test(msg)) {
      return 'The file appears to be damaged or unreadable. Try opening it in another app and re-saving, or try a different file.';
    }
    return `Couldn't upload the floor plan: ${msg || 'unknown error'}. The floor was created -- you can try uploading from the floor view.`;
  }

  // Generic fallback for create context: include the actual error text so
  // the message is diagnostic instead of useless.
  return `Couldn't create the floor: ${msg || 'unknown error'}. If this keeps happening, contact randy@officemark.ca.`;
}
