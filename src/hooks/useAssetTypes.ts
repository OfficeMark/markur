import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearOverride,
  countAssetsForType,
  createAssetType,
  deleteAssetType,
  listEffectiveAssetTypes,
  setOverride,
  updateAssetType,
  type EffectiveAssetType,
  type ListEffectiveResult,
  type NewAssetTypeInput,
  type OrgAssetType,
  type OrgAssetTypeOverride,
  type SetOverrideInput,
  type UpdateAssetTypePatch,
} from '@/lib/queries/asset-types';
import { setRuntimeAssetTypes, type AssetTypeColor } from '@/lib/pin-types';
import { useBuildings } from '@/hooks/useBuildings';
import { usePermissions } from '@/lib/permissions-context';

export const assetTypeKeys = {
  all: ['asset-types'] as const,
  list: (orgId: string | null) => [...assetTypeKeys.all, 'list', orgId] as const,
  assetCount: (orgId: string | null, key: string) =>
    [...assetTypeKeys.all, 'asset-count', orgId, key] as const,
};

/**
 * The merged effective asset-type catalog for the current user's org.
 *
 * Returns:
 *   list      - all effective types (globals + overrides + org-specific),
 *               INCLUDING hidden ones. The admin card uses this to render
 *               the management UI; the runtime catalog also receives all
 *               of them so existing assets of a hidden type still display.
 *   signage   - selectable signage types (hidden=true filtered out).
 *   facility  - selectable facility types (hidden=true filtered out).
 *   raw       - { globals, orgSpecific, overrides } for the admin card.
 *   orgId     - resolved org id (null until the user has at least one building).
 *
 * Side effect: pushes the merged map into pin-types runtime catalog so
 * colorForType() / labelForType() callers see effective values.
 */
export function useAssetTypes(orgIdOverride?: string | null) {
  const { data: buildings } = useBuildings();
  const { grants } = usePermissions();

  // Resolve the org id as early as possible so the colour catalogue fetches in
  // parallel with the rest of boot instead of waiting for the buildings list
  // (which lands several seconds in — that's why pins drew before their colours
  // on a cold load). The org-scope grant arrives right after the user, so prefer
  // it; fall back to the owning org of any visible building for users who only
  // hold a building-scope grant.
  //
  // Guests have a viewer grant but no session org and useBuildings() returns [],
  // so both resolve to null — the guest path passes the viewed building's
  // owner_org_id explicitly via orgIdOverride instead.
  const derivedOrgId = useMemo<string | null>(() => {
    const fromGrant = grants.find((g) => g.scope_type === 'organization')?.scope_id;
    if (fromGrant) return fromGrant;
    return buildings?.find((b) => b.owner_org_id)?.owner_org_id ?? null;
  }, [grants, buildings]);
  const orgId = orgIdOverride !== undefined ? orgIdOverride : derivedOrgId;

  const query = useQuery<ListEffectiveResult>({
    queryKey: assetTypeKeys.list(orgId),
    queryFn: () => listEffectiveAssetTypes(orgId),
    // Don't fetch with a null org (no org → nothing to fetch). Waiting for the
    // resolved org id avoids a throwaway null-org fetch firing before grants /
    // buildings land — that was the duplicate org_asset_types call in the logs.
    enabled: orgId !== null,
    staleTime: 60_000,
  });

  // Push the effective map into the module-level runtime catalog that the sync
  // colorForType()/labelForType() helpers read. Hidden entries stay in the map
  // so existing assets keep their effective colour and label.
  //
  // This runs DURING render (not in a post-paint effect): a component that
  // re-renders when this query resolves — e.g. the floor's pin layer — then
  // reads the fresh colours in the SAME paint. The old effect ran after paint,
  // so pins drew before the colours existed and only recoloured on a remount
  // (the "black pins until you leave and come back" bug).
  const effectiveMap = useMemo(() => {
    if (!query.data) return null;
    const map: Record<string, AssetTypeColor> = {};
    for (const t of query.data.effective) {
      map[t.key] = { fill: t.color, label: t.label, category: t.category };
    }
    return map;
  }, [query.data]);
  if (effectiveMap) setRuntimeAssetTypes(effectiveMap);

  const list = useMemo<EffectiveAssetType[]>(
    () => query.data?.effective ?? [],
    [query.data]
  );
  const signage = useMemo(
    () => list.filter((t) => t.category === 'signage' && !t.hidden),
    [list]
  );
  const facility = useMemo(
    () => list.filter((t) => t.category === 'facility' && !t.hidden),
    [list]
  );

  const raw = useMemo(
    () => ({
      globals: query.data?.globals ?? [],
      orgSpecific: query.data?.orgSpecific ?? [],
      overrides: query.data?.overrides ?? [],
    }),
    [query.data]
  );

  return { ...query, list, signage, facility, raw, orgId };
}

// ===========================================================================
// Mutations
// ===========================================================================

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: assetTypeKeys.all });
}

export function useCreateAssetType() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: NewAssetTypeInput) => createAssetType(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAssetType() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateAssetTypePatch }) =>
      updateAssetType(vars.id, vars.patch),
    onSuccess: invalidate,
  });
}

export function useDeleteAssetType() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteAssetType(id),
    onSuccess: invalidate,
  });
}

export function useSetOverride() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: SetOverrideInput) => setOverride(input),
    onSuccess: invalidate,
  });
}

export function useClearOverride() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: { orgId: string; globalKey: string }) =>
      clearOverride(vars.orgId, vars.globalKey),
    onSuccess: invalidate,
  });
}

/**
 * On-demand count of assets currently using a given type. Used by the
 * hide-confirm and delete-confirm dialogs. Cached for 30s so opening
 * the modal twice in a row doesn't re-query.
 */
export function useAssetCountForType(orgId: string | null, typeKey: string | null) {
  return useQuery<number>({
    queryKey: assetTypeKeys.assetCount(orgId, typeKey ?? ''),
    queryFn: () => {
      if (!orgId || !typeKey) return Promise.resolve(0);
      return countAssetsForType(orgId, typeKey);
    },
    enabled: Boolean(orgId && typeKey),
    staleTime: 30_000,
  });
}

export type { OrgAssetType, OrgAssetTypeOverride, EffectiveAssetType };
