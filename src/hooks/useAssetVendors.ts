import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAssetVendor,
  listVendorsForAsset,
  removeAssetVendor,
} from '@/lib/queries/asset-vendors';

/** Vendors linked to a single asset (M34, item 2). */

export const assetVendorKeys = {
  all: ['asset-vendors'] as const,
  byAsset: (assetId: string) => [...assetVendorKeys.all, 'by-asset', assetId] as const,
};

export function useAssetVendors(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? assetVendorKeys.byAsset(assetId) : ['asset-vendors', 'by-asset', 'none'],
    queryFn: () => (assetId ? listVendorsForAsset(assetId) : Promise.resolve([])),
    enabled: !!assetId,
    staleTime: 30_000,
  });
}

export function useAddAssetVendor(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { vendorId: string; ownerOrgId: string }) =>
      addAssetVendor(assetId, vars.vendorId, vars.ownerOrgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetVendorKeys.byAsset(assetId) }),
  });
}

export function useRemoveAssetVendor(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vendorId: string) => removeAssetVendor(assetId, vendorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetVendorKeys.byAsset(assetId) }),
  });
}
