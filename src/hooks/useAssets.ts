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

export function useUpdateAsset(floorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAssetInput }) =>
      updateAsset(id, patch),
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: assetKeys.detail(asset.id) });
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
