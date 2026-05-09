import { supabase } from '@/lib/supabase';
import type { AssetAttachmentRow } from '@/types/database';

/**
 * Asset attachments — PDFs, Word/Excel docs, images, and short video clips
 * attached to a pin for vendor cut sheets, install instructions, warranty
 * paperwork, field walkthroughs, etc.
 *
 * Storage layout: asset-attachments/<asset_id>/<attachment_id>.<ext>
 * Bucket is private; reads use signed URLs (15-min TTL). Bucket policies
 * (M18 migration) gate read by view-on-floor and write by edit-on-building.
 *
 * Size cap is 100 MB (M25). Anything bigger needs resumable / TUS uploads.
 */

export const ASSET_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;

export const ASSET_ATTACHMENT_MIMES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export type AssetAttachment = AssetAttachmentRow;

export function validateAttachmentFile(file: File): string | null {
  if (file.size > ASSET_ATTACHMENT_MAX_BYTES) {
    return `${file.name}: too large (limit 100 MB).`;
  }
  if (!(ASSET_ATTACHMENT_MIMES as readonly string[]).includes(file.type)) {
    return `${file.name}: unsupported type. Use PDF, Word, Excel, image, video, or text file.`;
  }
  return null;
}

function extFromMimeOrName(file: File): string {
  const m: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  const mapped = m[file.type];
  if (mapped) return mapped;
  const dot = file.name.lastIndexOf('.');
  return dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : 'bin';
}

export async function listAssetAttachments(assetId: string): Promise<AssetAttachment[]> {
  const { data, error } = await supabase
    .from('asset_attachments')
    .select('*')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AssetAttachment[];
}

export async function addAssetAttachment(
  assetId: string,
  file: File
): Promise<AssetAttachment> {
  const id = crypto.randomUUID();
  const ext = extFromMimeOrName(file);
  const path = `${assetId}/${id}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('asset-attachments')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '0',
    });
  if (uploadErr) throw uploadErr;

  const { data: userData } = await supabase.auth.getUser();
  const uploaded_by = userData.user?.id ?? null;

  const { data, error } = await supabase
    .from('asset_attachments')
    .insert({
      id,
      asset_id: assetId,
      path,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by,
    })
    .select('*')
    .single();
  if (error) {
    // Clean up the uploaded blob if the row insert failed (RLS rejection, etc.)
    await supabase.storage.from('asset-attachments').remove([path]);
    throw error;
  }
  return data as AssetAttachment;
}

export async function deleteAssetAttachment(att: AssetAttachment): Promise<void> {
  // Delete the row first; storage object follows. If the row delete fails
  // (RLS), we leave the object — orphan cleanup is a future task.
  const { error: rowErr } = await supabase
    .from('asset_attachments')
    .delete()
    .eq('id', att.id);
  if (rowErr) throw rowErr;
  await supabase.storage.from('asset-attachments').remove([att.path]);
}

export async function signedAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('asset-attachments')
    .createSignedUrl(path, 15 * 60); // 15 min
  if (error) throw error;
  return data.signedUrl;
}
