import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAuditVideo,
  assetsWithVideos,
  deleteAuditVideo,
  listAssetAuditVideos,
  listBuildingAuditVideos,
  type AddAuditVideoInput,
  type AuditVideo,
} from '@/lib/queries/audit-videos';

export const auditVideoKeys = {
  forAsset: (assetId: string) => ['audit_videos', 'asset', assetId] as const,
  forBuilding: (buildingId: string) => ['audit_videos', 'building', buildingId] as const,
  assetsWithVideosKey: (buildingId: string, assetIds: readonly string[]) =>
    ['audit_videos', 'has_for_assets', buildingId, [...assetIds].sort().join(',')] as const,
};

export function useAssetAuditVideos(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? auditVideoKeys.forAsset(assetId) : ['audit_videos', 'asset', 'none'],
    queryFn: () => (assetId ? listAssetAuditVideos(assetId) : Promise.resolve<AuditVideo[]>([])),
    enabled: !!assetId,
  });
}

export function useBuildingAuditVideos(buildingId: string | undefined) {
  return useQuery({
    queryKey: buildingId
      ? auditVideoKeys.forBuilding(buildingId)
      : ['audit_videos', 'building', 'none'],
    queryFn: () =>
      buildingId ? listBuildingAuditVideos(buildingId) : Promise.resolve<AuditVideo[]>([]),
    enabled: !!buildingId,
  });
}

/** Which of these asset ids have at least one video. Drives the Gold play-icon badge in the grid. */
export function useAssetsWithVideos(buildingId: string | undefined, assetIds: string[]) {
  const sorted = [...assetIds].sort();
  return useQuery({
    queryKey: buildingId
      ? auditVideoKeys.assetsWithVideosKey(buildingId, sorted)
      : ['audit_videos', 'has_for_assets', 'none'],
    queryFn: () => assetsWithVideos(sorted),
    enabled: !!buildingId && sorted.length > 0,
    staleTime: 30_000,
  });
}

export function useAddAuditVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddAuditVideoInput) => addAuditVideo(input),
    onSuccess: (_video, input) => {
      qc.invalidateQueries({ queryKey: auditVideoKeys.forBuilding(input.buildingId) });
      if (input.assetId) {
        qc.invalidateQueries({ queryKey: auditVideoKeys.forAsset(input.assetId) });
      }
      qc.invalidateQueries({ queryKey: ['audit_videos', 'has_for_assets', input.buildingId] });
      // The floor page reads its video badges from get_floor_view; re-seed it.
      qc.invalidateQueries({ queryKey: ['floor-view'] });
    },
  });
}

export function useDeleteAuditVideo(buildingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (video: AuditVideo) => deleteAuditVideo(video),
    onSuccess: (_void, video) => {
      qc.invalidateQueries({ queryKey: auditVideoKeys.forBuilding(buildingId) });
      if (video.asset_id) {
        qc.invalidateQueries({ queryKey: auditVideoKeys.forAsset(video.asset_id) });
      }
      qc.invalidateQueries({ queryKey: ['audit_videos', 'has_for_assets', buildingId] });
      // The floor page reads its video badges from get_floor_view; re-seed it.
      qc.invalidateQueries({ queryKey: ['floor-view'] });
    },
  });
}

export type { AuditVideo };
