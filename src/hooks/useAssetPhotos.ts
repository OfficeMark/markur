import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAssetPhoto,
  deleteAssetPhoto,
  listAssetPhotos,
} from '@/lib/queries/asset-photos';
import type { AssetPhoto } from '@/types/database';

export const assetPhotoKeys = {
  forAsset: (assetId: string) => ['asset_photos', assetId] as const,
};

export function useAssetPhotos(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? assetPhotoKeys.forAsset(assetId) : ['asset_photos', 'none'],
    queryFn: () => (assetId ? listAssetPhotos(assetId) : Promise.resolve([])),
    enabled: !!assetId,
  });
}

export function useAddAssetPhoto(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => addAssetPhoto(assetId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetPhotoKeys.forAsset(assetId) });
    },
  });
}

export function useDeleteAssetPhoto(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photo: AssetPhoto) => deleteAssetPhoto(photo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetPhotoKeys.forAsset(assetId) });
    },
  });
}
