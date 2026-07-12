import { supabase } from '@/lib/supabase';
import type { FloorAuditPath } from '@/types/database';

/**
 * Read/write helpers for `public.floor_audit_paths` — the saved walking order
 * for a floor (an ordered array of asset ids). A surveyor sets the order in the
 * floor's "Edit audit path" mode; Audit Mode can then follow it so the same
 * route is walked every time and nothing gets missed.
 *
 * One row per floor (floor_id is the PK). Upsert to save/overwrite; delete the
 * row to clear. RLS (server-enforced): readable with `audit` on the floor,
 * writable by editor and up.
 */

/** The floor's saved path, or null if none has been set. */
export async function getFloorAuditPath(floorId: string): Promise<FloorAuditPath | null> {
  const { data, error } = await supabase
    .from('floor_audit_paths')
    .select('*')
    .eq('floor_id', floorId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export type SaveFloorAuditPathInput = {
  floor_id: string;
  /** Ordered asset ids in walking order. */
  path: string[];
};

/** Upsert the floor's path (overwrite-in-place; last save wins, no locking). */
export async function saveFloorAuditPath(
  input: SaveFloorAuditPathInput
): Promise<FloorAuditPath> {
  const { data, error } = await supabase
    .from('floor_audit_paths')
    .upsert({ floor_id: input.floor_id, path: input.path }, { onConflict: 'floor_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Clear the floor's path entirely (deletes the row). */
export async function clearFloorAuditPath(floorId: string): Promise<void> {
  const { error } = await supabase
    .from('floor_audit_paths')
    .delete()
    .eq('floor_id', floorId);
  if (error) throw error;
}
