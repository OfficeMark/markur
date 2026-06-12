import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBuildingShare,
  listActiveShares,
  revokeBuildingShare,
  type CreatedShare,
  type ShareExpiryDays,
} from '@/lib/queries/building-shares';

export const shareKeys = {
  all: ['building-shares'] as const,
  byBuilding: (id: string) => [...shareKeys.all, 'by-building', id] as const,
};

export function useActiveShares(buildingId: string | undefined) {
  return useQuery({
    queryKey: buildingId ? shareKeys.byBuilding(buildingId) : [...shareKeys.all, 'none'],
    queryFn: () => (buildingId ? listActiveShares(buildingId) : Promise.resolve([])),
    enabled: !!buildingId,
  });
}

export function useCreateShare(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<CreatedShare, Error, { expiryDays: ShareExpiryDays }>({
    mutationFn: ({ expiryDays }) => {
      if (!buildingId) throw new Error('No building');
      return createBuildingShare({ building_id: buildingId, expiryDays });
    },
    onSuccess: () => {
      if (buildingId) qc.invalidateQueries({ queryKey: shareKeys.byBuilding(buildingId) });
    },
  });
}

export function useRevokeShare(buildingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (shareId) => revokeBuildingShare(shareId),
    onSuccess: () => {
      if (buildingId) qc.invalidateQueries({ queryKey: shareKeys.byBuilding(buildingId) });
    },
  });
}
