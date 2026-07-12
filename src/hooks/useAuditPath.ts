import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearFloorAuditPath,
  getFloorAuditPath,
  saveFloorAuditPath,
} from '@/lib/queries/audit-paths';
import type { FloorAuditPath } from '@/types/database';

export const auditPathKeys = {
  all: ['floor_audit_paths'] as const,
  byFloor: (floorId: string) => [...auditPathKeys.all, 'by-floor', floorId] as const,
};

/**
 * The saved walking order for a floor. One request per floor (on floor open) —
 * NOT per-asset, so it doesn't regress the floor-open cascade.
 */
export function useFloorAuditPath(floorId: string | undefined) {
  return useQuery<FloorAuditPath | null>({
    queryKey: floorId ? auditPathKeys.byFloor(floorId) : [...auditPathKeys.all, 'none'],
    queryFn: () => (floorId ? getFloorAuditPath(floorId) : Promise.resolve(null)),
    enabled: !!floorId,
    staleTime: 30_000,
  });
}

export function useSaveFloorAuditPath(floorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string[]) => saveFloorAuditPath({ floor_id: floorId, path }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: auditPathKeys.byFloor(floorId) });
    },
  });
}

export function useClearFloorAuditPath(floorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearFloorAuditPath(floorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: auditPathKeys.byFloor(floorId) });
    },
  });
}
