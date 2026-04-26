import { useQuery } from '@tanstack/react-query';
import { listAuditLogForEntity } from '@/lib/queries/audit-log';

export const activityKeys = {
  forEntity: (entityType: string, entityId: string) =>
    ['activity', entityType, entityId] as const,
};

export function useActivity(entityType: string | undefined, entityId: string | undefined) {
  return useQuery({
    queryKey:
      entityType && entityId
        ? activityKeys.forEntity(entityType, entityId)
        : ['activity', 'none'],
    queryFn: () =>
      entityType && entityId
        ? listAuditLogForEntity(entityType, entityId, 10)
        : Promise.resolve([]),
    enabled: !!(entityType && entityId),
    staleTime: 10_000,
  });
}
