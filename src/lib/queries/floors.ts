import { supabase } from '@/lib/supabase';
import type { Floor } from '@/types/database';

/**
 * Floor read-side wrappers. RLS is enforced server-side; these wrappers don't
 * pre-filter by user grants. If a user has no access, the query returns [].
 */
export async function listFloorsByBuilding(buildingId: string): Promise<Floor[]> {
  const { data, error } = await supabase
    .from('floors')
    .select('*')
    .eq('building_id', buildingId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getFloor(id: string): Promise<Floor | null> {
  const { data, error } = await supabase
    .from('floors')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type NewFloorInput = {
  building_id: string;
  label: string;
  sort_order?: number;
};

/**
 * Create a new floor under a building. RLS policy `floors_admin_create`
 * gates this — must have edit rights on the parent building. The form
 * validates the label client-side; sort_order defaults to a reasonable
 * value if not specified (highest existing + 10).
 */
export async function createFloor(input: NewFloorInput): Promise<Floor> {
  const { data, error } = await supabase
    .from('floors')
    .insert({
      building_id: input.building_id,
      label: input.label,
      sort_order: input.sort_order ?? 100,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Soft-delete a floor by stamping deleted_at. RLS policy `floors_admin_write`
 * gates this — must have edit rights on the parent building, which only
 * building_admin and super_admin hold. Cascades visually: every read in this
 * module already filters `.is('deleted_at', null)`, and assets/audit_sessions
 * are reachable only through the floor row, so they disappear from the UI
 * the moment the floor is soft-deleted. Restoration is schema-supported (set
 * deleted_at back to null) but there is no UI for it yet.
 */
export async function softDeleteFloor(id: string): Promise<void> {
  const { error } = await supabase
    .from('floors')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Set how this floor's plan was sourced (provenance label). RLS gates writes. */
export async function setFloorProvenance(id: string, provenance: string): Promise<void> {
  const { error } = await supabase
    .from('floors')
    .update({ plan_provenance: provenance })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Set the floor-wide notes (free text). Team-only context — never surfaced on
 * guest share links. Writes ride the existing floors RLS (building-edit
 * required); an empty string clears the note to null.
 */
export async function setFloorNotes(id: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('floors')
    .update({ floor_notes: notes.trim() || null })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Suggest the next sort_order for a new floor in a building. Caller can
 * use this to default the form value so manually-added floors land at
 * the bottom of the existing list.
 *
 * Important: consider ALL rows (including soft-deleted) when picking the
 * next slot. Migration 0028_m25_floor_fix made the
 * (building_id, sort_order) unique index partial-on-live, but a
 * live-rows-only MAX query would still pick a value that a recently-deleted
 * floor sits at -- which has worked fine since the migration lifted the
 * collision, but the historical bug (M25-floor-fix) was exactly "live MAX
 * picked a slot a soft-deleted row held." Stay inclusive here so the next
 * refactor doesn't reintroduce the same assumption under a different name.
 */
export async function nextFloorSortOrder(buildingId: string): Promise<number> {
  const { data, error } = await supabase
    .from('floors')
    .select('sort_order')
    .eq('building_id', buildingId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return ((data?.sort_order ?? 0) + 10);
}
