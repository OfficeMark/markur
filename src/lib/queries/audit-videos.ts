import { supabase } from '@/lib/supabase';
import type { AuditVideoRow } from '@/types/database';

/**
 * Audit videos — short MediaRecorder clips captured during a walkaround.
 *
 * Always scoped to a building. Optionally attached to a specific asset
 * (when the auditor had a pin selected at record time). Storage path
 * scheme: audit-videos/<building_id>/<video_id>.<ext> — first segment
 * drives the bucket RLS check (see migration 0025).
 *
 * Playback uses time-limited signed URLs; clips are never public.
 */

export type AuditVideo = AuditVideoRow;

export const AUDIT_VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100 MB, mirrors bucket cap.
export const AUDIT_VIDEO_MAX_DURATION_SECONDS = 180; // 3 minutes (briefing).
export const AUDIT_VIDEO_BITRATE = 1_500_000; // 1.5 Mbps (briefing).

export const AUDIT_VIDEO_MIMES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

function extFromMime(mime: string): string {
  if (mime.startsWith('video/mp4')) return 'mp4';
  if (mime.startsWith('video/quicktime')) return 'mov';
  return 'webm';
}

/** All videos for a building, newest first. Powers the building-level list and the asset-level filter. */
export async function listBuildingAuditVideos(buildingId: string): Promise<AuditVideo[]> {
  const { data, error } = await supabase
    .from('audit_videos')
    .select('*')
    .eq('building_id', buildingId)
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AuditVideo[];
}

/** Videos for one asset, newest first. */
export async function listAssetAuditVideos(assetId: string): Promise<AuditVideo[]> {
  const { data, error } = await supabase
    .from('audit_videos')
    .select('*')
    .eq('asset_id', assetId)
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AuditVideo[];
}

/** Which asset_ids in the given list have at least one video — used by the grid badge. */
export async function assetsWithVideos(assetIds: string[]): Promise<Set<string>> {
  if (assetIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('audit_videos')
    .select('asset_id')
    .in('asset_id', assetIds);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.asset_id) set.add(row.asset_id);
  }
  return set;
}

export type AddAuditVideoInput = {
  buildingId: string;
  assetId: string | null;
  blob: Blob;
  durationSeconds: number;
  notes?: string | null;
};

/** Upload the blob to storage and insert the matching row. Cleans up the blob if the row insert fails. */
export async function addAuditVideo(input: AddAuditVideoInput): Promise<AuditVideo> {
  const id = crypto.randomUUID();
  const mime = input.blob.type || 'video/webm';
  const ext = extFromMime(mime);
  const path = `${input.buildingId}/${id}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('audit-videos')
    .upload(path, input.blob, {
      contentType: mime,
      upsert: false,
      cacheControl: '0',
    });
  if (uploadErr) throw uploadErr;

  const { data: userData } = await supabase.auth.getUser();
  const created_by = userData.user?.id ?? null;

  const { data, error } = await supabase
    .from('audit_videos')
    .insert({
      id,
      building_id: input.buildingId,
      asset_id: input.assetId,
      storage_path: path,
      duration_seconds: Math.max(0, Math.round(input.durationSeconds)),
      notes: input.notes ?? null,
      created_by,
    })
    .select('*')
    .single();

  if (error) {
    await supabase.storage.from('audit-videos').remove([path]).catch(() => {});
    throw error;
  }
  return data as AuditVideo;
}

export async function deleteAuditVideo(video: AuditVideo): Promise<void> {
  const { error } = await supabase.from('audit_videos').delete().eq('id', video.id);
  if (error) throw error;
  await supabase.storage.from('audit-videos').remove([video.storage_path]).catch(() => {});
}

/** 60-min signed URL for playback. Long enough to scrub through a 3-min clip. */
export async function signedAuditVideoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('audit-videos')
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
