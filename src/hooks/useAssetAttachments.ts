import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAssetAttachment,
  deleteAssetAttachment,
  listAssetAttachments,
  type AssetAttachment,
} from '@/lib/queries/asset-attachments';

export const assetAttachmentKeys = {
  forAsset: (assetId: string) => ['asset_attachments', assetId] as const,
};

export function useAssetAttachments(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId
      ? assetAttachmentKeys.forAsset(assetId)
      : ['asset_attachments', 'none'],
    queryFn: () => (assetId ? listAssetAttachments(assetId) : Promise.resolve([])),
    enabled: !!assetId,
  });
}

export function useAddAssetAttachment(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => addAssetAttachment(assetId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetAttachmentKeys.forAsset(assetId) });
    },
  });
}

export function useDeleteAssetAttachment(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (att: AssetAttachment) => deleteAssetAttachment(att),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assetAttachmentKeys.forAsset(assetId) });
    },
  });
}

export type { AssetAttachment };
