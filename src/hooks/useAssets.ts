import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAsset,
  getAsset,
  listAssetsByFloor,
  softDeleteAsset,
  updateAsset,
  type CreateAssetInput,
  type UpdateAssetInput,
} from '@/lib/queries/assets';
import type { Asset } from '@/types/database';

export const assetKeys = {
  all: ['assets'] as const,
  byFloor: (floorId: string) => [...assetKeys.all, 'by-floor', floorId] as const,
  detail: (id: string) => [...assetKeys.all, 'detail', id] as const,
};

export function useAssets(floorId: string | undefined) {
  return useQuery({
    queryKey: floorId ? assetKeys.byFloor(floorId) : ['assets', 'by-floor', 'none'],
    queryFn: () => (floorId ? listAssetsByFloor(floorId) : Promise.resolve([])),
    enabled: !!floorId,
  });
}

export function useAsset(id: string | undefined) {
  return useQuery({
    queryKey: id ? assetKeys.detail(id) : ['assets', 'detail', 'none'],
    queryFn: () => (id ? getAsset(id) : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssetInput) => createAsset(input),
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: assetKeys.byFloor(asset.floor_id) });
    },
  });
}

/**
 * Optimistically applies the patch to the local caches before the network
 * request lands. This is critical for the drag-to-nudge UX: without it the
 * pin "snaps back" between releasing the pointer and the refetch completing.
 *
 * If the request fails, the cache is rolled back from the snapshot we took.
 */
export function useUpdateAsset(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAssetInput }) =>
      updateAsset(id, patch),
    onMutate: async ({ id, patch }) => {
      // Cancel in-flight queries so they don't overwrite our optimistic edit.
      const detailKey = assetKeys.detail(id);
      const listKey = floorId ? assetKeys.byFloor(floorId) : null;
      await qc.cancelQueries({ queryKey: detailKey });
      if (listKey) await qc.cancelQueries({ queryKey: listKey });

      const prevDetail = qc.getQueryData<Asset | null>(detailKey);
      const prevList = listKey ? qc.getQueryData<Asset[]>(listKey) : undefined;

      if (prevDetail) {
        qc.setQueryData<Asset>(detailKey, { ...prevDetail, ...patch } as Asset);
      }
      if (listKey && prevList) {
        qc.setQueryData<Asset[]>(
          listKey,
          prevList.map((a) => (a.id === id ? ({ ...a, ...patch } as Asset) : a))
        );
      }

      return { prevDetail, prevList, detailKey, listKey };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back on failure so the canvas reflects the real server state.
      if (!ctx) return;
      if (ctx.prevDetail !== undefined) {
        qc.setQueryData(ctx.detailKey, ctx.prevDetail);
      }
      if (ctx.listKey && ctx.prevList !== undefined) {
        qc.setQueryData(ctx.listKey, ctx.prevList);
      }
    },
    onSettled: (asset) => {
      // Re-fetch authoritative data; if the mutation succeeded our optimistic
      // value matches and the refetch is a no-op for the user.
      if (asset) {
        qc.invalidateQueries({ queryKey: assetKeys.detail(asset.id) });
      }
      if (floorId) qc.invalidateQueries({ queryKey: assetKeys.byFloor(floorId) });
    },
  });
}

export function useSoftDeleteAsset(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteAsset(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: assetKeys.detail(id) });
      if (floorId) qc.invalidateQueries({ queryKey: assetKeys.byFloor(floorId) });
    },
  });
}
