import { useQuery } from '@tanstack/react-query';
import { listFlagsForAssets } from '@/lib/queries/flags';

export const flagKeys = {
  all: ['flags'] as const,
  forAsset: (assetId: string) => [...flagKeys.all, 'by-asset', assetId] as const,
};

/**
 * Flags raised against one asset, newest first. Used by the expense form to
 * offer "link this expense to a flag" (Feature 2). Fetched on drawer open.
 */
export function useFlagsForAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? flagKeys.forAsset(assetId) : [...flagKeys.all, 'none'],
    queryFn: () => (assetId ? listFlagsForAssets([assetId]) : Promise.resolve([])),
    enabled: !!assetId,
  });
}
