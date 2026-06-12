import { useEffect, useMemo } from 'react';
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

  // Guests have a viewer grant but no session org, so useBuildings() returns []
  // and the derived org is null — which would strip every org colour/label back
  // to defaults (gray pins). The guest path passes the viewed building's
  // owner_org_id explicitly so the catalogue resolves for that org instead.
  const derivedOrgId = useMemo<string | null>(() => {
    if (!buildings) return null;
    const withOrg = buildings.find((b) => b.owner_org_id);
    return withOrg?.owner_org_id ?? null;
  }, [buildings]);
  const orgId = orgIdOverride !== undefined ? orgIdOverride : derivedOrgId;

  const query = useQuery<ListEffectiveResult>({
    queryKey: assetTypeKeys.list(orgId),
    queryFn: () => listEffectiveAssetTypes(orgId),
    staleTime: 60_000,
  });

  // Push the effective map into the runtime catalog. Hidden entries
  // stay in the map so existing assets continue to render with their
  // effective color and label.
  useEffect(() => {
    if (!query.data) return;
    const map: Record<string, AssetTypeColor> = {};
    for (const t of query.data.effective) {
      map[t.key] = {
        fill: t.color,
        label: t.label,
        category: t.category,
      };
    }
    setRuntimeAssetTypes(map);
  }, [query.data]);

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
