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

export type CreateAssetInput = {
  floor_id: string;
  type: string;
  category: AssetCategory;
  name: string;
  location_notes?: string | null;
  x: number;
  y: number;
  tenant_scope_id?: string | null;
};

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const { data: userData } = await supabase.auth.getUser();
  const created_by = userData.user?.id ?? null;

  const { data, error } = await supabase
    .from('assets')
    .insert({ ...input, created_by })
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
  manufacturer: string | null;
  installed_at: string | null;
  audit_cycle_days: number | null;
  status: 'good' | 'attention' | 'flagged';
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
