import { supabase } from '@/lib/supabase';

/**
 * org_asset_types catalog (M11). Replaces the static CHECK constraint on
 * assets.type. Rows with org_id IS NULL are global defaults visible to
 * every user; rows with org_id set are managed by that org's
 * building admins.
 *
 * The TS shape is hand-typed here because we have not regenerated the
 * Supabase database.ts since adding the table - the generated types are
 * fine to live alongside the manual one for the new table only.
 */

export type AssetTypeCategory = 'signage' | 'facility';

export type OrgAssetType = {
  id: string;
  org_id: string | null;
  key: string;
  label: string;
  color: string;
  category: AssetTypeCategory;
  sort_order: number;
  created_at: string;
};

/**
 * All asset types visible to the current user, ordered by category then
 * sort_order then label. Returns globals (org_id IS NULL) plus rows for
 * any org the user has buildings in - RLS already gates visibility.
 */
export async function listAssetTypes(): Promise<OrgAssetType[]> {
  const { data, error } = await supabase
    .from('org_asset_types')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgAssetType[];
}

export type NewAssetTypeInput = {
  org_id: string;
  key: string;
  label: string;
  color: string;
  category: AssetTypeCategory;
};

export async function createAssetType(input: NewAssetTypeInput): Promise<OrgAssetType> {
  const { data, error } = await supabase
    .from('org_asset_types')
    .insert({
      org_id: input.org_id,
      key: input.key,
      label: input.label,
      color: input.color,
      category: input.category,
      sort_order: 999,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as OrgAssetType;
}

export async function deleteAssetType(id: string): Promise<void> {
  const { error } = await supabase.from('org_asset_types').delete().eq('id', id);
  if (error) throw error;
}
