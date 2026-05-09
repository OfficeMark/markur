import { supabase } from '@/lib/supabase';
import type { Asset } from '@/types/database';

/**
 * All Supabase access for `public.assets` lives here. Components consume
 * these via the hooks in src/hooks/useAssets.ts.
 *
 * Photo handling lives in queries/asset-photos.ts (multi-photo since 0009).
 */

export async function listAssetsByFloor(floorId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('floor_id', floorId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAsset(id: string): Promise<Asset | null> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type AssetCategory = 'signage' | 'facility';

export type VendorContact = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
};

export type CreateAssetInput = {
  floor_id: string;
  type: string;
  category: AssetCategory;
  name?: string | null;            // M18: optional. DB sets default if null.
  location_notes?: string | null;
  room_number?: string | null;     // M18
  notes?: string | null;           // M18
  vendor_contact?: VendorContact | null;  // M18
  x: number;
  y: number;
  tenant_scope_id?: string | null;
};

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const { data: userData } = await supabase.auth.getUser();
  const created_by = userData.user?.id ?? null;

  // M18: name is no longer required at the form level. The DB still
  // wants a value (NOT NULL on assets.name), so we fall back to a
  // sensible default derived from the type label or 'Untitled'.
  const safeName = (input.name ?? '').trim() || 'Untitled';

  const { data, error } = await supabase
    .from('assets')
    .insert({
      floor_id: input.floor_id,
      type: input.type,
      category: input.category,
      name: safeName,
      location_notes: input.location_notes ?? null,
      room_number: input.room_number ?? null,
      notes: input.notes ?? null,
      vendor_contact: input.vendor_contact ?? null,
      x: input.x,
      y: input.y,
      tenant_scope_id: input.tenant_scope_id ?? null,
      created_by,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type UpdateAssetInput = Partial<{
  name: string;
  type: string;
  category: AssetCategory;
  location_notes: string | null;
  room_number: string | null;
  notes: string | null;
  vendor_contact: VendorContact | null;
  manufacturer: string | null;
  installed_at: string | null;
  audit_cycle_days: number | null;
  status: 'good' | 'attention' | 'flagged';
  is_locked: boolean;
  tenant_scope_id: string | null;
  x: number;
  y: number;
}>;

export async function updateAsset(id: string, patch: UpdateAssetInput): Promise<Asset> {
  const { data, error } = await supabase
    .from('assets')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function softDeleteAsset(id: string): Promise<void> {
  const { error } = await supabase
    .from('assets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * List soft-deleted assets in a building, deleted within the last `withinDays`
 * days. The Trash view (super_admin only) uses this to surface restorable
 * pins. We join against floors so we can scope by building.
 *
 * RLS lets super_admin select these directly; building_admins on the building
 * also see them via the existing `assets_select` policy (no restriction on
 * deleted_at). Non-admins return [].
 */
export type DeletedAsset = Asset & { floor_label: string | null };

export async function listDeletedAssetsForBuilding(
  buildingId: string,
  withinDays = 30
): Promise<DeletedAsset[]> {
  const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('assets')
    .select('*, floor:floors!inner(id, building_id, label)')
    .eq('floor.building_id', buildingId)
    .not('deleted_at', 'is', null)
    .gte('deleted_at', cutoff)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  type Row = Asset & { floor: { id: string; building_id: string; label: string } | null };
  const rows = (data ?? []) as unknown as Row[];
  return rows.map((r) => {
    const { floor, ...rest } = r;
    return { ...rest, floor_label: floor?.label ?? null };
  });
}

export async function restoreAsset(id: string): Promise<void> {
  const { error } = await supabase
    .from('assets')
    .update({ deleted_at: null })
    .eq('id', id);
  if (error) throw error;
}
