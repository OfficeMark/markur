import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAssetType,
  deleteAssetType,
  listAssetTypes,
  type NewAssetTypeInput,
  type OrgAssetType,
} from '@/lib/queries/asset-types';
import { setRuntimeAssetTypes, type AssetTypeColor } from '@/lib/pin-types';

export const assetTypeKeys = {
  all: ['asset-types'] as const,
  list: () => [...assetTypeKeys.all, 'list'] as const,
};

/**
 * All asset types visible to the current user, merged with the static
 * defaults. Side effect: pushes the merged map into the runtime catalog
 * in pin-types.ts so colorForType()/labelForType() callers see custom
 * colors.
 *
 * Returns ordered by category (signage first), then sort_order, then
 * label. Custom org-specific types are interleaved with globals based
 * on their sort_order field; new entries default to sort_order=999 so
 * they land at the bottom of their category.
 */
export function useAssetTypes() {
  const query = useQuery({
    queryKey: assetTypeKeys.list(),
    queryFn: listAssetTypes,
    staleTime: 60_000,
  });

  // Push into the runtime map whenever the data changes.
  useEffect(() => {
    if (!query.data) return;
    const map: Record<string, AssetTypeColor> = {};
    for (const t of query.data) {
      map[t.key] = {
        fill: t.color,
        label: t.label,
        category: t.category as 'signage' | 'facility',
      };
    }
    setRuntimeAssetTypes(map);
  }, [query.data]);

  // Convenience derived shapes.
  const list = useMemo(() => query.data ?? [], [query.data]);
  const signage = useMemo(
    () => list.filter((t) => t.category === 'signage'),
    [list]
  );
  const facility = useMemo(
    () => list.filter((t) => t.category === 'facility'),
    [list]
  );

  return { ...query, list, signage, facility };
}

export function useCreateAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAssetTypeInput) => createAssetType(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetTypeKeys.list() });
    },
  });
}

export function useDeleteAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAssetType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetTypeKeys.list() });
    },
  });
}

export type { OrgAssetType };
