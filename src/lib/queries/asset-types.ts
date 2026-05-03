import { supabase } from '@/lib/supabase';

/**
 * org_asset_types catalog (M11) + org_asset_type_overrides (M14).
 *
 * M11 shipped:
 *  - rows with org_id IS NULL are global defaults visible to every user
 *  - rows with org_id set are managed by that org's building admins
 *
 * M14 shipped:
 *  - org_asset_type_overrides lets a building admin tweak a global's
 *    label, color, sort_order, or hide it entirely - without modifying
 *    the underlying global row (so other orgs are unaffected).
 *
 * The TS shapes are hand-typed here because the Supabase database.ts
 * has not been regenerated since M11; the manual types live alongside
 * the generated ones for these two tables only.
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

export type OrgAssetTypeOverride = {
  id: string;
  org_id: string;
  global_key: string;
  hidden: boolean;
  label_override: string | null;
  color_override: string | null;
  sort_order_override: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * What the UI consumes after merging globals + overrides + org-specific.
 * `source` tells the admin card whether this row is a baseline global,
 * an overridden global, or an org-specific addition. The `id` field is
 * stable per source - it is the global row's id for source='global' and
 * 'global-overridden', and the org-specific row's id for 'org-specific'.
 */
export type EffectiveAssetType = {
  id: string;
  key: string;
  label: string;
  color: string;
  category: AssetTypeCategory;
  sort_order: number;
  source: 'global' | 'global-overridden' | 'org-specific';
  hidden: boolean;
  override_id: string | null;
  org_specific_id: string | null;
};

// ===========================================================================
// Raw row queries
// ===========================================================================

/**
 * Raw rows from org_asset_types. Returns globals (org_id IS NULL) plus
 * any org-specific rows the user can see (RLS gates visibility).
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

export async function listOverrides(orgId: string): Promise<OrgAssetTypeOverride[]> {
  const { data, error } = await supabase
    .from('org_asset_type_overrides')
    .select('*')
    .eq('org_id', orgId);
  if (error) throw error;
  return (data ?? []) as OrgAssetTypeOverride[];
}

// ===========================================================================
// Effective list (used by the hook)
// ===========================================================================

export type ListEffectiveResult = {
  effective: EffectiveAssetType[];
  // Raw rows kept available for the admin card (it edits raw rows).
  globals: OrgAssetType[];
  orgSpecific: OrgAssetType[];
  overrides: OrgAssetTypeOverride[];
};

/**
 * Fetch globals + org-specific + overrides, then merge into the
 * effective list. Stable ordering: category (signage first), then
 * effective sort_order, then label.
 *
 * If `orgId` is null, no overrides are applied (anonymous / no org yet).
 */
export async function listEffectiveAssetTypes(
  orgId: string | null
): Promise<ListEffectiveResult> {
  const rows = await listAssetTypes();
  const overrides = orgId ? await listOverrides(orgId) : [];

  const overrideByKey = new Map<string, OrgAssetTypeOverride>();
  for (const o of overrides) overrideByKey.set(o.global_key, o);

  const globals = rows.filter((r) => r.org_id === null);
  const orgSpecific = rows.filter((r) => r.org_id === orgId);

  const effective: EffectiveAssetType[] = [];

  for (const g of globals) {
    const ov = overrideByKey.get(g.key);
    if (ov) {
      effective.push({
        id: g.id,
        key: g.key,
        label: ov.label_override ?? g.label,
        color: ov.color_override ?? g.color,
        category: g.category,
        sort_order: ov.sort_order_override ?? g.sort_order,
        source: 'global-overridden',
        hidden: ov.hidden,
        override_id: ov.id,
        org_specific_id: null,
      });
    } else {
      effective.push({
        id: g.id,
        key: g.key,
        label: g.label,
        color: g.color,
        category: g.category,
        sort_order: g.sort_order,
        source: 'global',
        hidden: false,
        override_id: null,
        org_specific_id: null,
      });
    }
  }

  for (const r of orgSpecific) {
    effective.push({
      id: r.id,
      key: r.key,
      label: r.label,
      color: r.color,
      category: r.category,
      sort_order: r.sort_order,
      source: 'org-specific',
      hidden: false,
      override_id: null,
      org_specific_id: r.id,
    });
  }

  effective.sort((a, b) => {
    if (a.category !== b.category) return a.category === 'signage' ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label.localeCompare(b.label);
  });

  return { effective, globals, orgSpecific, overrides };
}

// ===========================================================================
// Mutations - org-specific rows (M11; updateAssetType added M14)
// ===========================================================================

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

export type UpdateAssetTypePatch = Partial<{
  label: string;
  color: string;
  category: AssetTypeCategory;
  sort_order: number;
}>;

export async function updateAssetType(
  id: string,
  patch: UpdateAssetTypePatch
): Promise<OrgAssetType> {
  const { data, error } = await supabase
    .from('org_asset_types')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as OrgAssetType;
}

export async function deleteAssetType(id: string): Promise<void> {
  const { error } = await supabase.from('org_asset_types').delete().eq('id', id);
  if (error) throw error;
}

// ===========================================================================
// Mutations - overrides (M14)
// ===========================================================================

export type SetOverrideInput = {
  org_id: string;
  global_key: string;
  hidden?: boolean;
  label_override?: string | null;
  color_override?: string | null;
  sort_order_override?: number | null;
};

export async function setOverride(input: SetOverrideInput): Promise<OrgAssetTypeOverride> {
  // upsert by (org_id, global_key)
  const payload = {
    org_id: input.org_id,
    global_key: input.global_key,
    hidden: input.hidden ?? false,
    label_override: input.label_override ?? null,
    color_override: input.color_override ?? null,
    sort_order_override: input.sort_order_override ?? null,
  };
  const { data, error } = await supabase
    .from('org_asset_type_overrides')
    .upsert(payload, { onConflict: 'org_id,global_key' })
    .select('*')
    .single();
  if (error) throw error;
  return data as OrgAssetTypeOverride;
}

export async function clearOverride(orgId: string, globalKey: string): Promise<void> {
  const { error } = await supabase
    .from('org_asset_type_overrides')
    .delete()
    .eq('org_id', orgId)
    .eq('global_key', globalKey);
  if (error) throw error;
}

// ===========================================================================
// Helper - assigned asset count for hide/delete confirmation
// ===========================================================================

/**
 * Count assets currently using a given type, across all buildings owned
 * by the org. Used by the hide-confirm and delete-confirm dialogs so
 * admins see the impact before they pull the trigger.
 *
 * Returns -1 on any unexpected error so the UI can show "unknown count"
 * instead of misleading the admin with a 0.
 */
export async function countAssetsForType(
  orgId: string,
  typeKey: string
): Promise<number> {
  // assets has no org_id directly. PostgREST resource embedding with
  // !inner forces an inner join so we can filter on the related row.
  // head:true + count:'exact' gives us a row count without payload.
  const { count, error } = await supabase
    .from('assets')
    .select('id, floors!inner(buildings!inner(owner_org_id, deleted_at))', {
      count: 'exact',
      head: true,
    })
    .eq('type', typeKey)
    .is('deleted_at', null)
    .eq('floors.buildings.owner_org_id', orgId)
    .is('floors.buildings.deleted_at', null);
  if (error) return -1;
  return count ?? 0;
}
