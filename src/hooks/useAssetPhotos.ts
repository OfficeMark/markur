import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAssetPhoto,
  deleteAssetPhoto,
  listAssetPhotos,
  signedAssetPhotoUrl,
} from '@/lib/queries/asset-photos';
import type { AssetPhoto } from '@/types/database';

export const assetPhotoKeys = {
  forAsset: (assetId: string) => ['asset_photos', assetId] as const,
  signedUrl: (path: string) => ['asset_photo_url', path] as const,
};

export function useAssetPhotos(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? assetPhotoKeys.forAsset(assetId) : ['asset_photos', 'none'],
    queryFn: () => (assetId ? listAssetPhotos(assetId) : Promise.resolve([])),
    enabled: !!assetId,
  });
}

/**
 * A signed URL for one asset-photo path, cached by path. Signs individually as a
 * fallback, but get_floor_view's batch pass pre-seeds these (one createSignedUrls
 * for the whole floor) so the grid's thumbnails read warm instead of each firing
 * its own sign — that's the per-pin signing N+1 kill. Re-signs at most every
 * 25 min (the URL is valid 30).
 */
export function useSignedAssetPhotoUrl(path: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: path ? assetPhotoKeys.signedUrl(path) : ['asset_photo_url', 'none'],
    queryFn: () => (path ? signedAssetPhotoUrl(path) : Promise.resolve(null)),
    enabled: !!path,
    staleTime: 25 * 60_000,
    gcTime: 30 * 60_000,
  });
  return data ?? null;
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
