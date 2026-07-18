import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAssetPhoto,
  deleteAssetPhoto,
  listAssetPhotos,
  listFirstPhotoPaths,
  signedAssetPhotoUrl,
  signedAssetPhotoUrls,
} from '@/lib/queries/asset-photos';
import type { AssetPhoto } from '@/types/database';

export const assetPhotoKeys = {
  forAsset: (assetId: string) => ['asset_photos', assetId] as const,
  signedUrl: (path: string) => ['asset_photos', 'signed-url', path] as const,
  thumbs: (idsKey: string) => ['asset_photos', 'floor-thumbs', idsKey] as const,
};

// Signed-URL tokens live 30 min; refresh a little before they lapse. Caching
// the URL by path (PERF-3) means the SAME url is reused across mounts, so the
// browser/SW HTTP caches finally get hits instead of fresh ?token= misses.
const SIGNED_URL_STALE_MS = 25 * 60 * 1000;

/** Cached signed URL for one photo path. */
export function useSignedAssetPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: path ? assetPhotoKeys.signedUrl(path) : ['asset_photos', 'signed-url', 'none'],
    queryFn: () => {
      if (!path) throw new Error('no path');
      return signedAssetPhotoUrl(path);
    },
    enabled: !!path,
    staleTime: SIGNED_URL_STALE_MS,
    gcTime: SIGNED_URL_STALE_MS,
  });
}

/**
 * PERF-2: first-photo thumbnails for a whole set of assets in TWO round
 * trips (one paths query + one batch signing call) instead of 2-per-pin.
 */
export function useFloorPhotoThumbs(assetIds: string[]) {
  const idsKey = [...assetIds].sort().join(',');
  return useQuery({
    queryKey: assetPhotoKeys.thumbs(idsKey),
    queryFn: async (): Promise<Map<string, string>> => {
      const paths = await listFirstPhotoPaths(assetIds);
      const urls = await signedAssetPhotoUrls([...paths.values()]);
      const byAsset = new Map<string, string>();
      for (const [assetId, path] of paths) {
        const url = urls.get(path);
        if (url) byAsset.set(assetId, url);
      }
      return byAsset;
    },
    enabled: assetIds.length > 0,
    staleTime: SIGNED_URL_STALE_MS,
    gcTime: SIGNED_URL_STALE_MS,
  });
}

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
      qc.invalidateQueries({ queryKey: ['asset_photos', 'floor-thumbs'] });
    },
  });
}

export function useDeleteAssetPhoto(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photo: AssetPhoto) => deleteAssetPhoto(photo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetPhotoKeys.forAsset(assetId) });
      qc.invalidateQueries({ queryKey: ['asset_photos', 'floor-thumbs'] });
    },
  });
}
